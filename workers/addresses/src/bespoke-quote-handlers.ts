/**
 * HTTP routes for bespoke (manually priced) quote requests.
 *
 * Public (only when BESPOKE_QUOTES_ENABLED = "1"; 404 otherwise):
 *   POST /bespoke-quotes/request   submit an Event / Business Class request
 *   POST /bespoke-quotes/view      { token } → customer-safe quote view
 *   POST /bespoke-quotes/decline   { token } → customer declines the quote
 *
 * Owner (X-Owner-Key HEADER only — a `key` query parameter is refused):
 *   GET  /owner/bespoke-quotes                 list (KV index)
 *   GET  /owner/bespoke-quotes/detail?reference=
 *   POST /owner/bespoke-quotes/action          { reference, expectedVersion, idempotencyKey, action }
 *
 * Every path also works with an /api prefix.
 *
 * Phase 2 adds: once-only email notifications, quote email + link resend, and the
 * expiry sweep (runBespokeExpirySweep, called from the 5-minute cron, flag-gated).
 * Still NOT here (needs separate approval): checkout creation and payment
 * finalisation. The Durable Object already supports the system_* transitions those
 * will call through applyBespokeSystemAction.
 */

import { corsHeaders } from "../shared/google-places";
import { BUSINESS_MAILBOX, BUSINESS_WEBSITE } from "../shared/business-email";
import {
  createBespokeQuoteRecord,
  bespokeQuoteFingerprint,
  generateBespokeCustomerToken,
  generateBespokeQuoteReference,
  isBespokeQuoteExpired,
  isBespokeQuoteReference,
  parseBespokeCustomerToken,
  sha256Hex,
  timingSafeEqualHex,
  toBespokeQuoteOwnerView,
  toBespokeQuotePublicView,
  validateBespokeQuoteRequest,
  BESPOKE_QUOTE_CATEGORIES,
  BESPOKE_QUOTE_STATUSES,
  type BespokeQuoteAction,
  type BespokeQuoteRecord,
  type BespokeQuoteStatus,
} from "../shared/bespoke-quote";
import {
  bespokeQuotationUrl,
  buildBespokeOwnerNewRequestEmail,
  buildBespokeQuotationEmail,
  buildBespokeQuotationExpiredEmail,
  buildBespokeRequestAcknowledgementEmail,
  type BespokeEmail,
} from "../shared/bespoke-quote-emails";
import { parseTurnstileHostnames, verifyTurnstileToken } from "../shared/turnstile";
import type { BespokeNotificationEntry, CoordinatorApplyResponse } from "./bespoke-quote-coordinator";
import { listBespokeIndex, writeBespokeIndexEntry } from "./bespoke-quote-store";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  trySendOwnerOperationalEmail,
  trySendResendOnlyCustomerEmail,
  type EmailPayload,
  type EmailSendResult,
  type WorkerEmailEnv,
} from "./worker-email";

export type BespokeQuoteEnv = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    BESPOKE_QUOTE_COORDINATOR?: DurableObjectNamespace;
    /** "1" turns on the PUBLIC routes, customer emails and the expiry sweep. Default off. */
    BESPOKE_QUOTES_ENABLED?: string;
    TURNSTILE_SECRET_KEY?: string;
    /** Comma-separated hostnames Turnstile tokens may come from. Defaults to the live site. */
    TURNSTILE_ALLOWED_HOSTNAMES?: string;
    /** Site origin for customer links (defaults to the live site). */
    SITE_ORIGIN?: string;
  };

export type BespokeQuoteDeps = {
  fetchImpl?: typeof fetch;
  /** Injected in tests. Defaults to the existing Worker email functions. */
  sendCustomerEmail?: (env: WorkerEmailEnv, payload: EmailPayload) => Promise<EmailSendResult>;
  sendOwnerEmail?: (env: WorkerEmailEnv, payload: EmailPayload) => Promise<EmailSendResult>;
};

export const BESPOKE_TURNSTILE_ACTION = "bespoke_quote_request";
export const BESPOKE_RATE_LIMITS = {
  requestPerIpPerHour: 5,
  requestPerEmailPerDay: 3,
  viewPerIpPerHour: 30,
} as const;
const DEDUPE_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const REGISTRY_NAME = "registry:open-quotes";
const OPEN_STATUSES: readonly BespokeQuoteStatus[] = ["QUOTED", "PAYMENT_STARTED"];

const ROUTE = /^\/(?:api\/)?(owner\/)?bespoke-quotes(?:\/([a-z-]+))?\/?$/;

export function isBespokeQuotePath(pathname: string): boolean {
  return ROUTE.test(pathname);
}

export function bespokeFeatureEnabled(env: Pick<BespokeQuoteEnv, "BESPOKE_QUOTES_ENABLED">): boolean {
  return env.BESPOKE_QUOTES_ENABLED === "1";
}

function respond(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callCoordinator<T>(ns: DurableObjectNamespace, name: string, action: string, body: unknown): Promise<T> {
  const response = await ns.get(ns.idFromName(name)).fetch(`https://bespoke-quote/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

async function rateAllowed(ns: DurableObjectNamespace, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const name = `rate:${await sha256Hex(key)}`;
  const result = await callCoordinator<{ allowed?: boolean }>(ns, name, "rate", { limit, windowSeconds });
  return result.allowed === true;
}

export async function getBespokeQuoteState(
  ns: DurableObjectNamespace,
  reference: string,
): Promise<{ record: BespokeQuoteRecord | null; notifications: BespokeNotificationEntry[] }> {
  const result = await callCoordinator<{ record?: BespokeQuoteRecord | null; notifications?: BespokeNotificationEntry[] }>(
    ns,
    `quote:${reference}`,
    "get",
    {},
  );
  return { record: result.record ?? null, notifications: result.notifications ?? [] };
}

export async function getBespokeQuoteRecord(
  ns: DurableObjectNamespace,
  reference: string,
): Promise<BespokeQuoteRecord | null> {
  return (await getBespokeQuoteState(ns, reference)).record;
}

type ReadyEnv = BespokeQuoteEnv & { BESPOKE_QUOTE_COORDINATOR: DurableObjectNamespace };

// ---------------------------------------------------------------------------
// Notifications — each key is claimed once in the Durable Object before sending
// ---------------------------------------------------------------------------

export type NotificationOutcome = {
  key: string;
  status: BespokeNotificationEntry["status"] | "already_claimed";
  entry?: BespokeNotificationEntry;
};

function ownerInbox(env: BespokeQuoteEnv): string {
  return env.BOOKING_NOTIFICATION_EMAIL?.trim() || env.BOOKING_TO_EMAIL?.trim() || BUSINESS_MAILBOX;
}

function siteOrigin(env: BespokeQuoteEnv): string {
  const origin = env.SITE_ORIGIN?.trim();
  return origin && /^https:\/\//.test(origin) ? origin.replace(/\/+$/, "") : BUSINESS_WEBSITE;
}

/**
 * Send one notification at most once per key.
 * - The key is claimed atomically first. A retry, a double-click, a second cron
 *   run or a duplicate submission finds the claim and does NOT send again.
 * - Resend also receives the key as its Idempotency-Key (24h provider-side dedupe).
 * - A claim left "sending" (Worker died mid-send) is never auto-retried, because
 *   the email may have been delivered; the owner can deliberately resend.
 */
async function sendOnce(
  env: ReadyEnv,
  deps: BespokeQuoteDeps,
  reference: string,
  key: string,
  kind: string,
  audience: "customer" | "owner",
  build: () => (BespokeEmail & { to: string; toName?: string }) | null,
): Promise<NotificationOutcome> {
  const claim = await callCoordinator<{ claimed?: boolean; entry?: BespokeNotificationEntry }>(
    env.BESPOKE_QUOTE_COORDINATOR,
    `quote:${reference}`,
    "notify-begin",
    { key, kind },
  );
  if (!claim.claimed) return { key, status: "already_claimed", entry: claim.entry };

  const finish = async (status: "sent" | "failed" | "skipped", extra: { provider?: string; error?: string } = {}) => {
    const done = await callCoordinator<{ entry?: BespokeNotificationEntry }>(
      env.BESPOKE_QUOTE_COORDINATOR,
      `quote:${reference}`,
      "notify-finish",
      { key, status, ...extra },
    ).catch(() => ({ entry: undefined }));
    return { key, status, entry: done.entry } as NotificationOutcome;
  };

  if (audience === "customer" && !bespokeFeatureEnabled(env)) return finish("skipped", { error: "feature_off" });

  let email: ReturnType<typeof build>;
  try {
    email = build();
  } catch (error) {
    return finish("failed", { error: error instanceof Error ? error.message : "build_failed" });
  }
  if (!email) return finish("skipped", { error: "nothing_to_send" });

  const payload: EmailPayload = {
    to: email.to,
    ...(email.toName ? { toName: email.toName } : {}),
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
    idempotencyKey: `bq-${reference}-${key}`.replace(/[^A-Za-z0-9_-]/g, "-"),
    // No hidden owner copy: quote links stay with the customer only.
    ownerCopy: false,
  };
  let result: EmailSendResult;
  try {
    result =
      audience === "customer"
        ? await (deps.sendCustomerEmail ?? trySendResendOnlyCustomerEmail)(env, payload)
        : await (deps.sendOwnerEmail ?? trySendOwnerOperationalEmail)(env, payload);
  } catch (error) {
    // Unknown outcome: leave the claim as "sending" so it is never auto-retried.
    console.error("bespoke email threw", reference, key, error instanceof Error ? error.message : "unknown");
    return { key, status: "sending" };
  }
  return result.sent
    ? finish("sent", { provider: result.provider })
    : finish("failed", { provider: result.provider, error: result.error ?? "send_failed" });
}

function quoteEmailKey(record: BespokeQuoteRecord, suffix = ""): string {
  return `quote:v${record.quote?.version ?? 0}${suffix}`;
}

async function sendQuotationEmail(
  env: ReadyEnv,
  deps: BespokeQuoteDeps,
  record: BespokeQuoteRecord,
  token: string,
  keySuffix = "",
): Promise<NotificationOutcome> {
  return sendOnce(env, deps, record.reference, quoteEmailKey(record, keySuffix), "quotation", "customer", () => ({
    ...buildBespokeQuotationEmail(record, bespokeQuotationUrl(token, siteOrigin(env))),
    to: record.customer.email,
    toName: record.customer.name,
  }));
}

// ---------------------------------------------------------------------------
// Applying transitions (Durable Object = authoritative state)
// ---------------------------------------------------------------------------

async function updateRegistry(env: ReadyEnv, record: BespokeQuoteRecord): Promise<void> {
  const open = OPEN_STATUSES.includes(record.status) && record.quote;
  await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-set", {
    reference: record.reference,
    expiresAt: open ? record.quote!.expiresAt : null,
  });
}

async function applyAction(
  env: ReadyEnv,
  deps: BespokeQuoteDeps,
  reference: string,
  action: BespokeQuoteAction,
  options: { expectedVersion?: number; idempotencyKey?: string } = {},
): Promise<CoordinatorApplyResponse> {
  const result = await callCoordinator<CoordinatorApplyResponse>(
    env.BESPOKE_QUOTE_COORDINATOR,
    `quote:${reference}`,
    "apply",
    { action, ...options },
  );
  if (!result.ok || !result.changed) return result;

  // Read models — best effort; the Durable Object stays authoritative.
  if (env.TRACKING_STORE) {
    await writeBespokeIndexEntry(env.TRACKING_STORE, result.record).catch((error) =>
      console.error("bespoke index update failed", reference, error instanceof Error ? error.message : "unknown"),
    );
  }
  await updateRegistry(env, result.record).catch((error) =>
    console.error("bespoke registry update failed", reference, error instanceof Error ? error.message : "unknown"),
  );

  // Transition hooks.
  const last = result.record.history[result.record.history.length - 1];
  if (last && last.fromStatus === "QUOTED" && last.toStatus === "EXPIRED") {
    await sendOnce(env, deps, reference, quoteEmailKey(result.record, ":expired"), "quotation_expired", "customer", () => ({
      ...buildBespokeQuotationExpiredEmail(result.record),
      to: result.record.customer.email,
      toName: result.record.customer.name,
    })).catch((error) =>
      console.error("bespoke expiry email failed", reference, error instanceof Error ? error.message : "unknown"),
    );
  }
  return result;
}

/**
 * Internal entry point for later phases (checkout, payment finalisation).
 * Only system_* actions are accepted here.
 */
export async function applyBespokeSystemAction(
  env: BespokeQuoteEnv,
  reference: string,
  action: Extract<BespokeQuoteAction, { type: `system_${string}` }>,
  deps: BespokeQuoteDeps = {},
): Promise<CoordinatorApplyResponse> {
  if (!env.BESPOKE_QUOTE_COORDINATOR) {
    return { ok: false, code: "not_configured", error: "Bespoke quotes are not configured.", status: 503 };
  }
  if (!action.type.startsWith("system_")) {
    return { ok: false, code: "invalid_action", error: "Only system actions are allowed.", status: 400 };
  }
  return applyAction({ ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR }, deps, reference, action);
}

// ---------------------------------------------------------------------------
// Expiry sweep (5-minute cron)
// ---------------------------------------------------------------------------

export type BespokeExpirySweepResult = {
  ran: boolean;
  checked: number;
  expired: number;
  awaitingPaymentCheck: number;
  errors: number;
};

/**
 * Expires due quotations. The Durable Object decides: a quotation whose customer
 * is at checkout (PAYMENT_STARTED) is NEVER expired here — the DO answers
 * "needs_provider_check" and the reference is flagged so it is not retried every
 * 5 minutes. Phase 3 checks the payment provider for those.
 */
export async function runBespokeExpirySweep(
  env: BespokeQuoteEnv,
  deps: BespokeQuoteDeps = {},
  options: { limit?: number } = {},
): Promise<BespokeExpirySweepResult> {
  const result: BespokeExpirySweepResult = { ran: false, checked: 0, expired: 0, awaitingPaymentCheck: 0, errors: 0 };
  if (!bespokeFeatureEnabled(env) || !env.BESPOKE_QUOTE_COORDINATOR) return result;
  const ready: ReadyEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
  result.ran = true;
  const due = await callCoordinator<{ due?: string[] }>(ready.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-due", {
    limit: options.limit ?? 50,
  });
  const toFlag: string[] = [];
  for (const reference of due.due ?? []) {
    if (!isBespokeQuoteReference(reference)) continue;
    result.checked += 1;
    try {
      const applied = await applyAction(ready, deps, reference, { type: "system_expire" });
      if (!applied.ok) {
        if (applied.code === "not_found") {
          await callCoordinator(ready.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-set", { reference, expiresAt: null });
        } else result.errors += 1;
        continue;
      }
      if (applied.changed && applied.record.status === "EXPIRED") result.expired += 1;
      else if (applied.outcome === "needs_provider_check") {
        result.awaitingPaymentCheck += 1;
        toFlag.push(reference);
      } else if (!OPEN_STATUSES.includes(applied.record.status)) {
        // Registry was stale (status moved on without an update): clear it.
        await updateRegistry(ready, applied.record);
      } else if (applied.outcome === "not_due") {
        // Expiry moved (re-quoted): refresh the registry entry.
        await updateRegistry(ready, applied.record);
      }
    } catch (error) {
      result.errors += 1;
      console.error("bespoke expiry sweep error", reference, error instanceof Error ? error.message : "unknown");
    }
  }
  if (toFlag.length > 0) {
    await callCoordinator(ready.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-due", { limit: 1, flag: toFlag });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleBespokeQuoteRoute(
  request: Request,
  env: BespokeQuoteEnv,
  origin: string | null,
  deps: BespokeQuoteDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname);
  if (!match) return respond({ error: "Not found" }, 404, origin);
  const isOwner = Boolean(match[1]);
  const sub = match[2] ?? "";

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  if (isOwner) {
    // Header-only owner authentication. The shared helper also accepts ?key=,
    // which can leak into logs and history — refuse it outright on these routes.
    if (url.searchParams.has("key")) {
      return respond({ error: "Send the owner key in the X-Owner-Key header, not the URL." }, 400, origin);
    }
    if (!ownerAuthorized(request, env)) return respond({ error: "Unauthorized — owner access required." }, 401, origin);
    if (!env.BESPOKE_QUOTE_COORDINATOR) return respond({ error: "Bespoke quotes are not configured." }, 503, origin);
    const ownerEnv: ReadyEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
    if (sub === "" && request.method === "GET") return ownerList(url, ownerEnv, origin);
    if (sub === "detail" && request.method === "GET") return ownerDetail(url, ownerEnv, origin, deps);
    if (sub === "action" && request.method === "POST") return ownerAction(request, ownerEnv, origin, deps);
    return respond({ error: "Not found" }, 404, origin);
  }

  // Public routes stay dark until the owner switches the feature on.
  if (!bespokeFeatureEnabled(env)) return respond({ error: "Not found" }, 404, origin);
  if (!env.BESPOKE_QUOTE_COORDINATOR) return respond({ error: "This service is temporarily unavailable." }, 503, origin);
  const publicEnv: ReadyEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405, origin);
  if (sub === "request") return publicRequest(request, publicEnv, origin, deps);
  if (sub === "view") return publicView(request, publicEnv, origin, deps);
  if (sub === "decline") return publicDecline(request, publicEnv, origin, deps);
  return respond({ error: "Not found" }, 404, origin);
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

async function publicRequest(
  request: Request,
  env: ReadyEnv,
  origin: string | null,
  deps: BespokeQuoteDeps,
): Promise<Response> {
  const ns = env.BESPOKE_QUOTE_COORDINATOR;
  if (!env.TURNSTILE_SECRET_KEY?.trim()) {
    // Fail closed: never accept public requests without bot protection.
    return respond({ error: "This service is temporarily unavailable. Please call or WhatsApp us." }, 503, origin);
  }
  const body = await readJsonBody(request);
  if (!body) return respond({ error: "Invalid request." }, 400, origin);

  // Honeypot: a hidden field real visitors never fill. Answer like a success so bots learn nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return respond({ ok: true, status: "received" }, 200, origin);
  }

  const ip = clientIp(request);
  if (!(await rateAllowed(ns, `bq-request-ip:${ip}`, BESPOKE_RATE_LIMITS.requestPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later or contact us directly." }, 429, origin);
  }

  const turnstile = await verifyTurnstileToken({
    secret: env.TURNSTILE_SECRET_KEY,
    token: body.turnstileToken,
    remoteIp: ip === "unknown" ? null : ip,
    expectedAction: BESPOKE_TURNSTILE_ACTION,
    allowedHostnames: parseTurnstileHostnames(env.TURNSTILE_ALLOWED_HOSTNAMES),
    fetchImpl: deps.fetchImpl,
  });
  if (!turnstile.ok) {
    return respond({ error: "We could not verify this request. Please refresh the page and try again." }, 403, origin);
  }

  const validated = validateBespokeQuoteRequest(body);
  if (!validated.ok) return respond({ error: "Please check the highlighted fields.", errors: validated.errors }, 400, origin);

  if (
    !(await rateAllowed(
      ns,
      `bq-request-email:${validated.value.customer.email}`,
      BESPOKE_RATE_LIMITS.requestPerEmailPerDay,
      86400,
    ))
  ) {
    return respond({ error: "Too many requests for this email address today. Please contact us directly." }, 429, origin);
  }

  // Duplicate prevention: the first submission claims the fingerprint for 24h and
  // fixes the reference. Retries and double-clicks get the same reference, and the
  // create below is idempotent, so a half-finished earlier attempt is completed.
  const fingerprint = await bespokeQuoteFingerprint(validated.value);
  const claim = await callCoordinator<{ claimed?: boolean; value?: string }>(ns, `dedupe:${fingerprint}`, "claim", {
    value: generateBespokeQuoteReference(),
    ttlSeconds: DEDUPE_WINDOW_SECONDS,
  });
  const reference = claim.value;
  if (!isBespokeQuoteReference(reference)) {
    return respond({ error: "This service is temporarily unavailable." }, 503, origin);
  }

  const record = createBespokeQuoteRecord({ reference, request: validated.value, fingerprint });
  const created = await callCoordinator<{ created?: boolean; record?: BespokeQuoteRecord }>(
    ns,
    `quote:${reference}`,
    "create",
    { record },
  );
  const stored = created.record;
  if (!stored) return respond({ error: "This service is temporarily unavailable." }, 503, origin);
  if (created.created && env.TRACKING_STORE) {
    await writeBespokeIndexEntry(env.TRACKING_STORE, stored).catch((error) =>
      console.error("bespoke index write failed", reference, error instanceof Error ? error.message : "unknown"),
    );
  }

  // Notifications are keyed per request, so a duplicate or retried submission
  // never sends a second acknowledgement or owner alert. Email failure never
  // loses the request: it is stored first and the owner sees the failure.
  await sendOnce(env, deps, reference, "ack", "request_acknowledgement", "customer", () => ({
    ...buildBespokeRequestAcknowledgementEmail(stored),
    to: stored.customer.email,
    toName: stored.customer.name,
  })).catch(() => undefined);
  await sendOnce(env, deps, reference, "owner_new", "owner_new_request", "owner", () => ({
    ...buildBespokeOwnerNewRequestEmail(stored, `${siteOrigin(env)}/owner/`),
    to: ownerInbox(env),
  })).catch(() => undefined);

  // Only the reference goes back. Never echo stored customer details.
  return respond(
    { ok: true, reference, status: "received", duplicate: claim.claimed !== true || created.created !== true },
    created.created ? 201 : 200,
    origin,
  );
}

const LINK_INVALID = "This quotation link is invalid or no longer available.";

async function resolveToken(env: ReadyEnv, token: unknown): Promise<BespokeQuoteRecord | null> {
  const parsed = parseBespokeCustomerToken(token);
  if (!parsed) return null;
  const record = await getBespokeQuoteRecord(env.BESPOKE_QUOTE_COORDINATOR, parsed.reference);
  if (!record?.quote) return null;
  const tokenHash = await sha256Hex(parsed.secret);
  return timingSafeEqualHex(record.quote.tokenHash, tokenHash) ? record : null;
}

async function publicView(request: Request, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-view-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  let record = await resolveToken(env, body?.token);
  if (!record) return respond({ error: LINK_INVALID }, 404, origin);
  const now = new Date();
  if (record.status === "QUOTED" && isBespokeQuoteExpired(record, now)) {
    const expired = await applyAction(env, deps, record.reference, { type: "system_expire" });
    if (expired.ok) record = expired.record;
  }
  // Online payment is Phase 3; until then the page shows how to accept by phone.
  return respond({ ok: true, quote: toBespokeQuotePublicView(record, now), paymentAvailable: false }, 200, origin);
}

async function publicDecline(request: Request, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-view-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  const parsed = parseBespokeCustomerToken(body?.token);
  if (!parsed) return respond({ error: LINK_INVALID }, 404, origin);
  const result = await applyAction(env, deps, parsed.reference, {
    type: "customer_decline",
    tokenHash: await sha256Hex(parsed.secret),
  });
  if (!result.ok) {
    return respond({ error: result.status === 404 ? LINK_INVALID : result.error }, result.status === 404 ? 404 : 409, origin);
  }
  return respond({ ok: true, quote: toBespokeQuotePublicView(result.record, new Date()), paymentAvailable: false }, 200, origin);
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

async function ownerList(url: URL, env: ReadyEnv, origin: string | null): Promise<Response> {
  if (!env.TRACKING_STORE) return respond({ error: "Storage is not configured" }, 503, origin);
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  if (category && !(BESPOKE_QUOTE_CATEGORIES as readonly string[]).includes(category)) {
    return respond({ error: "Unknown category" }, 400, origin);
  }
  if (status && !(BESPOKE_QUOTE_STATUSES as readonly string[]).includes(status)) {
    return respond({ error: "Unknown status" }, 400, origin);
  }
  const page = await listBespokeIndex(env.TRACKING_STORE, {
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? "50") || 50,
  });
  const items = page.items.filter(
    (item) => (!category || item.category === category) && (!status || item.status === status),
  );
  return respond(
    { ok: true, items, ...(page.cursor ? { cursor: page.cursor } : {}), publicEnabled: bespokeFeatureEnabled(env) },
    200,
    origin,
  );
}

async function ownerDetail(url: URL, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  const reference = url.searchParams.get("reference") ?? "";
  if (!isBespokeQuoteReference(reference)) return respond({ error: "Invalid reference" }, 400, origin);
  let { record, notifications } = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
  if (!record) return respond({ error: "Request not found" }, 404, origin);
  if (record.status === "QUOTED" && isBespokeQuoteExpired(record, new Date())) {
    const expired = await applyAction(env, deps, reference, { type: "system_expire" });
    if (expired.ok) {
      ({ record, notifications } = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference));
    }
  }
  return respond({ ok: true, request: toBespokeQuoteOwnerView(record!), notifications }, 200, origin);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Rebuild the action from known fields only — never pass a browser object through. */
function buildOwnerAction(raw: Record<string, unknown>): BespokeQuoteAction | { type: "resend_quote_email" } | null {
  switch (raw.type) {
    case "owner_start_review":
      return { type: "owner_start_review" };
    case "owner_update_availability":
      return {
        type: "owner_update_availability",
        availability: str(raw.availability) as never,
        availabilityNote: str(raw.availabilityNote),
        driverName: str(raw.driverName),
        vehicleNote: str(raw.vehicleNote),
      };
    case "owner_set_costs":
      return {
        type: "owner_set_costs",
        estimatedDriverCostGbp: raw.estimatedDriverCostGbp === null ? null : num(raw.estimatedDriverCostGbp),
        estimatedOtherCostsGbp: raw.estimatedOtherCostsGbp === null ? null : num(raw.estimatedOtherCostsGbp),
        internalNotes: str(raw.internalNotes),
      };
    case "owner_issue_quote":
      return {
        type: "owner_issue_quote",
        amountGbp: num(raw.amountGbp) ?? Number.NaN,
        validityHours: num(raw.validityHours) ?? Number.NaN,
        customerMessage: str(raw.customerMessage),
        tokenHash: "", // replaced server-side below
      };
    case "resend_quote_email":
      return { type: "resend_quote_email" };
    case "owner_decline":
      return { type: "owner_decline", note: str(raw.note) };
    case "owner_cancel":
      return { type: "owner_cancel", note: str(raw.note) };
    case "owner_resolve_review":
      return {
        type: "owner_resolve_review",
        resolution: str(raw.resolution) as never,
        note: str(raw.note) ?? "",
      };
    case "owner_record_manual_refund":
      return {
        type: "owner_record_manual_refund",
        paymentReference: str(raw.paymentReference) ?? "",
        note: str(raw.note) ?? "",
      };
    default:
      return null;
  }
}

async function ownerAction(request: Request, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return respond({ error: "Invalid request." }, 400, origin);
  const reference = str(body.reference) ?? "";
  if (!isBespokeQuoteReference(reference)) return respond({ error: "Invalid reference" }, 400, origin);
  const expectedVersion = num(body.expectedVersion);
  if (expectedVersion === undefined || !Number.isInteger(expectedVersion)) {
    return respond({ error: "expectedVersion is required." }, 400, origin);
  }
  const idempotencyKey = str(body.idempotencyKey);
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return respond({ error: "idempotencyKey is required." }, 400, origin);
  }
  const raw = body.action;
  const built = raw && typeof raw === "object" ? buildOwnerAction(raw as Record<string, unknown>) : null;
  if (!built) return respond({ error: "Unknown action." }, 400, origin);

  // A new link is minted for a new quote, or to resend (the old secret is never stored).
  let action: BespokeQuoteAction;
  let token: string | undefined;
  if (built.type === "owner_issue_quote" || built.type === "resend_quote_email") {
    const minted = await generateBespokeCustomerToken(reference);
    token = minted.token;
    action =
      built.type === "owner_issue_quote"
        ? { ...built, tokenHash: minted.tokenHash }
        : { type: "owner_rotate_link", tokenHash: minted.tokenHash };
  } else {
    action = built;
  }

  const result = await applyAction(env, deps, reference, action, { expectedVersion, idempotencyKey });
  if (!result.ok) {
    return respond(
      { error: result.error, code: result.code, ...(result.currentVersion ? { currentVersion: result.currentVersion } : {}) },
      result.status,
      origin,
    );
  }

  // Email only when THIS call actually changed the quote. A replayed idempotency
  // key (double-click, network retry) sends nothing and mints nothing.
  let email: NotificationOutcome | undefined;
  const fresh = result.changed && !result.replayed && token;
  if (fresh && built.type === "owner_issue_quote") {
    email = await sendQuotationEmail(env, deps, result.record, token!);
  } else if (fresh && built.type === "resend_quote_email") {
    email = await sendQuotationEmail(env, deps, result.record, token!, `:resend-${idempotencyKey}`);
  }

  const state = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
  return respond(
    {
      ok: true,
      changed: result.changed,
      ...(result.replayed ? { replayed: true } : {}),
      request: toBespokeQuoteOwnerView(state.record ?? result.record),
      notifications: state.notifications,
      ...(email ? { email } : {}),
      // Shown once to the owner (e.g. to share by phone if email failed). Not stored.
      ...(fresh ? { customerLink: bespokeQuotationUrl(token!, siteOrigin(env)) } : {}),
    },
    200,
    origin,
  );
}

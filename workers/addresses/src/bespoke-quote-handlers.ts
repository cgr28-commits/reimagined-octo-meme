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
import type { BespokeDeliveryEvent, BespokeNotificationEntry, CoordinatorApplyResponse } from "./bespoke-quote-coordinator";
import { verifyResendWebhookSignature } from "./owner-inbox-store";
import { listBespokeIndex, writeBespokeIndexEntry } from "./bespoke-quote-store";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import type { LogPaidBookingCalendarFn } from "./finalize-paid-checkout";
import {
  bespokeOnlinePaymentAvailable,
  bespokeCalendarStatus,
  completeBespokeBooking,
  expireBespokeCheckoutAfterCancel,
  retryBespokeCalendar,
  finalizeBespokeCheckoutViaSharedPath,
  reconcileBespokeAttempt,
  startBespokeCheckout,
  type BespokePaymentEnv,
} from "./bespoke-payment";
import { getPendingCheckout } from "./pending-checkout-store";
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
    /**
     * Signing secret of a SEPARATE Resend webhook used only for delivery events
     * (email.delivered / bounced / complained / delivery_delayed / failed).
     * Unset = the delivery webhook route is disabled (404).
     */
    RESEND_DELIVERY_WEBHOOK_SECRET?: string;
    /**
     * Preview safety: comma-separated recipient allowlist. When set, bespoke emails
     * to any other address are NOT sent (logged as skipped). Never set in production.
     */
    BESPOKE_EMAIL_ALLOWLIST?: string;
  };

export type BespokeQuoteDeps = {
  fetchImpl?: typeof fetch;
  /** Injected in tests. Defaults to the existing Worker email functions. */
  sendCustomerEmail?: (env: WorkerEmailEnv, payload: EmailPayload) => Promise<EmailSendResult>;
  sendOwnerEmail?: (env: WorkerEmailEnv, payload: EmailPayload) => Promise<EmailSendResult>;
  /** Existing Google Calendar logger (passed in from index.ts) for paid bespoke bookings. */
  logPaidBookingCalendar?: LogPaidBookingCalendarFn;
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
export type BespokeReadyEnv = ReadyEnv;

// ---------------------------------------------------------------------------
// Notifications — each key is claimed once in the Durable Object before sending
// ---------------------------------------------------------------------------

export type NotificationOutcome = {
  key: string;
  /** "accepted" means the provider accepted the message — NOT proof of delivery. */
  status: BespokeNotificationEntry["status"] | "already_claimed";
  entry?: BespokeNotificationEntry;
};

export function ownerInbox(env: BespokeQuoteEnv): string {
  return env.BOOKING_NOTIFICATION_EMAIL?.trim() || env.BOOKING_TO_EMAIL?.trim() || BUSINESS_MAILBOX;
}

export function siteOrigin(env: BespokeQuoteEnv): string {
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
export async function sendOnce(
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

  const finish = async (
    status: "accepted" | "failed" | "skipped",
    extra: { provider?: string; error?: string; providerMessageId?: string } = {},
  ) => {
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
  const allowlist = (env.BESPOKE_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(email.to.trim().toLowerCase())) {
    return finish("skipped", { error: "recipient_not_in_preview_allowlist" });
  }

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
  if (!result.sent) return finish("failed", { provider: result.provider, error: result.error ?? "send_failed" });
  if (result.resendId && env.TRACKING_STORE) {
    // Lets signed delivery events find this notification. Best effort.
    await env.TRACKING_STORE.put(
      resendMessageKey(result.resendId),
      JSON.stringify({ reference, key }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    ).catch(() => undefined);
  }
  return finish("accepted", { provider: result.provider, ...(result.resendId ? { providerMessageId: result.resendId } : {}) });
}

function resendMessageKey(messageId: string): string {
  return `bq:resend:${messageId}`;
}

// ---------------------------------------------------------------------------
// Delivery events (separate, signed Resend webhook — disabled unless configured)
// ---------------------------------------------------------------------------

const DELIVERY_WEBHOOK_ROUTE = /^\/(?:api\/)?webhooks\/resend-bespoke-delivery\/?$/;

export function isBespokeDeliveryWebhookPath(pathname: string): boolean {
  return DELIVERY_WEBHOOK_ROUTE.test(pathname);
}

const RESEND_EVENT_MAP: Record<string, BespokeDeliveryEvent> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

/**
 * Records delivery outcomes for bespoke emails only. Events for any other email
 * (airport bookings etc.) are acknowledged and ignored — nothing else changes.
 */
export async function handleBespokeDeliveryWebhook(request: Request, env: BespokeQuoteEnv): Promise<Response> {
  const secret = env.RESEND_DELIVERY_WEBHOOK_SECRET?.trim();
  if (!secret || !env.BESPOKE_QUOTE_COORDINATOR || !env.TRACKING_STORE) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await request.text();
  if (body.length > 64 * 1024) return new Response("Too large", { status: 413 });
  const valid = await verifyResendWebhookSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    body,
  });
  if (!valid) return new Response("invalid signature", { status: 401 });
  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const mapped = event.type ? RESEND_EVENT_MAP[event.type] : undefined;
  const messageId = String(event.data?.email_id ?? "").trim();
  if (!mapped || !/^[A-Za-z0-9_-]{1,100}$/.test(messageId)) return new Response("ignored", { status: 200 });
  const target = await env.TRACKING_STORE.get<{ reference?: string; key?: string }>(resendMessageKey(messageId), "json");
  if (!target?.reference || !target.key || !isBespokeQuoteReference(target.reference)) {
    return new Response("ignored", { status: 200 });
  }
  await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, `quote:${target.reference}`, "notify-delivery", {
    key: target.key,
    event: mapped,
    providerMessageId: messageId,
    at: event.created_at,
  });
  return new Response("ok", { status: 200 });
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
  // PAID = money recorded but booking not yet created: keep it due so every sweep
  // retries the booking until it exists (then CONFIRMED clears it).
  // PAYMENT_STARTED tracks the 30-minute ATTEMPT expiry (not the quote's, which can
  // be days away), so a payment that was never recorded (tab closed, webhook lost)
  // is found by checking Stripe within ~30 minutes.
  const expiresAt =
    record.status === "PAID"
      ? record.updatedAt
      : record.status === "PAYMENT_STARTED" && record.paymentAttempt
        ? record.paymentAttempt.expiresAt
        : open
          ? record.quote!.expiresAt
          : null;
  await callCoordinator(env.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-set", {
    reference: record.reference,
    expiresAt,
  });
}

export async function applyAction(
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
  // Expired either directly or after an abandoned checkout was released.
  if (last && (last.fromStatus === "QUOTED" || last.fromStatus === "PAYMENT_STARTED") && last.toStatus === "EXPIRED") {
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
  /** Abandoned checkouts checked with Stripe this run. */
  paymentChecks: number;
  paymentsFound: number;
  attemptsReleased: number;
  /** Paid requests whose booking creation is retried this run. */
  bookingRetries: number;
  bookingsCompleted: number;
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
  const result: BespokeExpirySweepResult = {
    ran: false,
    checked: 0,
    expired: 0,
    awaitingPaymentCheck: 0,
    paymentChecks: 0,
    paymentsFound: 0,
    attemptsReleased: 0,
    bookingRetries: 0,
    bookingsCompleted: 0,
    errors: 0,
  };
  if (!bespokeFeatureEnabled(env) || !env.BESPOKE_QUOTE_COORDINATOR) return result;
  const ready: ReadyEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
  result.ran = true;
  const due = await callCoordinator<{ due?: string[]; recheck?: string[] }>(ready.BESPOKE_QUOTE_COORDINATOR, REGISTRY_NAME, "registry-due", {
    limit: options.limit ?? 50,
  });
  const toFlag: string[] = [];
  // The customer was at checkout: ask Stripe (paid → recorded; unpaid → session
  // expired, attempt released). Inconclusive → flagged and re-checked in 30 min.
  const checkPayment = async (reference: string) => {
    result.paymentChecks += 1;
    const outcome = await reconcileBespokeAttempt(env as BespokePaymentEnv, deps, reference).catch(() => "wait" as const);
    if (outcome === "paid") result.paymentsFound += 1;
    else if (outcome === "released") result.attemptsReleased += 1;
    else if (outcome === "wait") toFlag.push(reference);
  };
  for (const reference of due.recheck ?? []) {
    if (isBespokeQuoteReference(reference)) await checkPayment(reference);
  }
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
      if (applied.record.status === "PAID") {
        result.bookingRetries += 1;
        const booked = await completeBespokeBooking(env as BespokePaymentEnv, deps, reference);
        if (booked.ok) result.bookingsCompleted += 1;
        continue;
      }
      if (applied.changed && applied.record.status === "EXPIRED") result.expired += 1;
      else if (applied.outcome === "needs_provider_check") {
        result.awaitingPaymentCheck += 1;
        await checkPayment(reference);
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
  if (sub === "checkout") return publicCheckout(request, publicEnv, origin, deps);
  if (sub === "payment-status") return publicPaymentStatus(request, publicEnv, origin, deps);
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

/** Valid customer token → record and the token's hash (constant-time checked). */
export async function resolveTokenWithHash(
  env: ReadyEnv,
  token: unknown,
): Promise<{ record: BespokeQuoteRecord; tokenHash: string } | null> {
  const parsed = parseBespokeCustomerToken(token);
  if (!parsed) return null;
  const record = await getBespokeQuoteRecord(env.BESPOKE_QUOTE_COORDINATOR, parsed.reference);
  if (!record?.quote) return null;
  const tokenHash = await sha256Hex(parsed.secret);
  return timingSafeEqualHex(record.quote.tokenHash, tokenHash) ? { record, tokenHash } : null;
}

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
  return respond({ ok: true, quote: toBespokeQuotePublicView(record, now), paymentAvailable: paymentAvailableFor(env, record) }, 200, origin);
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

/** "Accept and pay" is offered for an open quotation when Stripe can take the payment. */
function paymentAvailableFor(env: ReadyEnv, record: BespokeQuoteRecord): boolean {
  const open =
    (record.status === "QUOTED" && !isBespokeQuoteExpired(record, new Date()) && record.owner.availability !== "unavailable") ||
    record.status === "PAYMENT_STARTED";
  return open && bespokeOnlinePaymentAvailable(env as BespokePaymentEnv, record.customer.email);
}

async function publicCheckout(request: Request, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-checkout-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  const started = await startBespokeCheckout(env as BespokePaymentEnv, deps, body?.token);
  if (!started.ok) return respond({ error: started.error, code: started.code }, started.status, origin);
  // Only the payment page URL goes back. The amount is never taken from the browser.
  return respond({ ok: true, paymentUrl: started.paymentUrl, checkoutId: started.checkoutId }, 200, origin);
}

/**
 * Customer returns from payment. Triggers the shared finaliser for that checkout
 * (idempotent, per-checkout claim) and reports the quotation's status. Without a
 * valid token only a minimal "received" status is returned — no details.
 */
async function publicPaymentStatus(request: Request, env: ReadyEnv, origin: string | null, deps: BespokeQuoteDeps): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-view-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  const checkoutId = typeof body?.checkoutId === "string" && /^cs_[A-Za-z0-9_]{4,200}$/.test(body.checkoutId) ? body.checkoutId : "";
  let isBespokeCheckout = false;
  if (checkoutId && env.TRACKING_STORE) {
    const pending = await getPendingCheckout(env.TRACKING_STORE, checkoutId).catch(() => null);
    if (pending?.checkoutKind === "bespoke") {
      isBespokeCheckout = true;
      await finalizeBespokeCheckoutViaSharedPath(env as BespokePaymentEnv, deps, checkoutId).catch((error) =>
        console.error("bespoke payment-status finalize failed", error instanceof Error ? error.message : "unknown"),
      );
    }
  }
  const record = await resolveToken(env, body?.token);
  if (record) {
    const fresh = (await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, record.reference)).record ?? record;
    return respond({ ok: true, quote: toBespokeQuotePublicView(fresh, new Date()), paymentAvailable: false }, 200, origin);
  }
  if (isBespokeCheckout) return respond({ ok: true, status: "received" }, 200, origin);
  return respond({ error: LINK_INVALID }, 404, origin);
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
  const calendar = await bespokeCalendarStatus(env as BespokePaymentEnv, record!).catch(() => null);
  return respond({ ok: true, request: toBespokeQuoteOwnerView(record!), notifications, ...(calendar ? { calendar } : {}) }, 200, origin);
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
type OwnerOnlyAction =
  | { type: "resend_quote_email" }
  | { type: "resend_notification"; kind: "acknowledgement" | "expiry" }
  | { type: "retry_calendar" };

function buildOwnerAction(raw: Record<string, unknown>): BespokeQuoteAction | OwnerOnlyAction | null {
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
    case "retry_calendar":
      return { type: "retry_calendar" };
    case "resend_notification": {
      const kind = raw.kind === "acknowledgement" || raw.kind === "expiry" ? raw.kind : null;
      return kind ? { type: "resend_notification", kind } : null;
    }
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

  if (built.type === "retry_calendar") {
    // Safe to repeat: the calendar event id is derived from the payment reference.
    const state = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
    if (!state.record) return respond({ error: "Request not found" }, 404, origin);
    const retried = await retryBespokeCalendar(env as BespokePaymentEnv, state.record);
    const calendar = await bespokeCalendarStatus(env as BespokePaymentEnv, state.record).catch(() => null);
    return respond(
      { ok: retried.ok, changed: false, calendarResult: retried.status, request: toBespokeQuoteOwnerView(state.record), notifications: state.notifications, ...(calendar ? { calendar } : {}) },
      retried.ok ? 200 : 409,
      origin,
    );
  }

  if (built.type === "resend_notification") {
    return ownerResendNotification(env, deps, origin, reference, built.kind, idempotencyKey);
  }

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

  if (result.changed && !result.replayed) {
    // Cancelled while the customer was at checkout: close the Stripe session so it
    // can no longer be paid (a payment that still lands goes to owner review).
    if (built.type === "owner_cancel" && result.record.paymentAttempt?.checkoutId) {
      await expireBespokeCheckoutAfterCancel(env as BespokePaymentEnv, result.record);
    }
    // Owner accepted a reviewed payment: create the booking (Jobs + Calendar), then confirm.
    if (built.type === "owner_resolve_review" && result.record.status === "PAID") {
      const booked = await completeBespokeBooking(env as BespokePaymentEnv, deps, reference);
      if (!booked.ok) console.error("bespoke booking after review failed", reference, booked.error);
    }
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

/**
 * Manual resend of the acknowledgement or expiry email. No state change: the
 * click's idempotency key is part of the notification key, so a double-click or
 * network retry sends at most one extra email. Quotation resends use
 * "resend_quote_email" (which also replaces the link).
 */
async function ownerResendNotification(
  env: ReadyEnv,
  deps: BespokeQuoteDeps,
  origin: string | null,
  reference: string,
  kind: "acknowledgement" | "expiry",
  idempotencyKey: string,
): Promise<Response> {
  const state = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
  const record = state.record;
  if (!record) return respond({ error: "Request not found" }, 404, origin);
  if (kind === "expiry" && record.status !== "EXPIRED") {
    return respond({ error: "The expiry email can only be resent for an expired quotation.", code: "invalid_status" }, 409, origin);
  }
  const key = kind === "acknowledgement" ? `ack:resend-${idempotencyKey}` : `${quoteEmailKey(record, ":expired")}:resend-${idempotencyKey}`;
  const email = await sendOnce(env, deps, reference, key, kind === "acknowledgement" ? "request_acknowledgement" : "quotation_expired", "customer", () => ({
    ...(kind === "acknowledgement" ? buildBespokeRequestAcknowledgementEmail(record) : buildBespokeQuotationExpiredEmail(record)),
    to: record.customer.email,
    toName: record.customer.name,
  }));
  const after = await getBespokeQuoteState(env.BESPOKE_QUOTE_COORDINATOR, reference);
  return respond(
    {
      ok: true,
      changed: false,
      ...(email.status === "already_claimed" ? { replayed: true } : {}),
      request: toBespokeQuoteOwnerView(after.record ?? record),
      notifications: after.notifications,
      email,
    },
    200,
    origin,
  );
}

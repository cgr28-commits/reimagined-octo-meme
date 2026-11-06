/**
 * HTTP routes for bespoke (manually priced) quote requests.
 *
 * Public (only when BESPOKE_QUOTES_ENABLED = "1"; 404 otherwise):
 *   POST /bespoke-quotes/request   submit an Event / Business Class request
 *   POST /bespoke-quotes/view      { token } → customer-safe quote view
 *   POST /bespoke-quotes/decline   { token } → customer declines the quote
 *
 * Owner (X-Owner-Key; independent of the public flag):
 *   GET  /owner/bespoke-quotes                 list (KV index)
 *   GET  /owner/bespoke-quotes/detail?reference=
 *   POST /owner/bespoke-quotes/action          { reference, expectedVersion, idempotencyKey, action }
 *
 * Every path also works with an /api prefix.
 *
 * Not in Phase 1 (need separate approval): checkout creation, payment
 * finalisation, emails, cron expiry. The Durable Object already supports the
 * system_* transitions those phases will call through applyBespokeSystemAction.
 */

import { corsHeaders } from "../shared/google-places";
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
} from "../shared/bespoke-quote";
import { parseTurnstileHostnames, verifyTurnstileToken } from "../shared/turnstile";
import type { CoordinatorApplyResponse } from "./bespoke-quote-coordinator";
import { listBespokeIndex, writeBespokeIndexEntry } from "./bespoke-quote-store";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

export type BespokeQuoteEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  BESPOKE_QUOTE_COORDINATOR?: DurableObjectNamespace;
  /** "1" turns on the PUBLIC request/view/decline routes. Default off. */
  BESPOKE_QUOTES_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Comma-separated hostnames Turnstile tokens may come from. Defaults to the live site. */
  TURNSTILE_ALLOWED_HOSTNAMES?: string;
};

export type BespokeQuoteDeps = { fetchImpl?: typeof fetch };

export const BESPOKE_TURNSTILE_ACTION = "bespoke_quote_request";
export const BESPOKE_RATE_LIMITS = {
  requestPerIpPerHour: 5,
  requestPerEmailPerDay: 3,
  viewPerIpPerHour: 30,
} as const;
const DEDUPE_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;

const ROUTE = /^\/(?:api\/)?(owner\/)?bespoke-quotes(?:\/([a-z-]+))?\/?$/;

export function isBespokeQuotePath(pathname: string): boolean {
  return ROUTE.test(pathname);
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

function stub(ns: DurableObjectNamespace, name: string): DurableObjectStub {
  return ns.get(ns.idFromName(name));
}

async function callCoordinator<T>(ns: DurableObjectNamespace, name: string, action: string, body: unknown): Promise<T> {
  const response = await stub(ns, name).fetch(`https://bespoke-quote/${action}`, {
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

export async function getBespokeQuoteRecord(
  ns: DurableObjectNamespace,
  reference: string,
): Promise<BespokeQuoteRecord | null> {
  const result = await callCoordinator<{ record?: BespokeQuoteRecord | null }>(ns, `quote:${reference}`, "get", {});
  return result.record ?? null;
}

async function applyAction(
  env: BespokeQuoteEnv & { BESPOKE_QUOTE_COORDINATOR: DurableObjectNamespace },
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
  if (result.ok && result.changed && env.TRACKING_STORE) {
    // Index is a read-model only; the Durable Object stays authoritative.
    await writeBespokeIndexEntry(env.TRACKING_STORE, result.record).catch((error) =>
      console.error("bespoke index update failed", reference, error instanceof Error ? error.message : "unknown"),
    );
  }
  return result;
}

/**
 * Internal entry point for later phases (checkout, payment finalisation, cron).
 * Only system_* actions are accepted here.
 */
export async function applyBespokeSystemAction(
  env: BespokeQuoteEnv,
  reference: string,
  action: Extract<BespokeQuoteAction, { type: `system_${string}` }>,
): Promise<CoordinatorApplyResponse> {
  if (!env.BESPOKE_QUOTE_COORDINATOR) {
    return { ok: false, code: "not_configured", error: "Bespoke quotes are not configured.", status: 503 };
  }
  if (!action.type.startsWith("system_")) {
    return { ok: false, code: "invalid_action", error: "Only system actions are allowed.", status: 400 };
  }
  return applyAction({ ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR }, reference, action);
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
    if (!ownerAuthorized(request, env)) return respond({ error: "Unauthorized — owner access required." }, 401, origin);
    if (!env.BESPOKE_QUOTE_COORDINATOR) return respond({ error: "Bespoke quotes are not configured." }, 503, origin);
    const ownerEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
    if (sub === "" && request.method === "GET") return ownerList(url, ownerEnv, origin);
    if (sub === "detail" && request.method === "GET") return ownerDetail(url, ownerEnv, origin);
    if (sub === "action" && request.method === "POST") return ownerAction(request, ownerEnv, origin);
    return respond({ error: "Not found" }, 404, origin);
  }

  // Public routes stay dark until the owner switches the feature on.
  if (env.BESPOKE_QUOTES_ENABLED !== "1") return respond({ error: "Not found" }, 404, origin);
  if (!env.BESPOKE_QUOTE_COORDINATOR) return respond({ error: "This service is temporarily unavailable." }, 503, origin);
  const publicEnv = { ...env, BESPOKE_QUOTE_COORDINATOR: env.BESPOKE_QUOTE_COORDINATOR };
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405, origin);
  if (sub === "request") return publicRequest(request, publicEnv, origin, deps);
  if (sub === "view") return publicView(request, publicEnv, origin);
  if (sub === "decline") return publicDecline(request, publicEnv, origin);
  return respond({ error: "Not found" }, 404, origin);
}

type ReadyEnv = BespokeQuoteEnv & { BESPOKE_QUOTE_COORDINATOR: DurableObjectNamespace };

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
  if (!created.record) return respond({ error: "This service is temporarily unavailable." }, 503, origin);
  if (created.created && env.TRACKING_STORE) {
    await writeBespokeIndexEntry(env.TRACKING_STORE, created.record).catch((error) =>
      console.error("bespoke index write failed", reference, error instanceof Error ? error.message : "unknown"),
    );
  }

  // Only the reference goes back. Never echo stored customer details.
  return respond(
    { ok: true, reference, status: "received", duplicate: claim.claimed !== true || created.created !== true },
    created.created ? 201 : 200,
    origin,
  );
}

const LINK_INVALID = "This quotation link is invalid or no longer available.";

async function resolveToken(
  env: ReadyEnv,
  token: unknown,
): Promise<{ record: BespokeQuoteRecord; tokenHash: string } | null> {
  const parsed = parseBespokeCustomerToken(token);
  if (!parsed) return null;
  const record = await getBespokeQuoteRecord(env.BESPOKE_QUOTE_COORDINATOR, parsed.reference);
  if (!record?.quote) return null;
  const tokenHash = await sha256Hex(parsed.secret);
  if (!timingSafeEqualHex(record.quote.tokenHash, tokenHash)) return null;
  return { record, tokenHash };
}

async function publicView(request: Request, env: ReadyEnv, origin: string | null): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-view-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  const resolved = await resolveToken(env, body?.token);
  if (!resolved) return respond({ error: LINK_INVALID }, 404, origin);
  let record = resolved.record;
  const now = new Date();
  if (record.status === "QUOTED" && isBespokeQuoteExpired(record, now)) {
    const expired = await applyAction(env, record.reference, { type: "system_expire" });
    if (expired.ok) record = expired.record;
  }
  return respond({ ok: true, quote: toBespokeQuotePublicView(record, now) }, 200, origin);
}

async function publicDecline(request: Request, env: ReadyEnv, origin: string | null): Promise<Response> {
  if (!(await rateAllowed(env.BESPOKE_QUOTE_COORDINATOR, `bq-view-ip:${clientIp(request)}`, BESPOKE_RATE_LIMITS.viewPerIpPerHour, 3600))) {
    return respond({ error: "Too many requests. Please try again later." }, 429, origin);
  }
  const body = await readJsonBody(request);
  const parsed = parseBespokeCustomerToken(body?.token);
  if (!parsed) return respond({ error: LINK_INVALID }, 404, origin);
  const result = await applyAction(env, parsed.reference, {
    type: "customer_decline",
    tokenHash: await sha256Hex(parsed.secret),
  });
  if (!result.ok) {
    return respond({ error: result.status === 404 ? LINK_INVALID : result.error }, result.status === 404 ? 404 : 409, origin);
  }
  return respond({ ok: true, quote: toBespokeQuotePublicView(result.record, new Date()) }, 200, origin);
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
  return respond({ ok: true, items, ...(page.cursor ? { cursor: page.cursor } : {}) }, 200, origin);
}

async function ownerDetail(url: URL, env: ReadyEnv, origin: string | null): Promise<Response> {
  const reference = url.searchParams.get("reference") ?? "";
  if (!isBespokeQuoteReference(reference)) return respond({ error: "Invalid reference" }, 400, origin);
  let record = await getBespokeQuoteRecord(env.BESPOKE_QUOTE_COORDINATOR, reference);
  if (!record) return respond({ error: "Request not found" }, 404, origin);
  if (record.status === "QUOTED" && isBespokeQuoteExpired(record, new Date())) {
    const expired = await applyAction(env, reference, { type: "system_expire" });
    if (expired.ok) record = expired.record;
  }
  return respond({ ok: true, request: toBespokeQuoteOwnerView(record) }, 200, origin);
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
function buildOwnerAction(raw: Record<string, unknown>): BespokeQuoteAction | null {
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

async function ownerAction(request: Request, env: ReadyEnv, origin: string | null): Promise<Response> {
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
  const action = raw && typeof raw === "object" ? buildOwnerAction(raw as Record<string, unknown>) : null;
  if (!action) return respond({ error: "Unknown action." }, 400, origin);

  let customerToken: string | undefined;
  if (action.type === "owner_issue_quote") {
    const minted = await generateBespokeCustomerToken(reference);
    action.tokenHash = minted.tokenHash;
    customerToken = minted.token;
  }

  const result = await applyAction(env, reference, action, { expectedVersion, idempotencyKey });
  if (!result.ok) {
    return respond(
      { error: result.error, code: result.code, ...(result.currentVersion ? { currentVersion: result.currentVersion } : {}) },
      result.status,
      origin,
    );
  }
  return respond(
    {
      ok: true,
      changed: result.changed,
      ...(result.replayed ? { replayed: true } : {}),
      request: toBespokeQuoteOwnerView(result.record),
      // Returned once, only to the owner, only when a NEW quote was issued now.
      // The secret is not stored anywhere; Phase 2 emails the link instead.
      ...(customerToken && result.changed && !result.replayed ? { customerToken } : {}),
    },
    200,
    origin,
  );
}

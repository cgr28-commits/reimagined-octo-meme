/**
 * Stripe payments (Checkout Sessions + Elements) for My Airport Taxi NI.
 *
 * Design: the rest of the Worker was built around SumUp. Rather than rewriting
 * every caller, Stripe objects are mapped onto the SumUp shapes the code already
 * understands. `shared/sumup-checkout.ts` routes any Stripe id it sees here:
 *   - Checkout Session ids (`cs_test_…` / `cs_live_…`) → getSumUpCheckout
 *   - PaymentIntent ids (`pi_…`) → refund + transaction lookups
 *
 * Holds ("pre-authorise"): bookings whose journey is within the card
 * authorisation window are created with `capture_method=manual`. The card is
 * authorised at booking and captured after the journey by the Worker cron.
 * A refund on an uncaptured hold cancels (full) or captures less (partial).
 *
 * Secrets: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are Worker secrets only.
 */
import type {
  SumUpCheckoutDetails,
  SumUpRefundResult,
  SumUpTransactionDetails,
} from "./sumup-checkout";

const STRIPE_API = "https://api.stripe.com/v1";

/** Online card holds are valid for 7 days; keep a safety margin. */
export const STRIPE_HOLD_MAX_HOURS_BEFORE_LAST_PICKUP = 6 * 24 - 12; // 132h
/** Capture this long after the last pickup time (covers waiting / extras). */
export const STRIPE_HOLD_CAPTURE_DELAY_HOURS_AFTER_PICKUP = 3;
/** Never leave capture closer than this to the authorisation expiry. */
export const STRIPE_HOLD_EXPIRY_MARGIN_HOURS = 12;

let configuredSecretKey = "";

type StripeEnvLike = { STRIPE_SECRET_KEY?: string };

/** Call once per request / cron run so routed SumUp helpers can reach Stripe. */
export function configureStripe(env: StripeEnvLike): void {
  configuredSecretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function stripeConfigured(): boolean {
  return Boolean(configuredSecretKey);
}

export function isStripeCheckoutId(id: string | undefined | null): boolean {
  return /^cs_(test|live)_/.test(String(id ?? "").trim());
}

export function isStripePaymentIntentId(id: string | undefined | null): boolean {
  return /^pi_[A-Za-z0-9]+/.test(String(id ?? "").trim());
}

export function stripeModeFromKey(key: string): "test" | "live" | "unknown" {
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unknown";
}

export class StripeRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "StripeRequestError";
    this.status = status;
    this.code = code;
  }
}

type FormValue = string | number | boolean | undefined | null | FormObject | FormValue[];
type FormObject = { [key: string]: FormValue };

/** Stripe form encoding: nested objects → a[b][c]=v, arrays → a[0]=v. */
export function encodeStripeForm(params: FormObject, prefix = ""): string {
  const parts: string[] = [];
  const walk = (value: FormValue, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}[${k}]` : k);
      return;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  walk(params, prefix);
  return parts.join("&");
}

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: FormObject,
  options: { idempotencyKey?: string; secretKey?: string } = {},
): Promise<T> {
  const key = options.secretKey?.trim() || configuredSecretKey;
  if (!key) throw new StripeRequestError(503, "Stripe is not configured (STRIPE_SECRET_KEY)");

  const query = method === "GET" && params ? `?${encodeStripeForm(params)}` : "";
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params ? encodeStripeForm(params) : "";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(`${STRIPE_API}${path}${query}`, { method, headers, body });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: string } })
    | null;
  if (!response.ok || !payload) {
    throw new StripeRequestError(
      response.status,
      payload?.error?.message || `Stripe request failed (${response.status})`,
      payload?.error?.code,
    );
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Types (only the fields we use)
// ---------------------------------------------------------------------------

export type StripePaymentIntent = {
  id: string;
  object: "payment_intent";
  status: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
  currency: string;
  capture_method?: string;
  created: number;
  latest_charge?:
    | string
    | {
        id: string;
        amount_refunded?: number;
        refunded?: boolean;
        payment_method_details?: { card?: { capture_before?: number } };
      }
    | null;
  metadata?: Record<string, string>;
};

export type StripeCheckoutSession = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
  client_secret?: string | null;
  created: number;
  expires_at: number;
  metadata?: Record<string, string>;
  payment_intent?: string | StripePaymentIntent | null;
};

// ---------------------------------------------------------------------------
// Checkout Sessions
// ---------------------------------------------------------------------------

export type StripeCheckoutRequest = {
  /** GBP, major units (e.g. 45.5). */
  amount: number;
  description: string;
  checkoutReference: string;
  /** Where Stripe sends the customer after paying. `{CHECKOUT_SESSION_ID}` is filled in. */
  returnUrl: string;
  customerEmail?: string;
  /** Authorise only — capture after the journey. */
  manualCapture?: boolean;
  /** Site origin for the on-site payment page link. */
  siteOrigin: string;
  /** Extra metadata on the session (e.g. hold_kind=short_notice). */
  metadata?: Record<string, string>;
};

export type StripeCheckoutResult = {
  checkoutId: string;
  /** Our own on-site payment page (stands in for SumUp's hosted URL). */
  paymentUrl: string;
  checkoutReference: string;
  createdAt: string;
  manualCapture: boolean;
};

export function stripePaymentPageUrl(siteOrigin: string, checkoutId: string): string {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/pay/card/?checkout=${encodeURIComponent(checkoutId)}`;
}

/** Add checkout_id={CHECKOUT_SESSION_ID} so /booking-confirmed/ can finalise. */
export function withStripeSessionPlaceholder(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("checkout_id");
    const sep = parsed.search ? "&" : "?";
    // Keep the literal braces: Stripe replaces them server-side.
    return `${parsed.origin}${parsed.pathname}${parsed.search}${sep}checkout_id={CHECKOUT_SESSION_ID}${parsed.hash}`;
  } catch {
    return url;
  }
}

export async function createStripeCheckoutSession(
  request: StripeCheckoutRequest,
): Promise<StripeCheckoutResult> {
  const unitAmount = Math.round(request.amount * 100);
  if (!Number.isFinite(unitAmount) || unitAmount < 30) {
    throw new StripeRequestError(400, "Payment amount is too small for card payment");
  }
  const description = request.description.slice(0, 250) || "Airport taxi booking";
  const manualCapture = Boolean(request.manualCapture);
  const email = request.customerEmail?.trim();

  const session = await stripeRequest<StripeCheckoutSession>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      ui_mode: "elements",
      return_url: withStripeSessionPlaceholder(request.returnUrl),
      client_reference_id: request.checkoutReference,
      ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { customer_email: email } : {}),
      // Sessions can live at most 24h; quotes are re-created on demand after that.
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: unitAmount,
            product_data: { name: description },
          },
        },
      ],
      metadata: {
        ...(request.metadata ?? {}),
        checkout_reference: request.checkoutReference,
        source: "website",
      },
      payment_intent_data: {
        description: description.slice(0, 1000),
        metadata: { checkout_reference: request.checkoutReference },
        ...(manualCapture ? { capture_method: "manual" } : {}),
      },
    },
    { idempotencyKey: `checkout:${request.checkoutReference}:${unitAmount}:${manualCapture ? "hold" : "pay"}` },
  );

  return {
    checkoutId: session.id,
    paymentUrl: stripePaymentPageUrl(request.siteOrigin, session.id),
    checkoutReference: request.checkoutReference,
    createdAt: new Date(session.created * 1000).toISOString(),
    manualCapture,
  };
}

/** Close an unpaid session so its link can no longer be used. */
export async function expireStripeCheckoutSession(checkoutId: string): Promise<void> {
  await stripeRequest("POST", `/checkout/sessions/${encodeURIComponent(checkoutId)}/expire`, {});
}

export async function retrieveStripeCheckoutSession(
  checkoutId: string,
): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(
    "GET",
    `/checkout/sessions/${encodeURIComponent(checkoutId)}`,
    { expand: ["payment_intent", "payment_intent.latest_charge"] },
  );
}

function expandedPaymentIntent(session: StripeCheckoutSession): StripePaymentIntent | null {
  return session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent
    : null;
}

/** Paid = money taken, or a successful hold waiting to be captured. */
export function isStripeSessionPaid(session: StripeCheckoutSession): boolean {
  if (session.status !== "complete") return false;
  if (session.payment_status === "paid") return true;
  const pi = expandedPaymentIntent(session);
  return pi?.status === "requires_capture" || pi?.status === "succeeded";
}

export function stripeHoldCaptureBefore(pi: StripePaymentIntent | null): Date | null {
  const charge = pi?.latest_charge;
  const seconds =
    charge && typeof charge === "object"
      ? charge.payment_method_details?.card?.capture_before
      : undefined;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export type StripeCheckoutDetails = SumUpCheckoutDetails & {
  provider: "stripe";
  stripeHold?: {
    paymentIntentId: string;
    captureBefore?: string;
  };
};

/** Map a Checkout Session onto the SumUp checkout shape used across the Worker. */
export function mapStripeSessionToCheckout(session: StripeCheckoutSession): StripeCheckoutDetails {
  const pi = expandedPaymentIntent(session);
  const paid = isStripeSessionPaid(session);
  const status = paid ? "PAID" : session.status === "expired" ? "EXPIRED" : "PENDING";
  const piId = pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : "");
  const captureBefore = stripeHoldCaptureBefore(pi);

  return {
    provider: "stripe",
    id: session.id,
    status,
    amount: typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
    currency: (session.currency ?? "gbp").toUpperCase(),
    checkout_reference: session.client_reference_id ?? session.metadata?.checkout_reference,
    date: new Date(session.created * 1000).toISOString(),
    ...(paid && piId
      ? {
          transaction_id: piId,
          transaction_code: piId,
          transactions: [
            {
              status: "SUCCESSFUL",
              id: piId,
              transaction_code: piId,
              timestamp: new Date((pi?.created ?? session.created) * 1000).toISOString(),
            },
          ],
        }
      : {}),
    ...(paid && pi?.status === "requires_capture"
      ? {
          stripeHold: {
            paymentIntentId: pi.id,
            ...(captureBefore ? { captureBefore: captureBefore.toISOString() } : {}),
          },
        }
      : {}),
  };
}

export async function getStripeCheckoutAsSumUp(checkoutId: string): Promise<StripeCheckoutDetails> {
  return mapStripeSessionToCheckout(await retrieveStripeCheckoutSession(checkoutId));
}

// ---------------------------------------------------------------------------
// PaymentIntents: capture, cancel, refund, status
// ---------------------------------------------------------------------------

export async function retrieveStripePaymentIntent(id: string): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(
    "GET",
    `/payment_intents/${encodeURIComponent(id)}`,
    { expand: ["latest_charge"] },
  );
}

export async function captureStripePaymentIntent(
  id: string,
  amountToCaptureGbp?: number,
): Promise<StripePaymentIntent> {
  const params: FormObject = {};
  if (typeof amountToCaptureGbp === "number") {
    params.amount_to_capture = Math.round(amountToCaptureGbp * 100);
  }
  return stripeRequest<StripePaymentIntent>(
    "POST",
    `/payment_intents/${encodeURIComponent(id)}/capture`,
    params,
    { idempotencyKey: `capture:${id}:${params.amount_to_capture ?? "full"}` },
  );
}

export async function cancelStripePaymentIntent(id: string): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(
    "POST",
    `/payment_intents/${encodeURIComponent(id)}/cancel`,
    { cancellation_reason: "requested_by_customer" },
    { idempotencyKey: `cancel:${id}` },
  );
}

/**
 * Refund (full when amount is omitted). Same contract as refundSumUpTransaction.
 * On an uncaptured hold: full → cancel the hold; partial → capture the rest.
 */
export async function refundStripePayment(
  paymentIntentId: string,
  amountGbp?: number,
): Promise<SumUpRefundResult> {
  const isPartial = typeof amountGbp === "number" && Number.isFinite(amountGbp) && amountGbp > 0;
  const pi = await retrieveStripePaymentIntent(paymentIntentId);
  const requestUrl = `${STRIPE_API}/payment_intents/${paymentIntentId}`;

  if (pi.status === "requires_capture") {
    const capturableGbp = pi.amount_capturable / 100;
    if (!isPartial || amountGbp! >= capturableGbp - 0.004) {
      await cancelStripePaymentIntent(pi.id);
      return {
        requestedAmount: isPartial ? amountGbp : undefined,
        responseAmount: capturableGbp,
        refundedAmount: capturableGbp,
        currency: pi.currency.toUpperCase(),
        endpoint: "stripe",
        httpStatus: 200,
        requestBody: "cancel_hold",
        requestUrl: `${requestUrl}/cancel`,
      };
    }
    const keepGbp = Math.round((capturableGbp - amountGbp!) * 100) / 100;
    await captureStripePaymentIntent(pi.id, keepGbp);
    return {
      requestedAmount: amountGbp,
      responseAmount: amountGbp,
      refundedAmount: amountGbp,
      currency: pi.currency.toUpperCase(),
      endpoint: "stripe",
      httpStatus: 200,
      requestBody: `capture_partial:${keepGbp}`,
      requestUrl: `${requestUrl}/capture`,
    };
  }

  const params: FormObject = { payment_intent: pi.id, reason: "requested_by_customer" };
  if (isPartial) params.amount = Math.round(amountGbp! * 100);
  const refund = await stripeRequest<{ id: string; amount: number; currency: string; status: string }>(
    "POST",
    "/refunds",
    params,
    { idempotencyKey: `refund:${pi.id}:${params.amount ?? "full"}:${Math.floor(Date.now() / 60000)}` },
  );
  return {
    requestedAmount: isPartial ? amountGbp : undefined,
    responseAmount: refund.amount / 100,
    refundedAmount: refund.amount / 100,
    currency: refund.currency.toUpperCase(),
    endpoint: "stripe",
    httpStatus: 200,
    requestBody: encodeStripeForm(params),
    requestUrl: `${STRIPE_API}/refunds`,
  };
}

/** Same shape as getSumUpTransactionDetails so refund reconciliation keeps working. */
export async function getStripeTransactionDetails(
  paymentIntentId: string,
): Promise<SumUpTransactionDetails | null> {
  const pi = await retrieveStripePaymentIntent(paymentIntentId);
  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const amount = pi.amount / 100;
  let amountRefunded = (charge?.amount_refunded ?? 0) / 100;
  let status = pi.status === "succeeded" ? "SUCCESSFUL" : pi.status.toUpperCase();

  if (pi.status === "canceled") {
    // A cancelled hold means nothing was taken: treat as fully returned.
    amountRefunded = amount;
    status = "REFUNDED";
  } else if (pi.status === "succeeded" && pi.amount_received < pi.amount) {
    // Partially captured hold: the uncaptured part was never taken.
    amountRefunded += (pi.amount - pi.amount_received) / 100;
  }
  if (pi.status === "succeeded" && amountRefunded >= amount - 0.004) status = "REFUNDED";

  return {
    id: pi.id,
    transaction_code: pi.id,
    amount,
    currency: pi.currency.toUpperCase(),
    status,
    rawStatus: pi.status,
    amountRefunded: Math.round(amountRefunded * 100) / 100,
    refundEvents: [],
    refundTotalSource: "refunded_amount",
  };
}

// ---------------------------------------------------------------------------
// Holds: should this booking be authorised only?
// ---------------------------------------------------------------------------

/**
 * Hold (authorise now, capture after the journey) only when every leg is
 * inside the authorisation window. Bookings further ahead are charged as now
 * (full payment or the 20% deposit flow).
 */
export function shouldUseStripeHold(input: {
  lastPickupAt: Date | null;
  now?: Date;
  enabled: boolean;
}): boolean {
  if (!input.enabled || !input.lastPickupAt) return false;
  const now = input.now ?? new Date();
  const hoursAhead = (input.lastPickupAt.getTime() - now.getTime()) / 3_600_000;
  return hoursAhead > 0 && hoursAhead <= STRIPE_HOLD_MAX_HOURS_BEFORE_LAST_PICKUP;
}

export function stripeHoldCaptureAt(input: {
  lastPickupAt: Date | null;
  captureBefore: Date | null;
  authorisedAt?: Date;
}): Date {
  const authorisedAt = input.authorisedAt ?? new Date();
  const expiry =
    input.captureBefore ?? new Date(authorisedAt.getTime() + 7 * 24 * 3_600_000);
  const latestSafe = new Date(expiry.getTime() - STRIPE_HOLD_EXPIRY_MARGIN_HOURS * 3_600_000);
  const afterJourney = input.lastPickupAt
    ? new Date(input.lastPickupAt.getTime() + STRIPE_HOLD_CAPTURE_DELAY_HOURS_AFTER_PICKUP * 3_600_000)
    : latestSafe;
  return afterJourney.getTime() < latestSafe.getTime() ? afterJourney : latestSafe;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: { id: string; object: string; [key: string]: unknown } };
};

/** Verify the Stripe-Signature header (v1, 5 minute tolerance). */
export async function verifyStripeWebhook(input: {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<StripeWebhookEvent> {
  const header = input.signatureHeader ?? "";
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!input.secret || !Number.isFinite(timestamp) || signatures.length === 0) {
    throw new StripeRequestError(400, "Missing or malformed Stripe signature");
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300)) {
    throw new StripeRequestError(400, "Stripe signature timestamp outside tolerance");
  }
  const expected = await hmacSha256Hex(input.secret, `${timestamp}.${input.payload}`);
  if (!signatures.some((sig) => timingSafeEqual(sig, expected))) {
    throw new StripeRequestError(400, "Stripe signature mismatch");
  }
  return JSON.parse(input.payload) as StripeWebhookEvent;
}

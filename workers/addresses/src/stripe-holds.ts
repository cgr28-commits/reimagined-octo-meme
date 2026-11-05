/**
 * Stripe card holds ("pre-authorise now, charge 24 hours before pickup").
 *
 * When a paid Stripe checkout is still an uncaptured hold, finalisation records
 * it here. The Worker cron then captures each hold once the first pickup is
 * less than 24 hours away (or safely before the authorisation expires,
 * whichever is sooner).
 *
 * Cancellations go through the normal refund flow: refundStripePayment cancels
 * a hold (full) or captures less (partial), and the next cron run drops it.
 */
import {
  cancelStripePaymentIntent,
  expireStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  type StripePaymentIntent,
  captureStripePaymentIntent,
  getStripeCheckoutAsSumUp,
  isStripeCheckoutId,
  retrieveStripePaymentIntent,
  stripeConfigured,
  stripeHoldCaptureAt,
} from "../shared/stripe-payments";
import { parseLondonLocalDateTime } from "../shared/uk-time";

const HOLD_PREFIX = "stripe-hold:";

export type StripeHoldRecord = {
  paymentIntentId: string;
  checkoutId: string;
  checkoutReference?: string;
  amountGbp?: number;
  customerName?: string;
  tripDate?: string;
  captureAt: string;
  captureBefore?: string;
  createdAt: string;
  lastError?: string;
  attempts?: number;
};

type BookingTimes = {
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  customerName?: string;
};

/** First pickup of the booking (outbound leg). */
export function firstPickupAtForBooking(booking: BookingTimes | null | undefined): Date | null {
  if (!booking) return null;
  return parseLondonLocalDateTime(booking.tripDate ?? "", booking.tripTime ?? "");
}

/** Last pickup of the booking (return leg when there is one). */
export function lastPickupAtForBooking(booking: BookingTimes | null | undefined): Date | null {
  if (!booking) return null;
  const outbound = parseLondonLocalDateTime(booking.tripDate ?? "", booking.tripTime ?? "");
  if (!booking.returnJourney) return outbound;
  const back = parseLondonLocalDateTime(booking.returnDate ?? "", booking.returnTime ?? "");
  // Unknown return time → no safe capture point after the journey.
  return back ?? null;
}

/**
 * Record a hold after a Stripe checkout is finalised. No-op for SumUp
 * checkouts, already-captured payments, or when the store is missing.
 */
export async function recordStripeHoldIfAny(
  store: KVNamespace | undefined,
  checkoutId: string,
  booking: BookingTimes | null | undefined,
): Promise<StripeHoldRecord | null> {
  if (!store || !isStripeCheckoutId(checkoutId) || !stripeConfigured()) return null;
  const checkout = await getStripeCheckoutAsSumUp(checkoutId);
  const hold = checkout.stripeHold;
  if (!hold) return null;

  const key = `${HOLD_PREFIX}${hold.paymentIntentId}`;
  const existing = await store.get<StripeHoldRecord>(key, "json");
  if (existing) return existing;

  const captureBefore = hold.captureBefore ? new Date(hold.captureBefore) : null;
  const captureAt = stripeHoldCaptureAt({
    firstPickupAt: firstPickupAtForBooking(booking),
    captureBefore,
  });
  const record: StripeHoldRecord = {
    paymentIntentId: hold.paymentIntentId,
    checkoutId,
    checkoutReference: checkout.checkout_reference,
    amountGbp: checkout.amount,
    customerName: booking?.customerName,
    tripDate: booking?.tripDate,
    captureAt: captureAt.toISOString(),
    ...(hold.captureBefore ? { captureBefore: hold.captureBefore } : {}),
    createdAt: new Date().toISOString(),
  };
  // Keep the record a little past the authorisation window for auditing.
  await store.put(key, JSON.stringify(record), { expirationTtl: 10 * 24 * 3600 });
  return record;
}

export type StripeHoldRunResult = {
  captured: StripeHoldRecord[];
  closed: string[];
  failed: Array<StripeHoldRecord & { error: string }>;
};

/** Capture holds that are due. Safe to run every few minutes. */
export async function processDueStripeHolds(
  store: KVNamespace | undefined,
  now: Date = new Date(),
): Promise<StripeHoldRunResult> {
  const result: StripeHoldRunResult = { captured: [], closed: [], failed: [] };
  if (!store || !stripeConfigured()) return result;

  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: HOLD_PREFIX, cursor });
    for (const { name } of page.keys) {
      const record = await store.get<StripeHoldRecord>(name, "json");
      if (!record) continue;
      if (new Date(record.captureAt).getTime() > now.getTime()) continue;
      try {
        const pi = await retrieveStripePaymentIntent(record.paymentIntentId);
        if (pi.status === "requires_capture") {
          await captureStripePaymentIntent(pi.id);
          result.captured.push(record);
        } else {
          // Already captured, cancelled (refunded hold) or expired.
          result.closed.push(record.paymentIntentId);
        }
        await store.delete(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = (record.attempts ?? 0) + 1;
        await store.put(
          name,
          JSON.stringify({ ...record, attempts, lastError: message }),
          { expirationTtl: 10 * 24 * 3600 },
        );
        result.failed.push({ ...record, attempts, error: message });
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return result;
}

// ---------------------------------------------------------------------------
// Holds on a single Checkout Session (used by short-notice requests)
// ---------------------------------------------------------------------------

export type CheckoutHoldState = {
  sessionStatus: "open" | "complete" | "expired" | null;
  paymentIntentId?: string;
  /** requires_capture = held; succeeded = charged; canceled = released. */
  paymentIntentStatus?: string;
  amountGbp?: number;
};

export async function getCheckoutHoldState(checkoutId: string): Promise<CheckoutHoldState> {
  const session = await retrieveStripeCheckoutSession(checkoutId);
  const pi: StripePaymentIntent | null =
    session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  return {
    sessionStatus: session.status,
    ...(pi ? { paymentIntentId: pi.id, paymentIntentStatus: pi.status } : {}),
    ...(typeof session.amount_total === "number" ? { amountGbp: session.amount_total / 100 } : {}),
  };
}

/** Charge a held card. Safe to call twice: an already-charged hold is fine. */
export async function captureCheckoutHold(
  checkoutId: string,
): Promise<{ ok: true; alreadyCaptured: boolean } | { ok: false; error: string; state: CheckoutHoldState }> {
  const state = await getCheckoutHoldState(checkoutId);
  if (state.paymentIntentStatus === "succeeded") return { ok: true, alreadyCaptured: true };
  if (state.paymentIntentStatus !== "requires_capture" || !state.paymentIntentId) {
    return {
      ok: false,
      error:
        state.paymentIntentStatus === "canceled"
          ? "The card hold had already been released or expired."
          : "The customer has not authorised their card yet.",
      state,
    };
  }
  await captureStripePaymentIntent(state.paymentIntentId);
  return { ok: true, alreadyCaptured: false };
}

/**
 * Release a hold (customer is never charged). Also closes the session if the
 * customer never finished authorising, so the link can't be used later.
 */
export async function releaseCheckoutHold(
  checkoutId: string,
): Promise<{ released: boolean; state: CheckoutHoldState }> {
  const state = await getCheckoutHoldState(checkoutId);
  if (state.paymentIntentStatus === "requires_capture" && state.paymentIntentId) {
    await cancelStripePaymentIntent(state.paymentIntentId);
    return { released: true, state };
  }
  if (state.sessionStatus === "open") {
    await expireStripeCheckoutSession(checkoutId);
    return { released: true, state };
  }
  return { released: false, state };
}

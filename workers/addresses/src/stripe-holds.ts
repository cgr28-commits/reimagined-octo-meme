/**
 * Stripe card holds ("pre-authorise now, charge after the journey").
 *
 * When a paid Stripe checkout is still an uncaptured hold, finalisation records
 * it here. The Worker cron then captures each hold after the last pickup (or
 * safely before the authorisation expires, whichever is sooner).
 *
 * Cancellations go through the normal refund flow: refundStripePayment cancels
 * a hold (full) or captures less (partial), and the next cron run drops it.
 */
import {
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
    lastPickupAt: lastPickupAtForBooking(booking),
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

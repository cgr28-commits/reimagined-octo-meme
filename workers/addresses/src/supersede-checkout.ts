import {
  getPendingCheckout,
  savePendingCheckout,
  type PendingCheckoutRecord,
} from "./pending-checkout-store";
import {
  expireStripeCheckoutSession,
  isStripeCheckoutId,
  retrieveStripeCheckoutSession,
} from "../shared/stripe-payments";

/**
 * Old unpaid payment pages must not stay payable after the customer changes the booking.
 *
 * When a new website payment is created, the customer's earlier unpaid Stripe payment page
 * (same quote, or the one their browser tab was holding) is closed, so only the newest price
 * can be paid. Deliberately narrow:
 *  - only plain website bookings (never short-notice holds, personal / quick / saved / A2A
 *    quotes, return offers, top-ups or tips — those have their own single-link rules);
 *  - only sessions Stripe still reports as "open" (a paid booking or an authorised card hold
 *    is never touched);
 *  - best-effort: any failure is logged and the new payment carries on.
 */

const LATEST_TTL_SECONDS = 60 * 60 * 24 * 2;
const latestKey = (quoteTransactionId: string) => `pending-checkout-latest:${quoteTransactionId}`;

type SessionOps = {
  retrieve: (checkoutId: string) => Promise<{ status: "open" | "complete" | "expired" | null }>;
  expire: (checkoutId: string) => Promise<void>;
};

const stripeOps: SessionOps = {
  retrieve: retrieveStripeCheckoutSession,
  expire: expireStripeCheckoutSession,
};

/** A plain website booking payment: no token-based link and not a top-up / tip / test. */
export function isPlainWebsiteCheckout(record: PendingCheckoutRecord | null | undefined): boolean {
  if (!record) return false;
  if ((record.checkoutKind ?? "booking") !== "booking") return false;
  if (record.isRefundTest) return false;
  return !(
    record.shortNoticeToken ||
    record.a2aQuoteToken ||
    record.personalQuoteCode ||
    record.quickQuoteId ||
    record.savedQuoteToken ||
    record.returnOfferToken
  );
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const digits = (value: unknown) => String(value ?? "").replace(/\D+/g, "").replace(/^(44|0)/, "");

/** Same customer or same quote — required before a browser-named checkout may be closed. */
export function sameCustomerOrQuote(a: PendingCheckoutRecord, b: PendingCheckoutRecord): boolean {
  const txnA = norm(a.booking?.quoteTransactionId);
  if (txnA && txnA === norm(b.booking?.quoteTransactionId)) return true;
  const emailA = norm(a.booking?.customerEmail);
  if (emailA && emailA === norm(b.booking?.customerEmail)) return true;
  const phoneA = digits(a.booking?.mobileNumber);
  return phoneA.length >= 9 && phoneA === digits(b.booking?.mobileNumber);
}

export async function supersedeEarlierCheckouts(
  store: KVNamespace,
  input: { newCheckoutId: string; clientPreviousCheckoutId?: string | null },
  ops: SessionOps = stripeOps,
): Promise<{ superseded: string[] }> {
  const superseded: string[] = [];
  try {
    const newId = input.newCheckoutId.trim();
    const current = await getPendingCheckout(store, newId);
    if (!current || !isPlainWebsiteCheckout(current)) return { superseded };

    const txn = String(current.booking?.quoteTransactionId ?? "").trim();
    const candidates = new Set<string>();
    if (txn) {
      const indexed = (await store.get(latestKey(txn)))?.trim();
      if (indexed) candidates.add(indexed);
      await store.put(latestKey(txn), newId, { expirationTtl: LATEST_TTL_SECONDS });
    }
    const fromBrowser = String(input.clientPreviousCheckoutId ?? "").trim();
    if (fromBrowser) candidates.add(fromBrowser);
    candidates.delete(newId);

    for (const oldId of [...candidates].slice(0, 3)) {
      try {
        if (!isStripeCheckoutId(oldId)) continue;
        const old = await getPendingCheckout(store, oldId);
        if (!old || !isPlainWebsiteCheckout(old)) continue;
        if (old.finalizedAt || old.paymentReference || old.supersededAt) continue;
        if (!sameCustomerOrQuote(old, current)) continue;
        const session = await ops.retrieve(oldId);
        if (session.status !== "open") continue; // paid, held or already expired: leave alone
        const stamp = new Date().toISOString();
        // Recorded before closing so Stripe's "session expired" event is not reported to the
        // owner as a failed payment.
        await savePendingCheckout(store, {
          ...old,
          supersededAt: stamp,
          supersededByCheckoutId: newId,
          unsuccessfulEmailSentAt: old.unsuccessfulEmailSentAt ?? stamp,
        });
        await ops.expire(oldId);
        superseded.push(oldId);
      } catch (error) {
        console.error("Supersede earlier checkout failed", error instanceof Error ? error.message : "");
      }
    }
    if (superseded.length > 0) {
      console.log(JSON.stringify({ event: "checkout_superseded", count: superseded.length }));
    }
  } catch (error) {
    console.error("Supersede earlier checkouts failed", error instanceof Error ? error.message : "");
  }
  return { superseded };
}

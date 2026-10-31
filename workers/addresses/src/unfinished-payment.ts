/**
 * Cron (every 5 minutes): customers who reached the SumUp card page but didn't pay.
 * 10 minutes on, the owner gets an alert with their details and the customer gets one
 * "finish your booking" email with a link back to a fixed price. See shared/unfinished-payment.
 */
import { buildQuickQuoteCustomerUrl, parseQuickQuoteVehicleChoice } from "../shared/quick-quote";
import { buildSavedQuoteCustomerUrl } from "../shared/saved-quote";
import { getSumUpCheckout, isSumUpCheckoutPaid } from "../shared/sumup-checkout";
import { isUsableEmailAddress } from "../shared/email-typo";
import {
  buildCustomerFinishBookingEmail,
  buildOwnerUnfinishedPaymentEmail,
  selectUnfinishedCheckouts,
} from "../shared/unfinished-payment";
import type { MainQuoteEnv } from "./main-quote-pricing";
import { listRecentPendingCheckouts, patchPendingCheckout, type PendingCheckoutRecord } from "./pending-checkout-store";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { trySendOwnerOperationalEmail, trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SITE_ORIGIN?: string;
  GOOGLE_PLACES_API_KEY?: string;
} & NonNullable<MainQuoteEnv>;

const OWNER_INBOX = "bookings@myairporttaxini.co.uk";

function site(env: Env): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
}

function hoursUntil(date?: string, time?: string, now = new Date()): number {
  const at = Date.parse(`${date ?? ""}T${(time || "12:00").slice(0, 5)}:00Z`);
  return Number.isFinite(at) ? (at - now.getTime()) / 3_600_000 : Infinity;
}

/** A link that opens a fixed price for this journey: their own quote link, or a fresh one. */
async function resumeLink(env: Env, pending: PendingCheckoutRecord): Promise<{ url: string; priceLabel?: string }> {
  const origin = site(env);
  if (pending.quickQuoteId) return { url: buildQuickQuoteCustomerUrl(pending.quickQuoteId, origin), priceLabel: `£${pending.amount}` };
  if (pending.savedQuoteToken) return { url: buildSavedQuoteCustomerUrl(pending.savedQuoteToken, origin), priceLabel: `£${pending.amount}` };
  const b = pending.booking;
  const vehicle = String(b.vehicle ?? "");
  if (env.TRACKING_STORE && !/business|executive/i.test(vehicle)) {
    try {
      const shortNotice = hoursUntil(b.tripDate, b.tripTime) < 24;
      const priced = await createPricedQuickQuote(
        {
          pickupAddress: b.pickupLabel,
          dropoffAddress: b.dropoffLabel,
          airportCode: b.airportCode ?? null,
          fromAirport: typeof b.isFromAirport === "boolean" ? b.isFromAirport : null,
          journeyMode: b.returnJourney ? "return" : "one-way",
          outboundDate: b.tripDate,
          outboundTime: b.tripTime,
          returnDate: b.returnJourney ? b.returnDate : "",
          returnTime: b.returnJourney ? b.returnTime : "",
          passengers: b.passengers,
          suitcases: b.suitcases,
          flightNumber: b.flightNumber ?? "",
          vehicleChoice: parseQuickQuoteVehicleChoice(vehicle),
          expressDropOffSelected: Boolean(b.expressDropOffSelected),
          priceSource: "website-pricing-engine",
          ...(shortNotice ? { ttlSeconds: 2 * 60 * 60 } : { validityMode: "24h" }),
        },
        { ...env, TRACKING_STORE: env.TRACKING_STORE },
        { createdByOwner: false },
      );
      if (priced.ok) return { url: priced.bookingUrl, priceLabel: priced.record.quotedAmountLabel };
    } catch (error) {
      console.error("Unfinished payment: quick quote failed", error instanceof Error ? error.message : error);
    }
  }
  return { url: `${origin}/#quote` };
}

export async function processUnfinishedPayments(env: Env, now = new Date()): Promise<{ alerted: number; customersEmailed: number; errors: number }> {
  const result = { alerted: 0, customersEmailed: 0, errors: 0 };
  const store = env.TRACKING_STORE;
  if (!store) return result;
  const records = (await listRecentPendingCheckouts(store, { limit: 80 })).filter(
    (r) => !r.isRefundTest && (r.checkoutKind ?? "booking") === "booking",
  );
  const groups = selectUnfinishedCheckouts(records, now);
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";

  for (const { latest, attempts } of groups.slice(0, 5)) {
    try {
      // The payment may have gone through without our finalize yet (recovery cron handles that).
      let status: string | undefined;
      let paidAlready = false;
      if (apiKey) {
        for (const attempt of attempts.slice(0, 6)) {
          const checkout = await getSumUpCheckout(apiKey, attempt.checkoutId).catch(() => null);
          if (checkout && isSumUpCheckoutPaid(checkout)) paidAlready = true;
          if (attempt === latest) status = checkout ? String(checkout.status ?? "").toUpperCase() : undefined;
        }
      }
      if (paidAlready) continue;

      const link = await resumeLink(env, latest);
      const email = String(latest.booking.customerEmail ?? "").trim();
      let customerEmailed = false;
      if (isUsableEmailAddress(email)) {
        const customer = buildCustomerFinishBookingEmail({ checkout: latest, resumeUrl: link.url, priceLabel: link.priceLabel });
        const sent = await trySendResendOnlyCustomerEmail(env, {
          to: email,
          subject: customer.subject,
          body: customer.text,
          htmlBody: customer.html,
          idempotencyKey: `unfinished-payment:${latest.checkoutId}`,
        });
        customerEmailed = sent.sent;
        if (sent.sent) result.customersEmailed++;
      }

      const owner = buildOwnerUnfinishedPaymentEmail({
        checkout: latest,
        attempts: attempts.length,
        sumUpStatus: status,
        customerEmailed,
        resumeUrl: link.url,
      });
      const ownerSent = await trySendOwnerOperationalEmail(env, { to: OWNER_INBOX, subject: owner.subject, body: owner.body });

      // Mark every attempt so this customer is alerted once, even if one email failed.
      if (ownerSent.sent || customerEmailed) {
        const stamp = now.toISOString();
        for (const a of attempts) await patchPendingCheckout(store, a.checkoutId, { unfinishedAlertSentAt: stamp });
        result.alerted++;
      } else {
        result.errors++;
      }
      console.log(JSON.stringify({ event: "unfinished_payment_alert", attempts: attempts.length, ownerSent: ownerSent.sent, customerEmailed }));
    } catch (error) {
      result.errors++;
      console.error("Unfinished payment alert failed", error instanceof Error ? error.message : error);
    }
  }
  return result;
}

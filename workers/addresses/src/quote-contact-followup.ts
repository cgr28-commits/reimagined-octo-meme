/**
 * "Your quote is still waiting" — one follow-up email to customers who priced a
 * journey and entered their contact details, but never reached the payment page.
 *
 * - Queued when the website sends the "Contact details added to quote" lead.
 * - Sent about an hour later by the 5-minute cron, with a link that holds their price.
 * - Never sent if they have since started paying (the unfinished-payment email covers
 *   them), already booked, or the pickup is too close / has passed. Once per quote, and
 *   at most once a day per email address.
 *
 * Storage: one small KV queue key, so an empty run costs a single read.
 */
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_MAILBOX,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WEBSITE,
  businessEmailClientMeta,
  businessEmailLogoHtml,
  lightCustomerEmailHtml, BUSINESS_LANDLINE_DISPLAY
} from "../shared/business-email";
import { isUsableEmailAddress } from "../shared/email-typo";
import { parseQuickQuoteVehicleChoice } from "../shared/quick-quote";
import type { QuoteLeadDetails } from "../shared/quote-lead";
import { formatUkDateTime } from "../shared/uk-time";
import type { MainQuoteEnv } from "./main-quote-pricing";
import { listRecentPaidBookings } from "./paid-booking-store";
import { listRecentPendingCheckouts } from "./pending-checkout-store";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export const QUOTE_FOLLOWUP_QUEUE_KEY = "quote-contact-followup:queue";
export const QUOTE_FOLLOWUP_DELAY_MS = 60 * 60 * 1000;
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const SAME_EMAIL_GAP_MS = 24 * 60 * 60 * 1000;
const MIN_HOURS_BEFORE_PICKUP = 3;
const MAX_QUEUE = 150;
const MAX_SENDS_PER_RUN = 5;

export type QuoteFollowUpEntry = {
  txn: string;
  email: string;
  name: string;
  createdAt: string;
  dueAt: string;
  sentAt?: string;
  skipped?: string;
  journey: Pick<
    QuoteLeadDetails,
    | "tripLabel"
    | "pickupLabel"
    | "dropoffLabel"
    | "returnJourney"
    | "tripDate"
    | "tripTime"
    | "returnDate"
    | "returnTime"
    | "passengers"
    | "suitcases"
    | "vehicle"
    | "estimatedPrice"
    | "airportCode"
    | "isAirportTrip"
  >;
};

type Env = WorkerEmailEnv & MainQuoteEnv & { TRACKING_STORE?: KVNamespace; SITE_ORIGIN?: string };

async function readQueue(store: KVNamespace): Promise<QuoteFollowUpEntry[]> {
  const value = await store.get<QuoteFollowUpEntry[]>(QUOTE_FOLLOWUP_QUEUE_KEY, "json");
  return Array.isArray(value) ? value : [];
}

function prune(queue: QuoteFollowUpEntry[], now: number): QuoteFollowUpEntry[] {
  return queue.filter((e) => now - Date.parse(e.createdAt) < KEEP_MS).slice(-MAX_QUEUE);
}

/** Queue one follow-up for a quote where the customer added contact details. */
export async function enqueueQuoteContactFollowUp(
  store: KVNamespace,
  details: QuoteLeadDetails,
  now = new Date(),
): Promise<boolean> {
  const email = String(details.customerEmail ?? "").trim().toLowerCase();
  const txn = String(details.quoteTransactionId ?? "").trim();
  if (!txn || !isUsableEmailAddress(email)) return false;
  const t = now.getTime();
  const queue = prune(await readQueue(store), t);
  if (queue.some((e) => e.txn === txn)) return false;
  if (queue.some((e) => e.email === email && t - Date.parse(e.createdAt) < SAME_EMAIL_GAP_MS)) return false;
  queue.push({
    txn,
    email,
    name: String(details.customerName ?? "").trim(),
    createdAt: now.toISOString(),
    dueAt: new Date(t + QUOTE_FOLLOWUP_DELAY_MS).toISOString(),
    journey: {
      tripLabel: details.tripLabel,
      pickupLabel: details.pickupLabel,
      dropoffLabel: details.dropoffLabel,
      returnJourney: details.returnJourney,
      tripDate: details.tripDate,
      tripTime: details.tripTime,
      returnDate: details.returnDate,
      returnTime: details.returnTime,
      passengers: details.passengers,
      suitcases: details.suitcases,
      vehicle: details.vehicle,
      estimatedPrice: details.estimatedPrice,
      airportCode: details.airportCode,
      isAirportTrip: details.isAirportTrip,
    },
  });
  await store.put(QUOTE_FOLLOWUP_QUEUE_KEY, JSON.stringify(queue));
  return true;
}

function hoursUntilPickup(date?: string, time?: string, now = new Date()): number {
  if (!date) return Infinity;
  const at = Date.parse(`${date}T${(time || "12:00").slice(0, 5)}:00Z`);
  return Number.isFinite(at) ? (at - now.getTime()) / 3_600_000 : Infinity;
}

function siteOrigin(env: Env): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
}

/** A link that opens a held fixed price for this journey, or the quote form as a fallback. */
async function followUpLink(env: Env, entry: QuoteFollowUpEntry, now: Date): Promise<{ url: string; priceLabel?: string }> {
  const j = entry.journey;
  const store = env.TRACKING_STORE;
  const vehicle = String(j.vehicle ?? "");
  if (store && j.tripDate && j.tripTime && !/business|executive/i.test(vehicle)) {
    try {
      const fromAirport = /pickup/i.test(j.tripLabel) && j.isAirportTrip;
      const priced = await createPricedQuickQuote(
        {
          pickupAddress: j.pickupLabel,
          dropoffAddress: j.dropoffLabel,
          airportCode: j.airportCode ?? null,
          fromAirport: j.isAirportTrip ? fromAirport : null,
          journeyMode: j.returnJourney ? "return" : "one-way",
          outboundDate: j.tripDate,
          outboundTime: j.tripTime,
          returnDate: j.returnJourney ? (j.returnDate ?? "") : "",
          returnTime: j.returnJourney ? (j.returnTime ?? "") : "",
          passengers: j.passengers,
          suitcases: j.suitcases,
          flightNumber: "",
          vehicleChoice: parseQuickQuoteVehicleChoice(vehicle),
          expressDropOffSelected: false,
          priceSource: "website-pricing-engine",
          ...(hoursUntilPickup(j.tripDate, j.tripTime, now) < 24 ? { ttlSeconds: 2 * 60 * 60 } : { validityMode: "24h" }),
        },
        { ...env, TRACKING_STORE: store },
        { createdByOwner: false },
      );
      if (priced.ok) return { url: priced.bookingUrl, priceLabel: priced.record.quotedAmountLabel };
    } catch (error) {
      console.error("Quote follow-up: quick quote failed", error instanceof Error ? error.message : error);
    }
  }
  return { url: `${siteOrigin(env)}/#quote` };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildQuoteFollowUpEmail(input: {
  entry: QuoteFollowUpEntry;
  url: string;
  priceLabel?: string;
}): { subject: string; text: string; html: string } {
  const j = input.entry.journey;
  const first = input.entry.name.split(/\s+/)[0] || "there";
  const journey = `${j.pickupLabel} → ${j.dropoffLabel}`;
  const pickup = j.tripDate && j.tripTime ? formatUkDateTime(j.tripDate, j.tripTime) : "date to be chosen";
  const priceLabel = input.priceLabel || j.estimatedPrice;
  const priceLine = priceLabel ? `Your fixed price of ${priceLabel} is ready to book.` : "Your fixed price is ready to book.";
  const subject = "Your transfer quote is waiting — My Airport Taxi NI";
  const text = [
    `Hi ${first},`,
    "",
    "Thanks for getting a quote from My Airport Taxi NI. Your journey isn't booked yet, so here are the details in case you'd like to go ahead.",
    "",
    journey,
    `Pickup: ${pickup}`,
    "",
    priceLine,
    "Book here:",
    input.url,
    "",
    "Fixed price, a pre-booked local driver and free cancellation up to 24 hours before pickup.",
    `Any questions? Just reply to this email, or call or WhatsApp us on ${BUSINESS_PHONE_DISPLAY}, or ring our landline on ${BUSINESS_LANDLINE_DISPLAY}.`,
    "",
    "My Airport Taxi NI",
    BUSINESS_WEBSITE,
  ].join("\n");
  const html = lightCustomerEmailHtml(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
${businessEmailClientMeta()}
<title>Your quote is waiting — My Airport Taxi NI</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${BRAND_NAVY};padding:28px 32px;text-align:center;">
${businessEmailLogoHtml()}
<div style="margin-top:16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_EMERALD};font-weight:bold;">Your quote</div>
<div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Hi ${esc(first)}, your quote is waiting</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#334155;">
<p>Thanks for getting a quote from My Airport Taxi NI. Your journey isn't booked yet, so here are the details in case you'd like to go ahead.</p>
<p><strong>${esc(journey)}</strong><br/>Pickup: ${esc(pickup)}</p>
<p>${esc(priceLine)}</p>
<p style="margin:24px 0 8px;text-align:center;">
<a href="${esc(input.url)}" style="display:inline-block;background:${BRAND_NAVY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">Book my transfer</a>
</p>
<p style="margin:16px 0 0;font-size:14px;color:#64748b;">Fixed price, a pre-booked local driver and free cancellation up to 24 hours before pickup. Any questions? Just reply to this email, or call or WhatsApp us on ${esc(BUSINESS_PHONE_DISPLAY)}, or ring our landline on ${esc(BUSINESS_LANDLINE_DISPLAY)}.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;font-size:13px;color:#64748b;">
<strong style="color:${BRAND_NAVY};">My Airport Taxi NI</strong><br />
<a href="${BUSINESS_WEBSITE}" style="color:${BRAND_NAVY};">${BUSINESS_WEBSITE.replace(/^https:\/\//, "")}</a> ·
<a href="mailto:${BUSINESS_MAILBOX}" style="color:${BRAND_NAVY};">${BUSINESS_MAILBOX}</a>
</td></tr>
</table></td></tr></table>
</body></html>`);
  return { subject, text, html };
}

/** Cron (every 5 minutes): send due follow-ups. An empty or not-yet-due queue costs one read. */
export async function processQuoteContactFollowUps(
  env: Env,
  now = new Date(),
): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 };
  const store = env.TRACKING_STORE;
  if (!store) return result;
  const queue = await readQueue(store);
  const t = now.getTime();
  const due = queue.filter((e) => !e.sentAt && !e.skipped && Date.parse(e.dueAt) <= t).slice(0, MAX_SENDS_PER_RUN);
  if (due.length === 0) {
    const pruned = prune(queue, t);
    if (pruned.length !== queue.length) await store.put(QUOTE_FOLLOWUP_QUEUE_KEY, JSON.stringify(pruned));
    return result;
  }

  // Only read bookings and checkouts when something is actually due.
  const [paid, pending] = await Promise.all([
    listRecentPaidBookings(store, { days: 3, limit: 100 }).catch(() => []),
    listRecentPendingCheckouts(store, { limit: 80 }).catch(() => []),
  ]);
  const paidEmails = new Set(paid.map((b) => String(b.customerEmail ?? "").trim().toLowerCase()).filter(Boolean));
  const checkoutEmails = new Map<string, number>();
  for (const p of pending) {
    const email = String(p.booking?.customerEmail ?? "").trim().toLowerCase();
    const at = Date.parse(String(p.createdAt ?? ""));
    if (email && Number.isFinite(at)) checkoutEmails.set(email, Math.max(checkoutEmails.get(email) ?? 0, at));
  }

  for (const entry of due) {
    try {
      const started = checkoutEmails.get(entry.email);
      if (paidEmails.has(entry.email)) entry.skipped = "booked";
      else if (started && started >= Date.parse(entry.createdAt) - 5 * 60 * 1000) entry.skipped = "reached payment";
      else if (hoursUntilPickup(entry.journey.tripDate, entry.journey.tripTime, now) < MIN_HOURS_BEFORE_PICKUP)
        entry.skipped = "pickup too soon or passed";
      if (entry.skipped) {
        result.skipped++;
        continue;
      }
      const link = await followUpLink(env, entry, now);
      const email = buildQuoteFollowUpEmail({ entry, url: link.url, priceLabel: link.priceLabel });
      const sent = await trySendResendOnlyCustomerEmail(env, {
        to: entry.email,
        subject: email.subject,
        body: email.text,
        htmlBody: email.html,
        idempotencyKey: `quote-contact-followup:${entry.txn}`,
      });
      if (sent.sent) {
        entry.sentAt = now.toISOString();
        result.sent++;
        console.log(JSON.stringify({ event: "quote_contact_followup_sent", txn: entry.txn }));
      } else {
        entry.skipped = `send failed: ${String(sent.error ?? "").slice(0, 80)}`;
        result.errors++;
      }
    } catch (error) {
      entry.skipped = "error";
      result.errors++;
      console.error("Quote follow-up failed", error instanceof Error ? error.message : error);
    }
  }
  await store.put(QUOTE_FOLLOWUP_QUEUE_KEY, JSON.stringify(prune(queue, t)));
  return result;
}

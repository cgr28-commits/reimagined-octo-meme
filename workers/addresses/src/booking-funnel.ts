import { BOOKING_FUNNEL_EVENTS, bookingFunnelKey, summarizeBookingFunnel, type BookingFunnelEvent } from "../shared/booking-funnel";
import { QUOTE_SESSION_TTL_SECONDS, quoteSessionDayMarkerPrefix, isQuoteTransactionId, type DailyQuoteSessionRecord } from "../shared/quote-session";
import { buildQuoteTripLines, type QuoteLeadDetails, type QuoteLeadMarkerStore } from "../shared/quote-lead";
import { getQuoteSession } from "./quote-session-store";

export async function recordBookingFunnelEvent(store: KVNamespace, id: string, event: BookingFunnelEvent | "paid", now = new Date()) {
  if (!isQuoteTransactionId(id)) return;
  // Separate keys: out-of-order requests cannot overwrite a later stage or payment.
  const key = bookingFunnelKey(id, event);
  if (!await store.get(key)) await store.put(key, now.toISOString(), { expirationTtl: QUOTE_SESSION_TTL_SECONDS });
}
export async function sendBookingStartedAlert(details: QuoteLeadDetails, markers: QuoteLeadMarkerStore,
  send: (subject: string, body: string) => Promise<boolean>): Promise<boolean> {
  const id = details.quoteTransactionId?.trim().toLowerCase();
  if (!id || !isQuoteTransactionId(id)) return false;
  const key = `booking-started:${id}`;
  if (!await markers.claim(key)) return false;
  let sent = false;
  try {
    sent = await send("Customer clicked Book My Transfer — My Airport Taxi NI", [
      "New Booking Attempt — My Airport Taxi NI", "", ...buildQuoteTripLines(details), "",
      "Status: Booking started — contact details not yet entered",
      `Tracking reference: ${id}`, `Clicked at: ${new Date().toISOString()}`,
      "This is an unconfirmed website booking attempt, not a confirmed booking or payment.",
      "Journey and fare are the customer's displayed quote; payment is validated separately."
    ].join("\n"));
    return sent;
  } finally {
    if (!sent) await markers.release(key);
  }
}
export async function readBookingFunnel(store: KVNamespace, day: string) {
  // Bound KV reads and response size. Never silently present a capped sample as complete.
  const page = await store.list({ prefix: quoteSessionDayMarkerPrefix(day), limit: 100 });
  const records: Array<{ quote: DailyQuoteSessionRecord; events: Partial<Record<BookingFunnelEvent | "paid", string>> }> = [];
  for (const key of page.keys) {
    const id = key.name.slice(quoteSessionDayMarkerPrefix(day).length);
    const quote = await getQuoteSession(store, id);
    if (!quote || quote.source === "bot") continue;
    const events: Partial<Record<BookingFunnelEvent | "paid", string>> = {};
    for (const event of [...BOOKING_FUNNEL_EVENTS, "paid"] as const) {
      const value = await store.get(bookingFunnelKey(id, event));
      if (value) events[event] = value;
    }
    records.push({ quote, events });
  }
  return summarizeBookingFunnel(day, records, !page.list_complete);
}

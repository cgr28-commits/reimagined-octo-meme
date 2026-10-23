import type { DailyQuoteSessionRecord } from "./quote-session";

export const BOOKING_FUNNEL_EVENTS = ["booking_started", "details_opened", "details_submitted", "payment_opened"] as const;
export type BookingFunnelEvent = typeof BOOKING_FUNNEL_EVENTS[number];
export function isBookingFunnelEvent(value: unknown): value is BookingFunnelEvent {
  return typeof value === "string" && (BOOKING_FUNNEL_EVENTS as readonly string[]).includes(value);
}
export function bookingFunnelKey(id: string, event: BookingFunnelEvent | "paid") {
  return `booking_funnel:${id.toLowerCase()}:${event}`;
}
export type BookingFunnelRow = Pick<DailyQuoteSessionRecord, "quoteTransactionId" | "pickupLabel" | "dropoffLabel" | "vehicle" | "estimatedPriceLabel" | "booked"> & {
  lastStage: string;
  lastAt: string;
  possiblyAbandoned: boolean;
};
export type BookingFunnelSnapshot = {
  day: string;
  truncated: boolean;
  quotes: number;
  started: number;
  detailsOpened: number;
  detailsSubmitted: number;
  paymentOpened: number;
  paid: number;
  rows: BookingFunnelRow[];
};
export function summarizeBookingFunnel(day: string, records: Array<{
  quote: DailyQuoteSessionRecord;
  events: Partial<Record<BookingFunnelEvent | "paid", string>>;
}>, truncated = false, now = Date.now()): BookingFunnelSnapshot {
  const result: BookingFunnelSnapshot = { day, truncated, quotes: records.length, started: 0,
    detailsOpened: 0, detailsSubmitted: 0, paymentOpened: 0, paid: 0, rows: [] };
  const stages = [["booking_started", "Booking started"], ["details_opened", "Contact stage opened"],
    ["details_submitted", "Details submitted"], ["payment_opened", "SumUp opened"], ["paid", "Payment confirmed"]] as const;
  for (const { quote, events } of records) {
    if (events.booking_started) result.started++;
    if (events.details_opened) result.detailsOpened++;
    if (events.details_submitted) result.detailsSubmitted++;
    if (events.payment_opened) result.paymentOpened++;
    if (events.paid) result.paid++;
    let lastStage = "Quote received", lastAt = quote.firstQuotedAt;
    for (const [event, label] of stages) {
      if (events[event]) { lastStage = label; lastAt = events[event]!; }
    }
    if (quote.booked && !events.paid) lastStage = "Booking request recorded";
    result.rows.push({ quoteTransactionId: quote.quoteTransactionId, pickupLabel: quote.pickupLabel,
      dropoffLabel: quote.dropoffLabel, vehicle: quote.vehicle, estimatedPriceLabel: quote.estimatedPriceLabel,
      booked: quote.booked, lastStage, lastAt,
      possiblyAbandoned: !quote.booked && !events.paid && Boolean(events.booking_started) && now - Date.parse(lastAt) >= 600_000 });
  }
  result.rows.sort((a,b) => b.lastAt.localeCompare(a.lastAt));
  return result;
}

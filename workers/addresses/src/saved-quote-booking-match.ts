import { paidBookingTripDayIndexKey, type PaidBookingRecord } from "../shared/paid-booking-record";
import { resolveOperationalStatus } from "../shared/refund-ops";
import { isOwnerOperationalTestBooking } from "../shared/upcoming-jobs";
import type { SavedQuoteRecord } from "../shared/saved-quote";
import { getPaidBookingRecord } from "./paid-booking-store";
import { markSavedQuoteBooked } from "./saved-quote-store";

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameLeg(
  quote: SavedQuoteRecord["journey"],
  pickup: string, dropoff: string, date: string | undefined, time: string | undefined,
): boolean {
  // Undated quotes cannot identify a particular journey safely.
  return Boolean(quote.tripDate && quote.tripTime && quote.pickupLabel && quote.dropoffLabel) &&
    normalized(quote.pickupLabel) === normalized(pickup) &&
    normalized(quote.dropoffLabel) === normalized(dropoff) &&
    quote.tripDate.trim() === date?.trim() && quote.tripTime.trim() === time?.trim();
}

/** Never suppress a different journey merely because the customer email matches. */
export function savedQuoteMatchesConfirmedBooking(quote: SavedQuoteRecord, booking: PaidBookingRecord): boolean {
  if (!normalized(quote.customerEmail) || normalized(quote.customerEmail) !== normalized(booking.customerEmail)) return false;
  if (isOwnerOperationalTestBooking(booking) || resolveOperationalStatus(booking) !== "confirmed") return false;
  if (!["confirmed", "partially_refunded", "refunded_active"].includes(booking.status)) return false;
  const outboundActive = !booking.cancelledLegs?.includes("outbound") && !booking.outboundCancelledAt;
  const returnActive = booking.returnJourney && !booking.cancelledLegs?.includes("return") && !booking.returnCancelledAt;
  const outboundMatches = outboundActive && sameLeg(quote.journey, booking.pickupLabel, booking.dropoffLabel, booking.tripDate, booking.tripTime);
  if (quote.journey.returnJourney) {
    // A paid one-way transfer does not fulfil a saved return quote.
    return Boolean(outboundMatches && returnActive && quote.journey.returnDate && quote.journey.returnTime &&
      quote.journey.returnDate.trim() === booking.returnDate?.trim() &&
      quote.journey.returnTime.trim() === booking.returnTime?.trim());
  }
  return Boolean(outboundMatches || (returnActive && sameLeg(quote.journey,
    booking.dropoffLabel, booking.pickupLabel, booking.returnDate, booking.returnTime)));
}

/** Check current records after the reminder claim, including older bookings without a day index. */
export async function suppressSavedQuoteReminderForBookedJourney(store: KVNamespace, quote: SavedQuoteRecord): Promise<boolean> {
  if (quote.status === "booked") return true;
  if (!quote.journey.tripDate || !quote.journey.tripTime) return false;
  const checked = new Set<string>();
  async function check(reference: string): Promise<boolean> {
    if (!reference || checked.has(reference)) return false;
    checked.add(reference);
    const booking = await getPaidBookingRecord(store, reference);
    if (!booking || !savedQuoteMatchesConfirmedBooking(quote, booking)) return false;
    await markSavedQuoteBooked(store, quote.token, {
      paymentReference: booking.paymentReference, checkoutId: booking.checkoutId,
    });
    return true;
  }
  const refs = await store.get<string[]>(paidBookingTripDayIndexKey(quote.journey.tripDate), "json");
  if (Array.isArray(refs)) for (const ref of refs) if (await check(ref)) return true;
  // Historical records can predate the trip-day index. Pagination prevents silently missing them.
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: "booking:ref:", cursor, limit: 100 });
    for (const key of page.keys) if (await check(key.name.slice("booking:ref:".length))) return true;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return false;
}

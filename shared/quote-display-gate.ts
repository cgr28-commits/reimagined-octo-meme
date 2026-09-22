/**
 * Public quote calculator display gate.
 * Monetary vehicle prices must not appear until the booked pickup schedule
 * (and return schedule, when booked) has been entered.
 */

export type QuoteDisplaySchedule = {
  outboundDate?: string | null;
  outboundTime?: string | null;
  returnJourney?: boolean;
  returnDate?: string | null;
  returnTime?: string | null;
};

export function hasEnteredQuoteSchedule(schedule: QuoteDisplaySchedule): boolean {
  const outboundDate = String(schedule.outboundDate ?? "").trim();
  const outboundTime = String(schedule.outboundTime ?? "").trim();
  if (!outboundDate || !outboundTime) {
    return false;
  }
  if (schedule.returnJourney) {
    const returnDate = String(schedule.returnDate ?? "").trim();
    const returnTime = String(schedule.returnTime ?? "").trim();
    if (!returnDate || !returnTime) {
      return false;
    }
  }
  return true;
}

export const QUOTE_PRICE_WAIT_FOR_SCHEDULE =
  "Enter your pickup date and time to see your fixed price.";

export const QUOTE_PRICE_WAIT_FOR_DETAILS =
  "Complete your travel details to see your fixed price.";

export const QUOTE_INCLUDES_NIGHT_WEEKEND_SURCHARGE =
  "Includes 10% Night & Weekend Surcharge";

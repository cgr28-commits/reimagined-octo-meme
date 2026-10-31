import type { SaveQuoteResult } from "./saved-quote-api";
import { SAVED_QUOTE_ADD_SCHEDULE_COPY, savedQuoteHasSchedule } from "../../shared/saved-quote";
export function savedQuoteWhatsAppUrl(result: SaveQuoteResult, mobile: boolean): string {
  const j = result.quote.journey;
  const schedule = [j.tripDate, j.tripTime].filter(Boolean).join(" ") || "To be confirmed";
  const returnSchedule = j.returnJourney ? `\nReturn: ${[j.returnDate, j.returnTime].filter(Boolean).join(" ") || "To be confirmed"}` : "";
  const held = result.heldPrice;
  // Held price: book at exactly that price. Otherwise the saved link restores the journey.
  const priceLines = held
    ? `Fixed price: ${held.amountLabel} (held until ${held.heldUntilLabel})\nQuote reference: ${result.reference}\nBook at this price: ${held.bookingUrl}\nView or change my quote: ${result.quoteUrl}`
    : `Quoted fare: ${result.amountLabel}\nQuote reference: ${result.reference}\nReturn to my quote: ${result.quoteUrl}\n${savedQuoteHasSchedule(j) ? "Fare recalculated before booking." : SAVED_QUOTE_ADD_SCHEDULE_COPY}`;
  const message = `My Airport Taxi NI\n${j.pickupLabel} → ${j.dropoffLabel}\n${j.returnJourney ? "Return journey" : "One-way journey"}\nPickup: ${schedule}${returnSchedule}\nVehicle: ${j.vehicle}\nPassengers: ${j.passengers} | Suitcases: ${j.suitcases}\n${priceLines}`;
  return `${mobile ? "https://wa.me/" : "https://web.whatsapp.com/send"}?text=${encodeURIComponent(message)}`;
}

/** Intro line: held price once saved, otherwise what saving gives the customer. */
export function saveQuoteIntroCopy(result: Pick<SaveQuoteResult, "heldPrice" | "quote"> | null, validityDays: number): string {
  if (result?.heldPrice) return `Your price of ${result.heldPrice.amountLabel} is held until ${result.heldPrice.heldUntilLabel}. No obligation to book.`;
  if (result && !savedQuoteHasSchedule(result.quote.journey)) return `${SAVED_QUOTE_ADD_SCHEDULE_COPY} No obligation to book.`;
  if (result) return `Retrieve your quote for ${validityDays} days. Your fare will be recalculated before booking. No obligation to book.`;
  return `Retrieve your quote for ${validityDays} days. With a pickup date and time, your price is held for up to ${validityDays} days. No obligation to book.`;
}

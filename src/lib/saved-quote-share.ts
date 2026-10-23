import type { SaveQuoteResult } from "./saved-quote-api";
export function savedQuoteWhatsAppUrl(result: SaveQuoteResult, mobile: boolean): string {
  const j = result.quote.journey;
  const schedule = [j.tripDate, j.tripTime].filter(Boolean).join(" ") || "To be confirmed";
  const returnSchedule = j.returnJourney ? `\nReturn: ${[j.returnDate, j.returnTime].filter(Boolean).join(" ") || "To be confirmed"}` : "";
  const message = `My Airport Taxi NI\n${j.pickupLabel} → ${j.dropoffLabel}\n${j.returnJourney ? "Return journey" : "One-way journey"}\nPickup: ${schedule}${returnSchedule}\nVehicle: ${j.vehicle}\nPassengers: ${j.passengers} | Suitcases: ${j.suitcases}\nQuoted fare: ${result.amountLabel}\nQuote reference: ${result.reference}\nReturn to my quote: ${result.quoteUrl}\nFare recalculated before booking.`;
  return `${mobile ? "https://wa.me/" : "https://web.whatsapp.com/send"}?text=${encodeURIComponent(message)}`;
}

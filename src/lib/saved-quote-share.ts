import type { SaveQuoteResult } from "./saved-quote-api";
export function savedQuoteWhatsAppUrl(result: SaveQuoteResult, mobile: boolean): string {
  const j = result.quote.journey;
  const message = `My Airport Taxi NI\n${j.pickupLabel} → ${j.dropoffLabel}\nVehicle: ${j.vehicle}\nQuoted fare: ${result.amountLabel}\nQuote reference: ${result.reference}\nReturn to my quote: ${result.quoteUrl}\nFare recalculated before booking.`;
  return `${mobile ? "https://wa.me/" : "https://web.whatsapp.com/send"}?text=${encodeURIComponent(message)}`;
}

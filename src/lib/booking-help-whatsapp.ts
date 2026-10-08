/**
 * WhatsApp booking-help support (error assistance only — not a primary booking CTA).
 */

import { SITE } from "@/lib/data";

export const BOOKING_HELP_WHATSAPP_MESSAGE =
  "Hi, I'm having trouble completing my online booking on the My Airport Taxi NI website. Can you help?";

/** Prefills the support message only — never includes customer PII or addresses. */
export function bookingHelpWhatsAppUrl(
  message: string = BOOKING_HELP_WHATSAPP_MESSAGE,
): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
}

/**
 * Same company WhatsApp number. Includes only the addresses the customer typed
 * so the team can price a journey the website could not verify.
 */
export function manualAddressQuoteWhatsAppUrl(pickup: string, dropoff: string): string {
  const lines = [
    "Hi My Airport Taxi NI, please quote this transfer. The address could not be verified online.",
    pickup.trim() ? `Pickup: ${pickup.trim()}` : "",
    dropoff.trim() ? `Destination: ${dropoff.trim()}` : "",
  ].filter(Boolean);
  return bookingHelpWhatsAppUrl(lines.join("\n"));
}

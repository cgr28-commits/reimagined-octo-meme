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
  const number = SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

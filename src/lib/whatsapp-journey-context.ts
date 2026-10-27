"use client";

/**
 * The journey the customer is currently quoting, so every WhatsApp link to the
 * quote assistant (floating QR, header icon, "Need help?") can pre-fill it.
 * The assistant reads this exact layout and replies with "Reply YES for your price".
 */
import { useSyncExternalStore } from "react";
import { whatsAppAssistantChatUrl } from "@/lib/contact-card";

export type WhatsAppJourney = {
  pickup: string;
  dropoff: string;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean | null;
  returnDate?: string;
  returnTime?: string;
  passengers?: number | null;
  suitcases?: number | null;
};

let current: WhatsAppJourney | null = null;
const listeners = new Set<() => void>();

export function setWhatsAppJourney(journey: WhatsAppJourney | null): void {
  const next = journey && journey.pickup.trim() && journey.dropoff.trim() ? journey : null;
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWhatsAppJourney(): WhatsAppJourney | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

function when(date?: string, time?: string): string {
  return [date?.trim(), time?.trim()].filter(Boolean).join(" at ");
}

/** First line of the quote card's "Send this quote to my WhatsApp" message: the assistant prices it straight away. */
export const WHATSAPP_SEND_QUOTE_HEADER = "Hi, please send me this quote:";

export function buildWhatsAppJourneyMessage(
  journey: WhatsAppJourney,
  header = "Hi, I'd like a price for this journey:",
): string {
  const lines = [
    header,
    `From: ${journey.pickup.trim()}`,
    `To: ${journey.dropoff.trim()}`,
  ];
  const outbound = when(journey.tripDate, journey.tripTime);
  if (outbound) lines.push(`Date: ${outbound}`);
  if (journey.returnJourney) {
    const back = when(journey.returnDate, journey.returnTime);
    lines.push(back ? `Return: ${back}` : "Return journey");
  } else if (journey.returnJourney === false) {
    lines.push("One way");
  }
  if (journey.passengers) lines.push(`Passengers: ${journey.passengers}`);
  if (journey.suitcases != null) lines.push(`Suitcases: ${journey.suitcases}`);
  return lines.join("\n");
}

/** Quote card: send the priced journey to the assistant, which replies with the booking link. */
export function whatsAppSendQuoteHref(journey: WhatsAppJourney): string {
  return whatsAppAssistantChatUrl(buildWhatsAppJourneyMessage(journey, WHATSAPP_SEND_QUOTE_HEADER));
}

/** Assistant chat link, pre-filled with the journey being quoted when there is one. */
export function useWhatsAppAssistantHref(): string {
  const journey = useWhatsAppJourney();
  return journey ? whatsAppAssistantChatUrl(buildWhatsAppJourneyMessage(journey)) : whatsAppAssistantChatUrl();
}

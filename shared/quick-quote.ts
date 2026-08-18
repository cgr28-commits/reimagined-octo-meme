/**
 * Quick Quote — owner-pasted WhatsApp → fixed website fare → customer booking link.
 * Amount always lives in KV; browsers never decide the price.
 */

import { INSTANT_QUOTE_MAX_PASSENGERS } from "./passenger-limits";

export const QUICK_QUOTE_MAX_PASSENGERS = INSTANT_QUOTE_MAX_PASSENGERS; // 4
export const QUICK_QUOTE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const QUICK_QUOTE_CREATE_RATE_LIMIT = 30; // per owner key per hour

export type QuickQuoteAirportCode = "BFS" | "BHD" | "DUB";

export type QuickQuoteStatus =
  | "open"
  | "checkout_created"
  | "paid"
  | "expired"
  | "cancelled";

export type QuickQuoteJourney = {
  pickupAddress: string;
  dropoffAddress: string;
  airportCode?: QuickQuoteAirportCode | null;
  fromAirport?: boolean;
  returnJourney: boolean;
  outboundDate: string;
  outboundTime: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  childSeatRequired?: boolean;
  flightNumber?: string;
  returnFlightNumber?: string;
  vehicleType?: string;
};

export type QuickQuoteRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: QuickQuoteStatus;
  journey: QuickQuoteJourney;
  /** Authoritative fixed fare at link creation (GBP). */
  quotedAmount: number;
  quotedAmountLabel: string;
  /** Optional audit — pricing engine source tag. */
  pricingSource: "website-pricing-engine";
  pricingVersion?: string;
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  paymentReference?: string;
  paidAt?: string;
  createdByOwner?: boolean;
};

export type QuickQuotePublicSummary = {
  id: string;
  status: QuickQuoteStatus;
  expiresAt: string;
  expired: boolean;
  quotedAmount: number;
  quotedAmountLabel: string;
  journey: QuickQuoteJourney;
};

export function quickQuoteKey(id: string): string {
  return `quick-quote:id:${id.trim().toLowerCase()}`;
}

export function quickQuoteRateLimitKey(ownerKeyHash: string): string {
  return `quick-quote:rate:${ownerKeyHash}`;
}

/** Opaque unguessable token (~192 bits hex). */
export function generateQuickQuoteId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeQuickQuoteId(id: string): string {
  return id.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
}

export function isQuickQuoteExpired(record: Pick<QuickQuoteRecord, "expiresAt" | "status">): boolean {
  if (record.status === "expired" || record.status === "cancelled" || record.status === "paid") {
    return record.status === "expired" || record.status === "cancelled";
  }
  const expires = Date.parse(record.expiresAt);
  return Number.isFinite(expires) && expires <= Date.now();
}

export function formatQuickQuoteAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (!Number.isFinite(rounded)) return "£—";
  return `£${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)}`;
}

export function buildQuickQuoteCustomerPath(id: string): string {
  return `/book-quote/?id=${encodeURIComponent(normalizeQuickQuoteId(id))}`;
}

export function buildQuickQuoteCustomerUrl(id: string, siteOrigin = "https://www.myairporttaxini.co.uk"): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return `${origin}${buildQuickQuoteCustomerPath(id)}`;
}

export function buildQuickQuoteWhatsAppReply(input: {
  amountLabel: string;
  bookingUrl: string;
}): string {
  return (
    `Hi, thanks for contacting My Airport Taxi NI.\n\n` +
    `Your fixed fare for this journey is ${input.amountLabel}.\n\n` +
    `You can review the journey details, confirm your booking and pay securely here:\n\n` +
    `${input.bookingUrl}`
  );
}

export function toQuickQuotePublicSummary(record: QuickQuoteRecord): QuickQuotePublicSummary {
  const expired = isQuickQuoteExpired(record);
  return {
    id: record.id,
    status: expired && record.status === "open" ? "expired" : record.status,
    expiresAt: record.expiresAt,
    expired: expired || record.status === "expired",
    quotedAmount: record.quotedAmount,
    quotedAmountLabel: record.quotedAmountLabel,
    journey: record.journey,
  };
}

export function quickQuoteAmountsEqual(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 100) / 100 - Math.round(b * 100) / 100) < 0.005;
}

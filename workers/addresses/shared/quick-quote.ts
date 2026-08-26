/**
 * Quick Quote — owner-pasted WhatsApp → fixed website fare → customer booking link.
 * Amount always lives in KV; browsers never decide the price.
 *
 * Owner/Driver-only extensions (not public Live Quote):
 * - Manual Saloon | Minibus vehicle choice (Minibus uses existing central pricing)
 * - Optional discretionary discount AFTER the canonical fare is calculated
 */

import {
  INSTANT_QUOTE_MAX_PASSENGERS,
  OWNER_QUICK_QUOTE_MAX_PASSENGERS,
} from "./passenger-limits";
import {
  composeFareWithExpressDropOff,
  resolveExpressDropOff,
  toExpressDropOffPersistedFields,
  type ExpressDropOffPersistedFields,
  type ExpressDropOffSelection,
} from "./express-drop-off";

/** Saloon / Estate public-style capacity (instant quote band). */
export const QUICK_QUOTE_SALOON_MAX_PASSENGERS = INSTANT_QUOTE_MAX_PASSENGERS; // 4
/** Minibus capacity — Owner/Driver Quick Quote only (not public Live Quote). */
export const QUICK_QUOTE_MINIBUS_MAX_PASSENGERS = OWNER_QUICK_QUOTE_MAX_PASSENGERS; // 7
/** @deprecated Prefer QUICK_QUOTE_SALOON_MAX_PASSENGERS / vehicle-aware helpers. */
export const QUICK_QUOTE_MAX_PASSENGERS = QUICK_QUOTE_SALOON_MAX_PASSENGERS;
export const QUICK_QUOTE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const QUICK_QUOTE_CREATE_RATE_LIMIT = 30; // per owner key per hour

/**
 * Owner/Driver Quick Quote vehicle choice.
 * Minibus is NOT advertised on the public site as MATNI-owned fleet —
 * QQ may price partner / subcontract minibus work via existing multipliers.
 */
export type QuickQuoteVehicleChoice = "Saloon" | "Minibus";

export type QuickQuoteDiscountType = "none" | "percent" | "fixed";

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
  /** Resolved vehicle label from the pricing engine (Saloon / Estate / Minibus). */
  vehicleType?: string;
  /** Owner/Driver manual choice when set (Saloon | Minibus). */
  vehicleChoice?: QuickQuoteVehicleChoice;
  /** Express Drop-Off: customer/owner choice (default true when eligible). */
  expressDropOffSelected?: boolean;
  /** Fee charged in GBP (0 when not eligible or not selected). */
  expressDropOffFee?: number;
  /** Airport the optional Express Drop-Off relates to. */
  expressDropOffAirport?: "BFS" | "BHD" | null;
};

export type QuickQuoteRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: QuickQuoteStatus;
  journey: QuickQuoteJourney;
  /**
   * Customer-facing fare (GBP) after any Owner/Driver discretionary discount.
   * This is what the customer pays and what SumUp is charged.
   */
  quotedAmount: number;
  quotedAmountLabel: string;
  /**
   * Canonical pricing-engine fare BEFORE discretionary discount.
   * Equals quotedAmount when discountType is none.
   */
  calculatedAmount?: number;
  calculatedAmountLabel?: string;
  /** Discretionary discount (Owner/Driver override — not the return-journey engine discount). */
  discountType?: QuickQuoteDiscountType;
  /** Percent (0–100) or fixed GBP, depending on discountType. */
  discountValue?: number;
  /** Absolute GBP taken off calculatedAmount. */
  discountAmount?: number;
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

export function parseQuickQuoteVehicleChoice(value: unknown): QuickQuoteVehicleChoice {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "minibus" || raw.includes("minibus")) return "Minibus";
  return "Saloon";
}

export function quickQuoteMaxPassengersForVehicle(choice: QuickQuoteVehicleChoice): number {
  return choice === "Minibus"
    ? QUICK_QUOTE_MINIBUS_MAX_PASSENGERS
    : QUICK_QUOTE_SALOON_MAX_PASSENGERS;
}

export function quickQuotePassengerOptions(choice: QuickQuoteVehicleChoice): number[] {
  const max = quickQuoteMaxPassengersForVehicle(choice);
  return Array.from({ length: max }, (_, i) => i + 1);
}

export function roundQuickQuoteGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

/**
 * Apply an Owner/Driver discretionary discount AFTER the canonical fare.
 * Does not alter the pricing engine. Never returns a negative customer fare.
 * Return-journey engine discount (5%) stays inside calculatedFare — this is separate.
 */
export function applyQuickQuoteManualDiscount(
  calculatedFare: number,
  discountType: QuickQuoteDiscountType = "none",
  discountValue = 0,
): {
  calculatedFare: number;
  discountType: QuickQuoteDiscountType;
  discountValue: number;
  discountAmount: number;
  customerFare: number;
} {
  const calculated = roundQuickQuoteGbp(Math.max(0, Number(calculatedFare) || 0));
  let type: QuickQuoteDiscountType =
    discountType === "percent" || discountType === "fixed" ? discountType : "none";
  let value = Number(discountValue);
  if (!Number.isFinite(value) || value < 0) value = 0;

  if (type === "percent") {
    value = Math.min(100, value);
  }

  let discountAmount = 0;
  if (type === "percent" && value > 0) {
    discountAmount = roundQuickQuoteGbp(calculated * (value / 100));
  } else if (type === "fixed" && value > 0) {
    discountAmount = roundQuickQuoteGbp(value);
  }

  // Never exceed the calculated fare (no negative customer price).
  discountAmount = Math.min(discountAmount, calculated);
  const customerFare = roundQuickQuoteGbp(Math.max(0, calculated - discountAmount));

  if (type === "none" || discountAmount <= 0) {
    return {
      calculatedFare: calculated,
      discountType: "none",
      discountValue: 0,
      discountAmount: 0,
      customerFare: calculated,
    };
  }

  return {
    calculatedFare: calculated,
    discountType: type,
    discountValue: roundQuickQuoteGbp(value),
    discountAmount,
    customerFare,
  };
}

export function parseQuickQuoteDiscountType(value: unknown): QuickQuoteDiscountType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "percent" || raw === "percentage" || raw === "%") return "percent";
  if (raw === "fixed" || raw === "amount" || raw === "gbp" || raw === "£") return "fixed";
  return "none";
}

/** Engine fare used for re-validation (falls back to quotedAmount for legacy records). */
export function quickQuoteCalculatedAmount(record: Pick<QuickQuoteRecord, "quotedAmount" | "calculatedAmount">): number {
  if (typeof record.calculatedAmount === "number" && Number.isFinite(record.calculatedAmount)) {
    return roundQuickQuoteGbp(record.calculatedAmount);
  }
  return roundQuickQuoteGbp(record.quotedAmount);
}

/**
 * Transfer fare after discretionary discount (excludes Express Drop-Off).
 * Used so customer Express choice can be reapplied without trusting browser totals.
 */
export function quickQuoteTransferFareGbp(record: QuickQuoteRecord): number {
  const calculated = quickQuoteCalculatedAmount(record);
  // Legacy records may have baked Express into quotedAmount without calculatedAmount.
  // Prefer calculatedAmount path; when missing, peel any stored Express fee off quotedAmount.
  if (
    typeof record.calculatedAmount !== "number" ||
    !Number.isFinite(record.calculatedAmount)
  ) {
    const storedFee =
      typeof record.journey.expressDropOffFee === "number" &&
      Number.isFinite(record.journey.expressDropOffFee)
        ? roundQuickQuoteGbp(Math.max(0, record.journey.expressDropOffFee))
        : 0;
    return roundQuickQuoteGbp(Math.max(0, record.quotedAmount - storedFee));
  }
  return applyQuickQuoteManualDiscount(
    calculated,
    record.discountType ?? "none",
    record.discountValue ?? 0,
  ).customerFare;
}

/**
 * Authoritative Quick Quote checkout total for a customer Express Drop-Off choice.
 * Ignores any client-supplied fee/total — only the boolean selection is used.
 */
export function resolveQuickQuoteCheckoutAmount(
  record: QuickQuoteRecord,
  expressDropOffSelected?: boolean | null,
): {
  transferFareGbp: number;
  express: ExpressDropOffSelection;
  totalGbp: number;
  persisted: ExpressDropOffPersistedFields;
} {
  const transferFareGbp = quickQuoteTransferFareGbp(record);
  const express = resolveExpressDropOff({
    airportCode: record.journey.airportCode,
    fromAirport: record.journey.fromAirport,
    returnJourney: record.journey.returnJourney,
    selected: expressDropOffSelected,
  });
  const composed = composeFareWithExpressDropOff({
    transferFareGbp,
    expressDropOffFeeGbp: express.feeGbp,
  });
  return {
    transferFareGbp,
    express,
    totalGbp: composed.totalGbp,
    persisted: toExpressDropOffPersistedFields(express),
  };
}

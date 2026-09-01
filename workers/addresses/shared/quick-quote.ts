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
export const QUICK_QUOTE_TTL_SECONDS = 60 * 60 * 24; // 24 hours (legacy default when validity omitted)
export const QUICK_QUOTE_CREATE_RATE_LIMIT = 30; // per owner key per hour
/** Keep timed Quick Quote KV records for this long after expiresAt (audit / late finalize). */
export const QUICK_QUOTE_EXPIRED_RETENTION_SECONDS = 60 * 60 * 24 * 7;
/**
 * Cloudflare KV maximum expirationTtl (1 year).
 * Long-validity quotes use up to this cap; no-expiry quotes omit TTL entirely.
 */
export const QUICK_QUOTE_KV_MAX_EXPIRATION_TTL_SECONDS = 60 * 60 * 24 * 365;
/** Manual transfer fare bounds (GBP) before discount. */
export const QUICK_QUOTE_MANUAL_FARE_MIN_GBP = 1;
export const QUICK_QUOTE_MANUAL_FARE_MAX_GBP = 5000;
/** Final transfer fare after discount must stay at or above this. */
export const QUICK_QUOTE_MIN_TRANSFER_FARE_GBP = 1;

/**
 * Owner/Driver Quick Quote vehicle choice.
 * Minibus is NOT advertised on the public site as MATNI-owned fleet —
 * QQ may price partner / subcontract minibus work via existing multipliers.
 */
export type QuickQuoteVehicleChoice = "Saloon" | "Minibus";

export type QuickQuoteDiscountType = "none" | "percent" | "fixed";

/** Owner create: website engine vs typed transfer fare. */
export type QuickQuotePriceSource = "website-pricing-engine" | "owner-manual";

/**
 * Link validity for new Quick Quotes.
 * `none` = no expiry (default in the current owner UI).
 * When `validityMode` is omitted by an older client, the Worker keeps the legacy 24h TTL.
 */
export type QuickQuoteValidityMode = "none" | "24h" | "7d" | "30d" | "custom";

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
  /**
   * ISO expiry timestamp, or `null` when the link has no time limit.
   * Legacy records always have a string.
   */
  expiresAt: string | null;
  status: QuickQuoteStatus;
  journey: QuickQuoteJourney;
  /**
   * Customer-facing fare (GBP) after any Owner/Driver discretionary discount.
   * This is what the customer pays and what SumUp is charged (plus Express when selected).
   */
  quotedAmount: number;
  quotedAmountLabel: string;
  /**
   * Transfer fare BEFORE discretionary discount (website engine or owner-manual entry).
   * Equals the pre-discount transfer amount when discountType is none.
   */
  calculatedAmount?: number;
  calculatedAmountLabel?: string;
  /** Discretionary discount (Owner/Driver override — not the return-journey engine discount). */
  discountType?: QuickQuoteDiscountType;
  /** Percent (0–100) or fixed GBP, depending on discountType. */
  discountValue?: number;
  /** Absolute GBP taken off calculatedAmount. */
  discountAmount?: number;
  /** Audit — how the transfer fare was set. */
  pricingSource: QuickQuotePriceSource;
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
  expiresAt: string | null;
  expired: boolean;
  quotedAmount: number;
  quotedAmountLabel: string;
  journey: QuickQuoteJourney;
  pricingSource?: QuickQuotePriceSource;
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
  // No time limit — stays open until paid / cancelled.
  if (record.expiresAt == null || record.expiresAt === "") {
    return false;
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
    pricingSource: record.pricingSource,
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

export function parseQuickQuotePriceSource(value: unknown): QuickQuotePriceSource {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "owner-manual" ||
    raw === "manual" ||
    raw === "owner_manual" ||
    raw === "manual-price"
  ) {
    return "owner-manual";
  }
  return "website-pricing-engine";
}

export function parseQuickQuoteValidityMode(value: unknown): QuickQuoteValidityMode | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "none" || raw === "no_limit" || raw === "no-limit" || raw === "unlimited") {
    return "none";
  }
  if (raw === "24h" || raw === "24" || raw === "day") return "24h";
  if (raw === "7d" || raw === "7" || raw === "week") return "7d";
  if (raw === "30d" || raw === "30" || raw === "month") return "30d";
  if (raw === "custom") return "custom";
  return null;
}

/**
 * Resolve KV / record TTL for a new Quick Quote.
 * - `null` → no expiry (store without KV expiration)
 * - number → seconds until expiry
 * - When both `validityMode` and `ttlSeconds` are omitted → legacy 24h default
 */
export function resolveQuickQuoteTtlSeconds(input: {
  validityMode?: unknown;
  validityDays?: unknown;
  ttlSeconds?: unknown;
}): number | null {
  const mode = parseQuickQuoteValidityMode(input.validityMode);
  const hasLegacyTtl =
    input.ttlSeconds != null && String(input.ttlSeconds).trim() !== "";

  if (mode == null && !hasLegacyTtl) {
    // Older clients that never send validityMode keep the historic 24h default.
    return QUICK_QUOTE_TTL_SECONDS;
  }

  if (mode === "none") {
    return null;
  }
  if (mode === "24h") {
    return 60 * 60 * 24;
  }
  if (mode === "7d") {
    return 60 * 60 * 24 * 7;
  }
  if (mode === "30d") {
    return 60 * 60 * 24 * 30;
  }
  if (mode === "custom") {
    const days = Math.floor(Number(input.validityDays));
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error("Custom validity must be between 1 and 365 days.");
    }
    return days * 60 * 60 * 24;
  }

  // Explicit ttlSeconds from a client that skipped validityMode.
  const ttl = Math.floor(Number(input.ttlSeconds));
  if (!Number.isFinite(ttl) || ttl < 60) {
    return QUICK_QUOTE_TTL_SECONDS;
  }
  return Math.min(ttl, 60 * 60 * 24 * 365);
}

/**
 * Validate an owner-entered transfer fare (before discount). £1–£5,000.
 */
export function parseQuickQuoteManualTransferFare(
  value: unknown,
): { ok: true; amount: number } | { ok: false; message: string } {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return { ok: false, message: "Enter a valid manual transfer price in GBP." };
  }
  const rounded = roundQuickQuoteGbp(amount);
  if (rounded < QUICK_QUOTE_MANUAL_FARE_MIN_GBP || rounded > QUICK_QUOTE_MANUAL_FARE_MAX_GBP) {
    return {
      ok: false,
      message: `Manual transfer price must be between £${QUICK_QUOTE_MANUAL_FARE_MIN_GBP} and £${QUICK_QUOTE_MANUAL_FARE_MAX_GBP.toLocaleString("en-GB")}.`,
    };
  }
  return { ok: true, amount: rounded };
}

export function assertQuickQuoteTransferFareFloor(
  transferFareGbp: number,
): { ok: true } | { ok: false; message: string } {
  const amount = roundQuickQuoteGbp(transferFareGbp);
  if (!Number.isFinite(amount) || amount < QUICK_QUOTE_MIN_TRANSFER_FARE_GBP) {
    return {
      ok: false,
      message: `Final transfer price must be at least £${QUICK_QUOTE_MIN_TRANSFER_FARE_GBP}.`,
    };
  }
  return { ok: true };
}

/**
 * Approved stored base fare from KV (falls back to quotedAmount for legacy records).
 * Checkout must use this — never re-run the website engine without route metrics.
 */
export function quickQuoteCalculatedAmount(record: Pick<QuickQuoteRecord, "quotedAmount" | "calculatedAmount">): number {
  if (typeof record.calculatedAmount === "number" && Number.isFinite(record.calculatedAmount)) {
    return roundQuickQuoteGbp(record.calculatedAmount);
  }
  return roundQuickQuoteGbp(record.quotedAmount);
}

/** True when a stored Quick Quote base fare is finite and within the approved £1–£5,000 band. */
export function isApprovedQuickQuoteStoredFare(amount: number): boolean {
  return (
    Number.isFinite(amount) &&
    amount >= QUICK_QUOTE_MANUAL_FARE_MIN_GBP &&
    amount <= QUICK_QUOTE_MANUAL_FARE_MAX_GBP
  );
}

/**
 * Accounting field for checkout: only website-engine quotes expose a standard website amount.
 * Owner-manual quotes leave this undefined so the manual fare is not mislabelled.
 */
export function quickQuoteCheckoutStandardWebsiteAmount(
  record: Pick<QuickQuoteRecord, "pricingSource" | "quotedAmount" | "calculatedAmount">,
): number | undefined {
  if (record.pricingSource !== "website-pricing-engine") return undefined;
  const amount = quickQuoteCalculatedAmount(record);
  return isApprovedQuickQuoteStoredFare(amount) ? amount : undefined;
}

/**
 * KV `expirationTtl` for a timed Quick Quote, or `undefined` when the record
 * should be stored with no KV expiration (no time limit).
 *
 * Retention is time-until-expiresAt plus a 7-day grace window, capped only by
 * Cloudflare's 365-day max TTL — never by the legacy 24h+7d (8-day) ceiling.
 */
export function quickQuoteKvExpirationTtlSeconds(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (expiresAt == null || expiresAt === "") return undefined;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return QUICK_QUOTE_TTL_SECONDS + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS;
  }
  const secondsUntilExpiry = Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
  const withGrace = secondsUntilExpiry + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS;
  return Math.max(60, Math.min(withGrace, QUICK_QUOTE_KV_MAX_EXPIRATION_TTL_SECONDS));
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

/**
 * Single source of truth for the public-website return-journey discount rate.
 * Used by:
 * - public quote calculator (`point-to-point-premium` / PRICING_CONFIG)
 * - Personal Quote checkout (Worker + shared helpers)
 *
 * Change `shared/return-journey-discount-rate.json` only — both paths pick it up.
 */

import rates from "./return-journey-discount-rate.json";

export const RETURN_JOURNEY_DISCOUNT_RATE = Number(rates.returnJourneyDiscountRate);

/**
 * The automatic 5% return-booking discount was retired on the owner's instruction (Nov 2026)
 * and replaced by email promo codes (shared/promo-code.ts). The live rate above is now 0.
 * This legacy rate is used ONLY to honour prices already agreed before the change: Personal
 * Quotes and saved quotes created before it carry no `returnDiscountRate` stamp.
 */
export const LEGACY_RETURN_JOURNEY_DISCOUNT_RATE = 0.05;

/**
 * True while the retired discount must stay switched off, whatever an older stored owner
 * pricing setting says. Set to false (and restore the JSON rate) to bring it back.
 */
export const RETURN_BOOKING_DISCOUNT_RETIRED = true;

/** Rate for a record created before/after the retirement (missing stamp = legacy price). */
export function returnDiscountRateForRecord(record: { returnDiscountRate?: number | null } | null | undefined): number {
  const stamped = Number(record?.returnDiscountRate);
  return Number.isFinite(stamped) && stamped >= 0 && stamped < 1 ? stamped : LEGACY_RETURN_JOURNEY_DISCOUNT_RATE;
}

/** e.g. 0.05 → "5%", 0.10 → "10%" — for customer-facing copy. */
export function formatReturnJourneyDiscountPercent(
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): string {
  const pct = Math.round(Number(rate) * 100);
  if (!Number.isFinite(pct) || pct < 0) {
    return "0%";
  }
  return `${pct}%`;
}

export function getWebsiteReturnJourneyFare(
  oneWayFare: number,
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): number {
  const oneWay = Math.round(Number(oneWayFare) * 100) / 100;
  if (!Number.isFinite(oneWay) || oneWay < 0) {
    return NaN;
  }
  const discountRate = Number.isFinite(rate) ? rate : RETURN_JOURNEY_DISCOUNT_RATE;
  return Math.round(oneWay * 2 * (1 - discountRate) * 100) / 100;
}

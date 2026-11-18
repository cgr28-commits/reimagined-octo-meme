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

/** Preserve existing discounted quotes created before an owner changes the configured rate. */
export const LEGACY_RETURN_JOURNEY_DISCOUNT_RATE = 0.05;

/** Automatic return discount is enabled at the configured public rate. */
export const RETURN_BOOKING_DISCOUNT_RETIRED = false;

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

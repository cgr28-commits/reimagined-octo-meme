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

export function getWebsiteReturnJourneyFare(oneWayFare: number): number {
  const oneWay = Math.round(Number(oneWayFare) * 100) / 100;
  if (!Number.isFinite(oneWay) || oneWay < 0) {
    return NaN;
  }
  return Math.round(oneWay * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE) * 100) / 100;
}

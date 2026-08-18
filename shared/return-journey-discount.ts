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

export function getWebsiteReturnJourneyFare(oneWayFare: number): number {
  const oneWay = Math.round(Number(oneWayFare) * 100) / 100;
  if (!Number.isFinite(oneWay) || oneWay < 0) {
    return NaN;
  }
  return Math.round(oneWay * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE) * 100) / 100;
}

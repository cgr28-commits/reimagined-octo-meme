import { londonWeekday, wallClockMinutes } from "../../shared/uk-time";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../../shared/return-journey-discount";
import {
  ownerPricingEngineOptions,
  surchargeRateForDateTime,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import type { OwnerPricingSettings } from "../../shared/owner-pricing-config";
import { PRICING_CONFIG } from "./pricing-config";

export {
  NIGHT_WEEKEND_SURCHARGE_RATE,
  NIGHT_WEEKEND_SURCHARGE_LABEL,
  NIGHT_WEEKEND_SURCHARGE_EXPLANATION,
} from "../../shared/night-weekend-surcharge";

export type OwnerPricingEngineInput = OwnerPricingSettings | PublicOwnerPricingConfig;

/**
 * Evening, Night and Weekend surcharges on the journey/vehicle fare only.
 * Defaults: Mon–Fri Evening 20:00–23:00 at 10%, Night 23:00–06:00 at 20%,
 * and all day Saturday/Sunday at the configured Weekend rate (Europe/London).
 */
export const TRIP_PREMIUM_RATE = PRICING_CONFIG.addressToAddressTripPremiumRate;

/** Public + Personal Quote return discount — from shared/return-journey-discount-rate.json (exactly 5%). */
export { RETURN_JOURNEY_DISCOUNT_RATE };

/** Airport transfers use the same Evening, Night and Weekend bands as address-to-address. */
export const AIRPORT_TRIP_PREMIUM_RATE = PRICING_CONFIG.airportTripPremiumRate;

/** @deprecated Use TRIP_PREMIUM_RATE */
export const POINT_TO_POINT_PREMIUM_RATE = TRIP_PREMIUM_RATE;

export type TripSchedule = {
  outboundDate?: string;
  outboundTime?: string;
  returnDate?: string;
  returnTime?: string;
  returnJourney?: boolean;
};

function parseLocalDateTime(date: string, time: string): { day: number; minutes: number } | null {
  if (!date || !time) {
    return null;
  }

  const day = londonWeekday(date);
  const minutes = wallClockMinutes(time);
  if (day === null || minutes === null) {
    return null;
  }

  return { day, minutes };
}

/**
 * Premium window in Europe/London wall-clock time.
 * Weekend days, plus weekday Evening and Night. Daytime bank holidays are not extra.
 */
export function isTripPremiumDateTime(
  date: string,
  time: string,
  pricing?: OwnerPricingEngineInput | null,
): boolean {
  const parsed = parseLocalDateTime(date, time);
  if (!parsed) {
    return false;
  }

  const options = ownerPricingEngineOptions(pricing ?? null);
  const rules = {
    eveningEnabled: options.eveningEnabled,
    eveningStartMinutes: options.eveningStartMinutes,
    eveningEndMinutes: options.eveningEndMinutes,
    nightEnabled: options.nightEnabled,
    nightStartMinutes: options.nightStartMinutes,
    nightEndMinutes: options.nightEndMinutes,
    weekendEnabled: options.weekendEnabled,
    weekendDays: options.weekendDays,
  };

  return (
    surchargeRateForDateTime({
      day: parsed.day,
      minutes: parsed.minutes,
      eveningRate: options.eveningRate,
      nightRate: options.nightRate,
      weekendRate: options.weekendRate,
      rules,
    }) > 0
  );
}

/** @deprecated Use isTripPremiumDateTime */
export function isPointToPointPremiumDateTime(date: string, time: string): boolean {
  return isTripPremiumDateTime(date, time);
}

export function applyReturnJourneyDiscount(
  amount: number,
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): number {
  const discountRate = Number.isFinite(rate) ? rate : RETURN_JOURNEY_DISCOUNT_RATE;
  return amount * (1 - discountRate);
}

export function getReturnJourneyFare(
  oneWayFare: number,
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): number {
  return applyReturnJourneyDiscount(oneWayFare * 2, rate);
}

/**
 * Authoritative journey/vehicle total (before airport fixed costs / Express).
 *
 * Order (do not invert):
 * 1. One-way base journey fare for each leg (Estate uplift already in `oneWayFare`)
 * 2. If return: 5% off the combined BASE journey total only
 * 3. Evening, Night or Weekend surcharge on each qualifying leg, from the
 *    ORIGINAL undiscounted base fare (never from the post-5% amount).
 *    Evening and Night are mutually exclusive. Weekend uses the higher rate
 *    when it overlaps one of those bands.
 *
 * Airport/barrier/Express charges are added later and never enter this function.
 */
export type ApplyTripPremiumOptions = {
  pricing?: OwnerPricingEngineInput | null;
  returnDiscountRate?: number;
  /**
   * Return-leg one-way fare when it differs from the outbound fare.
   * Omitted means both legs use `oneWayFare`, which keeps the existing
   * `oneWay × 2` return calculation.
   */
  returnOneWayFare?: number;
};

export function applyTripPremium(
  oneWayFare: number,
  schedule: TripSchedule,
  premiumRate: number = TRIP_PREMIUM_RATE,
  options?: ApplyTripPremiumOptions,
): { total: number; premiumApplied: boolean; premiumAmount: number; returnDiscountApplied: boolean } {
  const pricingOptions = ownerPricingEngineOptions(options?.pricing ?? null);
  const returnRate =
    options?.returnDiscountRate ??
    pricingOptions.returnDiscountRate ??
    RETURN_JOURNEY_DISCOUNT_RATE;
  const eveningRate = pricingOptions.eveningRate;
  const nightRate = pricingOptions.nightRate;
  const weekendRate = pricingOptions.weekendRate;
  const rules = {
    eveningEnabled: pricingOptions.eveningEnabled,
    eveningStartMinutes: pricingOptions.eveningStartMinutes,
    eveningEndMinutes: pricingOptions.eveningEndMinutes,
    nightEnabled: pricingOptions.nightEnabled,
    nightStartMinutes: pricingOptions.nightStartMinutes,
    nightEndMinutes: pricingOptions.nightEndMinutes,
    weekendEnabled: pricingOptions.weekendEnabled,
    weekendDays: pricingOptions.weekendDays,
  };
  void premiumRate;

  const rateFor = (date?: string, time?: string): number => {
    if (!date || !time) return 0;
    const parsed = parseLocalDateTime(date, time);
    if (!parsed) return 0;
    return surchargeRateForDateTime({
      day: parsed.day,
      minutes: parsed.minutes,
      eveningRate,
      nightRate,
      weekendRate,
      rules,
    });
  };

  const outboundFare = oneWayFare;
  const returnFare =
    options?.returnOneWayFare != null && Number.isFinite(options.returnOneWayFare)
      ? options.returnOneWayFare
      : oneWayFare;

  let premiumAmount = 0;
  if (schedule.outboundDate && schedule.outboundTime) {
    premiumAmount += outboundFare * rateFor(schedule.outboundDate, schedule.outboundTime);
  }
  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    premiumAmount += returnFare * rateFor(schedule.returnDate, schedule.returnTime);
  }

  const discountedBase = schedule.returnJourney
    ? applyReturnJourneyDiscount(outboundFare + returnFare, returnRate)
    : outboundFare;
  const total = discountedBase + premiumAmount;

  return {
    total,
    premiumApplied: premiumAmount > 0,
    premiumAmount,
    returnDiscountApplied: Boolean(schedule.returnJourney),
  };
}

/** @deprecated Use applyTripPremium */
export function applyPointToPointPremium(
  oneWayFare: number,
  schedule: TripSchedule,
): { total: number; premiumApplied: boolean; premiumAmount: number } {
  return applyTripPremium(oneWayFare, schedule);
}

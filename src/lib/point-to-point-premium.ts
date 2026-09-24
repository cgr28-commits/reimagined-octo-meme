import { londonWeekday, wallClockMinutes } from "../../shared/uk-time";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../../shared/return-journey-discount";
import {
  defaultPremiumWindowRules,
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
 * Night & Weekend Surcharge (10%) on the journey/vehicle fare only.
 * Window: Mon–Fri 22:00–05:59, and all day Saturday/Sunday (Europe/London).
 */
export const TRIP_PREMIUM_RATE = PRICING_CONFIG.addressToAddressTripPremiumRate;

/** Public + Personal Quote return discount — from shared/return-journey-discount-rate.json (exactly 5%). */
export { RETURN_JOURNEY_DISCOUNT_RATE };

/** Airport transfers: same 10% Night & Weekend Surcharge as address-to-address. */
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
 * Night & Weekend window in Europe/London wall-clock time:
 * Sat/Sun 00:00–23:59; Mon–Fri 22:00–05:59. Daytime bank holidays are not extra.
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

  const options = pricing ? ownerPricingEngineOptions(pricing) : null;
  const rules = options
    ? {
        nightEnabled: options.nightEnabled,
        nightStartMinutes: options.nightStartMinutes,
        nightEndMinutes: options.nightEndMinutes,
        weekendEnabled: options.weekendEnabled,
        weekendDays: options.weekendDays,
      }
    : defaultPremiumWindowRules();

  return (
    surchargeRateForDateTime({
      day: parsed.day,
      minutes: parsed.minutes,
      nightRate: options?.nightRate ?? TRIP_PREMIUM_RATE,
      weekendRate: options?.weekendRate ?? TRIP_PREMIUM_RATE,
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
 * 1. One-way base journey fare for each leg (Estate +£6 already in `oneWayFare`)
 * 2. If return: 5% off the combined BASE journey total only
 * 3. +10% Night & Weekend Surcharge on each qualifying leg, from the
 *    ORIGINAL undiscounted base fare (never from the post-5% amount)
 *
 * Airport/barrier/Express charges are added later and never enter this function.
 */
export type ApplyTripPremiumOptions = {
  pricing?: OwnerPricingEngineInput | null;
  returnDiscountRate?: number;
};

export function applyTripPremium(
  oneWayFare: number,
  schedule: TripSchedule,
  premiumRate: number = TRIP_PREMIUM_RATE,
  options?: ApplyTripPremiumOptions,
): { total: number; premiumApplied: boolean; premiumAmount: number; returnDiscountApplied: boolean } {
  const pricingOptions = options?.pricing ? ownerPricingEngineOptions(options.pricing) : null;
  const returnRate =
    options?.returnDiscountRate ??
    pricingOptions?.returnDiscountRate ??
    RETURN_JOURNEY_DISCOUNT_RATE;
  const nightRate = pricingOptions?.nightRate ?? premiumRate;
  const weekendRate = pricingOptions?.weekendRate ?? premiumRate;
  const rules = pricingOptions
    ? {
        nightEnabled: pricingOptions.nightEnabled,
        nightStartMinutes: pricingOptions.nightStartMinutes,
        nightEndMinutes: pricingOptions.nightEndMinutes,
        weekendEnabled: pricingOptions.weekendEnabled,
        weekendDays: pricingOptions.weekendDays,
      }
    : defaultPremiumWindowRules();

  const rateFor = (date?: string, time?: string): number => {
    if (!date || !time) return 0;
    const parsed = parseLocalDateTime(date, time);
    if (!parsed) return 0;
    return surchargeRateForDateTime({
      day: parsed.day,
      minutes: parsed.minutes,
      nightRate,
      weekendRate,
      rules,
    });
  };

  let premiumAmount = 0;
  if (schedule.outboundDate && schedule.outboundTime) {
    premiumAmount += oneWayFare * rateFor(schedule.outboundDate, schedule.outboundTime);
  }
  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    premiumAmount += oneWayFare * rateFor(schedule.returnDate, schedule.returnTime);
  }

  const discountedBase = schedule.returnJourney
    ? applyReturnJourneyDiscount(oneWayFare * 2, returnRate)
    : oneWayFare;
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

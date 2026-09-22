import { londonWeekday, wallClockMinutes } from "../../shared/uk-time";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../../shared/return-journey-discount";
import { PRICING_CONFIG } from "./pricing-config";

export {
  NIGHT_WEEKEND_SURCHARGE_RATE,
  NIGHT_WEEKEND_SURCHARGE_LABEL,
  NIGHT_WEEKEND_SURCHARGE_EXPLANATION,
} from "../../shared/night-weekend-surcharge";

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
export function isTripPremiumDateTime(date: string, time: string): boolean {
  const parsed = parseLocalDateTime(date, time);
  if (!parsed) {
    return false;
  }

  const { day, minutes } = parsed;
  if (day === 0 || day === 6) {
    return true;
  }
  if (day >= 1 && day <= 5) {
    return minutes >= 22 * 60 || minutes < 6 * 60;
  }
  return false;
}

/** @deprecated Use isTripPremiumDateTime */
export function isPointToPointPremiumDateTime(date: string, time: string): boolean {
  return isTripPremiumDateTime(date, time);
}

export function applyReturnJourneyDiscount(amount: number): number {
  return amount * (1 - RETURN_JOURNEY_DISCOUNT_RATE);
}

export function getReturnJourneyFare(oneWayFare: number): number {
  return applyReturnJourneyDiscount(oneWayFare * 2);
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
export function applyTripPremium(
  oneWayFare: number,
  schedule: TripSchedule,
  premiumRate: number = TRIP_PREMIUM_RATE,
): { total: number; premiumApplied: boolean; premiumAmount: number; returnDiscountApplied: boolean } {
  let premiumAmount = 0;

  if (schedule.outboundDate && schedule.outboundTime) {
    if (isTripPremiumDateTime(schedule.outboundDate, schedule.outboundTime)) {
      premiumAmount += oneWayFare * premiumRate;
    }
  }

  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    if (isTripPremiumDateTime(schedule.returnDate, schedule.returnTime)) {
      premiumAmount += oneWayFare * premiumRate;
    }
  }

  const discountedBase = schedule.returnJourney
    ? applyReturnJourneyDiscount(oneWayFare * 2)
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

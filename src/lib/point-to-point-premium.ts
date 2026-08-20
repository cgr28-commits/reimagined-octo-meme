import { londonWeekday, wallClockMinutes } from "../../shared/uk-time";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../../shared/return-journey-discount";
import { PRICING_CONFIG } from "./pricing-config";

/**
 * Weekend / Bank Holiday trip uplift rates (config). Live pricing sets these to 0 —
 * weekday and weekend use the same base fare. Engine kept for schedule helpers / tests.
 */
export const TRIP_PREMIUM_RATE = PRICING_CONFIG.addressToAddressTripPremiumRate;

/** Public + Personal Quote return discount — from shared/return-journey-discount-rate.json (exactly 5%). */
export { RETURN_JOURNEY_DISCOUNT_RATE };

/** Airport transfers: same schedule helpers as A2A; live rate is 0 (no weekend/BH surcharge). */
export const AIRPORT_TRIP_PREMIUM_RATE = PRICING_CONFIG.airportTripPremiumRate;

/** @deprecated Use TRIP_PREMIUM_RATE */
export const POINT_TO_POINT_PREMIUM_RATE = TRIP_PREMIUM_RATE;

/** Northern Ireland bank holidays (inclusive). Update annually. */
const NI_BANK_HOLIDAY_DATES = new Set([
  // 2025
  "2025-01-01",
  "2025-03-17",
  "2025-04-18",
  "2025-04-21",
  "2025-05-05",
  "2025-05-26",
  "2025-07-12",
  "2025-07-14",
  "2025-08-25",
  "2025-12-25",
  "2025-12-26",
  // 2026
  "2026-01-01",
  "2026-03-17",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-07-13",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  // 2027
  "2027-01-01",
  "2027-03-17",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-07-12",
  "2027-07-13",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

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

/** Premium window: after midnight Friday (Sat 00:00) through 6:30am Monday, plus all bank holidays. */
export function isTripPremiumDateTime(date: string, time: string): boolean {
  if (NI_BANK_HOLIDAY_DATES.has(date)) {
    return true;
  }

  const parsed = parseLocalDateTime(date, time);
  if (!parsed) {
    return false;
  }

  const { day, minutes } = parsed;
  const mondayCutoff = 6 * 60 + 30;

  if (day === 6 || day === 0) {
    return true;
  }

  if (day === 1 && minutes < mondayCutoff) {
    return true;
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

export function applyTripPremium(
  oneWayFare: number,
  schedule: TripSchedule,
  premiumRate: number = TRIP_PREMIUM_RATE,
): { total: number; premiumApplied: boolean; premiumAmount: number; returnDiscountApplied: boolean } {
  const baseTotal = schedule.returnJourney
    ? getReturnJourneyFare(oneWayFare)
    : oneWayFare;
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

  return {
    total: baseTotal + premiumAmount,
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

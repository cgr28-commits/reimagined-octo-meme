import { defaultSpecialDateFares, matchingSpecialDateFare, type FareEndpoints } from "../../shared/special-date-fares";
import { matchingEventVenuePickup } from "../../shared/event-venue-pickups";
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
  endpoints?: FareEndpoints;
  outboundFixedPostcode?: boolean;
  returnFixedPostcode?: boolean;
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
  return tripSurchargeRate(date, time, pricing) > 0;
}

function specialFareForLeg(
  date: string, time: string, endpoints: FareEndpoints, pricing?: OwnerPricingEngineInput | null,
) {
  const rules = pricing?.specialDateFares ?? defaultSpecialDateFares();
  const events = pricing?.eventVenuePickups ?? [];
  const configured = matchingSpecialDateFare(rules, date, time, endpoints, events);
  const pickup = matchingEventVenuePickup(events, rules, date + "T" + time, endpoints.pickup);
  return pickup && pickup.rate > (configured?.rate ?? 0) ? pickup : configured;
}

/** Highest applicable rate per leg. Fixed postcode fares only take special date rules. */
export function tripSurchargeRate(
  date: string,
  time: string,
  pricing?: OwnerPricingEngineInput | null,
  endpoints: FareEndpoints = {},
  fixedPostcode = false,
  fallbackRate = TRIP_PREMIUM_RATE,
): number {
  const parsed = parseLocalDateTime(date, time);
  if (!parsed) return 0;
  const special = specialFareForLeg(date, time, endpoints, pricing);
  if (fixedPostcode) return special?.rate ?? 0;
  const options = pricing ? ownerPricingEngineOptions(pricing) : null;
  const regular = surchargeRateForDateTime({
    ...parsed, date,
    christmasRate: options?.christmasRate ?? 0,
    eveningRate: options?.eveningRate ?? 0,
    nightRate: options?.nightRate ?? fallbackRate,
    weekendRate: options?.weekendRate ?? fallbackRate,
    rules: options ?? defaultPremiumWindowRules(),
  });
  return Math.max(regular, special?.rate ?? 0);
}

export function legSchedule(schedule: TripSchedule, returning: boolean): TripSchedule {
  const endpoints = schedule.endpoints;
  return {
    outboundDate: returning ? schedule.returnDate : schedule.outboundDate,
    outboundTime: returning ? schedule.returnTime : schedule.outboundTime,
    outboundFixedPostcode: returning ? schedule.returnFixedPostcode : schedule.outboundFixedPostcode,
    endpoints: returning ? { pickup: endpoints?.dropoff, dropoff: endpoints?.pickup } : endpoints,
    returnJourney: false,
  };
}

export function specialFareLabel(schedule: TripSchedule, pricing?: OwnerPricingEngineInput | null): string | undefined {
  const labels = new Set<string>();
  let hasSpecial = false;
  for (const returning of schedule.returnJourney ? [false, true] : [false]) {
    const leg = legSchedule(schedule, returning);
    const date = leg.outboundDate ?? "";
    const time = leg.outboundTime ?? "";
    const match = specialFareForLeg(date, time, leg.endpoints ?? {}, pricing);
    const rate = tripSurchargeRate(date, time, pricing, leg.endpoints, leg.outboundFixedPostcode);
    if (rate && match?.rate === rate) {
      hasSpecial = true;
      labels.add(`${match.name} ${Number((rate * 100).toFixed(2))}% surcharge`);
    } else if (rate) labels.add("Time surcharge");
  }
  return hasSpecial ? [...labels].join(" / ") : undefined;
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
 * 2. Add any qualifying time premiums to each leg's vehicle fare
 * 3. If return: 5% off the combined vehicle journey total, including premiums
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
  const pricingOptions = options?.pricing ? ownerPricingEngineOptions(options.pricing) : null;
  const returnRate =
    options?.returnDiscountRate ??
    pricingOptions?.returnDiscountRate ??
    RETURN_JOURNEY_DISCOUNT_RATE;
  const rateForLeg = (returning: boolean): number => {
    const leg = legSchedule(schedule, returning);
    return tripSurchargeRate(leg.outboundDate ?? "", leg.outboundTime ?? "", options?.pricing,
      leg.endpoints, leg.outboundFixedPostcode, premiumRate);
  };

  const outboundFare = oneWayFare;
  const returnFare =
    options?.returnOneWayFare != null && Number.isFinite(options.returnOneWayFare)
      ? options.returnOneWayFare
      : oneWayFare;

  let premiumAmount = 0;
  if (schedule.outboundDate && schedule.outboundTime) {
    premiumAmount += outboundFare * rateForLeg(false);
  }
  if (schedule.returnJourney && schedule.returnDate && schedule.returnTime) {
    premiumAmount += returnFare * rateForLeg(true);
  }

  const vehicleJourneyTotal = outboundFare + (schedule.returnJourney ? returnFare : 0) + premiumAmount;
  const total = schedule.returnJourney
    ? applyReturnJourneyDiscount(vehicleJourneyTotal, returnRate)
    : vehicleJourneyTotal;

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

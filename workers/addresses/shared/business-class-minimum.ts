/**
 * Shared one-way price floor for Business Class and the 7 Seater Minibus.
 *
 * The owner sets each amount in Pricing. £75 and £90 are only the starting
 * defaults. Calculate the normal one-way fare first (multiplier, surcharges,
 * airport charges, profitability). The minimum then raises that total; it is
 * not an extra charge, and airport access inside it is not added again.
 * Return bookings floor each leg, then apply the existing return discount once.
 */

import { roundCustomerPayableGbp, roundGbp } from "./gbp";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "./return-journey-discount";
import { isExecutiveVehicle } from "./executive-vehicle";
import { isMinibusVehicleType } from "./vehicle-display";

export const DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP = 75;
export const DEFAULT_MINIBUS_MINIMUM_FARE_GBP = 90;
export const MAX_BUSINESS_CLASS_MINIMUM_FARE_GBP = 2000;
export const MAX_MINIBUS_MINIMUM_FARE_GBP = MAX_BUSINESS_CLASS_MINIMUM_FARE_GBP;

export function applyBusinessClassOneWayFloor(
  normalOneWayGbp: number,
  minimumFareGbp: number,
): number {
  const normal = roundGbp(Math.max(0, Number(normalOneWayGbp) || 0));
  const minimum = roundGbp(Math.max(0, Number(minimumFareGbp) || 0));
  return Math.max(normal, minimum);
}

export type BusinessClassFareFloorInput = {
  minimumFareGbp: number;
  returnJourney: boolean;
  returnDiscountRate?: number;
  /** Journey + Night & Weekend + airport fixed costs, before access and before the return discount. */
  outboundOneWayBeforeAccessGbp: number;
  returnOneWayBeforeAccessGbp?: number;
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
};

/**
 * Whole-pound customer total after the Business Class floor.
 * Returns null when every leg is already at or above the minimum, so the
 * existing discount and airport rules stay exactly as they are.
 * Does not apply the minimum again after the return discount.
 */
export function businessClassFlooredPayableGbp(
  input: BusinessClassFareFloorInput,
): number | null {
  const minimum = roundGbp(Math.max(0, Number(input.minimumFareGbp) || 0));
  const outboundNormal = roundGbp(
    Math.max(0, Number(input.outboundOneWayBeforeAccessGbp) || 0) +
      Math.max(0, Number(input.outboundAirportAccessChargeGbp) || 0),
  );
  const outboundFloored = applyBusinessClassOneWayFloor(outboundNormal, minimum);
  if (!input.returnJourney) {
    if (outboundFloored <= outboundNormal + 0.001) return null;
    return roundCustomerPayableGbp(outboundFloored);
  }

  const returnNormal = roundGbp(
    Math.max(
      0,
      Number(input.returnOneWayBeforeAccessGbp ?? input.outboundOneWayBeforeAccessGbp) || 0,
    ) + Math.max(0, Number(input.returnAirportAccessChargeGbp) || 0),
  );
  const returnFloored = applyBusinessClassOneWayFloor(returnNormal, minimum);
  const outboundRaised = outboundFloored > outboundNormal + 0.001;
  const returnRaised = returnFloored > returnNormal + 0.001;
  if (!outboundRaised && !returnRaised) return null;

  const preDiscount = outboundFloored + returnFloored;
  const rate = Number.isFinite(input.returnDiscountRate)
    ? Number(input.returnDiscountRate)
    : RETURN_JOURNEY_DISCOUNT_RATE;
  const discounted = preDiscount * (1 - rate);
  return roundCustomerPayableGbp(discounted);
}

/**
 * Pass the floor for the booked vehicle only. Saloon and Estate omit it.
 * Business Class and the 7 Seater share businessClassFlooredPayableGbp.
 */
export function vehicleMinimumFareBreakdownFields(input: {
  vehicleType: string | null | undefined;
  executiveMinimumFareGbp: number;
  minibusMinimumFareGbp: number;
  outboundOneWayBeforeAccessGbp?: number;
  returnOneWayBeforeAccessGbp?: number;
  returnDiscountRate?: number;
}): {
  businessClassMinimumFareGbp?: number;
  minibusMinimumFareGbp?: number;
  outboundOneWayBeforeAccessGbp?: number;
  returnOneWayBeforeAccessGbp?: number;
  returnDiscountRate?: number;
} {
  const legs = {
    outboundOneWayBeforeAccessGbp: input.outboundOneWayBeforeAccessGbp,
    returnOneWayBeforeAccessGbp: input.returnOneWayBeforeAccessGbp,
    returnDiscountRate: input.returnDiscountRate,
  };
  if (isExecutiveVehicle(input.vehicleType)) {
    return { businessClassMinimumFareGbp: input.executiveMinimumFareGbp, ...legs };
  }
  if (isMinibusVehicleType(input.vehicleType)) {
    return { minibusMinimumFareGbp: input.minibusMinimumFareGbp, ...legs };
  }
  return {};
}

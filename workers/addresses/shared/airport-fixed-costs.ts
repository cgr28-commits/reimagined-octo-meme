/**
 * Central airport fixed-cost configuration (GBP).
 *
 * These are operational add-ons applied per journey leg after the underlying
 * journey fare (and after the 5% return discount on that journey fare).
 * They must never be multiplied by distance, vehicle multipliers, or %.
 */

export type AirportFixedCostCode = "BFS" | "BHD" | "DUB" | "LDY";

export type AirportFixedCostRow = {
  /** Official airport drop-off / access fee charged on address → airport legs. */
  dropOffFeeGbp: number;
  /** Official airport pickup / access fee charged on airport → address legs. */
  pickupFeeGbp: number;
  /** Pickup parking allowance (Dublin). */
  parkingAllowanceGbp: number;
  /**
   * Toll allowance per Dublin leg (covers the driver’s journey down and return north).
   * Applied on both Dublin pickup and Dublin drop-off legs.
   */
  tollAllowanceGbp: number;
};

/**
 * Editable source of truth for airport fixed costs.
 * Keep in sync with `pricing-config.json` → `airportFixedCostsGbp`.
 */
export const AIRPORT_FIXED_COSTS_GBP: Record<AirportFixedCostCode, AirportFixedCostRow> = {
  BFS: {
    dropOffFeeGbp: 5,
    pickupFeeGbp: 5,
    parkingAllowanceGbp: 0,
    tollAllowanceGbp: 0,
  },
  BHD: {
    dropOffFeeGbp: 4,
    pickupFeeGbp: 4,
    parkingAllowanceGbp: 0,
    tollAllowanceGbp: 0,
  },
  DUB: {
    dropOffFeeGbp: 0,
    pickupFeeGbp: 0,
    parkingAllowanceGbp: 4,
    tollAllowanceGbp: 4,
  },
  LDY: {
    dropOffFeeGbp: 0,
    pickupFeeGbp: 0,
    parkingAllowanceGbp: 0,
    tollAllowanceGbp: 0,
  },
};

export type AirportLegFixedCostBreakdown = {
  airportCode: AirportFixedCostCode;
  /** true = airport → address (pickup from airport). */
  fromAirport: boolean;
  dropOffFeeGbp: number;
  pickupFeeGbp: number;
  parkingAllowanceGbp: number;
  tollAllowanceGbp: number;
  /** Sum for this leg. */
  totalGbp: number;
  /** True when any fee/parking/toll allowance is non-zero. */
  hasCharge: boolean;
};

function normaliseCode(code: string | null | undefined): AirportFixedCostCode | null {
  const normalised = (code ?? "").trim().toUpperCase();
  if (normalised === "BFS" || normalised === "BHD" || normalised === "DUB" || normalised === "LDY") {
    return normalised;
  }
  return null;
}

export function getAirportFixedCostRow(
  airportCode: string | null | undefined,
): AirportFixedCostRow | null {
  const code = normaliseCode(airportCode);
  if (!code) return null;
  return AIRPORT_FIXED_COSTS_GBP[code];
}

/**
 * Fixed operational costs for one airport leg.
 * Drop-off: drop-off fee + toll allowance (Dublin).
 * Pickup: pickup fee + parking allowance + toll allowance.
 */
export function getAirportLegFixedCosts(
  airportCode: string | null | undefined,
  fromAirport: boolean,
): AirportLegFixedCostBreakdown | null {
  const code = normaliseCode(airportCode);
  if (!code) return null;
  const row = AIRPORT_FIXED_COSTS_GBP[code];

  if (fromAirport) {
    const pickupFeeGbp = row.pickupFeeGbp;
    const parkingAllowanceGbp = row.parkingAllowanceGbp;
    const tollAllowanceGbp = row.tollAllowanceGbp;
    const totalGbp = pickupFeeGbp + parkingAllowanceGbp + tollAllowanceGbp;
    return {
      airportCode: code,
      fromAirport: true,
      dropOffFeeGbp: 0,
      pickupFeeGbp,
      parkingAllowanceGbp,
      tollAllowanceGbp,
      totalGbp,
      hasCharge: totalGbp > 0,
    };
  }

  const dropOffFeeGbp = row.dropOffFeeGbp;
  const tollAllowanceGbp = row.tollAllowanceGbp;
  const totalGbp = dropOffFeeGbp + tollAllowanceGbp;
  return {
    airportCode: code,
    fromAirport: false,
    dropOffFeeGbp,
    pickupFeeGbp: 0,
    parkingAllowanceGbp: 0,
    tollAllowanceGbp,
    totalGbp,
    hasCharge: totalGbp > 0,
  };
}

export function getAirportLegFixedCostGbp(
  airportCode: string | null | undefined,
  fromAirport: boolean,
): number {
  return getAirportLegFixedCosts(airportCode, fromAirport)?.totalGbp ?? 0;
}

/**
 * Airport ↔ airport one-way: pickup-end pickup costs + dropoff-end drop-off costs.
 */
export function getAirportToAirportFixedCostGbp(
  pickupAirportCode: string,
  dropoffAirportCode: string,
): number {
  return (
    getAirportLegFixedCostGbp(pickupAirportCode, true) +
    getAirportLegFixedCostGbp(dropoffAirportCode, false)
  );
}

/**
 * Previously, BFS/BHD zone fares treated a flat access fee as a commercial
 * inclusion inside the journey price. When re-applying direction-aware fixed
 * costs after the return discount, strip that embedded amount once from the
 * one-way journey fare so it is not double-counted.
 *
 * Dublin / LDY had no numeric access-fee add-on in the zone model (0).
 */
export function getLegacyEmbeddedAccessFeeGbp(airportCode: string | null | undefined): number {
  const code = normaliseCode(airportCode);
  if (code === "BFS") return 5;
  if (code === "BHD") return 4;
  return 0;
}

/**
 * Compose journey fare + undiscountd fixed costs.
 * `journeyOneWayGbp` must already exclude airport fixed costs.
 */
export function composeFareWithAirportFixedCosts(options: {
  journeyOneWayGbp: number;
  returnJourney: boolean;
  /** Fixed costs for the outbound leg. */
  outboundFixedGbp: number;
  /** Fixed costs for the return leg (0 when one-way). */
  returnFixedGbp?: number;
  /** Apply return discount: (2 × oneWay) × (1 − rate). */
  getReturnJourneyFare: (oneWay: number) => number;
}): { journeyTotalGbp: number; fixedTotalGbp: number; totalBeforeRoundingGbp: number } {
  const journeyTotalGbp = options.returnJourney
    ? options.getReturnJourneyFare(options.journeyOneWayGbp)
    : options.journeyOneWayGbp;
  const fixedTotalGbp =
    Math.max(0, options.outboundFixedGbp) +
    (options.returnJourney ? Math.max(0, options.returnFixedGbp ?? 0) : 0);
  return {
    journeyTotalGbp,
    fixedTotalGbp,
    totalBeforeRoundingGbp: journeyTotalGbp + fixedTotalGbp,
  };
}

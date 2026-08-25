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
 *
 * BFS/BHD address↔airport access fees are waived (£0) so customer totals fall by
 * the former surcharges via legacy strip only. Airport↔airport BFS↔BHD still
 * retains the destination-end historical fee — see getAirportToAirportFixedCostGbp.
 */
export const AIRPORT_FIXED_COSTS_GBP: Record<AirportFixedCostCode, AirportFixedCostRow> = {
  BFS: {
    dropOffFeeGbp: 0,
    pickupFeeGbp: 0,
    parkingAllowanceGbp: 0,
    tollAllowanceGbp: 0,
  },
  BHD: {
    dropOffFeeGbp: 0,
    pickupFeeGbp: 0,
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

/**
 * Former BFS/BHD access surcharges (£5 / £4).
 * Waived on address↔airport legs; still used when composing airport↔airport
 * fixed costs so we can waive only the collection-airport end.
 */
export const NI_AIRPORT_ACCESS_SURCHARGE_GBP: Partial<
  Record<AirportFixedCostCode, number>
> = {
  BFS: 5,
  BHD: 4,
};

function niAccessSurchargeGbp(code: AirportFixedCostCode | null): number {
  if (!code) return 0;
  return NI_AIRPORT_ACCESS_SURCHARGE_GBP[code] ?? 0;
}

function isNiAccessAirport(code: AirportFixedCostCode | null): code is "BFS" | "BHD" {
  return code === "BFS" || code === "BHD";
}

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
 * Airport ↔ airport one-way fixed costs.
 *
 * Default: pickup-end pickup costs + dropoff-end drop-off costs from
 * AIRPORT_FIXED_COSTS_GBP.
 *
 * BFS ↔ BHD exception: waive only the collection-airport surcharge
 * (BFS £5 / BHD £4). Keep the destination-end historical surcharge so the
 * fare falls by £5 or £4 — never by £9.
 *
 * Mixed A2A with LDY (etc.): still apply the historical BFS/BHD surcharge on
 * that end so non-BFS↔BHD airport pairs are unchanged vs the pre-waiver model.
 */
export function getAirportToAirportFixedCostGbp(
  pickupAirportCode: string,
  dropoffAirportCode: string,
): number {
  const pickupCode = normaliseCode(pickupAirportCode);
  const dropoffCode = normaliseCode(dropoffAirportCode);

  if (isNiAccessAirport(pickupCode) && isNiAccessAirport(dropoffCode)) {
    // Collection surcharge waived; destination drop-off surcharge retained.
    return niAccessSurchargeGbp(dropoffCode);
  }

  const pickupPart = isNiAccessAirport(pickupCode)
    ? niAccessSurchargeGbp(pickupCode)
    : getAirportLegFixedCostGbp(pickupAirportCode, true);
  const dropoffPart = isNiAccessAirport(dropoffCode)
    ? niAccessSurchargeGbp(dropoffCode)
    : getAirportLegFixedCostGbp(dropoffAirportCode, false);
  return pickupPart + dropoffPart;
}

/**
 * Previously, BFS/BHD zone fares treated a flat access fee as a commercial
 * inclusion inside the journey price. When direction-aware fixed costs were
 * re-applied after the return discount, that embedded amount was stripped once
 * from the one-way journey fare so it was not double-counted.
 *
 * BFS/BHD address↔airport fixed charges are now £0, but zone/base fares were
 * not recalibrated — keep stripping these amounts so address↔airport totals
 * fall by exactly the former surcharges (£5 BFS / £4 BHD). Dublin / LDY stay 0.
 */
export function getLegacyEmbeddedAccessFeeGbp(airportCode: string | null | undefined): number {
  return niAccessSurchargeGbp(normaliseCode(airportCode));
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

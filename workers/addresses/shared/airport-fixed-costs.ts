/**
 * Central airport fixed-cost configuration (GBP).
 *
 * These are operational add-ons applied per journey leg after the underlying
 * journey fare (and after the 5% return discount on that journey fare).
 * They must never be multiplied by distance, vehicle multipliers, or %.
 *
 * Removable controls exist ONLY on airport-to-airport journeys, and only for
 * each non-zero applicable fee independently.
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
   * Toll allowance per Dublin leg when configured.
   * Applied on both Dublin pickup and Dublin drop-off legs when non-zero.
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
 *
 * DUB: pickup/parking £5; drop-off £0.
 * LDY: pickup £2.50; drop-off £1.
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
    parkingAllowanceGbp: 5,
    tollAllowanceGbp: 0,
  },
  LDY: {
    dropOffFeeGbp: 1,
    pickupFeeGbp: 2.5,
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

const AIRPORT_DISPLAY_NAMES: Record<AirportFixedCostCode, string> = {
  BFS: "Belfast International Airport",
  BHD: "George Best Belfast City Airport",
  DUB: "Dublin Airport",
  LDY: "City of Derry Airport",
};

export type AirportFeeDirection = "pickup" | "drop-off";
export type AirportFeeLeg = "outbound" | "return";

/**
 * One applicable airport charge — never collapsed into a single generic fee.
 */
export type AirportFeeLine = {
  /** Stable id, e.g. "outbound:DUB:pickup". */
  id: string;
  leg: AirportFeeLeg;
  airportCode: AirportFixedCostCode;
  airportName: string;
  direction: AirportFeeDirection;
  originalAmountGbp: number;
  /** True only on airport-to-airport journeys when amount > 0. */
  removable: boolean;
  removed: boolean;
  appliedAmountGbp: number;
  /** Customer-facing breakdown label. */
  label: string;
};

export type JourneyAirportFeeResolution = {
  isAirportToAirport: boolean;
  lines: AirportFeeLine[];
  totalOriginalGbp: number;
  totalAppliedGbp: number;
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

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export function getAirportFixedCostRow(
  airportCode: string | null | undefined,
): AirportFixedCostRow | null {
  const code = normaliseCode(airportCode);
  if (!code) return null;
  return AIRPORT_FIXED_COSTS_GBP[code];
}

export function getAirportDisplayName(airportCode: string | null | undefined): string {
  const code = normaliseCode(airportCode);
  if (!code) return "Airport";
  return AIRPORT_DISPLAY_NAMES[code];
}

/**
 * Customer-facing label for one airport charge.
 * Dublin pickup uses “pickup/parking” because Dublin drop-off is free.
 */
export function formatAirportFeeLabel(
  airportCode: AirportFixedCostCode,
  direction: AirportFeeDirection,
): string {
  const name = AIRPORT_DISPLAY_NAMES[airportCode];
  if (airportCode === "DUB" && direction === "pickup") {
    return `${name} pickup/parking`;
  }
  if (direction === "pickup") {
    return `${name} pickup`;
  }
  return `${name} drop-off`;
}

function feeLineId(
  leg: AirportFeeLeg,
  airportCode: AirportFixedCostCode,
  direction: AirportFeeDirection,
): string {
  return `${leg}:${airportCode}:${direction}`;
}

/**
 * Fixed operational costs for one airport leg.
 * Drop-off: drop-off fee + toll allowance (when configured).
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
 * Build fee line(s) for one airport end using configured fixed costs.
 * Collapses parking+pickup+toll into one customer-facing line for that direction.
 */
function buildConfiguredFeeLine(input: {
  leg: AirportFeeLeg;
  airportCode: AirportFixedCostCode;
  fromAirport: boolean;
  removable: boolean;
  removedFeeIds: Set<string>;
}): AirportFeeLine | null {
  const costs = getAirportLegFixedCosts(input.airportCode, input.fromAirport);
  if (!costs || costs.totalGbp <= 0) return null;
  const direction: AirportFeeDirection = input.fromAirport ? "pickup" : "drop-off";
  const id = feeLineId(input.leg, input.airportCode, direction);
  const removed = input.removable && input.removedFeeIds.has(id);
  const originalAmountGbp = roundGbp(costs.totalGbp);
  return {
    id,
    leg: input.leg,
    airportCode: input.airportCode,
    airportName: AIRPORT_DISPLAY_NAMES[input.airportCode],
    direction,
    originalAmountGbp,
    removable: input.removable,
    removed,
    appliedAmountGbp: removed ? 0 : originalAmountGbp,
    label: formatAirportFeeLabel(input.airportCode, direction),
  };
}

/**
 * BFS/BHD A2A historical access surcharge as one fee line.
 */
function buildNiAccessFeeLine(input: {
  leg: AirportFeeLeg;
  airportCode: "BFS" | "BHD";
  direction: AirportFeeDirection;
  removable: boolean;
  removedFeeIds: Set<string>;
}): AirportFeeLine | null {
  const amount = niAccessSurchargeGbp(input.airportCode);
  if (amount <= 0) return null;
  const id = feeLineId(input.leg, input.airportCode, input.direction);
  const removed = input.removable && input.removedFeeIds.has(id);
  const originalAmountGbp = roundGbp(amount);
  return {
    id,
    leg: input.leg,
    airportCode: input.airportCode,
    airportName: AIRPORT_DISPLAY_NAMES[input.airportCode],
    direction: input.direction,
    originalAmountGbp,
    removable: input.removable,
    removed,
    appliedAmountGbp: removed ? 0 : originalAmountGbp,
    label: formatAirportFeeLabel(input.airportCode, input.direction),
  };
}

/**
 * Airport ↔ airport one-way fee lines (pickup-end + dropoff-end).
 * Mirrors getAirportToAirportFixedCostGbp composition rules.
 */
export function resolveAirportToAirportFeeLines(input: {
  pickupAirportCode: string;
  dropoffAirportCode: string;
  leg?: AirportFeeLeg;
  /** Honour removals only when this is a true A2A journey (always true here). */
  removedFeeIds?: Iterable<string>;
}): AirportFeeLine[] {
  const leg = input.leg ?? "outbound";
  const removable = true;
  const removedFeeIds = new Set(
    Array.from(input.removedFeeIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  const pickupCode = normaliseCode(input.pickupAirportCode);
  const dropoffCode = normaliseCode(input.dropoffAirportCode);
  if (!pickupCode || !dropoffCode) return [];

  const lines: AirportFeeLine[] = [];

  if (isNiAccessAirport(pickupCode) && isNiAccessAirport(dropoffCode)) {
    // Collection surcharge waived; destination drop-off surcharge retained.
    const dest = buildNiAccessFeeLine({
      leg,
      airportCode: dropoffCode,
      direction: "drop-off",
      removable,
      removedFeeIds,
    });
    if (dest) lines.push(dest);
    return lines;
  }

  if (isNiAccessAirport(pickupCode)) {
    const pickup = buildNiAccessFeeLine({
      leg,
      airportCode: pickupCode,
      direction: "pickup",
      removable,
      removedFeeIds,
    });
    if (pickup) lines.push(pickup);
  } else {
    const pickup = buildConfiguredFeeLine({
      leg,
      airportCode: pickupCode,
      fromAirport: true,
      removable,
      removedFeeIds,
    });
    if (pickup) lines.push(pickup);
  }

  if (isNiAccessAirport(dropoffCode)) {
    const drop = buildNiAccessFeeLine({
      leg,
      airportCode: dropoffCode,
      direction: "drop-off",
      removable,
      removedFeeIds,
    });
    if (drop) lines.push(drop);
  } else {
    const drop = buildConfiguredFeeLine({
      leg,
      airportCode: dropoffCode,
      fromAirport: false,
      removable,
      removedFeeIds,
    });
    if (drop) lines.push(drop);
  }

  return lines;
}

/**
 * Airport ↔ airport one-way fixed costs (sum of applicable fee lines, no removals).
 */
export function getAirportToAirportFixedCostGbp(
  pickupAirportCode: string,
  dropoffAirportCode: string,
): number {
  return resolveAirportToAirportFeeLines({
    pickupAirportCode,
    dropoffAirportCode,
  }).reduce((sum, line) => sum + line.originalAmountGbp, 0);
}

/**
 * Resolve all airport fee lines for a journey, applying A2A-only removals.
 *
 * Classic address↔airport: fees mandatory (removable=false); client removals ignored.
 * Airport-to-airport: each non-zero fee independently removable.
 */
export function resolveJourneyAirportFees(input: {
  /** Both ends identified as airports. */
  isAirportToAirport: boolean;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  /** Classic single-airport trip code (when not A2A). */
  airportCode?: string | null;
  /** Classic direction: true = airport → address. */
  fromAirport?: boolean;
  returnJourney?: boolean;
  /** Client-submitted removals — only applied when the matching line is removable. */
  removedFeeIds?: Iterable<string>;
}): JourneyAirportFeeResolution {
  const removedFeeIds = new Set(
    Array.from(input.removedFeeIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  const returnJourney = Boolean(input.returnJourney);
  const lines: AirportFeeLine[] = [];

  if (input.isAirportToAirport) {
    const pickup = normaliseCode(input.pickupAirportCode);
    const dropoff = normaliseCode(input.dropoffAirportCode);
    if (pickup && dropoff) {
      lines.push(
        ...resolveAirportToAirportFeeLines({
          pickupAirportCode: pickup,
          dropoffAirportCode: dropoff,
          leg: "outbound",
          removedFeeIds,
        }),
      );
      if (returnJourney) {
        lines.push(
          ...resolveAirportToAirportFeeLines({
            pickupAirportCode: dropoff,
            dropoffAirportCode: pickup,
            leg: "return",
            removedFeeIds,
          }),
        );
      }
    }
  } else {
    const code = normaliseCode(input.airportCode);
    if (code) {
      const fromAirport = Boolean(input.fromAirport);
      const outbound = buildConfiguredFeeLine({
        leg: "outbound",
        airportCode: code,
        fromAirport,
        removable: false,
        removedFeeIds,
      });
      if (outbound) lines.push(outbound);
      if (returnJourney) {
        const ret = buildConfiguredFeeLine({
          leg: "return",
          airportCode: code,
          fromAirport: !fromAirport,
          removable: false,
          removedFeeIds,
        });
        if (ret) lines.push(ret);
      }
    }
  }

  const totalOriginalGbp = roundGbp(
    lines.reduce((sum, line) => sum + line.originalAmountGbp, 0),
  );
  const totalAppliedGbp = roundGbp(
    lines.reduce((sum, line) => sum + line.appliedAmountGbp, 0),
  );

  return {
    isAirportToAirport: Boolean(input.isAirportToAirport),
    lines,
    totalOriginalGbp,
    totalAppliedGbp,
  };
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

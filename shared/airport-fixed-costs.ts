/**
 * Central airport fixed-cost configuration (GBP).
 *
 * These are operational add-ons applied per journey leg after the underlying
 * journey fare (and after the 5% return discount on that journey fare).
 * They must never be multiplied by distance, vehicle multipliers, or %.
 *
 * Customer choice (remove / free-area) is AIRPORT-SPECIFIC:
 * - DUB / LDY: NEVER removable
 * - BFS / BHD: removable only where a legitimate free-area alternative applies
 *   (A2A historical access surcharge lines; Express Drop-Off stays separate)
 */

export type AirportFixedCostCode = "BFS" | "BHD" | "DUB" | "LDY";

export type AirportFixedCostRow = {
  /** Official airport drop-off / access fee charged on address → airport legs. */
  dropOffFeeGbp: number;
  /** Official airport pickup / access fee charged on airport → address legs. */
  pickupFeeGbp: number;
  /** Pickup parking allowance (Dublin pickup/parking charge). */
  parkingAllowanceGbp: number;
  /**
   * Toll allowance per Dublin leg (covers the driver’s journey down and return north).
   * Applied on both Dublin pickup and Dublin drop-off legs when non-zero.
   * Separate from the Dublin pickup/parking charge.
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
 * DUB: pickup/parking £5 + M1 toll £4 on pickup; drop-off fee £0 + M1 toll £4.
 * LDY: pickup £2.50; drop-off £1. Never removable.
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
    tollAllowanceGbp: 4,
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
 * Parking/access and M1 toll are separate lines when both apply.
 */
export type AirportFeeLine = {
  /** Stable id, e.g. "outbound:DUB:pickup" or "outbound:DUB:toll". */
  id: string;
  leg: AirportFeeLeg;
  airportCode: AirportFixedCostCode;
  airportName: string;
  direction: AirportFeeDirection | "toll";
  originalAmountGbp: number;
  /**
   * True only when this airport offers a legitimate free-area alternative
   * (BFS/BHD) AND the journey context allows customer choice.
   * DUB and LDY are always false.
   */
  removable: boolean;
  /** Alias of removable — whether customer choice is permitted. */
  customerChoiceAllowed: boolean;
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
 * Dublin pickup uses “pickup/parking” because Dublin drop-off fee is £0
 * (M1 tolls are a separate line when configured).
 */
export function formatAirportFeeLabel(
  airportCode: AirportFixedCostCode,
  direction: AirportFeeDirection | "toll",
): string {
  if (direction === "toll") {
    return "M1 tolls";
  }
  const name = AIRPORT_DISPLAY_NAMES[airportCode];
  if (airportCode === "DUB" && direction === "pickup") {
    return `${name} pickup/parking`;
  }
  if (direction === "pickup") {
    return `${name} pickup`;
  }
  return `${name} drop-off`;
}

/**
 * DUB and LDY never allow customer removal / free-area choice.
 * BFS and BHD may, when the journey context supplies a legitimate alternative.
 */
export function isAirportFeeCustomerChoiceAllowed(
  airportCode: string | null | undefined,
): boolean {
  const code = normaliseCode(airportCode);
  return code === "BFS" || code === "BHD";
}

function feeLineId(
  leg: AirportFeeLeg,
  airportCode: AirportFixedCostCode,
  direction: AirportFeeDirection | "toll",
): string {
  return `${leg}:${airportCode}:${direction}`;
}

function makeFeeLine(input: {
  leg: AirportFeeLeg;
  airportCode: AirportFixedCostCode;
  direction: AirportFeeDirection | "toll";
  amountGbp: number;
  customerChoiceAllowed: boolean;
  removedFeeIds: Set<string>;
}): AirportFeeLine | null {
  const originalAmountGbp = roundGbp(input.amountGbp);
  if (originalAmountGbp <= 0) return null;
  const id = feeLineId(input.leg, input.airportCode, input.direction);
  const removable = input.customerChoiceAllowed;
  const removed = removable && input.removedFeeIds.has(id);
  return {
    id,
    leg: input.leg,
    airportCode: input.airportCode,
    airportName: AIRPORT_DISPLAY_NAMES[input.airportCode],
    direction: input.direction,
    originalAmountGbp,
    removable,
    customerChoiceAllowed: removable,
    removed,
    appliedAmountGbp: removed ? 0 : originalAmountGbp,
    label: formatAirportFeeLabel(input.airportCode, input.direction),
  };
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
 * Fee line(s) for one airport end using configured fixed costs.
 * Parking/access and M1 toll are emitted as separate lines when both apply.
 * DUB / LDY are never removable.
 */
function buildConfiguredFeeLines(input: {
  leg: AirportFeeLeg;
  airportCode: AirportFixedCostCode;
  fromAirport: boolean;
  /** Ignored for DUB/LDY — always false. */
  customerChoiceAllowed: boolean;
  removedFeeIds: Set<string>;
}): AirportFeeLine[] {
  const costs = getAirportLegFixedCosts(input.airportCode, input.fromAirport);
  if (!costs || costs.totalGbp <= 0) return [];
  // DUB / LDY: never allow customer removal, even on A2A.
  const choiceAllowed =
    input.customerChoiceAllowed && isAirportFeeCustomerChoiceAllowed(input.airportCode);
  const lines: AirportFeeLine[] = [];

  if (input.fromAirport) {
    const parkingOrPickup = costs.pickupFeeGbp + costs.parkingAllowanceGbp;
    const access = makeFeeLine({
      leg: input.leg,
      airportCode: input.airportCode,
      direction: "pickup",
      amountGbp: parkingOrPickup,
      customerChoiceAllowed: choiceAllowed,
      removedFeeIds: input.removedFeeIds,
    });
    if (access) lines.push(access);
  } else if (costs.dropOffFeeGbp > 0) {
    const drop = makeFeeLine({
      leg: input.leg,
      airportCode: input.airportCode,
      direction: "drop-off",
      amountGbp: costs.dropOffFeeGbp,
      customerChoiceAllowed: choiceAllowed,
      removedFeeIds: input.removedFeeIds,
    });
    if (drop) lines.push(drop);
  }

  if (costs.tollAllowanceGbp > 0) {
    const toll = makeFeeLine({
      leg: input.leg,
      airportCode: input.airportCode,
      direction: "toll",
      amountGbp: costs.tollAllowanceGbp,
      // Tolls are never a free-area customer choice.
      customerChoiceAllowed: false,
      removedFeeIds: input.removedFeeIds,
    });
    if (toll) lines.push(toll);
  }

  return lines;
}

/**
 * BFS/BHD A2A historical access surcharge as one fee line.
 * Removable only when a legitimate free-area alternative applies (BFS/BHD).
 */
function buildNiAccessFeeLine(input: {
  leg: AirportFeeLeg;
  airportCode: "BFS" | "BHD";
  direction: AirportFeeDirection;
  customerChoiceAllowed: boolean;
  removedFeeIds: Set<string>;
}): AirportFeeLine | null {
  return makeFeeLine({
    leg: input.leg,
    airportCode: input.airportCode,
    direction: input.direction,
    amountGbp: niAccessSurchargeGbp(input.airportCode),
    customerChoiceAllowed:
      input.customerChoiceAllowed && isAirportFeeCustomerChoiceAllowed(input.airportCode),
    removedFeeIds: input.removedFeeIds,
  });
}

/**
 * Airport ↔ airport one-way fee lines (pickup-end + dropoff-end).
 * Mirrors getAirportToAirportFixedCostGbp composition rules.
 * Removals honour airport-specific permissions (BFS/BHD only).
 */
export function resolveAirportToAirportFeeLines(input: {
  pickupAirportCode: string;
  dropoffAirportCode: string;
  leg?: AirportFeeLeg;
  removedFeeIds?: Iterable<string>;
}): AirportFeeLine[] {
  const leg = input.leg ?? "outbound";
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
      customerChoiceAllowed: true,
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
      customerChoiceAllowed: true,
      removedFeeIds,
    });
    if (pickup) lines.push(pickup);
  } else {
    lines.push(
      ...buildConfiguredFeeLines({
        leg,
        airportCode: pickupCode,
        fromAirport: true,
        customerChoiceAllowed: false,
        removedFeeIds,
      }),
    );
  }

  if (isNiAccessAirport(dropoffCode)) {
    const drop = buildNiAccessFeeLine({
      leg,
      airportCode: dropoffCode,
      direction: "drop-off",
      customerChoiceAllowed: true,
      removedFeeIds,
    });
    if (drop) lines.push(drop);
  } else {
    lines.push(
      ...buildConfiguredFeeLines({
        leg,
        airportCode: dropoffCode,
        fromAirport: false,
        customerChoiceAllowed: false,
        removedFeeIds,
      }),
    );
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
 * Resolve all airport fee lines for a journey.
 *
 * Removals are airport-specific:
 * - DUB / LDY: never removable (client removedFeeIds ignored)
 * - BFS / BHD: removable only on A2A when a free-area alternative applies
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
      lines.push(
        ...buildConfiguredFeeLines({
          leg: "outbound",
          airportCode: code,
          fromAirport,
          customerChoiceAllowed: false,
          removedFeeIds,
        }),
      );
      if (returnJourney) {
        lines.push(
          ...buildConfiguredFeeLines({
            leg: "return",
            airportCode: code,
            fromAirport: !fromAirport,
            customerChoiceAllowed: false,
            removedFeeIds,
          }),
        );
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
 *
 * Do not remove this strip until universal distance pricing (or a dedicated
 * recalibration) lands — otherwise every BFS/BHD address↔airport fare rises
 * by £5/£4. Ideal end state: no embedded access in journey fare; Express only
 * as an explicit optional add-on. A2A still uses NI_AIRPORT_ACCESS_SURCHARGE_GBP.
 */
export function getLegacyEmbeddedAccessFeeGbp(airportCode: string | null | undefined): number {
  // Universal distance journey fares are pure road-miles — no embedded access to strip.
  void airportCode;
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

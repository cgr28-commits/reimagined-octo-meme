/**
 * Optional airport Express Drop-Off add-on (customer-facing).
 *
 * Separate from waived automatic BFS/BHD access fees in airport-fixed-costs.ts.
 * Applies only on departure legs that end at BFS (£5) or BHD (£4).
 * Dublin / LDY / pickups / non-airport journeys: never eligible.
 */

export type ExpressDropOffAirportCode = "BFS" | "BHD";

/** Central fee table — keep in sync with pricing-config.json → expressDropOffFeesGbp. */
export const EXPRESS_DROP_OFF_FEES_GBP: Record<ExpressDropOffAirportCode, number> = {
  BFS: 5,
  BHD: 4,
};

export const EXPRESS_DROP_OFF_AIRPORT_NAMES: Record<ExpressDropOffAirportCode, string> = {
  BFS: "Belfast International",
  BHD: "Belfast City Airport",
};

export const EXPRESS_DROP_OFF_PASSED_ON_NOTE =
  "Airport access charges are passed on at cost.";

export const EXPRESS_DROP_OFF_REMOVED_EXPLANATION =
  "You will be dropped at the airport’s designated free drop-off area rather than the Express terminal area. Additional walking or onward transfer may be required.";

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export function formatExpressDropOffGbp(amount: number): string {
  const rounded = roundGbp(amount);
  if (!Number.isFinite(rounded)) return "£—";
  return `£${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)}`;
}

export function normaliseExpressDropOffAirport(
  code: string | null | undefined,
): ExpressDropOffAirportCode | null {
  const normalised = String(code ?? "")
    .trim()
    .toUpperCase();
  if (normalised === "BFS" || normalised === "BHD") {
    return normalised;
  }
  return null;
}

export function getExpressDropOffFeeGbp(
  airportCode: string | null | undefined,
): number {
  const code = normaliseExpressDropOffAirport(airportCode);
  return code ? EXPRESS_DROP_OFF_FEES_GBP[code] : 0;
}

export function isExpressDropOffAirport(
  airportCode: string | null | undefined,
): airportCode is ExpressDropOffAirportCode {
  return normaliseExpressDropOffAirport(airportCode) != null;
}

/**
 * True when a single leg drops the customer at an Express-eligible airport.
 * fromAirport=true → pickup from airport (not eligible).
 * fromAirport=false → drop-off at airport (eligible for BFS/BHD only).
 */
export function isExpressDropOffEligibleLeg(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
}): boolean {
  if (input.fromAirport === true) {
    return false;
  }
  return isExpressDropOffAirport(input.airportCode);
}

/**
 * Per-leg eligibility for one-way or return airport transfers.
 * Return flips direction: charge only legs that end at the airport.
 */
export function resolveExpressDropOffLegs(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
}): Array<{
  leg: "outbound" | "return";
  airportCode: ExpressDropOffAirportCode;
  feeGbp: number;
}> {
  const airportCode = normaliseExpressDropOffAirport(input.airportCode);
  if (!airportCode) {
    return [];
  }

  const fromAirport = Boolean(input.fromAirport);
  const returnJourney = Boolean(input.returnJourney);
  const feeGbp = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  const legs: Array<{
    leg: "outbound" | "return";
    airportCode: ExpressDropOffAirportCode;
    feeGbp: number;
  }> = [];

  // Outbound drop-off at airport.
  if (!fromAirport) {
    legs.push({ leg: "outbound", airportCode, feeGbp });
  }

  // Return leg drops at airport only when outbound was a pickup (fromAirport).
  if (returnJourney && fromAirport) {
    legs.push({ leg: "return", airportCode, feeGbp });
  }

  return legs;
}

export type ExpressDropOffSelection = {
  /** Whether the option UI applies for this journey. */
  eligible: boolean;
  /** Airport the optional charge relates to (first eligible leg). */
  airportCode: ExpressDropOffAirportCode | null;
  /** Fee when selected (sum of eligible legs). */
  feeIfSelectedGbp: number;
  /** Customer chose Express Drop-Off (ignored when not eligible). */
  selected: boolean;
  /** Fee actually charged (0 when not eligible or not selected). */
  feeGbp: number;
  legs: Array<{
    leg: "outbound" | "return";
    airportCode: ExpressDropOffAirportCode;
    feeGbp: number;
  }>;
};

/**
 * Resolve Express Drop-Off for a journey.
 * `selected` defaults to true when eligible (product default).
 */
export function resolveExpressDropOff(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  /** Explicit customer/owner choice; default true when eligible. */
  selected?: boolean | null;
}): ExpressDropOffSelection {
  const legs = resolveExpressDropOffLegs(input);
  const eligible = legs.length > 0;
  const airportCode = eligible ? legs[0]!.airportCode : null;
  const feeIfSelectedGbp = roundGbp(
    legs.reduce((sum, leg) => sum + leg.feeGbp, 0),
  );
  const selected = eligible ? input.selected !== false : false;
  const feeGbp = selected ? feeIfSelectedGbp : 0;

  return {
    eligible,
    airportCode,
    feeIfSelectedGbp,
    selected,
    feeGbp,
    legs,
  };
}

/**
 * Final customer total: transfer fare + extras + Express Drop-Off (when selected).
 * Removing Express Drop-Off sets that fee to £0 — it does not discount the transfer fare.
 */
export function composeFareWithExpressDropOff(input: {
  transferFareGbp: number;
  extrasGbp?: number;
  expressDropOffFeeGbp?: number;
}): {
  transferFareGbp: number;
  extrasGbp: number;
  expressDropOffFeeGbp: number;
  totalGbp: number;
} {
  const transferFareGbp = roundGbp(Math.max(0, Number(input.transferFareGbp) || 0));
  const extrasGbp = roundGbp(Math.max(0, Number(input.extrasGbp) || 0));
  const expressDropOffFeeGbp = roundGbp(
    Math.max(0, Number(input.expressDropOffFeeGbp) || 0),
  );
  return {
    transferFareGbp,
    extrasGbp,
    expressDropOffFeeGbp,
    totalGbp: roundGbp(transferFareGbp + extrasGbp + expressDropOffFeeGbp),
  };
}

export function expressDropOffRecommendedLabel(
  airportCode: ExpressDropOffAirportCode,
): string {
  const fee = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  return `Express terminal drop-off — ${formatExpressDropOffGbp(fee)} (Recommended)`;
}

export function expressDropOffRemoveLabel(
  airportCode: ExpressDropOffAirportCode,
): string {
  const fee = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  return `Remove Express Drop-Off and save ${formatExpressDropOffGbp(fee)}`;
}

export function expressDropOffBreakdownLabel(
  airportCode: ExpressDropOffAirportCode,
  selected: boolean,
): string {
  const name = EXPRESS_DROP_OFF_AIRPORT_NAMES[airportCode];
  const fee = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  if (selected) {
    return `${name} Express Drop-Off: ${formatExpressDropOffGbp(fee)}`;
  }
  return `Express Drop-Off removed: −${formatExpressDropOffGbp(fee)}`;
}

export function expressDropOffConfirmRemovalLabel(): string {
  return "I understand I will be dropped at the free drop-off area, not the Express terminal.";
}

/** Structured fields for quotes / bookings / emails. */
export type ExpressDropOffPersistedFields = {
  expressDropOffSelected: boolean;
  expressDropOffFee: number;
  expressDropOffAirport: ExpressDropOffAirportCode | null;
};

export function toExpressDropOffPersistedFields(
  selection: ExpressDropOffSelection,
): ExpressDropOffPersistedFields {
  return {
    expressDropOffSelected: selection.eligible ? selection.selected : false,
    expressDropOffFee: selection.feeGbp,
    expressDropOffAirport: selection.eligible ? selection.airportCode : null,
  };
}

/**
 * Payment / booking may continue when Express is kept, ineligible, or removal is acknowledged.
 */
export function canProceedWithoutExpressDropOff(input: {
  eligible: boolean;
  selected: boolean;
  removalAcknowledged: boolean;
}): boolean {
  if (!input.eligible || input.selected) return true;
  return Boolean(input.removalAcknowledged);
}

/** Parse customer Express choice — fee amounts from the browser are ignored. */
export function parseCustomerExpressDropOffSelected(
  value: unknown,
  fallbackWhenMissing = true,
): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallbackWhenMissing;
}

/** Email / summary line when Express Drop-Off applies or was declined. */
export function formatExpressDropOffSummaryLine(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
}): string | null {
  if (
    typeof input.expressDropOffSelected !== "boolean" &&
    typeof input.expressDropOffFee !== "number"
  ) {
    return null;
  }
  const airport = normaliseExpressDropOffAirport(input.expressDropOffAirport);
  if (!airport) {
    return null;
  }
  const selected = input.expressDropOffSelected !== false;
  const fee =
    typeof input.expressDropOffFee === "number" && Number.isFinite(input.expressDropOffFee)
      ? roundGbp(input.expressDropOffFee)
      : selected
        ? EXPRESS_DROP_OFF_FEES_GBP[airport]
        : 0;
  if (selected && fee <= 0) {
    return null;
  }
  return expressDropOffBreakdownLabel(airport, selected && fee > 0);
}

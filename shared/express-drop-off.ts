/**
 * Optional airport Express Drop-Off / Pick-Up add-on (customer-facing).
 *
 * Separate from waived automatic BFS/BHD access fees in airport-fixed-costs.ts.
 * Applies per eligible BFS (£5) / BHD (£4) journey leg (to or from).
 * Return bookings resolve outbound and return independently.
 * Dublin / LDY / non-airport: never eligible.
 *
 * Free drop-off alternative is always offered.
 * Free pick-up alternative only when a free collection point is configured.
 */

export type ExpressDropOffAirportCode = "BFS" | "BHD";

export type ExpressAirportService = "drop-off" | "pick-up";

/** Central fee table — keep in sync with pricing-config.json → expressDropOffFeesGbp. */
export const EXPRESS_DROP_OFF_FEES_GBP: Record<ExpressDropOffAirportCode, number> = {
  BFS: 5,
  BHD: 4,
};

export const EXPRESS_DROP_OFF_AIRPORT_NAMES: Record<ExpressDropOffAirportCode, string> = {
  BFS: "Belfast International",
  BHD: "Belfast City Airport",
};

/**
 * Free collection (pick-up) points — only airports listed as true may offer the
 * “meet at free pick-up area” opt-out. Keep in sync with pricing-config.json.
 */
export const EXPRESS_FREE_PICKUP_CONFIGURED: Record<ExpressDropOffAirportCode, boolean> = {
  BFS: true,
  BHD: true,
};

export const EXPRESS_DROP_OFF_PASSED_ON_NOTE =
  "Airport-imposed Express access charges are passed on at cost with no markup.";

export const EXPRESS_DROP_OFF_REMOVED_EXPLANATION =
  "You’ll be dropped at the designated free drop-off area instead of Express Drop-Off. It’s only a short walk to the terminal.";

export const EXPRESS_PICK_UP_REMOVED_EXPLANATION =
  "You’ll meet your driver at the designated free pick-up area instead of Express Pick-Up. It’s only a short walk from the terminal.";

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

export function isExpressFreePickupConfigured(
  airportCode: string | null | undefined,
): boolean {
  const code = normaliseExpressDropOffAirport(airportCode);
  return code ? EXPRESS_FREE_PICKUP_CONFIGURED[code] === true : false;
}

/**
 * Direction of Express for a journey: pick-up when collecting at the airport,
 * otherwise drop-off when ending at the airport.
 */
export function resolveExpressAirportService(input: {
  fromAirport?: boolean | null;
}): ExpressAirportService {
  return input.fromAirport === true ? "pick-up" : "drop-off";
}

/**
 * True when a BFS/BHD airport journey can offer Express (to or from).
 */
export function isExpressDropOffEligibleLeg(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
}): boolean {
  return isExpressDropOffAirport(input.airportCode);
}

/**
 * Whether the customer may opt out to a free alternative location.
 * Drop-off: always. Pick-up: only when a free collection point is configured.
 */
export function canOfferExpressFreeAlternative(input: {
  airportCode?: string | null;
  service?: ExpressAirportService | null;
  fromAirport?: boolean | null;
}): boolean {
  const service =
    input.service ?? resolveExpressAirportService({ fromAirport: input.fromAirport });
  if (service === "drop-off") return isExpressDropOffAirport(input.airportCode);
  return isExpressFreePickupConfigured(input.airportCode);
}

export type ExpressDropOffLeg = {
  leg: "outbound" | "return";
  service: ExpressAirportService;
  airportCode: ExpressDropOffAirportCode;
  feeGbp: number;
  fromAirport: boolean;
};

/**
 * Per-leg Express eligibility. BFS/BHD airport trips offer Express on each
 * applicable leg. A return flips direction on the same airport
 * (to-airport outbound = drop-off; return = pick-up, and vice versa).
 */
export function resolveExpressDropOffLegs(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
}): ExpressDropOffLeg[] {
  const airportCode = normaliseExpressDropOffAirport(input.airportCode);
  if (!airportCode) {
    return [];
  }

  const outboundFromAirport = input.fromAirport === true;
  const outboundService = resolveExpressAirportService({
    fromAirport: outboundFromAirport,
  });
  const feeGbp = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  const outbound: ExpressDropOffLeg = {
    leg: "outbound",
    service: outboundService,
    airportCode,
    feeGbp,
    fromAirport: outboundFromAirport,
  };

  if (!input.returnJourney) {
    return [outbound];
  }

  const returnFromAirport = !outboundFromAirport;
  return [
    outbound,
    {
      leg: "return",
      service: resolveExpressAirportService({ fromAirport: returnFromAirport }),
      airportCode,
      feeGbp,
      fromAirport: returnFromAirport,
    },
  ];
}

export type ExpressDropOffResolvedLeg = ExpressDropOffLeg & {
  selected: boolean;
  feeIfSelectedGbp: number;
  chargedFeeGbp: number;
  freeAlternativeAvailable: boolean;
};

export type ExpressDropOffSelection = {
  /** Whether the option UI applies for this journey. */
  eligible: boolean;
  /** Airport the optional charge relates to. */
  airportCode: ExpressDropOffAirportCode | null;
  /** drop-off vs pick-up copy for the primary/outbound selector. */
  service: ExpressAirportService | null;
  /** Customer may choose the free alternative on at least one eligible leg. */
  freeAlternativeAvailable: boolean;
  /** Fee when every eligible leg is selected. */
  feeIfSelectedGbp: number;
  /** True when any eligible leg is on Express. */
  selected: boolean;
  /** Sum of charged Express fees across selected legs. */
  feeGbp: number;
  outboundSelected: boolean;
  returnSelected: boolean;
  outboundFeeGbp: number;
  returnFeeGbp: number;
  legs: ExpressDropOffResolvedLeg[];
};

function resolveLegSelected(input: {
  selected?: boolean | null;
  outboundSelected?: boolean | null;
  returnSelected?: boolean | null;
  leg: "outbound" | "return";
  freeAlternativeAvailable: boolean;
}): boolean {
  if (!input.freeAlternativeAvailable) return true;
  const perLeg =
    input.leg === "return" ? input.returnSelected : input.outboundSelected;
  if (typeof perLeg === "boolean") return perLeg;
  return input.selected !== false;
}

/**
 * Resolve Express Drop-Off / Pick-Up for a journey.
 * `selected` defaults to true when eligible (product default) and applies to
 * every leg that has no explicit outbound/return choice.
 * When no free alternative is available on a leg, that leg stays on Express.
 */
export function resolveExpressDropOff(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  /** Explicit customer/owner choice applied to every unspecified leg. */
  selected?: boolean | null;
  outboundSelected?: boolean | null;
  returnSelected?: boolean | null;
}): ExpressDropOffSelection {
  const rawLegs = resolveExpressDropOffLegs(input);
  const legs: ExpressDropOffResolvedLeg[] = rawLegs.map((leg) => {
    const freeAlternativeAvailable = canOfferExpressFreeAlternative({
      airportCode: leg.airportCode,
      service: leg.service,
    });
    const selected = resolveLegSelected({
      selected: input.selected,
      outboundSelected: input.outboundSelected,
      returnSelected: input.returnSelected,
      leg: leg.leg,
      freeAlternativeAvailable,
    });
    const feeIfSelectedGbp = roundGbp(leg.feeGbp);
    return {
      ...leg,
      selected,
      freeAlternativeAvailable,
      feeIfSelectedGbp,
      chargedFeeGbp: selected ? feeIfSelectedGbp : 0,
    };
  });
  const eligible = legs.length > 0;
  const airportCode = eligible ? legs[0]!.airportCode : null;
  const service = eligible ? legs[0]!.service : null;
  const freeAlternativeAvailable = legs.some((leg) => leg.freeAlternativeAvailable);
  const feeIfSelectedGbp = roundGbp(
    legs.reduce((sum, leg) => sum + leg.feeIfSelectedGbp, 0),
  );
  const outbound = legs.find((leg) => leg.leg === "outbound");
  const ret = legs.find((leg) => leg.leg === "return");
  const outboundSelected = outbound?.selected ?? false;
  const returnSelected = ret?.selected ?? false;
  const outboundFeeGbp = outbound?.chargedFeeGbp ?? 0;
  const returnFeeGbp = ret?.chargedFeeGbp ?? 0;
  const feeGbp = roundGbp(outboundFeeGbp + returnFeeGbp);
  const selected = eligible && legs.some((leg) => leg.selected);

  return {
    eligible,
    airportCode,
    service,
    freeAlternativeAvailable,
    feeIfSelectedGbp,
    selected,
    feeGbp,
    outboundSelected,
    returnSelected,
    outboundFeeGbp,
    returnFeeGbp,
    legs,
  };
}

/**
 * Final customer total: transfer fare + extras + Express (when selected).
 * Removing Express sets that fee to £0 — it does not discount the transfer fare.
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
  service: ExpressAirportService = "drop-off",
): string {
  const fee = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  if (service === "pick-up") {
    return `Keep Express airport pick-up — ${formatExpressDropOffGbp(fee)} (Recommended)`;
  }
  return `Keep Express terminal drop-off — ${formatExpressDropOffGbp(fee)} (Recommended)`;
}

export function expressDropOffRemoveLabel(
  airportCode: ExpressDropOffAirportCode,
  service: ExpressAirportService = "drop-off",
): string {
  const fee = EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  if (service === "pick-up") {
    return `Meet your driver at the designated free pick-up area and save ${formatExpressDropOffGbp(fee)}`;
  }
  return `Use the designated free drop-off area and save ${formatExpressDropOffGbp(fee)}`;
}

export function expressDropOffRemovedExplanation(
  service: ExpressAirportService = "drop-off",
): string {
  return service === "pick-up"
    ? EXPRESS_PICK_UP_REMOVED_EXPLANATION
    : EXPRESS_DROP_OFF_REMOVED_EXPLANATION;
}

export function expressDropOffBreakdownLabel(
  airportCode: ExpressDropOffAirportCode,
  selected: boolean,
  service: ExpressAirportService = "drop-off",
  feeGbp?: number,
): string {
  const name = EXPRESS_DROP_OFF_AIRPORT_NAMES[airportCode];
  const fee =
    typeof feeGbp === "number" && Number.isFinite(feeGbp)
      ? roundGbp(feeGbp)
      : EXPRESS_DROP_OFF_FEES_GBP[airportCode];
  const label = service === "pick-up" ? "Express Pick-Up" : "Express Drop-Off";
  if (selected) {
    return `${name} ${label}: ${formatExpressDropOffGbp(fee)}`;
  }
  if (service === "pick-up") {
    return `Free pick-up selected — you save ${formatExpressDropOffGbp(fee)}`;
  }
  return `Free drop-off selected — you save ${formatExpressDropOffGbp(fee)}`;
}

export function expressDropOffConfirmRemovalLabel(
  service: ExpressAirportService = "drop-off",
): string {
  if (service === "pick-up") {
    return "I understand I will meet my driver at the designated free pick-up area rather than the Express terminal.";
  }
  return "I understand I will be dropped at the designated free drop-off area rather than the Express terminal.";
}

export function expressAirportLegendLabel(
  service: ExpressAirportService = "drop-off",
): string {
  return service === "pick-up" ? "Airport Express Pick-Up" : "Airport Express Drop-Off";
}

export function expressAvoidedChargeMessage(
  service: ExpressAirportService = "drop-off",
): string {
  return service === "pick-up"
    ? "You’ve avoided the Express Pick-Up charge"
    : "You’ve avoided the Express Drop-Off charge";
}

/**
 * Combined return-booking airport access choice (customer-facing UX).
 *
 * Internally each leg is still resolved and stored independently (see
 * `resolveExpressDropOffLegs` / `ExpressDropOffResolvedLeg`), but on a return
 * journey the customer is shown a single "Airport access" control that applies
 * the same Express/free choice to both the outbound and return legs together —
 * it reduces mobile clutter and surfaces the full £ difference in one place.
 */
export const COMBINED_AIRPORT_ACCESS_RETURN_NOTE =
  "For return bookings, your selection applies to both your outbound and return airport journeys.";

export function combinedAirportAccessRecommendedLabel(totalFeeGbp: number): string {
  return `Express airport access — ${formatExpressDropOffGbp(totalFeeGbp)} total (Recommended)`;
}

export function combinedAirportAccessRemoveLabel(totalFeeGbp: number): string {
  return `Use the designated free airport areas — save ${formatExpressDropOffGbp(totalFeeGbp)}`;
}

export function combinedAirportAccessConfirmRemovalLabel(): string {
  return "I understand that the designated free airport areas will be used for both journeys.";
}

export function combinedAirportAccessBreakdownLabel(
  selected: boolean,
  totalFeeGbp: number,
): string {
  if (selected) {
    return `Express airport access (both journeys): ${formatExpressDropOffGbp(totalFeeGbp)}`;
  }
  return `Free airport areas selected (both journeys) — you save ${formatExpressDropOffGbp(totalFeeGbp)}`;
}

/** True only when every leg can offer the free alternative — required to show the combined free option. */
export function combinedFreeAlternativeAvailable(
  legs: Pick<ExpressDropOffResolvedLeg, "freeAlternativeAvailable">[],
): boolean {
  return legs.length > 0 && legs.every((leg) => leg.freeAlternativeAvailable);
}

/** Explicit customer choice — never infer from final price alone. */
export type AirportAccessOption = "express" | "free";

/** Structured fields for quotes / bookings / emails. */
export type ExpressDropOffPersistedFields = {
  expressDropOffSelected: boolean;
  expressDropOffFee: number;
  expressDropOffAirport: ExpressDropOffAirportCode | null;
  outboundExpressDropOffSelected?: boolean;
  returnExpressDropOffSelected?: boolean;
  outboundAirportAccessOption?: AirportAccessOption | null;
  returnAirportAccessOption?: AirportAccessOption | null;
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
};

export function toExpressDropOffPersistedFields(
  selection: ExpressDropOffSelection,
): ExpressDropOffPersistedFields {
  const outbound = selection.legs.find((leg) => leg.leg === "outbound");
  const ret = selection.legs.find((leg) => leg.leg === "return");
  return {
    expressDropOffSelected: selection.eligible ? selection.selected : false,
    expressDropOffFee: selection.feeGbp,
    expressDropOffAirport: selection.eligible ? selection.airportCode : null,
    ...(outbound
      ? {
          outboundExpressDropOffSelected: outbound.selected,
          outboundAirportAccessOption: outbound.selected ? "express" : "free",
          outboundAirportAccessChargeGbp: outbound.chargedFeeGbp,
        }
      : {}),
    ...(ret
      ? {
          returnExpressDropOffSelected: ret.selected,
          returnAirportAccessOption: ret.selected ? "express" : "free",
          returnAirportAccessChargeGbp: ret.chargedFeeGbp,
        }
      : {}),
  };
}

/**
 * Resolve the explicit airport-access choice from persisted Express fields.
 * Returns null when Express was not offered for this journey.
 */
export function resolveAirportAccessOption(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
}): AirportAccessOption | null {
  const airport = normaliseExpressDropOffAirport(input.expressDropOffAirport);
  if (!airport) {
    return null;
  }
  if (typeof input.expressDropOffSelected !== "boolean") {
    // Fee alone can still indicate a charged Express selection.
    if (typeof input.expressDropOffFee === "number" && input.expressDropOffFee > 0) {
      return "express";
    }
    return null;
  }
  return input.expressDropOffSelected ? "express" : "free";
}

/**
 * Customer journey-details line (confirmation page + email).
 * Example: "Airport access option: Express Drop-Off — £5.00"
 * Example: "Airport access option: Free designated drop-off area — short walk to terminal"
 */
export function formatAirportAccessOptionCustomerLine(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  service?: ExpressAirportService | null;
}): string | null {
  const option = resolveAirportAccessOption(input);
  if (!option) return null;
  const airport = normaliseExpressDropOffAirport(input.expressDropOffAirport);
  if (!airport) return null;
  const service =
    input.service ?? resolveExpressAirportService({ fromAirport: input.fromAirport });
  const product = service === "pick-up" ? "Express Pick-Up" : "Express Drop-Off";
  if (option === "express") {
    const fee =
      typeof input.expressDropOffFee === "number" && input.expressDropOffFee > 0
        ? roundGbp(input.expressDropOffFee)
        : EXPRESS_DROP_OFF_FEES_GBP[airport];
    return `Airport access option: ${product} — ${formatExpressDropOffGbp(fee)}`;
  }
  if (service === "pick-up") {
    return "Airport access option: Free designated pick-up area — short walk from terminal";
  }
  return "Airport access option: Free designated drop-off area — short walk to terminal";
}

function formatAirportAccessLegCustomerValue(input: {
  option: AirportAccessOption;
  airportCode: ExpressDropOffAirportCode;
  service: ExpressAirportService;
  feeGbp?: number;
}): string {
  const product = input.service === "pick-up" ? "Express Pick-Up" : "Express Drop-Off";
  if (input.option === "express") {
    const fee =
      typeof input.feeGbp === "number" && input.feeGbp > 0
        ? roundGbp(input.feeGbp)
        : EXPRESS_DROP_OFF_FEES_GBP[input.airportCode];
    return `${product} — ${formatExpressDropOffGbp(fee)}`;
  }
  return input.service === "pick-up"
    ? "Free designated pick-up area — short walk from terminal"
    : "Free designated drop-off area — short walk to terminal";
}

/**
 * Customer confirmation lines. Return bookings get one line per applicable leg.
 */
export function formatAirportAccessOptionCustomerLines(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  outboundExpressDropOffSelected?: boolean | null;
  returnExpressDropOffSelected?: boolean | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
}): string[] {
  const selection = resolveExpressDropOff({
    airportCode: input.expressDropOffAirport,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    selected: input.expressDropOffSelected,
    outboundSelected: input.outboundExpressDropOffSelected,
    returnSelected: input.returnExpressDropOffSelected,
  });
  if (!selection.eligible) return [];
  if (selection.legs.length <= 1) {
    const one = formatAirportAccessOptionCustomerLine({
      ...input,
      service: selection.service,
      expressDropOffFee: selection.feeGbp,
    });
    return one ? [one] : [];
  }
  return selection.legs.map((leg) => {
    const charged =
      leg.leg === "return"
        ? input.returnAirportAccessChargeGbp
        : input.outboundAirportAccessChargeGbp;
    const value = formatAirportAccessLegCustomerValue({
      option: leg.selected ? "express" : "free",
      airportCode: leg.airportCode,
      service: leg.service,
      feeGbp: typeof charged === "number" ? charged : leg.chargedFeeGbp,
    });
    const prefix = leg.leg === "outbound" ? "Outbound" : "Return";
    return `${prefix} airport access: ${value}`;
  });
}

export function formatAirportAccessOptionOwnerLines(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  outboundExpressDropOffSelected?: boolean | null;
  returnExpressDropOffSelected?: boolean | null;
  outboundAirportAccessChargeGbp?: number | null;
  returnAirportAccessChargeGbp?: number | null;
}): string[] {
  const selection = resolveExpressDropOff({
    airportCode: input.expressDropOffAirport,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    selected: input.expressDropOffSelected,
    outboundSelected: input.outboundExpressDropOffSelected,
    returnSelected: input.returnExpressDropOffSelected,
  });
  if (!selection.eligible) return [];
  if (selection.legs.length <= 1) {
    const one = formatAirportAccessOptionOwnerLine({
      ...input,
      service: selection.service,
      expressDropOffFee: selection.feeGbp,
    });
    return one ? [one] : [];
  }
  return selection.legs.map((leg) => {
    const charged =
      leg.leg === "return"
        ? input.returnAirportAccessChargeGbp
        : input.outboundAirportAccessChargeGbp;
    const prefix = leg.leg === "outbound" ? "OUTBOUND" : "RETURN";
    if (leg.selected) {
      const fee =
        typeof charged === "number" && charged > 0
          ? roundGbp(charged)
          : EXPRESS_DROP_OFF_FEES_GBP[leg.airportCode];
      return `${prefix} AIRPORT ACCESS: EXPRESS — ${formatExpressDropOffGbp(fee)} PAID`;
    }
    return leg.service === "pick-up"
      ? `${prefix} AIRPORT ACCESS: FREE PICK-UP AREA`
      : `${prefix} AIRPORT ACCESS: FREE DROP-OFF AREA`;
  });
}

/**
 * Owner/admin alert line — intentionally loud for phone scanning.
 * Example: "AIRPORT ACCESS: EXPRESS — £5 PAID"
 * Example: "AIRPORT ACCESS: FREE DROP-OFF AREA"
 */
export function formatAirportAccessOptionOwnerLine(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  service?: ExpressAirportService | null;
}): string | null {
  const option = resolveAirportAccessOption(input);
  if (!option) return null;
  const airport = normaliseExpressDropOffAirport(input.expressDropOffAirport);
  if (!airport) return null;
  const service =
    input.service ?? resolveExpressAirportService({ fromAirport: input.fromAirport });
  if (option === "express") {
    const fee =
      typeof input.expressDropOffFee === "number" && input.expressDropOffFee > 0
        ? roundGbp(input.expressDropOffFee)
        : EXPRESS_DROP_OFF_FEES_GBP[airport];
    const feeLabel = formatExpressDropOffGbp(fee).replace(/^£/, "£");
    return `AIRPORT ACCESS: EXPRESS — ${feeLabel} PAID`;
  }
  return service === "pick-up"
    ? "AIRPORT ACCESS: FREE PICK-UP AREA"
    : "AIRPORT ACCESS: FREE DROP-OFF AREA";
}

/**
 * Owner dashboard detail value (compact, under "Airport access" label).
 * Example: "Express — £5 paid"
 * Example: "Free drop-off area"
 */
export function formatAirportAccessOptionDashboardValue(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  service?: ExpressAirportService | null;
}): string | null {
  const option = resolveAirportAccessOption(input);
  if (!option) return null;
  const airport = normaliseExpressDropOffAirport(input.expressDropOffAirport);
  if (!airport) return null;
  const service =
    input.service ?? resolveExpressAirportService({ fromAirport: input.fromAirport });
  if (option === "express") {
    const fee =
      typeof input.expressDropOffFee === "number" && input.expressDropOffFee > 0
        ? roundGbp(input.expressDropOffFee)
        : EXPRESS_DROP_OFF_FEES_GBP[airport];
    return `Express — ${formatExpressDropOffGbp(fee)} paid`;
  }
  return service === "pick-up" ? "Free pick-up area" : "Free drop-off area";
}

/**
 * Payment / booking may continue when Express is kept, ineligible, or removal is acknowledged.
 */
export function canProceedWithoutExpressDropOff(input: {
  eligible: boolean;
  selected: boolean;
  removalAcknowledged: boolean;
  freeAlternativeAvailable?: boolean;
}): boolean {
  if (!input.eligible || input.selected) return true;
  if (input.freeAlternativeAvailable === false) return false;
  return Boolean(input.removalAcknowledged);
}

/** Every free-alternative Express leg must be acknowledged independently. */
export function canProceedWithoutExpressDropOffLegs(
  selection: ExpressDropOffSelection,
  acknowledgements: {
    outbound?: boolean;
    return?: boolean;
  },
): boolean {
  if (!selection.eligible) return true;
  return selection.legs.every((leg) =>
    canProceedWithoutExpressDropOff({
      eligible: true,
      selected: leg.selected,
      removalAcknowledged:
        leg.leg === "return"
          ? Boolean(acknowledgements.return)
          : Boolean(acknowledgements.outbound),
      freeAlternativeAvailable: leg.freeAlternativeAvailable,
    }),
  );
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

/**
 * When Express becomes newly eligible, default the customer choice to selected.
 * Do not override an explicit remove when the journey was already eligible.
 */
export function shouldDefaultExpressSelectedOnNewEligibility(input: {
  wasEligible: boolean;
  nowEligible: boolean;
}): boolean {
  return Boolean(input.nowEligible) && !Boolean(input.wasEligible);
}

/** Email / summary line when Express applies or was declined. */
export function formatExpressDropOffSummaryLine(input: {
  expressDropOffSelected?: boolean | null;
  expressDropOffFee?: number | null;
  expressDropOffAirport?: string | null;
  fromAirport?: boolean | null;
  service?: ExpressAirportService | null;
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
  const service =
    input.service ?? resolveExpressAirportService({ fromAirport: input.fromAirport });
  const selected = input.expressDropOffSelected !== false;
  const storedFee =
    typeof input.expressDropOffFee === "number" && Number.isFinite(input.expressDropOffFee)
      ? roundGbp(input.expressDropOffFee)
      : null;
  if (selected) {
    const fee = storedFee != null && storedFee > 0 ? storedFee : EXPRESS_DROP_OFF_FEES_GBP[airport];
    if (fee <= 0) return null;
    return expressDropOffBreakdownLabel(airport, true, service, fee);
  }
  // Declined Express — show the airport fee that was removed (not the stored £0).
  const removedFee =
    storedFee != null && storedFee > 0 ? storedFee : EXPRESS_DROP_OFF_FEES_GBP[airport];
  return expressDropOffBreakdownLabel(airport, false, service, removedFee);
}

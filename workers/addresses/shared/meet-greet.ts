/**
 * Optional Meet & Greet airport pickup.
 *
 * An alternative to Express Pick-Up on the same pickup leg — never an extra
 * on top of Express, and never charged on a drop-off leg.
 * Belfast International and Belfast City default to £15. Dublin defaults to £25.
 * Owner pricing can replace those amounts. Percent surcharges do not apply;
 * the fee is a fixed airport-access charge added after the vehicle fare.
 */

export const MEET_GREET_OPTION = "meet-greet" as const;

export const MEET_GREET_DESCRIPTION =
  "Your driver will meet you inside the airport arrivals area with a personalised name board and assist you with your luggage.";

export const MEET_GREET_DRIVER_NOTE =
  "Meet & Greet: enter the terminal arrivals area with a personalised name board and assist with luggage.";

export type MeetGreetAirportCode = "BFS" | "BHD" | "DUB";

export type AirportAccessChoice = "express" | "free" | "meet-greet";

export type MeetGreetFeesGbp = {
  bfsGbp: number;
  bhdGbp: number;
  dubGbp: number;
};

export const DEFAULT_MEET_GREET_FEES_GBP: Record<MeetGreetAirportCode, number> = {
  BFS: 15,
  BHD: 15,
  DUB: 25,
};

export function defaultMeetGreetFees(): MeetGreetFeesGbp {
  return {
    bfsGbp: DEFAULT_MEET_GREET_FEES_GBP.BFS,
    bhdGbp: DEFAULT_MEET_GREET_FEES_GBP.BHD,
    dubGbp: DEFAULT_MEET_GREET_FEES_GBP.DUB,
  };
}

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export function formatMeetGreetGbp(amount: number): string {
  const rounded = roundGbp(amount);
  if (!Number.isFinite(rounded)) return "£—";
  return `£${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)}`;
}

export function normaliseMeetGreetAirport(
  code: string | null | undefined,
): MeetGreetAirportCode | null {
  const normalised = String(code ?? "")
    .trim()
    .toUpperCase();
  if (normalised === "BFS" || normalised === "BHD" || normalised === "DUB") {
    return normalised;
  }
  return null;
}

export function meetGreetFeeGbp(
  airportCode: string | null | undefined,
  fees?: MeetGreetFeesGbp | null,
): number {
  const code = normaliseMeetGreetAirport(airportCode);
  if (!code) return 0;
  const table = fees ?? defaultMeetGreetFees();
  const raw =
    code === "BFS" ? table.bfsGbp : code === "BHD" ? table.bhdGbp : table.dubGbp;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    return DEFAULT_MEET_GREET_FEES_GBP[code];
  }
  return roundGbp(amount);
}

export function parseAirportAccessChoice(
  value: unknown,
  expressSelected = false,
): AirportAccessChoice {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (raw === "meet-greet" || raw === "meetgreet") return "meet-greet";
  if (raw === "express") return "express";
  if (raw === "free") return "free";
  return expressSelected ? "express" : "free";
}

export function isAirportAccessChoice(value: unknown): value is AirportAccessChoice {
  return value === "express" || value === "free" || value === "meet-greet";
}

export type AirportPickupLegRef = {
  leg: "outbound" | "return";
  airportCode: MeetGreetAirportCode;
};

/**
 * Pickup legs only. A to-airport return charges the return leg.
 * A from-airport return charges the outbound leg.
 * Airport-to-airport uses the pickup airport outbound and, on a return,
 * the original drop-off airport as the return pickup.
 */
export function listAirportPickupLegs(input: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  isAirportToAirport?: boolean | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
}): AirportPickupLegRef[] {
  if (input.isAirportToAirport) {
    const legs: AirportPickupLegRef[] = [];
    const pickup = normaliseMeetGreetAirport(input.pickupAirportCode);
    const dropoff = normaliseMeetGreetAirport(input.dropoffAirportCode);
    if (pickup) legs.push({ leg: "outbound", airportCode: pickup });
    if (input.returnJourney && dropoff) legs.push({ leg: "return", airportCode: dropoff });
    return legs;
  }

  const airportCode = normaliseMeetGreetAirport(input.airportCode);
  if (!airportCode) return [];
  const fromAirport = input.fromAirport === true;
  if (fromAirport) {
    return [{ leg: "outbound", airportCode }];
  }
  if (input.returnJourney) {
    return [{ leg: "return", airportCode }];
  }
  return [];
}

export type ExpressLegChargeSnapshot = {
  leg: "outbound" | "return";
  service: "pick-up" | "drop-off";
  airportCode: string;
  selected: boolean;
  chargedFeeGbp: number;
};

export type QuotedAirportAccessLeg = {
  leg: "outbound" | "return";
  service: "pick-up" | "drop-off";
  airportCode: string;
  option: AirportAccessChoice;
  expressFeeGbp: number;
  meetGreetFeeGbp: number;
  chargeGbp: number;
};

export type QuotedAirportAccess = {
  legs: QuotedAirportAccessLeg[];
  airportAccessChargeGbp: number;
  outboundAirportAccessChargeGbp: number;
  returnAirportAccessChargeGbp: number;
  outboundAirportAccessOption: AirportAccessChoice | null;
  returnAirportAccessOption: AirportAccessChoice | null;
  expressDropOffSelected: boolean;
  expressDropOffFee: number;
  expressDropOffAirport: "BFS" | "BHD" | null;
  outboundExpressDropOffSelected: boolean;
  returnExpressDropOffSelected: boolean;
  meetGreetFeeGbp: number;
  /** Pickup-leg option for the single-field driver/reminder flag. */
  airportAccessOption: AirportAccessChoice | null;
};

function expressAirportCode(code: string | null | undefined): "BFS" | "BHD" | null {
  const normalised = String(code ?? "")
    .trim()
    .toUpperCase();
  return normalised === "BFS" || normalised === "BHD" ? normalised : null;
}

/**
 * Express fee and Meet & Greet fee for the same leg are mutually exclusive.
 * Meet & Greet on a drop-off is ignored. Dublin has no Express fee here;
 * its parking and toll stay in the separate fixed-cost total.
 */
export function quoteAirportAccessCharges(input: {
  expressLegs?: ExpressLegChargeSnapshot[] | null;
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  isAirportToAirport?: boolean | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  outboundChoice?: AirportAccessChoice | null;
  returnChoice?: AirportAccessChoice | null;
  fees?: MeetGreetFeesGbp | null;
  /** Executive airport pickup: Meet & Greet is part of the fare, not an extra charge. */
  meetGreetIncluded?: boolean;
}): QuotedAirportAccess {
  const outboundChoice = input.outboundChoice ?? "free";
  const returnChoice = input.returnChoice ?? "free";
  const expressLegs = input.expressLegs ?? [];
  const pickupLegs = listAirportPickupLegs(input);
  const legs: QuotedAirportAccessLeg[] = [];

  for (const expressLeg of expressLegs) {
    const choice = expressLeg.leg === "return" ? returnChoice : outboundChoice;
    const pickup =
      expressLeg.service === "pick-up" &&
      pickupLegs.some((leg) => leg.leg === expressLeg.leg);
    if (pickup && input.meetGreetIncluded) {
      legs.push({
        leg: expressLeg.leg,
        service: "pick-up",
        airportCode: expressLeg.airportCode,
        option: "meet-greet",
        expressFeeGbp: 0,
        meetGreetFeeGbp: 0,
        chargeGbp: 0,
      });
      continue;
    }
    if (pickup && choice === "meet-greet") {
      const fee = meetGreetFeeGbp(expressLeg.airportCode, input.fees);
      legs.push({
        leg: expressLeg.leg,
        service: "pick-up",
        airportCode: expressLeg.airportCode,
        option: "meet-greet",
        expressFeeGbp: 0,
        meetGreetFeeGbp: fee,
        chargeGbp: fee,
      });
      continue;
    }
    const expressFee = expressLeg.selected ? roundGbp(Math.max(0, expressLeg.chargedFeeGbp)) : 0;
    legs.push({
      leg: expressLeg.leg,
      service: expressLeg.service,
      airportCode: expressLeg.airportCode,
      option: expressFee > 0 ? "express" : "free",
      expressFeeGbp: expressFee,
      meetGreetFeeGbp: 0,
      chargeGbp: expressFee,
    });
  }

  for (const pickup of pickupLegs) {
    if (legs.some((leg) => leg.leg === pickup.leg && leg.service === "pick-up")) continue;
    const choice = pickup.leg === "return" ? returnChoice : outboundChoice;
    if (input.meetGreetIncluded) {
      legs.push({
        leg: pickup.leg,
        service: "pick-up",
        airportCode: pickup.airportCode,
        option: "meet-greet",
        expressFeeGbp: 0,
        meetGreetFeeGbp: 0,
        chargeGbp: 0,
      });
      continue;
    }
    if (choice !== "meet-greet") {
      legs.push({
        leg: pickup.leg,
        service: "pick-up",
        airportCode: pickup.airportCode,
        option: "free",
        expressFeeGbp: 0,
        meetGreetFeeGbp: 0,
        chargeGbp: 0,
      });
      continue;
    }
    const fee = meetGreetFeeGbp(pickup.airportCode, input.fees);
    legs.push({
      leg: pickup.leg,
      service: "pick-up",
      airportCode: pickup.airportCode,
      option: "meet-greet",
      expressFeeGbp: 0,
      meetGreetFeeGbp: fee,
      chargeGbp: fee,
    });
  }

  const chargeFor = (legName: "outbound" | "return") =>
    roundGbp(
      legs
        .filter((leg) => leg.leg === legName)
        .reduce((sum, leg) => sum + leg.chargeGbp, 0),
    );
  const optionFor = (legName: "outbound" | "return"): AirportAccessChoice | null => {
    const rows = legs.filter((leg) => leg.leg === legName);
    if (rows.length === 0) return null;
    if (rows.some((row) => row.option === "meet-greet")) return "meet-greet";
    if (rows.some((row) => row.option === "express")) return "express";
    return rows[0]!.option;
  };
  const outbound = legs.find((leg) => leg.leg === "outbound") ?? null;
  const ret = legs.find((leg) => leg.leg === "return") ?? null;
  const outboundAirportAccessChargeGbp = chargeFor("outbound");
  const returnAirportAccessChargeGbp = chargeFor("return");
  const expressDropOffFee = roundGbp(
    legs.reduce((sum, leg) => sum + leg.expressFeeGbp, 0),
  );
  const meetGreetTotalGbp = roundGbp(
    legs.reduce((sum, leg) => sum + leg.meetGreetFeeGbp, 0),
  );
  const expressAirport =
    expressAirportCode(outbound?.airportCode) ??
    expressAirportCode(ret?.airportCode) ??
    expressAirportCode(input.airportCode);
  const pickupOption =
    (input.fromAirport === true ? outbound?.option : null) ??
    (input.returnJourney && input.fromAirport !== true ? ret?.option : null) ??
    legs.find((leg) => leg.option === "meet-greet")?.option ??
    outbound?.option ??
    ret?.option ??
    null;

  return {
    legs,
    airportAccessChargeGbp: roundGbp(
      outboundAirportAccessChargeGbp + returnAirportAccessChargeGbp,
    ),
    outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp,
    outboundAirportAccessOption: optionFor("outbound"),
    returnAirportAccessOption: optionFor("return"),
    expressDropOffSelected: legs.some((leg) => leg.option === "express"),
    expressDropOffFee,
    expressDropOffAirport: expressAirport,
    outboundExpressDropOffSelected: outbound?.option === "express",
    returnExpressDropOffSelected: ret?.option === "express",
    meetGreetFeeGbp: meetGreetTotalGbp,
    airportAccessOption: pickupOption,
  };
}

export function meetGreetCustomerValue(feeGbp: number): string {
  if (roundGbp(feeGbp) <= 0) {
    return `Meet & Greet — included. ${MEET_GREET_DESCRIPTION}`;
  }
  return `Meet & Greet — ${formatMeetGreetGbp(feeGbp)}. ${MEET_GREET_DESCRIPTION}`;
}

export function meetGreetOwnerValue(feeGbp: number): string {
  if (roundGbp(feeGbp) <= 0) {
    return "MEET & GREET — INCLUDED — DRIVER ENTERS TERMINAL";
  }
  return `MEET & GREET — ${formatMeetGreetGbp(feeGbp)} — DRIVER ENTERS TERMINAL`;
}

export function meetGreetDashboardValue(feeGbp: number): string {
  return `Meet & Greet — ${formatMeetGreetGbp(feeGbp)} — enter the terminal`;
}

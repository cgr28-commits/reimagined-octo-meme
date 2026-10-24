import { DEFAULT_TERMINAL_ACCESS_FEES } from "./terminal-access-config";
/** Optional Belfast airport access, charged once per visit after the vehicle fare. */

export const MEET_GREET_OPTION = "meet-greet" as const;

export const MEET_GREET_DESCRIPTION =
  "Your driver will meet you inside the airport arrivals area with a personalised name board and assist you with your luggage.";

export const MEET_GREET_DRIVER_NOTE =
  "Meet & Greet: enter the terminal arrivals area with a personalised name board and assist with luggage.";

export type MeetGreetAirportCode = "BFS" | "BHD" | "DUB";

export type AirportAccessChoice = "express" | "free" | "meet-greet";

export type TerminalAccessChoices = Partial<Record<string, AirportAccessChoice>>;

export function airportVisitKey(visit: {leg: string; airportCode: string; service: string}): string {
  return `${visit.leg}:${visit.airportCode}:${visit.service}`;
}

/** Allow only choices; browser-supplied prices and unknown keys never enter pricing. */
export function parseTerminalAccessChoices(value: unknown): TerminalAccessChoices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, choice]) =>
    /^(outbound|return):(BFS|BHD):(pick-up|drop-off)$/.test(key) && isAirportAccessChoice(choice)
  )) as TerminalAccessChoices;
}

export function listTerminalAccessVisits(input: {
  airportCode?: string | null; fromAirport?: boolean | null; returnJourney?: boolean | null;
  isAirportToAirport?: boolean | null; pickupAirportCode?: string | null; dropoffAirportCode?: string | null;
}): Array<{leg: "outbound" | "return"; service: "pick-up" | "drop-off"; airportCode: "BFS" | "BHD"}> {
  const rows: Array<{leg: "outbound" | "return"; service: "pick-up" | "drop-off"; airportCode: "BFS" | "BHD"}> = [];
  const add = (leg: "outbound" | "return", service: "pick-up" | "drop-off", airport: string | null | undefined) => {
    if (airport === "BFS" || airport === "BHD") rows.push({ leg, service, airportCode: airport });
  };
  if (input.isAirportToAirport) {
    add("outbound", "pick-up", input.pickupAirportCode);
    add("outbound", "drop-off", input.dropoffAirportCode);
    if (input.returnJourney) {
      add("return", "pick-up", input.dropoffAirportCode);
      add("return", "drop-off", input.pickupAirportCode);
    }
  } else {
    add("outbound", input.fromAirport ? "pick-up" : "drop-off", input.airportCode);
    if (input.returnJourney) add("return", input.fromAirport ? "drop-off" : "pick-up", input.airportCode);
  }
  return rows;
}

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
  /** Catalogue terminal-access fee for this visit; charged only when chosen. */
  feeGbp?: number;
  /** Same catalogue fee under the resolved-leg name. */
  feeIfSelectedGbp?: number;
};

/** Legacy catalogue fee fallback; the choice resolver decides whether it is charged. */
export function mandatoryTerminalFeeGbp(leg: ExpressLegChargeSnapshot): number {
  const catalogue = roundGbp(Math.max(0, Number(leg.feeGbp) || 0));
  if (catalogue > 0) return catalogue;
  const ifSelected = roundGbp(Math.max(0, Number(leg.feeIfSelectedGbp) || 0));
  if (ifSelected > 0) return ifSelected;
  return roundGbp(Math.max(0, Number(leg.chargedFeeGbp) || 0));
}

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

/** Resolve optional Belfast services once per visit. Dublin fixed costs stay in the vehicle quote. */
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
  terminalAccessFees?: { bfsGbp: number; bhdGbp: number };
  visitChoices?: TerminalAccessChoices;
}): QuotedAirportAccess {
  const expressLegs: ExpressLegChargeSnapshot[] = listTerminalAccessVisits(input).map(visit => {
    const prior = input.expressLegs?.find(row => airportVisitKey(row) === airportVisitKey(visit));
    return prior ?? { ...visit, selected: false, chargedFeeGbp: 0, feeGbp: visit.airportCode === "BFS" ? DEFAULT_TERMINAL_ACCESS_FEES.bfsGbp : DEFAULT_TERMINAL_ACCESS_FEES.bhdGbp };
  });
  const pickupLegs = listAirportPickupLegs(input);
  const legs: QuotedAirportAccessLeg[] = [];

  for (const visit of expressLegs) {
    const pickup = visit.service === "pick-up";
    const requested = input.visitChoices?.[airportVisitKey(visit)] ?? (visit.leg === "return" ? input.returnChoice : input.outboundChoice);
    const option: AirportAccessChoice = pickup && input.meetGreetIncluded
      ? "meet-greet"
      : requested === "meet-greet" && pickup ? "meet-greet"
      : requested === "express" ? "express" : "free";
    const configured = visit.airportCode === "BFS"
      ? input.terminalAccessFees?.bfsGbp : input.terminalAccessFees?.bhdGbp;
    const terminalFee = configured == null ? mandatoryTerminalFeeGbp(visit) : roundGbp(Math.max(0, configured));
    const expressFeeGbp = option === "express" ? terminalFee : 0;
    const meetGreetFee = option === "meet-greet" && !input.meetGreetIncluded
      ? meetGreetFeeGbp(visit.airportCode, input.fees) : 0;
    legs.push({ leg: visit.leg, service: visit.service, airportCode: visit.airportCode, option, expressFeeGbp, meetGreetFeeGbp: meetGreetFee,
      chargeGbp: roundGbp(expressFeeGbp + meetGreetFee) });
  }

  for (const pickup of pickupLegs) {
    if (legs.some((leg) => leg.leg === pickup.leg && leg.service === "pick-up")) continue;
    // Dublin parking and toll stay in fixed costs. Meet & Greet is not sold on top.
    legs.push({
      leg: pickup.leg,
      service: "pick-up",
      airportCode: pickup.airportCode,
      option: input.meetGreetIncluded ? "meet-greet" : "free",
      expressFeeGbp: 0,
      meetGreetFeeGbp: 0,
      chargeGbp: 0,
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
    airportAccessOption:
      input.meetGreetIncluded && pickupLegs.length > 0 ? "meet-greet" : pickupOption,
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

import { extractPostcode } from "./address-validation";
import { isServedAirportLabel } from "./served-airports";
import { roundGbp } from "./gbp";
import { getAirportLegFixedCostGbp } from "./airport-fixed-costs";
import { EXPRESS_DROP_OFF_FEES_GBP } from "./express-drop-off";

export const POSTCODE_AIRPORTS = { BFS: "Belfast International Airport", BHD: "Belfast City Airport", DUB: "Dublin Airport", LDY: "City of Derry Airport" } as const;
export type PostcodeAirport = keyof typeof POSTCODE_AIRPORTS;
/** Direction is deliberately district → airport only. Fare includes the normal airport costs. */
export type PostcodePricingRule = { district: string; airportCode: PostcodeAirport; saloonFareGbp: number; enabled: boolean };

/** Proposal only: never installed into live/default settings automatically. */
export const PROPOSED_POSTCODE_RULES: PostcodePricingRule[] = [
  { district: "BT1", airportCode: "DUB", saloonFareGbp: 245, enabled: true },
  { district: "BT2", airportCode: "DUB", saloonFareGbp: 245, enabled: true },
];

/** Approved amounts, staged only. Deployment and an explicit owner Save are still required. */
export const APPROVED_POSTCODE_RULES: PostcodePricingRule[] = [
  ...PROPOSED_POSTCODE_RULES,
  { district: "BT1", airportCode: "BFS", saloonFareGbp: 55, enabled: true },
  { district: "BT2", airportCode: "BFS", saloonFareGbp: 55, enabled: true },
  { district: "BT1", airportCode: "BHD", saloonFareGbp: 35, enabled: true },
  { district: "BT2", airportCode: "BHD", saloonFareGbp: 35, enabled: true },
];

/** These charges are composed later by the existing access/checkout path, not the base quote. */
export function postcodeTerminalAccessGbp(airportCode: string): number {
  return airportCode === "BFS" || airportCode === "BHD" ? EXPRESS_DROP_OFF_FEES_GBP[airportCode] : 0;
}

export function validatePostcodeRules(raw: unknown): { rules: PostcodePricingRule[]; errors: string[] } {
  if (raw == null) return { rules: [], errors: [] };
  if (!Array.isArray(raw) || raw.length > 200) return { rules: [], errors: ["Use a list of at most 200 postcode pricing rules."] };
  const rules: PostcodePricingRule[] = [], errors: string[] = [], keys = new Set<string>();
  for (const value of raw) {
    const r = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const district = String(r.district ?? "").trim().toUpperCase();
    const airportCode = String(r.airportCode ?? "").trim().toUpperCase() as PostcodeAirport;
    const fare = r.saloonFareGbp;
    const key = `${district}:${airportCode}`;
    if (!/^BT[1-9]\d?$/.test(district)) errors.push("Enter a complete postcode district, such as BT1 or BT12 (not a full postcode).");
    if (!Object.prototype.hasOwnProperty.call(POSTCODE_AIRPORTS, airportCode)) errors.push("Select a supported airport.");
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0 || fare > 10000 || Math.abs(fare * 100 - Math.round(fare * 100)) > 0.00001) errors.push("Saloon fare must be between £0.01 and £10,000, with at most two decimal places.");
    if (typeof fare === "number" && fare < getAirportLegFixedCostGbp(airportCode, false) + postcodeTerminalAccessGbp(airportCode)) errors.push("The fixed fare must cover the existing included airport costs.");
    if (typeof r.enabled !== "boolean") errors.push("Choose enabled or disabled for each rule.");
    if (keys.has(key)) errors.push(`Only one rule is allowed for ${district} to ${airportCode}.`);
    keys.add(key);
    rules.push({ district, airportCode, saloonFareGbp: Number(fare), enabled: r.enabled === true });
  }
  return { rules, errors };
}

export type PostcodeJourneyContext = { address: string; airportCode: string; fromAirport: boolean };

/** Existing address parser requires a full postcode; exact outward equality prevents BT1/BT10 collisions. */
export function findPostcodeFare(rules: PostcodePricingRule[] | undefined, context: PostcodeJourneyContext, vehicle: string, estateSupplement: number): number | null {
  if (context.fromAirport || isServedAirportLabel(context.address) || /executive|business class|minibus/i.test(vehicle)) return null;
  if (!/saloon|estate/i.test(vehicle)) return null;
  const full = extractPostcode(context.address);
  // The final three characters are always the inward code, including unspaced BT15GS.
  const district = full?.replace(/\s/g, "").slice(0, -3);
  if (!district) return null;
  const rule = rules?.find(r => r.enabled && r.district === district && r.airportCode === context.airportCode);
  if (!rule) return null;
  return roundGbp(rule.saloonFareGbp + (/estate/i.test(vehicle) ? estateSupplement : 0));
}

/** Split all included costs out. Existing base/fixed/access composition adds each back once. */
export function postcodeJourneyLegs(input: { rules?: PostcodePricingRule[]; context?: PostcodeJourneyContext; vehicle: string; estateSupplement: number; returnJourney: boolean; outboundFixed: number; returnFixed: number }) {
  const { context } = input;
  if (!context) return { outbound: null, inbound: null };
  const fare = (fromAirport: boolean, fixed: number) => {
    const total = findPostcodeFare(input.rules, { ...context, fromAirport }, input.vehicle, input.estateSupplement);
    return total == null ? null : roundGbp(Math.max(0, total - fixed - postcodeTerminalAccessGbp(context.airportCode)));
  };
  return { outbound: fare(context.fromAirport, input.outboundFixed), inbound: input.returnJourney ? fare(!context.fromAirport, input.returnFixed) : null };
}

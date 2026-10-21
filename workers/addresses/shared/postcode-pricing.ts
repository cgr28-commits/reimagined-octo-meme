import { extractPostcode } from "./address-validation";
import { isServedAirportLabel } from "./served-airports";
import { roundGbp } from "./gbp";
import { getAirportLegFixedCostGbp } from "./airport-fixed-costs";
import { EXPRESS_DROP_OFF_FEES_GBP } from "./express-drop-off";

export const POSTCODE_AIRPORTS = { BFS: "Belfast International Airport", BHD: "Belfast City Airport", DUB: "Dublin Airport", LDY: "City of Derry Airport" } as const;
export type PostcodeAirport = keyof typeof POSTCODE_AIRPORTS;
export type PostcodeDirection = "to-airport" | "from-airport";
export type PostcodeApproval = "approved" | "draft" | "needs-verification";
/** Missing direction/status on pre-existing rules retains the original approved outbound meaning. */
export type PostcodePricingRule = { district: string; airportCode: PostcodeAirport; saloonFareGbp: number; enabled: boolean; direction?: PostcodeDirection; approvalStatus?: PostcodeApproval; updatedAt?: string };
export const BT_DISTRICTS = Array.from({ length: 94 }, (_, i) => i + 1)
  .filter(n => ![50, 59, 72, 73, 83, 84, 85, 86, 87, 88, 89, 90, 91].includes(n)).map(n => `BT${n}`);
export const postcodeRuleKey = (r: PostcodePricingRule) => `${r.district}:${r.airportCode}:${r.direction ?? "to-airport"}`;
export const postcodeRuleApproval = (r: PostcodePricingRule): PostcodeApproval => r.approvalStatus ?? (r.direction == null && r.enabled === true ? "approved" : "draft");
export const postcodeRuleApproved = (r: PostcodePricingRule) => postcodeRuleApproval(r) === "approved";

/** Read-only compatibility policy. Explicit booleans always win. Only already-active,
 * approved rules preserve an absent legacy switch; no record is created or enabled.
 */
export function postcodePricingIsEnabled(value: unknown, rules?: PostcodePricingRule[]): boolean {
  // Retired for the mileage tariff; keep saved rules available for rollback.
  void value;
  void rules;
  return false;
}

/** Full postcode only; conflicting postcodes and invalid inward letters fail closed. */
export function postcodeDistrict(address: string): string | null {
  const matches = [...address.matchAll(/\bBT\d{1,2}\s?\d[A-Z]{2}\b/gi)].map(m => m[0].replace(/\s/g, "").toUpperCase());
  if (new Set(matches).size !== 1 || !/^BT[1-9]\d?\d[ABDEFGHJLNPQRSTUWXYZ]{2}$/.test(matches[0])) return null;
  const full = extractPostcode(matches[0]);
  const district = full?.slice(0, -3);
  return district && BT_DISTRICTS.includes(district) ? district : null;
}

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
  if (!Array.isArray(raw) || raw.length > 700) return { rules: [], errors: ["Use a list of at most 700 postcode pricing rules."] };
  const rules: PostcodePricingRule[] = [], errors: string[] = [], keys = new Set<string>();
  for (const value of raw) {
    const r = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const district = String(r.district ?? "").trim().toUpperCase();
    const airportCode = String(r.airportCode ?? "").trim().toUpperCase() as PostcodeAirport;
    const fare = r.saloonFareGbp;
    const direction = r.direction ?? "to-airport";
    const approvalStatus = r.approvalStatus ?? (r.direction == null && r.enabled === true ? "approved" : "draft");
    const key = `${district}:${airportCode}:${direction}`;
    if (!BT_DISTRICTS.includes(district)) errors.push("Enter a valid complete BT postcode district, such as BT1 or BT12 (not a full postcode).");
    if (direction !== "to-airport" && direction !== "from-airport") errors.push("Select to-airport or from-airport direction.");
    if (!["approved", "draft", "needs-verification"].includes(String(approvalStatus))) errors.push("Select a valid approval status.");
    if (r.enabled === true && approvalStatus !== "approved") errors.push("Only approved fares can be enabled.");
    if (!Object.prototype.hasOwnProperty.call(POSTCODE_AIRPORTS, airportCode)) errors.push("Select a supported airport.");
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0 || fare > 10000 || Math.abs(fare * 100 - Math.round(fare * 100)) > 0.00001) errors.push("Saloon fare must be between £0.01 and £10,000, with at most two decimal places.");
    if (typeof fare === "number" && fare < getAirportLegFixedCostGbp(airportCode, direction === "from-airport") + postcodeTerminalAccessGbp(airportCode)) errors.push("The fixed fare must cover the existing included airport costs.");
    if (typeof r.enabled !== "boolean") errors.push("Choose enabled or disabled for each rule.");
    if (keys.has(key)) errors.push(`Only one rule is allowed for ${district}, ${airportCode}, ${direction}.`);
    keys.add(key);
    rules.push({ district, airportCode, saloonFareGbp: Number(fare), enabled: r.enabled === true,
      ...(r.direction != null ? { direction: direction as PostcodeDirection } : {}),
      ...(r.approvalStatus != null ? { approvalStatus: approvalStatus as PostcodeApproval } : {}),
      ...(typeof r.updatedAt === "string" && Number.isFinite(Date.parse(r.updatedAt)) ? { updatedAt: r.updatedAt } : {}),
    });
  }
  return { rules, errors };
}

export type PostcodeJourneyContext = { address: string; airportCode: string; fromAirport: boolean };

/** Existing address parser requires a full postcode; exact outward equality prevents BT1/BT10 collisions. */
export function findPostcodeFare(rules: PostcodePricingRule[] | undefined, context: PostcodeJourneyContext, vehicle: string, estateSupplement: number): number | null {
  if (isServedAirportLabel(context.address) || /executive|business class|minibus/i.test(vehicle)) return null;
  if (!/saloon|estate/i.test(vehicle)) return null;
  const district = postcodeDistrict(context.address);
  if (!district) return null;
  const rule = rules?.find(r => r.enabled && postcodeRuleApproved(r) && (r.direction ?? "to-airport") === (context.fromAirport ? "from-airport" : "to-airport") && r.district === district && r.airportCode === context.airportCode);
  if (!rule) return null;
  return (Math.round(rule.saloonFareGbp * 100) + (/estate/i.test(vehicle) ? Math.round(estateSupplement * 100) : 0)) / 100;
}

/** A deliberately configured pence fare must not be rounded to a different fixed price.
 * Ordinary fares and existing whole-pound postcode fares retain their final rounding policy.
 */
export function postcodeFareHasPence(input: { enabled?: boolean; rules?: PostcodePricingRule[]; context: PostcodeJourneyContext; vehicle: string; estateSupplement: number; returnJourney: boolean }): boolean {
  if (!postcodePricingIsEnabled(input.enabled, input.rules)) return false;
  return [input.context.fromAirport, ...(input.returnJourney ? [!input.context.fromAirport] : [])].some(fromAirport => {
    const fare = findPostcodeFare(input.rules, { ...input.context, fromAirport }, input.vehicle, input.estateSupplement);
    return fare != null && Math.round(fare * 100) % 100 !== 0;
  });
}

/** Split all included costs out. Existing base/fixed/access composition adds each back once. */
export function postcodeJourneyLegs(input: { enabled?: boolean; rules?: PostcodePricingRule[]; context?: PostcodeJourneyContext; vehicle: string; estateSupplement: number; returnJourney: boolean; outboundFixed: number; returnFixed: number }) {
  const { context } = input;
  if (!context || !postcodePricingIsEnabled(input.enabled, input.rules)) return { outbound: null, inbound: null };
  const fare = (fromAirport: boolean, fixed: number) => {
    const total = findPostcodeFare(input.rules, { ...context, fromAirport }, input.vehicle, input.estateSupplement);
    return total == null ? null : roundGbp(Math.max(0, total - fixed - postcodeTerminalAccessGbp(context.airportCode)));
  };
  return { outbound: fare(context.fromAirport, input.outboundFixed), inbound: input.returnJourney ? fare(!context.fromAirport, input.returnFixed) : null };
}

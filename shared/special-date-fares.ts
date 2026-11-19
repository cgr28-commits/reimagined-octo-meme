import { ownerRuleForVenue, pickupAtRulePlace, type EventVenuePickup } from "./event-venue-pickups";

/** Windows use the pickup's local date and time in Europe/London, inclusive to the minute. */
export type SpecialDateFare = {
  name: string;
  enabled: boolean;
  start: string;
  end: string;
  annual: boolean;
  direction: "all" | "to" | "from" | "either";
  venue: string;
  rate: number;
};

export function defaultSpecialDateFares(): SpecialDateFare[] {
  return [
    { name: "Garth Brooks", enabled: true, start: "2027-05-21T00:00", end: "2027-05-23T23:59",
      annual: false, direction: "to", venue: "Boucher Road", rate: 0.25 },
    { name: "New Year", enabled: true, start: "2026-12-31T00:00", end: "2027-01-01T23:59",
      annual: true, direction: "all", venue: "", rate: 0.5 },
  ];
}

export function validFareMinute(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const timestamp = new Date(value + ":00Z");
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString().startsWith(value);
}

function addressWords(value: string): string {
  return value.toLowerCase().replace(/\brd\b/g, "road").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function validateSpecialDateFares(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length > 100) return "Use up to 100 special date rules.";
  for (const [i, rule] of value.entries()) {
    const prefix = `Special date rule ${i + 1}`;
    if (!rule || typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 80)
      return `${prefix} needs a name of up to 80 characters.`;
    if (!validFareMinute(rule.start) || !validFareMinute(rule.end) || rule.start > rule.end)
      return `${prefix} needs a valid start and end in time order.`;
    if (rule.annual && Date.parse(rule.end + ":00Z") - Date.parse(rule.start + ":00Z") >= 366 * 86400000)
      return `${prefix} must repeat within a year.`;
    if (typeof rule.enabled !== "boolean" || typeof rule.annual !== "boolean" ||
        !["all", "to", "from", "either"].includes(rule.direction)) return `${prefix} has invalid options.`;
    if (typeof rule.venue !== "string" || rule.venue.length > 150 ||
        (rule.direction !== "all" && !addressWords(rule.venue))) return `${prefix} needs a venue or road name.`;
    if (!Number.isFinite(rule.rate) || rule.rate < 0 || rule.rate > 1) return `${prefix} needs a percentage between 0 and 100.`;
  }
}

export type FareEndpoints = { pickup?: string; dropoff?: string };

export function matchingSpecialDateFare(
  rules: readonly SpecialDateFare[], date: string, time: string, endpoints: FareEndpoints,
  events: readonly EventVenuePickup[] = [],
): SpecialDateFare | undefined {
  const minute = date + "T" + time;
  if (!validFareMinute(minute)) return;
  const matches = (address: string | undefined, venue: string) =>
    (" " + addressWords(address ?? "") + " ").includes(" " + addressWords(venue) + " ");
  let highest: SpecialDateFare | undefined;
  for (const rule of rules) {
    if (!rule.enabled || rule.rate <= (highest?.rate ?? 0)) continue;
    const start = rule.annual ? rule.start.slice(5) : rule.start;
    const end = rule.annual ? rule.end.slice(5) : rule.end;
    const key = rule.annual ? minute.slice(5) : minute;
    if (start <= end ? key < start || key > end : key < start && key > end) continue;
    if (rule.direction === "all" || (rule.direction !== "from" && matches(endpoints.dropoff, rule.venue))) {
      highest = rule;
    } else if (rule.direction !== "to") {
      const venues = events.filter(event => ownerRuleForVenue(rule, event));
      const pickupMatches = venues.length
        ? venues.some(event => pickupAtRulePlace(endpoints.pickup, rule, event))
        : matches(endpoints.pickup, rule.venue);
      if (pickupMatches) highest = rule;
    }
  }
  return highest;
}

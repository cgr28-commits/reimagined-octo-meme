import { eventCityForArea, type BelfastEventRecord, type EventCity } from "./belfast-events";
import type { SpecialDateFare } from "./special-date-fares";

export const EVENT_VENUE_PICKUP_RATE = 0.25;

export type EventVenuePickup = {
  name: string;
  city: EventCity;
  venueNames: string[];
  pickupPoint?: string;
  start: string;
  end: string;
};

// Alternate map labels for the same venue. Match each as a complete place name.
const mapNames: Record<string, string[]> = {
  "boucher-road-playing-fields": ["Boucher Playing Fields"],
  "the-o2-belfast": ["The SSE Arena", "SSE Arena Belfast", "The SSE Arena Belfast"],
  "kingspan-stadium": ["Affidea Stadium", "Kingspan Stadium"],
  "national-stadium-windsor-park": ["Windsor Park"],
  "waterfront-hall": ["Waterfront Hall"],
  "belfast-city-hall": ["Belfast City Hall"],
  "stormont-estate": ["Parliament Buildings"],
  "croke-park": ["Croke Park Stadium"],
  "merrion-square": ["Merrion Square Park"],
};

function placeKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/['’]/g, "").replace(/\brd\b/g, "road").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isSpecificPickup(name: string): boolean {
  const key = placeKey(name);
  return Boolean(key) && !/\b(?:hotel|airport|hostel)\b/.test(key) &&
    !/^(?:(?:belfast|dublin)(?: city)?|(?:belfast |dublin )?(?:city |town )?cent(?:re|er))$/.test(key);
}

export function publishedVenuePickup(event: BelfastEventRecord, today: string): EventVenuePickup | null {
  if (event.status !== "published") return null;
  const venueNames = [event.venueName, ...(mapNames[event.venueId] ?? [])]
    .map(name => name.split(",")[0].trim()).filter(isSpecificPickup);
  const point = event.pickupPoint?.split(",")[0].trim();
  const pickupPoint = point && isSpecificPickup(point) ? point : undefined;
  if (!venueNames.length && !pickupPoint) return null;
  let end = event.date + "T23:59";
  if (event.startTime && event.endTime && event.endTime < event.startTime) {
    const nextDay = new Date(event.date + "T12:00:00Z");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    end = nextDay.toISOString().slice(0, 10) + "T" + event.endTime;
  }
  if (end.slice(0, 10) < today) return null;
  return { name: event.title, city: eventCityForArea(event.venueArea), venueNames, pickupPoint, start: event.date + "T00:00", end };
}

/** Match the selected place itself. A hotel name or a street line mentioning a stadium is insufficient. */
function isPickupAddress(address: string, city: EventCity, places: string[]): boolean {
  const [name, ...locality] = address.split(",");
  const pickup = placeKey(name);
  const cityOrPostcode = city === "belfast"
    ? /^(?:belfast(?:\s+bt\d.*)?|bt(?:[1-9]|1[0-7])(?:\s?\d[a-z]{2})?)$/i
    : /^(?:(?:co(?:unty)?\.?\s+)?dublin(?:\s+(?:\d{1,2}w?|d\w+)(?:\s+\w+)?)?|d(?:0[1-9]|1\d|2[0-4]|6w)(?:\s?\w{4})?)$/i;
  if (locality.length && !locality.some(part => cityOrPostcode.test(part.trim()))) return false;
  return places.some(place => pickup === placeKey(place) || pickup === placeKey(place + " " + city));
}

/** An owner-set collection window replaces the automatic rate at that point for that event. */
export function ownerRuleForVenue(rule: SpecialDateFare, event: EventVenuePickup): boolean {
  if (rule.direction !== "from" && rule.direction !== "either") return false;
  const place = placeKey(rule.venue);
  if (!event.venueNames.some(p => placeKey(p) === place) && placeKey(event.pickupPoint ?? "") !== place) return false;
  const start = rule.annual ? rule.start.slice(5) : rule.start;
  const end = rule.annual ? rule.end.slice(5) : rule.end;
  const first = rule.annual ? event.start.slice(5) : event.start;
  const last = rule.annual ? event.end.slice(5) : event.end;
  if (start > end && first > last) return true;
  return start > end || first > last ? start <= last || first <= end : start <= last && first <= end;
}

export function pickupAtRulePlace(address: string | undefined, rule: SpecialDateFare, event: EventVenuePickup): boolean {
  const places = event.pickupPoint && placeKey(event.pickupPoint) === placeKey(rule.venue) ? [event.pickupPoint] : event.venueNames;
  return Boolean(address && isPickupAddress(address, event.city, places));
}

function atEventPickup(address: string, event: EventVenuePickup): boolean {
  const places = event.pickupPoint ? [...event.venueNames, event.pickupPoint] : event.venueNames;
  return isPickupAddress(address, event.city, places);
}

export function isPublishedPickupPlace(events: readonly EventVenuePickup[] | undefined, address: string): boolean {
  return Boolean(address && events?.some(event => atEventPickup(address, event)));
}

export function matchingEventVenuePickup(
  events: readonly EventVenuePickup[], rules: readonly SpecialDateFare[], minute: string, address?: string,
): { name: string; rate: number } | undefined {
  if (!address) return;
  for (const event of events) {
    if (minute < event.start || minute > event.end) continue;
    if (!atEventPickup(address, event)) continue;
    if (rules.some(rule => ownerRuleForVenue(rule, event) && pickupAtRulePlace(address, rule, event))) continue;
    return { name: event.name + " venue pickup", rate: EVENT_VENUE_PICKUP_RATE };
  }
}

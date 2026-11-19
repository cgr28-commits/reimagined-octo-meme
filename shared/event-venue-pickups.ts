import { eventCityForArea, type BelfastEventRecord, type EventCity } from "./belfast-events";
import type { SpecialDateFare } from "./special-date-fares";

export const EVENT_VENUE_PICKUP_RATE = 0.25;

export type EventVenuePickup = {
  name: string;
  city: EventCity;
  venueNames: string[];
  pickupPoint?: string;
  highDemandPickupPercent?: number;
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
    .map(name => name.trim()).filter(name => isSpecificPickup(name.split(",")[0]));
  const point = event.pickupPoint?.trim();
  const pickupPoint = point && isSpecificPickup(point.split(",")[0]) ? point : undefined;
  if (!venueNames.length && !pickupPoint) return null;
  let end = event.date + "T23:59";
  if (event.startTime && event.endTime && event.endTime < event.startTime) {
    const nextDay = new Date(event.date + "T12:00:00Z");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    end = nextDay.toISOString().slice(0, 10) + "T" + event.endTime;
  }
  if (end.slice(0, 10) < today) return null;
  return {
    name: event.title, city: eventCityForArea(event.venueArea), venueNames, pickupPoint,
    ...(event.highDemandPickupPercent ? { highDemandPickupPercent: event.highDemandPickupPercent } : {}),
    start: event.date + "T00:00", end,
  };
}

function addressParts(value: string): string[] {
  return value.split(",").map(placeKey).filter(Boolean);
}

function isCityOrPostcode(part: string, city: EventCity): boolean {
  return city === "belfast"
    ? /^(?:belfast(?: bt\d.*)?|bt(?:[1-9]|1[0-7])(?: ?\d[a-z]{2})?)$/.test(part)
    : /^(?:(?:co(?:unty)? )?dublin(?: (?:\d{1,2}w?|d\w+)(?: \w+)?)?|d(?:0[1-9]|1\d|2[0-4]|6w)(?: ?\w{4})?)$/.test(part);
}

function isGenericSiteName(part: string): boolean {
  return /^(?:(?:the|main|north|south|east|west|upper|lower|front|rear|side|public|visitor) )*(?:entrance|exit|gate|car park|meeting point|collection point|pickup point|pick up point)(?: (?:[a-z]|\d+[a-z]?|entrance|exit|collection point))?$/.test(part);
}

function isCountry(part: string): boolean {
  return /^(?:uk|united kingdom|northern ireland|ireland|republic of ireland)$/.test(part);
}

/** Compare the selected place name, plus any venue or street specified by the owner. */
function isPickupAddress(address: string, city: EventCity, places: string[], venueAnchors?: string[]): boolean {
  const [name, ...location] = addressParts(address);
  if (!name || (location.length && !location.some(part => isCityOrPostcode(part, city)))) return false;
  const details = location.filter(part => !isCountry(part) && !isCityOrPostcode(part, city));
  return places.some(place => {
    const [wanted, ...qualifiers] = addressParts(place);
    if (name !== wanted && name !== wanted + " " + city) return false;
    const locality = qualifiers.filter(part => isCityOrPostcode(part, city));
    if (!locality.every(part => location.some(actual => actual === part || actual.startsWith(part + " ")))) return false;
    const site = qualifiers.filter(part => !isCountry(part) && !isCityOrPostcode(part, city));
    if (site.some(part => /\b(?:hotel|hostel|airport)$/.test(part))) return false;
    if (site.length) return site.every((part, i) => details[i] === part);
    if (!venueAnchors) return !isGenericSiteName(wanted);
    if (/^\d+[a-z]?\s+\S/.test(wanted)) return true;
    // A city alone cannot identify a separately named gate, car park or entrance.
    // Accept an unqualified point when its name or the next address line identifies the venue.
    return venueAnchors.some(venue => {
      const [anchor] = addressParts(venue);
      return wanted === anchor || wanted.startsWith(anchor + " ") || details[0] === anchor;
    });
  });
}

function ruleTargetsPoint(rule: SpecialDateFare, event: EventVenuePickup): boolean {
  if (!event.pickupPoint) return false;
  const name = placeKey(rule.venue);
  return name === placeKey(event.pickupPoint) || name === addressParts(event.pickupPoint)[0];
}

/** An owner-set collection window replaces the automatic rate at that point for that event. */
export function ownerRuleForVenue(rule: SpecialDateFare, event: EventVenuePickup): boolean {
  if (rule.direction !== "from" && rule.direction !== "either") return false;
  const place = placeKey(rule.venue);
  if (!event.venueNames.some(p => placeKey(p) === place || addressParts(p)[0] === place) && !ruleTargetsPoint(rule, event)) return false;
  const start = rule.annual ? rule.start.slice(5) : rule.start;
  const end = rule.annual ? rule.end.slice(5) : rule.end;
  const first = rule.annual ? event.start.slice(5) : event.start;
  const last = rule.annual ? event.end.slice(5) : event.end;
  if (start > end && first > last) return true;
  return start > end || first > last ? start <= last || first <= end : start <= last && first <= end;
}

export function pickupAtRulePlace(address: string | undefined, rule: SpecialDateFare, event: EventVenuePickup): boolean {
  if (!address) return false;
  if (event.pickupPoint && ruleTargetsPoint(rule, event)) return isPickupAddress(address, event.city, [event.pickupPoint], event.venueNames);
  return isPickupAddress(address, event.city, event.venueNames);
}

function atEventPickup(address: string, event: EventVenuePickup): boolean {
  return isPickupAddress(address, event.city, event.venueNames) ||
    Boolean(event.pickupPoint && isPickupAddress(address, event.city, [event.pickupPoint], event.venueNames));
}

export function isPublishedPickupPlace(events: readonly EventVenuePickup[] | undefined, address: string): boolean {
  return Boolean(address && events?.some(event => atEventPickup(address, event)));
}

/** A date notice describes local demand. Only the actual pickup is used to price a leg. */
export function highDemandVenueOnDate(
  events: readonly EventVenuePickup[] | undefined, date: string, addresses: readonly string[], eventTitle?: string,
): string | undefined {
  if (!date) return;
  return events?.find(event => event.highDemandPickupPercent && event.start.slice(0, 10) <= date && date <= event.end.slice(0, 10) &&
    (event.name === eventTitle || addresses.some(address => atEventPickup(address, event))))?.venueNames[0];
}

export function matchingEventVenuePickup(
  events: readonly EventVenuePickup[], rules: readonly SpecialDateFare[], minute: string, address?: string,
): { name: string; rate: number } | undefined {
  if (!address) return;
  let best: { name: string; rate: number } | undefined;
  for (const event of events) {
    if (minute < event.start || minute > event.end) continue;
    if (!atEventPickup(address, event)) continue;
    if (rules.some(rule => ownerRuleForVenue(rule, event) && pickupAtRulePlace(address, rule, event))) continue;
    const rate = event.highDemandPickupPercent != null ? event.highDemandPickupPercent / 100 : EVENT_VENUE_PICKUP_RATE;
    if (!best || rate > best.rate) best = { name: event.name + " venue pickup", rate };
  }
  return best;
}

/**
 * First-class served airports for autocomplete + address validation.
 * Coordinates / place IDs match the customer quote quick-select catalogue.
 */

export type ServedAirportCode = "BFS" | "BHD" | "DUB" | "LDY";

export type ServedAirport = {
  code: ServedAirportCode;
  /** Short UI label */
  label: string;
  /** Primary customer-facing name used in suggestions */
  name: string;
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  countryCode: "GB" | "IE";
  postalCode: string | null;
  /** Query matchers — keep Dublin requiring explicit “airport” / DUB */
  patterns: RegExp[];
};

/**
 * Canonical served airports (BFS, BHD, DUB — plus LDY where offered).
 * Do not invent coordinates; these match the existing quote quick-select data.
 */
export const SERVED_AIRPORTS: readonly ServedAirport[] = [
  {
    code: "BFS",
    label: "Belfast International",
    name: "Belfast International Airport",
    placeId: "ChIJy4dKsjJVYEgRntaoTC4U5gw",
    formattedAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    lat: 54.6575,
    lng: -6.2158,
    countryCode: "GB",
    postalCode: "BT29 4AB",
    patterns: [
      /belfast international/i,
      /\baldergrove\b/i,
      /\bBFS\b/,
      /airport rd.*aldergrove/i,
    ],
  },
  {
    code: "BHD",
    label: "Belfast City",
    name: "George Best Belfast City Airport",
    placeId: "ChIJN1t_tDeuW0gR2cK0JqQZQ0E",
    formattedAddress: "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK",
    lat: 54.6181,
    lng: -5.8724,
    countryCode: "GB",
    postalCode: "BT3 9JH",
    patterns: [
      /belfast city airport/i,
      /george best belfast city/i,
      /\bBHD\b/,
      /sydenham.*airport/i,
    ],
  },
  {
    code: "DUB",
    label: "Dublin Airport",
    name: "Dublin Airport",
    placeId: "ChIJUU1_1pJZZ0gR3vQvL7Gqj0U",
    formattedAddress: "Dublin Airport, Co. Dublin, Ireland",
    lat: 53.4264,
    lng: -6.2499,
    countryCode: "IE",
    postalCode: null,
    patterns: [
      /\bdublin\s+airport\b/i,
      /\baerfort\s+bhaile\s+átha\s+cliath\b/i,
      /\bDUB\b/,
    ],
  },
  {
    code: "LDY",
    label: "City of Derry Airport",
    name: "City of Derry Airport",
    placeId: "quickselect-ldy-city-of-derry-airport",
    formattedAddress: "City of Derry Airport, Airport Road, Eglinton BT47 3GY, UK",
    lat: 55.0428,
    lng: -7.1611,
    countryCode: "GB",
    postalCode: "BT47 3GY",
    patterns: [/city of derry airport/i, /derry airport/i, /\bLDY\b/, /eglington.*airport/i, /eg ae/i],
  },
] as const;

/** Core product airports that must always appear reliably in address search. */
export const CORE_MANAGE_BOOKING_AIRPORTS: readonly ServedAirportCode[] = [
  "BFS",
  "BHD",
  "DUB",
];

export type ServedAirportSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

function secondaryFromFormatted(formatted: string, name: string): string {
  const trimmed = formatted.trim();
  const lower = trimmed.toLowerCase();
  const nameLower = name.toLowerCase();
  if (lower.startsWith(`${nameLower},`)) {
    return trimmed.slice(name.length).replace(/^,\s*/, "").trim();
  }
  if (lower === nameLower) return "";
  return trimmed;
}

/** True when label/text clearly refers to a served airport (not bare “Dublin”). */
export function isServedAirportLabel(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return SERVED_AIRPORTS.some((airport) =>
    airport.patterns.some((pattern) => pattern.test(value)),
  );
}

export function matchServedAirportCode(text: string): ServedAirportCode | null {
  const value = text.trim();
  if (!value) return null;
  for (const airport of SERVED_AIRPORTS) {
    if (airport.patterns.some((pattern) => pattern.test(value))) {
      return airport.code;
    }
  }
  return null;
}

export function getServedAirport(code: string): ServedAirport | undefined {
  const normalised = code.trim().toUpperCase();
  return SERVED_AIRPORTS.find((airport) => airport.code === normalised);
}

/**
 * When the customer types an airport name, return first-class suggestions
 * from the site catalogue (reliable even when Places region filters exclude IE).
 */
export function matchServedAirportSuggestions(
  query: string,
  options?: { codes?: readonly ServedAirportCode[] },
): ServedAirportSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const allowed = new Set(
    (options?.codes && options.codes.length > 0
      ? options.codes
      : CORE_MANAGE_BOOKING_AIRPORTS) as ServedAirportCode[],
  );

  const q = trimmed.toLowerCase();
  const out: ServedAirportSuggestion[] = [];

  for (const airport of SERVED_AIRPORTS) {
    if (!allowed.has(airport.code)) continue;

    const haystack = `${airport.name} ${airport.label} ${airport.code} ${airport.formattedAddress}`.toLowerCase();
    const patternHit = airport.patterns.some((pattern) => pattern.test(trimmed));

    // Dublin: never treat bare "Dublin" / city text as the airport.
    if (airport.code === "DUB") {
      const dublinAirportIntent =
        patternHit ||
        q === "dub" ||
        (q.includes("dublin") && (q.includes("air") || q.includes("aerfort"))) ||
        q.includes("aerfort bhaile");
      if (!dublinAirportIntent) continue;
    } else {
      const softHit =
        haystack.includes(q) ||
        airport.name.toLowerCase().startsWith(q) ||
        airport.label.toLowerCase().startsWith(q) ||
        (q.includes("belfast") &&
          airport.code === "BFS" &&
          (q.includes("int") || q.includes("alder") || q.includes("air"))) ||
        (q.includes("belfast") &&
          airport.code === "BHD" &&
          (q.includes("city") || q.includes("george")));
      if (!patternHit && !softHit) continue;
    }

    out.push({
      id: airport.placeId,
      label: airport.formattedAddress,
      address: airport.formattedAddress,
      mainText: airport.name,
      secondaryText: secondaryFromFormatted(airport.formattedAddress, airport.name),
    });
  }

  return out;
}

/** Rough Dublin Airport geofence (matches quote quick-select radius). */
export function isDublinAirportCoordinates(lat: number, lon: number): boolean {
  const airport = getServedAirport("DUB");
  if (!airport) return false;
  const dLat = lat - airport.lat;
  const dLon = lon - airport.lng;
  const km = Math.sqrt(dLat * dLat + dLon * dLon) * 111;
  return km <= 4;
}

export function servedAirportFromPlaceId(placeId: string): ServedAirport | undefined {
  const id = placeId.trim();
  if (!id) return undefined;
  return SERVED_AIRPORTS.find((airport) => airport.placeId === id);
}

/**
 * Structured place selection for the quote form.
 * Customers must pick a Google suggestion — free-typed text alone is invalid.
 */

import { isGreaterBelfastServiceAddress } from "../../shared/ldy-service-area";

export type SelectedPlace = {
  placeId: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  postalCode: string | null;
};

export type JourneyKind =
  | "airport-to-address"
  | "address-to-airport"
  | "address-to-address"
  | "airport-to-airport";

export const PLACES_LOOKUP_A2A = "A2A";

/** Quick-select airports shown under the address fields. */
export const QUICK_SELECT_AIRPORTS = [
  {
    code: "BFS",
    label: "Belfast International",
    /** Verified Google Place ID (Aldergrove). */
    placeId: "ChIJy4dKsjJVYEgRntaoTC4U5gw",
    formattedAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    lat: 54.6575,
    lng: -6.2158,
    countryCode: "GB",
    postalCode: "BT29 4AB",
  },
  {
    code: "BHD",
    label: "Belfast City",
    placeId: "ChIJN1t_tDeuW0gR2cK0JqQZQ0E",
    formattedAddress: "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK",
    lat: 54.6181,
    lng: -5.8724,
    countryCode: "GB",
    postalCode: "BT3 9JH",
  },
  {
    code: "DUB",
    label: "Dublin Airport",
    placeId: "ChIJUU1_1pJZZ0gR3vQvL7Gqj0U",
    formattedAddress: "Dublin Airport, Co. Dublin, Ireland",
    lat: 53.4264,
    lng: -6.2499,
    countryCode: "IE",
    postalCode: null,
  },
] as const;

export type QuickSelectAirportCode = (typeof QUICK_SELECT_AIRPORTS)[number]["code"];

const AIRPORT_CODE_BY_PLACE_ID = new Map<string, string>(
  QUICK_SELECT_AIRPORTS.map((airport) => [airport.placeId, airport.code]),
);

const AIRPORT_MATCHERS: Array<{ code: string; patterns: RegExp[] }> = [
  {
    code: "BFS",
    patterns: [
      /belfast international/i,
      /\baldergrove\b/i,
      /\bBFS\b/,
      /airport rd.*aldergrove/i,
    ],
  },
  {
    code: "BHD",
    patterns: [
      /belfast city airport/i,
      /george best belfast city/i,
      /\bBHD\b/,
      /sydenham.*airport/i,
    ],
  },
  {
    code: "DUB",
    patterns: [/dublin airport/i, /\bDUB\b/, /aerfort bhaile átha cliath/i],
  },
  {
    code: "LDY",
    patterns: [/city of derry airport/i, /derry airport/i, /\bLDY\b/, /eg ae/i],
  },
];

export function emptySelectedPlace(): SelectedPlace {
  return {
    placeId: "",
    formattedAddress: "",
    lat: null,
    lng: null,
    countryCode: null,
    postalCode: null,
  };
}

export function isPlaceSelected(place: SelectedPlace | null | undefined): boolean {
  return Boolean(place?.placeId?.trim() && place.formattedAddress?.trim());
}

export function placesEqual(a: SelectedPlace, b: SelectedPlace): boolean {
  if (a.placeId && b.placeId && a.placeId === b.placeId) {
    return true;
  }
  return (
    a.formattedAddress.trim().toLowerCase() === b.formattedAddress.trim().toLowerCase() &&
    a.formattedAddress.trim().length > 0
  );
}

export function detectAirportCodeFromPlace(place: SelectedPlace): string | null {
  if (place.placeId && AIRPORT_CODE_BY_PLACE_ID.has(place.placeId)) {
    return AIRPORT_CODE_BY_PLACE_ID.get(place.placeId) ?? null;
  }

  const haystack = place.formattedAddress;
  for (const matcher of AIRPORT_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return matcher.code;
    }
  }
  return null;
}

export function detectJourneyKind(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): JourneyKind | null {
  if (!isPlaceSelected(pickup) || !isPlaceSelected(dropoff)) {
    return null;
  }

  const pickupAirport = Boolean(detectAirportCodeFromPlace(pickup));
  const dropoffAirport = Boolean(detectAirportCodeFromPlace(dropoff));

  if (pickupAirport && dropoffAirport) return "airport-to-airport";
  if (pickupAirport) return "airport-to-address";
  if (dropoffAirport) return "address-to-airport";
  return "address-to-address";
}

export function journeyKindLabel(kind: JourneyKind): string {
  switch (kind) {
    case "airport-to-address":
      return "Airport pickup";
    case "address-to-airport":
      return "Airport drop-off";
    case "airport-to-airport":
      return "Airport to airport";
    case "address-to-address":
      return "Address to address";
  }
}

/** ISO country from Google short text / long name. */
export function normaliseCountryCode(country?: string | null): string | null {
  if (!country?.trim()) return null;
  const value = country.trim().toUpperCase();
  if (value === "GB" || value === "UK" || value === "UNITED KINGDOM") return "GB";
  if (value === "IE" || value === "IRL" || value === "IRELAND" || value === "ÉIRE") return "IE";
  if (value.length === 2) return value;
  return value;
}

/**
 * Republic of Ireland long-distance (Request Fixed Quote).
 * True when a non–Dublin-Airport leg is in the Republic of Ireland
 * (Dublin city, Cork, Galway, Eircode addresses, etc.).
 *
 * Dublin Airport (DUB) keeps the existing instant quote + online book flow.
 */
export function isRepublicOfIrelandJourney(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): boolean {
  return isRoiNonAirportLeg(pickup) || isRoiNonAirportLeg(dropoff);
}

/** Airports allowed as standard/instant pickups (with Greater Belfast addresses).
 * Marketing copy highlights BFS, BHD and DUB; LDY stays for LDY↔Greater Belfast pricing. */
const STANDARD_INSTANT_PICKUP_AIRPORTS = new Set(["BFS", "BHD", "DUB", "LDY"]);

/**
 * Standard pickups: Greater Belfast addresses, or BFS / BHD / DUB / LDY airports.
 * Everything else is out-of-area and needs manual approval (no auto price / SumUp).
 */
export function isStandardInstantPickup(place: SelectedPlace): boolean {
  if (!isPlaceSelected(place)) {
    return false;
  }
  const airportCode = detectAirportCodeFromPlace(place);
  if (airportCode && STANDARD_INSTANT_PICKUP_AIRPORTS.has(airportCode)) {
    return true;
  }
  return isGreaterBelfastServiceAddress(place.formattedAddress);
}

export function isOutOfAreaPickup(place: SelectedPlace): boolean {
  if (!isPlaceSelected(place)) {
    return false;
  }
  return !isStandardInstantPickup(place);
}

/**
 * Journeys that must not show an automatic fare or immediate payment —
 * ROI city destinations (not DUB) or out-of-area pickups.
 */
export function needsManualQuoteApproval(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): boolean {
  if (!isPlaceSelected(pickup) || !isPlaceSelected(dropoff)) {
    return false;
  }
  if (isOutOfAreaPickup(pickup)) {
    return true;
  }
  return isRepublicOfIrelandJourney(pickup, dropoff);
}

/** IE address that is not Dublin Airport — triggers fixed-quote request. */
function isRoiNonAirportLeg(place: SelectedPlace): boolean {
  if (detectAirportCodeFromPlace(place) === "DUB") {
    return false;
  }

  const country = normaliseCountryCode(place.countryCode);
  if (country === "IE") {
    return true;
  }

  return isIrelandAddressText(place.formattedAddress);
}

function isIrelandAddressText(value: string): boolean {
  const text = value.toLowerCase();
  if (text.includes("northern ireland")) return false;
  // Dublin Airport is priced online — do not treat the string as a long-distance ROI city.
  if (/dublin airport|\bdub\b/i.test(value)) return false;
  if (/\b[a-z]\d{2}\s?[a-z0-9]{4}\b/i.test(value) && !/\bbt\d/i.test(value)) {
    return true;
  }
  if (text.includes("co. dublin") || text.includes("county dublin") || text.includes("cork") || text.includes("galway") || text.includes("limerick") || text.includes("waterford") || text.includes("donegal")) {
    if (text.includes("ireland") || text.includes("eircode") || /\b[a-z]\d{2}\s?[a-z0-9]{4}\b/i.test(value)) {
      return true;
    }
  }
  return (text.includes("ireland") || text.includes("dublin")) && !text.includes("northern ireland");
}

export function quickSelectToPlace(
  code: QuickSelectAirportCode,
): SelectedPlace | null {
  const airport = QUICK_SELECT_AIRPORTS.find((item) => item.code === code);
  if (!airport) return null;
  return {
    placeId: airport.placeId,
    formattedAddress: airport.formattedAddress,
    lat: airport.lat,
    lng: airport.lng,
    countryCode: airport.countryCode,
    postalCode: airport.postalCode,
  };
}

export function selectedPlaceFromParts(options: {
  placeId: string;
  formattedAddress: string;
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
}): SelectedPlace {
  return {
    placeId: options.placeId.trim(),
    formattedAddress: options.formattedAddress.trim(),
    lat: options.lat ?? null,
    lng: options.lng ?? null,
    countryCode: normaliseCountryCode(options.countryCode ?? options.country),
    postalCode: options.postalCode?.trim() || null,
  };
}

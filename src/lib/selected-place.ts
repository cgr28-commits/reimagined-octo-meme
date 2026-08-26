/**
 * Structured place selection for the quote form.
 * Customers must pick a Google suggestion — free-typed text alone is invalid.
 */

import { isGreaterBelfastServiceAddress } from "../../shared/ldy-service-area";
import {
  isNorthernIrelandCoordinates,
  isNorthernIrelandPostcode,
  isNorthernIrelandText,
} from "@/lib/northern-ireland";
import { PRICING_CONFIG } from "@/lib/pricing-config";
import {
  SERVED_AIRPORTS,
  type ServedAirportCode,
} from "../../shared/served-airports";

export type SelectedPlace = {
  placeId: string;
  /** Postal / street address from the provider (without requiring a business label). */
  formattedAddress: string;
  /** Visible field value — place name + postal address when applicable. */
  displayAddress?: string | null;
  /** Business / hotel / venue / landmark name when the selection is a named place. */
  placeName?: string | null;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  postalCode: string | null;
  streetNumber?: string | null;
  route?: string | null;
  locality?: string | null;
};

export type JourneyKind =
  | "airport-to-address"
  | "address-to-airport"
  | "address-to-address"
  | "airport-to-airport";

export const PLACES_LOOKUP_A2A = "A2A";

/** Quick-select airports shown under the address fields. */
export const QUICK_SELECT_AIRPORTS = SERVED_AIRPORTS.map((airport) => ({
  code: airport.code,
  label: airport.label,
  placeId: airport.placeId,
  formattedAddress: airport.formattedAddress,
  lat: airport.lat,
  lng: airport.lng,
  countryCode: airport.countryCode,
  postalCode: airport.postalCode,
}));

export type QuickSelectAirportCode = ServedAirportCode;

const AIRPORT_CODE_BY_PLACE_ID = new Map<string, string>(
  SERVED_AIRPORTS.map((airport) => [airport.placeId, airport.code]),
);

const AIRPORT_MATCHERS: Array<{ code: string; patterns: RegExp[] }> = SERVED_AIRPORTS.map(
  (airport) => ({
    code: airport.code,
    patterns: [...airport.patterns],
  }),
);

export function emptySelectedPlace(): SelectedPlace {
  return {
    placeId: "",
    formattedAddress: "",
    displayAddress: "",
    placeName: null,
    lat: null,
    lng: null,
    countryCode: null,
    postalCode: null,
    streetNumber: null,
    route: null,
    locality: null,
  };
}

/** Customer-facing address string for inputs, emails, and booking labels. */
export function placeDisplayText(place: SelectedPlace | null | undefined): string {
  if (!place) {
    return "";
  }
  return (place.displayAddress || place.formattedAddress || "").trim();
}

/**
 * Build "{place name}, {formatted address}" without duplicating the name when
 * Google already included it in the formatted address.
 */
export function buildDisplayAddress(
  placeName: string | null | undefined,
  formattedAddress: string,
): string {
  const formatted = formattedAddress.trim();
  const name = placeName?.trim() || "";
  if (!formatted) {
    return name;
  }
  if (!name) {
    return formatted;
  }

  const normalisedFormatted = formatted.toLowerCase();
  const normalisedName = name.toLowerCase();
  if (
    normalisedFormatted === normalisedName ||
    normalisedFormatted.startsWith(`${normalisedName},`) ||
    normalisedFormatted.startsWith(`${normalisedName} `) ||
    normalisedFormatted.includes(`, ${normalisedName}`) ||
    normalisedFormatted.includes(normalisedName)
  ) {
    return formatted;
  }

  return `${name}, ${formatted}`;
}

export function isPlaceSelected(place: SelectedPlace | null | undefined): boolean {
  return Boolean(place?.placeId?.trim() && place.formattedAddress?.trim());
}

/**
 * True when a stored/selected place has everything required to quote without
 * asking the customer to tap the same autocomplete suggestion again.
 */
export function isQuoteReadyPlace(place: SelectedPlace | null | undefined): boolean {
  if (!isPlaceSelected(place) || !place) {
    return false;
  }
  return (
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng)
  );
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

  // Prefer geofence for Dublin Airport before any text heuristics.
  if (isWithinDublinAirportGeofence(place)) {
    return "DUB";
  }

  const haystack = [place.placeName, place.displayAddress, place.formattedAddress]
    .filter(Boolean)
    .join(" ");

  // Never classify plain Dublin city / hotel / port text as DUB.
  if (isDublinCityTextWithoutAirport(haystack) && !/\bdublin\s+airport\b|\bDUB\b/i.test(haystack)) {
    return null;
  }

  for (const matcher of AIRPORT_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return matcher.code;
    }
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** True when coordinates fall inside the configured Dublin Airport geofence. */
export function isWithinDublinAirportGeofence(place: SelectedPlace): boolean {
  const cfg = getDublinAirportGeoConfig();
  if (
    !cfg ||
    typeof place.lat !== "number" ||
    typeof place.lng !== "number" ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lng)
  ) {
    return false;
  }
  return haversineKm(place.lat, place.lng, cfg.lat, cfg.lng) <= cfg.radiusKm;
}

function getDublinAirportGeoConfig(): { lat: number; lng: number; radiusKm: number } | null {
  const cfg = PRICING_CONFIG.dublinCityBeyondAirport;
  if (!cfg) {
    return { lat: 53.4264, lng: -6.2499, radiusKm: 4 };
  }
  return {
    lat: cfg.airportLat,
    lng: cfg.airportLng,
    radiusKm: cfg.geofenceRadiusKm,
  };
}

/** Dublin city / county destinations that are explicitly not the airport. */
function isDublinCityTextWithoutAirport(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\bdublin\s+airport\b/.test(lower) || /\bdub\b/.test(lower)) {
    return false;
  }
  return (
    /\bdublin\b/.test(lower) ||
    /\bco\.?\s*dublin\b/.test(lower) ||
    /\bcounty dublin\b/.test(lower)
  );
}

/**
 * True when the place is in the Dublin urban/county area but is NOT Dublin Airport.
 * Used so city hotels/businesses never receive the DUB £230/£240 airport fare alone.
 */
export function isDublinCityNotAirportPlace(place: SelectedPlace): boolean {
  if (!isPlaceSelected(place)) {
    return false;
  }
  if (detectAirportCodeFromPlace(place) === "DUB") {
    return false;
  }
  if (isWithinDublinAirportGeofence(place)) {
    return false;
  }

  const country = normaliseCountryCode(place.countryCode);
  const haystack = [place.placeName, place.displayAddress, place.formattedAddress]
    .filter(Boolean)
    .join(" ");

  if (country === "IE" && isDublinCityTextWithoutAirport(haystack)) {
    return true;
  }
  if (country === "IE" && /\bdublin\b/i.test(haystack)) {
    return true;
  }
  // Eircode Dublin routing keys often D / A for city — keep text-based for safety.
  return isIrelandAddressText(haystack) && isDublinCityTextWithoutAirport(haystack);
}

/**
 * Greater Belfast (or BFS/BHD) ↔ Dublin city corridor — priced as DUB airport + beyond.
 */
export function isDublinCityCorridorJourney(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): boolean {
  if (!isPlaceSelected(pickup) || !isPlaceSelected(dropoff)) {
    return false;
  }
  const pickupAirport = detectAirportCodeFromPlace(pickup);
  const dropoffAirport = detectAirportCodeFromPlace(dropoff);
  if (pickupAirport === "DUB" || dropoffAirport === "DUB") {
    return false;
  }

  const pickupIsDublinCity = isDublinCityNotAirportPlace(pickup);
  const dropoffIsDublinCity = isDublinCityNotAirportPlace(dropoff);
  if (pickupIsDublinCity === dropoffIsDublinCity) {
    return false;
  }

  const niLeg = pickupIsDublinCity ? dropoff : pickup;
  const niAirport = detectAirportCodeFromPlace(niLeg);
  if (niAirport === "BFS" || niAirport === "BHD" || niAirport === "LDY") {
    return true;
  }
  return isGreaterBelfastServiceAddress(niLeg.formattedAddress);
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
 * Long-distance marketing lists BFS, BHD and DUB; LDY stays for LDY↔Greater Belfast pricing. */
const STANDARD_INSTANT_PICKUP_AIRPORTS = new Set(["BFS", "BHD", "DUB", "LDY"]);

/** Belfast-area airport drop-offs that count as Greater Belfast destinations for live NI pickups. */
const GREATER_BELFAST_DESTINATION_AIRPORTS = new Set(["BFS", "BHD"]);

/**
 * Standard pickups: Greater Belfast addresses, or BFS / BHD / DUB / LDY airports.
 * Other NI addresses are not “standard” pickups, but may still receive a live quote
 * when the destination is within Greater Belfast (see needsManualQuoteApproval).
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

/** True when the place is in Northern Ireland (BT postcode / NI text / coords). */
export function isNorthernIrelandPlace(place: SelectedPlace): boolean {
  if (!isPlaceSelected(place)) {
    return false;
  }
  if (isNorthernIrelandPostcode(place.postalCode)) {
    return true;
  }
  if (isNorthernIrelandText(place.formattedAddress)) {
    return true;
  }
  if (
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    isNorthernIrelandCoordinates(place.lat, place.lng)
  ) {
    return true;
  }
  return false;
}

/**
 * Destinations that unlock live online quotes for pickups from elsewhere in NI:
 * Greater Belfast addresses, plus Belfast International / Belfast City airports.
 */
export function isGreaterBelfastDestination(place: SelectedPlace): boolean {
  if (!isPlaceSelected(place)) {
    return false;
  }
  const airportCode = detectAirportCodeFromPlace(place);
  if (airportCode && GREATER_BELFAST_DESTINATION_AIRPORTS.has(airportCode)) {
    return true;
  }
  if (airportCode) {
    return false;
  }
  return isGreaterBelfastServiceAddress(place.formattedAddress);
}

/**
 * Journeys that must not show an automatic fare or immediate payment:
 * - Pure Address-to-Address (no airport on either leg) — personalised quote
 * - ROI city destinations (not DUB airport), or pickups outside NI / not into Greater Belfast
 *
 * Airport journeys (BFS / BHD / DUB / LDY) keep the instant-quote path.
 */
export function needsManualQuoteApproval(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): boolean {
  if (!isPlaceSelected(pickup) || !isPlaceSelected(dropoff)) {
    return false;
  }

  // All pure address↔address journeys require a personalised quote (no live £).
  const pickupAirport = detectAirportCodeFromPlace(pickup);
  const dropoffAirport = detectAirportCodeFromPlace(dropoff);
  if (!pickupAirport && !dropoffAirport) {
    return true;
  }

  if (isOutOfAreaPickup(pickup)) {
    if (isNorthernIrelandPlace(pickup) && isGreaterBelfastDestination(dropoff)) {
      return false;
    }
    return true;
  }
  // Greater Belfast ↔ Dublin city is a priced corridor (DUB fare + beyond), not a blank ROI quote.
  if (isDublinCityCorridorJourney(pickup, dropoff)) {
    return false;
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
    displayAddress: airport.formattedAddress,
    placeName: airport.label,
    lat: airport.lat,
    lng: airport.lng,
    countryCode: airport.countryCode,
    postalCode: airport.postalCode,
  };
}

export function selectedPlaceFromParts(options: {
  placeId: string;
  formattedAddress: string;
  displayAddress?: string | null;
  placeName?: string | null;
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  streetNumber?: string | null;
  route?: string | null;
  locality?: string | null;
}): SelectedPlace {
  const postal = options.formattedAddress.trim();
  const placeName = options.placeName?.trim() || null;
  const displayAddress =
    options.displayAddress?.trim() || buildDisplayAddress(placeName, postal);

  return {
    placeId: options.placeId.trim(),
    formattedAddress: postal,
    displayAddress,
    placeName,
    lat: options.lat ?? null,
    lng: options.lng ?? null,
    countryCode: normaliseCountryCode(options.countryCode ?? options.country),
    postalCode: options.postalCode?.trim() || null,
    streetNumber: options.streetNumber?.trim() || null,
    route: options.route?.trim() || null,
    locality: options.locality?.trim() || null,
  };
}

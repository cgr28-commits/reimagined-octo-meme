import {
  extractNorthernIrelandPostcode,
  extractPremisePrefixFromPostcodeQuery,
  isAddressAllowedForAirport,
  isAllowedAutocompleteLabel,
  isAllowedCoordinates,
  isFullNorthernIrelandPostcode,
  isNorthernIrelandPostcodeQuery,
  isPureFullNorthernIrelandPostcodeQuery,
  normaliseAirportCode,
  sortSuggestionsByStreetNumber,
} from "./address-validation";
import { getLdyLocationRestriction } from "./ldy-service-area";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetails = {
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  displayName?: { text?: string; languageCode?: string };
  types?: string[];
};

type GoogleGeocodeResponse = {
  results?: Array<{
    formatted_address?: string;
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
  status?: string;
};

function getRegionCodes(airportCode: string): string[] {
  const code = normaliseAirportCode(airportCode);
  // Google has no Northern-Ireland-only region code. "gb" includes England/Scotland/Wales,
  // so every suggestion path must also run isAllowedAutocompleteLabel / isAddressAllowedForAirport.
  if (code === "DUB" || code === "A2A") {
    return ["gb", "ie"];
  }
  return ["gb"];
}

function getLocationRestriction(airportCode: string) {
  const code = normaliseAirportCode(airportCode);

  if (code === "LDY") {
    return getLdyLocationRestriction();
  }

  if (code === "DUB" || code === "A2A") {
    // Island-wide rectangle (NI + ROI). Bias toward Belfast is applied separately for A2A.
    return {
      rectangle: {
        low: { latitude: 51.4, longitude: -10.8 },
        high: { latitude: 55.5, longitude: -5.4 },
      },
    };
  }

  return {
    rectangle: {
      low: { latitude: 54.0, longitude: -8.2 },
      high: { latitude: 55.4, longitude: -5.4 },
    },
  };
}

/**
 * Soft bias for A2A — must not exclude ROI results.
 * Places Autocomplete circle radius max is 50,000m; an oversized circle
 * causes Google to reject the request and return zero suggestions.
 * Use an island-wide rectangle bias instead (covers NI + ROI).
 */
function getLocationBias(airportCode: string) {
  if (normaliseAirportCode(airportCode) !== "A2A") {
    return undefined;
  }
  return {
    rectangle: {
      low: { latitude: 51.4, longitude: -10.8 },
      high: { latitude: 55.5, longitude: -5.4 },
    },
  };
}

/** Deploy note: shared changes on main trigger the Cloudflare Worker workflow. */
/** Exported for regression tests — A2A bias must stay Places-API valid. */
export function getPlacesLocationBiasForTests(airportCode: string) {
  return getLocationBias(airportCode);
}

function getAddressComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): string | undefined {
  return components?.find((component) => component.types?.includes(type))?.longText;
}

function parseGoogleAddressComponents(components: GoogleAddressComponent[] | undefined) {
  return {
    streetNumber: getAddressComponent(components, "street_number"),
    route: getAddressComponent(components, "route"),
    postcode: getAddressComponent(components, "postal_code"),
    county:
      getAddressComponent(components, "administrative_area_level_2") ??
      getAddressComponent(components, "administrative_area_level_1"),
    state: getAddressComponent(components, "administrative_area_level_1"),
    city:
      getAddressComponent(components, "postal_town") ??
      getAddressComponent(components, "locality"),
    town:
      getAddressComponent(components, "locality") ??
      getAddressComponent(components, "postal_town"),
    country: getAddressComponent(components, "country"),
  };
}

function parseLegacyGeocodeComponents(
  components: NonNullable<GoogleGeocodeResponse["results"]>[number]["address_components"],
) {
  const get = (type: string) =>
    components?.find((component) => component.types?.includes(type))?.long_name;

  return {
    postcode: get("postal_code"),
    county: get("administrative_area_level_2") ?? get("administrative_area_level_1"),
    state: get("administrative_area_level_1"),
    city: get("postal_town") ?? get("locality"),
    town: get("locality") ?? get("postal_town"),
    country: get("country"),
  };
}

export function extractLeadingStreetNumber(input: string): string | null {
  const match = input.trim().match(/^(\d+[a-zA-Z]?)\s+/);
  return match ? match[1] : null;
}

export function hasLeadingStreetNumber(text: string): boolean {
  return /^\d+[a-zA-Z]?\s/.test(text.trim());
}

export function isStreetOnlyQuery(query: string): boolean {
  if (isPureFullNorthernIrelandPostcodeQuery(query)) {
    return false;
  }

  // Number + postcode (e.g. "7 BT36 7FU") is a premises lookup, not a street-only query.
  if (extractPremisePrefixFromPostcodeQuery(query)) {
    return false;
  }

  if (isNorthernIrelandPostcodeQuery(query) && !extractLeadingStreetNumber(query)) {
    return false;
  }

  return !extractLeadingStreetNumber(query) && query.trim().length >= 3;
}

/** True when the customer typed a house/flat number before the street. */
export function isNumberedAddressQuery(query: string): boolean {
  return Boolean(extractLeadingStreetNumber(query));
}

export function withStreetNumber(number: string, addressLine: string): string {
  const trimmed = addressLine.trim();
  if (!trimmed || hasLeadingStreetNumber(trimmed)) {
    return trimmed;
  }
  return `${number} ${trimmed}`;
}

function formatSuggestion(
  prediction: NonNullable<GoogleAutocompleteResponse["suggestions"]>[number]["placePrediction"],
  userNumber: string | null,
): AddressSuggestion | null {
  if (!prediction?.placeId) {
    return null;
  }

  const mainText = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "";
  const secondaryText = prediction.structuredFormat?.secondaryText?.text ?? "";
  if (!mainText) {
    return null;
  }

  const displayMain =
    userNumber && !hasLeadingStreetNumber(mainText)
      ? withStreetNumber(userNumber, mainText)
      : mainText;
  const label = secondaryText ? `${displayMain}, ${secondaryText}` : displayMain;

  return {
    id: prediction.placeId,
    label,
    address: label,
    mainText: displayMain,
    secondaryText,
  };
}

export async function searchGooglePlaces(
  apiKey: string,
  query: string,
  airportCode: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  const code = normaliseAirportCode(airportCode);
  const userNumber = extractLeadingStreetNumber(query);
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: getRegionCodes(code),
    // Prefer GB ranking for Greater Belfast pickups; IE still allowed via includedRegionCodes.
    regionCode: code === "DUB" ? "ie" : "gb",
    languageCode: "en-GB",
  };

  // A2A: island-wide bias without a hard fence that blocks ROI.
  const bias = getLocationBias(code);
  if (bias) {
    body.locationBias = bias;
  } else {
    body.locationRestriction = getLocationRestriction(code);
  }

  if (sessionToken) {
    body.sessionToken = sessionToken;
  }

  // When the customer typed a house number, prefer premises-level predictions.
  // Street-name / town queries stay untyped so route/locality matches still work.
  if (userNumber) {
    body.includedPrimaryTypes = ["street_address", "premise", "subpremise"];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `Google Places autocomplete failed (${response.status})`,
      detail.slice(0, 300),
    );
    // If premises-restricted autocomplete fails/empty, fall back without type filter.
    if (userNumber) {
      return searchGooglePlacesUntyped(apiKey, query, airportCode, sessionToken);
    }
    return [];
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;

  const suggestions = (data.suggestions ?? [])
    .map((item) => formatSuggestion(item.placePrediction, userNumber))
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null)
    .filter((suggestion) => isAllowedAutocompleteLabel(suggestion.label, code));

  const sorted = sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
  if (sorted.length === 0 && userNumber) {
    return searchGooglePlacesUntyped(apiKey, query, airportCode, sessionToken);
  }
  return sorted;
}

/** Untyped autocomplete fallback (routes/localities) — used when premises filter is empty. */
async function searchGooglePlacesUntyped(
  apiKey: string,
  query: string,
  airportCode: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  const code = normaliseAirportCode(airportCode);
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: getRegionCodes(code),
    regionCode: code === "DUB" ? "ie" : "gb",
    languageCode: "en-GB",
  };

  const bias = getLocationBias(code);
  if (bias) {
    body.locationBias = bias;
  } else {
    body.locationRestriction = getLocationRestriction(code);
  }

  if (sessionToken) {
    body.sessionToken = sessionToken;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;
  const userNumber = extractLeadingStreetNumber(query);

  return sortSuggestionsByStreetNumber(
    (data.suggestions ?? [])
      .map((item) => formatSuggestion(item.placePrediction, userNumber))
      .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null)
      .filter((suggestion) => isAllowedAutocompleteLabel(suggestion.label, code)),
  ).slice(0, 8);
}

export async function searchGoogleStreetAddresses(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || isPureFullNorthernIrelandPostcodeQuery(trimmed)) {
    return [];
  }

  const code = normaliseAirportCode(airportCode);
  const userNumber = extractLeadingStreetNumber(trimmed);
  const premisePrefix = extractPremisePrefixFromPostcodeQuery(trimmed);
  const postcode = extractNorthernIrelandPostcode(trimmed);

  // Prefer "7 Glen Manor Road, BT36 7FU" style when the user only typed number + postcode.
  const scopedQuery =
    premisePrefix && postcode && isFullNorthernIrelandPostcode(postcode)
      ? `${premisePrefix}, ${postcode}, Northern Ireland`
      : code === "DUB" || code === "A2A"
        ? trimmed
        : /northern ireland|,\s*bt/i.test(trimmed)
          ? trimmed
          : `${trimmed}, Northern Ireland`;

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.formattedAddress,places.addressComponents,places.location",
    },
    body: JSON.stringify({
      textQuery: scopedQuery,
      includedType: "street_address",
      regionCode: code === "DUB" ? "ie" : "gb",
      languageCode: "en-GB",
      pageSize: 15,
      locationRestriction: getLocationRestriction(code),
    }),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      formattedAddress?: string;
      addressComponents?: GoogleAddressComponent[];
    }>;
  };

  const suggestions: AddressSuggestion[] = [];

  for (const place of data.places ?? []) {
    if (!place.id || !place.formattedAddress) {
      continue;
    }

    let formatted = place.formattedAddress.trim();
    // Prefer results that already include a door number; if the user typed one
    // and Google returned a route-only match, keep their number visible.
    if (!hasLeadingStreetNumber(formatted)) {
      if (userNumber) {
        formatted = withStreetNumber(userNumber, formatted);
      } else {
        continue;
      }
    }

    const parts = parseGoogleAddressComponents(place.addressComponents);
    if (
      !isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
        ...parts,
        displayName: formatted,
      })
    ) {
      continue;
    }

    if (!isAllowedAutocompleteLabel(formatted, code)) {
      continue;
    }

    const commaIndex = formatted.indexOf(",");
    const mainText = commaIndex === -1 ? formatted : formatted.slice(0, commaIndex);
    const secondaryText = commaIndex === -1 ? "" : formatted.slice(commaIndex + 1).trim();

    suggestions.push({
      id: place.id,
      label: formatted,
      address: formatted,
      mainText,
      secondaryText,
    });
  }

  return sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
}

/** Fallback when getAddress Find is unavailable — resolve a full NI postcode via Google text search. */
export async function searchGooglePostcodeAddresses(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const extracted = extractNorthernIrelandPostcode(query);
  if (!extracted || !isFullNorthernIrelandPostcode(extracted)) {
    return [];
  }

  // Pure postcode alone cannot list every property via Google — skip noisy postal_code hits.
  // Callers should prompt for a house number / building name instead.
  if (isPureFullNorthernIrelandPostcodeQuery(query)) {
    return [];
  }

  return searchGooglePostcodePremises(apiKey, query, airportCode);
}

/**
 * Free premises lookup: house number/building + NI postcode via Google Places text search.
 * Does not return a complete Royal Mail premises list (that needs a paid PAF provider).
 */
export async function searchGooglePostcodePremises(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const extracted = extractNorthernIrelandPostcode(query);
  const premise = extractPremisePrefixFromPostcodeQuery(query);
  if (!extracted || !isFullNorthernIrelandPostcode(extracted) || !premise) {
    return [];
  }

  const code = normaliseAirportCode(airportCode);
  const wantedCompact = extracted.replace(/\s+/g, "").toUpperCase();
  const queries = [
    `${premise}, ${extracted}, Northern Ireland`,
    `${premise} ${extracted}`,
    `${premise}, ${extracted}`,
  ];

  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (const textQuery of queries) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.formattedAddress,places.addressComponents,places.location",
      },
      body: JSON.stringify({
        textQuery,
        regionCode: "gb",
        languageCode: "en-GB",
        pageSize: 12,
        locationRestriction: getLocationRestriction(code),
      }),
    });

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as {
      places?: Array<{
        id?: string;
        formattedAddress?: string;
        addressComponents?: GoogleAddressComponent[];
      }>;
    };

    for (const place of data.places ?? []) {
      if (!place.id || !place.formattedAddress || seen.has(place.id)) {
        continue;
      }

      const formatted = place.formattedAddress.trim();
      const parts = parseGoogleAddressComponents(place.addressComponents);
      const resultPostcode = (parts.postcode ?? extractNorthernIrelandPostcode(formatted) ?? "")
        .replace(/\s+/g, "")
        .toUpperCase();

      if (resultPostcode && resultPostcode !== wantedCompact) {
        continue;
      }

      if (
        !isAddressAllowedForAirport(code, {
          ...parts,
          displayName: formatted,
        })
      ) {
        continue;
      }

      seen.add(place.id);
      const commaIndex = formatted.indexOf(",");
      const mainText = commaIndex === -1 ? formatted : formatted.slice(0, commaIndex);
      const secondaryText = commaIndex === -1 ? "" : formatted.slice(commaIndex + 1).trim();
      const displayMain =
        extractLeadingStreetNumber(premise) && !hasLeadingStreetNumber(mainText)
          ? withStreetNumber(extractLeadingStreetNumber(premise)!, mainText)
          : mainText;

      suggestions.push({
        id: place.id,
        label: secondaryText ? `${displayMain}, ${secondaryText}` : displayMain,
        address: formatted,
        mainText: displayMain,
        secondaryText,
      });
    }

    if (suggestions.length >= 6) {
      break;
    }
  }

  // Also try autocomplete with premises types for the composed query.
  const autocomplete = await searchGooglePlaces(
    apiKey,
    `${premise} ${extracted}`,
    airportCode,
  );
  for (const item of autocomplete) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    suggestions.push(item);
  }

  return sortSuggestionsByStreetNumber(suggestions).slice(0, 10);
}

const ESTABLISHMENT_PRIMARY_TYPES = [
  "establishment",
  "point_of_interest",
  "lodging",
  "store",
  "restaurant",
] as const;

export async function searchGoogleEstablishments(
  apiKey: string,
  query: string,
  airportCode: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || extractLeadingStreetNumber(trimmed)) {
    return [];
  }

  const code = normaliseAirportCode(airportCode);
  const body: Record<string, unknown> = {
    input: trimmed,
    includedRegionCodes: getRegionCodes(code),
    regionCode: code === "DUB" ? "ie" : "gb",
    languageCode: "en-GB",
    includedPrimaryTypes: [...ESTABLISHMENT_PRIMARY_TYPES],
  };

  const bias = getLocationBias(code);
  if (bias) {
    body.locationBias = bias;
  } else {
    body.locationRestriction = getLocationRestriction(code);
  }

  if (sessionToken) {
    body.sessionToken = sessionToken;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;

  const suggestions = (data.suggestions ?? [])
    .map((item) => formatSuggestion(item.placePrediction, null))
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null)
    .filter((suggestion) => isAllowedAutocompleteLabel(suggestion.label, code));

  return suggestions.slice(0, 6);
}

export async function geocodeAddress(
  apiKey: string,
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.location",
    },
    body: JSON.stringify({
      textQuery: address,
      regionCode: "gb",
      languageCode: "en-GB",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    places?: Array<{ location?: { latitude?: number; longitude?: number } }>;
  };

  const location = data.places?.[0]?.location;
  if (location?.latitude == null || location?.longitude == null) {
    return null;
  }

  return { lat: location.latitude, lng: location.longitude };
}

export type ResolvedGooglePlace = {
  formattedAddress: string;
  displayAddress: string;
  placeName: string | null;
  placeId: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  postalCode: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
};

function buildGoogleDisplayAddress(
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

/**
 * Prefer Google displayName for establishments; fall back to autocomplete main text
 * when Place Details omitted the business name.
 */
function resolvePlaceName(
  displayName: string | null | undefined,
  suggestionName: string | null | undefined,
  formattedAddress: string,
  types: string[] | undefined,
): string | null {
  const fromDetails = displayName?.trim() || "";
  const fromSuggestion = suggestionName?.trim() || "";
  const formatted = formattedAddress.trim();
  const typeSet = new Set((types ?? []).map((type) => type.toLowerCase()));

  const looksResidential =
    typeSet.has("street_address") ||
    typeSet.has("premise") ||
    typeSet.has("subpremise") ||
    typeSet.has("route");

  const candidate = fromDetails || fromSuggestion;
  if (!candidate) {
    return null;
  }

  // Residential / route results: only keep a distinct building/flat name, not the street line.
  if (looksResidential && !typeSet.has("establishment") && !typeSet.has("point_of_interest")) {
    if (
      formatted.toLowerCase().startsWith(candidate.toLowerCase()) ||
      formatted.toLowerCase().includes(candidate.toLowerCase())
    ) {
      return null;
    }
  }

  if (formatted.toLowerCase().includes(candidate.toLowerCase())) {
    // Name already present in postal address (e.g. airports).
    return candidate;
  }

  return candidate;
}

export async function resolveGooglePlaceDetails(
  apiKey: string,
  placeId: string,
  airportCode: string,
  sessionToken?: string,
  userInput?: string,
  suggestionName?: string,
): Promise<ResolvedGooglePlace | null> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,formattedAddress,addressComponents,location,displayName,types",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GooglePlaceDetails & {
    id?: string;
    location?: { latitude?: number; longitude?: number };
  };
  const parts = parseGoogleAddressComponents(data.addressComponents);

  if (
    !isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
      ...parts,
      displayName: data.displayName?.text || data.formattedAddress,
    })
  ) {
    return null;
  }

  let formatted = data.formattedAddress?.trim() || null;
  if (!formatted) {
    return null;
  }

  const userNumber = userInput ? extractLeadingStreetNumber(userInput) : null;
  let streetNumber = parts.streetNumber?.trim() || null;
  if (userNumber && !hasLeadingStreetNumber(formatted)) {
    // Never silently drop the customer's typed house number for a route-only place.
    formatted = withStreetNumber(userNumber, formatted);
    streetNumber = streetNumber || userNumber;
  } else if (userNumber && !streetNumber) {
    streetNumber = userNumber;
  }

  const placeName = resolvePlaceName(
    data.displayName?.text,
    suggestionName,
    formatted,
    data.types,
  );
  const displayAddress = buildGoogleDisplayAddress(placeName, formatted);

  const countryShort =
    data.addressComponents?.find((component) => component.types?.includes("country"))?.shortText ??
    parts.country;

  return {
    placeId: data.id || placeId,
    formattedAddress: formatted,
    displayAddress,
    placeName,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    countryCode: countryShort?.trim().toUpperCase() === "UK" ? "GB" : countryShort?.trim().toUpperCase() ?? null,
    postalCode: parts.postcode ?? null,
    streetNumber,
    route: parts.route?.trim() || null,
    locality: (parts.town ?? parts.city)?.trim() || null,
  };
}

export async function resolveGooglePlace(
  apiKey: string,
  placeId: string,
  airportCode: string,
  sessionToken?: string,
  userInput?: string,
  suggestionName?: string,
): Promise<string | null> {
  const details = await resolveGooglePlaceDetails(
    apiKey,
    placeId,
    airportCode,
    sessionToken,
    userInput,
    suggestionName,
  );
  return details?.displayAddress ?? details?.formattedAddress ?? null;
}

export async function reverseGeocodeGoogle(
  apiKey: string,
  lat: number,
  lon: number,
  airportCode: string,
): Promise<string | null> {
  if (!isAllowedCoordinates(normaliseAirportCode(airportCode), lat, lon)) {
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lon}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en-GB");
  url.searchParams.set(
    "result_type",
    "street_address|premise|subpremise|route|neighborhood|locality",
  );

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GoogleGeocodeResponse;
  if (data.status !== "OK" || !data.results?.length) {
    return null;
  }

  for (const result of data.results) {
    const parts = parseLegacyGeocodeComponents(result.address_components);
    const formatted = result.formatted_address?.trim();

    if (
      formatted &&
      isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
        ...parts,
        displayName: formatted,
      })
    ) {
      return formatted;
    }
  }

  return null;
}

export const ALLOWED_ORIGINS = [
  "https://www.myairporttaxini.co.uk",
  "https://myairporttaxini.co.uk",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Driver-Key, X-Owner-Key",
  };
}

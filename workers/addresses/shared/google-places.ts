import {
  extractNorthernIrelandPostcode,
  extractPremisePrefixFromPostcodeQuery,
  isAddressAllowedForAirport,
  isAllowedAutocompleteLabel,
  isAllowedCoordinates,
  isNorthernIrelandText,
  isRepublicOfIrelandText,
  isFullNorthernIrelandPostcode,
  isNorthernIrelandPostcodeQuery,
  isPureFullNorthernIrelandPostcodeQuery,
  normaliseAirportCode,
  sortSuggestionsByStreetNumber,
} from "./address-validation";
import {
  extractLeadingStreetNumber,
  hasLeadingStreetNumber,
  normaliseJourneyAddressLabel,
  withStreetNumber,
} from "./journey-address-label";
import { getLdyLocationRestriction, isGreaterBelfastServiceAddress } from "./ldy-service-area";

export {
  extractLeadingStreetNumber,
  hasLeadingStreetNumber,
  withStreetNumber,
} from "./journey-address-label";

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

const ISLAND_RECTANGLE = {
  rectangle: {
    low: { latitude: 51.4, longitude: -10.8 },
    high: { latitude: 55.5, longitude: -5.4 },
  },
} as const;

/** Midpoint of BFS/BHD — ranks Greater Belfast first without excluding ROI. */
const BELFAST_RANKING_CIRCLE = {
  circle: {
    center: { latitude: 54.64, longitude: -6.05 },
    radius: 50_000,
  },
} as const;

function usesIslandPlacesLookup(airportCode: string): boolean {
  const code = normaliseAirportCode(airportCode);
  return code === "A2A" || code === "DUB" || code === "BFS" || code === "BHD";
}

function getRegionCodes(airportCode: string): string[] {
  const code = normaliseAirportCode(airportCode);
  // Google has no Northern-Ireland-only region code. "gb" includes England/Scotland/Wales,
  // so every suggestion path must also run isAllowedAutocompleteLabel / isAddressAllowedForAirport.
  if (usesIslandPlacesLookup(code)) {
    return ["gb", "ie"];
  }
  return ["gb"];
}

function getLocationRestriction(airportCode: string) {
  const code = normaliseAirportCode(airportCode);

  if (code === "LDY") {
    return getLdyLocationRestriction();
  }

  if (usesIslandPlacesLookup(code)) {
    // Island-wide rectangle (NI + ROI). Never an NI-only hard fence for BFS/BHD.
    return { ...ISLAND_RECTANGLE };
  }

  return {
    rectangle: {
      low: { latitude: 54.0, longitude: -8.2 },
      high: { latitude: 55.4, longitude: -5.4 },
    },
  };
}

/**
 * Soft ranking bias — must not exclude ROI results.
 * Places Autocomplete circle radius max is 50,000m; an oversized circle
 * causes Google to reject the request and return zero suggestions.
 */
function getLocationBias(airportCode: string) {
  const code = normaliseAirportCode(airportCode);
  if (code === "BFS" || code === "BHD") {
    return { ...BELFAST_RANKING_CIRCLE };
  }
  if (code === "A2A") {
    return { ...ISLAND_RECTANGLE };
  }
  return undefined;
}

/** Deploy note: shared changes on main trigger the Cloudflare Worker workflow. */
/** Exported for regression tests — bias must stay Places-API valid. */
export function getPlacesLocationBiasForTests(airportCode: string) {
  return getLocationBias(airportCode);
}

export function getPlacesLocationRestrictionForTests(airportCode: string) {
  return getLocationRestriction(airportCode);
}

export function getPlacesRegionCodesForTests(airportCode: string) {
  return getRegionCodes(airportCode);
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

/** Town/locality typed after a comma, e.g. "7 Glen Manor Road, Newtownabbey". */
export function extractTypedLocalityHint(query: string): string | null {
  const afterComma = query.split(",").slice(1).join(" ").trim();
  if (!afterComma) {
    return null;
  }

  const cleaned = afterComma
    .replace(/\bBT\d{1,2}\s*\d[A-Z]{2}\b/gi, " ")
    .replace(/\b(uk|united kingdom|northern ireland|ireland|éire|eire)\b/gi, " ")
    .trim();
  const token = cleaned.split(/[\s,]+/).find((part) => part.replace(/[^a-z0-9]/gi, "").length >= 3);
  return token ?? null;
}

type RankableAddress = {
  mainText: string;
  secondaryText?: string;
  label?: string;
  description?: string;
};

function rankableLabel(item: RankableAddress): string {
  return item.label || item.description || [item.mainText, item.secondaryText].filter(Boolean).join(", ");
}

function suggestionHaystack(item: RankableAddress): string {
  return `${item.mainText} ${item.secondaryText ?? ""} ${rankableLabel(item)}`.toLowerCase();
}

const QUERY_NOISE_TOKENS = new Set([
  "uk",
  "unitedkingdom",
  "northernireland",
  "ireland",
  "eire",
  "éire",
]);

const STREET_TYPE_TOKENS = new Set([
  "road",
  "rd",
  "street",
  "st",
  "avenue",
  "ave",
  "av",
  "drive",
  "dr",
  "lane",
  "ln",
  "close",
  "court",
  "ct",
  "way",
  "terrace",
  "crescent",
  "place",
  "pl",
  "grove",
  "gardens",
  "park",
  "walk",
  "row",
  "square",
  "mews",
  "hill",
  "gate",
  "parade",
  "rise",
  "end",
  "view",
  "green",
]);

function normalizeAddressToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** House number plus street tokens, including 1-character prefixes such as "M". */
export function parseNumberedStreetQuery(query: string): {
  houseNumber: string | null;
  streetTokens: string[];
} {
  const streetLine = query.split(",")[0]?.trim() ?? "";
  const houseNumber = extractLeadingStreetNumber(streetLine);
  const rest = houseNumber ? streetLine.slice(houseNumber.length).trim() : streetLine;
  const streetTokens = rest
    .split(/[\s/]+/)
    .map(normalizeAddressToken)
    .filter(
      (token) =>
        token.length >= 1 &&
        !/^\d+[a-z]?$/.test(token) &&
        !/^bt\d/.test(token) &&
        !QUERY_NOISE_TOKENS.has(token),
    );
  return { houseNumber, streetTokens };
}

type StreetTokenMatch = {
  covered: number;
  exact: number;
  prefix: number;
  allCovered: boolean;
  continuationStreetType: boolean;
  lastResultToken?: string;
};

/**
 * Consume result street tokens in order. Each typed token must be a prefix of
 * the next result token (Glenavy covers "Glen", but not a following "M").
 * Leading unmatched words such as "The" may be skipped; after the first match,
 * tokens must stay consecutive so "7 Glen M" is not satisfied by "7 Glenavy Road".
 */
function matchStreetTokensInOrder(queryTokens: string[], resultTokens: string[]): StreetTokenMatch {
  let covered = 0;
  let exact = 0;
  let prefix = 0;
  let start = -1;

  for (let index = 0; index < resultTokens.length && covered < queryTokens.length; index += 1) {
    const queryToken = queryTokens[covered];
    const resultToken = resultTokens[index];
    if (resultToken.startsWith(queryToken)) {
      if (start < 0) {
        start = index;
      }
      if (resultToken === queryToken) {
        exact += 1;
      } else {
        prefix += 1;
      }
      covered += 1;
    } else if (covered > 0) {
      break;
    }
  }

  const allCovered = queryTokens.length > 0 && covered >= queryTokens.length;
  const nextToken =
    allCovered && start >= 0 ? resultTokens[start + covered] : undefined;

  return {
    covered,
    exact,
    prefix,
    allCovered,
    continuationStreetType: Boolean(nextToken && STREET_TYPE_TOKENS.has(nextToken)),
    lastResultToken: covered > 0 && start >= 0 ? resultTokens[start + covered - 1] : undefined,
  };
}

function numberedResultCoversQuery(
  query: { houseNumber: string | null; streetTokens: string[] },
  item: RankableAddress,
): boolean {
  if (query.houseNumber) {
    const leading =
      extractLeadingStreetNumber(item.mainText) ?? extractLeadingStreetNumber(rankableLabel(item));
    if (leading?.toLowerCase() !== query.houseNumber.toLowerCase()) {
      return false;
    }
  }

  if (query.streetTokens.length === 0) {
    return Boolean(query.houseNumber);
  }

  const resultTokens = parseNumberedStreetQuery(item.mainText).streetTokens;
  return matchStreetTokensInOrder(query.streetTokens, resultTokens).allCovered;
}

function numberedResultIsSubstantial(
  query: string,
  parsed: { houseNumber: string | null; streetTokens: string[] },
  item: RankableAddress,
): boolean {
  if (!numberedResultCoversQuery(parsed, item)) {
    return false;
  }
  // "7 G" / "7 Gl" / "7 Glen" may stay broad once a prefix match exists.
  if (parsed.streetTokens.length < 2) {
    return true;
  }

  const resultTokens = parseNumberedStreetQuery(item.mainText).streetTokens;
  const match = matchStreetTokensInOrder(parsed.streetTokens, resultTokens);
  if (match.continuationStreetType) {
    return true;
  }
  if (match.lastResultToken && STREET_TYPE_TOKENS.has(match.lastResultToken)) {
    return true;
  }
  if (
    match.exact === parsed.streetTokens.length &&
    parsed.streetTokens.every((token) => token.length >= 3)
  ) {
    return true;
  }

  const streetLine = query.split(",")[0]?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  const main = item.mainText.toLowerCase().replace(/\s+/g, " ");
  return streetLine.length >= 10 && (main === streetLine || main.startsWith(`${streetLine} `));
}

function significantQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3 && !/^\d+[a-z]?$/.test(token) && !/^bt\d/.test(token));
}

function resultsCoverQueryTokens(query: string, results: AddressSuggestion[]): boolean {
  const tokens = significantQueryTokens(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystacks = results.map(suggestionHaystack);
  return tokens.every((token) => haystacks.some((haystack) => haystack.includes(token)));
}

function hasCloseStreetMatch(query: string, results: AddressSuggestion[]): boolean {
  const streetLine = query.split(",")[0]?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  if (streetLine.length < 10) {
    return false;
  }
  return results.some((item) => {
    const main = item.mainText.toLowerCase().replace(/\s+/g, " ");
    return main === streetLine || main.startsWith(streetLine) || streetLine.startsWith(main);
  });
}

/**
 * Primary Autocomplete is "good enough" only when the list is actually useful
 * for what the customer typed. Numbered street queries are never strong merely
 * because several door-numbered hits exist — typed street tokens must appear
 * in order as prefixes on at least one result.
 */
export function areGoogleAutocompleteResultsStrong(
  query: string,
  results: AddressSuggestion[],
): boolean {
  if (results.length === 0) {
    return false;
  }

  const parsed = parseNumberedStreetQuery(query);
  if (parsed.houseNumber) {
    if (!results.some((item) => numberedResultIsSubstantial(query, parsed, item))) {
      return false;
    }

    const locality = extractTypedLocalityHint(query);
    if (
      locality &&
      !results.some((item) => suggestionHaystack(item).includes(locality.toLowerCase()))
    ) {
      return false;
    }

    return true;
  }

  const locality = extractTypedLocalityHint(query);
  if (locality && !results.some((item) => suggestionHaystack(item).includes(locality.toLowerCase()))) {
    return false;
  }

  if (!resultsCoverQueryTokens(query, results)) {
    return false;
  }

  return results.length >= 3 || Boolean(locality) || hasCloseStreetMatch(query, results);
}

function geoBiasScore(item: RankableAddress, airportCode: string): number {
  const code = normaliseAirportCode(airportCode);
  if (code !== "BFS" && code !== "BHD") {
    return 0;
  }

  const hay = suggestionHaystack(item);
  let score = 0;
  if (isGreaterBelfastServiceAddress(hay)) {
    score += 35;
  } else if (isNorthernIrelandText(hay)) {
    score += 22;
  }
  if (isRepublicOfIrelandText(hay) && !isNorthernIrelandText(hay)) {
    score -= 15;
  }
  return score;
}

export function scoreAddressSuggestion(
  item: RankableAddress,
  query: string,
  airportCode = "",
): number {
  const parsed = parseNumberedStreetQuery(query);
  const resultParsed = parseNumberedStreetQuery(item.mainText);
  const match = matchStreetTokensInOrder(parsed.streetTokens, resultParsed.streetTokens);
  let score = 0;

  if (parsed.houseNumber) {
    const leading =
      extractLeadingStreetNumber(item.mainText) ?? extractLeadingStreetNumber(rankableLabel(item));
    if (leading?.toLowerCase() === parsed.houseNumber.toLowerCase()) {
      score += 1000;
    } else if (hasLeadingStreetNumber(item.mainText)) {
      score += 200;
    }
  } else if (hasLeadingStreetNumber(item.mainText)) {
    score += 40;
  }

  score += match.exact * 90;
  score += match.prefix * 50;
  score += match.covered * 25;
  if (match.allCovered) {
    score += 220;
  }
  if (match.continuationStreetType) {
    score += 55;
  }
  if (parsed.streetTokens.length > match.covered) {
    score -= (parsed.streetTokens.length - match.covered) * 80;
  }

  const typedLine = (query.split(",")[0] ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const mainLine = item.mainText.toLowerCase().replace(/\s+/g, " ");
  if (typedLine.length >= 3 && mainLine.startsWith(typedLine)) {
    score += 70;
  }

  const locality = extractTypedLocalityHint(query);
  if (locality && suggestionHaystack(item).includes(locality.toLowerCase())) {
    score += 80;
  }

  if (extractNorthernIrelandPostcode(rankableLabel(item))) {
    score += 20;
  }

  score += geoBiasScore(item, airportCode);
  return score;
}

/**
 * Local ranking after Google returns. Priority:
 * house number, street-token prefix/exact match, full token coverage,
 * selected-airport geographic bias, then remaining nearby results.
 */
export function rankAddressSuggestions<T extends RankableAddress>(
  items: T[],
  query: string,
  airportCode = "",
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreAddressSuggestion(item, query, airportCode),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
}

export type AddressSuggestionTrace = {
  cacheHit: boolean;
  primaryLabels: string[];
  primaryStrong: boolean;
  fallbackRan: boolean;
  fallbackKind: "street" | "establishment" | null;
};

let lastAddressSuggestionTrace: AddressSuggestionTrace | null = null;

export function takeLastAddressSuggestionTrace(): AddressSuggestionTrace | null {
  const next = lastAddressSuggestionTrace;
  lastAddressSuggestionTrace = null;
  return next;
}

const SUGGESTION_CACHE_TTL_MS = 45_000;
const SUGGESTION_CACHE_MAX = 80;
const suggestionCache = new Map<string, { at: number; items: AddressSuggestion[] }>();

function suggestionCacheKey(airportCode: string, query: string): string {
  return `${normaliseAirportCode(airportCode)}|${query.trim().toLowerCase()}`;
}

function readSuggestionCache(key: string): AddressSuggestion[] | null {
  const hit = suggestionCache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() - hit.at > SUGGESTION_CACHE_TTL_MS) {
    suggestionCache.delete(key);
    return null;
  }
  return hit.items.map((item) => ({ ...item }));
}

function writeSuggestionCache(key: string, items: AddressSuggestion[]): void {
  if (suggestionCache.size >= SUGGESTION_CACHE_MAX) {
    const oldest = suggestionCache.keys().next().value;
    if (oldest) {
      suggestionCache.delete(oldest);
    }
  }
  suggestionCache.set(key, { at: Date.now(), items: items.map((item) => ({ ...item })) });
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

export const PLACES_QUOTA_ERROR_NAME = "PlacesQuotaError";

export function isPlacesQuotaError(error: unknown): boolean {
  return error instanceof Error && error.name === PLACES_QUOTA_ERROR_NAME;
}

function placesQuotaError(): Error {
  const error = new Error("Google Places daily quota exceeded");
  error.name = PLACES_QUOTA_ERROR_NAME;
  return error;
}

function throwIfPlacesQuota(response: Response, detail = ""): void {
  if (response.status === 429 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(detail)) {
    throw placesQuotaError();
  }
}

/**
 * One Places Autocomplete first. At most one targeted extra call when that
 * list is empty or weak (street/Text Search for numbered streets; establishments
 * only when Autocomplete is empty for a non-numbered query).
 */
export async function searchGoogleAddressSuggestions(
  apiKey: string,
  query: string,
  airportCode: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const cacheKey = suggestionCacheKey(airportCode, trimmed);
  const cached = readSuggestionCache(cacheKey);
  if (cached) {
    lastAddressSuggestionTrace = {
      cacheHit: true,
      primaryLabels: cached.map((item) => item.label),
      primaryStrong: true,
      fallbackRan: false,
      fallbackKind: null,
    };
    return cached;
  }

  const premisePrefix = extractPremisePrefixFromPostcodeQuery(trimmed);
  const postcode = extractNorthernIrelandPostcode(trimmed);
  const collected: AddressSuggestion[] = [];
  const seen = new Set<string>();

  const add = (items: AddressSuggestion[]) => {
    for (const item of items) {
      const key = item.id || item.label.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      collected.push(item);
    }
  };

  const finish = (trace: Omit<AddressSuggestionTrace, "cacheHit">) => {
    const next = rankAddressSuggestions(collected, trimmed, airportCode).slice(0, 10);
    writeSuggestionCache(cacheKey, next);
    lastAddressSuggestionTrace = { cacheHit: false, ...trace };
    return next;
  };

  if (premisePrefix && postcode && isFullNorthernIrelandPostcode(postcode)) {
    add(await searchGooglePostcodePremises(apiKey, trimmed, airportCode));
    if (areGoogleAutocompleteResultsStrong(trimmed, collected)) {
      return finish({
        primaryLabels: collected.map((item) => item.label),
        primaryStrong: true,
        fallbackRan: false,
        fallbackKind: null,
      });
    }
  }

  add(await searchGooglePlaces(apiKey, trimmed, airportCode, sessionToken));
  const primaryLabels = collected.map((item) => item.label);
  if (areGoogleAutocompleteResultsStrong(trimmed, collected)) {
    return finish({
      primaryLabels,
      primaryStrong: true,
      fallbackRan: false,
      fallbackKind: null,
    });
  }

  if (isStreetOnlyQuery(trimmed) || isNumberedAddressQuery(trimmed) || Boolean(premisePrefix)) {
    add(await searchGoogleStreetAddresses(apiKey, trimmed, airportCode));
    return finish({
      primaryLabels,
      primaryStrong: false,
      fallbackRan: true,
      fallbackKind: "street",
    });
  }

  if (collected.length === 0) {
    add(await searchGoogleEstablishments(apiKey, trimmed, airportCode, sessionToken));
    return finish({
      primaryLabels,
      primaryStrong: false,
      fallbackRan: true,
      fallbackKind: "establishment",
    });
  }

  return finish({
    primaryLabels,
    primaryStrong: false,
    fallbackRan: false,
    fallbackKind: null,
  });
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
    throwIfPlacesQuota(response, detail);
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
    const detail = await response.text().catch(() => "");
    throwIfPlacesQuota(response, detail);
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
  // Do not force “Northern Ireland” onto a clear ROI query (Dublin / Donegal / Dundalk).
  const scopedQuery =
    premisePrefix && postcode && isFullNorthernIrelandPostcode(postcode)
      ? `${premisePrefix}, ${postcode}, Northern Ireland`
      : code === "DUB" || code === "A2A" || isRepublicOfIrelandText(trimmed)
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
    const detail = await response.text().catch(() => "");
    throwIfPlacesQuota(response, detail);
    return [];
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      formattedAddress?: string;
      addressComponents?: GoogleAddressComponent[];
      location?: { latitude?: number; longitude?: number };
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
        lat: place.location?.latitude ?? null,
        lng: place.location?.longitude ?? null,
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
      const detail = await response.text().catch(() => "");
      throwIfPlacesQuota(response, detail);
      continue;
    }

    const data = (await response.json()) as {
      places?: Array<{
        id?: string;
        formattedAddress?: string;
        addressComponents?: GoogleAddressComponent[];
        location?: { latitude?: number; longitude?: number };
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
          lat: place.location?.latitude ?? null,
          lng: place.location?.longitude ?? null,
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
    const detail = await response.text().catch(() => "");
    throwIfPlacesQuota(response, detail);
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

/**
 * Resolve a previously booked address label to a quote-ready place.
 * Used after a Return Offer token is validated — not for free-typed URL text.
 */
export async function resolvePlaceFromAddressLabel(
  apiKey: string,
  address: string,
): Promise<ResolvedGooglePlace | null> {
  const trimmed = address.trim();
  if (!apiKey || trimmed.length < 5) {
    return null;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.formattedAddress,places.displayName,places.location,places.addressComponents,places.types",
    },
    body: JSON.stringify({
      textQuery: trimmed,
      regionCode: "gb",
      languageCode: "en-GB",
      maxResultCount: 3,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    places?: Array<
      GooglePlaceDetails & {
        id?: string;
        location?: { latitude?: number; longitude?: number };
      }
    >;
  };

  const match =
    data.places?.find((place) => {
      const formatted = String(place.formattedAddress ?? "").trim();
      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      return Boolean(
        place.id?.trim() &&
          formatted &&
          typeof lat === "number" &&
          typeof lng === "number" &&
          Number.isFinite(lat) &&
          Number.isFinite(lng),
      );
    }) ?? null;
  if (!match?.id) {
    return null;
  }

  const parts = parseGoogleAddressComponents(match.addressComponents);
  const formatted = normaliseJourneyAddressLabel(match.formattedAddress ?? "");
  if (!formatted) {
    return null;
  }
  const placeName = resolvePlaceName(match.displayName?.text, null, formatted, match.types);
  const countryShort =
    match.addressComponents?.find((component) => component.types?.includes("country"))
      ?.shortText ?? parts.country;

  return {
    placeId: match.id,
    formattedAddress: formatted,
    displayAddress: buildGoogleDisplayAddress(placeName, formatted),
    placeName,
    lat: match.location?.latitude ?? null,
    lng: match.location?.longitude ?? null,
    countryCode:
      countryShort?.trim().toUpperCase() === "UK"
        ? "GB"
        : countryShort?.trim().toUpperCase() ?? null,
    postalCode: parts.postcode ?? null,
    streetNumber: parts.streetNumber?.trim() || null,
    route: parts.route?.trim() || null,
    locality: (parts.town ?? parts.city)?.trim() || null,
    administrativeArea: (parts.county ?? parts.state)?.trim() || null,
  };
}

/**
 * Resolve lat/lng for a Google Place ID using the server API key.
 * No airport-area filter — used for payment/OSRM routing after the customer
 * already selected a suggestion. Distinguishes provider errors from not-found.
 */
export async function resolveGooglePlaceLocation(
  apiKey: string,
  placeId: string,
): Promise<
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "not_found" | "provider_error" }
> {
  const id = placeId.trim();
  if (!id || id.startsWith("ip:") || id.startsWith("ga:") || id.startsWith("quickselect-")) {
    return { ok: false, reason: "not_found" };
  }

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,location",
      },
    });

    if (response.status === 404) {
      return { ok: false, reason: "not_found" };
    }
    if (!response.ok) {
      return { ok: false, reason: "provider_error" };
    }

    const data = (await response.json()) as {
      location?: { latitude?: number; longitude?: number };
    };
    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, lat, lng };
  } catch {
    return { ok: false, reason: "provider_error" };
  }
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
  administrativeArea: string | null;
};

function buildGoogleDisplayAddress(
  placeName: string | null | undefined,
  formattedAddress: string,
): string {
  const formatted = normaliseJourneyAddressLabel(formattedAddress);
  const name = placeName?.trim() || "";
  if (!formatted) {
    return name;
  }
  if (!name) {
    return formatted;
  }

  // Never treat a bare / range number as a venue name to prepend.
  if (hasLeadingStreetNumber(name) || /^\d+[a-zA-Z]?$/.test(name)) {
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

  return normaliseJourneyAddressLabel(`${name}, ${formatted}`);
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
  const lat = data.location?.latitude ?? null;
  const lng = data.location?.longitude ?? null;

  if (
    !isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
      ...parts,
      displayName: data.displayName?.text || data.formattedAddress,
      lat,
      lng,
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
    // Ranges like "1-11 May St" already count as numbered — do not prepend "11".
    formatted = withStreetNumber(userNumber, formatted);
    streetNumber = streetNumber || userNumber;
  } else if (userNumber && !streetNumber) {
    streetNumber = userNumber;
  }

  formatted = normaliseJourneyAddressLabel(formatted);

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
    administrativeArea: (parts.county ?? parts.state)?.trim() || null,
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
  // Current Vercel production hostname (custom domain DNS cutover is separate).
  "https://my-airport-taxi-ni-quote.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

/**
 * Isolated Cloudflare Pages preview project for draft-PR smoke tests.
 * Must never be used as a substitute for relaxing github-pages branch protection.
 */
export const PREVIEW_PAGES_PROJECT_HOST = "my-airport-taxi-ni-preview.pages.dev";

/** Vercel project slug — production + git/PR preview hosts share this prefix. */
export const VERCEL_PROJECT_HOST_PREFIX = "my-airport-taxi-ni-quote";

/**
 * Allow this project's Vercel production host and PR/branch preview hosts only.
 * Example preview: my-airport-taxi-ni-quote-git-cursor-owner-dashbo-….vercel.app
 * Does not open CORS to arbitrary *.vercel.app apps.
 */
export function isVercelProjectPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host.endsWith(".vercel.app")) return false;
  if (host === `${VERCEL_PROJECT_HOST_PREFIX}.vercel.app`) return true;
  return host.startsWith(`${VERCEL_PROJECT_HOST_PREFIX}-`);
}

export function isAllowedBrowserOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (
      host === PREVIEW_PAGES_PROJECT_HOST ||
      host.endsWith(`.${PREVIEW_PAGES_PROJECT_HOST}`)
    ) {
      return true;
    }
    return isVercelProjectPreviewHost(host);
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = isAllowedBrowserOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, X-Driver-Key, X-Owner-Key, X-Tracking-Session, X-Smart-Availability-Preview",
  };
}

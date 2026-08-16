import {
  extractNorthernIrelandPostcode,
  isAddressAllowedForAirport,
  isFullNorthernIrelandPostcode,
  isNorthernIrelandPostcodeQuery,
  normaliseNorthernIrelandPostcode,
  sortSuggestionsByStreetNumber,
} from "./address-validation";
import { extractLeadingStreetNumber } from "./google-places";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

type IdealPostcodesAddress = {
  postcode?: string;
  post_town?: string;
  dependant_locality?: string;
  thoroughfare?: string;
  building_number?: string;
  building_name?: string;
  sub_building_name?: string;
  organisation_name?: string;
  line_1?: string;
  line_2?: string;
  line_3?: string;
  premise?: string;
  county?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  udprn?: number | string;
};

type IdealPostcodesLookupResponse = {
  code?: number;
  message?: string;
  result?: IdealPostcodesAddress[];
};

type IdealResolvedPayload = {
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  postalCode: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
  udprn?: string | null;
};

export type ResolvedIdealPostcodesPlace = {
  formattedAddress: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
  countryCode: string;
  postalCode: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
};

const IDEAL_API_BASE = "https://api.ideal-postcodes.co.uk/v1";
const MAX_POSTCODE_PAGES = 5;
const MAX_PREMISES = 200;

function shouldUseIdealPostcodes(airportCode: string, query: string): boolean {
  const code = airportCode.trim().toUpperCase();
  if (code === "DUB") {
    return false;
  }

  if (code === "LDY") {
    return (
      isNorthernIrelandPostcodeQuery(query) || Boolean(extractLeadingStreetNumber(query))
    );
  }

  return true;
}

export { shouldUseIdealPostcodes };

function splitAddressLabel(label: string): { mainText: string; secondaryText: string } {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { mainText: label, secondaryText: "" };
  }

  return {
    mainText: parts[0] ?? label,
    secondaryText: parts.slice(1).join(", "),
  };
}

function formatIdealAddress(entry: IdealPostcodesAddress): string {
  const lines = [entry.line_1, entry.line_2, entry.line_3]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const locality = entry.dependant_locality?.trim();
  if (locality && !lines.some((line) => line.toLowerCase() === locality.toLowerCase())) {
    lines.push(locality);
  }

  const town = entry.post_town?.trim();
  if (town) {
    lines.push(town);
  }

  const postcode = entry.postcode?.trim();
  if (postcode) {
    lines.push(postcode);
  }

  return lines.join(", ");
}

function premiseMainText(entry: IdealPostcodesAddress, formatted: string): string {
  if (entry.organisation_name?.trim()) {
    return entry.organisation_name.trim();
  }

  const buildingBits = [entry.sub_building_name, entry.building_name, entry.building_number]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (buildingBits.length > 0) {
    return buildingBits.join(", ");
  }

  const premise = entry.premise?.trim();
  if (premise) {
    return premise;
  }

  return splitAddressLabel(formatted).mainText;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeIdealPlaceId(payload: IdealResolvedPayload): string {
  const json = JSON.stringify(payload);
  const encoded = bytesToBase64Url(new TextEncoder().encode(json));
  return `ip:v1:${encoded}`;
}

function decodeIdealPlaceId(placeId: string): IdealResolvedPayload | null {
  if (!placeId.startsWith("ip:v1:")) {
    return null;
  }

  const encoded = placeId.slice("ip:v1:".length);
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(encoded));
    const parsed = JSON.parse(json) as IdealResolvedPayload;
    if (!parsed?.formattedAddress) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toIdealSuggestion(entry: IdealPostcodesAddress): AddressSuggestion | null {
  const formatted = formatIdealAddress(entry);
  if (!formatted) {
    return null;
  }

  const mainText = premiseMainText(entry, formatted);
  const street = entry.thoroughfare?.trim() || "";
  const town = entry.post_town?.trim() || "";
  const postcode = entry.postcode?.trim() || "";

  // House/building number or organisation first; street + town + postcode underneath.
  const secondaryParts: string[] = [];
  if (entry.line_1?.trim() && entry.line_1.trim().toLowerCase() !== mainText.toLowerCase()) {
    secondaryParts.push(entry.line_1.trim());
  }
  if (entry.line_2?.trim() && entry.line_2.trim().toLowerCase() !== mainText.toLowerCase()) {
    secondaryParts.push(entry.line_2.trim());
  }
  if (street && !secondaryParts.some((part) => part.toLowerCase().includes(street.toLowerCase()))) {
    secondaryParts.push(street);
  }
  if (town) {
    secondaryParts.push(town);
  }
  if (postcode) {
    secondaryParts.push(postcode);
  }

  const streetNumber =
    entry.building_number?.trim() ||
    entry.premise?.trim()?.match(/^(\d+[a-zA-Z]?)\b/)?.[1] ||
    null;

  const payload: IdealResolvedPayload = {
    formattedAddress: formatted,
    lat: typeof entry.latitude === "number" ? entry.latitude : null,
    lng: typeof entry.longitude === "number" ? entry.longitude : null,
    postalCode: entry.postcode?.trim() || null,
    streetNumber,
    route: entry.thoroughfare?.trim() || null,
    locality: entry.post_town?.trim() || entry.dependant_locality?.trim() || null,
    udprn: entry.udprn != null ? String(entry.udprn) : null,
  };

  return {
    id: encodeIdealPlaceId(payload),
    label: formatted,
    address: formatted,
    mainText,
    secondaryText: secondaryParts.join(", ") || splitAddressLabel(formatted).secondaryText,
  };
}

async function fetchIdealPostcodePage(
  apiKey: string,
  compactPostcode: string,
  page: number,
): Promise<IdealPostcodesAddress[]> {
  const url = new URL(`${IDEAL_API_BASE}/postcodes/${encodeURIComponent(compactPostcode)}`);
  url.searchParams.set("api_key", apiKey);
  if (page > 0) {
    url.searchParams.set("page", String(page));
  }

  const response = await fetch(url.toString());
  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`Ideal Postcodes request failed (${response.status})`, detail.slice(0, 300));
    return [];
  }

  const data = (await response.json()) as IdealPostcodesLookupResponse;
  return Array.isArray(data.result) ? data.result : [];
}

export async function searchIdealPostcodes(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !shouldUseIdealPostcodes(airportCode, trimmed)) {
    return [];
  }

  if (!isNorthernIrelandPostcodeQuery(trimmed)) {
    return [];
  }

  const extracted = extractNorthernIrelandPostcode(trimmed);
  if (!extracted || !isFullNorthernIrelandPostcode(extracted)) {
    return [];
  }

  // Only treat near-pure postcode queries as premises lookups.
  // "7 Glen Manor Road BT36 7FU" should stay on Google/getAddress free-text paths.
  const compactQuery = trimmed.replace(/\s+/g, "").toUpperCase();
  const compactPostcode = extracted.replace(/\s+/g, "").toUpperCase();
  const leftover = compactQuery.replace(compactPostcode, "");
  if (leftover.length > 2) {
    return [];
  }

  const normalised = normaliseNorthernIrelandPostcode(extracted);
  const pages: IdealPostcodesAddress[] = [];

  for (let page = 0; page < MAX_POSTCODE_PAGES; page += 1) {
    const batch = await fetchIdealPostcodePage(apiKey, compactPostcode, page);
    if (batch.length === 0) {
      break;
    }
    pages.push(...batch);
    if (batch.length < 100 || pages.length >= MAX_PREMISES) {
      break;
    }
  }

  const suggestions: AddressSuggestion[] = [];
  for (const entry of pages.slice(0, MAX_PREMISES)) {
    if (
      !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
        postcode: entry.postcode ?? normalised,
        county: entry.county,
        city: entry.post_town,
        town: entry.post_town,
        country: entry.country,
        displayName: formatIdealAddress(entry),
      })
    ) {
      continue;
    }

    const suggestion = toIdealSuggestion({
      ...entry,
      postcode: entry.postcode ?? normalised,
    });
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return sortSuggestionsByStreetNumber(suggestions);
}

export async function resolveIdealPostcodesDetails(
  placeId: string,
  airportCode: string,
): Promise<ResolvedIdealPostcodesPlace | null> {
  const payload = decodeIdealPlaceId(placeId);
  if (!payload) {
    return null;
  }

  if (
    !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
      displayName: payload.formattedAddress,
      postcode: payload.postalCode ?? undefined,
      city: payload.locality ?? undefined,
      town: payload.locality ?? undefined,
    })
  ) {
    return null;
  }

  return {
    placeId,
    formattedAddress: payload.formattedAddress,
    lat: payload.lat,
    lng: payload.lng,
    countryCode: "GB",
    postalCode: payload.postalCode,
    streetNumber: payload.streetNumber,
    route: payload.route,
    locality: payload.locality,
  };
}

export function isIdealPostcodesPlaceId(placeId: string): boolean {
  return placeId.startsWith("ip:");
}

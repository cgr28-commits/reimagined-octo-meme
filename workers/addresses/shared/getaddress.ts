import {
  extractNorthernIrelandPostcode,
  isAddressAllowedForAirport,
  isFullNorthernIrelandPostcode,
  isNorthernIrelandPostcodeQuery,
  isNorthernIrelandText,
  normaliseNorthernIrelandPostcode,
  sortSuggestionsByStreetNumber,
} from "./address-validation";
import { extractLeadingStreetNumber } from "./google-places";
export const GETADDRESS_NI_FILTER = "postcode:BT";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

type GetAddressAutocompleteResponse = {
  suggestions?: Array<{ id: string; address: string }>;
};

type GetAddressDetail = {
  line_1?: string;
  line_2?: string;
  line_3?: string;
  town_or_city?: string;
  county?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  building_number?: string;
  thoroughfare?: string;
  locality?: string;
};

type GetAddressFindResponse = {
  postcode?: string;
  addresses?: Array<string | GetAddressDetail>;
};

function formatGetAddressDetail(detail: GetAddressDetail): string {
  return [detail.line_1, detail.line_2, detail.line_3, detail.town_or_city, detail.county, detail.postcode]
    .filter(Boolean)
    .join(", ");
}

function formatGetAddressString(address: string, postcode?: string): string {
  const cleaned = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  if (!cleaned) {
    return postcode?.trim() ?? "";
  }

  if (postcode && !cleaned.toUpperCase().includes(postcode.trim().toUpperCase())) {
    return `${cleaned}, ${postcode.trim()}`;
  }

  return cleaned;
}

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

function toGetAddressSuggestion(item: { id: string; address: string }): AddressSuggestion {
  const { mainText, secondaryText } = splitAddressLabel(item.address);

  return {
    id: `ga:${item.id}`,
    label: item.address,
    address: item.address,
    mainText,
    secondaryText,
  };
}

function toStaticGetAddressSuggestion(formatted: string): AddressSuggestion {
  const { mainText, secondaryText } = splitAddressLabel(formatted);

  return {
    id: `ga:static:${encodeURIComponent(formatted)}`,
    label: formatted,
    address: formatted,
    mainText,
    secondaryText,
  };
}

function shouldUseGetAddress(airportCode: string, query: string): boolean {
  const code = airportCode.trim().toUpperCase();
  if (code === "DUB") {
    return false;
  }

  // LDY: allow door-number / BT postcode lookups (NI filter still applied).
  if (code === "LDY") {
    return (
      isNorthernIrelandPostcodeQuery(query) || Boolean(extractLeadingStreetNumber(query))
    );
  }

  return true;
}

export { shouldUseGetAddress };

async function searchGetAddressAutocomplete(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const url = new URL(
    `https://api.getAddress.io/autocomplete/${encodeURIComponent(query.trim())}`,
  );
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("all", "true");
  url.searchParams.set("top", "6");
  url.searchParams.set("show-postcode", "true");

  if (airportCode !== "DUB" && !isNorthernIrelandPostcodeQuery(query)) {
    url.searchParams.set("filter", GETADDRESS_NI_FILTER);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`getAddress request failed (${response.status})`, detail.slice(0, 300));
    return [];
  }

  const data = (await response.json()) as GetAddressAutocompleteResponse;

  return sortSuggestionsByStreetNumber(
    (data.suggestions ?? [])
      .filter((item) => isNorthernIrelandText(item.address))
      .map(toGetAddressSuggestion),
  ).slice(0, 6);
}

async function searchGetAddressFind(
  apiKey: string,
  postcode: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const normalised = normaliseNorthernIrelandPostcode(postcode);
  if (!isFullNorthernIrelandPostcode(normalised)) {
    return [];
  }

  const compactPostcode = normalised.replace(/\s+/g, "");
  const response = await fetch(
    `https://api.getAddress.io/find/${encodeURIComponent(compactPostcode)}?api-key=${encodeURIComponent(apiKey)}&expand=true&sort=true`,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`getAddress request failed (${response.status})`, detail.slice(0, 300));
    return [];
  }

  const data = (await response.json()) as GetAddressFindResponse;
  const suggestions: AddressSuggestion[] = [];

  for (const entry of data.addresses ?? []) {
    const detail =
      typeof entry === "string"
        ? {
            line_1: entry.split(",")[0]?.trim(),
            town_or_city: entry.split(",")[5]?.trim(),
            county: entry.split(",")[6]?.trim(),
            postcode: data.postcode,
          }
        : {
            ...entry,
            postcode: entry.postcode ?? data.postcode,
          };

    const formatted =
      typeof entry === "string"
        ? formatGetAddressString(entry, data.postcode)
        : formatGetAddressDetail(detail);

    if (
      !formatted ||
      !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
        postcode: detail.postcode,
        county: detail.county,
        city: detail.town_or_city,
        displayName: formatted,
      })
    ) {
      continue;
    }

    suggestions.push(toStaticGetAddressSuggestion(formatted));
  }

  return sortSuggestionsByStreetNumber(suggestions).slice(0, 8);
}

export async function searchGetAddress(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !shouldUseGetAddress(airportCode, trimmed)) {
    return [];
  }

  if (isNorthernIrelandPostcodeQuery(trimmed)) {
    const extracted = extractNorthernIrelandPostcode(trimmed);
    if (extracted && isFullNorthernIrelandPostcode(extracted)) {
      const findResults = await searchGetAddressFind(apiKey, extracted, airportCode);
      if (findResults.length > 0) {
        return findResults;
      }
    }
  }

  return searchGetAddressAutocomplete(apiKey, trimmed, airportCode);
}

export type ResolvedGetAddressPlace = {
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

export async function resolveGetAddressDetails(
  apiKey: string,
  placeId: string,
  airportCode: string,
): Promise<ResolvedGetAddressPlace | null> {
  if (placeId.startsWith("ga:static:")) {
    const formatted = decodeURIComponent(placeId.slice("ga:static:".length));
    if (
      !formatted ||
      !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
        displayName: formatted,
        postcode: extractNorthernIrelandPostcode(formatted) ?? undefined,
      })
    ) {
      return null;
    }

    const numberMatch = formatted.trim().match(/^(\d+[a-zA-Z]?)\b/);
    return {
      placeId,
      formattedAddress: formatted,
      lat: null,
      lng: null,
      countryCode: "GB",
      postalCode: extractNorthernIrelandPostcode(formatted),
      streetNumber: numberMatch?.[1] ?? null,
      route: null,
      locality: null,
    };
  }

  const id = placeId.startsWith("ga:") ? placeId.slice(3) : placeId;

  const response = await fetch(
    `https://api.getAddress.io/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) {
    return null;
  }

  const detail = (await response.json()) as GetAddressDetail;
  const formatted = formatGetAddressDetail(detail);

  if (
    !formatted ||
    !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
      postcode: detail.postcode,
      county: detail.county,
      city: detail.town_or_city,
      displayName: formatted,
    })
  ) {
    return null;
  }

  return {
    placeId: placeId.startsWith("ga:") ? placeId : `ga:${placeId}`,
    formattedAddress: formatted,
    lat: typeof detail.latitude === "number" ? detail.latitude : null,
    lng: typeof detail.longitude === "number" ? detail.longitude : null,
    countryCode: "GB",
    postalCode: detail.postcode?.trim() || extractNorthernIrelandPostcode(formatted),
    streetNumber: detail.building_number?.trim() || null,
    route: detail.thoroughfare?.trim() || null,
    locality: detail.town_or_city?.trim() || detail.locality?.trim() || null,
  };
}

export async function resolveGetAddress(
  apiKey: string,
  placeId: string,
  airportCode: string,
): Promise<string | null> {
  const details = await resolveGetAddressDetails(apiKey, placeId, airportCode);
  return details?.formattedAddress ?? null;
}

export function isGetAddressPlaceId(placeId: string): boolean {
  return placeId.startsWith("ga:");
}

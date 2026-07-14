import {
  isAddressAllowedForAirport,
  isAllowedCoordinates,
} from "./address-validation";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
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

function normaliseAirportCode(value: string): string {
  return value.trim().toUpperCase();
}

function getRegionCodes(airportCode: string): string[] {
  return airportCode === "DUB" ? ["gb", "ie"] : ["gb"];
}

function getAddressComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): string | undefined {
  return components?.find((component) => component.types?.includes(type))?.longText;
}

function parseGoogleAddressComponents(components: GoogleAddressComponent[] | undefined) {
  return {
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

export async function searchGooglePlaces(
  apiKey: string,
  query: string,
  airportCode: string,
  sessionToken?: string,
): Promise<AddressSuggestion[]> {
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: getRegionCodes(normaliseAirportCode(airportCode)),
    regionCode: "gb",
    languageCode: "en-GB",
  };

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

  return (data.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((prediction) => Boolean(prediction?.placeId && prediction.text?.text))
    .slice(0, 6)
    .map((prediction) => ({
      id: prediction!.placeId!,
      label: prediction!.text!.text!,
      address: prediction!.text!.text!,
    }));
}

export async function resolveGooglePlace(
  apiKey: string,
  placeId: string,
  airportCode: string,
  sessionToken?: string,
): Promise<string | null> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "formattedAddress,addressComponents",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GooglePlaceDetails;
  const parts = parseGoogleAddressComponents(data.addressComponents);

  if (
    !isAddressAllowedForAirport(normaliseAirportCode(airportCode), {
      ...parts,
      displayName: data.formattedAddress,
    })
  ) {
    return null;
  }

  return data.formattedAddress?.trim() || null;
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

import {
  fetchWorkerAddressDetails,
  fetchWorkerAddressSuggestions,
  resolveAddressesApiUrl,
} from "@/lib/addresses-api";
import {
  geocodeAddress,
  extractLeadingStreetNumber,
  isNumberedAddressQuery,
  isStreetOnlyQuery,
  resolveGooglePlaceDetails,
  searchGoogleEstablishments,
  searchGooglePlaces,
  searchGoogleStreetAddresses,
} from "../../shared/google-places";
import type { SelectedPlace } from "@/lib/selected-place";
import { selectedPlaceFromParts } from "@/lib/selected-place";
import {
  isGetAddressPlaceId,
  resolveGetAddressDetails,
  searchGetAddress,
  shouldUseGetAddress,
} from "../../shared/getaddress";

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
const GETADDRESS_API_KEY = process.env.NEXT_PUBLIC_GETADDRESS_API_KEY?.trim() ?? "";
const ADDRESSES_API_URL = resolveAddressesApiUrl();

let sessionToken = createSessionToken();

export type AddressPrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

function createSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasLeadingStreetNumber(text: string): boolean {
  return /^\d+[a-zA-Z]?\s/.test(text.trim());
}

function mergePredictions(predictions: AddressPrediction[]): AddressPrediction[] {
  const seen = new Set<string>();
  const merged: AddressPrediction[] = [];

  for (const prediction of predictions) {
    const key = prediction.description.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(prediction);
  }

  return merged
    .sort((a, b) => {
      const aHasNumber = hasLeadingStreetNumber(a.mainText);
      const bHasNumber = hasLeadingStreetNumber(b.mainText);
      if (aHasNumber && !bHasNumber) {
        return -1;
      }
      if (!aHasNumber && bHasNumber) {
        return 1;
      }
      return 0;
    })
    .slice(0, 8);
}

function toPrediction(suggestion: {
  id: string;
  label: string;
  mainText: string;
  secondaryText: string;
}): AddressPrediction {
  return {
    placeId: suggestion.id,
    description: suggestion.label,
    mainText: suggestion.mainText,
    secondaryText: suggestion.secondaryText,
  };
}

export function isGooglePlacesEnabled(): boolean {
  return Boolean(ADDRESSES_API_URL || GOOGLE_API_KEY || GETADDRESS_API_KEY);
}

export async function geocodePickupAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_API_KEY) {
    return null;
  }

  return geocodeAddress(GOOGLE_API_KEY, address);
}

function toPredictions(
  suggestions: Array<{
    id: string;
    label: string;
    mainText: string;
    secondaryText: string;
  }>,
): AddressPrediction[] {
  return suggestions.map(toPrediction);
}

async function safePredictions(task: Promise<AddressPrediction[]>): Promise<AddressPrediction[]> {
  try {
    return await task;
  } catch {
    return [];
  }
}

async function fetchLocalAddressPredictions(
  input: string,
  airportCode: string,
): Promise<AddressPrediction[]> {
  const trimmed = input.trim();
  const tasks: Promise<AddressPrediction[]>[] = [];

  if (GETADDRESS_API_KEY && shouldUseGetAddress(airportCode, trimmed)) {
    tasks.push(
      safePredictions(
        searchGetAddress(GETADDRESS_API_KEY, trimmed, airportCode).then(toPredictions),
      ),
    );
  }

  if (GOOGLE_API_KEY) {
    tasks.push(
      safePredictions(
        searchGooglePlaces(GOOGLE_API_KEY, trimmed, airportCode, sessionToken).then(toPredictions),
      ),
    );

    if (!extractLeadingStreetNumber(trimmed)) {
      tasks.push(
        safePredictions(
          searchGoogleEstablishments(GOOGLE_API_KEY, trimmed, airportCode, sessionToken).then(
            toPredictions,
          ),
        ),
      );
    }

    // Premises text search for both street-only and numbered queries.
    if (isStreetOnlyQuery(trimmed) || isNumberedAddressQuery(trimmed)) {
      tasks.push(
        safePredictions(
          searchGoogleStreetAddresses(GOOGLE_API_KEY, trimmed, airportCode).then(toPredictions),
        ),
      );
    }
  }

  if (tasks.length === 0) {
    throw new Error("Address lookup is not configured");
  }

  const results = await Promise.all(tasks);
  return mergePredictions(results.flat());
}

export async function fetchAddressPredictions(
  input: string,
  airportCode: string,
): Promise<AddressPrediction[]> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const tasks: Promise<AddressPrediction[]>[] = [];

  if (ADDRESSES_API_URL) {
    tasks.push(
      safePredictions(
        fetchWorkerAddressSuggestions(trimmed, airportCode).then((suggestions) =>
          (suggestions ?? []).map(toPrediction),
        ),
      ),
    );
  }

  if (GOOGLE_API_KEY || GETADDRESS_API_KEY) {
    tasks.push(safePredictions(fetchLocalAddressPredictions(trimmed, airportCode)));
  }

  if (tasks.length === 0) {
    throw new Error("Address lookup is not configured");
  }

  const results = await Promise.all(tasks);
  return mergePredictions(results.flat());
}

export async function fetchPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
): Promise<string | null> {
  const place = await fetchSelectedPlaceDetails(placeId, airportCode, userInput);
  return place?.formattedAddress ?? null;
}

export async function fetchSelectedPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
): Promise<SelectedPlace | null> {
  if (ADDRESSES_API_URL) {
    const workerPlace = await fetchWorkerAddressDetails(placeId, airportCode, userInput);
    if (workerPlace) {
      return selectedPlaceFromParts({
        placeId: workerPlace.placeId,
        formattedAddress: workerPlace.address,
        lat: workerPlace.lat,
        lng: workerPlace.lng,
        countryCode: workerPlace.countryCode,
        postalCode: workerPlace.postalCode,
        streetNumber: workerPlace.streetNumber,
        route: workerPlace.route,
        locality: workerPlace.locality,
      });
    }
  }

  if (isGetAddressPlaceId(placeId)) {
    if (!GETADDRESS_API_KEY) {
      return null;
    }

    const details = await resolveGetAddressDetails(GETADDRESS_API_KEY, placeId, airportCode);
    if (!details) {
      return null;
    }
    return selectedPlaceFromParts({
      placeId: details.placeId,
      formattedAddress: details.formattedAddress,
      lat: details.lat,
      lng: details.lng,
      countryCode: details.countryCode,
      postalCode: details.postalCode,
      streetNumber: details.streetNumber,
      route: details.route,
      locality: details.locality,
    });
  }

  if (!GOOGLE_API_KEY) {
    return null;
  }

  const details = await resolveGooglePlaceDetails(
    GOOGLE_API_KEY,
    placeId,
    airportCode,
    sessionToken,
    userInput,
  );
  sessionToken = createSessionToken();
  if (!details) {
    return null;
  }

  return selectedPlaceFromParts({
    placeId: details.placeId,
    formattedAddress: details.formattedAddress,
    lat: details.lat,
    lng: details.lng,
    countryCode: details.countryCode,
    postalCode: details.postalCode,
    streetNumber: details.streetNumber,
    route: details.route,
    locality: details.locality,
  });
}

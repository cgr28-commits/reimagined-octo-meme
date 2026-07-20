import {
  geocodeAddress,
  isStreetOnlyQuery,
  resolveGooglePlace,
  searchGooglePlaces,
  searchGoogleStreetAddresses,
} from "../../shared/google-places";
import {
  isGetAddressPlaceId,
  resolveGetAddress,
  searchGetAddress,
} from "../../shared/getaddress";

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
const GETADDRESS_API_KEY = process.env.NEXT_PUBLIC_GETADDRESS_API_KEY?.trim() ?? "";

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

  return merged;
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
  return GOOGLE_API_KEY.length > 0 || GETADDRESS_API_KEY.length > 0;
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

export async function fetchAddressPredictions(
  input: string,
  airportCode: string,
): Promise<AddressPrediction[]> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const tasks: Promise<AddressPrediction[]>[] = [];

  if (GETADDRESS_API_KEY && airportCode !== "DUB") {
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

    if (isStreetOnlyQuery(trimmed)) {
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
  return mergePredictions(results.flat()).slice(0, 8);
}

export async function fetchPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
): Promise<string | null> {
  if (isGetAddressPlaceId(placeId)) {
    if (!GETADDRESS_API_KEY) {
      return null;
    }

    return resolveGetAddress(GETADDRESS_API_KEY, placeId, airportCode);
  }

  if (!GOOGLE_API_KEY) {
    return null;
  }

  const address = await resolveGooglePlace(
    GOOGLE_API_KEY,
    placeId,
    airportCode,
    sessionToken,
    userInput,
  );
  sessionToken = createSessionToken();
  return address;
}

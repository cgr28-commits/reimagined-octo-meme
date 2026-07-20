import {
  geocodeAddress,
  resolveGooglePlace,
  searchGooglePlaces,
} from "../../shared/google-places";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";

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

export function isGooglePlacesEnabled(): boolean {
  return API_KEY.length > 0;
}

export async function geocodePickupAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!API_KEY) {
    return null;
  }

  return geocodeAddress(API_KEY, address);
}

export async function fetchAddressPredictions(
  input: string,
  airportCode: string,
): Promise<AddressPrediction[]> {
  if (!API_KEY) {
    throw new Error("Google Places API key is not configured");
  }

  const suggestions = await searchGooglePlaces(API_KEY, input, airportCode, sessionToken);

  return suggestions.map((suggestion) => ({
    placeId: suggestion.id,
    description: suggestion.label,
    mainText: suggestion.mainText,
    secondaryText: suggestion.secondaryText,
  }));
}

export async function fetchPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
): Promise<string | null> {
  if (!API_KEY) {
    return null;
  }

  const address = await resolveGooglePlace(
    API_KEY,
    placeId,
    airportCode,
    sessionToken,
    userInput,
  );
  sessionToken = createSessionToken();
  return address;
}

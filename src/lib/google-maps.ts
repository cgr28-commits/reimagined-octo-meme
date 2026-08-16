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
  searchGooglePostcodePremises,
  searchGoogleStreetAddresses,
} from "../../shared/google-places";
import {
  extractNorthernIrelandPostcode,
  extractPremisePrefixFromPostcodeQuery,
  isFullNorthernIrelandPostcode,
  isPureFullNorthernIrelandPostcodeQuery,
} from "../../shared/address-validation";
import type { SelectedPlace } from "@/lib/selected-place";
import { selectedPlaceFromParts } from "@/lib/selected-place";
import {
  isGetAddressPlaceId,
  resolveGetAddressDetails,
  searchGetAddress,
  shouldUseGetAddress,
} from "../../shared/getaddress";
import {
  isIdealPostcodesPlaceId,
  resolveIdealPostcodesDetails,
  searchIdealPostcodes,
  shouldUseIdealPostcodes,
} from "../../shared/ideal-postcodes";

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
const GETADDRESS_API_KEY = process.env.NEXT_PUBLIC_GETADDRESS_API_KEY?.trim() ?? "";
/** Server-only Ideal key must never be NEXT_PUBLIC — client relies on the Worker. */
const IDEAL_POSTCODES_API_KEY = process.env.IDEAL_POSTCODES_API_KEY?.trim() ?? "";
const ADDRESSES_API_URL = resolveAddressesApiUrl();

export {
  isPureFullNorthernIrelandPostcodeQuery,
  extractNorthernIrelandPostcode,
  isFullNorthernIrelandPostcode,
};

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

function mergePredictions(
  predictions: AddressPrediction[],
  limit = 8,
): AddressPrediction[] {
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
    .slice(0, limit);
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
  return Boolean(ADDRESSES_API_URL || GOOGLE_API_KEY || GETADDRESS_API_KEY || IDEAL_POSTCODES_API_KEY);
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

  if (IDEAL_POSTCODES_API_KEY && shouldUseIdealPostcodes(airportCode, trimmed)) {
    tasks.push(
      safePredictions(
        searchIdealPostcodes(IDEAL_POSTCODES_API_KEY, trimmed, airportCode).then(toPredictions),
      ),
    );
  }

  if (GETADDRESS_API_KEY && shouldUseGetAddress(airportCode, trimmed)) {
    tasks.push(
      safePredictions(
        searchGetAddress(GETADDRESS_API_KEY, trimmed, airportCode).then(toPredictions),
      ),
    );
  }

  if (GOOGLE_API_KEY) {
    const premisePrefix = extractPremisePrefixFromPostcodeQuery(trimmed);
    const postcode = extractNorthernIrelandPostcode(trimmed);

    if (premisePrefix && postcode && isFullNorthernIrelandPostcode(postcode)) {
      tasks.push(
        safePredictions(
          searchGooglePostcodePremises(GOOGLE_API_KEY, trimmed, airportCode).then(toPredictions),
        ),
      );
    }

    tasks.push(
      safePredictions(
        searchGooglePlaces(GOOGLE_API_KEY, trimmed, airportCode, sessionToken).then(toPredictions),
      ),
    );

    if (!extractLeadingStreetNumber(trimmed) && !premisePrefix) {
      tasks.push(
        safePredictions(
          searchGoogleEstablishments(GOOGLE_API_KEY, trimmed, airportCode, sessionToken).then(
            toPredictions,
          ),
        ),
      );
    }

    // Premises text search for street-only, numbered, and number+postcode queries.
    if (isStreetOnlyQuery(trimmed) || isNumberedAddressQuery(trimmed) || Boolean(premisePrefix)) {
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
  return mergePredictions(results.flat(), 10);
}

export type AddressPredictionsResult = {
  predictions: AddressPrediction[];
  needsHouseNumber: boolean;
  postcode: string | null;
  hint: string | null;
};

export async function fetchAddressPredictions(
  input: string,
  airportCode: string,
): Promise<AddressPrediction[]> {
  const result = await fetchAddressPredictionsDetailed(input, airportCode);
  return result.predictions;
}

export async function fetchAddressPredictionsDetailed(
  input: string,
  airportCode: string,
): Promise<AddressPredictionsResult> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return { predictions: [], needsHouseNumber: false, postcode: null, hint: null };
  }

  if (isPureFullNorthernIrelandPostcodeQuery(trimmed)) {
    // Prefer Worker (may return Ideal list if configured); otherwise prompt for house number.
    if (ADDRESSES_API_URL) {
      const worker = await fetchWorkerAddressSuggestions(trimmed, airportCode);
      if (worker && worker.suggestions.length > 0) {
        return {
          predictions: worker.suggestions.map(toPrediction),
          needsHouseNumber: false,
          postcode: worker.postcode ?? extractNorthernIrelandPostcode(trimmed),
          hint: null,
        };
      }
      if (worker?.needsHouseNumber) {
        return {
          predictions: [],
          needsHouseNumber: true,
          postcode: worker.postcode ?? extractNorthernIrelandPostcode(trimmed),
          hint: worker.hint ?? "Enter your house number or building name.",
        };
      }
    }

    return {
      predictions: [],
      needsHouseNumber: true,
      postcode: extractNorthernIrelandPostcode(trimmed),
      hint: "Enter your house number or building name to find your exact address.",
    };
  }

  const tasks: Promise<AddressPrediction[]>[] = [];

  if (ADDRESSES_API_URL) {
    tasks.push(
      safePredictions(
        fetchWorkerAddressSuggestions(trimmed, airportCode).then((result) =>
          (result?.suggestions ?? []).map(toPrediction),
        ),
      ),
    );
  }

  if (GOOGLE_API_KEY || GETADDRESS_API_KEY || IDEAL_POSTCODES_API_KEY) {
    tasks.push(safePredictions(fetchLocalAddressPredictions(trimmed, airportCode)));
  }

  if (tasks.length === 0) {
    throw new Error("Address lookup is not configured");
  }

  const results = await Promise.all(tasks);
  return {
    predictions: mergePredictions(results.flat(), 10),
    needsHouseNumber: false,
    postcode: extractNorthernIrelandPostcode(trimmed),
    hint: null,
  };
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

  if (isIdealPostcodesPlaceId(placeId)) {
    const details = await resolveIdealPostcodesDetails(placeId, airportCode);
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

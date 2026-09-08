import {
  fetchWorkerAddressDetails,
  fetchWorkerForwardGeocode,
  fetchWorkerAddressSuggestions,
  resolveAddressesApiUrl,
} from "@/lib/addresses-api";
import {
  geocodeAddress,
  isPlacesQuotaError,
  resolveGooglePlaceDetails,
  rankAddressSuggestions,
  searchGoogleAddressSuggestions,
} from "../../shared/google-places";
import {
  extractNorthernIrelandPostcode,
  isAllowedAutocompleteLabel,
  isFullNorthernIrelandPostcode,
  isPureFullNorthernIrelandPostcodeQuery,
} from "../../shared/address-validation";
import { matchServedAirportSuggestions, servedAirportFromPlaceId } from "../../shared/served-airports";
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

function mergePredictions(
  predictions: AddressPrediction[],
  airportCode: string,
  limit = 8,
  query = "",
): AddressPrediction[] {
  const seen = new Set<string>();
  const merged: AddressPrediction[] = [];

  const served = matchServedAirportSuggestions(query).map((item) => ({
    placeId: item.id,
    description: item.label,
    mainText: item.mainText,
    secondaryText: item.secondaryText,
  }));

  for (const prediction of [...served, ...predictions]) {
    if (!isAllowedAutocompleteLabel(prediction.description, airportCode)) {
      continue;
    }

    const key = prediction.placeId || prediction.description.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(prediction);
  }

  const servedIds = new Set(served.map((item) => item.placeId));
  const servedFirst = merged.filter((item) => servedIds.has(item.placeId));
  const remainder = merged.filter((item) => !servedIds.has(item.placeId));
  const ranked = rankAddressSuggestions(remainder, query, airportCode);
  return [...servedFirst, ...ranked].slice(0, limit);
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
  const trimmed = address.trim();
  if (trimmed.length < 8) {
    return null;
  }

  if (GOOGLE_API_KEY) {
    try {
      const direct = await geocodeAddress(GOOGLE_API_KEY, trimmed);
      if (direct) {
        return direct;
      }
    } catch {
      // Fall through to Worker (preview/referrer-restricted browser keys).
    }
  }

  return fetchWorkerForwardGeocode(trimmed);
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
  } catch (error) {
    if (isPlacesQuotaError(error)) {
      throw error;
    }
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
    tasks.push(
      safePredictions(
        searchGoogleAddressSuggestions(GOOGLE_API_KEY, trimmed, airportCode, sessionToken).then(
          toPredictions,
        ),
      ),
    );
  }

  if (tasks.length === 0) {
    throw new Error("Address lookup is not configured");
  }

  const results = await Promise.all(tasks);
  return mergePredictions(results.flat(), airportCode, 10, trimmed);
}

export type AddressPredictionsResult = {
  predictions: AddressPrediction[];
  needsHouseNumber: boolean;
  postcode: string | null;
  hint: string | null;
  unavailable?: boolean;
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
  signal?: AbortSignal,
): Promise<AddressPredictionsResult> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return { predictions: [], needsHouseNumber: false, postcode: null, hint: null };
  }

  if (isPureFullNorthernIrelandPostcodeQuery(trimmed)) {
    // Prefer Worker (may return Ideal list if configured); otherwise prompt for house number.
    if (ADDRESSES_API_URL) {
      const worker = await fetchWorkerAddressSuggestions(trimmed, airportCode, signal);
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

  // The Worker already calls Places / GetAddress. A second browser-side Places
  // call on the same Cloud project doubles Autocomplete quota use per keystroke
  // and is what exhausted the live daily cap.
  if (ADDRESSES_API_URL) {
    const worker = await fetchWorkerAddressSuggestions(trimmed, airportCode, signal);
    if (worker) {
      return {
        predictions: mergePredictions(
          worker.suggestions.map(toPrediction),
          airportCode,
          10,
          trimmed,
        ),
        needsHouseNumber: Boolean(worker.needsHouseNumber),
        postcode: worker.postcode ?? extractNorthernIrelandPostcode(trimmed),
        hint: worker.hint ?? null,
        unavailable: Boolean(worker.unavailable),
      };
    }
  }

  if (GOOGLE_API_KEY || GETADDRESS_API_KEY || IDEAL_POSTCODES_API_KEY) {
    try {
      return {
        predictions: await fetchLocalAddressPredictions(trimmed, airportCode),
        needsHouseNumber: false,
        postcode: extractNorthernIrelandPostcode(trimmed),
        hint: null,
      };
    } catch (error) {
      if (isPlacesQuotaError(error)) {
        return {
          predictions: [],
          needsHouseNumber: false,
          postcode: extractNorthernIrelandPostcode(trimmed),
          hint: "Address suggestions are unavailable right now. Please try again shortly.",
          unavailable: true,
        };
      }
      throw error;
    }
  }

  throw new Error("Address lookup is not configured");
}

export async function fetchPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
  suggestionName?: string,
): Promise<string | null> {
  const place = await fetchSelectedPlaceDetails(placeId, airportCode, userInput, suggestionName);
  return place?.displayAddress || place?.formattedAddress || null;
}

export async function fetchSelectedPlaceDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
  suggestionName?: string,
): Promise<SelectedPlace | null> {
  const served = servedAirportFromPlaceId(placeId);
  if (served) {
    return {
      placeId: served.placeId,
      formattedAddress: served.formattedAddress,
      displayAddress: served.formattedAddress,
      placeName: served.name,
      lat: served.lat,
      lng: served.lng,
      countryCode: served.countryCode,
      postalCode: served.postalCode,
      streetNumber: null,
      route: null,
      locality: null,
      administrativeArea: null,
    };
  }

  if (ADDRESSES_API_URL) {
    const workerPlace = await fetchWorkerAddressDetails(
      placeId,
      airportCode,
      userInput,
      suggestionName,
    );
    if (workerPlace) {
      return selectedPlaceFromParts({
        placeId: workerPlace.placeId,
        formattedAddress: workerPlace.formattedAddress || workerPlace.address,
        displayAddress: workerPlace.displayAddress || workerPlace.address,
        placeName: workerPlace.placeName,
        lat: workerPlace.lat,
        lng: workerPlace.lng,
        countryCode: workerPlace.countryCode,
        postalCode: workerPlace.postalCode,
        streetNumber: workerPlace.streetNumber,
        route: workerPlace.route,
        locality: workerPlace.locality,
        administrativeArea: workerPlace.administrativeArea,
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
      displayAddress: details.formattedAddress,
      placeName: null,
      lat: details.lat,
      lng: details.lng,
      countryCode: details.countryCode,
      postalCode: details.postalCode,
      streetNumber: details.streetNumber,
      route: details.route,
      locality: details.locality,
      administrativeArea: null,
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
      displayAddress: details.formattedAddress,
      placeName: null,
      lat: details.lat,
      lng: details.lng,
      countryCode: details.countryCode,
      postalCode: details.postalCode,
      streetNumber: details.streetNumber,
      route: details.route,
      locality: details.locality,
      administrativeArea: null,
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
    suggestionName,
  );
  sessionToken = createSessionToken();
  if (!details) {
    return null;
  }

  return selectedPlaceFromParts({
    placeId: details.placeId,
    formattedAddress: details.formattedAddress,
    displayAddress: details.displayAddress,
    placeName: details.placeName,
    lat: details.lat,
    lng: details.lng,
    countryCode: details.countryCode,
    postalCode: details.postalCode,
    streetNumber: details.streetNumber,
    route: details.route,
    locality: details.locality,
    administrativeArea: details.administrativeArea,
  });
}

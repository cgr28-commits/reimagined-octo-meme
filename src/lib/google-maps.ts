const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";

let loadPromise: Promise<typeof google.maps.places> | null = null;
let sessionToken: google.maps.places.AutocompleteSessionToken | null = null;

const NORTHERN_IRELAND_BIAS = {
  west: -8.2,
  north: 55.4,
  east: -5.4,
  south: 54.0,
};

export type AddressPrediction = {
  placeId: string;
  description: string;
  placePrediction: google.maps.places.PlacePrediction;
};

export function isGooglePlacesEnabled(): boolean {
  return API_KEY.length > 0;
}

function loadMapsScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps="bootstrap"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "bootstrap";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&loading=async`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export function loadGoogleMapsPlaces(): Promise<typeof google.maps.places> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is unavailable during SSR"));
  }

  if (!API_KEY) {
    return Promise.reject(new Error("Google Places API key is not configured"));
  }

  if (!loadPromise) {
    loadPromise = loadMapsScript().then(async () => {
      const places = (await google.maps.importLibrary("places")) as typeof google.maps.places;
      if (!places?.AutocompleteSuggestion) {
        throw new Error("Google Places library failed to initialise");
      }
      return places;
    });
  }

  return loadPromise;
}

function getSessionToken(places: typeof google.maps.places): google.maps.places.AutocompleteSessionToken {
  if (!sessionToken) {
    sessionToken = new places.AutocompleteSessionToken();
  }
  return sessionToken;
}

export function resetAutocompleteSession(places: typeof google.maps.places): void {
  sessionToken = new places.AutocompleteSessionToken();
}

export async function fetchAddressPredictions(
  input: string,
  countries: readonly string[],
): Promise<AddressPrediction[]> {
  const places = await loadGoogleMapsPlaces();
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken: getSessionToken(places),
    includedRegionCodes: [...countries],
    language: "en-GB",
    region: "gb",
    locationBias: NORTHERN_IRELAND_BIAS,
  });

  return suggestions
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is google.maps.places.PlacePrediction => prediction !== null)
    .map((prediction) => ({
      placeId: prediction.placeId,
      description: prediction.text.text,
      placePrediction: prediction,
    }));
}

export async function fetchPlaceDetails(
  prediction: google.maps.places.PlacePrediction,
): Promise<google.maps.places.Place | null> {
  const places = await loadGoogleMapsPlaces();

  try {
    const place = prediction.toPlace();
    await place.fetchFields({
      fields: ["formattedAddress", "addressComponents"],
    });
    resetAutocompleteSession(places);
    return place;
  } catch {
    resetAutocompleteSession(places);
    return null;
  }
}

export function parsePlaceAddress(place: google.maps.places.Place | google.maps.places.PlaceResult) {
  const components =
    "addressComponents" in place
      ? place.addressComponents
      : place.address_components;

  const get = (type: string) =>
    components?.find((component) => component.types.includes(type));

  const readName = (
    component:
      | google.maps.places.AddressComponent
      | google.maps.GeocoderAddressComponent
      | undefined,
  ) => {
    if (!component) {
      return undefined;
    }
    if ("longText" in component) {
      return component.longText ?? component.shortText ?? undefined;
    }
    return component.long_name;
  };

  return {
    postcode: readName(get("postal_code")),
    county:
      readName(get("administrative_area_level_2")) ??
      readName(get("administrative_area_level_1")),
    state: readName(get("administrative_area_level_1")),
    city: readName(get("postal_town")) ?? readName(get("locality")),
    town: readName(get("locality")) ?? readName(get("postal_town")),
    country: readName(get("country")),
    displayName:
      ("formattedAddress" in place ? place.formattedAddress : place.formatted_address) ?? undefined,
  };
}

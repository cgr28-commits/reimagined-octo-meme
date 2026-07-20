const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";

let loadPromise: Promise<void> | null = null;

export type AddressPrediction = {
  placeId: string;
  description: string;
};

export function isGooglePlacesEnabled(): boolean {
  return API_KEY.length > 0;
}

export function loadGoogleMapsPlaces(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (!API_KEY) {
    return Promise.reject(new Error("Google Places API key is not configured"));
  }

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps="places"]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
        return;
      }

      const script = document.createElement("script");
      script.dataset.googleMaps = "places";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&libraries=places&loading=async`;
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      script.onload = () => {
        const waitForPlaces = (attempts = 0) => {
          if (window.google?.maps?.places) {
            resolve();
            return;
          }
          if (attempts >= 40) {
            reject(new Error("Google Places failed to initialise"));
            return;
          }
          window.setTimeout(() => waitForPlaces(attempts + 1), 100);
        };
        waitForPlaces();
      };
      document.head.appendChild(script);
    });
  }

  return loadPromise;
}

export function fetchAddressPredictions(
  input: string,
  countries: readonly string[],
): Promise<AddressPrediction[]> {
  return loadGoogleMapsPlaces().then(
    () =>
      new Promise<AddressPrediction[]>((resolve) => {
        const service = new google.maps.places.AutocompleteService();
        service.getPlacePredictions(
          {
            input,
            componentRestrictions: { country: [...countries] },
            types: ["geocode"],
          },
          (predictions, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
              resolve([]);
              return;
            }

            resolve(
              predictions.map((prediction) => ({
                placeId: prediction.place_id,
                description: prediction.description,
              })),
            );
          },
        );
      }),
  );
}

export function fetchPlaceDetails(placeId: string): Promise<google.maps.places.PlaceResult | null> {
  return loadGoogleMapsPlaces().then(
    () =>
      new Promise((resolve) => {
        const service = new google.maps.places.PlacesService(document.createElement("div"));
        service.getDetails(
          {
            placeId,
            fields: ["formatted_address", "address_components"],
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place);
              return;
            }
            resolve(null);
          },
        );
      }),
  );
}

export function parsePlaceAddress(place: google.maps.places.PlaceResult) {
  const get = (type: string) =>
    place.address_components?.find((component) => component.types.includes(type));

  return {
    postcode: get("postal_code")?.long_name,
    county:
      get("administrative_area_level_2")?.long_name ??
      get("administrative_area_level_1")?.long_name,
    state: get("administrative_area_level_1")?.long_name,
    city: get("postal_town")?.long_name ?? get("locality")?.long_name,
    town: get("locality")?.long_name ?? get("postal_town")?.long_name,
    country: get("country")?.long_name,
    displayName: place.formatted_address,
  };
}

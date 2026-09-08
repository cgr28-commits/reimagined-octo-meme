const DEFAULT_WORKER_ADDRESSES =
  "https://reimagined-octo-meme.cgr28.workers.dev/addresses";

export function resolveAddressesApiUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_ADDRESSES_API_URL?.trim() ?? "";
  if (explicit) {
    return explicit;
  }

  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const host = new URL(bookings).hostname.toLowerCase();
      if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
        return DEFAULT_WORKER_ADDRESSES;
      }

      return bookings.replace(/\/bookings\/?$/, "/addresses");
    } catch {
      return DEFAULT_WORKER_ADDRESSES;
    }
  }

  return DEFAULT_WORKER_ADDRESSES;
}

export type WorkerAddressSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

export type WorkerResolvedAddress = {
  address: string;
  formattedAddress?: string | null;
  displayAddress?: string | null;
  placeName?: string | null;
  placeId: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  postalCode: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
  administrativeArea?: string | null;
  provider?: string;
};

export type WorkerAddressSuggestionsResult = {
  suggestions: WorkerAddressSuggestion[];
  needsHouseNumber?: boolean;
  postcode?: string;
  hint?: string;
  unavailable?: boolean;
};

const WORKER_SUGGESTION_CACHE_TTL_MS = 45_000;
const WORKER_SUGGESTION_CACHE_MAX = 80;
const workerSuggestionCache = new Map<
  string,
  { at: number; value: WorkerAddressSuggestionsResult }
>();

function workerSuggestionCacheKey(query: string, airportCode: string): string {
  return `${airportCode.trim().toUpperCase()}|${query.trim().toLowerCase()}`;
}

function readWorkerSuggestionCache(key: string): WorkerAddressSuggestionsResult | null {
  const hit = workerSuggestionCache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() - hit.at > WORKER_SUGGESTION_CACHE_TTL_MS) {
    workerSuggestionCache.delete(key);
    return null;
  }
  return {
    ...hit.value,
    suggestions: hit.value.suggestions.map((item) => ({ ...item })),
  };
}

function writeWorkerSuggestionCache(key: string, value: WorkerAddressSuggestionsResult): void {
  if (workerSuggestionCache.size >= WORKER_SUGGESTION_CACHE_MAX) {
    const oldest = workerSuggestionCache.keys().next().value;
    if (oldest) {
      workerSuggestionCache.delete(oldest);
    }
  }
  workerSuggestionCache.set(key, {
    at: Date.now(),
    value: {
      ...value,
      suggestions: value.suggestions.map((item) => ({ ...item })),
    },
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function fetchWorkerAddressSuggestions(
  query: string,
  airportCode: string,
  signal?: AbortSignal,
): Promise<WorkerAddressSuggestionsResult | null> {
  const cacheKey = workerSuggestionCacheKey(query, airportCode);
  const cached = readWorkerSuggestionCache(cacheKey);
  if (cached) {
    return cached;
  }

  const baseUrl = resolveAddressesApiUrl();
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  if (airportCode) {
    url.searchParams.set("airport", airportCode);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      suggestions?: WorkerAddressSuggestion[];
      needsHouseNumber?: boolean;
      postcode?: string;
      hint?: string;
      unavailable?: boolean;
    };

    const result: WorkerAddressSuggestionsResult = {
      suggestions: payload.suggestions ?? [],
      needsHouseNumber: Boolean(payload.needsHouseNumber),
      postcode: payload.postcode,
      hint: payload.hint,
      unavailable: Boolean(payload.unavailable),
    };
    writeWorkerSuggestionCache(cacheKey, result);
    return result;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw error instanceof Error ? error : new DOMException("Aborted", "AbortError");
    }
    return null;
  }
}

/** Forward-geocode an address string via the Worker (server Places key). */
export async function fetchWorkerForwardGeocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = address.trim();
  if (trimmed.length < 8) {
    return null;
  }

  const baseUrl = resolveAddressesApiUrl();
  const url = new URL(baseUrl);
  url.searchParams.set("forwardGeocode", trimmed);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { lat?: number; lng?: number };
    if (
      typeof payload.lat !== "number" ||
      typeof payload.lng !== "number" ||
      !Number.isFinite(payload.lat) ||
      !Number.isFinite(payload.lng)
    ) {
      return null;
    }
    return { lat: payload.lat, lng: payload.lng };
  } catch {
    return null;
  }
}

export async function fetchWorkerAddressDetails(
  placeId: string,
  airportCode: string,
  userInput?: string,
  suggestionName?: string,
): Promise<WorkerResolvedAddress | null> {
  const baseUrl = resolveAddressesApiUrl();
  const url = new URL(baseUrl);
  url.searchParams.set("id", placeId);
  if (airportCode) {
    url.searchParams.set("airport", airportCode);
  }
  if (userInput?.trim()) {
    url.searchParams.set("userInput", userInput.trim());
  }
  if (suggestionName?.trim()) {
    url.searchParams.set("suggestionName", suggestionName.trim());
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<WorkerResolvedAddress> & {
      address?: string;
    };
    const address = payload.address?.trim();
    if (!address) {
      return null;
    }

    return {
      address,
      formattedAddress: payload.formattedAddress?.trim() || address,
      displayAddress: payload.displayAddress?.trim() || address,
      placeName: payload.placeName?.trim() || null,
      placeId: payload.placeId?.trim() || placeId,
      lat: typeof payload.lat === "number" ? payload.lat : null,
      lng: typeof payload.lng === "number" ? payload.lng : null,
      countryCode: payload.countryCode?.trim() || null,
      postalCode: payload.postalCode?.trim() || null,
      streetNumber: payload.streetNumber?.trim() || null,
      route: payload.route?.trim() || null,
      locality: payload.locality?.trim() || null,
      administrativeArea: payload.administrativeArea?.trim() || null,
      provider: payload.provider,
    };
  } catch {
    return null;
  }
}

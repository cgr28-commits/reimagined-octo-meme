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

export async function fetchWorkerAddressSuggestions(
  query: string,
  airportCode: string,
): Promise<WorkerAddressSuggestion[] | null> {
  const baseUrl = resolveAddressesApiUrl();
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  if (airportCode) {
    url.searchParams.set("airport", airportCode);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      suggestions?: WorkerAddressSuggestion[];
    };

    return payload.suggestions ?? [];
  } catch {
    return null;
  }
}

export async function fetchWorkerAddressDetails(
  placeId: string,
  airportCode: string,
): Promise<string | null> {
  const baseUrl = resolveAddressesApiUrl();
  const url = new URL(baseUrl);
  url.searchParams.set("id", placeId);
  if (airportCode) {
    url.searchParams.set("airport", airportCode);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { address?: string };
    return payload.address?.trim() || null;
  } catch {
    return null;
  }
}

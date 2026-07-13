/**
 * Address autocomplete API for the quote form.
 *
 * Production uses a Cloudflare Worker (see workers/addresses/).
 * Local dev expects `npm run dev:addresses` on http://127.0.0.1:8787.
 */
const LOCAL_WORKER_URL = "http://127.0.0.1:8787";

export function getAddressApiBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_ADDRESS_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return LOCAL_WORKER_URL;
  }

  return null;
}

export function isAddressAutocompleteEnabled(): boolean {
  return getAddressApiBaseUrl() !== null;
}

export function buildAddressApiUrl(path: string, params: URLSearchParams): string | null {
  const base = getAddressApiBaseUrl();
  if (!base) {
    return null;
  }

  const pathname = path.startsWith("/") ? path : `/${path}`;
  const query = params.toString();
  return `${base}${pathname}${query ? `?${query}` : ""}`;
}

export function createAddressSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

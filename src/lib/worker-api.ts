/**
 * Public Cloudflare Worker base used by the live site for bookings, payments,
 * addresses, and related APIs. Safe to embed in the client — secrets stay on the Worker.
 */
export const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

export const DEFAULT_WORKER_BOOKINGS = `${DEFAULT_WORKER_BASE}/bookings`;

/**
 * Resolve the bookings API URL for browser calls.
 * Prefers NEXT_PUBLIC_BOOKINGS_API_URL when it points at the Worker; ignores
 * values that accidentally point at the marketing site; falls back to the
 * verified production Worker endpoint.
 */
export function resolveBookingsApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!configured) {
    return DEFAULT_WORKER_BOOKINGS;
  }

  try {
    const host = new URL(configured).hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return DEFAULT_WORKER_BOOKINGS;
    }
    return configured;
  } catch {
    return DEFAULT_WORKER_BOOKINGS;
  }
}

export function resolveWorkerBaseUrl(): string {
  return resolveBookingsApiUrl().replace(/\/bookings\/?$/i, "") || DEFAULT_WORKER_BASE;
}

export function resolvePaymentsApiUrl(): string {
  return `${resolveWorkerBaseUrl()}/payments`;
}

export function resolvePaymentsConfirmApiUrl(): string {
  return `${resolveWorkerBaseUrl()}/payments/confirm`;
}

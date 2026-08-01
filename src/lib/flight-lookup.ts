import { resolveAddressesApiUrl } from "@/lib/addresses-api";
import type { TripDirection, VerifiedFlight } from "../../shared/flight-lookup";
export type { TripDirection, VerifiedFlight } from "../../shared/flight-lookup";
export {
  formatFlightNumberForDisplay,
  isValidFlightNumberFormat,
} from "../../shared/flight-lookup";

export type ClientFlightLookupResult =
  | { ok: true; flight: VerifiedFlight; configured: boolean }
  | { ok: false; error: string; code: string; configured: boolean };

const SOFT_FAILURE_CODES = new Set([
  "rate_limited",
  "upstream_error",
  "service_unavailable",
  "network_error",
]);

export function isSoftFlightLookupFailure(code: string): boolean {
  return SOFT_FAILURE_CODES.has(code);
}

export function resolveFlightsApiUrl(): string {
  const addressesUrl = resolveAddressesApiUrl();
  return addressesUrl.replace(/\/addresses\/?$/, "/flights");
}

export async function lookupFlightForBooking(params: {
  flightNumber: string;
  tripDate: string;
  airportCode: string;
  direction: TripDirection;
}): Promise<ClientFlightLookupResult> {
  const url = new URL(resolveFlightsApiUrl());
  url.searchParams.set("flight", params.flightNumber.trim());
  url.searchParams.set("date", params.tripDate);
  url.searchParams.set("airport", params.airportCode);
  url.searchParams.set("direction", params.direction);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    const raw = await response.text();
    let payload: {
      ok?: boolean;
      flight?: VerifiedFlight;
      error?: string;
      code?: string;
      configured?: boolean;
    };

    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return {
        ok: false,
        error:
          "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
        code: "upstream_error",
        configured: false,
      };
    }

    if (response.status === 404 && payload.error === "Not found" && payload.code == null) {
      return {
        ok: false,
        error:
          "Flight verification is not live yet — the website worker needs redeploying in Cloudflare.",
        code: "service_unavailable",
        configured: false,
      };
    }

    if (payload.ok && payload.flight) {
      return { ok: true, flight: payload.flight, configured: payload.configured !== false };
    }

    const code = payload.code ?? "unknown";
    const configured = payload.configured !== false && !SOFT_FAILURE_CODES.has(code);

    return {
      ok: false,
      error: payload.error ?? "Could not verify this flight.",
      code,
      configured,
    };
  } catch {
    return {
      ok: false,
      error:
        "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "network_error",
      configured: false,
    };
  }
}

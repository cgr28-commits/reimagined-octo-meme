/**
 * Returning-customer restore: address text alone is never a confirmed place.
 * Payment must not proceed without quote-ready Places (placeId + coords) and a
 * successful route revalidation.
 */

import { normaliseJourneyAddressCompareKey } from "./journey-address-label";
import type { RouteResolveFailureReason } from "./route-metrics-resolver";

export const ROUTE_RECONFIRMATION_CODE = "route_reconfirmation_required" as const;
export const ROUTE_SERVICE_UNAVAILABLE_CODE = "route_service_unavailable" as const;

export const ROUTE_RECONFIRMATION_MESSAGE =
  "Please select your pickup and drop-off addresses again from the suggestions";

export const ROUTE_SERVICE_UNAVAILABLE_MESSAGE =
  "We could not verify the road route just now. Your addresses look fine — please try payment again in a moment.";

export type RestorablePlace = {
  placeId?: string | null;
  formattedAddress?: string | null;
  displayAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  countryCode?: string | null;
  postalCode?: string | null;
  placeName?: string | null;
  streetNumber?: string | null;
  route?: string | null;
  locality?: string | null;
};

export function isQuoteReadyRestorablePlace(
  place: RestorablePlace | null | undefined,
): place is RestorablePlace & {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
} {
  if (!place) return false;
  const placeId = String(place.placeId ?? "").trim();
  const formatted = String(place.formattedAddress ?? "").trim();
  const lat = place.lat;
  const lng = place.lng;
  return (
    placeId.length > 0 &&
    formatted.length > 0 &&
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

export function placeDisplayLabel(place: RestorablePlace): string {
  return String(place.displayAddress || place.formattedAddress || "").trim();
}

/** True when typed/restored address text still matches the confirmed place label. */
export function addressTextMatchesPlace(
  addressText: string,
  place: RestorablePlace | null | undefined,
): boolean {
  if (!isQuoteReadyRestorablePlace(place)) return false;
  const textKey = normaliseJourneyAddressCompareKey(addressText);
  if (!textKey) return false;
  const labelKey = normaliseJourneyAddressCompareKey(placeDisplayLabel(place));
  const formattedKey = normaliseJourneyAddressCompareKey(
    String(place.formattedAddress ?? ""),
  );
  return textKey === labelKey || textKey === formattedKey;
}

/**
 * A restored booking is payment-ready only when both ends are quote-ready places
 * whose labels still match the visible address fields.
 */
export function restoredPlacesReadyForPayment(params: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlace: RestorablePlace | null | undefined;
  dropoffPlace: RestorablePlace | null | undefined;
}): boolean {
  return (
    addressTextMatchesPlace(params.pickupAddress, params.pickupPlace) &&
    addressTextMatchesPlace(params.dropoffAddress, params.dropoffPlace)
  );
}

export type RouteReconfirmationEndpoint = "pickup" | "dropoff" | "both";

export type RouteReconfirmationPaymentErrorBody = {
  error: string;
  code: typeof ROUTE_RECONFIRMATION_CODE;
  /** Which address field(s) need reselection when known. */
  endpoint?: RouteReconfirmationEndpoint;
};

export type RouteServiceUnavailablePaymentErrorBody = {
  error: string;
  code: typeof ROUTE_SERVICE_UNAVAILABLE_CODE;
};

export function buildRouteReconfirmationPaymentError(
  endpoint: RouteReconfirmationEndpoint = "both",
): RouteReconfirmationPaymentErrorBody {
  return {
    error: ROUTE_RECONFIRMATION_MESSAGE,
    code: ROUTE_RECONFIRMATION_CODE,
    endpoint,
  };
}

export function buildRouteServiceUnavailablePaymentError(): RouteServiceUnavailablePaymentErrorBody {
  return {
    error: ROUTE_SERVICE_UNAVAILABLE_MESSAGE,
    code: ROUTE_SERVICE_UNAVAILABLE_CODE,
  };
}

/** Map resolver failure reasons onto payment HTTP error bodies. */
export function paymentErrorForRouteFailure(
  reason: RouteResolveFailureReason,
  endpoint?: "pickup" | "dropoff" | "route",
): RouteReconfirmationPaymentErrorBody | RouteServiceUnavailablePaymentErrorBody {
  if (reason === "provider_unavailable" || reason === "routing_unavailable") {
    return buildRouteServiceUnavailablePaymentError();
  }
  const field: RouteReconfirmationEndpoint =
    endpoint === "pickup" || endpoint === "dropoff" ? endpoint : "both";
  return buildRouteReconfirmationPaymentError(field);
}

/**
 * Retry a route/geocode resolve once for transient failures.
 * Never invents metrics — returns null when both attempts fail.
 */
export async function resolveRouteMetricsWithRetry<T>(
  resolve: () => Promise<T | null>,
): Promise<T | null> {
  const first = await resolve();
  if (first) return first;
  return resolve();
}

/**
 * Retry an outcome-aware route resolve once when the failure looks transient.
 */
export async function resolveRouteOutcomeWithRetry<T extends { ok: boolean; reason?: string }>(
  resolve: () => Promise<T>,
): Promise<T> {
  const first = await resolve();
  if (first.ok) return first;
  if (
    first.reason === "provider_unavailable" ||
    first.reason === "routing_unavailable"
  ) {
    return resolve();
  }
  return first;
}

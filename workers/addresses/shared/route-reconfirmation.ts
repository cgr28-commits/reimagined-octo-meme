/**
 * Returning-customer restore: address text alone is never a confirmed place.
 * Payment must not proceed without quote-ready Places (placeId + coords) and a
 * successful route revalidation.
 */

import { normaliseJourneyAddressCompareKey } from "./journey-address-label";

export const ROUTE_RECONFIRMATION_CODE = "route_reconfirmation_required" as const;

export const ROUTE_RECONFIRMATION_MESSAGE =
  "Please select your pickup and drop-off addresses again from the suggestions";

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

export type RouteReconfirmationPaymentErrorBody = {
  error: string;
  code: typeof ROUTE_RECONFIRMATION_CODE;
};

export function buildRouteReconfirmationPaymentError(): RouteReconfirmationPaymentErrorBody {
  return {
    error: ROUTE_RECONFIRMATION_MESSAGE,
    code: ROUTE_RECONFIRMATION_CODE,
  };
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

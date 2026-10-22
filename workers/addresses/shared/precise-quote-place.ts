/** Structured Google Place Details evidence required for a new fixed-price quote. */
import { servedAirportFromPlaceId } from "./served-airports";

export const PRECISE_LOCATION_MESSAGE =
  "Please choose a full address, hotel or individual building from the suggestions.";

export type QuotePlaceEvidence = {
  placeId?: string | null;
  formattedAddress?: string | null;
  placeName?: string | null;
  lat?: number | null;
  lng?: number | null;
  streetNumber?: string | null;
  route?: string | null;
  types?: readonly string[] | null;
  provider?: string | null;
};

export function isPreciseQuotePlace(place: QuotePlaceEvidence | null | undefined): boolean {
  if (!place?.placeId?.trim() || !place.formattedAddress?.trim()) return false;
  if (typeof place.lat !== "number" || typeof place.lng !== "number" ||
      !Number.isFinite(place.lat) || !Number.isFinite(place.lng) ||
      Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return false;
  const airport = servedAirportFromPlaceId(place.placeId);
  if (airport) return place.lat === airport.lat && place.lng === airport.lng;
  if (place.provider !== "google" || !Array.isArray(place.types) || !place.types.length) return false;
  const types = new Set(place.types);
  // These describe an area/road, even if its name contains a number or business word.
  if (place.types.some(type => /^(route|intersection|political|locality|sublocality.*|neighborhood|postal_.*|administrative_area_.*|country|natural_feature|park)$/.test(type))) return false;
  if (types.has("premise") || types.has("subpremise")) return true;
  if (types.has("street_address")) return Boolean(place.streetNumber?.trim() && place.route?.trim());
  // A named individual venue need not have a street number (hotels, stations, etc.).
  return Boolean(place.placeName?.trim() &&
    (types.has("establishment") || types.has("point_of_interest")));
}

/**
 * Temporary EMERGE Belfast weekend fixed fare:
 * Boucher Playing Fields ↔ Belfast city centre = £24 on 29–30 Aug 2026 only.
 *
 * Uses the customer's selected pickup (outbound) date. After 30 Aug 2026 the
 * date gate fails automatically and normal A2A pricing applies — no manual off-switch.
 */

import emergeConfig from "@/lib/emerge-belfast-config.json";
import { haversineMeters } from "../../shared/tracking";

export type FestivalEndpoint = {
  address?: string | null;
  placeName?: string | null;
  displayAddress?: string | null;
  formattedAddress?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
};

type FestivalFareConfig = {
  amountGbp: number;
  /** Inclusive UK calendar dates (YYYY-MM-DD) when the fixed fare applies. */
  activeDates: string[];
  boucher: {
    lat: number;
    lng: number;
    radiusMeters: number;
    nameNeedles: string[];
    postcodes: string[];
  };
  cityCentre: {
    lat: number;
    lng: number;
    radiusMeters: number;
    /** Core centre districts only — excludes outer Belfast (e.g. BT9/BT12). */
    postcodeDistricts: string[];
    nameNeedles: string[];
  };
};

const FARE = (emergeConfig as { festivalCityCentreFixedFare?: FestivalFareConfig })
  .festivalCityCentreFixedFare;

export const EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP = FARE?.amountGbp ?? 24;

/** Inclusive active dates — after the last date the rule never matches. */
export const EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_DATES: readonly string[] =
  FARE?.activeDates ?? ["2026-08-29", "2026-08-30"];

function normalisedBlob(endpoint: FestivalEndpoint): string {
  return [
    endpoint.placeName,
    endpoint.displayAddress,
    endpoint.formattedAddress,
    endpoint.address,
    endpoint.postalCode,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractPostcodeDistrict(text: string): string | null {
  const match = text.toUpperCase().match(/\b(BT\d{1,2})\s*\d[A-Z]{2}\b/)
    ?? text.toUpperCase().match(/\b(BT\d{1,2})\b/);
  return match?.[1] ?? null;
}

function extractFullPostcode(text: string): string | null {
  const match = text.toUpperCase().match(/\b(BT\d{1,2})\s*(\d[A-Z]{2})\b/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

function hasCoords(endpoint: FestivalEndpoint): endpoint is FestivalEndpoint & {
  lat: number;
  lng: number;
} {
  return (
    typeof endpoint.lat === "number" &&
    typeof endpoint.lng === "number" &&
    Number.isFinite(endpoint.lat) &&
    Number.isFinite(endpoint.lng)
  );
}

function withinRadius(
  endpoint: FestivalEndpoint,
  lat: number,
  lng: number,
  radiusMeters: number,
): boolean {
  if (!hasCoords(endpoint)) return false;
  return haversineMeters(endpoint.lat, endpoint.lng, lat, lng) <= radiusMeters;
}

export function isBoucherPlayingFieldsEndpoint(endpoint: FestivalEndpoint): boolean {
  if (!FARE) return false;
  const blob = normalisedBlob(endpoint);
  if (!blob && !hasCoords(endpoint)) return false;

  for (const needle of FARE.boucher.nameNeedles) {
    if (blob.includes(needle.toLowerCase())) {
      return true;
    }
  }

  const fullPc = extractFullPostcode(blob);
  if (fullPc && FARE.boucher.postcodes.some((pc) => pc.toUpperCase() === fullPc)) {
    return true;
  }

  if (
    withinRadius(
      endpoint,
      FARE.boucher.lat,
      FARE.boucher.lng,
      FARE.boucher.radiusMeters,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Tight Belfast city-centre match (BT1/BT2 + centre landmarks / coords).
 * Deliberately excludes outer Belfast districts such as BT9 / BT12 / BT7.
 */
export function isBelfastCityCentreEndpoint(endpoint: FestivalEndpoint): boolean {
  if (!FARE) return false;
  // Never treat the festival venue itself as "city centre".
  if (isBoucherPlayingFieldsEndpoint(endpoint)) {
    return false;
  }

  const blob = normalisedBlob(endpoint);
  if (!blob && !hasCoords(endpoint)) return false;

  for (const needle of FARE.cityCentre.nameNeedles) {
    if (blob.includes(needle.toLowerCase())) {
      return true;
    }
  }

  const district = extractPostcodeDistrict(blob);
  if (district && FARE.cityCentre.postcodeDistricts.includes(district)) {
    return true;
  }

  // Explicit outer-Belfast districts must not qualify via the loose "belfast" word.
  if (district && !FARE.cityCentre.postcodeDistricts.includes(district)) {
    return false;
  }

  if (
    withinRadius(
      endpoint,
      FARE.cityCentre.lat,
      FARE.cityCentre.lng,
      FARE.cityCentre.radiusMeters,
    )
  ) {
    return true;
  }

  return false;
}

export function isEmergeBoucherCityCentreFixedFareDate(outboundDate?: string | null): boolean {
  const date = outboundDate?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  return EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_DATES.includes(date);
}

/**
 * Returns the fixed one-way GBP amount when the temporary EMERGE rule applies,
 * otherwise null (caller continues with the normal pricing engine).
 */
export function resolveEmergeBoucherCityCentreOneWayGbp(input: {
  pickup: FestivalEndpoint;
  dropoff: FestivalEndpoint;
  /** Customer's selected pickup / outbound date (YYYY-MM-DD). */
  outboundDate?: string | null;
}): number | null {
  if (!FARE) return null;
  if (!isEmergeBoucherCityCentreFixedFareDate(input.outboundDate)) {
    return null;
  }

  const pickupBoucher = isBoucherPlayingFieldsEndpoint(input.pickup);
  const dropoffBoucher = isBoucherPlayingFieldsEndpoint(input.dropoff);
  const pickupCentre = isBelfastCityCentreEndpoint(input.pickup);
  const dropoffCentre = isBelfastCityCentreEndpoint(input.dropoff);

  const eitherDirection =
    (pickupBoucher && dropoffCentre) || (pickupCentre && dropoffBoucher);

  if (!eitherDirection) {
    return null;
  }

  return EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP;
}

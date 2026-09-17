/**
 * Eligibility helper for BFS / BHD / DUB airport pickups.
 *
 * Instant quotes require the non-airport destination to be inside the existing
 * Greater Belfast classifier (`shared/ldy-service-area.ts`). This file does not
 * expand that postcode / place / geofence definition.
 *
 * BFS/BHD ↔ Republic of Ireland address remains an existing instant corridor.
 * LDY keeps its own Greater Belfast gate in calculateQuote / QuoteCard.
 */

import { extractPostcode } from "./address-validation";
import {
  classifyGreaterBelfastServiceArea,
  greaterBelfastDistrictFromPostcode,
  isGreaterBelfastPostcodeDistrict,
  isGreaterBelfastServiceAddress,
} from "./ldy-service-area";
import { matchServedAirportCode } from "./served-airports";

export const AIRPORT_PICKUP_DESTINATION_GATE_CODES = ["BFS", "BHD", "DUB"] as const;

export type AirportPickupDestinationGateCode =
  (typeof AIRPORT_PICKUP_DESTINATION_GATE_CODES)[number];

/** Place names that are clearly outside Greater Belfast (email / string guards). */
const CLEARLY_OUTSIDE_DESTINATION_PATTERN =
  /\b(newry|dungannon|coalisland|omagh|enniskillen|eniskillen|armagh|cookstown|strabane|coleraine|derry|londonderry|magherafelt|limavady|portrush|portstewart|ballycastle)\b/i;

export function isAirportPickupDestinationGateCode(
  code: string | null | undefined,
): code is AirportPickupDestinationGateCode {
  const normalised = String(code ?? "")
    .trim()
    .toUpperCase();
  return (
    normalised === "BFS" || normalised === "BHD" || normalised === "DUB"
  );
}

/** Existing Greater Belfast classifier — postcode, place-name, or geofence. */
export function isApprovedAirportPickupDestination(input: {
  addressText?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): boolean {
  return classifyGreaterBelfastServiceArea({
    lat: input.lat,
    lng: input.lng,
    postalCode: input.postalCode,
    addressText: input.addressText,
  }).inside;
}

/**
 * True when address text is a known out-of-area destination (outside BT district
 * or named town). Ambiguous labels (e.g. Jordanstown without a postcode) are
 * not treated as outside — those rely on coordinates in the place classifier.
 */
export function isClearlyOutsideApprovedAirportPickupDestination(
  address: string,
): boolean {
  const text = address.trim();
  if (!text) {
    return false;
  }
  if (isGreaterBelfastServiceAddress(text)) {
    return false;
  }
  const postcode = extractPostcode(text);
  const district =
    greaterBelfastDistrictFromPostcode(postcode) ??
    text.match(/\b(BT\d{1,2})\b/i)?.[1]?.toUpperCase() ??
    null;
  if (district && !isGreaterBelfastPostcodeDistrict(district)) {
    return true;
  }
  return CLEARLY_OUTSIDE_DESTINATION_PATTERN.test(text);
}

/**
 * BFS/BHD ↔ ROI address stays instant (existing corridor). DUB pickup to an
 * ROI city is not that corridor.
 */
export function isRoiNonAirportAddressText(address: string): boolean {
  const text = address.toLowerCase();
  if (!text.trim()) {
    return false;
  }
  if (text.includes("northern ireland")) {
    return false;
  }
  if (/dublin airport|\bdub\b/i.test(address)) {
    return false;
  }
  if (/\bbt\d/i.test(address)) {
    return false;
  }
  if (/\b[a-z]\d{2}\s?[a-z0-9]{4}\b/i.test(address)) {
    return true;
  }
  if (
    text.includes("co. dublin") ||
    text.includes("county dublin") ||
    text.includes("cork") ||
    text.includes("galway") ||
    text.includes("limerick") ||
    text.includes("waterford") ||
    text.includes("donegal")
  ) {
    if (
      text.includes("ireland") ||
      text.includes("eircode") ||
      /\b[a-z]\d{2}\s?[a-z0-9]{4}\b/i.test(address)
    ) {
      return true;
    }
  }
  return (
    (text.includes("ireland") || text.includes("dublin")) &&
    !text.includes("northern ireland")
  );
}

export function destinationEligibleForStandardAirportPickup(input: {
  airportCode: string | null | undefined;
  addressText?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): boolean {
  const airportCode = String(input.airportCode ?? "")
    .trim()
    .toUpperCase();
  if (!isAirportPickupDestinationGateCode(airportCode)) {
    return true;
  }
  if (
    isApprovedAirportPickupDestination({
      addressText: input.addressText,
      postalCode: input.postalCode,
      lat: input.lat,
      lng: input.lng,
    })
  ) {
    return true;
  }
  const address = input.addressText?.trim() ?? "";
  if (
    (airportCode === "BFS" || airportCode === "BHD") &&
    isRoiNonAirportAddressText(address)
  ) {
    return true;
  }
  return false;
}

export function detectAirportPickupCodeFromLabels(input: {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripLabel?: string | null;
  airportCode?: string | null;
  isAirportTrip?: boolean;
}): string | null {
  const pickupAirport = matchServedAirportCode(input.pickupLabel ?? "");
  if (isAirportPickupDestinationGateCode(pickupAirport)) {
    return pickupAirport;
  }
  const dropoffAirport = matchServedAirportCode(input.dropoffLabel ?? "");
  const trip = input.tripLabel ?? "";
  const fromAirportTrip =
    /airport pickup/i.test(trip) ||
    (Boolean(input.isAirportTrip) &&
      !dropoffAirport &&
      isAirportPickupDestinationGateCode(input.airportCode));
  if (fromAirportTrip && isAirportPickupDestinationGateCode(input.airportCode)) {
    return String(input.airportCode).trim().toUpperCase();
  }
  return null;
}

/**
 * Quote-lead / string-label guard. Suppresses an automatic £ only when the
 * pickup is BFS/BHD/DUB and the destination is clearly outside Greater Belfast
 * (and not the BFS/BHD ROI instant corridor).
 */
export function quoteLeadAirportPickupRequiresManualApproval(input: {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripLabel?: string | null;
  airportCode?: string | null;
  isAirportTrip?: boolean;
}): boolean {
  const pickupAirport = detectAirportPickupCodeFromLabels(input);
  if (!isAirportPickupDestinationGateCode(pickupAirport)) {
    return false;
  }
  const dropoffLabel = input.dropoffLabel?.trim() ?? "";
  if (!dropoffLabel) {
    return false;
  }
  if (matchServedAirportCode(dropoffLabel)) {
    return false;
  }
  if (
    destinationEligibleForStandardAirportPickup({
      airportCode: pickupAirport,
      addressText: dropoffLabel,
    })
  ) {
    return false;
  }
  return isClearlyOutsideApprovedAirportPickupDestination(dropoffLabel);
}

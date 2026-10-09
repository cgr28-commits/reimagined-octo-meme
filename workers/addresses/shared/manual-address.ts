/**
 * Customer-typed premises addresses.
 *
 * A typed line is kept as the customer entered it. Coordinates are never
 * invented from a postcode centroid or a nearby street.
 */

import {
  extractNorthernIrelandPostcode,
  isFullNorthernIrelandPostcode,
  isNorthernIrelandPlaceName,
  normaliseNorthernIrelandPostcode,
} from "./address-validation";
import { extractLeadingStreetNumber } from "./journey-address-label";

export const UNVERIFIED_MANUAL_PLACE_PREFIX = "unverified:";

export const UNVERIFIED_ADDRESS_FARE_MESSAGE =
  "We could not verify this address for a road route, so an online fare is not available. Request a manual quote and we will confirm the price.";

const THOROUGHFARE_TYPE =
  /^(?:st|street|rd|road|ave|avenue|ln|lane|close|court|crescent|park|way|terrace|drive|place|gardens|grove|hill|row|square|mews|walk|gate|parade|dr|ct)$/i;

export type ParsedManualAddress = {
  houseNumber: string | null;
  /** Premises line without the leading number, e.g. "Knockagh Terrace". */
  street: string;
  /** Extra thoroughfare the customer typed, e.g. "Upper Road". */
  dependentStreet: string | null;
  /** Earlier locality when a post town is also present, e.g. Greenisland. */
  locality: string | null;
  /** Post town or the locality the customer named. */
  town: string;
  postcode: string;
  /** Customer text with spacing and the postcode normalised. Nothing dropped. */
  formatted: string;
};

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function segmentsOf(query: string): string[] {
  return query
    .split(",")
    .map((part) => tidy(part))
    .filter(Boolean);
}

function stripPostcode(segment: string, postcode: string): string {
  if (!postcode.trim()) return tidy(segment);
  const compact = postcode.replace(/\s+/g, "");
  return tidy(
    segment
      .replace(new RegExp(postcode.replace(/\s+/g, "\\s*"), "ig"), " ")
      .replace(new RegExp(compact, "ig"), " "),
  );
}

function isThoroughfare(segment: string): boolean {
  const words = segment.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return THOROUGHFARE_TYPE.test(words[words.length - 1] ?? "");
}

/** Distinctive words from the premises line. Generic street types are ignored. */
export function distinctiveStreetTokens(premisesLine: string): string[] {
  const withoutNumber = premisesLine.replace(/^\d+[a-zA-Z]?\s+/, "");
  const tokens = withoutNumber
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !THOROUGHFARE_TYPE.test(token));
  return [...new Set(tokens)];
}

export function typedStreetTokensCovered(query: string, label: string): boolean {
  const first = segmentsOf(query)[0] ?? query;
  const tokens = distinctiveStreetTokens(stripPostcode(first, extractNorthernIrelandPostcode(query) ?? ""));
  if (tokens.length === 0) return true;
  const hay = label.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

/**
 * A complete typed premises address: house number or building name, street,
 * town, and a full BT postcode. Postcode-only and street-only lines are not
 * complete — the town and postcode must be present in what the customer typed.
 */
export function parseManualServiceAddress(query: string): ParsedManualAddress | null {
  const original = tidy(query);
  if (original.length < 8) return null;

  const postcode = extractNorthernIrelandPostcode(original);
  if (!postcode || !isFullNorthernIrelandPostcode(postcode)) return null;

  const normalisedPostcode = normaliseNorthernIrelandPostcode(postcode);
  const parts = segmentsOf(original)
    .map((part) => stripPostcode(part, postcode))
    .filter(Boolean);
  if (parts.length === 0) return null;

  const premises = parts[0] ?? "";
  const houseNumber = extractLeadingStreetNumber(premises);
  const street = tidy(houseNumber ? premises.replace(/^\d+[a-zA-Z]?\s+/, "") : premises);
  if (street.length < 3) return null;
  if (!houseNumber && isNorthernIrelandPlaceName(street) && street.split(/\s+/).length < 2) {
    return null;
  }
  if (!houseNumber && !isThoroughfare(street) && street.split(/\s+/).length < 2) {
    return null;
  }

  const rest = parts.slice(1);
  const placeParts = rest.filter((part) => isNorthernIrelandPlaceName(part));
  const thoroughfares = rest.filter((part) => isThoroughfare(part) && !isNorthernIrelandPlaceName(part));
  const townSource = placeParts[placeParts.length - 1] ?? rest.find((part) => !isThoroughfare(part)) ?? "";
  const town = tidy(townSource);
  if (!town || town.length < 3) return null;

  const localityCandidate = placeParts.length >= 2 ? placeParts[0] : null;
  const locality =
    localityCandidate && localityCandidate.toLowerCase() !== town.toLowerCase()
      ? tidy(localityCandidate)
      : null;

  const formatted = original.replace(
    new RegExp(postcode.replace(/\s+/g, "\\s*"), "i"),
    normalisedPostcode,
  );

  return {
    houseNumber,
    street,
    dependentStreet: thoroughfares[0] ? tidy(thoroughfares[0]) : null,
    locality,
    town,
    postcode: normalisedPostcode,
    formatted: tidy(formatted),
  };
}

export function isUnverifiedManualPlaceId(placeId: string | null | undefined): boolean {
  return String(placeId ?? "").trim().startsWith(UNVERIFIED_MANUAL_PLACE_PREFIX);
}

export function unverifiedManualPlaceId(formatted: string): string {
  const compact = formatted.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);
  return `${UNVERIFIED_MANUAL_PLACE_PREFIX}${compact || "address"}`;
}

export function isUnverifiedManualPlace(place: { placeId?: string | null } | null | undefined): boolean {
  return isUnverifiedManualPlaceId(place?.placeId);
}

/**
 * Automatic fares need a provider place. A typed premises line with no provider
 * id, or an explicit unverified id, must not be geocoded into a price.
 * Airport and other non-premises labels stay allowed.
 */
export function endpointAllowsAutomaticFare(
  placeId: string | null | undefined,
  address: string,
): boolean {
  if (isUnverifiedManualPlaceId(placeId)) return false;
  if (String(placeId ?? "").trim()) return true;
  return parseManualServiceAddress(address) == null;
}

type RankableSuggestion = { label: string; mainText: string };

/**
 * Keep premises that match the typed house number, street and postcode.
 * A pure postcode keeps the provider list (capped) so the door is not cut off
 * before the customer types a number. A numbered street that matches nothing
 * returns an empty list rather than unrelated doors.
 */
export function selectMatchingPremises<T extends RankableSuggestion>(
  query: string,
  items: T[],
  limit = 8,
): T[] {
  const parsed = parseManualServiceAddress(query);
  const postcode = extractNorthernIrelandPostcode(query);
  const first = segmentsOf(query)[0] ?? query;
  const tokens = distinctiveStreetTokens(stripPostcode(first, postcode ?? ""));
  const number = extractLeadingStreetNumber(stripPostcode(first, postcode ?? "")) ??
    extractLeadingStreetNumber(query);

  if (!number && tokens.length === 0) {
    return items.slice(0, 25);
  }

  const wantedPostcode = (parsed?.postcode ?? (postcode && isFullNorthernIrelandPostcode(postcode) ? normaliseNorthernIrelandPostcode(postcode) : ""))
    .replace(/\s+/g, "")
    .toUpperCase();

  const matched = items.filter((item) => {
    const label = `${item.mainText} ${item.label}`;
    if (tokens.length > 0 && !typedStreetTokensCovered(first, label)) return false;
    if (number) {
      const leading =
        extractLeadingStreetNumber(item.mainText) ?? extractLeadingStreetNumber(item.label);
      if (leading && leading.toLowerCase() !== number.toLowerCase()) return false;
      if (!leading && !new RegExp(`\\b${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(label)) {
        return false;
      }
    }
    if (wantedPostcode) {
      const resultPostcode = extractNorthernIrelandPostcode(item.label);
      if (
        resultPostcode &&
        resultPostcode.replace(/\s+/g, "").toUpperCase() !== wantedPostcode
      ) {
        return false;
      }
    }
    return true;
  });

  return matched.slice(0, limit);
}

/**
 * A provider record matches only when its own text contains the typed door,
 * street and postcode. A number we would have to add ourselves does not count.
 */
export function providerRecordMatchesTypedAddress(
  query: string,
  record: { formattedAddress?: string | null; streetNumber?: string | null; route?: string | null; postcode?: string | null },
): boolean {
  const parsed = parseManualServiceAddress(query);
  if (!parsed) return false;
  const formatted = tidy(record.formattedAddress ?? "");
  const route = tidy(record.route ?? "");
  const hay = `${formatted} ${route}`.toLowerCase();
  const tokens = distinctiveStreetTokens(parsed.street);
  if (tokens.length > 0 && !tokens.every((token) => hay.includes(token))) return false;
  if (parsed.houseNumber) {
    const providerNumber = tidy(record.streetNumber ?? "");
    const formattedNumber = extractLeadingStreetNumber(formatted);
    const number = (providerNumber || formattedNumber || "").toLowerCase();
    if (number !== parsed.houseNumber.toLowerCase()) return false;
  }
  const recordPostcode = (record.postcode ?? extractNorthernIrelandPostcode(formatted) ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!recordPostcode || recordPostcode !== parsed.postcode.replace(/\s+/g, "").toUpperCase()) {
    return false;
  }
  return true;
}

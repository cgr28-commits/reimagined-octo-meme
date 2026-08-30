import { extractPostcode } from "./address-validation";

/**
 * Current Greater Belfast / LDY corridor service boundary (do not expand silently).
 *
 * 1) Postcode districts (supporting):
 *    BT1–BT20, BT22, BT23, BT26–BT29, BT36–BT43
 * 2) Place-name pattern (supporting): belfast, lisburn, newtownabbey, bangor,
 *    holywood, carrickfergus, newtownards, comber, dundonald, hillsborough,
 *    larne, ballyclare, antrim, ballymena, finaghy, malone, titanic quarter
 * 3) Coordinate rectangle (primary when lat/lng are present) — same box already
 *    used for LDY Places bias via getLdyLocationRestriction():
 *    latitude 54.45 … 54.78, longitude −6.35 … −5.55
 *
 * Eligibility prefers verified coordinates; missing postcode alone must not
 * force “out of area” when coordinates fall inside this rectangle.
 */

/** BT districts served for LDY (Derry Airport) → greater Belfast transfers. */
export const GREATER_BELFAST_POSTCODE_DISTRICTS = new Set([
  "BT1",
  "BT2",
  "BT3",
  "BT4",
  "BT5",
  "BT6",
  "BT7",
  "BT8",
  "BT9",
  "BT10",
  "BT11",
  "BT12",
  "BT13",
  "BT14",
  "BT15",
  "BT16",
  "BT17",
  "BT18",
  "BT19",
  "BT20",
  "BT22",
  "BT23",
  "BT26",
  "BT27",
  "BT28",
  "BT29",
  "BT36",
  "BT37",
  "BT38",
  "BT39",
  "BT40",
  "BT41",
  "BT42",
  "BT43",
]);

const NORTH_WEST_NI_PATTERN =
  /\b(derry|londonderry|coleraine|omagh|eniskillen|cookstown|strabane|magherafelt|limavady|portrush|portstewart|castlerock|ballycastle|derry~londonderry)\b/i;

const GREATER_BELFAST_PATTERN =
  /\b(belfast|lisburn|newtownabbey|bangor|holywood|carrickfergus|newtownards|comber|dundonald|hillsborough|larne|ballyclare|antrim|ballymena|finaghy|malone|titanic quarter)\b/i;

/** Inclusive WGS84 rectangle — matches getLdyLocationRestriction(). */
export const GREATER_BELFAST_GEOFENCE = {
  minLat: 54.45,
  maxLat: 54.78,
  minLng: -6.35,
  maxLng: -5.55,
} as const;

export type GreaterBelfastClassifyReason =
  | "geofence"
  | "postcode_district"
  | "address_text"
  | "outside_geofence"
  | "outside_postcode"
  | "no_match"
  | "empty";

export type GreaterBelfastClassifyResult = {
  inside: boolean;
  reason: GreaterBelfastClassifyReason;
};

function postcodeDistrict(postcode: string): string | null {
  const normalised = postcode.replace(/\s+/g, "").toUpperCase();
  const match = normalised.match(/^(BT\d{1,2})/);
  return match?.[1] ?? null;
}

/** Full BT unit or outcode → district (BT37, BT1, …). */
export function greaterBelfastDistrictFromPostcode(postcode: string | null | undefined): string | null {
  if (!postcode?.trim()) {
    return null;
  }
  return postcodeDistrict(postcode.trim());
}

function extractBtDistrictFromText(text: string): string | null {
  const full = extractPostcode(text);
  if (full) {
    return postcodeDistrict(full);
  }
  const outcode = text.match(/\b(BT\d{1,2})\b/i);
  return outcode ? outcode[1].toUpperCase() : null;
}

export function isGreaterBelfastPostcodeDistrict(district: string | null | undefined): boolean {
  if (!district) {
    return false;
  }
  return GREATER_BELFAST_POSTCODE_DISTRICTS.has(district.toUpperCase());
}

/**
 * Primary geographic gate: verified coordinates inside the existing LDY/Greater
 * Belfast bias rectangle. Does not expand that box.
 */
export function isWithinGreaterBelfastGeofence(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return false;
  }
  // Reject clearly swapped lat/lng (e.g. lng stored in lat).
  if (lat < 50 || lat > 60 || lng > -4 || lng < -12) {
    return false;
  }
  return (
    lat >= GREATER_BELFAST_GEOFENCE.minLat &&
    lat <= GREATER_BELFAST_GEOFENCE.maxLat &&
    lng >= GREATER_BELFAST_GEOFENCE.minLng &&
    lng <= GREATER_BELFAST_GEOFENCE.maxLng
  );
}

/**
 * Text / postcode-only helper (no coordinates). Missing postcode does not
 * force false when place-name pattern matches.
 */
export function isGreaterBelfastServiceAddress(address: string): boolean {
  const text = address.trim();
  if (!text) {
    return false;
  }

  if (NORTH_WEST_NI_PATTERN.test(text)) {
    return false;
  }

  const district = extractBtDistrictFromText(text);
  if (district) {
    if (GREATER_BELFAST_POSTCODE_DISTRICTS.has(district)) {
      return true;
    }
    // Known BT district outside the served set.
    return false;
  }

  return GREATER_BELFAST_PATTERN.test(text);
}

/**
 * Classify Greater Belfast eligibility. Coordinates win when present and sane;
 * postcode / address text are supporting only.
 */
export function classifyGreaterBelfastServiceArea(input: {
  lat?: number | null;
  lng?: number | null;
  postalCode?: string | null;
  addressText?: string | null;
}): GreaterBelfastClassifyResult {
  const addressText = input.addressText?.trim() || "";
  const postalDistrict = greaterBelfastDistrictFromPostcode(input.postalCode);
  const hasCoords =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  if (hasCoords) {
    if (isWithinGreaterBelfastGeofence(input.lat, input.lng)) {
      return { inside: true, reason: "geofence" };
    }
    // Coords present but outside the rectangle — still honour an in-boundary
    // postcode district (e.g. Ballymena BT43 near/outside the box) so we do not
    // shrink the published district list.
    if (postalDistrict && GREATER_BELFAST_POSTCODE_DISTRICTS.has(postalDistrict)) {
      return { inside: true, reason: "postcode_district" };
    }
    if (addressText && isGreaterBelfastServiceAddress(addressText)) {
      return { inside: true, reason: "address_text" };
    }
    return { inside: false, reason: "outside_geofence" };
  }

  if (postalDistrict) {
    if (GREATER_BELFAST_POSTCODE_DISTRICTS.has(postalDistrict)) {
      return { inside: true, reason: "postcode_district" };
    }
    return { inside: false, reason: "outside_postcode" };
  }

  if (!addressText) {
    return { inside: false, reason: "empty" };
  }

  if (isGreaterBelfastServiceAddress(addressText)) {
    return { inside: true, reason: "address_text" };
  }

  return { inside: false, reason: "no_match" };
}

/** Greater Belfast pickup/drop-off for LDY transfers (both directions). */
export function isLdyServiceAreaAddress(address: string): boolean {
  return isGreaterBelfastServiceAddress(address);
}

/** @deprecated Use isLdyServiceAreaAddress — kept for existing imports. */
export function isLdyDropOffAddress(address: string): boolean {
  return isLdyServiceAreaAddress(address);
}

export function getLdyLocationRestriction() {
  return {
    rectangle: {
      low: {
        latitude: GREATER_BELFAST_GEOFENCE.minLat,
        longitude: GREATER_BELFAST_GEOFENCE.minLng,
      },
      high: {
        latitude: GREATER_BELFAST_GEOFENCE.maxLat,
        longitude: GREATER_BELFAST_GEOFENCE.maxLng,
      },
    },
  };
}

/**
 * Derry corridor fare (owner setting, OFF by default).
 *
 * Fixed Saloon fares for journeys between Derry~Londonderry and the Belfast
 * area, in either direction: one for Belfast International (BFS) ↔ Derry,
 * one for Belfast City Airport (BHD), Belfast and Greater Belfast ↔ Derry. It replaces the mileage-tier fare AND the
 * drive-to-pickup charge for those journeys only. Everything else is composed
 * the normal way on top: Estate supplement / Business Class / 7-seater from the
 * corridor Saloon fare, the return discount, night / Christmas surcharges, and
 * airport Express / Meet & Greet at checkout.
 *
 * Safety rules (owner, 16 Nov 2026: "lower the Derry pricing without reducing
 * Dublin pricing"):
 * - Never matches Dublin Airport or City of Derry Airport (LDY) journeys.
 * - Never raises a price: the engine uses the corridor fare only when it is
 *   lower than the normal fare (mileage tier + drive-to-pickup charge).
 * - Derry end is matched by server-resolved coordinates only (a 7.5 km circle
 *   around the city). Typed text never sets a corridor fare, so post-town
 *   "Londonderry" addresses in Claudy / Dungiven etc. are not caught.
 */

import { isWithinGreaterBelfastGeofence } from "./ldy-service-area";

export type CorridorPoint = { lat: number; lng: number };

export type DerryCorridorSettings = {
  enabled: boolean;
  /** One-way Saloon fare, Belfast International ↔ Derry (before Estate supplement and surcharges). */
  bfsSaloonFareGbp: number;
  /** One-way Saloon fare, Belfast City Airport / Belfast / Greater Belfast ↔ Derry. */
  belfastSaloonFareGbp: number;
};

/** Owner choice 16 Nov 2026: £159 BFS ↔ Derry, £169 the rest. Stored OFF until switched on. */
export const DEFAULT_DERRY_CORRIDOR_BFS_FARE_GBP = 159;
export const DEFAULT_DERRY_CORRIDOR_BELFAST_FARE_GBP = 169;
export const DEFAULT_DERRY_CORRIDOR: DerryCorridorSettings = {
  enabled: false,
  bfsSaloonFareGbp: DEFAULT_DERRY_CORRIDOR_BFS_FARE_GBP,
  belfastSaloonFareGbp: DEFAULT_DERRY_CORRIDOR_BELFAST_FARE_GBP,
};
export const DERRY_CORRIDOR_MIN_FARE_GBP = 30;
export const DERRY_CORRIDOR_MAX_FARE_GBP = 1000;

/** Derry city centre and the radius that covers the city (Culmore, Shantallow, Waterside, Drumahoe). */
export const DERRY_CITY_CENTRE: CorridorPoint = { lat: 54.9966, lng: -7.315 };
export const DERRY_CITY_RADIUS_KM = 7.5;

function finitePoint(point: CorridorPoint | null | undefined): CorridorPoint | null {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function haversineKm(a: CorridorPoint, b: CorridorPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInDerryCityZone(point: CorridorPoint | null | undefined): boolean {
  const p = finitePoint(point);
  return p != null && haversineKm(p, DERRY_CITY_CENTRE) <= DERRY_CITY_RADIUS_KM;
}

/**
 * Belfast end of an address-to-address corridor journey: inside the existing
 * Greater Belfast rectangle (Belfast, Lisburn, Bangor, Newtownabbey, Antrim,
 * Carrickfergus, Newtownards, Belfast International). Coordinates only —
 * "Co. Antrim" in a typed address never counts.
 */
export function isGreaterBelfastCorridorEnd(point: CorridorPoint | null | undefined): boolean {
  const p = finitePoint(point);
  if (!p) return false;
  if (isInDerryCityZone(p)) return false;
  return isWithinGreaterBelfastGeofence(p.lat, p.lng);
}

function readFare(value: unknown, fallback: number): number {
  const fare = Number(value);
  return Number.isFinite(fare) && fare >= DERRY_CORRIDOR_MIN_FARE_GBP && fare <= DERRY_CORRIDOR_MAX_FARE_GBP
    ? Math.round(fare)
    : fallback;
}

export function normalizeDerryCorridor(raw: unknown): DerryCorridorSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DERRY_CORRIDOR };
  const input = raw as Record<string, unknown>;
  return {
    enabled: input.enabled === true,
    bfsSaloonFareGbp: readFare(input.bfsSaloonFareGbp, DEFAULT_DERRY_CORRIDOR_BFS_FARE_GBP),
    belfastSaloonFareGbp: readFare(input.belfastSaloonFareGbp, DEFAULT_DERRY_CORRIDOR_BELFAST_FARE_GBP),
  };
}

/** Validation for the Owner Dashboard save. Returns error messages (empty = ok). */
export function validateDerryCorridorInput(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw !== "object") return ["Derry corridor settings must be an object."];
  const input = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (input.enabled != null && typeof input.enabled !== "boolean") {
    errors.push("Derry corridor fare must be on or off.");
  }
  for (const [key, label] of [
    ["bfsSaloonFareGbp", "Belfast International ↔ Derry"],
    ["belfastSaloonFareGbp", "Belfast City Airport / Greater Belfast ↔ Derry"],
  ] as const) {
    const raw = input[key];
    const fare = typeof raw === "number" ? raw : Number(raw);
    if (
      !Number.isFinite(fare) ||
      fare < DERRY_CORRIDOR_MIN_FARE_GBP ||
      fare > DERRY_CORRIDOR_MAX_FARE_GBP ||
      !Number.isInteger(fare)
    ) {
      errors.push(
        `${label} fare must be a whole number of pounds between £${DERRY_CORRIDOR_MIN_FARE_GBP} and £${DERRY_CORRIDOR_MAX_FARE_GBP}.`,
      );
    }
  }
  return errors;
}

/**
 * The corridor Saloon fare for this journey, or null when it does not apply.
 * Callers must still only use it when it is LOWER than the normal fare.
 */
export function resolveDerryCorridorSaloonFareGbp(input: {
  settings: { derryCorridor?: DerryCorridorSettings | null } | null | undefined;
  /** Airport at one end of an address ↔ airport transfer (null for address-to-address). */
  airportCode?: string | null;
  fromAirport?: boolean;
  pickup?: CorridorPoint | null;
  dropoff?: CorridorPoint | null;
}): number | null {
  const corridor = normalizeDerryCorridor(input.settings?.derryCorridor);
  if (!corridor.enabled) return null;
  const airport = String(input.airportCode ?? "").trim().toUpperCase();

  if (airport) {
    // Only the two Belfast airports are the Belfast end of the corridor.
    if (airport !== "BFS" && airport !== "BHD") return null;
    const addressEnd = input.fromAirport ? input.dropoff : input.pickup;
    if (!isInDerryCityZone(addressEnd)) return null;
    return airport === "BFS" ? corridor.bfsSaloonFareGbp : corridor.belfastSaloonFareGbp;
  }

  const pickupDerry = isInDerryCityZone(input.pickup);
  const dropoffDerry = isInDerryCityZone(input.dropoff);
  if (pickupDerry === dropoffDerry) return null;
  const belfastEnd = isGreaterBelfastCorridorEnd(pickupDerry ? input.dropoff : input.pickup);
  return belfastEnd ? corridor.belfastSaloonFareGbp : null;
}

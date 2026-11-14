import { DEFAULT_BFS_CITY_CENTRE_MINIMUM_SALOON_FARE_GBP, DEFAULT_BFS_MINIMUM_SALOON_FARE_GBP, DEFAULT_BHD_MINIMUM_SALOON_FARE_GBP, DEFAULT_ESTATE_UPLIFT_GBP } from "./owner-pricing-config";
import { classifyUniversalVehicle } from "./universal-distance-pricing";
import { postcodeDistrict } from "./postcode-pricing";
import { roundGbp } from "./gbp";

type MinimumPricing = { bfsMinimumSaloonFareGbp?: number; bhdMinimumSaloonFareGbp?: number; bfsCityCentreMinimumSaloonFareGbp?: number; estate?: { upliftGbp: number } };

/** Belfast city centre for the city centre ↔ Belfast International minimum: postcode districts BT1 and BT2. */
export const BELFAST_CITY_CENTRE_DISTRICTS: readonly string[] = ["BT1", "BT2"];

/** Needs a full postcode in the address (same parser as Postcode Pricing); anything else is not city centre. */
export function isBelfastCityCentreAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const district = postcodeDistrict(address);
  return district != null && BELFAST_CITY_CENTRE_DISTRICTS.includes(district);
}

/**
 * Belfast city centre (BT1/BT2) ↔ Belfast International minimum Saloon fare per
 * leg (Estate adds its uplift). 0 = off (default). Unlike the airport-wide
 * floors above, this is applied to the leg's whole vehicle fare, i.e. after any
 * drive-to-pickup charge, so a set minimum of £57 quotes exactly £57 until the
 * normal fare is higher. Vehicle fare only: never include access or discounts.
 */
export function applyBfsCityCentreMinimumFare(
  legVehicleFareGbp: number,
  vehicle: string,
  airportCodes: readonly (string | null | undefined)[],
  address: string | null | undefined,
  pricing?: MinimumPricing | null,
): number {
  if (!airportCodes.includes("BFS")) return legVehicleFareGbp;
  const floor = pricing?.bfsCityCentreMinimumSaloonFareGbp ?? DEFAULT_BFS_CITY_CENTRE_MINIMUM_SALOON_FARE_GBP;
  if (!(floor > 0) || !isBelfastCityCentreAddress(address)) return legVehicleFareGbp;
  const kind = classifyUniversalVehicle(vehicle);
  const estate = kind === "estate";
  if (!estate && kind !== "saloon") return legVehicleFareGbp;
  const supplement = estate ? (pricing?.estate?.upliftGbp ?? DEFAULT_ESTATE_UPLIFT_GBP) : 0;
  return roundGbp(Math.max(legVehicleFareGbp, floor + supplement));
}

/**
 * Airport minimum Saloon fare per leg (Estate adds its uplift). Belfast
 * International (BFS) and Belfast City (BHD) each have their own floor; BHD's
 * defaults to 0 (off). When both airports are on the leg, the higher applies.
 * Canonical airport codes only. Vehicle fare only: never include access or discounts.
 */
export function applyBfsMinimumFare(
  vehicleFareGbp: number,
  vehicle: string,
  airportCodes: readonly (string | null | undefined)[],
  pricing?: MinimumPricing | null,
): number {
  const hasBfs = airportCodes.includes("BFS");
  const bhdFloor = airportCodes.includes("BHD")
    ? Math.max(0, pricing?.bhdMinimumSaloonFareGbp ?? DEFAULT_BHD_MINIMUM_SALOON_FARE_GBP)
    : 0;
  if (!hasBfs && !(bhdFloor > 0)) return vehicleFareGbp;
  const kind = classifyUniversalVehicle(vehicle);
  const estate = kind === "estate";
  if (!estate && kind !== "saloon") return vehicleFareGbp;
  const bfsFloor = hasBfs ? (pricing?.bfsMinimumSaloonFareGbp ?? DEFAULT_BFS_MINIMUM_SALOON_FARE_GBP) : 0;
  const saloonMinimum = Math.max(bfsFloor, bhdFloor);
  const supplement = estate ? (pricing?.estate?.upliftGbp ?? DEFAULT_ESTATE_UPLIFT_GBP) : 0;
  return roundGbp(Math.max(vehicleFareGbp, saloonMinimum + supplement));
}

/** Preserve a fractional floor only for legs whose normal vehicle fare meets it. */
export function bfsMinimumHasPence(
  vehicle: string,
  airportCodes: readonly (string | null | undefined)[],
  pricing: MinimumPricing | null | undefined,
  normalVehicleFares: readonly number[],
): boolean {
  const floor = applyBfsMinimumFare(0, vehicle, airportCodes, pricing);
  return Math.abs(floor - Math.round(floor)) > 0.001 &&
    normalVehicleFares.some(fare => Number.isFinite(fare) && fare <= floor);
}

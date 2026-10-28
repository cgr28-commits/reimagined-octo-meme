import { DEFAULT_BFS_MINIMUM_SALOON_FARE_GBP, DEFAULT_BHD_MINIMUM_SALOON_FARE_GBP, DEFAULT_ESTATE_UPLIFT_GBP } from "./owner-pricing-config";
import { classifyUniversalVehicle } from "./universal-distance-pricing";
import { roundGbp } from "./gbp";

type MinimumPricing = { bfsMinimumSaloonFareGbp?: number; bhdMinimumSaloonFareGbp?: number; estate?: { upliftGbp: number } };

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

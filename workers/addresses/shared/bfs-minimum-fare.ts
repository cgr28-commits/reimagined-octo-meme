import { DEFAULT_BFS_MINIMUM_SALOON_FARE_GBP, DEFAULT_ESTATE_UPLIFT_GBP } from "./owner-pricing-config";
import { classifyUniversalVehicle } from "./universal-distance-pricing";
import { roundGbp } from "./gbp";

type MinimumPricing = { bfsMinimumSaloonFareGbp?: number; estate?: { upliftGbp: number } };

/** Canonical airport codes only. Vehicle fare only: never include access or discounts. */
export function applyBfsMinimumFare(
  vehicleFareGbp: number,
  vehicle: string,
  airportCodes: readonly (string | null | undefined)[],
  pricing?: MinimumPricing | null,
): number {
  if (!airportCodes.includes("BFS")) return vehicleFareGbp;
  const kind = classifyUniversalVehicle(vehicle);
  const estate = kind === "estate";
  if (!estate && kind !== "saloon") return vehicleFareGbp;
  const saloonMinimum = pricing?.bfsMinimumSaloonFareGbp ?? DEFAULT_BFS_MINIMUM_SALOON_FARE_GBP;
  const supplement = estate ? (pricing?.estate?.upliftGbp ?? DEFAULT_ESTATE_UPLIFT_GBP) : 0;
  return roundGbp(Math.max(vehicleFareGbp, saloonMinimum + supplement));
}

/** Preserve owner-entered pence through the existing website/payment compositor. */
export function bfsMinimumHasPence(
  vehicle: string,
  airportCodes: readonly (string | null | undefined)[],
  pricing?: MinimumPricing | null,
): boolean {
  const floor = applyBfsMinimumFare(0, vehicle, airportCodes, pricing);
  return Math.abs(floor - Math.round(floor)) > 0.001;
}

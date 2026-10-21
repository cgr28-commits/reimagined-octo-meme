/** Mileage tariff: max(£30, £10 + £2.20 × passenger road miles). Airport costs are added separately. */

import { DEFAULT_EXECUTIVE_MULTIPLIER } from "./executive-vehicle";
import { roundGbp } from "./gbp";

/** Code default when the owner has not saved an Estate uplift. Owner settings override this. */
export const UNIVERSAL_ESTATE_PREMIUM_GBP = 7;
/** Invalidate unbooked receipts from the previous tariff at deployment. */
export const MILEAGE_RECEIPT_VERSION_OFFSET = 1_000_000_000;
export const UNIVERSAL_SALOON_MINIMUM_GBP = 30;
export const UNIVERSAL_SALOON_FLOOR_MILES = 0;

/** Reference values for legacy settings consumers; the formula is authoritative. */
export const UNIVERSAL_SALOON_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 30], [10, 32], [20, 54], [50, 120], [100, 230],
];

/** Statute miles from driving km (same factor as public journey distance labels). */
export function universalDrivingMilesFromKm(distanceKm: number): number {
  return distanceKm * 0.621371;
}

export type UniversalSaloonCurveOptions = {
  minimumGbp?: number;
  floorMiles?: number;
  knots?: ReadonlyArray<readonly [number, number]>;
};

export function rawUniversalSaloonJourneyFareGbp(
  roadMiles: number,
  curve?: UniversalSaloonCurveOptions,
): number {
  // Legacy curves are retained in stored settings for rollback, never used for new quotes.
  void curve;
  const m = Math.max(0, Number(roadMiles) || 0);
  return Math.max(UNIVERSAL_SALOON_MINIMUM_GBP, 10 + 2.2 * m);
}

/** Single consistent journey rounding: nearest £1. */
export function roundUniversalSaloonFareGbp(rawFareGbp: number): number {
  return Math.round(Number(rawFareGbp) || 0);
}

/** 7 Seater Minibus journey rounding: nearest penny only. Never nearest £5. */
export function roundUniversalMinibusFareGbp(rawFareGbp: number): number {
  return roundGbp(rawFareGbp);
}

/** Executive journey rounding: nearest penny only. Never nearest £5. */
export function roundUniversalExecutiveFareGbp(rawFareGbp: number): number {
  return roundGbp(rawFareGbp);
}

export function calculateUniversalSaloonJourneyFareGbp(
  roadMiles: number,
  curve?: UniversalSaloonCurveOptions,
): number {
  return rawUniversalSaloonJourneyFareGbp(roadMiles, curve);
}

/**
 * Add the configured Estate uplift before premiums and final payable rounding.
 */
export function calculateUniversalEstateJourneyFareGbp(
  roundedSaloonFareGbp: number,
  estatePremiumGbp: number = UNIVERSAL_ESTATE_PREMIUM_GBP,
): number {
  return roundedSaloonFareGbp + Number(estatePremiumGbp || 0);
}

export type UniversalVehicleKind = "saloon" | "estate" | "executive" | "minibus";

export function classifyUniversalVehicle(
  vehicleType: string,
): UniversalVehicleKind {
  const v = String(vehicleType);
  if (v.includes("Estate")) return "estate";
  if (v.includes("Executive")) return "executive";
  if (v.includes("Minibus")) return "minibus";
  return "saloon";
}

/**
 * Journey fare (taxi only) from road miles + vehicle.
 * Preserve precision through vehicle adjustments; round the final customer total.
 */
export function calculateUniversalJourneyFareGbp(
  roadMiles: number,
  vehicleType: string,
  options?: {
    /** Retired. The Executive fare no longer uses a fixed minimum. */
    executiveMinimumGbp?: number;
    minibusMultiplier?: number;
    executiveMultiplier?: number;
    estatePremiumGbp?: number;
    saloonFareGbp?: number;
    saloonMinimumGbp?: number;
    saloonFloorMiles?: number;
    saloonKnots?: ReadonlyArray<readonly [number, number]>;
  },
): { saloonGbp: number; journeyFareGbp: number; vehicleAdjustmentGbp: number } {
  const estatePremiumGbp = options?.estatePremiumGbp ?? UNIVERSAL_ESTATE_PREMIUM_GBP;
  const saloonGbp =
    options?.saloonFareGbp != null
      ? options.saloonFareGbp
      : calculateUniversalSaloonJourneyFareGbp(roadMiles, {
          minimumGbp: options?.saloonMinimumGbp,
          floorMiles: options?.saloonFloorMiles,
          knots: options?.saloonKnots,
        });
  const kind = classifyUniversalVehicle(vehicleType);
  const estateGbp = calculateUniversalEstateJourneyFareGbp(saloonGbp, estatePremiumGbp);
  const minibusMult = options?.minibusMultiplier ?? 1.55;
  const execMult = options?.executiveMultiplier ?? DEFAULT_EXECUTIVE_MULTIPLIER;
  void options?.executiveMinimumGbp;

  switch (kind) {
    case "saloon":
      return { saloonGbp, journeyFareGbp: saloonGbp, vehicleAdjustmentGbp: 0 };
    case "estate":
      return {
        saloonGbp,
        journeyFareGbp: estateGbp,
        vehicleAdjustmentGbp: estatePremiumGbp,
      };
    case "executive": {
      const raw = saloonGbp * execMult;
      return {
        saloonGbp,
        journeyFareGbp: raw,
        vehicleAdjustmentGbp: raw - saloonGbp,
      };
    }
    case "minibus": {
      const raw = estateGbp * minibusMult;
      return {
        saloonGbp,
        journeyFareGbp: raw,
        vehicleAdjustmentGbp: raw - saloonGbp,
      };
    }
    default:
      return { saloonGbp, journeyFareGbp: saloonGbp, vehicleAdjustmentGbp: 0 };
  }
}

/** Build the approved 0–100 mile reference table (for tests / docs). */
export function buildUniversalFareTable(
  milesList: number[],
): Array<{ miles: number; saloon: number; estate: number }> {
  return milesList.map((miles) => {
    const saloon = calculateUniversalSaloonJourneyFareGbp(miles);
    return {
      miles,
      saloon,
      estate: calculateUniversalEstateJourneyFareGbp(saloon),
    };
  });
}

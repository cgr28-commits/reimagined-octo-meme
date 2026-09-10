/**
 * Universal distance-based journey fares for My Airport Taxi NI.
 *
 * One formula for all airport-transfer (and address↔address) journeys —
 * not town/postcode/zone special cases.
 *
 * Approved calibration (Saloon):
 *   0–4 mi → £29 (flat floor)
 *   ~15 mi → £49
 *   ~32 mi → £79
 *   ~98 mi → £229
 *
 * Estate = final rounded Saloon + £6 (never rounded separately).
 * Airport Express / access charges are NOT included here — add after.
 */

export const UNIVERSAL_ESTATE_PREMIUM_GBP = 6;
export const UNIVERSAL_SALOON_MINIMUM_GBP = 29;
export const UNIVERSAL_SALOON_15_MILE_GBP = 49;
export const UNIVERSAL_SALOON_32_MILE_GBP = 79;
export const UNIVERSAL_SALOON_98_MILE_GBP = 229;

/** Statute miles from driving km (same factor as public journey distance labels). */
export function universalDrivingMilesFromKm(distanceKm: number): number {
  return distanceKm * 0.621371;
}

/**
 * Piecewise-linear raw Saloon journey fare before rounding.
 * Knots: (4,29), (15,49), (32,79), (98,229).
 * 0–4 miles stay on the £29 floor; later segments interpolate between knots.
 */
export function rawUniversalSaloonJourneyFareGbp(roadMiles: number): number {
  const m = Math.max(0, Number(roadMiles) || 0);
  if (m <= 4) return UNIVERSAL_SALOON_MINIMUM_GBP;
  if (m <= 15) {
    return (
      UNIVERSAL_SALOON_MINIMUM_GBP +
      ((UNIVERSAL_SALOON_15_MILE_GBP - UNIVERSAL_SALOON_MINIMUM_GBP) / 11) * (m - 4)
    );
  }
  if (m <= 32) {
    return (
      UNIVERSAL_SALOON_15_MILE_GBP +
      ((UNIVERSAL_SALOON_32_MILE_GBP - UNIVERSAL_SALOON_15_MILE_GBP) / 17) * (m - 15)
    );
  }
  if (m <= 98) {
    return (
      UNIVERSAL_SALOON_32_MILE_GBP +
      ((UNIVERSAL_SALOON_98_MILE_GBP - UNIVERSAL_SALOON_32_MILE_GBP) / 66) * (m - 32)
    );
  }
  return (
    UNIVERSAL_SALOON_98_MILE_GBP +
    ((UNIVERSAL_SALOON_98_MILE_GBP - UNIVERSAL_SALOON_32_MILE_GBP) / 66) * (m - 98)
  );
}

/** Single consistent journey rounding: nearest £1. */
export function roundUniversalSaloonFareGbp(rawFareGbp: number): number {
  return Math.round(Number(rawFareGbp) || 0);
}

export function calculateUniversalSaloonJourneyFareGbp(roadMiles: number): number {
  return roundUniversalSaloonFareGbp(rawUniversalSaloonJourneyFareGbp(roadMiles));
}

/**
 * Estate journey fare from an already-rounded Saloon fare.
 * Always exactly +£6 — do not re-round.
 */
export function calculateUniversalEstateJourneyFareGbp(
  roundedSaloonFareGbp: number,
): number {
  return roundUniversalSaloonFareGbp(roundedSaloonFareGbp) + UNIVERSAL_ESTATE_PREMIUM_GBP;
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
 * Minibus / Executive build from Estate (= Saloon + £6) with legacy multipliers.
 */
export function calculateUniversalJourneyFareGbp(
  roadMiles: number,
  vehicleType: string,
  options?: {
    executiveMinimumGbp?: number;
    minibusMultiplier?: number;
    executiveMultiplier?: number;
  },
): { saloonGbp: number; journeyFareGbp: number; vehicleAdjustmentGbp: number } {
  const saloonGbp = calculateUniversalSaloonJourneyFareGbp(roadMiles);
  const kind = classifyUniversalVehicle(vehicleType);
  const estateGbp = calculateUniversalEstateJourneyFareGbp(saloonGbp);
  const minibusMult = options?.minibusMultiplier ?? 1.55;
  const execMult = options?.executiveMultiplier ?? 1.2;
  const execMin = options?.executiveMinimumGbp ?? 105;

  switch (kind) {
    case "saloon":
      return { saloonGbp, journeyFareGbp: saloonGbp, vehicleAdjustmentGbp: 0 };
    case "estate":
      return {
        saloonGbp,
        journeyFareGbp: estateGbp,
        vehicleAdjustmentGbp: UNIVERSAL_ESTATE_PREMIUM_GBP,
      };
    case "executive": {
      const raw = Math.max(execMin, Math.round((estateGbp * execMult) / 5) * 5);
      return {
        saloonGbp,
        journeyFareGbp: raw,
        vehicleAdjustmentGbp: raw - saloonGbp,
      };
    }
    case "minibus": {
      const raw = Math.round((estateGbp * minibusMult) / 5) * 5;
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

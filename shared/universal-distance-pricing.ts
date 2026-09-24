/**
 * Universal distance-based journey fares for My Airport Taxi NI.
 *
 * One formula for all airport-transfer (and address↔address) journeys —
 * not town/postcode/zone special cases.
 *
 * Approved Saloon anchors (linear interpolation between neighbouring knots):
 *   0–4 mi → £29 (flat floor)
 *   6 → £32, 8 → £35, 10 → £38, 12 → £41, 15 → £46
 *   20 → £53, 25 → £60, 30 → £67, 35 → £74, 40 → £81
 *   50 → £96, 60 → £115, 70 → £135, 80 → £157, 90 → £181, 100 → £210
 *
 * Estate = final rounded Saloon + £6 (never rounded separately).
 * Minibus = Estate × multiplier, rounded to the nearest penny only
 * (no nearest-£5 rounding).
 * Airport Express / access charges are NOT included here — add after.
 */

import { roundGbp } from "./gbp";

export const UNIVERSAL_ESTATE_PREMIUM_GBP = 6;
export const UNIVERSAL_SALOON_MINIMUM_GBP = 29;
export const UNIVERSAL_SALOON_FLOOR_MILES = 4;

/** Miles / Saloon £ knots. First knot is the end of the £29 floor. */
export const UNIVERSAL_SALOON_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [4, 29],
  [6, 32],
  [8, 35],
  [10, 38],
  [12, 41],
  [15, 46],
  [20, 53],
  [25, 60],
  [30, 67],
  [35, 74],
  [40, 81],
  [50, 96],
  [60, 115],
  [70, 135],
  [80, 157],
  [90, 181],
  [100, 210],
];

/** Statute miles from driving km (same factor as public journey distance labels). */
export function universalDrivingMilesFromKm(distanceKm: number): number {
  return distanceKm * 0.621371;
}

function interpolateSegment(
  miles: number,
  startMiles: number,
  startFareGbp: number,
  endMiles: number,
  endFareGbp: number,
): number {
  const span = endMiles - startMiles;
  if (!(span > 0)) return endFareGbp;
  return startFareGbp + ((endFareGbp - startFareGbp) / span) * (miles - startMiles);
}

/**
 * Piecewise-linear raw Saloon journey fare before rounding.
 * 0–4 miles stay on the £29 floor; later miles interpolate between adjacent knots.
 * Distances beyond 100 miles continue the 90–100 mile slope (no step jump).
 */
export type UniversalSaloonCurveOptions = {
  minimumGbp?: number;
  floorMiles?: number;
  knots?: ReadonlyArray<readonly [number, number]>;
};

export function rawUniversalSaloonJourneyFareGbp(
  roadMiles: number,
  curve?: UniversalSaloonCurveOptions,
): number {
  const m = Math.max(0, Number(roadMiles) || 0);
  const floorMiles = curve?.floorMiles ?? UNIVERSAL_SALOON_FLOOR_MILES;
  const minimumGbp = curve?.minimumGbp ?? UNIVERSAL_SALOON_MINIMUM_GBP;
  if (m <= floorMiles) return minimumGbp;

  const knots = curve?.knots ?? UNIVERSAL_SALOON_KNOTS;
  for (let i = 1; i < knots.length; i++) {
    const [startMiles, startFareGbp] = knots[i - 1]!;
    const [endMiles, endFareGbp] = knots[i]!;
    if (m <= endMiles) {
      return interpolateSegment(m, startMiles, startFareGbp, endMiles, endFareGbp);
    }
  }

  const [prevMiles, prevFareGbp] = knots[knots.length - 2]!;
  const [lastMiles, lastFareGbp] = knots[knots.length - 1]!;
  return interpolateSegment(m, prevMiles, prevFareGbp, lastMiles, lastFareGbp);
}

/** Single consistent journey rounding: nearest £1. */
export function roundUniversalSaloonFareGbp(rawFareGbp: number): number {
  return Math.round(Number(rawFareGbp) || 0);
}

/** 7 Seater Minibus journey rounding: nearest penny only. Never nearest £5. */
export function roundUniversalMinibusFareGbp(rawFareGbp: number): number {
  return roundGbp(rawFareGbp);
}

export function calculateUniversalSaloonJourneyFareGbp(
  roadMiles: number,
  curve?: UniversalSaloonCurveOptions,
): number {
  return roundUniversalSaloonFareGbp(rawUniversalSaloonJourneyFareGbp(roadMiles, curve));
}

/**
 * Estate journey fare from an already-rounded Saloon fare.
 * Always exactly + uplift (default £6) — do not re-round.
 */
export function calculateUniversalEstateJourneyFareGbp(
  roundedSaloonFareGbp: number,
  estatePremiumGbp: number = UNIVERSAL_ESTATE_PREMIUM_GBP,
): number {
  return roundUniversalSaloonFareGbp(roundedSaloonFareGbp) + Number(estatePremiumGbp || 0);
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
 * Minibus / Executive build from Estate (= Saloon + £6).
 * Minibus uses Estate × multiplier with penny rounding only.
 */
export function calculateUniversalJourneyFareGbp(
  roadMiles: number,
  vehicleType: string,
  options?: {
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
      ? roundUniversalSaloonFareGbp(options.saloonFareGbp)
      : calculateUniversalSaloonJourneyFareGbp(roadMiles, {
          minimumGbp: options?.saloonMinimumGbp,
          floorMiles: options?.saloonFloorMiles,
          knots: options?.saloonKnots,
        });
  const kind = classifyUniversalVehicle(vehicleType);
  const estateGbp = calculateUniversalEstateJourneyFareGbp(saloonGbp, estatePremiumGbp);
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
        vehicleAdjustmentGbp: estatePremiumGbp,
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
      const raw = roundUniversalMinibusFareGbp(estateGbp * minibusMult);
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

import { ALL_AIRPORTS as AIRPORTS, AREAS, VEHICLE_TYPES } from "./data";
import { isLdyServiceAreaAddress } from "../../shared/ldy-service-area";
import {
  composeFareWithAirportFixedCosts,
  getAirportLegFixedCostGbp,
  getAirportToAirportFixedCostGbp,
} from "../../shared/airport-fixed-costs";
import {
  calculateUniversalJourneyFareGbp,
  universalDrivingMilesFromKm,
  UNIVERSAL_ESTATE_PREMIUM_GBP,
  UNIVERSAL_SALOON_MINIMUM_GBP,
} from "../../shared/universal-distance-pricing";
import { formatGbpAmount, roundGbp } from "../../shared/gbp";
import {
  applyTripPremium,
  AIRPORT_TRIP_PREMIUM_RATE,
  getReturnJourneyFare,
  isTripPremiumDateTime,
  type TripSchedule,
} from "./point-to-point-premium";
import type { TripRouteMetrics } from "./trip-route";
import {
  calculateOperationalSubtotal,
  getAirportBasePrice,
  getAirportMinimumFare,
  hasOperationalRatesConfigured,
  PRICING_CONFIG,
  type AirportCode,
} from "./pricing-config";

type Area = (typeof AREAS)[number];

/**
 * All public rates and airport minimums live in `pricing-config.json`.
 * Draft reference tables remain available for calibration scripts only.
 */
const AREA_AIRPORT_SURCHARGES = PRICING_CONFIG.areaAirportSurchargesGbp as Record<
  Area,
  Record<AirportCode, number>
>;
const DEFAULT_AREA_SURCHARGE = PRICING_CONFIG.defaultAreaSurchargeGbp;
const VEHICLE_MULTIPLIERS = PRICING_CONFIG.vehicleMultipliers as Record<
  (typeof VEHICLE_TYPES)[number],
  number
>;
const POINT_TO_POINT_VEHICLE_ADJUSTMENTS = PRICING_CONFIG.pointToPointVehicleAdjustmentsGbp as Record<
  (typeof VEHICLE_TYPES)[number],
  number
>;
const AIRPORT_ESTATE_PREMIUM = PRICING_CONFIG.airportEstatePremiumGbp;
const AIRPORT_EXECUTIVE_MINIMUM_FARE = PRICING_CONFIG.airportExecutiveMinimumFareGbp;
const AIRPORT_MINIMUM_FARE = PRICING_CONFIG.airportMinimumFaresGbp;
const POINT_TO_POINT_BASE = PRICING_CONFIG.pointToPointBaseGbp;
const POINT_TO_POINT_AREA_RATES = PRICING_CONFIG.pointToPointAreaRatesGbp as Partial<
  Record<Area, number>
> & { default: number };
const OTS_ESTATE_BASE = PRICING_CONFIG.otsReferenceModel.estateBaseGbp;
const OTS_KM_RATE = PRICING_CONFIG.otsReferenceModel.perKmGbp;
const OTS_MIN_RATE = PRICING_CONFIG.otsReferenceModel.perMinuteGbp;
const OTS_VEHICLE_BASE = PRICING_CONFIG.otsReferenceModel.vehicleBaseGbp as Record<
  (typeof VEHICLE_TYPES)[number],
  number
>;

/** @deprecated Use getAreaSurcharge instead. */
export const AREA_SURCHARGES: Record<Area, number> = Object.fromEntries(
  Object.entries(AREA_AIRPORT_SURCHARGES).map(([area, surcharges]) => [area, surcharges.BFS]),
) as Record<Area, number>;

/** Target band: short A2A undercut vs OTS reference (legacy helpers / A2A fallback). */
export const OTS_UNDERCUT_MIN = PRICING_CONFIG.otsReferenceModel.undercutMinGbp;
export const OTS_UNDERCUT_MAX = PRICING_CONFIG.otsReferenceModel.undercutMaxGbp;

/** Airport-zone OTS calibration band (scripts only — not used in live customer quotes). */
export const AIRPORT_OTS_UNDERCUT_MIN =
  PRICING_CONFIG.airportOtsCalibration?.undercutMinGbp ?? 3;
export const AIRPORT_OTS_UNDERCUT_MAX =
  PRICING_CONFIG.airportOtsCalibration?.undercutMaxGbp ?? 5;
const OTS_UNDERCUT_MID = (OTS_UNDERCUT_MIN + OTS_UNDERCUT_MAX) / 2;
const A2A_DISTANCE_BANDS = PRICING_CONFIG.addressToAddressDistanceBands;

export type QuoteResult = {
  amount: number;
  area: string | null;
  areaSurcharge: number;
  airportBase: number;
  vehicleMultiplier: number;
  vehicleAdjustment: number;
  pickupArea?: string | null;
  dropoffArea?: string | null;
  premiumApplied?: boolean;
  /** Present when the operational mileage model produced the fare. */
  operational?: {
    distanceKm: number;
    durationMinutes: number;
    band: "weekday" | "weekendAndBankHoliday";
  };
  /** Undiscounted airport fixed costs included in `amount` (fees / parking / tolls). */
  airportFixedCostsGbp?: number;
  /** Journey subtotal before airport fixed costs (after return discount when booked). */
  journeyFareGbp?: number;
  /** True when public display must wait for owner-approved pricing rules. */
  confirmationRequired?: boolean;
};

function calculateOtsPointToPointOneWay(
  distanceKm: number,
  durationMinutes: number,
  vehicleType: (typeof VEHICLE_TYPES)[number],
): number {
  const vehicleBase = OTS_VEHICLE_BASE[vehicleType] ?? OTS_ESTATE_BASE;
  const tierMultiplier = vehicleBase / OTS_ESTATE_BASE;
  const variable =
    tierMultiplier * (OTS_KM_RATE * distanceKm + OTS_MIN_RATE * durationMinutes);
  const raw = vehicleBase + variable;
  return raw % 5 === 4 ? Math.round(raw) : roundToNearestFive(raw);
}

function undercutOtsEstateFare(otsEstateFare: number, floor = POINT_TO_POINT_BASE): number {
  const target = otsEstateFare - OTS_UNDERCUT_MID;
  return roundFare(Math.max(floor, target));
}

/** Commercial A2A adjustment by loaded distance (short undercut → long empty-return uplift). */
export function getA2aDistanceAdjustmentGbp(distanceKm: number): number {
  if (!A2A_DISTANCE_BANDS?.enabled || !A2A_DISTANCE_BANDS.bands?.length) {
    return -OTS_UNDERCUT_MID;
  }
  const sorted = [...A2A_DISTANCE_BANDS.bands].sort((a, b) => a.upToKm - b.upToKm);
  for (const band of sorted) {
    if (distanceKm <= band.upToKm) {
      return band.adjustmentGbp;
    }
  }
  return sorted[sorted.length - 1]?.adjustmentGbp ?? -OTS_UNDERCUT_MID;
}

function applyA2aCommercialFare(
  otsReferenceFare: number,
  distanceKm: number,
  floor = A2A_DISTANCE_BANDS?.floorGbp ?? POINT_TO_POINT_BASE,
): number {
  const adjustment = getA2aDistanceAdjustmentGbp(distanceKm);
  return roundFare(Math.max(floor, otsReferenceFare + adjustment));
}

function isValidRouteMetrics(routeMetrics?: TripRouteMetrics | null): routeMetrics is TripRouteMetrics {
  if (!routeMetrics) {
    return false;
  }
  return (
    Number.isFinite(routeMetrics.distanceKm) &&
    routeMetrics.distanceKm > 0.5 &&
    Number.isFinite(routeMetrics.durationMinutes) &&
    routeMetrics.durationMinutes > 0
  );
}

/**
 * Address-to-address distance bands from Belfast — fallback when OSRM route is unavailable.
 * Values live in pricing-config.json (`pointToPointAreaRatesGbp`).
 */
function getPointToPointAreaRate(area: Area | null): number {
  if (!area) {
    return POINT_TO_POINT_AREA_RATES.default;
  }
  return POINT_TO_POINT_AREA_RATES[area] ?? POINT_TO_POINT_AREA_RATES.default;
}

function applyPointToPointVehiclePricing(
  subtotal: number,
  vehicleType: (typeof VEHICLE_TYPES)[number],
): number {
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = POINT_TO_POINT_VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  return subtotal * vehicleMultiplier + vehicleAdjustment;
}

function applyAirportVehiclePricing(
  saloonOneWay: number,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  airportCode: string,
): number {
  // Live path: Estate = Saloon + £6. Minibus/Executive build from Estate.
  const priced = calculateUniversalJourneyFareGbp(
    // saloonOneWay is already the rounded Saloon journey; recover miles is unnecessary —
    // pass through via vehicle helpers using the saloon amount directly.
    0,
    vehicleType,
    {
      executiveMinimumGbp: AIRPORT_EXECUTIVE_MINIMUM_FARE,
      minibusMultiplier: VEHICLE_MULTIPLIERS["Minibus (5–7 passengers)"] ?? 1.55,
      executiveMultiplier: VEHICLE_MULTIPLIERS["Executive Saloon (1–4 passengers)"] ?? 1.2,
    },
  );
  void airportCode;
  void saloonOneWay;
  // Recompute from the provided rounded saloon so callers stay in control of Saloon.
  const saloon = Math.round(saloonOneWay);
  if (vehicleType === "Standard Saloon (1–4 passengers)") return saloon;
  if (vehicleType === "Estate Car (1–4 passengers)") {
    return saloon + UNIVERSAL_ESTATE_PREMIUM_GBP;
  }
  const estate = saloon + UNIVERSAL_ESTATE_PREMIUM_GBP;
  if (vehicleType === "Executive Saloon (1–4 passengers)") {
    return Math.max(
      AIRPORT_EXECUTIVE_MINIMUM_FARE,
      roundToNearestFive(estate * (VEHICLE_MULTIPLIERS[vehicleType] ?? 1.2)),
    );
  }
  if (vehicleType === "Minibus (5–7 passengers)") {
    return roundToNearestFive(estate * (VEHICLE_MULTIPLIERS[vehicleType] ?? 1.55));
  }
  void priced;
  return saloon;
}

/**
 * Estate premium for airport transfers — live quotes use a flat £6.
 * Tier table remains in config for calibration scripts only.
 */
export function getAirportEstatePremiumGbp(airportCode: string, saloonFare: number): number {
  void airportCode;
  void saloonFare;
  if (PRICING_CONFIG.universalDistancePricing?.enabled !== false) {
    return UNIVERSAL_ESTATE_PREMIUM_GBP;
  }
  const tiers = PRICING_CONFIG.airportEstatePremiumTiers;
  const excluded = new Set(tiers?.excludeAirports ?? []);

  if (!tiers?.enabled || excluded.has(airportCode as AirportCode)) {
    return AIRPORT_ESTATE_PREMIUM;
  }

  if (saloonFare <= tiers.shortMaxSaloonFareGbp) {
    return tiers.shortPremiumGbp;
  }
  if (saloonFare >= tiers.longMinSaloonFareGbp) {
    return tiers.longPremiumGbp;
  }
  return tiers.midPremiumGbp;
}

function getAirportVehiclePricingMeta(
  vehicleType: (typeof VEHICLE_TYPES)[number],
  saloonFareForMeta = 0,
  airportCode = "BFS",
): { vehicleMultiplier: number; vehicleAdjustment: number } {
  if (vehicleType === "Standard Saloon (1–4 passengers)") {
    return { vehicleMultiplier: 1, vehicleAdjustment: 0 };
  }
  if (vehicleType === "Estate Car (1–4 passengers)") {
    return {
      vehicleMultiplier: 1,
      vehicleAdjustment: getAirportEstatePremiumGbp(airportCode, saloonFareForMeta),
    };
  }

  return {
    vehicleMultiplier: VEHICLE_MULTIPLIERS[vehicleType] ?? 1,
    vehicleAdjustment: getAirportEstatePremiumGbp(airportCode, saloonFareForMeta),
  };
}

function computeSaloonAirportOneWay(airportCode: string, basePlusSurcharge: number): number {
  // Apply the airport minimum first, then distance/area surcharges can raise the fare above it.
  const fare = applyAirportMinimumFare(airportCode, basePlusSurcharge);
  return fare % 5 === 4 ? fare : roundToNearestFive(fare);
}

/** Minimum one-way saloon airport transfer fare by airport code (the "from" price). */
function applyAirportMinimumFare(airportCode: string, oneWayAmount: number): number {
  const minimum = getAirportMinimumFare(airportCode) ?? AIRPORT_MINIMUM_FARE[airportCode];
  if (minimum == null) {
    return oneWayAmount;
  }
  return Math.max(oneWayAmount, minimum);
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function roundFare(value: number): number {
  const rounded = Math.round(value);
  return rounded % 5 === 4 ? rounded : roundToNearestFive(rounded);
}

/** OSRM km → statute miles (same factor used for public journey distance display). */
export function drivingMilesFromKm(distanceKm: number): number {
  return distanceKm * 0.621371;
}

/** Round mileage to 1 decimal for the >20.0 threshold gate only. */
export function thresholdMilesOneDecimal(rawMiles: number): number {
  return Math.round(rawMiles * 10) / 10;
}

/**
 * BHD/BFS long-distance saloon floor (scoped rounding).
 * - Threshold uses miles rounded to 1dp; ≤20.0 → no change.
 * - Floor uses raw miles: base + £2 × (rawMiles − 20).
 * - If floor ≤ existing zone/production saloon → keep existing exactly.
 * - If floor wins → nearest £5 only (does not use/alter global roundFare).
 * Dublin / other airports: no-op.
 */
export function applyBelfastAirportDistanceFloor(
  existingSaloonOneWay: number,
  airportCode: string,
  distanceKm: number,
): number {
  const cfg = PRICING_CONFIG.belfastAirportDistanceFloor;
  if (!cfg?.enabled) {
    return existingSaloonOneWay;
  }

  const code = airportCode.trim().toUpperCase();
  const baseFloor = cfg.baseFloorGbp?.[code as "BHD" | "BFS"];
  if (baseFloor == null || !Number.isFinite(baseFloor)) {
    return existingSaloonOneWay;
  }

  if (!Number.isFinite(distanceKm) || distanceKm <= 0.5) {
    return existingSaloonOneWay;
  }

  const rawMiles = drivingMilesFromKm(distanceKm);
  const thresholdMiles = thresholdMilesOneDecimal(rawMiles);
  const gate = cfg.thresholdMiles ?? 20;
  if (thresholdMiles <= gate) {
    return existingSaloonOneWay;
  }

  const perMile = cfg.perExtraMileGbp ?? 2;
  const distanceFloor = baseFloor + perMile * (rawMiles - gate);
  if (!(distanceFloor > existingSaloonOneWay)) {
    // Zone / existing production fare wins — preserve exactly.
    return existingSaloonOneWay;
  }

  // Floor wins — scoped nearest-£5 only (not roundFare / £x4-keep).
  return roundToNearestFive(distanceFloor);
}

/** Estate one-way fare for calibration scripts (OTS daily auto-fix). */
export function computeAirportEstateForSurcharge(
  airportCode: string,
  areaSurcharge: number,
): number {
  const configuredBase = getAirportBasePrice(airportCode);
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (configuredBase == null && !airport) {
    return 0;
  }

  const airportBase = configuredBase ?? airport!.basePrice;
  const saloonOneWay = computeSaloonAirportOneWay(airportCode, airportBase + areaSurcharge);
  return applyAirportVehiclePricing(saloonOneWay, "Estate Car (1–4 passengers)", airportCode);
}

/** Surcharge that places our estate fare ~£3–£5 below live OTS (for auto-calibration only). */
export function findAirportSurchargeForOtsEstate(
  airportCode: string,
  otsEstate: number,
  minDiscount = AIRPORT_OTS_UNDERCUT_MIN,
  maxDiscount = AIRPORT_OTS_UNDERCUT_MAX,
): number | null {
  const configuredBase = getAirportBasePrice(airportCode);
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport && configuredBase == null) {
    return null;
  }

  const targetDiscount = (minDiscount + maxDiscount) / 2;
  const targetEstate = roundFare(Math.round(otsEstate - targetDiscount));

  for (let surcharge = 0; surcharge <= 200; surcharge++) {
    if (computeAirportEstateForSurcharge(airportCode, surcharge) === targetEstate) {
      return surcharge;
    }
  }

  const pickClosest = (
    predicate: (discount: number) => boolean,
  ): number | null => {
    let best: { surcharge: number; score: number } | null = null;
    for (let surcharge = 0; surcharge <= 200; surcharge++) {
      const estate = computeAirportEstateForSurcharge(airportCode, surcharge);
      if (estate <= 0) {
        continue;
      }
      const discount = otsEstate - estate;
      if (!predicate(discount)) {
        continue;
      }
      const score = Math.abs(discount - targetDiscount);
      if (!best || score < best.score || (score === best.score && surcharge < best.surcharge)) {
        best = { surcharge, score };
      }
    }
    return best?.surcharge ?? null;
  };

  const inBand = pickClosest((d) => d >= minDiscount && d <= maxDiscount);
  if (inBand != null) {
    return inBand;
  }

  const nearBand = pickClosest(
    (d) => d >= minDiscount - 2 && d <= maxDiscount + 2,
  );
  if (nearBand != null) {
    return nearBand;
  }

  // Short hops / OTS near our estate floor: closest available undercut (may be £0).
  return pickClosest(() => true);
}

function getAreaSurcharge(airportCode: string, area: Area | null): number {
  const code = airportCode as AirportCode;
  const table = AREA_AIRPORT_SURCHARGES;
  const defaults = DEFAULT_AREA_SURCHARGE;

  if (!area) {
    return defaults[code] ?? defaults.BFS;
  }

  return table[area]?.[code] ?? defaults[code] ?? defaults.BFS;
}

export function matchAreaFromAddress(address: string): Area | null {
  const normalised = address.toLowerCase();
  const sortedAreas = [...AREAS].sort((a, b) => b.length - a.length);

  for (const area of sortedAreas) {
    if (area === "Belfast City Centre") {
      continue;
    }

    const aliases = [area.toLowerCase()];
    if (area === "Lisburn") {
      // "Lisburn Road" in Belfast (e.g. BT7/BT9) is not the town of Lisburn.
      if (
        /\blisburn\s+(road|rd|avenue|ave|street|st)\b/.test(normalised) &&
        (/\bbelfast\b/.test(normalised) || /\bbt[79]\b/.test(normalised))
      ) {
        continue;
      }
      aliases.push("bt27", "bt28");
    }
    if (area === "Bangor") {
      aliases.push("bt19", "bt20");
    }
    if (area === "Newtownabbey") {
      aliases.push("bt36", "bt37");
    }
    if (area === "Holywood") {
      aliases.push("bt18");
    }
    if (area === "Carrickfergus") {
      aliases.push("bt38");
    }
    if (area === "Ballymena") {
      aliases.push("bt42", "bt43");
    }
    if (area === "Larne") {
      aliases.push("bt40");
    }
    if (area === "Newry") {
      aliases.push("bt34", "bt35");
    }
    if (area === "Armagh") {
      aliases.push("bt60", "bt61");
    }
    if (area === "Cookstown") {
      aliases.push("bt80");
    }
    if (area === "Coleraine") {
      aliases.push("portrush", "portstewart", "castlerock", "bt56", "bt57", "bt58", "bt51", "bt52");
    }
    if (area === "Derry / Londonderry") {
      aliases.push(
        "derry",
        "londonderry",
        "bt47",
        "bt48",
        "city of derry airport",
        "derry airport",
        "ldy",
        "eglinton",
      );
    }
    if (area === "Enniskillen") {
      aliases.push("fermanagh", "county fermanagh", "bt74", "bt92", "bt93", "bt94");
    }
    if (area === "Omagh") {
      aliases.push("bt78", "bt79");
    }
    if (area === "Antrim") {
      aliases.push("aldergrove", "belfast international", "bfs", "bt29", "bt41");
    }
    if (area === "Downpatrick") {
      aliases.push("bt30", "bt31");
    }
    if (area === "Newcastle") {
      aliases.push("newcastle, county down", "newcastle co down", "newcastle, co down", "bt33");
    }
    if (area === "Banbridge") {
      aliases.push("bt32");
    }
    if (area === "Portadown") {
      aliases.push("bt62", "bt63");
    }
    if (area === "Lurgan") {
      aliases.push("bt66", "bt67");
    }
    if (area === "Newtownards") {
      aliases.push("bt22", "bt23");
    }
    if (area === "Comber") {
      aliases.push("bt23");
    }
    if (area === "Dundonald") {
      aliases.push("bt16");
    }
    if (area === "Hillsborough") {
      aliases.push("bt26");
    }
    if (area === "Ballyclare") {
      aliases.push("bt39");
    }

    if (aliases.some((alias) => normalised.includes(alias))) {
      return area;
    }
  }

  if (/\bbelfast\b/.test(normalised)) {
    return "Belfast City Centre";
  }

  if (/\bnewcastle\b/.test(normalised)) {
    return "Newcastle";
  }

  return null;
}

export function calculatePointToPointQuote(
  pickupAddress: string,
  dropoffAddress: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
  schedule: TripSchedule = {},
  routeMetrics?: TripRouteMetrics | null,
  airportCode?: string | null,
  _endpoints?: {
    pickup?: { address?: string | null; placeName?: string | null; lat?: number | null; lng?: number | null; postalCode?: string | null };
    dropoff?: { address?: string | null; placeName?: string | null; lat?: number | null; lng?: number | null; postalCode?: string | null };
  },
): QuoteResult | null {
  const pickup = pickupAddress.trim();
  const dropoff = dropoffAddress.trim();
  if (!pickup || !dropoff) {
    return null;
  }

  const pickupArea = matchAreaFromAddress(pickup);
  const dropoffArea = matchAreaFromAddress(dropoff);

  // Universal distance pricing — same curve as airport transfers.
  if (!isValidRouteMetrics(routeMetrics)) {
    return null;
  }

  void airportCode;
  const roadMiles = universalDrivingMilesFromKm(routeMetrics.distanceKm);
  const universal = calculateUniversalJourneyFareGbp(roadMiles, vehicleType, {
    executiveMinimumGbp: AIRPORT_EXECUTIVE_MINIMUM_FARE,
    minibusMultiplier: VEHICLE_MULTIPLIERS["Minibus (5–7 passengers)"] ?? 1.55,
    executiveMultiplier: VEHICLE_MULTIPLIERS["Executive Saloon (1–4 passengers)"] ?? 1.2,
  });
  const oneWay = universal.journeyFareGbp;
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = universal.vehicleAdjustmentGbp;

  const premium = applyTripPremium(oneWay, {
    ...schedule,
    returnJourney,
  });

  const journeyFareGbp = roundGbp(premium.total);

  return {
    amount: journeyFareGbp,
    area: dropoffArea ?? pickupArea,
    areaSurcharge: Math.round(roadMiles * 10) / 10,
    airportBase: UNIVERSAL_SALOON_MINIMUM_GBP,
    vehicleMultiplier,
    vehicleAdjustment,
    pickupArea,
    dropoffArea,
    premiumApplied: premium.premiumApplied,
    journeyFareGbp,
    operational: {
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      band: "weekday",
    },
  };
}

export function getPointToPointFromPrice(
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
): number {
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = POINT_TO_POINT_VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  const oneWay = roundToNearestFive(POINT_TO_POINT_BASE * vehicleMultiplier + vehicleAdjustment);
  return returnJourney ? roundToNearestFive(getReturnJourneyFare(oneWay)) : oneWay;
}

export function calculateQuote(
  address: string,
  airportCode: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
  schedule: TripSchedule = {},
  routeMetrics?: TripRouteMetrics | null,
  /** Airport → address when true; address → airport when false. */
  fromAirport = false,
): QuoteResult | null {
  const trimmedAddress = address.trim();
  if (!trimmedAddress || !airportCode) {
    return null;
  }

  if (airportCode === "LDY" && !isLdyServiceAreaAddress(trimmedAddress)) {
    return null;
  }

  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return null;
  }

  // Universal distance pricing requires genuine road metrics (OSRM).
  if (!isValidRouteMetrics(routeMetrics)) {
    return null;
  }

  const roadMiles = universalDrivingMilesFromKm(routeMetrics.distanceKm);
  const universal = calculateUniversalJourneyFareGbp(roadMiles, vehicleType, {
    executiveMinimumGbp: AIRPORT_EXECUTIVE_MINIMUM_FARE,
    minibusMultiplier: VEHICLE_MULTIPLIERS["Minibus (5–7 passengers)"] ?? 1.55,
    executiveMultiplier: VEHICLE_MULTIPLIERS["Executive Saloon (1–4 passengers)"] ?? 1.2,
  });
  const oneWayFare = universal.journeyFareGbp;
  const matchedArea = matchAreaFromAddress(trimmedAddress);
  const { vehicleMultiplier, vehicleAdjustment } = getAirportVehiclePricingMeta(
    vehicleType,
    universal.saloonGbp,
    airportCode,
  );

  // Direction-aware fixed costs only (DUB/LDY). BFS/BHD address↔airport = £0.
  // No legacy embed/strip — journey fare is pure distance.
  const outboundFixed = getAirportLegFixedCostGbp(airportCode, fromAirport);
  const returnFixed = returnJourney
    ? getAirportLegFixedCostGbp(airportCode, !fromAirport)
    : 0;

  const premium = applyTripPremium(
    oneWayFare,
    { ...schedule, returnJourney },
    AIRPORT_TRIP_PREMIUM_RATE,
  );
  const composed = composeFareWithAirportFixedCosts({
    journeyOneWayGbp: oneWayFare,
    returnJourney,
    outboundFixedGbp: outboundFixed,
    returnFixedGbp: returnFixed,
    getReturnJourneyFare,
  });
  // Journey: Saloon nearest £1 (Estate +£6). Return discount may introduce pence.
  // Fixed airport costs keep 50p etc. Final amount = journey + fixed, both to pence.
  const roundedJourneyFare = roundGbp(premium.total);
  const roundedFixed = roundGbp(composed.fixedTotalGbp);
  const amount = roundGbp(roundedJourneyFare + roundedFixed);

  return {
    amount,
    area: matchedArea,
    areaSurcharge: Math.round(roadMiles * 10) / 10,
    airportBase: UNIVERSAL_SALOON_MINIMUM_GBP,
    vehicleMultiplier,
    vehicleAdjustment,
    premiumApplied: premium.premiumApplied,
    airportFixedCostsGbp: roundedFixed,
    journeyFareGbp: roundedJourneyFare,
    operational: {
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      band: "weekday",
    },
  };
}

export function getAirportFromPrice(
  airportCode: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
): number | null {
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return null;
  }

  // Marketing “from” price = universal minimum at 0–4 miles.
  const oneWay = applyAirportVehiclePricing(
    UNIVERSAL_SALOON_MINIMUM_GBP,
    vehicleType,
    airportCode,
  );
  return returnJourney ? Math.round(getReturnJourneyFare(oneWay)) : oneWay;
}

export function formatQuote(amount: number): string {
  return formatGbpAmount(amount);
}

export { roundGbp, formatGbpAmount };

/**
 * Airport ↔ airport transfers must never treat one airport’s address as a town
 * zone under the other airport’s area-surcharge table (e.g. BFS/Aldergrove/BT29
 * must not become “Antrim → BHD”).
 *
 * - When Dublin Airport is one end: always use existing DUB airport pricing for
 *   the other airport address (anti-undercut; zone/floor rules unchanged).
 * - Otherwise: underlying address-to-address journey fare + genuine fixed costs
 *   for each identified airport end (pickup-end pickup costs + dropoff-end drop-off).
 */
export function calculateAirportToAirportQuote(
  pickupAirportCode: string,
  dropoffAirportCode: string,
  pickupAddress: string,
  dropoffAddress: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
  schedule: TripSchedule = {},
  routeMetrics?: TripRouteMetrics | null,
): QuoteResult | null {
  const pickupCode = pickupAirportCode.trim().toUpperCase();
  const dropoffCode = dropoffAirportCode.trim().toUpperCase();
  const pickup = pickupAddress.trim();
  const dropoff = dropoffAddress.trim();
  if (!pickupCode || !dropoffCode || pickupCode === dropoffCode || !pickup || !dropoff) {
    return null;
  }

  // Dublin anti-undercut: never price DUB legs via A2A or the other NI airport scheme.
  if (pickupCode === "DUB" || dropoffCode === "DUB") {
    const otherAddress = pickupCode === "DUB" ? dropoff : pickup;
    const fromAirport = pickupCode === "DUB";
    return calculateQuote(
      otherAddress,
      "DUB",
      vehicleType,
      returnJourney,
      schedule,
      routeMetrics,
      fromAirport,
    );
  }

  if (!isValidRouteMetrics(routeMetrics)) {
    return null;
  }

  // Always price the underlying A2A journey one-way, then apply return discount
  // to the journey only — airport fixed costs are added undiscounted per leg.
  const underlyingOneWay = calculatePointToPointQuote(
    pickup,
    dropoff,
    vehicleType,
    false,
    { ...schedule, returnJourney: false },
    routeMetrics,
  );
  if (!underlyingOneWay) {
    return null;
  }

  const outboundFixed = getAirportToAirportFixedCostGbp(pickupCode, dropoffCode);
  const returnFixed = returnJourney
    ? getAirportToAirportFixedCostGbp(dropoffCode, pickupCode)
    : 0;
  const premium = applyTripPremium(
    underlyingOneWay.amount,
    { ...schedule, returnJourney },
    AIRPORT_TRIP_PREMIUM_RATE,
  );
  const composed = composeFareWithAirportFixedCosts({
    journeyOneWayGbp: underlyingOneWay.amount,
    returnJourney,
    outboundFixedGbp: outboundFixed,
    returnFixedGbp: returnFixed,
    getReturnJourneyFare,
  });
  // Journey already nearest-£1 from universal pricing (return may add pence).
  // Keep fixed costs (incl. 50p) — amount === journey + fixed at pence precision.
  const roundedJourneyFare = roundGbp(premium.total);
  const roundedFixed = roundGbp(composed.fixedTotalGbp);
  const amount = roundGbp(roundedJourneyFare + roundedFixed);

  return {
    ...underlyingOneWay,
    amount,
    // Combined genuine fixed costs (not a town-zone surcharge).
    areaSurcharge: roundedFixed,
    airportBase: underlyingOneWay.amount,
    airportFixedCostsGbp: roundedFixed,
    journeyFareGbp: roundedJourneyFare,
    premiumApplied: premium.premiumApplied,
  };
}

/**
 * Belfast-area / NI origin → Dublin city (not Dublin Airport).
 * Starts from the DUB airport fare for the NI address, then adds a continuation
 * uplift for loaded distance/time beyond the Dublin Airport corridor reference.
 */
export function calculateDublinCityBeyondAirportQuote(
  niAddress: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  routeMetrics: TripRouteMetrics,
  returnJourney = false,
  schedule: TripSchedule = {},
): QuoteResult | null {
  // Full NI → Dublin city road miles on the universal curve (no zone DUB stack).
  if (!isValidRouteMetrics(routeMetrics)) {
    return null;
  }
  void niAddress;
  return calculatePointToPointQuote(
    niAddress || "Northern Ireland",
    "Dublin city",
    vehicleType,
    returnJourney,
    schedule,
    routeMetrics,
  );
}

export {
  arePricingRulesApproved,
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "./pricing-config";


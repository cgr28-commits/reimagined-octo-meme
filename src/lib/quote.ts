import { ALL_AIRPORTS as AIRPORTS, AREAS, VEHICLE_TYPES } from "./data";
import { isLdyServiceAreaAddress } from "../../shared/ldy-service-area";
import {
  composeFareWithAirportFixedCosts,
  getAirportLegFixedCostGbp,
  getAirportToAirportFixedCostGbp,
  getLegacyEmbeddedAccessFeeGbp,
} from "../../shared/airport-fixed-costs";
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
  const airportMinimum = AIRPORT_MINIMUM_FARE[airportCode] ?? 0;
  const saloonFare = Math.max(saloonOneWay, airportMinimum);
  const estatePremium = getAirportEstatePremiumGbp(airportCode, saloonFare);
  const estateTier = saloonFare + estatePremium;

  switch (vehicleType) {
    case "Standard Saloon (1–4 passengers)":
      return saloonFare;
    case "Estate Car (1–4 passengers)":
      return estateTier;
    case "Executive Saloon (1–4 passengers)":
      return Math.max(
        AIRPORT_EXECUTIVE_MINIMUM_FARE,
        roundToNearestFive(estateTier * VEHICLE_MULTIPLIERS[vehicleType]),
      );
    case "Minibus (5–7 passengers)":
      return roundToNearestFive(estateTier * VEHICLE_MULTIPLIERS[vehicleType]);
    default:
      return saloonFare;
  }
}

/**
 * Estate premium for airport transfers from the rounded saloon fare.
 * Dublin keeps the flat airportEstatePremiumGbp; other airports use tiers.
 */
export function getAirportEstatePremiumGbp(airportCode: string, saloonFare: number): number {
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
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = POINT_TO_POINT_VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;

  // Do not invent A2A fares without a real driving route (prevents silent low fallbacks).
  if (!isValidRouteMetrics(routeMetrics)) {
    return null;
  }


  let oneWay: number;
  let areaSurcharge: number;
  let airportBase = OTS_ESTATE_BASE;
  let operationalMeta: QuoteResult["operational"] | undefined;
  let premiumAppliedFromOps = false;

  const premiumSchedule =
    Boolean(schedule.outboundDate && schedule.outboundTime
      ? isTripPremiumDateTime(schedule.outboundDate, schedule.outboundTime)
      : false) ||
    Boolean(
      schedule.returnJourney &&
        schedule.returnDate &&
        schedule.returnTime &&
        isTripPremiumDateTime(schedule.returnDate, schedule.returnTime),
    );

  if (hasOperationalRatesConfigured()) {
    const ops = calculateOperationalSubtotal({
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      premiumSchedule,
      airportCode,
    });
    if (!ops) {
      return null;
    }
    oneWay = ops.subtotalGbp;
    areaSurcharge = Math.round(ops.operationalDistanceKm);
    airportBase = ops.baseFeeGbp;
    premiumAppliedFromOps = ops.premiumApplied;
    operationalMeta = {
      distanceKm: ops.operationalDistanceKm,
      durationMinutes: ops.operationalDurationMinutes,
      band: ops.band,
    };
  } else {
    // OTS-style reference + distance-band commercial adjustment (not a flat undercut).
    const saloonFloor = A2A_DISTANCE_BANDS?.floorGbp ?? OTS_VEHICLE_BASE["Standard Saloon (1–4 passengers)"] ?? 35;
    oneWay = applyA2aCommercialFare(
      calculateOtsPointToPointOneWay(
        routeMetrics.distanceKm,
        routeMetrics.durationMinutes,
        vehicleType,
      ),
      routeMetrics.distanceKm,
      saloonFloor,
    );
    areaSurcharge = Math.round(routeMetrics.distanceKm);
  }

  // When operational weekend band already priced the trip, skip double-counting premium.
  const premium = operationalMeta
    ? {
        total: schedule.returnJourney ? getReturnJourneyFare(oneWay) : oneWay,
        premiumApplied: premiumAppliedFromOps,
      }
    : applyTripPremium(oneWay, {
        ...schedule,
        returnJourney,
      });

  return {
    amount: roundFare(premium.total),
    area: dropoffArea ?? pickupArea,
    areaSurcharge,
    airportBase,
    vehicleMultiplier,
    vehicleAdjustment,
    pickupArea,
    dropoffArea,
    premiumApplied: premium.premiumApplied,
    operational: operationalMeta,
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

  const matchedArea = matchAreaFromAddress(trimmedAddress);
  const areaSurcharge = getAreaSurcharge(airportCode, matchedArea);
  const configuredBase = getAirportBasePrice(airportCode);
  const airportBase = configuredBase ?? airport.basePrice;
  const airportMinimum = getAirportMinimumFare(airportCode) ?? AIRPORT_MINIMUM_FARE[airportCode] ?? 0;
  const zoneSaloonOneWay = computeSaloonAirportOneWay(
    airportCode,
    airportBase + areaSurcharge,
  );

  let saloonOneWay = zoneSaloonOneWay;
  let usedDistanceProtection = false;

  if (isValidRouteMetrics(routeMetrics)) {
    const distanceSaloon = applyA2aCommercialFare(
      calculateOtsPointToPointOneWay(
        routeMetrics.distanceKm,
        routeMetrics.durationMinutes,
        "Standard Saloon (1–4 passengers)",
      ),
      routeMetrics.distanceKm,
      Math.max(airportMinimum, A2A_DISTANCE_BANDS?.floorGbp ?? POINT_TO_POINT_BASE),
    );
    const protectFromKm = PRICING_CONFIG.airportRouteDistanceProtectFromKm ?? 100;

    if (!matchedArea) {
      // Arbitrary address not in the zone table — generalise from the driving route.
      saloonOneWay = Math.max(airportMinimum, distanceSaloon);
      usedDistanceProtection = true;
    } else if (routeMetrics.distanceKm >= protectFromKm) {
      // Long airport legs: protect empty-return economics globally (not only named towns).
      saloonOneWay = Math.max(zoneSaloonOneWay, distanceSaloon);
      usedDistanceProtection = saloonOneWay > zoneSaloonOneWay;
    }

    // BHD/BFS: long-distance floor so named zones do not flatten >20 mile journeys.
    // Zone-winning fares stay exact; floor-winning fares use nearest £5 only.
    saloonOneWay = applyBelfastAirportDistanceFloor(
      saloonOneWay,
      airportCode,
      routeMetrics.distanceKm,
    );
  }

  const { vehicleMultiplier, vehicleAdjustment } = getAirportVehiclePricingMeta(
    vehicleType,
    saloonOneWay,
    airportCode,
  );
  let oneWayFare = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);

  // When operational rates are filled, fold configured tolls + airport charges into the fare.
  // Live config keeps these null — airport fixed costs are applied separately below.
  if (hasOperationalRatesConfigured()) {
    const ops = calculateOperationalSubtotal({
      distanceKm: 0,
      durationMinutes: 0,
      premiumSchedule: Boolean(
        schedule.outboundDate &&
          schedule.outboundTime &&
          isTripPremiumDateTime(schedule.outboundDate, schedule.outboundTime),
      ),
      airportCode,
    });
    if (ops) {
      oneWayFare += ops.tollsGbp + ops.airportChargesGbp;
    }
  }

  // Strip the legacy flat access fee that was commercially embedded in BFS/BHD
  // zone fares, then re-add direction-aware fixed costs after the return discount.
  const embeddedAccessFee = getLegacyEmbeddedAccessFeeGbp(airportCode);
  const journeyOneWay = Math.max(0, oneWayFare - embeddedAccessFee);
  const outboundFixed = getAirportLegFixedCostGbp(airportCode, fromAirport);
  const returnFixed = returnJourney
    ? getAirportLegFixedCostGbp(airportCode, !fromAirport)
    : 0;

  const premium = applyTripPremium(
    journeyOneWay,
    { ...schedule, returnJourney },
    AIRPORT_TRIP_PREMIUM_RATE,
  );
  const composed = composeFareWithAirportFixedCosts({
    journeyOneWayGbp: journeyOneWay,
    returnJourney,
    outboundFixedGbp: outboundFixed,
    returnFixedGbp: returnFixed,
    getReturnJourneyFare,
  });
  // premium.total = journey fare after return discount (+ weekend uplift when rate > 0).
  // Fixed airport costs are added after and never discounted.
  // Round journey and total with the same roundFare so website / email / booking
  // never disagree (e.g. £96 vs £95) when fixed costs are £0.
  const roundedJourneyFare = roundFare(premium.total);
  const totalBeforeRounding = premium.total + composed.fixedTotalGbp;

  return {
    amount: roundFare(totalBeforeRounding),
    area: matchedArea,
    areaSurcharge: usedDistanceProtection
      ? Math.round(routeMetrics?.distanceKm ?? areaSurcharge)
      : areaSurcharge,
    airportBase,
    vehicleMultiplier,
    vehicleAdjustment,
    premiumApplied: premium.premiumApplied,
    airportFixedCostsGbp: composed.fixedTotalGbp,
    journeyFareGbp: roundedJourneyFare,
    operational: isValidRouteMetrics(routeMetrics)
      ? {
          distanceKm: routeMetrics.distanceKm,
          durationMinutes: routeMetrics.durationMinutes,
          band: "weekday",
        }
      : undefined,
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

  const configuredBase = getAirportBasePrice(airportCode);
  const airportBase = configuredBase ?? airport.basePrice;
  const saloonOneWay = computeSaloonAirportOneWay(airportCode, airportBase);
  const oneWay = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);
  return returnJourney ? roundToNearestFive(getReturnJourneyFare(oneWay)) : oneWay;
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

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
  const roundedJourneyFare = roundFare(premium.total);
  const totalBeforeRounding = premium.total + composed.fixedTotalGbp;

  return {
    ...underlyingOneWay,
    amount: roundFare(totalBeforeRounding),
    // Combined genuine fixed costs (not a town-zone surcharge).
    areaSurcharge: composed.fixedTotalGbp,
    airportBase: underlyingOneWay.amount,
    airportFixedCostsGbp: composed.fixedTotalGbp,
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
  const cfg = PRICING_CONFIG.dublinCityBeyondAirport;
  if (!cfg?.enabled || !isValidRouteMetrics(routeMetrics)) {
    return null;
  }

  const airportLeg = calculateQuote(niAddress, "DUB", vehicleType, false, {});
  if (!airportLeg) {
    return null;
  }

  const extraKm = Math.max(
    0,
    routeMetrics.distanceKm - cfg.referenceLoadedKmFromBelfastCentre,
  );
  const extraMin = Math.max(
    0,
    routeMetrics.durationMinutes - cfg.referenceLoadedMinutesFromBelfastCentre,
  );
  const rawUplift = extraKm * cfg.perKmGbp + extraMin * cfg.perMinuteGbp;
  const uplift = Math.max(cfg.minimumUpliftGbp, rawUplift);
  const oneWay = airportLeg.amount + uplift;

  const premium = applyTripPremium(oneWay, { ...schedule, returnJourney });

  return {
    amount: roundFare(premium.total),
    area: airportLeg.area,
    areaSurcharge: Math.round(routeMetrics.distanceKm),
    airportBase: airportLeg.airportBase,
    vehicleMultiplier: airportLeg.vehicleMultiplier,
    vehicleAdjustment: airportLeg.vehicleAdjustment,
    premiumApplied: premium.premiumApplied,
    operational: {
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      band: "weekday",
    },
  };
}

export {
  arePricingRulesApproved,
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "./pricing-config";


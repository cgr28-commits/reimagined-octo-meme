import pricingConfigJson from "./pricing-config.json";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../../shared/return-journey-discount";

export type AirportCode = "BFS" | "BHD" | "DUB" | "LDY";

export type DayRateBand = {
  baseFeeGbp: number | null;
  perKmGbp: number | null;
  perMinuteGbp: number | null;
  premiumRate?: number;
};

export type PricingConfig = {
  pricingModel?: {
    summary?: string;
    addressToAddress?: string;
    airport?: string;
    dublinAirport?: string;
    vehicles?: string;
    returnDiscount?: string;
    rounding?: string;
  };
  pricingRulesApproved: boolean;
  publicUnapprovedPriceLabel: string;
  currency: string;
  operational: {
    description: string;
    emptyReturnMileageFactor: number;
    emptyReturnTimeFactor: number;
    weekday: DayRateBand;
    weekendAndBankHoliday: DayRateBand;
    defaultTollsGbp: number | null;
    airportChargesGbp: Record<AirportCode, number | null>;
  };
  airportMinimumFaresGbp: Record<string, number>;
  /**
   * DEPRECATED flat per-airport access fee. Prefer airportFixedCostsGbp /
   * shared/airport-fixed-costs.ts for live quotes.
   */
  airportAccessFeesGbp?: Partial<Record<AirportCode, number>> & { note?: string };
  /**
   * Direction-aware airport fixed costs (fees / parking / tolls) applied per leg
   * after the journey fare and after the 5% return discount on that fare only.
   */
  airportFixedCostsGbp?: Partial<
    Record<
      AirportCode,
      {
        dropOffFeeGbp: number;
        pickupFeeGbp: number;
        parkingAllowanceGbp: number;
        tollAllowanceGbp: number;
      }
    >
  > & { note?: string };
  airportBasePricesGbp: Record<AirportCode, number>;
  airportEstatePremiumGbp: number;
  /** Tiered estate uplift for NI airports; excluded airports always use airportEstatePremiumGbp. */
  airportEstatePremiumTiers?: {
    enabled: boolean;
    note?: string;
    shortMaxSaloonFareGbp: number;
    shortPremiumGbp: number;
    midPremiumGbp: number;
    longMinSaloonFareGbp: number;
    longPremiumGbp: number;
    excludeAirports: AirportCode[];
  };
  /** Calibration-only undercut vs OTS estate for airport zone surcharges (not live quotes). */
  airportOtsCalibration?: {
    note?: string;
    undercutMinGbp: number;
    undercutMaxGbp: number;
  };
  /** At/above this loaded distance, airport quotes take max(zone, distance-band fare). */
  airportRouteDistanceProtectFromKm?: number;
  /**
   * BHD/BFS long-distance saloon floor: when threshold miles (1dp) > thresholdMiles,
   * saloon = max(existing, base + perExtraMile × (rawMiles − threshold)).
   * Floor wins → nearest £5; zone wins → existing fare unchanged.
   */
  belfastAirportDistanceFloor?: {
    enabled: boolean;
    note?: string;
    thresholdMiles: number;
    perExtraMileGbp: number;
    baseFloorGbp: Partial<Record<"BHD" | "BFS", number>>;
  };
  /** Live universal road-distance journey fares (replaces zone + Belfast floor). */
  universalDistancePricing?: {
    enabled: boolean;
    note?: string;
    estatePremiumGbp: number;
    saloonMinimumGbp: number;
    roundToNearestGbp: number;
  };
  airportExecutiveMinimumFareGbp: number;
  areaAirportSurchargesGbp: Record<string, Record<AirportCode, number>>;
  defaultAreaSurchargeGbp: Record<AirportCode, number>;
  vehicleMultipliers: Record<string, number>;
  pointToPointVehicleAdjustmentsGbp: Record<string, number>;
  pointToPointBaseGbp: number;
  pointToPointAreaRatesGbp: Record<string, number>;
  otsReferenceModel: {
    note: string;
    estateBaseGbp: number;
    perKmGbp: number;
    perMinuteGbp: number;
    vehicleBaseGbp: Record<string, number>;
    undercutMinGbp: number;
    undercutMaxGbp: number;
  };
  addressToAddressDistanceBands?: {
    enabled: boolean;
    note?: string;
    floorGbp: number;
    bands: Array<{ upToKm: number; adjustmentGbp: number }>;
  };
  dublinCityBeyondAirport?: {
    enabled: boolean;
    note?: string;
    airportLat: number;
    airportLng: number;
    geofenceRadiusKm: number;
    referenceLoadedKmFromBelfastCentre: number;
    referenceLoadedMinutesFromBelfastCentre: number;
    perKmGbp: number;
    perMinuteGbp: number;
    minimumUpliftGbp: number;
  };
  returnJourneyDiscountRate: number;
  airportTripPremiumRate: number;
  addressToAddressTripPremiumRate: number;
};

export const PRICING_CONFIG = {
  ...(pricingConfigJson as Omit<PricingConfig, "returnJourneyDiscountRate">),
  /** From shared/return-journey-discount-rate.json — single source for website + Personal Quote. */
  returnJourneyDiscountRate: RETURN_JOURNEY_DISCOUNT_RATE,
} as PricingConfig;

/** Owner switch — set false in pricing-config.json to temporarily hide live £ amounts. */
export function arePricingRulesApproved(): boolean {
  return PRICING_CONFIG.pricingRulesApproved === true;
}

/**
 * Public live quotes + SumUp pay-now.
 * Uses the OTS-calibrated tables in pricing-config.json. Operational £/km bands are optional.
 */
export function arePublicLivePricesEnabled(): boolean {
  return arePricingRulesApproved();
}

export function getPublicUnapprovedPriceLabel(): string {
  return PRICING_CONFIG.publicUnapprovedPriceLabel || "Price confirmation required";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Operational £/km and £/min (and base) must be set for both weekday and weekend bands. */
export function hasOperationalRatesConfigured(): boolean {
  const { weekday, weekendAndBankHoliday } = PRICING_CONFIG.operational;
  const bands = [weekday, weekendAndBankHoliday];
  return bands.every(
    (band) =>
      isFiniteNumber(band.baseFeeGbp) &&
      isFiniteNumber(band.perKmGbp) &&
      isFiniteNumber(band.perMinuteGbp),
  );
}

export function getAirportMinimumFare(airportCode: string): number | null {
  const value = PRICING_CONFIG.airportMinimumFaresGbp[airportCode];
  return isFiniteNumber(value) ? value : null;
}

export function getAirportBasePrice(airportCode: string): number | null {
  const value = PRICING_CONFIG.airportBasePricesGbp[airportCode as AirportCode];
  return isFiniteNumber(value) ? value : null;
}

/** @deprecated Prefer getAirportLegFixedCostGbp from shared/airport-fixed-costs. */
export function getAirportAccessFeeGbp(airportCode: string): number {
  const fees = PRICING_CONFIG.airportAccessFeesGbp;
  if (!fees) {
    return 0;
  }
  const value = fees[airportCode.trim().toUpperCase() as AirportCode];
  return isFiniteNumber(value) ? value : 0;
}

export function getAirportChargeGbp(airportCode: string): number {
  const value = PRICING_CONFIG.operational.airportChargesGbp[airportCode as AirportCode];
  return isFiniteNumber(value) ? value : 0;
}

export function getDefaultTollsGbp(): number {
  const value = PRICING_CONFIG.operational.defaultTollsGbp;
  return isFiniteNumber(value) ? value : 0;
}

export type OperationalMileageInput = {
  distanceKm: number;
  durationMinutes: number;
  premiumSchedule: boolean;
  airportCode?: string | null;
};

export type OperationalBreakdown = {
  loadedDistanceKm: number;
  operationalDistanceKm: number;
  loadedDurationMinutes: number;
  operationalDurationMinutes: number;
  baseFeeGbp: number;
  distanceChargeGbp: number;
  timeChargeGbp: number;
  tollsGbp: number;
  airportChargesGbp: number;
  subtotalGbp: number;
  premiumApplied: boolean;
  band: "weekday" | "weekendAndBankHoliday";
};

/**
 * Cost model for total operational mileage (loaded trip + likely empty return),
 * driver time, tolls, and airport charges. Returns null if rates are not configured.
 */
export function calculateOperationalSubtotal(
  input: OperationalMileageInput,
): OperationalBreakdown | null {
  if (!hasOperationalRatesConfigured()) {
    return null;
  }

  const ops = PRICING_CONFIG.operational;
  const bandKey = input.premiumSchedule ? "weekendAndBankHoliday" : "weekday";
  const band = ops[bandKey];
  const baseFeeGbp = band.baseFeeGbp as number;
  const perKmGbp = band.perKmGbp as number;
  const perMinuteGbp = band.perMinuteGbp as number;

  const emptyMiles = Math.max(0, ops.emptyReturnMileageFactor);
  const emptyTime = Math.max(0, ops.emptyReturnTimeFactor);
  const loadedDistanceKm = Math.max(0, input.distanceKm);
  const loadedDurationMinutes = Math.max(0, input.durationMinutes);
  const operationalDistanceKm = loadedDistanceKm * (1 + emptyMiles);
  const operationalDurationMinutes = loadedDurationMinutes * (1 + emptyTime);

  const distanceChargeGbp = operationalDistanceKm * perKmGbp;
  const timeChargeGbp = operationalDurationMinutes * perMinuteGbp;
  const tollsGbp = getDefaultTollsGbp();
  const airportChargesGbp = input.airportCode ? getAirportChargeGbp(input.airportCode) : 0;
  let subtotalGbp = baseFeeGbp + distanceChargeGbp + timeChargeGbp + tollsGbp + airportChargesGbp;

  let premiumApplied = false;
  if (bandKey === "weekendAndBankHoliday" && isFiniteNumber(band.premiumRate) && band.premiumRate > 0) {
    // Rates already use the weekend band; premiumRate is an optional extra uplift on top.
    subtotalGbp *= 1 + band.premiumRate;
    premiumApplied = true;
  }

  return {
    loadedDistanceKm,
    operationalDistanceKm,
    loadedDurationMinutes,
    operationalDurationMinutes,
    baseFeeGbp,
    distanceChargeGbp,
    timeChargeGbp,
    tollsGbp,
    airportChargesGbp,
    subtotalGbp,
    premiumApplied,
    band: bandKey,
  };
}

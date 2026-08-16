import pricingConfigJson from "./pricing-config.json";

export type AirportCode = "BFS" | "BHD" | "DUB" | "LDY";

export type DayRateBand = {
  baseFeeGbp: number | null;
  perKmGbp: number | null;
  perMinuteGbp: number | null;
  premiumRate?: number;
};

export type PricingConfig = {
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
  airportBasePricesGbp: Record<AirportCode, number>;
  airportEstatePremiumGbp: number;
  airportLongHaulEstatePremium?: {
    enabled: boolean;
    note?: string;
    minSaloonFareGbp: number;
    premiumGbp: number;
    excludeAirports: AirportCode[];
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

export const PRICING_CONFIG = pricingConfigJson as PricingConfig;

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

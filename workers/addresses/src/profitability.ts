/**
 * Worker-only profitability protection.
 *
 * The existing fare engine stays authoritative until a real vehicle MPG is
 * saved. Any routing or calculation failure keeps that existing fare.
 * Public callers receive only the protected customer amounts — never home
 * coordinates, dead-head legs, or the operating base.
 */

import { roundGbp } from "../shared/gbp";
import {
  calculateUniversalJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";
import {
  dublinAirportJourneyFareGbp,
  ownerPricingEngineOptions,
} from "../shared/owner-pricing-config";
import type { OwnerPricingSettings } from "../shared/owner-pricing-config";
import {
  DEFAULT_MINIMUM_SALOON_ONE_WAY_GBP,
  fuelCostPerMileGbp,
  isProfitabilityProtectionActive,
  type ProfitabilitySettings,
} from "../../../src/lib/owner-profitability-settings";
import type {
  OwnerProfitabilityReport,
  ProfitabilityLegReport,
  ProfitabilityRule,
} from "../../../src/lib/owner-profitability-report";
import {
  applyTripPremium,
  type TripSchedule,
} from "../../../src/lib/point-to-point-premium";
import { fetchOsrmTripRouteMetrics } from "../../../src/lib/trip-route";
import { OPERATING_BASE } from "./operating-base";

export type { OwnerProfitabilityReport, ProfitabilityLegReport, ProfitabilityRule };

export type RoutePoint = { lat: number; lng: number };

export type CustomerFareSnapshot = {
  amountGbp: number;
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  nightWeekendSurchargeGbp: number;
  /** Journey + night + fixed costs for the leg, before airport access and the return discount. */
  outboundOneWayBeforeAccessGbp?: number;
  returnOneWayBeforeAccessGbp?: number;
  outboundFixedGbp?: number;
  returnFixedGbp?: number;
};

type LegMetrics = { distanceKm: number; durationMinutes: number };

const LEG_TTL_MS = 15 * 60 * 1000;
const LEG_CACHE_MAX = 300;
const legCache = new Map<string, { metrics: LegMetrics; storedAt: number }>();

function roundCoord(value: number): string {
  return value.toFixed(4);
}

function legCacheKey(from: RoutePoint, to: RoutePoint): string {
  return `${roundCoord(from.lat)},${roundCoord(from.lng)}>${roundCoord(to.lat)},${roundCoord(to.lng)}`;
}

function pointsWithinMetres(a: RoutePoint, b: RoutePoint, metres: number): boolean {
  const latMetres = Math.abs(a.lat - b.lat) * 111_000;
  const lngMetres =
    Math.abs(a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(latMetres, lngMetres) <= metres;
}

function logFallback(reason: string): void {
  console.warn(`[profitability] fallback reason=${reason}`);
}

export function roundUpWholePoundGbp(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const cents = Math.round(amount * 100);
  return Math.ceil(cents / 100 - 1e-9);
}

export function profitabilityFloorFromOperations(input: {
  operationalMiles: number;
  operationalMinutes: number;
  settings: ProfitabilitySettings;
}): {
  fuelCostPerMileGbp: number;
  fuelCostGbp: number;
  wearCostGbp: number;
  directJobCostsGbp: number;
  targetTimeEarningsGbp: number;
  floorGbp: number;
} | null {
  const perMile = fuelCostPerMileGbp(
    input.settings.dieselPricePerLitreGbp,
    input.settings.vehicleMpg,
  );
  if (perMile == null || !isProfitabilityProtectionActive(input.settings)) return null;
  const fuelCostGbp = input.operationalMiles * perMile;
  const wearCostGbp = input.operationalMiles * input.settings.wearAllowancePerMileGbp;
  const directJobCostsGbp = fuelCostGbp + wearCostGbp;
  const targetTimeEarningsGbp =
    (input.operationalMinutes / 60) * input.settings.targetHourlyEarningsGbp;
  return {
    fuelCostPerMileGbp: perMile,
    fuelCostGbp,
    wearCostGbp,
    directJobCostsGbp,
    targetTimeEarningsGbp,
    floorGbp: targetTimeEarningsGbp + directJobCostsGbp,
  };
}

export function protectSaloonOneWayFare(input: {
  existingCurveFareGbp: number;
  minimumSaloonFareGbp: number;
  profitabilityFloorGbp: number | null;
  active: boolean;
}): { protectedFareGbp: number; rule: ProfitabilityRule } {
  const curve = Math.round(input.existingCurveFareGbp);
  if (!input.active || input.profitabilityFloorGbp == null || !Number.isFinite(input.profitabilityFloorGbp)) {
    return { protectedFareGbp: curve, rule: "NOT ACTIVE" };
  }
  const minimum = input.minimumSaloonFareGbp;
  const floor = input.profitabilityFloorGbp;
  const candidates: Array<{ rule: ProfitabilityRule; value: number }> = [
    { rule: "EXISTING FARE", value: curve },
    { rule: "MINIMUM FARE", value: minimum },
    { rule: "PROFITABILITY FLOOR", value: floor },
  ];
  const winner = candidates.reduce((best, item) => (item.value > best.value ? item : best));
  return {
    protectedFareGbp: roundUpWholePoundGbp(Math.max(curve, minimum, floor)),
    rule: winner.rule,
  };
}

async function fetchCachedLeg(from: RoutePoint, to: RoutePoint): Promise<LegMetrics | null> {
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng) || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    return null;
  }
  if (pointsWithinMetres(from, to, 80)) {
    return { distanceKm: 0, durationMinutes: 0 };
  }
  const key = legCacheKey(from, to);
  const cached = legCache.get(key);
  const now = Date.now();
  if (cached && now - cached.storedAt < LEG_TTL_MS) {
    return cached.metrics;
  }
  const routed = await fetchOsrmTripRouteMetrics(from.lat, from.lng, to.lat, to.lng);
  if (!routed || routed.source !== "osrm") return null;
  const metrics = {
    distanceKm: routed.distanceKm,
    durationMinutes: routed.durationMinutes,
  };
  legCache.set(key, { metrics, storedAt: now });
  if (legCache.size > LEG_CACHE_MAX) {
    const oldest = legCache.keys().next().value;
    if (oldest) legCache.delete(oldest);
  }
  return metrics;
}

async function measureOperationalJob(input: {
  pickup: RoutePoint;
  dropoff: RoutePoint;
  passenger: LegMetrics;
}): Promise<{ operationalMiles: number; operationalMinutes: number } | null> {
  const toPickup = await fetchCachedLeg(OPERATING_BASE, input.pickup);
  const toBase = await fetchCachedLeg(input.dropoff, OPERATING_BASE);
  if (!toPickup || !toBase) return null;
  const distanceKm = toPickup.distanceKm + input.passenger.distanceKm + toBase.distanceKm;
  const durationMinutes =
    toPickup.durationMinutes + input.passenger.durationMinutes + toBase.durationMinutes;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || distanceKm < 0) {
    return null;
  }
  return {
    operationalMiles: universalDrivingMilesFromKm(distanceKm),
    operationalMinutes: durationMinutes,
  };
}

function readProfitability(
  pricing: OwnerPricingSettings | (OwnerPricingSettings & { profitability?: ProfitabilitySettings | null }) | null,
): ProfitabilitySettings | null {
  if (!pricing || !("profitability" in pricing)) return null;
  return pricing.profitability ?? null;
}

function finitePoint(point: RoutePoint | null | undefined): RoutePoint | null {
  if (!point) return null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return null;
  return { lat: point.lat, lng: point.lng };
}

function vehicleFareFromProtectedSaloon(
  protectedSaloonGbp: number,
  vehicleType: string,
  pricing: OwnerPricingSettings | null | undefined,
): number {
  const options = ownerPricingEngineOptions(pricing);
  return calculateUniversalJourneyFareGbp(0, vehicleType, {
    saloonFareGbp: protectedSaloonGbp,
    estatePremiumGbp: options.estatePremiumGbp,
    minibusMultiplier: options.minibusMultiplier,
    executiveMultiplier: options.executiveMultiplier,
  }).journeyFareGbp;
}

export async function applyProfitabilityProtection(input: {
  pricing: OwnerPricingSettings | (OwnerPricingSettings & { profitability?: ProfitabilitySettings | null }) | null;
  vehicleType: string;
  routeMetrics: LegMetrics;
  pickup: RoutePoint | null;
  dropoff: RoutePoint | null;
  returnJourney: boolean;
  /** True when the transfer is to or from Dublin Airport. */
  dublinAirportJourney?: boolean;
  schedule: TripSchedule;
  existing: CustomerFareSnapshot;
}): Promise<CustomerFareSnapshot & { applied: boolean; fallbackReason: string | null }> {
  const existing = {
    amountGbp: roundGbp(input.existing.amountGbp),
    journeyFareGbp: roundGbp(input.existing.journeyFareGbp),
    airportFixedCostsGbp: roundGbp(input.existing.airportFixedCostsGbp),
    nightWeekendSurchargeGbp: roundGbp(input.existing.nightWeekendSurchargeGbp),
    outboundOneWayBeforeAccessGbp: input.existing.outboundOneWayBeforeAccessGbp,
    returnOneWayBeforeAccessGbp: input.existing.returnOneWayBeforeAccessGbp,
    outboundFixedGbp: input.existing.outboundFixedGbp,
    returnFixedGbp: input.existing.returnFixedGbp,
    applied: false,
    fallbackReason: null as string | null,
  };
  try {
    const settings = readProfitability(input.pricing);
    if (!settings || !isProfitabilityProtectionActive(settings)) {
      return { ...existing, fallbackReason: "mpg_not_configured" };
    }
    const pickup = finitePoint(input.pickup);
    const dropoff = finitePoint(input.dropoff);
    if (!pickup || !dropoff) {
      logFallback("missing_coordinates");
      return { ...existing, fallbackReason: "missing_coordinates" };
    }
    const roadMiles = universalDrivingMilesFromKm(input.routeMetrics.distanceKm);
    const saloonCurve = calculateUniversalSaloonJourneyFareGbp(roadMiles, {
      minimumGbp: input.pricing?.saloon.minimumFareGbp,
      floorMiles: input.pricing?.saloon.floorMiles,
      knots: input.pricing?.saloon.knots.map((knot) => [knot.miles, knot.fareGbp] as const),
    });
    const outboundOps = await measureOperationalJob({
      pickup,
      dropoff,
      passenger: input.routeMetrics,
    });
    if (!outboundOps) {
      logFallback("positioning_route_failed");
      return { ...existing, fallbackReason: "positioning_route_failed" };
    }
    const outboundFloor = profitabilityFloorFromOperations({
      ...outboundOps,
      settings: settings as ProfitabilitySettings,
    });
    if (!outboundFloor) {
      logFallback("invalid_settings");
      return { ...existing, fallbackReason: "invalid_settings" };
    }
    const outboundProtected = protectSaloonOneWayFare({
      existingCurveFareGbp: saloonCurve,
      minimumSaloonFareGbp: settings.minimumSaloonOneWayGbp,
      profitabilityFloorGbp: outboundFloor.floorGbp,
      active: true,
    });
    const outboundVehicle = vehicleFareFromProtectedSaloon(
      outboundProtected.protectedFareGbp,
      input.vehicleType,
      input.pricing,
    );

    let returnVehicle = outboundVehicle;
    if (input.returnJourney) {
      const returnOps = await measureOperationalJob({
        pickup: dropoff,
        dropoff: pickup,
        passenger: input.routeMetrics,
      });
      if (!returnOps) {
        logFallback("return_positioning_route_failed");
        return { ...existing, fallbackReason: "return_positioning_route_failed" };
      }
      const returnFloor = profitabilityFloorFromOperations({
        ...returnOps,
        settings: settings as ProfitabilitySettings,
      });
      if (!returnFloor) {
        logFallback("invalid_settings");
        return { ...existing, fallbackReason: "invalid_settings" };
      }
      const returnProtected = protectSaloonOneWayFare({
        existingCurveFareGbp: saloonCurve,
        minimumSaloonFareGbp: settings.minimumSaloonOneWayGbp,
        profitabilityFloorGbp: returnFloor.floorGbp,
        active: true,
      });
      returnVehicle = vehicleFareFromProtectedSaloon(
        returnProtected.protectedFareGbp,
        input.vehicleType,
        input.pricing,
      );
    }

    const dublinRate = ownerPricingEngineOptions(input.pricing).dublinAirportFareAdjustmentRate ?? 0;
    const adjustedOutboundVehicle = dublinAirportJourneyFareGbp(
      outboundVehicle,
      input.dublinAirportJourney === true,
      dublinRate,
    );
    const adjustedReturnVehicle = dublinAirportJourneyFareGbp(
      returnVehicle,
      input.dublinAirportJourney === true,
      dublinRate,
    );

    const premium = applyTripPremium(
      adjustedOutboundVehicle,
      { ...input.schedule, returnJourney: input.returnJourney },
      undefined,
      {
        pricing: input.pricing,
        returnOneWayFare: input.returnJourney ? adjustedReturnVehicle : undefined,
      },
    );
    const journeyFareGbp = roundGbp(premium.total);
    const nightWeekendSurchargeGbp = roundGbp(premium.premiumAmount);
    const amountGbp = roundGbp(journeyFareGbp + existing.airportFixedCostsGbp);
    const outboundFixed =
      existing.outboundFixedGbp ??
      (input.returnJourney ? 0 : existing.airportFixedCostsGbp);
    const outboundLeg = applyTripPremium(
      adjustedOutboundVehicle,
      {
        outboundDate: input.schedule.outboundDate,
        outboundTime: input.schedule.outboundTime,
        returnJourney: false,
      },
      undefined,
      { pricing: input.pricing },
    );
    const outboundOneWayBeforeAccessGbp = roundGbp(outboundLeg.total + Math.max(0, outboundFixed));
    let returnOneWayBeforeAccessGbp = existing.returnOneWayBeforeAccessGbp;
    if (input.returnJourney) {
      const returnLeg = applyTripPremium(
        adjustedReturnVehicle,
        {
          outboundDate: input.schedule.returnDate,
          outboundTime: input.schedule.returnTime,
          returnJourney: false,
        },
        undefined,
        { pricing: input.pricing },
      );
      const returnFixed = existing.returnFixedGbp ?? 0;
      returnOneWayBeforeAccessGbp = roundGbp(returnLeg.total + Math.max(0, returnFixed));
    }
    if (amountGbp + 0.001 < existing.amountGbp) {
      logFallback("below_existing_fare");
      return { ...existing, fallbackReason: "below_existing_fare" };
    }
    return {
      amountGbp,
      journeyFareGbp,
      airportFixedCostsGbp: existing.airportFixedCostsGbp,
      nightWeekendSurchargeGbp,
      outboundOneWayBeforeAccessGbp,
      returnOneWayBeforeAccessGbp,
      outboundFixedGbp: existing.outboundFixedGbp,
      returnFixedGbp: existing.returnFixedGbp,
      applied: true,
      fallbackReason: null,
    };
  } catch {
    logFallback("calculation_error");
    return { ...existing, fallbackReason: "calculation_error" };
  }
}

function emptyLeg(input: {
  passengerMiles: number;
  passengerMinutes: number;
  curve: number;
  vehicle: number;
  minimum: number;
  surcharge: number;
  rule: ProfitabilityRule;
}): ProfitabilityLegReport {
  return {
    passengerMiles: input.passengerMiles,
    passengerMinutes: input.passengerMinutes,
    operationalMiles: null,
    operationalMinutes: null,
    existingCurveFareGbp: input.curve,
    existingVehicleFareGbp: input.vehicle,
    minimumSaloonFareGbp: input.minimum,
    fuelCostPerMileGbp: null,
    fuelCostGbp: null,
    wearCostGbp: null,
    targetTimeEarningsGbp: null,
    profitabilityFloorGbp: null,
    protectedSaloonFareGbp: null,
    protectedVehicleFareGbp: null,
    nightWeekendSurchargeGbp: input.surcharge,
    rule: input.rule,
  };
}

export async function buildOwnerProfitabilityReport(input: {
  pricing: OwnerPricingSettings & { profitability?: ProfitabilitySettings | null };
  vehicleType: string;
  routeMetrics: LegMetrics;
  pickup: RoutePoint | null;
  dropoff: RoutePoint | null;
  returnJourney: boolean;
  schedule: TripSchedule;
  existing: CustomerFareSnapshot;
  expressFeeGbp: number;
}): Promise<OwnerProfitabilityReport> {
  const settings = readProfitability(input.pricing);
  const active = isProfitabilityProtectionActive(settings);
  const roadMiles = universalDrivingMilesFromKm(input.routeMetrics.distanceKm);
  const passengerMiles = Math.round(roadMiles * 10) / 10;
  const passengerMinutes = Math.round(input.routeMetrics.durationMinutes);
  const saloonCurve = calculateUniversalSaloonJourneyFareGbp(roadMiles, {
    minimumGbp: input.pricing.saloon.minimumFareGbp,
    floorMiles: input.pricing.saloon.floorMiles,
    knots: input.pricing.saloon.knots.map((knot) => [knot.miles, knot.fareGbp] as const),
  });
  const existingVehicle = calculateUniversalJourneyFareGbp(roadMiles, input.vehicleType, {
    estatePremiumGbp: ownerPricingEngineOptions(input.pricing).estatePremiumGbp,
    minibusMultiplier: ownerPricingEngineOptions(input.pricing).minibusMultiplier,
    executiveMultiplier: ownerPricingEngineOptions(input.pricing).executiveMultiplier,
    saloonMinimumGbp: input.pricing.saloon.minimumFareGbp,
    saloonFloorMiles: input.pricing.saloon.floorMiles,
    saloonKnots: input.pricing.saloon.knots.map((knot) => [knot.miles, knot.fareGbp] as const),
  }).journeyFareGbp;
  const minimum = settings?.minimumSaloonOneWayGbp ?? DEFAULT_MINIMUM_SALOON_ONE_WAY_GBP;
  const expressFeeGbp = roundGbp(input.expressFeeGbp);
  const baseReport = (
    outbound: ProfitabilityLegReport,
    returnLeg: ProfitabilityLegReport | null,
    fallbackReason: string | null,
  ): OwnerProfitabilityReport => ({
    protectionActive: false,
    fallbackReason,
    outbound,
    returnLeg,
    airportFixedCostsGbp: roundGbp(input.existing.airportFixedCostsGbp),
    expressFeeGbp,
    existingCustomerFareGbp: roundGbp(input.existing.amountGbp),
    journeyFareGbp: roundGbp(input.existing.journeyFareGbp),
    finalCustomerPriceGbp: roundGbp(input.existing.amountGbp + expressFeeGbp),
    directCostsGbp: null,
    estimatedRemainingAfterDirectCostsGbp: null,
    estimatedEarningsPerHourGbp: null,
  });

  const pickup = finitePoint(input.pickup);
  const dropoff = finitePoint(input.dropoff);
  if (!pickup || !dropoff) {
    return baseReport(
      emptyLeg({
        passengerMiles,
        passengerMinutes,
        curve: saloonCurve,
        vehicle: existingVehicle,
        minimum,
        surcharge: roundGbp(input.existing.nightWeekendSurchargeGbp),
        rule: "NOT ACTIVE",
      }),
      null,
      "missing_coordinates",
    );
  }

  const outboundOps = await measureOperationalJob({
    pickup,
    dropoff,
    passenger: input.routeMetrics,
  });
  const returnOps = input.returnJourney
    ? await measureOperationalJob({
        pickup: dropoff,
        dropoff: pickup,
        passenger: input.routeMetrics,
      })
    : null;
  if (!outboundOps || (input.returnJourney && !returnOps)) {
    return baseReport(
      emptyLeg({
        passengerMiles,
        passengerMinutes,
        curve: saloonCurve,
        vehicle: existingVehicle,
        minimum,
        surcharge: roundGbp(input.existing.nightWeekendSurchargeGbp),
        rule: "NOT ACTIVE",
      }),
      null,
      "positioning_route_failed",
    );
  }

  const describeLeg = (
    ops: { operationalMiles: number; operationalMinutes: number },
    date?: string,
    time?: string,
  ): ProfitabilityLegReport => {
    const floor = settings
      ? profitabilityFloorFromOperations({ ...ops, settings })
      : null;
    const protectedFare = protectSaloonOneWayFare({
      existingCurveFareGbp: saloonCurve,
      minimumSaloonFareGbp: minimum,
      profitabilityFloorGbp: floor?.floorGbp ?? null,
      active: Boolean(floor),
    });
    const protectedVehicle = floor
      ? vehicleFareFromProtectedSaloon(protectedFare.protectedFareGbp, input.vehicleType, input.pricing)
      : existingVehicle;
    const ratePremium = applyTripPremium(protectedVehicle, {
      outboundDate: date,
      outboundTime: time,
      returnJourney: false,
    }, undefined, { pricing: input.pricing });
    return {
      passengerMiles,
      passengerMinutes,
      operationalMiles: Math.round(ops.operationalMiles * 10) / 10,
      operationalMinutes: Math.round(ops.operationalMinutes),
      existingCurveFareGbp: saloonCurve,
      existingVehicleFareGbp: existingVehicle,
      minimumSaloonFareGbp: minimum,
      fuelCostPerMileGbp: floor ? Math.round(floor.fuelCostPerMileGbp * 10000) / 10000 : null,
      fuelCostGbp: floor ? roundGbp(floor.fuelCostGbp) : null,
      wearCostGbp: floor ? roundGbp(floor.wearCostGbp) : null,
      targetTimeEarningsGbp: floor ? roundGbp(floor.targetTimeEarningsGbp) : null,
      profitabilityFloorGbp: floor ? roundGbp(floor.floorGbp) : null,
      protectedSaloonFareGbp: floor ? protectedFare.protectedFareGbp : null,
      protectedVehicleFareGbp: floor ? protectedVehicle : null,
      nightWeekendSurchargeGbp: roundGbp(ratePremium.premiumAmount),
      rule: floor ? protectedFare.rule : "NOT ACTIVE",
    };
  };

  const outbound = describeLeg(outboundOps, input.schedule.outboundDate, input.schedule.outboundTime);
  const returnLeg = returnOps
    ? describeLeg(returnOps, input.schedule.returnDate, input.schedule.returnTime)
    : null;

  if (!active || !settings) {
    const inactive = baseReport(outbound, returnLeg, "mpg_not_configured");
    inactive.outbound = outbound;
    inactive.returnLeg = returnLeg;
    return inactive;
  }

  const protectedQuote = await applyProfitabilityProtection(input);
  const directOut = outbound.fuelCostGbp != null && outbound.wearCostGbp != null
    ? outbound.fuelCostGbp + outbound.wearCostGbp
    : null;
  const directReturn = returnLeg && returnLeg.fuelCostGbp != null && returnLeg.wearCostGbp != null
    ? returnLeg.fuelCostGbp + returnLeg.wearCostGbp
    : 0;
  const directCostsGbp = directOut == null ? null : roundGbp(directOut + (returnLeg ? directReturn : 0));
  const minutes =
    (outbound.operationalMinutes ?? 0) + (returnLeg?.operationalMinutes ?? 0);
  const remaining =
    directCostsGbp == null ? null : roundGbp(protectedQuote.journeyFareGbp - directCostsGbp);
  const perHour =
    remaining == null || minutes <= 0 ? null : roundGbp(remaining / (minutes / 60));

  return {
    protectionActive: protectedQuote.applied,
    fallbackReason: protectedQuote.applied ? null : protectedQuote.fallbackReason,
    outbound,
    returnLeg,
    airportFixedCostsGbp: protectedQuote.airportFixedCostsGbp,
    expressFeeGbp,
    existingCustomerFareGbp: roundGbp(input.existing.amountGbp),
    journeyFareGbp: protectedQuote.journeyFareGbp,
    finalCustomerPriceGbp: roundGbp(protectedQuote.amountGbp + expressFeeGbp),
    directCostsGbp,
    estimatedRemainingAfterDirectCostsGbp: remaining,
    estimatedEarningsPerHourGbp: perHour,
  };
}

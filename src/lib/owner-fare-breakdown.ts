/**
 * Owner-only fare breakdown (read-only).
 *
 * Explains how the authoritative engine reached a price: route miles, the
 * mileage calculation, vehicle supplement, Dublin Airport adjustment, airport
 * minimum, drive-to-pickup charge, surcharges, return discount and airport
 * fixed costs (parking / M1 toll / pickup / drop-off fees).
 *
 * It never sets a price. It re-derives each component with the SAME helpers
 * the engine uses and then reconciles to the engine's final amount. Anything
 * the components do not explain (profitability protection, postcode rules,
 * rounding) is shown as an explicit "other adjustment" line so the total
 * always matches what the customer is charged.
 *
 * Privacy: contains internal pricing rules (drive-to-pickup charge, knots,
 * Dublin %). The Worker attaches it ONLY for owner-authorised requests that
 * ask for it. Never render it on a customer surface.
 */

import { applyBfsMinimumFare } from "../../shared/bfs-minimum-fare";
import { getAirportLegFixedCosts } from "../../shared/airport-fixed-costs";
import { isExecutiveVehicle } from "../../shared/executive-vehicle";
import {
  dublinAirportJourneyFareGbp,
  isDublinAirportCode,
  ownerPricingEngineOptions,
  type OwnerPricingSettings,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import {
  calculateUniversalJourneyFareGbp,
  rawUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
  UNIVERSAL_SALOON_FLOOR_MILES,
  UNIVERSAL_SALOON_KNOTS,
  UNIVERSAL_SALOON_MINIMUM_GBP,
} from "../../shared/universal-distance-pricing";
import { roundGbp } from "../../shared/gbp";
import type { DublinTollAllowance } from "../../shared/dublin-tolls";
import { applyTripPremium, AIRPORT_TRIP_PREMIUM_RATE, type TripSchedule } from "./point-to-point-premium";

export type OwnerFareBreakdownLeg = {
  leg: "outbound" | "return";
  /** Saloon fare from the mileage table / formula (nearest £1). */
  baseJourneyFareGbp: number;
  /** Estate uplift, Business Class / 7-seater multiplier difference. */
  vehicleSupplementGbp: number;
  /** Extra from the owner's Dublin Airport Fare Adjustment (%). */
  dublinAirportAdjustmentGbp: number;
  /** Uplift to reach an airport minimum fare (BFS / BHD). */
  minimumFareUpliftGbp: number;
  /** Drive-to-pickup charge (Worker-only, from the operating base). */
  driveToPickupChargeGbp: number;
  /** Vehicle fare for this leg before surcharge, return discount and fixed costs. */
  legVehicleFareGbp: number;
  /** Evening / Night / Weekend / Christmas surcharge on this leg (highest only). */
  surchargeGbp: number;
  /** Direction-specific airport fixed costs for this leg. */
  airportFixed: {
    pickupFeeGbp: number;
    dropOffFeeGbp: number;
    parkingGbp: number;
    tollGbp: number;
    totalGbp: number;
  };
  /** Dublin tolls for address-to-address legs (down and back). */
  dublinTolls: { m1Gbp: number; portTunnelGbp: number; m50Gbp: number; totalGbp: number };
};

export type OwnerFareBreakdown = {
  ownerOnly: true;
  journeyType: "airport-transfer" | "address-to-address" | "airport-to-airport";
  airportCode: string | null;
  /** Direction relative to the airport, when there is one. */
  direction: "from-airport" | "to-airport" | null;
  vehicleType: string;
  routeMiles: number;
  mileageCalculation: {
    method: "tier-table" | "formula";
    detail: string;
    rawSaloonFareGbp: number;
    saloonFareGbp: number;
  };
  dublinAirportAdjustmentRate: number;
  legs: OwnerFareBreakdownLeg[];
  surchargesGbp: number;
  returnDiscountRate: number;
  returnDiscountGbp: number;
  airportFixedCostsGbp: number;
  dublinTollsGbp: number;
  /** Profitability protection, postcode rules or rounding the components do not explain. */
  otherAdjustments: Array<{ label: string; amountGbp: number }>;
  finalCustomerPriceGbp: number;
  notes: string[];
};

type Pricing = OwnerPricingSettings | PublicOwnerPricingConfig | null | undefined;

function money(n: number): string {
  const v = roundGbp(n);
  return `£${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`;
}

function describeMileage(miles: number, pricing: Pricing): OwnerFareBreakdown["mileageCalculation"] {
  const engine = ownerPricingEngineOptions(pricing ?? undefined);
  const curve = {
    formula: engine.saloonFormula,
    minimumGbp: engine.saloonMinimumGbp,
    floorMiles: engine.saloonFloorMiles,
    knots: engine.saloonKnots,
  };
  const raw = rawUniversalSaloonJourneyFareGbp(miles, curve);
  const rounded = Math.round(raw);
  const m = Math.round(miles * 10) / 10;

  if (engine.saloonFormula?.enabled === true) {
    const f = engine.saloonFormula;
    return {
      method: "formula",
      detail: `${money(f.startingChargeGbp)} + ${m} mi × ${money(f.ratePerMileGbp)} (minimum ${money(f.minimumFareGbp)}) = ${money(raw)} → ${money(rounded)}`,
      rawSaloonFareGbp: roundGbp(raw),
      saloonFareGbp: rounded,
    };
  }

  const knots = engine.saloonKnots ?? UNIVERSAL_SALOON_KNOTS;
  const floorMiles = engine.saloonFloorMiles ?? UNIVERSAL_SALOON_FLOOR_MILES;
  const minimum = engine.saloonMinimumGbp ?? UNIVERSAL_SALOON_MINIMUM_GBP;
  let detail = `${m} mi is within the ${floorMiles}-mile minimum: ${money(minimum)}`;
  if (miles > floorMiles && knots.length >= 2) {
    let lo = knots[knots.length - 2]!;
    let hi = knots[knots.length - 1]!;
    for (let i = 1; i < knots.length; i++) {
      if (miles <= knots[i]![0]) {
        lo = knots[i - 1]!;
        hi = knots[i]!;
        break;
      }
    }
    const rate = (hi[1] - lo[1]) / (hi[0] - lo[0]);
    const beyond = miles > knots[knots.length - 1]![0] ? " (beyond the last tier, same slope)" : "";
    detail =
      `Tier ${lo[0]} mi ${money(lo[1])} → ${hi[0]} mi ${money(hi[1])}${beyond}: ` +
      `${money(lo[1])} + ${Math.round((miles - lo[0]) * 10) / 10} mi × ${money(rate)}/mi = ${money(raw)} → ${money(rounded)}`;
  }
  return { method: "tier-table", detail, rawSaloonFareGbp: roundGbp(raw), saloonFareGbp: rounded };
}

/**
 * Build the owner breakdown for an address ↔ airport or address-to-address
 * quote. Airport-to-airport quotes get the mileage, fixed costs and a
 * reconciling line (their fee rules are resolved per airport pair).
 */
export function buildOwnerFareBreakdown(input: {
  pricing: Pricing;
  vehicleType: string;
  distanceKm: number;
  airportCode: string | null;
  fromAirport: boolean;
  airportToAirport?: boolean;
  returnJourney: boolean;
  schedule: TripSchedule;
  /** Whole-£ drive-to-pickup charge the Worker added to each leg (0 when off). */
  positioningChargeGbp: number;
  /** Dublin toll allowance the Worker added (address-to-address only). */
  tollAllowance?: DublinTollAllowance;
  /** Engine total before optional Express / terminal access. */
  finalAmountGbp: number;
  /** Engine-reported airport fixed costs (authoritative). */
  airportFixedCostsGbp?: number;
  profitabilityProtectionApplied?: boolean;
  /** Derry corridor Saloon fare the engine used instead of mileage + drive charge. */
  corridorSaloonFareGbp?: number | null;
}): OwnerFareBreakdown {
  const engine = ownerPricingEngineOptions(input.pricing ?? undefined);
  const miles = universalDrivingMilesFromKm(input.distanceKm);
  const mileage = describeMileage(miles, input.pricing);
  const notes: string[] = [];
  const corridorSaloon =
    Number.isFinite(Number(input.corridorSaloonFareGbp)) && Number(input.corridorSaloonFareGbp) > 0
      ? Number(input.corridorSaloonFareGbp)
      : null;

  const universal = calculateUniversalJourneyFareGbp(miles, input.vehicleType, {
    minibusMultiplier: engine.minibusMultiplier,
    executiveMultiplier: engine.executiveMultiplier,
    estatePremiumGbp: engine.estatePremiumGbp,
    saloonFormula: engine.saloonFormula,
    saloonMinimumGbp: engine.saloonMinimumGbp,
    saloonFloorMiles: engine.saloonFloorMiles,
    saloonKnots: engine.saloonKnots,
    ...(corridorSaloon != null ? { saloonFareGbp: corridorSaloon } : {}),
  });

  const airport = input.airportCode ? input.airportCode.trim().toUpperCase() : null;
  const isDub = isDublinAirportCode(airport);
  const dublinRate = isDub ? engine.dublinAirportFareAdjustmentRate ?? 0 : 0;
  const positioning =
    corridorSaloon != null ? 0 : Math.max(0, Math.round(Number(input.positioningChargeGbp) || 0));
  const journeyType = input.airportToAirport
    ? "airport-to-airport"
    : airport
      ? "airport-transfer"
      : "address-to-address";

  const legFor = (leg: "outbound" | "return", fromAirportLeg: boolean): OwnerFareBreakdownLeg => {
    const vehicleFare = universal.journeyFareGbp;
    const afterDublin = journeyType === "airport-transfer"
      ? dublinAirportJourneyFareGbp(vehicleFare, isDub, dublinRate)
      : vehicleFare;
    const afterMinimum = journeyType === "airport-transfer" && airport
      ? applyBfsMinimumFare(afterDublin, input.vehicleType, [airport], input.pricing)
      : afterDublin;
    const legVehicleFare = roundGbp(afterMinimum + positioning);
    const schedule: TripSchedule =
      leg === "outbound"
        ? { outboundDate: input.schedule.outboundDate, outboundTime: input.schedule.outboundTime, returnJourney: false }
        : { outboundDate: input.schedule.returnDate, outboundTime: input.schedule.returnTime, returnJourney: false };
    const surcharge = applyTripPremium(
      legVehicleFare,
      schedule,
      journeyType === "address-to-address" ? undefined : AIRPORT_TRIP_PREMIUM_RATE,
      { pricing: input.pricing ?? undefined },
    ).premiumAmount;
    const fixed = journeyType === "airport-transfer" && airport
      ? getAirportLegFixedCosts(airport, fromAirportLeg)
      : null;
    const executivePickupIncluded = isExecutiveVehicle(input.vehicleType) && fromAirportLeg;
    const pickupFee = executivePickupIncluded ? 0 : fixed?.pickupFeeGbp ?? 0;
    const parking = executivePickupIncluded ? 0 : fixed?.parkingAllowanceGbp ?? 0;
    const toll = fixed?.tollAllowanceGbp ?? 0;
    const dropOff = fixed?.dropOffFeeGbp ?? 0;
    const tollLeg = input.tollAllowance?.legs.find((l) => l.leg === leg);
    return {
      leg,
      baseJourneyFareGbp: universal.saloonGbp,
      vehicleSupplementGbp: roundGbp(vehicleFare - universal.saloonGbp),
      dublinAirportAdjustmentGbp: roundGbp(afterDublin - vehicleFare),
      minimumFareUpliftGbp: roundGbp(afterMinimum - afterDublin),
      driveToPickupChargeGbp: positioning,
      legVehicleFareGbp: legVehicleFare,
      surchargeGbp: roundGbp(surcharge),
      airportFixed: {
        pickupFeeGbp: pickupFee,
        dropOffFeeGbp: dropOff,
        parkingGbp: parking,
        tollGbp: toll,
        totalGbp: roundGbp(pickupFee + parking + toll + dropOff),
      },
      dublinTolls: {
        m1Gbp: tollLeg?.m1Gbp ?? 0,
        portTunnelGbp: tollLeg?.portTunnelGbp ?? 0,
        m50Gbp: tollLeg?.m50Gbp ?? 0,
        totalGbp: tollLeg?.totalGbp ?? 0,
      },
    };
  };

  const legs = [legFor("outbound", input.fromAirport)];
  if (input.returnJourney) legs.push(legFor("return", !input.fromAirport));

  const returnRate = input.returnJourney ? engine.returnDiscountRate ?? 0 : 0;
  const baseTotal = legs.reduce((s, l) => s + l.legVehicleFareGbp, 0);
  const tollsBeforeDiscount = legs.reduce((s, l) => s + l.dublinTolls.totalGbp, 0);
  // Engine: the 5% applies to vehicle fares + Dublin tolls (never to surcharges or airport fixed costs).
  const returnDiscount = roundGbp((baseTotal + tollsBeforeDiscount) * returnRate);
  const surcharges = roundGbp(legs.reduce((s, l) => s + l.surchargeGbp, 0));
  const componentFixed = roundGbp(legs.reduce((s, l) => s + l.airportFixed.totalGbp, 0));
  const fixedTotal =
    typeof input.airportFixedCostsGbp === "number" && Number.isFinite(input.airportFixedCostsGbp)
      ? roundGbp(input.airportFixedCostsGbp)
      : componentFixed;

  const dublinTolls = roundGbp(legs.reduce((s, l) => s + l.dublinTolls.totalGbp, 0));
  const explained = roundGbp(baseTotal - returnDiscount + surcharges + fixedTotal + dublinTolls);
  const finalAmount = roundGbp(input.finalAmountGbp);
  const residual = roundGbp(finalAmount - explained);
  const otherAdjustments: OwnerFareBreakdown["otherAdjustments"] = [];
  if (Math.abs(residual) >= 0.01) {
    otherAdjustments.push({
      label: input.profitabilityProtectionApplied
        ? "Profitability protection uplift"
        : journeyType === "airport-to-airport"
          ? "Airport-to-airport pricing rules"
          : "Other configured rule (postcode fare / rounding)",
      amountGbp: residual,
    });
  }

  if (corridorSaloon != null) {
    notes.push(`Derry corridor fare £${corridorSaloon} used instead of the mileage fare and drive-to-pickup charge.`);
  }
  if (journeyType === "address-to-address" && positioning > 0) {
    notes.push("Address-to-address drive charge is measured from home to the further end of the journey.");
  }
  if (journeyType === "airport-transfer" && positioning > 0) {
    notes.push("Airport drive charge is measured from home to the customer's address end.");
  }
  if (journeyType === "address-to-address" && dublinTolls > 0) {
    notes.push("Dublin tolls cover the driver's crossings down and back; customers see them inside the fare.");
  }
  notes.push("Optional Express / terminal access and Meet & Greet are added at checkout and are not included here.");

  return {
    ownerOnly: true,
    journeyType,
    airportCode: airport,
    direction: airport && !input.airportToAirport ? (input.fromAirport ? "from-airport" : "to-airport") : null,
    vehicleType: input.vehicleType,
    routeMiles: Math.round(miles * 10) / 10,
    mileageCalculation: mileage,
    dublinAirportAdjustmentRate: dublinRate,
    legs,
    surchargesGbp: surcharges,
    returnDiscountRate: returnRate,
    returnDiscountGbp: returnDiscount,
    airportFixedCostsGbp: fixedTotal,
    dublinTollsGbp: dublinTolls,
    otherAdjustments,
    finalCustomerPriceGbp: finalAmount,
    notes,
  };
}

/** Compact owner-only lines for display (label → £). */
export function ownerFareBreakdownLines(b: OwnerFareBreakdown): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  lines.push({ label: "Route mileage", value: `${b.routeMiles} mi` });
  lines.push({ label: "Mileage calculation", value: b.mileageCalculation.detail });
  for (const leg of b.legs) {
    const tag = b.legs.length > 1 ? (leg.leg === "outbound" ? " (outbound)" : " (return)") : "";
    lines.push({ label: `Base journey fare${tag}`, value: money(leg.baseJourneyFareGbp) });
    if (leg.vehicleSupplementGbp) lines.push({ label: `Vehicle supplement${tag}`, value: money(leg.vehicleSupplementGbp) });
    if (b.airportCode === "DUB" || leg.dublinAirportAdjustmentGbp) {
      lines.push({
        label: `Dublin Airport adjustment ${Math.round(b.dublinAirportAdjustmentRate * 1000) / 10}%${tag}`,
        value: money(leg.dublinAirportAdjustmentGbp),
      });
    }
    if (leg.minimumFareUpliftGbp) lines.push({ label: `Airport minimum fare uplift${tag}`, value: money(leg.minimumFareUpliftGbp) });
    lines.push({ label: `Drive-to-pickup charge${tag}`, value: money(leg.driveToPickupChargeGbp) });
    if (leg.surchargeGbp) lines.push({ label: `Surcharge${tag}`, value: money(leg.surchargeGbp) });
    const f = leg.airportFixed;
    if (f.parkingGbp) lines.push({ label: `Airport parking${tag}`, value: money(f.parkingGbp) });
    if (f.tollGbp) lines.push({ label: `M1 toll allowance${tag}`, value: money(f.tollGbp) });
    if (f.pickupFeeGbp) lines.push({ label: `Airport pickup fee${tag}`, value: money(f.pickupFeeGbp) });
    if (f.dropOffFeeGbp) lines.push({ label: `Airport drop-off fee${tag}`, value: money(f.dropOffFeeGbp) });
    const t = leg.dublinTolls;
    if (t.m1Gbp) lines.push({ label: `M1 toll allowance${tag}`, value: money(t.m1Gbp) });
    if (t.portTunnelGbp) lines.push({ label: `Dublin Port Tunnel${tag}`, value: money(t.portTunnelGbp) });
    if (t.m50Gbp) lines.push({ label: `M50 toll${tag}`, value: money(t.m50Gbp) });
  }
  if (b.returnDiscountGbp) {
    lines.push({ label: `Return discount ${Math.round(b.returnDiscountRate * 1000) / 10}%`, value: `−${money(b.returnDiscountGbp)}` });
  }
  for (const adj of b.otherAdjustments) lines.push({ label: adj.label, value: money(adj.amountGbp) });
  lines.push({ label: "Final customer price", value: money(b.finalCustomerPriceGbp) });
  return lines;
}

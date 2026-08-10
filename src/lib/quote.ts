import { ALL_AIRPORTS as AIRPORTS, AREAS, VEHICLE_TYPES } from "@/lib/data";
import { isLdyServiceAreaAddress } from "../../shared/ldy-service-area";
import {
  applyTripPremium,
  AIRPORT_TRIP_PREMIUM_RATE,
  getReturnJourneyFare,
  type TripSchedule,
} from "@/lib/point-to-point-premium";
import type { TripRouteMetrics } from "@/lib/trip-route";

type Area = (typeof AREAS)[number];

type AirportCode = "BFS" | "BHD" | "DUB" | "LDY";

/**
 * Distance-based surcharges for every NI pickup area and airport.
 * Fare = airport base price + surcharge, with the airport minimum as the floor.
 * Calibrated against Onward Travel Solutions instant quotes (2026).
 */
const AREA_AIRPORT_SURCHARGES: Record<Area, Record<AirportCode, number>> = {
  // Calibrated ~£8–£10 below OTS estate fares. LDY from live OTS LDY→Belfast-area quotes.
  "Belfast City Centre": { BFS: 2, BHD: 0, DUB: 50, LDY: 99 },
  Holywood: { BFS: 13, BHD: 0, DUB: 58, LDY: 101 },
  Newtownabbey: { BFS: 3, BHD: 8, DUB: 60, LDY: 89 },
  Lisburn: { BFS: 0, BHD: 8, DUB: 60, LDY: 98 },
  Dundonald: { BFS: 23, BHD: 3, DUB: 60, LDY: 103 },
  Antrim: { BFS: 0, BHD: 29, DUB: 50, LDY: 73 },
  Ballyclare: { BFS: 3, BHD: 13, DUB: 65, LDY: 83 },
  Hillsborough: { BFS: 3, BHD: 19, DUB: 65, LDY: 118 },
  Carrickfergus: { BFS: 14, BHD: 8, DUB: 62, LDY: 103 },
  Comber: { BFS: 23, BHD: 0, DUB: 62, LDY: 113 },
  Larne: { BFS: 13, BHD: 38, DUB: 72, LDY: 98 },
  Bangor: { BFS: 29, BHD: 3, DUB: 65, LDY: 118 },
  Newtownards: { BFS: 23, BHD: 0, DUB: 62, LDY: 113 },
  Ballymena: { BFS: 0, BHD: 49, DUB: 78, LDY: 58 },
  Downpatrick: { BFS: 38, BHD: 43, DUB: 75, LDY: 85 },
  Banbridge: { BFS: 38, BHD: 43, DUB: 75, LDY: 78 },
  Newcastle: { BFS: 64, BHD: 58, DUB: 80, LDY: 90 },
  Lurgan: { BFS: 18, BHD: 33, DUB: 82, LDY: 72 },
  Portadown: { BFS: 23, BHD: 53, DUB: 85, LDY: 70 },
  Armagh: { BFS: 44, BHD: 53, DUB: 88, LDY: 75 },
  Newry: { BFS: 63, BHD: 63, DUB: 40, LDY: 88 },
  Cookstown: { BFS: 28, BHD: 78, DUB: 95, LDY: 28 },
  Coleraine: { BFS: 43, BHD: 48, DUB: 159, LDY: 18 },
  Omagh: { BFS: 74, BHD: 62, DUB: 115, LDY: 22 },
  "Derry / Londonderry": { BFS: 83, BHD: 128, DUB: 105, LDY: 0 },
  Enniskillen: { BFS: 99, BHD: 94, DUB: 175, LDY: 55 },
};

/** Default surcharge when pickup area cannot be matched from the address. */
const DEFAULT_AREA_SURCHARGE: Record<AirportCode, number> = {
  BFS: 35,
  BHD: 25,
  DUB: 70,
  LDY: 93,
};

/** @deprecated Use getAreaSurcharge instead. */
export const AREA_SURCHARGES: Record<Area, number> = Object.fromEntries(
  Object.entries(AREA_AIRPORT_SURCHARGES).map(([area, surcharges]) => [area, surcharges.BFS]),
) as Record<Area, number>;

const VEHICLE_MULTIPLIERS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 1,
  "Standard Saloon (1–4 passengers)": 1,
  "Executive Saloon (1–4 passengers)": 1.2,
  "Minibus (5–8 passengers)": 1.55,
};

/** Point-to-point only — estate is the baseline; saloon is cheaper. */
const POINT_TO_POINT_VEHICLE_ADJUSTMENTS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 0,
  "Standard Saloon (1–4 passengers)": -10,
  "Executive Saloon (1–4 passengers)": 0,
  "Minibus (5–8 passengers)": 0,
};

/** Estate is saloon + £8; calibrated to sit £8–£10 under OTS estate fares. */
const AIRPORT_ESTATE_PREMIUM = 8;

/** Target band: our estate fare should sit this many pounds below live OTS. */
export const OTS_UNDERCUT_MIN = 8;
export const OTS_UNDERCUT_MAX = 10;
const OTS_UNDERCUT_MID = (OTS_UNDERCUT_MIN + OTS_UNDERCUT_MAX) / 2;

/** Minimum one-way executive airport transfer fare (all airports). */
const AIRPORT_EXECUTIVE_MINIMUM_FARE = 105;

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
};

/** Local point-to-point base fare — fallback when route distance is unavailable. */
const POINT_TO_POINT_BASE = 43;

/**
 * Onward Travel Solutions address-to-address model (calibrated from 50 NI routes, 2026).
 * Estate = base + tierMultiplier × (kmRate × km + minRate × minutes).
 */
const OTS_ESTATE_BASE = 40;
const OTS_KM_RATE = 0.482;
const OTS_MIN_RATE = 0.554;

const OTS_VEHICLE_BASE: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Standard Saloon (1–4 passengers)": 35,
  "Estate Car (1–4 passengers)": 40,
  "Executive Saloon (1–4 passengers)": 45,
  "Minibus (5–8 passengers)": 60,
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

/**
 * Address-to-address distance bands from Belfast — fallback when OSRM route is unavailable.
 */
const POINT_TO_POINT_AREA_RATES: Partial<Record<Area, number>> & { default: number } = {
  "Belfast City Centre": 0,
  Holywood: 8,
  Newtownabbey: 10,
  Dundonald: 12,
  Lisburn: 12,
  Hillsborough: 14,
  Carrickfergus: 18,
  Antrim: 10,
  Ballyclare: 12,
  Bangor: 22,
  Comber: 18,
  Newtownards: 20,
  Larne: 22,
  Ballymena: 28,
  Downpatrick: 32,
  Newcastle: 42,
  Banbridge: 34,
  Newry: 38,
  Armagh: 36,
  Portadown: 34,
  Lurgan: 32,
  Coleraine: 48,
  Cookstown: 42,
  Omagh: 52,
  "Derry / Londonderry": 136,
  Enniskillen: 62,
  default: 20,
};

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
  const estateTier = saloonFare + AIRPORT_ESTATE_PREMIUM;

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
    case "Minibus (5–8 passengers)":
      return roundToNearestFive(estateTier * VEHICLE_MULTIPLIERS[vehicleType]);
    default:
      return saloonFare;
  }
}

function getAirportVehiclePricingMeta(
  vehicleType: (typeof VEHICLE_TYPES)[number],
): { vehicleMultiplier: number; vehicleAdjustment: number } {
  if (vehicleType === "Standard Saloon (1–4 passengers)") {
    return { vehicleMultiplier: 1, vehicleAdjustment: 0 };
  }
  if (vehicleType === "Estate Car (1–4 passengers)") {
    return { vehicleMultiplier: 1, vehicleAdjustment: AIRPORT_ESTATE_PREMIUM };
  }

  return {
    vehicleMultiplier: VEHICLE_MULTIPLIERS[vehicleType] ?? 1,
    vehicleAdjustment: AIRPORT_ESTATE_PREMIUM,
  };
}

function computeSaloonAirportOneWay(airportCode: string, basePlusSurcharge: number): number {
  // Apply the airport minimum first, then distance/area surcharges can raise the fare above it.
  const fare = applyAirportMinimumFare(airportCode, basePlusSurcharge);
  return fare % 5 === 4 ? fare : roundToNearestFive(fare);
}

/** Minimum one-way saloon airport transfer fare by airport code (the "from" price). */
const AIRPORT_MINIMUM_FARE: Record<string, number> = {
  BFS: 45,
  BHD: 35,
  DUB: 180,
  LDY: 35,
};

function applyAirportMinimumFare(airportCode: string, oneWayAmount: number): number {
  const minimum = AIRPORT_MINIMUM_FARE[airportCode];
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

/** Estate one-way fare for calibration scripts (OTS daily auto-fix). */
export function computeAirportEstateForSurcharge(
  airportCode: string,
  areaSurcharge: number,
): number {
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return 0;
  }

  const saloonOneWay = computeSaloonAirportOneWay(airportCode, airport.basePrice + areaSurcharge);
  return applyAirportVehiclePricing(saloonOneWay, "Estate Car (1–4 passengers)", airportCode);
}

/** Surcharge that places our estate fare ~£8–£10 below live OTS (for auto-calibration). */
export function findAirportSurchargeForOtsEstate(
  airportCode: string,
  otsEstate: number,
  minDiscount = OTS_UNDERCUT_MIN,
  maxDiscount = OTS_UNDERCUT_MAX,
): number | null {
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return null;
  }

  const targetDiscount = (minDiscount + maxDiscount) / 2;
  const targetEstate = roundFare(Math.round(otsEstate - targetDiscount));

  for (let surcharge = 0; surcharge <= 200; surcharge++) {
    if (computeAirportEstateForSurcharge(airportCode, surcharge) === targetEstate) {
      return surcharge;
    }
  }

  for (let surcharge = 0; surcharge <= 200; surcharge++) {
    const estate = computeAirportEstateForSurcharge(airportCode, surcharge);
    const discount = otsEstate - estate;
    if (discount >= minDiscount && discount <= maxDiscount) {
      return surcharge;
    }
  }

  for (let surcharge = 0; surcharge <= 200; surcharge++) {
    const estate = computeAirportEstateForSurcharge(airportCode, surcharge);
    const discount = otsEstate - estate;
    if (discount >= minDiscount - 2 && discount <= maxDiscount + 2) {
      return surcharge;
    }
  }

  return null;
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
): QuoteResult | null {
  const pickup = pickupAddress.trim();
  const dropoff = dropoffAddress.trim();
  if (!pickup || !dropoff) {
    return null;
  }

  const pickupArea = matchAreaFromAddress(pickup);
  const dropoffArea = matchAreaFromAddress(dropoff);

  let oneWay: number;
  let areaSurcharge: number;

  if (routeMetrics) {
    oneWay = undercutOtsEstateFare(
      calculateOtsPointToPointOneWay(
        routeMetrics.distanceKm,
        routeMetrics.durationMinutes,
        vehicleType,
      ),
    );
    areaSurcharge = Math.round(routeMetrics.distanceKm);
  } else {
    const pickupRate = getPointToPointAreaRate(pickupArea);
    const dropoffRate = getPointToPointAreaRate(dropoffArea);
    areaSurcharge = Math.max(pickupRate, dropoffRate);

    let oneWaySubtotal: number;
    if (pickupArea && dropoffArea && pickupArea === dropoffArea) {
      oneWaySubtotal = POINT_TO_POINT_BASE + Math.max(pickupRate, dropoffRate) * 0.55;
    } else {
      const maxRate = Math.max(pickupRate, dropoffRate);
      const minRate = Math.min(pickupRate, dropoffRate);
      oneWaySubtotal = POINT_TO_POINT_BASE + maxRate + minRate * 0.35;
    }

    oneWay = applyPointToPointVehiclePricing(
      undercutOtsEstateFare(oneWaySubtotal, POINT_TO_POINT_BASE - OTS_UNDERCUT_MID),
      vehicleType,
    );
  }

  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = POINT_TO_POINT_VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  const premium = applyTripPremium(oneWay, {
    ...schedule,
    returnJourney,
  });

  return {
    amount: roundFare(premium.total),
    area: dropoffArea ?? pickupArea,
    areaSurcharge,
    airportBase: routeMetrics ? OTS_ESTATE_BASE : POINT_TO_POINT_BASE,
    vehicleMultiplier,
    vehicleAdjustment,
    pickupArea,
    dropoffArea,
    premiumApplied: premium.premiumApplied,
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
  const saloonOneWay = computeSaloonAirportOneWay(
    airportCode,
    airport.basePrice + areaSurcharge,
  );
  const { vehicleMultiplier, vehicleAdjustment } = getAirportVehiclePricingMeta(vehicleType);
  const oneWayFare = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);
  const premium = applyTripPremium(oneWayFare, { ...schedule, returnJourney }, AIRPORT_TRIP_PREMIUM_RATE);

  return {
    amount: roundFare(premium.total),
    area: matchedArea,
    areaSurcharge,
    airportBase: airport.basePrice,
    vehicleMultiplier,
    vehicleAdjustment,
    premiumApplied: premium.premiumApplied,
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

  const saloonOneWay = computeSaloonAirportOneWay(airportCode, airport.basePrice);
  const oneWay = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);
  return returnJourney ? roundToNearestFive(getReturnJourneyFare(oneWay)) : oneWay;
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

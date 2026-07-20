import { AIRPORTS, AREAS, VEHICLE_TYPES } from "@/lib/data";
import {
  applyTripPremium,
  type TripSchedule,
} from "@/lib/point-to-point-premium";

type Area = (typeof AREAS)[number];

/** Area surcharges by airport — reflects realistic drive time/distance from each pickup area. */
const BFS_AREA_SURCHARGES: Partial<Record<Area, number>> & { default: number } = {
  "Belfast City Centre": 0,
  Holywood: 10,
  Newtownabbey: 12,
  Dundonald: 15,
  Lisburn: 12,
  Hillsborough: 15,
  Carrickfergus: 18,
  Antrim: 5,
  Ballyclare: 8,
  Bangor: 30,
  Comber: 25,
  Newtownards: 28,
  Larne: 22,
  Ballymena: 25,
  Downpatrick: 25,
  Newcastle: 30,
  Banbridge: 28,
  Lurgan: 28,
  Portadown: 30,
  Armagh: 32,
  Newry: 35,
  Cookstown: 50,
  Coleraine: 55,
  Omagh: 120,
  "Derry / Londonderry": 124,
  Enniskillen: 150,
  default: 35,
};

const BHD_AREA_SURCHARGES: Partial<Record<Area, number>> & { default: number } = {
  "Belfast City Centre": 0,
  Holywood: 5,
  Dundonald: 5,
  Newtownabbey: 8,
  Carrickfergus: 10,
  Comber: 15,
  Newtownards: 18,
  Bangor: 22,
  Lisburn: 12,
  Hillsborough: 12,
  Antrim: 25,
  Ballyclare: 20,
  Ballymena: 30,
  Larne: 20,
  Downpatrick: 22,
  Newcastle: 28,
  Banbridge: 25,
  Lurgan: 22,
  Portadown: 25,
  Armagh: 28,
  Newry: 30,
  Cookstown: 55,
  Coleraine: 60,
  Omagh: 130,
  "Derry / Londonderry": 134,
  Enniskillen: 165,
  default: 25,
};

const DUB_AREA_SURCHARGES: Partial<Record<Area, number>> & { default: number } = {
  "Belfast City Centre": 0,
  Holywood: 8,
  Newtownabbey: 10,
  Dundonald: 10,
  Lisburn: 10,
  Bangor: 15,
  Comber: 12,
  Newtownards: 12,
  Carrickfergus: 12,
  Antrim: 0,
  Ballymena: 20,
  Newry: 25,
  "Derry / Londonderry": 40,
  default: 18,
};

const AREA_SURCHARGES_BY_AIRPORT: Record<
  string,
  Partial<Record<Area, number>> & { default: number }
> = {
  BFS: BFS_AREA_SURCHARGES,
  BHD: BHD_AREA_SURCHARGES,
  DUB: DUB_AREA_SURCHARGES,
};

/** @deprecated Use airport-specific surcharges via getAreaSurcharge instead. */
export const AREA_SURCHARGES: Record<Area, number> = {
  "Belfast City Centre": 0,
  Lisburn: 12,
  Holywood: 10,
  Newtownabbey: 12,
  Carrickfergus: 18,
  Dundonald: 15,
  Hillsborough: 15,
  Bangor: 30,
  Antrim: 5,
  Ballyclare: 8,
  Comber: 25,
  Newtownards: 28,
  Ballymena: 25,
  Larne: 22,
  Downpatrick: 25,
  Newcastle: 30,
  Banbridge: 28,
  Newry: 35,
  Armagh: 32,
  Portadown: 30,
  Lurgan: 28,
  Coleraine: 55,
  Cookstown: 50,
  Omagh: 120,
  "Derry / Londonderry": 124,
  Enniskillen: 150,
};

const VEHICLE_MULTIPLIERS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 1,
  "Standard Saloon (1–4 passengers)": 1,
  "Executive Saloon (1–4 passengers)": 1.2,
  "Minibus (7–8 passengers)": 1.55,
};

/** Point-to-point only — estate is the baseline; saloon is cheaper. */
const POINT_TO_POINT_VEHICLE_ADJUSTMENTS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 0,
  "Standard Saloon (1–4 passengers)": -10,
  "Executive Saloon (1–4 passengers)": 0,
  "Minibus (7–8 passengers)": 0,
};

/** Estate is saloon + £10; executive and minibus scale from the estate tier. */
const AIRPORT_ESTATE_PREMIUM = 10;

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

/** Local point-to-point base fare (Belfast-area short journeys). */
const POINT_TO_POINT_BASE = 43;

/**
 * Address-to-address distance bands from Belfast — calibrated to market rates
 * (e.g. Belfast → Newcastle ≈ £75). Separate from airport transfer surcharges.
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
): number {
  const estateTier = saloonOneWay + AIRPORT_ESTATE_PREMIUM;

  switch (vehicleType) {
    case "Standard Saloon (1–4 passengers)":
      return saloonOneWay;
    case "Estate Car (1–4 passengers)":
      return estateTier;
    case "Executive Saloon (1–4 passengers)":
      return Math.max(
        AIRPORT_EXECUTIVE_MINIMUM_FARE,
        roundToNearestFive(estateTier * VEHICLE_MULTIPLIERS[vehicleType]),
      );
    case "Minibus (7–8 passengers)":
      return roundToNearestFive(estateTier * VEHICLE_MULTIPLIERS[vehicleType]);
    default:
      return saloonOneWay;
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
  const fare = applyAirportMinimumFare(airportCode, basePlusSurcharge);
  // Keep exact fares like £149; otherwise round to the nearest £5.
  return fare % 5 === 4 ? fare : roundToNearestFive(fare);
}

/** Minimum one-way airport transfer fare by airport code. */
const AIRPORT_MINIMUM_FARE: Record<string, number> = {
  BFS: 45,
  BHD: 35,
  DUB: 230,
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

function getAreaSurcharge(airportCode: string, area: Area | null): number {
  const table = AREA_SURCHARGES_BY_AIRPORT[airportCode] ?? BFS_AREA_SURCHARGES;
  if (!area) {
    return table.default;
  }
  return table[area] ?? table.default;
}

export function matchAreaFromAddress(address: string): Area | null {
  const normalised = address.toLowerCase();
  const sortedAreas = [...AREAS].sort((a, b) => b.length - a.length);

  for (const area of sortedAreas) {
    if (area === "Belfast City Centre") {
      continue;
    }

    const aliases = [area.toLowerCase()];
    if (area === "Derry / Londonderry") {
      aliases.push("derry", "londonderry", "bt47", "bt48");
    }
    if (area === "Enniskillen") {
      aliases.push("fermanagh", "county fermanagh", "bt74", "bt92", "bt93", "bt94");
    }
    if (area === "Omagh") {
      aliases.push("tyrone", "county tyrone", "bt78", "bt79");
    }
    if (area === "Antrim") {
      aliases.push("aldergrove", "belfast international", "bfs", "bt29");
    }
    if (area === "Newcastle") {
      aliases.push("newcastle, county down", "newcastle co down", "newcastle, co down");
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
): QuoteResult | null {
  const pickup = pickupAddress.trim();
  const dropoff = dropoffAddress.trim();
  if (!pickup || !dropoff) {
    return null;
  }

  const pickupArea = matchAreaFromAddress(pickup);
  const dropoffArea = matchAreaFromAddress(dropoff);
  const pickupRate = getPointToPointAreaRate(pickupArea);
  const dropoffRate = getPointToPointAreaRate(dropoffArea);

  let oneWaySubtotal: number;
  if (pickupArea && dropoffArea && pickupArea === dropoffArea) {
    oneWaySubtotal = POINT_TO_POINT_BASE + Math.max(pickupRate, dropoffRate) * 0.55;
  } else {
    const maxRate = Math.max(pickupRate, dropoffRate);
    const minRate = Math.min(pickupRate, dropoffRate);
    oneWaySubtotal = POINT_TO_POINT_BASE + maxRate + minRate * 0.35;
  }

  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = POINT_TO_POINT_VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  const oneWay = applyPointToPointVehiclePricing(oneWaySubtotal, vehicleType);
  const baseSubtotal = returnJourney ? oneWay * 2 : oneWay;
  const premium = applyTripPremium(oneWay, {
    ...schedule,
    returnJourney,
  });
  const subtotal = premium.total;

  return {
    amount: roundFare(subtotal),
    area: dropoffArea ?? pickupArea,
    areaSurcharge: Math.max(pickupRate, dropoffRate),
    airportBase: POINT_TO_POINT_BASE,
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
  return returnJourney ? roundToNearestFive(oneWay * 2) : oneWay;
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
  const oneWayFare = applyAirportVehiclePricing(saloonOneWay, vehicleType);
  const premium = applyTripPremium(oneWayFare, { ...schedule, returnJourney });

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
  const oneWay = applyAirportVehiclePricing(saloonOneWay, vehicleType);
  return returnJourney ? oneWay * 2 : oneWay;
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

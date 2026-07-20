import { AIRPORTS, AREAS, VEHICLE_TYPES } from "@/lib/data";
import {
  applyTripPremium,
  type TripSchedule,
} from "@/lib/point-to-point-premium";

type Area = (typeof AREAS)[number];

type AirportCode = "BFS" | "BHD" | "DUB";

/**
 * Distance-based surcharges for every NI pickup area and airport.
 * Fare = airport base price + surcharge, with the airport minimum as the floor.
 * Calibrated to market rates (Fonacab benchmarks where provided).
 */
const AREA_AIRPORT_SURCHARGES: Record<Area, Record<AirportCode, number>> = {
  "Belfast City Centre": { BFS: 0, BHD: 0, DUB: 50 },
  Holywood: { BFS: 10, BHD: 5, DUB: 58 },
  Newtownabbey: { BFS: 12, BHD: 8, DUB: 60 },
  Lisburn: { BFS: 12, BHD: 12, DUB: 60 },
  Dundonald: { BFS: 15, BHD: 5, DUB: 60 },
  Antrim: { BFS: 5, BHD: 25, DUB: 50 },
  Ballyclare: { BFS: 8, BHD: 20, DUB: 65 },
  Hillsborough: { BFS: 15, BHD: 12, DUB: 65 },
  Carrickfergus: { BFS: 18, BHD: 10, DUB: 62 },
  Comber: { BFS: 25, BHD: 15, DUB: 62 },
  Larne: { BFS: 22, BHD: 20, DUB: 72 },
  Bangor: { BFS: 30, BHD: 22, DUB: 65 },
  Newtownards: { BFS: 28, BHD: 18, DUB: 62 },
  Ballymena: { BFS: 25, BHD: 30, DUB: 78 },
  Downpatrick: { BFS: 25, BHD: 22, DUB: 75 },
  Banbridge: { BFS: 28, BHD: 25, DUB: 75 },
  Newcastle: { BFS: 30, BHD: 28, DUB: 80 },
  Lurgan: { BFS: 28, BHD: 22, DUB: 82 },
  Portadown: { BFS: 30, BHD: 25, DUB: 85 },
  Armagh: { BFS: 32, BHD: 28, DUB: 88 },
  Newry: { BFS: 35, BHD: 30, DUB: 40 },
  Cookstown: { BFS: 50, BHD: 55, DUB: 95 },
  Coleraine: { BFS: 55, BHD: 60, DUB: 159 },
  Omagh: { BFS: 120, BHD: 130, DUB: 115 },
  "Derry / Londonderry": { BFS: 124, BHD: 134, DUB: 105 },
  Enniskillen: { BFS: 150, BHD: 165, DUB: 175 },
};

/** Default surcharge when pickup area cannot be matched from the address. */
const DEFAULT_AREA_SURCHARGE: Record<AirportCode, number> = {
  BFS: 35,
  BHD: 25,
  DUB: 70,
};

/** @deprecated Use getAreaSurcharge instead. */
export const AREA_SURCHARGES: Record<Area, number> = Object.fromEntries(
  Object.entries(AREA_AIRPORT_SURCHARGES).map(([area, surcharges]) => [area, surcharges.BFS]),
) as Record<Area, number>;

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
    case "Minibus (7–8 passengers)":
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
      aliases.push("derry", "londonderry", "bt47", "bt48");
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
  const oneWayFare = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);
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
  const oneWay = applyAirportVehiclePricing(saloonOneWay, vehicleType, airportCode);
  return returnJourney ? oneWay * 2 : oneWay;
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

import { AIRPORTS, AREAS, VEHICLE_TYPES } from "@/lib/data";

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
  Banbridge: 28,
  Lurgan: 28,
  Portadown: 30,
  Armagh: 32,
  Newry: 35,
  Cookstown: 35,
  Coleraine: 40,
  Omagh: 50,
  "Derry / Londonderry": 55,
  Enniskillen: 60,
  default: 22,
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
  Banbridge: 25,
  Lurgan: 22,
  Portadown: 25,
  Armagh: 28,
  Newry: 30,
  Cookstown: 32,
  Coleraine: 38,
  Omagh: 45,
  "Derry / Londonderry": 50,
  Enniskillen: 55,
  default: 15,
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
  Antrim: 15,
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
  Banbridge: 28,
  Newry: 35,
  Armagh: 32,
  Portadown: 30,
  Lurgan: 28,
  Coleraine: 40,
  Cookstown: 35,
  Omagh: 50,
  "Derry / Londonderry": 55,
  Enniskillen: 60,
};

const VEHICLE_MULTIPLIERS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 1,
  "Standard Saloon (1–4 passengers)": 1,
  "Executive Saloon (1–4 passengers)": 1.2,
  "Minibus (7–8 passengers)": 1.55,
};

/** Flat one-way adjustment before rounding — estate is the baseline; saloon is cheaper. */
const VEHICLE_ADJUSTMENTS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 0,
  "Standard Saloon (1–4 passengers)": -10,
  "Executive Saloon (1–4 passengers)": 0,
  "Minibus (7–8 passengers)": 0,
};

export type QuoteResult = {
  amount: number;
  area: string | null;
  areaSurcharge: number;
  airportBase: number;
  vehicleMultiplier: number;
  vehicleAdjustment: number;
};

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
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
      aliases.push("derry", "londonderry");
    }

    if (aliases.some((alias) => normalised.includes(alias))) {
      return area;
    }
  }

  if (/\bbelfast\b/.test(normalised)) {
    return "Belfast City Centre";
  }

  return null;
}

export function calculateQuote(
  address: string,
  airportCode: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
  returnJourney = false,
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
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  const oneWaySubtotal =
    (airport.basePrice + areaSurcharge) * vehicleMultiplier + vehicleAdjustment;
  const subtotal = returnJourney ? oneWaySubtotal * 2 : oneWaySubtotal;

  return {
    amount: roundToNearestFive(subtotal),
    area: matchedArea,
    areaSurcharge,
    airportBase: airport.basePrice,
    vehicleMultiplier,
    vehicleAdjustment,
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

  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const vehicleAdjustment = VEHICLE_ADJUSTMENTS[vehicleType] ?? 0;
  const oneWay = roundToNearestFive(airport.basePrice * vehicleMultiplier + vehicleAdjustment);
  return returnJourney ? roundToNearestFive(oneWay * 2) : oneWay;
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

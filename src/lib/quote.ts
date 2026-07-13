import { AIRPORTS, AREAS, VEHICLE_TYPES } from "@/lib/data";

export const AREA_SURCHARGES: Record<(typeof AREAS)[number], number> = {
  "Belfast City Centre": 0,
  Lisburn: 5,
  Holywood: 5,
  Newtownabbey: 5,
  Carrickfergus: 5,
  Dundonald: 5,
  Hillsborough: 5,
  Bangor: 10,
  Antrim: 10,
  Ballyclare: 10,
  Comber: 10,
  Newtownards: 10,
  Ballymena: 15,
  Larne: 15,
  Downpatrick: 15,
  Banbridge: 15,
  Newry: 15,
  Armagh: 15,
  Portadown: 15,
  Lurgan: 15,
  Coleraine: 25,
  Cookstown: 25,
  Omagh: 25,
  "Derry / Londonderry": 35,
  Enniskillen: 35,
};

const DEFAULT_AREA_SURCHARGE = 10;

const VEHICLE_MULTIPLIERS: Record<(typeof VEHICLE_TYPES)[number], number> = {
  "Estate Car (1–4 passengers)": 1,
  "Standard Saloon (1–4 passengers)": 1,
  "Executive Saloon (1–4 passengers)": 1.2,
  "Minibus (7–8 passengers)": 1.55,
};

export type QuoteResult = {
  amount: number;
  area: string | null;
  areaSurcharge: number;
  airportBase: number;
  vehicleMultiplier: number;
};

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

export function matchAreaFromAddress(address: string): (typeof AREAS)[number] | null {
  const normalised = address.toLowerCase();

  if (/\bbelfast\b/.test(normalised)) {
    return "Belfast City Centre";
  }

  const sortedAreas = [...AREAS].sort((a, b) => b.length - a.length);

  for (const area of sortedAreas) {
    const aliases = [area.toLowerCase()];
    if (area === "Derry / Londonderry") {
      aliases.push("derry", "londonderry");
    }

    if (aliases.some((alias) => normalised.includes(alias))) {
      return area;
    }
  }

  return null;
}

export function calculateQuote(
  address: string,
  airportCode: string,
  vehicleType: (typeof VEHICLE_TYPES)[number],
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
  const areaSurcharge = matchedArea
    ? AREA_SURCHARGES[matchedArea]
    : DEFAULT_AREA_SURCHARGE;
  const vehicleMultiplier = VEHICLE_MULTIPLIERS[vehicleType] ?? 1;
  const subtotal = (airport.basePrice + areaSurcharge) * vehicleMultiplier;

  return {
    amount: roundToNearestFive(subtotal),
    area: matchedArea,
    areaSurcharge,
    airportBase: airport.basePrice,
    vehicleMultiplier,
  };
}

export function formatQuote(amount: number): string {
  return `£${amount}`;
}

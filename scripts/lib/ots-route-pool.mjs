import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Sample addresses per NI pickup area (airport transfer quotes). */
export const AREA_ADDRESSES = {
  "Belfast City Centre": [
    "12 Donegall Square, Belfast, BT1 5GS",
    "2 Cliftonville Road, Belfast, BT14 6AB",
    "10 Castlereagh Road, Belfast, BT5 6AB",
  ],
  Holywood: ["22 High Street, Holywood, BT18 9AB", "8 Holywood Road, Belfast, BT4 1NT"],
  Newtownabbey: ["5 Antrim Road, Newtownabbey, BT36 7QX"],
  Lisburn: ["10 Market Square, Lisburn, BT28 1AG", "45 Lisburn Road, Belfast, BT9 7AB"],
  Dundonald: ["12 Dundonald Road, Dundonald, BT16 1AA"],
  Antrim: ["17 High Street, Antrim, BT41 4BB"],
  Ballyclare: ["1 The Square, Ballyclare, BT39 9BB"],
  Hillsborough: ["9 Ballynahinch Road, Hillsborough, BT26 6AB"],
  Carrickfergus: ["10 Marine Highway, Carrickfergus, BT38 8AB"],
  Comber: ["9 The Square, Comber, BT23 5DT"],
  Larne: ["12 Point Road, Larne, BT40 1AB", "14 Main Street, Larne, BT40 1AB"],
  Bangor: ["12 Main Street, Bangor, BT20 5AB", "18 High Street, Bangor, BT20 5BE"],
  Newtownards: ["9 Church Street, Newtownards, BT23 4AB"],
  Ballymena: ["7 Castle Street, Ballymena, BT42 3AB"],
  Downpatrick: ["11 Main Street, Downpatrick, BT30 6AB"],
  Banbridge: ["3 Newry Street, Banbridge, BT32 3AB"],
  Newcastle: ["4 Central Promenade, Newcastle, BT33 0AB"],
  Lurgan: ["13 Market Street, Lurgan, BT66 6AB"],
  Portadown: ["16 William Street, Portadown, BT62 3AB"],
  Armagh: ["2 English Street, Armagh, BT61 7AB"],
  Newry: ["5 Hill Street, Newry, BT34 1AB"],
  Cookstown: ["8 Burn Road, Cookstown, BT80 8AB"],
  Coleraine: ["6 The Diamond, Coleraine, BT52 1AB"],
  Omagh: ["4 Market Street, Omagh, BT78 1AB"],
  "Derry / Londonderry": ["22 Strand Road, Derry, BT48 7AB"],
  Enniskillen: ["10 East Bridge Street, Enniskillen, BT74 7AB"],
};

/** LDY is limited to greater Belfast — subset of areas above. */
export const LDY_SERVICE_AREAS = [
  "Belfast City Centre",
  "Holywood",
  "Newtownabbey",
  "Lisburn",
  "Dundonald",
  "Antrim",
  "Ballyclare",
  "Hillsborough",
  "Carrickfergus",
  "Comber",
  "Larne",
  "Bangor",
  "Newtownards",
  "Ballymena",
];

export const AIRPORT_LOCATIONS = {
  BFS: "Belfast International Airport, Aldergrove, BT29 4AB",
  BHD: "George Best Belfast City Airport, Belfast, BT3 9JH",
  DUB: "Dublin Airport, Co. Dublin, K67 X9H6, Ireland",
  LDY: "City of Derry Airport, BT47 3GY",
};

function loadPointToPointRoutes() {
  const path = join(__dirname, "..", "ots-a2a-calibration-50.json");
  const rows = JSON.parse(readFileSync(path, "utf8"));
  return rows.map((row, index) => ({
    id: `p2p-${index + 1}`,
    kind: "point-to-point",
    pickup: row.pickup,
    dropoff: row.dropoff,
    distanceKm: row.km,
    durationMinutes: row.mins,
  }));
}

function buildAirportRoutes() {
  const routes = [];

  for (const [area, addresses] of Object.entries(AREA_ADDRESSES)) {
    for (const address of addresses) {
      for (const [airportCode, airportAddress] of Object.entries(AIRPORT_LOCATIONS)) {
        if (airportCode === "LDY" && !LDY_SERVICE_AREAS.includes(area)) {
          continue;
        }

        routes.push({
          id: `${airportCode}-to-${area.replace(/\W+/g, "-").toLowerCase()}-${address.slice(0, 12)}`,
          kind: "airport",
          airportCode,
          direction: "to-airport",
          pickup: address,
          dropoff: airportAddress,
          quoteAddress: address,
          area,
        });

        routes.push({
          id: `${airportCode}-from-${area.replace(/\W+/g, "-").toLowerCase()}-${address.slice(0, 12)}`,
          kind: "airport",
          airportCode,
          direction: "from-airport",
          pickup: airportAddress,
          dropoff: address,
          quoteAddress: address,
          area,
        });
      }
    }
  }

  return routes;
}

/** Full pool of routes we can sample against OTS (300+ combinations). */
export function buildRoutePool() {
  return [...buildAirportRoutes(), ...loadPointToPointRoutes()];
}

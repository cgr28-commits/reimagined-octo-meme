/**
 * Local route report for the profitability layer.
 * Uses live OSRM. Does not save MPG and does not deploy.
 * Run: npx tsx scripts/profitability-route-report.ts
 */

import { calculatePointToPointQuote, calculateQuote, type QuotePricingConfig } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { fetchOsrmTripRouteMetrics } from "../src/lib/trip-route";
import { universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";
import { roundGbp } from "../shared/gbp";
import { OPERATING_BASE } from "../workers/addresses/src/operating-base";

const PUBLIC_PRICING_URL = "https://reimagined-octo-meme.cgr28.workers.dev/pricing/public";

type Point = { lat: number; lng: number; label: string };

const AIRPORTS: Record<string, Point> = {
  BFS: { lat: 54.6575, lng: -6.2158, label: "Belfast International Airport" },
  BHD: { lat: 54.6181, lng: -5.8724, label: "George Best Belfast City Airport" },
  DUB: { lat: 53.4213, lng: -6.2701, label: "Dublin Airport" },
};

async function geocode(query: string): Promise<Point> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    headers: { "User-Agent": "MyAirportTaxiNI-dev/1.0 (pricing research)" },
  });
  if (!response.ok) throw new Error(`geocode ${response.status} ${query}`);
  const rows = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const row = rows[0];
  if (!row) throw new Error(`no geocode for ${query}`);
  return { lat: Number(row.lat), lng: Number(row.lon), label: query };
}

async function leg(from: Point, to: Point) {
  const metrics = await fetchOsrmTripRouteMetrics(from.lat, from.lng, to.lat, to.lng);
  if (!metrics) throw new Error(`no route ${from.label} → ${to.label}`);
  return metrics;
}

function money(amount: number): string {
  const rounded = roundGbp(amount);
  return Number.isInteger(rounded) ? `£${rounded}` : `£${rounded.toFixed(2)}`;
}

async function loadLivePricing(): Promise<QuotePricingConfig> {
  const response = await fetch(PUBLIC_PRICING_URL, {
    headers: {
      Accept: "application/json",
      Origin: "https://www.myairporttaxini.co.uk",
      "User-Agent": "MyAirportTaxiNI-dev/1.0 (pricing research)",
    },
  });
  if (!response.ok) throw new Error(`public pricing ${response.status}`);
  const body = (await response.json()) as { config?: QuotePricingConfig };
  if (!body.config) throw new Error("public pricing missing config");
  return body.config;
}

async function reportOne(input: {
  name: string;
  pickup: Point;
  dropoff: Point;
  airportCode?: string;
  fromAirport?: boolean;
  when?: { date: string; time: string };
  returnJourney?: boolean;
  pricing: QuotePricingConfig;
}) {
  const passenger = await leg(input.pickup, input.dropoff);
  const toPickup = await leg(
    { ...OPERATING_BASE, label: "base" },
    input.pickup,
  );
  const toBase = await leg(input.dropoff, { ...OPERATING_BASE, label: "base" });
  const operationalKm = toPickup.distanceKm + passenger.distanceKm + toBase.distanceKm;
  const operationalMinutes = toPickup.durationMinutes + passenger.durationMinutes + toBase.durationMinutes;
  const passengerMiles = universalDrivingMilesFromKm(passenger.distanceKm);
  const schedule = input.when
    ? { outboundDate: input.when.date, outboundTime: input.when.time, returnJourney: Boolean(input.returnJourney) }
    : {};
  const quote = input.airportCode
    ? calculateQuote(
        input.fromAirport ? input.dropoff.label : input.pickup.label,
        input.airportCode,
        SALOON_VEHICLE,
        Boolean(input.returnJourney),
        schedule,
        passenger,
        Boolean(input.fromAirport),
        input.pricing,
      )
    : calculatePointToPointQuote(
        input.pickup.label,
        input.dropoff.label,
        SALOON_VEHICLE,
        Boolean(input.returnJourney),
        schedule,
        passenger,
        null,
        undefined,
        input.pricing,
      );
  if (!quote) throw new Error(`no fare ${input.name}`);
  const wear = universalDrivingMilesFromKm(operationalKm) * 0.1;
  const timeTarget = (operationalMinutes / 60) * 40;
  console.log(`\n${input.name}`);
  console.log(`  Passenger: ${passengerMiles.toFixed(1)} mi, ${Math.round(passenger.durationMinutes)} min`);
  console.log(
    `  Operational: ${universalDrivingMilesFromKm(operationalKm).toFixed(1)} mi, ${Math.round(operationalMinutes)} min`,
  );
  console.log(`  Existing Saloon fare: ${money(quote.amount)}`);
  console.log(`  Journey fare: ${money(quote.journeyFareGbp ?? quote.amount)}`);
  console.log(`  Night/weekend: ${money(quote.nightWeekendSurchargeGbp ?? 0)}`);
  console.log(`  Airport fixed: ${money(quote.airportFixedCostsGbp ?? 0)}`);
  console.log(`  Profitability floor: not calculated — vehicle MPG is not set`);
  console.log(`  Protected fare: ${money(quote.amount)} (rule NOT ACTIVE)`);
  console.log(
    `  Ingredients waiting for MPG: wear ${money(wear)}, target time ${money(timeTarget)} (fuel excluded)`,
  );
}

async function main() {
  const queries = [
    ["Carrickfergus", "Carrickfergus"],
    ["Newtownards", "Conway Square, Newtownards"],
    ["Antrim", "Dublin Road, Antrim"],
    ["City Hall", "Belfast City Hall"],
    ["Bangor", "Bangor, County Down"],
    ["Lisburn", "Lisburn, County Antrim"],
    ["Ballymena", "Ballymena, County Antrim"],
    ["Downpatrick", "Downpatrick, County Down"],
    ["Randalstown", "Randalstown, County Antrim"],
    ["Newtownabbey", "Newtownabbey, County Antrim"],
    ["Derry", "Strand Road, Derry"],
    ["Portrush", "Portrush, County Antrim"],
  ] as const;
  const places = new Map<string, Point>();
  for (const [key, query] of queries) {
    places.set(key, await geocode(query));
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  const pricing = await loadLivePricing();
  const day = { date: "2026-09-30", time: "10:00" };
  const night = { date: "2026-09-30", time: "05:00" };
  const cases = [
    { name: "Carrickfergus → BFS at 05:00", pickup: places.get("Carrickfergus")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: night },
    { name: "Carrickfergus → BFS at 10:00", pickup: places.get("Carrickfergus")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Newtownards → BFS", pickup: places.get("Newtownards")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Dublin Road, Antrim → BFS one-way", pickup: places.get("Antrim")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Dublin Road, Antrim → BFS return", pickup: places.get("Antrim")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day, returnJourney: true },
    { name: "Belfast City Hall → BFS", pickup: places.get("City Hall")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Belfast City Hall → BHD", pickup: places.get("City Hall")!, dropoff: AIRPORTS.BHD, airportCode: "BHD", when: day },
    { name: "Newtownabbey → BFS", pickup: places.get("Newtownabbey")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Bangor → BFS", pickup: places.get("Bangor")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Lisburn → BFS", pickup: places.get("Lisburn")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Ballymena → BFS", pickup: places.get("Ballymena")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Downpatrick → BFS", pickup: places.get("Downpatrick")!, dropoff: AIRPORTS.BFS, airportCode: "BFS", when: day },
    { name: "Randalstown → Dublin Airport", pickup: places.get("Randalstown")!, dropoff: AIRPORTS.DUB, airportCode: "DUB", when: day },
    { name: "Belfast → Dublin Airport", pickup: places.get("City Hall")!, dropoff: AIRPORTS.DUB, airportCode: "DUB", when: day },
    { name: "BFS → Strand Road, Derry", pickup: AIRPORTS.BFS, dropoff: places.get("Derry")!, airportCode: "BFS", fromAirport: true, when: day },
    { name: "Belfast → Derry", pickup: places.get("City Hall")!, dropoff: places.get("Derry")!, when: day },
    { name: "BFS → Portrush", pickup: AIRPORTS.BFS, dropoff: places.get("Portrush")!, airportCode: "BFS", fromAirport: true, when: day },
  ];

  console.log("Profitability protection: NOT ACTIVE (vehicle MPG blank).");
  console.log("Saloon fares use the live saved curve. Estate code default is now +£10; live saved uplift is unchanged until deploy.");
  for (const item of cases) {
    await reportOne({ ...item, pricing });
  }
}

void main();

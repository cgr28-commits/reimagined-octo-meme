/**
 * Route regression for the approved production preset (47 MPG, £38 minimum).
 * Reads the live Saloon curve. Does not save settings and does not deploy.
 * Run: npx tsx scripts/check-approved-profitability-routes.ts
 */

import assert from "node:assert/strict";
import { roundGbp, formatGbpAmount } from "../shared/gbp";
import { normalizeOwnerPricingSettings, type OwnerPricingSettings } from "../shared/owner-pricing-config";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { calculateUniversalEstateJourneyFareGbp, universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";
import { applyTripPremium } from "../src/lib/point-to-point-premium";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { fetchOsrmTripRouteMetrics } from "../src/lib/trip-route";
import { buildOwnerProfitabilityReport } from "../workers/addresses/src/profitability";

const WORKER = "https://reimagined-octo-meme.cgr28.workers.dev";
const ORIGIN = "https://www.myairporttaxini.co.uk";

type Point = { lat: number; lng: number; label: string };

const AIRPORTS: Record<string, Point> = Object.fromEntries(
  SERVED_AIRPORTS.map((airport) => [airport.code, { lat: airport.lat, lng: airport.lng, label: airport.name }]),
);

type LiveQuote = {
  amount: number;
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  nightWeekendSurchargeGbp: number;
  miles: number;
  minutes: number;
};

type RouteCase = {
  name: string;
  pickupQuery: string;
  dropoffQuery: string;
  pickupAirport?: string;
  dropoffAirport?: string;
  fromAirport: boolean;
  returnJourney: boolean;
  airportCode?: string;
};

const CASES: RouteCase[] = [
  { name: "Carrickfergus → BFS", pickupQuery: "Carrickfergus", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Newtownards → BFS", pickupQuery: "Conway Square, Newtownards", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Dublin Road, Antrim → BFS", pickupQuery: "Dublin Road, Antrim", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Dublin Road, Antrim → BFS RETURN", pickupQuery: "Dublin Road, Antrim", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: true },
  { name: "Belfast City Hall → BFS", pickupQuery: "Belfast City Hall", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Belfast City Hall → BHD", pickupQuery: "Belfast City Hall", dropoffQuery: "George Best Belfast City Airport", dropoffAirport: "BHD", fromAirport: false, airportCode: "BHD", returnJourney: false },
  { name: "Newtownabbey → BFS", pickupQuery: "Newtownabbey", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Bangor → BFS", pickupQuery: "Bangor, County Down", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Lisburn → BFS", pickupQuery: "Lisburn, County Antrim", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Ballymena → BFS", pickupQuery: "Ballymena", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "Downpatrick → BFS", pickupQuery: "Downpatrick", dropoffQuery: "Belfast International Airport", dropoffAirport: "BFS", fromAirport: false, airportCode: "BFS", returnJourney: false },
  { name: "BFS → Strand Road, Derry", pickupQuery: "Belfast International Airport", dropoffQuery: "Strand Road, Derry", pickupAirport: "BFS", fromAirport: true, airportCode: "BFS", returnJourney: false },
  { name: "Belfast City Hall → Strand Road, Derry", pickupQuery: "Belfast City Hall", dropoffQuery: "Strand Road, Derry", fromAirport: false, returnJourney: false },
  { name: "BFS → Portrush", pickupQuery: "Belfast International Airport", dropoffQuery: "Portrush", pickupAirport: "BFS", fromAirport: true, airportCode: "BFS", returnJourney: false },
  { name: "Randalstown → Dublin Airport", pickupQuery: "Randalstown", dropoffQuery: "Dublin Airport", dropoffAirport: "DUB", fromAirport: false, airportCode: "DUB", returnJourney: false },
  { name: "Belfast City Hall → Dublin Airport", pickupQuery: "Belfast City Hall", dropoffQuery: "Dublin Airport", dropoffAirport: "DUB", fromAirport: false, airportCode: "DUB", returnJourney: false },
];

async function workerGet(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", Origin: ORIGIN, "User-Agent": "Mozilla/5.0 MyAirportTaxiNI-dev" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function loadLivePricing(): Promise<OwnerPricingSettings> {
  const body = (await workerGet(`${WORKER}/pricing/public`)) as { config?: OwnerPricingSettings };
  if (!body.config) throw new Error("public pricing missing config");
  return normalizeOwnerPricingSettings(body.config);
}

async function liveQuote(item: RouteCase): Promise<LiveQuote> {
  const response = await fetch(`${WORKER}/quote/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "User-Agent": "Mozilla/5.0 MyAirportTaxiNI-dev",
    },
    body: JSON.stringify({
      pickupAddress: item.pickupQuery,
      dropoffAddress: item.dropoffQuery,
      fromAirport: item.fromAirport,
      returnJourney: item.returnJourney,
      outboundDate: "2026-10-01",
      outboundTime: "10:00",
      returnDate: item.returnJourney ? "2026-10-02" : undefined,
      returnTime: item.returnJourney ? "10:00" : undefined,
      passengers: 2,
      suitcases: 1,
      vehicleChoice: "Saloon",
      airportCode: item.airportCode ?? null,
    }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    amount?: number;
    journeyFareGbp?: number;
    airportFixedCostsGbp?: number;
    nightWeekendSurchargeGbp?: number;
    reason?: string;
    diagnostics?: { routeMiles?: number; routeDurationMinutes?: number };
  };
  if (!response.ok || !payload.ok || typeof payload.amount !== "number") {
    throw new Error(`quote failed ${item.name}: ${payload.reason ?? response.status}`);
  }
  return {
    amount: payload.amount,
    journeyFareGbp: payload.journeyFareGbp ?? payload.amount,
    airportFixedCostsGbp: payload.airportFixedCostsGbp ?? 0,
    nightWeekendSurchargeGbp: payload.nightWeekendSurchargeGbp ?? 0,
    miles: payload.diagnostics?.routeMiles ?? 0,
    minutes: payload.diagnostics?.routeDurationMinutes ?? 0,
  };
}

async function candidatePoints(query: string): Promise<Point[]> {
  const points: Point[] = [];
  try {
    const url = new URL(`${WORKER}/addresses`);
    url.searchParams.set("forwardGeocode", query);
    const body = (await workerGet(url.toString())) as { lat?: number; lng?: number };
    if (typeof body.lat === "number" && typeof body.lng === "number") {
      points.push({ lat: body.lat, lng: body.lng, label: query });
    }
  } catch {
    // Suggestions below.
  }
  try {
    const url = new URL(`${WORKER}/addresses`);
    url.searchParams.set("q", query);
    const body = (await workerGet(url.toString())) as { suggestions?: Array<{ id?: string; label?: string }> };
    for (const suggestion of (body.suggestions ?? []).slice(0, 4)) {
      if (!suggestion.id) continue;
      const detailsUrl = new URL(`${WORKER}/addresses`);
      detailsUrl.searchParams.set("id", suggestion.id);
      try {
        const details = (await workerGet(detailsUrl.toString())) as { lat?: number; lng?: number };
        if (typeof details.lat === "number" && typeof details.lng === "number") {
          points.push({ lat: details.lat, lng: details.lng, label: suggestion.label || query });
        }
      } catch {
        // Next suggestion.
      }
    }
  } catch {
    // No suggestions.
  }
  const unique = new Map<string, Point>();
  for (const point of points) unique.set(`${point.lat.toFixed(5)},${point.lng.toFixed(5)}`, point);
  return [...unique.values()];
}

async function osrm(from: Point, to: Point) {
  const metrics = await fetchOsrmTripRouteMetrics(from.lat, from.lng, to.lat, to.lng);
  if (!metrics || metrics.source !== "osrm") throw new Error(`no osrm ${from.label} → ${to.label}`);
  return metrics;
}

async function pointFor(query: string, other: Point, targetMiles: number, direction: "to-other" | "from-other"): Promise<Point> {
  const candidates = await candidatePoints(query);
  if (candidates.length === 0) throw new Error(`no coordinates for ${query}`);
  let best = candidates[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const metrics = direction === "to-other" ? await osrm(candidate, other) : await osrm(other, candidate);
    const miles = Math.round(universalDrivingMilesFromKm(metrics.distanceKm) * 10) / 10;
    const gap = Math.abs(miles - targetMiles);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
    if (gap <= 0.15) break;
  }
  return best;
}

function money(amount: number): string {
  return formatGbpAmount(amount);
}

function estatePrice(outboundProtected: number, returnProtected: number | null, airportFixed: number, returnJourney: boolean, pricing: OwnerPricingSettings): number {
  const outbound = calculateUniversalEstateJourneyFareGbp(outboundProtected, pricing.estate.upliftGbp);
  const returning = returnProtected == null ? null : calculateUniversalEstateJourneyFareGbp(returnProtected, pricing.estate.upliftGbp);
  const premium = applyTripPremium(
    outbound,
    {
      outboundDate: "2026-10-01",
      outboundTime: "10:00",
      returnDate: returnJourney ? "2026-10-02" : undefined,
      returnTime: returnJourney ? "10:00" : undefined,
      returnJourney,
    },
    undefined,
    { pricing, returnOneWayFare: returning ?? undefined },
  );
  return roundGbp(roundGbp(premium.total) + airportFixed);
}

async function main() {
  const pricing = await loadLivePricing();
  assert.equal(pricing.night.enabled, false, "night pricing must stay off");
  assert.equal(pricing.weekend.enabled, false, "weekend pricing must stay off");
  assert.equal(pricing.returnDiscount.rate, 0.05);
  const profitability = approvedProductionProfitabilitySettings();
  assert.equal(profitability.vehicleMpg, 47);
  assert.equal(profitability.minimumSaloonOneWayGbp, 38);
  const priced = { ...pricing, night: { ...pricing.night, enabled: false }, weekend: { ...pricing.weekend, enabled: false }, profitability };

  console.log("APPROVED PRESET TEST — not saved, not deployed");
  console.log(`MPG ${profitability.vehicleMpg} · minimum £${profitability.minimumSaloonOneWayGbp} · diesel £${profitability.dieselPricePerLitreGbp} · wear £${profitability.wearAllowancePerMileGbp} · target £${profitability.targetHourlyEarningsGbp}/hour`);
  console.log(`Live curve version ${pricing.version}. Night ${pricing.night.enabled}. Weekend ${pricing.weekend.enabled}. Estate code uplift £6.`);

  for (const item of CASES) {
    const live = await liveQuote(item);
    let pickup: Point;
    let dropoff: Point;
    if (item.pickupAirport && item.dropoffAirport) {
      pickup = AIRPORTS[item.pickupAirport];
      dropoff = AIRPORTS[item.dropoffAirport];
    } else if (item.dropoffAirport) {
      dropoff = AIRPORTS[item.dropoffAirport];
      pickup = await pointFor(item.pickupQuery, dropoff, live.miles, "to-other");
    } else if (item.pickupAirport) {
      pickup = AIRPORTS[item.pickupAirport];
      dropoff = await pointFor(item.dropoffQuery, pickup, live.miles, "from-other");
    } else {
      const pickupCandidates = await candidatePoints(item.pickupQuery);
      if (pickupCandidates.length === 0) throw new Error(`no pickup for ${item.name}`);
      pickup = pickupCandidates[0];
      dropoff = await pointFor(item.dropoffQuery, pickup, live.miles, "from-other");
    }
    const passenger = await osrm(pickup, dropoff);
    const report = await buildOwnerProfitabilityReport({
      pricing: priced,
      vehicleType: SALOON_VEHICLE,
      routeMetrics: passenger,
      pickup,
      dropoff,
      returnJourney: item.returnJourney,
      schedule: {
        outboundDate: "2026-10-01",
        outboundTime: "10:00",
        returnDate: item.returnJourney ? "2026-10-02" : undefined,
        returnTime: item.returnJourney ? "10:00" : undefined,
        returnJourney: item.returnJourney,
      },
      existing: {
        amountGbp: live.amount,
        journeyFareGbp: live.journeyFareGbp,
        airportFixedCostsGbp: live.airportFixedCostsGbp,
        nightWeekendSurchargeGbp: live.nightWeekendSurchargeGbp,
      },
      expressFeeGbp: 0,
    });
    const out = report.outbound;
    const ret = report.returnLeg;
    assert.equal(report.protectionActive, true, item.name);
    assert.ok(out.protectedSaloonFareGbp != null, item.name);
    const mileGap = Math.abs(out.passengerMiles - live.miles);
    assert.ok(mileGap <= 0.15, `${item.name} pin gap ${mileGap}`);
    assert.ok(report.finalCustomerPriceGbp + 0.001 >= live.amount, `${item.name} proposed below current`);
    const estate = estatePrice(out.protectedSaloonFareGbp!, ret?.protectedSaloonFareGbp ?? null, report.airportFixedCostsGbp, item.returnJourney, pricing);
    if (item.returnJourney && ret?.protectedSaloonFareGbp != null) {
      const once = roundGbp((out.protectedSaloonFareGbp! + ret.protectedSaloonFareGbp) * 0.95);
      assert.equal(report.journeyFareGbp, once, "return discount must apply once");
      assert.ok(report.journeyFareGbp < out.protectedSaloonFareGbp! + ret.protectedSaloonFareGbp);
    }
    if (item.name === "Belfast City Hall → BHD") {
      assert.equal(out.existingCurveFareGbp, 31);
      assert.equal(out.rule, "MINIMUM FARE");
      assert.equal(out.protectedSaloonFareGbp, 38);
      assert.equal(report.finalCustomerPriceGbp, 38);
    }
    const rule = out.rule === "MINIMUM FARE" ? "£38 MINIMUM" : out.rule;
    const returnRule = ret ? ` / return ${ret.rule === "MINIMUM FARE" ? "£38 MINIMUM" : ret.rule}` : "";
    const change = roundGbp(report.finalCustomerPriceGbp - live.amount);
    console.log(`\n${item.name}`);
    console.log(`CURRENT ${money(live.amount)} → FINAL ${money(report.finalCustomerPriceGbp)} → CHANGE ${change === 0 ? "£0" : `${change > 0 ? "+" : "−"}${money(Math.abs(change))}`}`);
    console.log(`Passenger ${out.passengerMiles} mi / ${out.passengerMinutes} min`);
    console.log(`Operational ${out.operationalMiles} mi / ${out.operationalMinutes} min${ret ? `; return leg ${ret.operationalMiles} mi / ${ret.operationalMinutes} min` : ""}`);
    console.log(`Fuel ${money(out.fuelCostGbp ?? 0)}${ret ? ` + ${money(ret.fuelCostGbp ?? 0)}` : ""} · Wear ${money(out.wearCostGbp ?? 0)}${ret ? ` + ${money(ret.wearCostGbp ?? 0)}` : ""} · Direct ${money(report.directCostsGbp ?? 0)}`);
    console.log(`Floor ${money(out.profitabilityFloorGbp ?? 0)}${ret ? ` / return ${money(ret.profitabilityFloorGbp ?? 0)}` : ""} · Protected ${money(out.protectedSaloonFareGbp ?? 0)}${ret ? ` / return ${money(ret.protectedSaloonFareGbp ?? 0)} before 5%` : ""}`);
    console.log(`Rule ${rule}${returnRule}`);
    console.log(`Net ${money(report.estimatedRemainingAfterDirectCostsGbp ?? 0)} · £/hour ${money(report.estimatedEarningsPerHourGbp ?? 0)}`);
    console.log(`Estate ${money(estate)}`);
    if (item.returnJourney && ret?.protectedSaloonFareGbp != null) {
      console.log(`Before 5%: £${out.protectedSaloonFareGbp} + £${ret.protectedSaloonFareGbp} = £${out.protectedSaloonFareGbp! + ret.protectedSaloonFareGbp}; after 5% ${money(report.journeyFareGbp)}`);
    }
  }
  console.log("\nApproved route regression passed.");
}

void main();

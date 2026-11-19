/**
 * Dublin pricing consistency — regression for the two live quotes reported on
 * 16 Nov 2026 plus direction / distance / return / Estate / access / surcharge
 * cases, Dublin tolls on address-to-address jobs, the owner-only breakdown and
 * website quote ↔ checkout parity.
 *
 * Uses a snapshot of the LIVE pricing settings (public config v295, read
 * 16 Nov 2026) and the live route metrics the Worker returned for each trip.
 * Drive-to-pickup charges are passed as the Worker computed them live
 * (owner-only settings are not public).
 *
 * Run: npx tsx scripts/check-dublin-pricing-consistency.ts
 */
import assert from "node:assert/strict";
import {
  defaultOwnerPricingSettings,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { calculateAuthoritativeWebsiteQuote, type QuoteServiceInput } from "../src/lib/quote-service";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { rawUniversalSaloonJourneyFareGbp } from "../shared/universal-distance-pricing";
import { roundCustomerPayableGbp } from "../shared/gbp";
import { eventFareShareLabel } from "../shared/event-fare-share";
import {
  portTunnelCrossingEur,
  resolveDublinTollAllowance,
  type DublinTollAllowance,
} from "../shared/dublin-tolls";
import { buildOwnerFareBreakdown, ownerFareBreakdownLines } from "../src/lib/owner-fare-breakdown";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const ESTATE = "Estate Car (1–4 passengers)" as const;

/** Live owner pricing (public config v295, 15 Nov 2026 21:55). */
function livePricing(overrides: (s: OwnerPricingSettings) => void = () => {}): OwnerPricingSettings {
  const s = defaultOwnerPricingSettings();
  s.bfsMinimumSaloonFareGbp = 38;
  s.bhdMinimumSaloonFareGbp = 25;
  s.postcodePricingEnabled = false;
  s.saloonFormula = { enabled: false, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
  s.saloon = {
    ...s.saloon,
    minimumFareGbp: 30,
    floorMiles: 4,
    knots: [
      [4, 30], [6, 30], [8, 30], [10, 35], [12, 38], [15, 60], [20, 68], [25, 78], [30, 89],
      [35, 99], [40, 110], [50, 132], [60, 162], [70, 188], [80, 208], [90, 240], [100, 249],
      [125, 290], [150, 320], [200, 410], [250, 500], [300, 590],
    ].map(([miles, fareGbp]) => ({ miles, fareGbp })),
  };
  s.estate = { ...s.estate, upliftGbp: 11 };
  s.returnDiscount = { rate: 0.05 };
  s.dublinAirportFareAdjustment = { rate: 0 };
  s.evening = { ...s.evening, enabled: false, surchargeRate: 0.05, startMinutes: 1020, endMinutes: 1320 };
  s.christmas = { ...s.christmas, enabled: true, surchargeRate: 0.18, startMonthDay: "12-18", endMonthDay: "01-01" };
  s.night = { ...s.night, enabled: true, surchargeRate: 0.02, startMinutes: 1320, endMinutes: 360 };
  s.weekend = { ...s.weekend, enabled: false, surchargeRate: 0.1, days: [0, 6] };
  overrides(s);
  return s;
}

const KM = (miles: number) => miles / 0.621371;
const CROWNE = "Crowne Plaza Belfast, 117 Milltown Road, BT8 7XP";
const CROWNE_PT = { lat: 54.5545, lng: -5.9452 };
const GRAFTON = "The Grafton Hotel, 32 Stephen Street Lower, Dublin 2";
const GRAFTON_PT = { lat: 53.3415, lng: -6.2645 };
const DUB = "Dublin Airport (DUB), Dublin, Ireland";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function quote(input: Partial<QuoteServiceInput> & Pick<QuoteServiceInput, "pickupAddress">) {
  const r = calculateAuthoritativeWebsiteQuote({
    returnJourney: false,
    passengers: 1,
    suitcases: 2,
    vehicleType: SALOON,
    pricing: livePricing(),
    ownerMode: true,
    enforceAirportPickupServiceArea: false,
    ...input,
  } as QuoteServiceInput);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

function checkoutAmount(r: ReturnType<typeof quote>) {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: r.journeyFareGbp ?? 0,
    airportFixedCostsGbp: r.airportFixedCostsGbp ?? 0,
    dublinTollsGbp: r.dublinTollsGbp ?? 0,
    nightWeekendSurchargeGbp: r.nightWeekendSurchargeGbp ?? 0,
    returnJourney: r.returnJourney,
  });
  return resolveSumUpChargeAmountGbp(breakdown.finalAmountPayableGbp, breakdown.finalAmountPayableGbp);
}

const Q1_METRICS = { distanceKm: 155.16, durationMinutes: 110 };
const Q2_METRICS = { distanceKm: 163.8, durationMinutes: 121 };
const q2Tolls = (date = "2027-04-18", time = "10:00", extra: Partial<Parameters<typeof resolveDublinTollAllowance>[0]> = {}) =>
  resolveDublinTollAllowance({
    pickup: CROWNE_PT, dropoff: GRAFTON_PT, pickupLabel: CROWNE, dropoffLabel: GRAFTON,
    durationMinutes: Q2_METRICS.durationMinutes, outboundDate: date, outboundTime: time, ...extra,
  });

// ── 1. Reproduce both live quotes ─────────────────────────────────────────
check("Quote 1: Dublin Airport → Crowne Plaza = £263 (246 mileage + 8 drive + 9 DUB parking/M1)", () => {
  const r = quote({
    airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE,
    outboundDate: "2027-04-15", outboundTime: "14:00", routeMetrics: Q1_METRICS, positioningChargeGbp: 8,
  });
  assert.equal(r.amount, 263);
  assert.equal(r.journeyFareGbp, 254);
  assert.equal(r.airportFixedCostsGbp, 9);
  assert.equal(Math.round(rawUniversalSaloonJourneyFareGbp(96.41, { knots: livePricing().saloon.knots.map((k) => [k.miles, k.fareGbp] as const), minimumGbp: 30, floorMiles: 4 })), 246);
  assert.equal(checkoutAmount(r), 263);
});

check("Quote 2 as the customer saw it (£252) = mileage only, drive-to-pickup charge missing", () => {
  const r = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-04-18", outboundTime: "10:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 0 });
  assert.equal(r.amount, 252);
});

check("Quote 2 live today before tolls = £273 (252 mileage + 21 drive charge)", () => {
  const r = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-04-18", outboundTime: "10:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21 });
  assert.equal(r.amount, 273);
});

check("Quote 2 with Dublin tolls = £283 (273 + M1 £4 + Port Tunnel off-peak both ways £6)", () => {
  const tolls = q2Tolls();
  assert.deepEqual(tolls.legs[0], { leg: "outbound", zone: "tunnel", m1Gbp: 4, portTunnelGbp: 6, m50Gbp: 0, totalGbp: 10 });
  const r = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-04-18", outboundTime: "10:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: tolls });
  assert.equal(r.amount, 283);
  assert.equal(r.journeyFareGbp, 283);
  assert.equal(r.airportFixedCostsGbp ?? 0, 0, "tolls must not appear as 'Airport charges'");
  assert.equal(checkoutAmount(r), 283);
});

// ── 2. Consistent mileage foundation ──────────────────────────────────────
check("Mileage curve never decreases with distance (0–300 mi)", () => {
  const knots = livePricing().saloon.knots.map((k) => [k.miles, k.fareGbp] as const);
  let prev = -1;
  for (let m = 0; m <= 300; m += 0.1) {
    const fare = Math.round(rawUniversalSaloonJourneyFareGbp(m, { knots, minimumGbp: 30, floorMiles: 4 }));
    assert.ok(fare >= prev, `fare dropped at ${m.toFixed(1)} mi`);
    prev = fare;
  }
});

check("Dublin Airport and Dublin city use the same mileage fare for the same miles", () => {
  for (const miles of [60, 90, 96.4, 100, 101.8, 120]) {
    const metrics = { distanceKm: KM(miles), durationMinutes: 120 };
    const airport = quote({ airportCode: "DUB", fromAirport: false, pickupAddress: CROWNE, dropoffAddress: DUB, routeMetrics: metrics });
    const city = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, routeMetrics: metrics });
    assert.equal(airport.journeyFareGbp, city.journeyFareGbp, `${miles} mi`);
  }
});

check("Longer comparable journeys never cost less (DUB and Dublin city)", () => {
  let prevAirport = 0;
  let prevCity = 0;
  for (let miles = 80; miles <= 130; miles += 0.5) {
    const metrics = { distanceKm: KM(miles), durationMinutes: 120 };
    const a = quote({ airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE, routeMetrics: metrics }).amount;
    const c = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, routeMetrics: metrics, tollAllowance: q2Tolls() }).amount;
    assert.ok(a >= prevAirport && c >= prevCity, `${miles} mi`);
    prevAirport = a;
    prevCity = c;
  }
});

// ── 3. Direction ──────────────────────────────────────────────────────────
check("Belfast → Dublin Airport £258 vs Dublin Airport → Belfast £263 (only DUB parking £5 differs)", () => {
  const to = quote({ airportCode: "DUB", fromAirport: false, pickupAddress: CROWNE, dropoffAddress: DUB, routeMetrics: Q1_METRICS, positioningChargeGbp: 8 });
  const from = quote({ airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE, routeMetrics: Q1_METRICS, positioningChargeGbp: 8 });
  assert.equal(to.journeyFareGbp, from.journeyFareGbp);
  assert.equal(to.airportFixedCostsGbp, 4);
  assert.equal(from.airportFixedCostsGbp, 9);
  assert.equal(from.amount - to.amount, 5);
});

check("Belfast → Dublin city and Dublin city → Belfast price the same off-peak", () => {
  const south = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-04-18", outboundTime: "10:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: q2Tolls() });
  const northTolls = resolveDublinTollAllowance({ pickup: GRAFTON_PT, dropoff: CROWNE_PT, pickupLabel: GRAFTON, dropoffLabel: CROWNE, durationMinutes: 121, outboundDate: "2027-04-18", outboundTime: "13:00" });
  const north = quote({ pickupAddress: GRAFTON, dropoffAddress: CROWNE, outboundDate: "2027-04-18", outboundTime: "13:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: northTolls });
  assert.equal(north.amount, south.amount);
});

// ── 4. Dublin tolls ───────────────────────────────────────────────────────
check("Port Tunnel peak: Mon 07:00 Dublin pickup pays peak southbound for the driver's run down", () => {
  // Monday 19 Apr 2027. Driver crosses southbound 06:45 (€15), customer northbound 07:10 (€3.50).
  const t = resolveDublinTollAllowance({ pickup: GRAFTON_PT, dropoff: CROWNE_PT, durationMinutes: 121, outboundDate: "2027-04-19", outboundTime: "07:00" });
  assert.equal(t.legs[0]!.portTunnelGbp, Math.round((15 + 3.5) * 0.87));
  assert.equal(portTunnelCrossingEur("southbound", "2026-12-01", 8 * 60), 14);
  assert.equal(portTunnelCrossingEur("northbound", "2027-04-19", 17 * 60), 12);
  assert.equal(portTunnelCrossingEur("northbound", "2027-04-18", 17 * 60), 3.5, "Sunday is off-peak");
});

check("M50 zone (Lucan) pays M1 + M50 both ways; north Dublin (Swords) pays M1 only", () => {
  const lucan = resolveDublinTollAllowance({ pickup: CROWNE_PT, dropoff: { lat: 53.3576, lng: -6.4486 }, outboundDate: "2027-04-18", outboundTime: "10:00" });
  assert.equal(lucan.legs[0]!.zone, "m50");
  assert.equal(lucan.outboundGbp, 4 + Math.round(2 * 2.7 * 0.87));
  const swords = resolveDublinTollAllowance({ pickup: CROWNE_PT, dropoff: { lat: 53.4597, lng: -6.2181 } });
  assert.equal(swords.outboundGbp, 4);
});

check("No tolls for NI-only, Dublin-only or Dublin Airport address ends", () => {
  const none = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    resolveDublinTollAllowance({ pickup: a, dropoff: b }).outboundGbp;
  assert.equal(none(CROWNE_PT, { lat: 54.6, lng: -5.93 }), 0);
  assert.equal(none(GRAFTON_PT, { lat: 53.29, lng: -6.13 }), 0);
  assert.equal(none(CROWNE_PT, { lat: 53.4264, lng: -6.2499 }), 0);
  // Label fallback (no coordinates): M1 only.
  assert.equal(resolveDublinTollAllowance({ pickupLabel: CROWNE, dropoffLabel: GRAFTON }).outboundGbp, 4);
  assert.equal(resolveDublinTollAllowance({ pickupLabel: CROWNE, dropoffLabel: DUB }).outboundGbp, 0);
});

check("Tolls are never surcharged (Night 2%, Christmas 18%)", () => {
  const tolls = q2Tolls("2027-04-18", "23:00");
  const night = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-04-18", outboundTime: "23:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: tolls });
  assert.equal(night.nightWeekendSurchargeGbp, Math.round(273 * 0.02 * 100) / 100);
  assert.equal(night.amount, Math.round((273 * 1.02 + tolls.outboundGbp) * 100) / 100);
  const xmasTolls = q2Tolls("2027-12-20", "12:00");
  const xmas = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, outboundDate: "2027-12-20", outboundTime: "12:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: xmasTolls });
  assert.equal(xmas.nightWeekendSurchargeGbp, Math.round(273 * 0.18 * 100) / 100);
  assert.equal(xmas.amount, Math.round((273 * 1.18 + xmasTolls.outboundGbp) * 100) / 100);
  // Checkout shows and charges the same customer-rounded total as the quote card.
  assert.equal(checkoutAmount(xmas), roundCustomerPayableGbp(xmas.amount));
});

check("Weekend surcharge (when switched on) applies to the fare, not to tolls or DUB fixed costs", () => {
  const pricing = livePricing((s) => { s.weekend = { ...s.weekend, enabled: true }; });
  const r = quote({ pricing, airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE, outboundDate: "2027-04-17", outboundTime: "14:00", routeMetrics: Q1_METRICS, positioningChargeGbp: 8 });
  assert.equal(r.nightWeekendSurchargeGbp, Math.round(254 * 0.1 * 100) / 100);
  assert.equal(r.amount, Math.round((254 * 1.1 + 9) * 100) / 100);
});

// ── 5. Return / Estate / access ───────────────────────────────────────────
check("Belfast to Dublin hotel return: group shares the checkout total with the 5% fare discount and full tolls", () => {
  const tolls = q2Tolls("2027-04-18", "10:00", { returnJourney: true, returnDate: "2027-04-21", returnTime: "15:00" });
  const r = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, returnJourney: true, outboundDate: "2027-04-18", outboundTime: "10:00", returnDate: "2027-04-21", returnTime: "15:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: tolls });
  const expected = Math.round((273 * 2 * 0.95 + tolls.outboundGbp + tolls.returnGbp) * 100) / 100;
  assert.equal(r.amount, expected);
  assert.equal(checkoutAmount(r), roundCustomerPayableGbp(r.amount));
  assert.equal(eventFareShareLabel(checkoutAmount(r), { eventTransfer: true, passengers: 4 }), "£134.75 each for 4 sharing");
});

check("Return Dublin Airport: 5% off journey only, DUB fixed costs undiscounted", () => {
  const r = quote({ airportCode: "DUB", fromAirport: false, pickupAddress: CROWNE, dropoffAddress: DUB, returnJourney: true, routeMetrics: Q1_METRICS, positioningChargeGbp: 8 });
  assert.equal(r.amount, Math.round((254 * 2 * 0.95 + 4 + 9) * 100) / 100);
  assert.equal(checkoutAmount(r), roundCustomerPayableGbp(r.amount));
});

check("Estate = Saloon + live £11 uplift on both Dublin routes", () => {
  const sal = quote({ airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE, routeMetrics: Q1_METRICS });
  const est = quote({ vehicleType: ESTATE, airportCode: "DUB", fromAirport: true, pickupAddress: DUB, dropoffAddress: CROWNE, routeMetrics: Q1_METRICS });
  assert.equal(est.amount - sal.amount, 11);
  const salC = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, routeMetrics: Q2_METRICS, tollAllowance: q2Tolls() });
  const estC = quote({ vehicleType: ESTATE, pickupAddress: CROWNE, dropoffAddress: GRAFTON, routeMetrics: Q2_METRICS, tollAllowance: q2Tolls() });
  assert.equal(estC.amount - salC.amount, 11);
});

check("Airport access selected vs not: added once, at full value, at checkout", () => {
  const r = quote({ airportCode: "BFS", fromAirport: false, pickupAddress: CROWNE, dropoffAddress: "Belfast International Airport", routeMetrics: { distanceKm: KM(22), durationMinutes: 35 } });
  const without = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: r.journeyFareGbp ?? 0, airportFixedCostsGbp: r.airportFixedCostsGbp ?? 0, nightWeekendSurchargeGbp: 0, returnJourney: false });
  const withAccess = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: r.journeyFareGbp ?? 0, airportFixedCostsGbp: r.airportFixedCostsGbp ?? 0, nightWeekendSurchargeGbp: 0, airportAccessChargeGbp: 5, returnJourney: false });
  assert.equal(without.finalAmountPayableGbp, r.amount);
  assert.equal(withAccess.finalAmountPayableGbp - without.finalAmountPayableGbp, 5);
});

// ── 6. Owner-only breakdown reconciles to the charged price ───────────────
check("Owner breakdown: Quote 1 itemises mileage, drive charge, parking and M1 toll = £263", () => {
  const b = buildOwnerFareBreakdown({
    pricing: livePricing(), vehicleType: SALOON, distanceKm: Q1_METRICS.distanceKm, airportCode: "DUB", fromAirport: true,
    returnJourney: false, schedule: { outboundDate: "2027-04-15", outboundTime: "14:00" }, positioningChargeGbp: 8,
    finalAmountGbp: 263, airportFixedCostsGbp: 9,
  });
  assert.equal(b.legs[0]!.baseJourneyFareGbp, 246);
  assert.equal(b.legs[0]!.driveToPickupChargeGbp, 8);
  assert.equal(b.legs[0]!.airportFixed.parkingGbp, 5);
  assert.equal(b.legs[0]!.airportFixed.tollGbp, 4);
  assert.equal(b.otherAdjustments.length, 0, JSON.stringify(b.otherAdjustments));
  assert.ok(ownerFareBreakdownLines(b).some((l) => l.label.startsWith("Dublin Airport adjustment 0%")));
});

check("Owner breakdown: Dublin city return with tolls and surcharge reconciles exactly", () => {
  const tolls: DublinTollAllowance = q2Tolls("2027-04-18", "23:00", { returnJourney: true, returnDate: "2027-04-19", returnTime: "07:00" });
  const r = quote({ pickupAddress: CROWNE, dropoffAddress: GRAFTON, returnJourney: true, outboundDate: "2027-04-18", outboundTime: "23:00", returnDate: "2027-04-19", returnTime: "07:00", routeMetrics: Q2_METRICS, positioningChargeGbp: 21, tollAllowance: tolls });
  const b = buildOwnerFareBreakdown({
    pricing: livePricing(), vehicleType: SALOON, distanceKm: Q2_METRICS.distanceKm, airportCode: null, fromAirport: false,
    returnJourney: true, schedule: { outboundDate: "2027-04-18", outboundTime: "23:00", returnDate: "2027-04-19", returnTime: "07:00", returnJourney: true },
    positioningChargeGbp: 21, tollAllowance: tolls, finalAmountGbp: r.amount,
  });
  assert.equal(b.otherAdjustments.length, 0, JSON.stringify(b));
  assert.equal(b.dublinTollsGbp, tolls.outboundGbp + tolls.returnGbp);
});

console.log(`\n${passed} Dublin pricing checks passed.`);

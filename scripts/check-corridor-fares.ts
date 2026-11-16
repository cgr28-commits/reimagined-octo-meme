/**
 * Derry corridor fare — settings, matching and fare composition.
 * Uses the live owner tariff shape (pricing version 295, 16 Nov 2026).
 * Nothing is saved, routed or deployed.
 *
 * Run: npx tsx scripts/check-corridor-fares.ts
 */

import assert from "node:assert/strict";
import {
  DEFAULT_DERRY_CORRIDOR,
  isInDerryCityZone,
  resolveDerryCorridorSaloonFareGbp,
  validateDerryCorridorInput,
  type CorridorPoint,
} from "../shared/corridor-fares";
import {
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { calculateAuthoritativeWebsiteQuote, type QuoteServiceInput } from "../src/lib/quote-service";
import { buildOwnerFareBreakdown } from "../src/lib/owner-fare-breakdown";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const ESTATE = "Estate or similar larger vehicle (1–4 passengers)" as const;

const P: Record<string, CorridorPoint> = {
  derry: { lat: 54.9966, lng: -7.3086 },
  guildhall: { lat: 54.9963, lng: -7.3189 },
  culmore: { lat: 55.0352, lng: -7.2639 },
  bfs: { lat: 54.6575, lng: -6.2158 },
  bhd: { lat: 54.6181, lng: -5.8724 },
  cityHall: { lat: 54.5967, lng: -5.9301 },
  lisburn: { lat: 54.5098, lng: -6.0437 },
  glengormley: { lat: 54.6773, lng: -5.9548 },
  coleraine: { lat: 55.1326, lng: -6.6646 },
  limavady: { lat: 55.051, lng: -6.949 },
  strabane: { lat: 54.827, lng: -7.4633 },
  ldy: { lat: 55.0428, lng: -7.1611 },
  dublinAirport: { lat: 53.4264, lng: -6.2499 },
  dublinCity: { lat: 53.3498, lng: -6.2603 },
  newry: { lat: 54.1751, lng: -6.3402 },
};

const LIVE_KNOTS: Array<[number, number]> = [
  [4, 30], [6, 30], [8, 30], [10, 35], [12, 38], [15, 60], [20, 68], [25, 78], [30, 89], [35, 99],
  [40, 110], [50, 132], [60, 162], [70, 188], [80, 208], [90, 240], [100, 249], [125, 290], [150, 320],
  [200, 410], [250, 500], [300, 590],
];

function livePricing(corridor?: { enabled: boolean; bfsSaloonFareGbp: number; belfastSaloonFareGbp: number }): OwnerPricingSettings {
  const d = defaultOwnerPricingSettings();
  const raw = {
    ...d,
    version: 295,
    bfsMinimumSaloonFareGbp: 38,
    bhdMinimumSaloonFareGbp: 25,
    saloonFormula: { enabled: false, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 },
    saloon: { minimumFareGbp: 30, floorMiles: 4, knots: LIVE_KNOTS.map(([miles, fareGbp]) => ({ miles, fareGbp })) },
    estate: { upliftGbp: 11 },
    minibus: { publicEnabled: true, requestQuote: false, multiplier: 1.3 },
    executive: { requestQuote: false, instantFromMiles: 50, publicEnabled: true, multiplier: 1.5, minimumFareGbp: 75 },
    returnDiscount: { rate: 0.05 },
    evening: { enabled: false, surchargeRate: 0.05, startMinutes: 1020, endMinutes: 1320 },
    christmas: { enabled: true, surchargeRate: 0.18, startMonthDay: "12-18", endMonthDay: "01-01" },
    night: { enabled: true, surchargeRate: 0.02, startMinutes: 1320, endMinutes: 360 },
    weekend: { enabled: false, surchargeRate: 0.1, days: [0, 6] },
    ...(corridor ? { derryCorridor: corridor } : {}),
  } as Record<string, unknown>;
  if (!corridor) delete raw.derryCorridor;
  const v = validateOwnerPricingInput(raw);
  assert.equal(v.ok, true, JSON.stringify(!v.ok && v.errors));
  return (v as { ok: true; settings: OwnerPricingSettings }).settings;
}

const OFF = livePricing();
const ON = livePricing({ enabled: true, bfsSaloonFareGbp: 159, belfastSaloonFareGbp: 169 });

const km = (miles: number) => miles / 0.621371;

function quote(input: {
  from: CorridorPoint;
  to: CorridorPoint;
  fromLabel: string;
  toLabel: string;
  miles: number;
  airportCode?: "BFS" | "BHD" | "DUB" | "LDY" | null;
  fromAirport?: boolean;
  positioning?: number;
  pricing?: OwnerPricingSettings;
  vehicleType?: QuoteServiceInput["vehicleType"];
  returnJourney?: boolean;
  date?: string;
  time?: string;
  endpoints?: boolean;
  passengers?: number;
}) {
  const r = calculateAuthoritativeWebsiteQuote({
    airportCode: input.airportCode ?? null,
    fromAirport: input.fromAirport ?? false,
    pickupAddress: input.fromLabel,
    dropoffAddress: input.toLabel,
    returnJourney: input.returnJourney ?? false,
    outboundDate: input.date ?? "2026-11-25",
    outboundTime: input.time ?? "10:00",
    returnDate: input.returnJourney ? "2026-11-27" : undefined,
    returnTime: input.returnJourney ? "10:00" : undefined,
    passengers: input.passengers ?? 1,
    suitcases: 1,
    vehicleType: input.vehicleType ?? SALOON,
    routeMetrics: { distanceKm: km(input.miles), durationMinutes: 80 },
    pricing: input.pricing ?? ON,
    positioningChargeGbp: input.positioning ?? 0,
    corridorEndpoints: input.endpoints === false ? undefined : { pickup: input.from, dropoff: input.to },
    destinationLat: input.to.lat,
    destinationLng: input.to.lng,
    ownerMode: true,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<typeof r, { ok: true }>;
}

const BFS = "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK";
const BHD = "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK";
const DERRY = "Derry~Londonderry, UK";

// 1. Settings
{
  assert.deepEqual(DEFAULT_DERRY_CORRIDOR, { enabled: false, bfsSaloonFareGbp: 159, belfastSaloonFareGbp: 169 });
  assert.equal(OFF.derryCorridor?.enabled, false, "missing stored value = OFF");
  // A stored object without derryCorridor must still validate (no fallback to defaults).
  const normalized = normalizeOwnerPricingSettings({ ...OFF, derryCorridor: undefined });
  assert.equal(normalized.saloon.knots.find((k) => k.miles === 60)?.fareGbp, 162);
  assert.deepEqual(validateDerryCorridorInput(undefined), []);
  assert.ok(validateDerryCorridorInput({ enabled: true, bfsSaloonFareGbp: 159.5, belfastSaloonFareGbp: 169 }).length > 0, "whole pounds only");
  assert.ok(validateDerryCorridorInput({ enabled: true, bfsSaloonFareGbp: 159, belfastSaloonFareGbp: 10 }).length > 0, "minimum £30");
  assert.ok(validateDerryCorridorInput({ enabled: "yes", bfsSaloonFareGbp: 159, belfastSaloonFareGbp: 169 }).length > 0);
  assert.equal(validateOwnerPricingInput({ ...OFF, derryCorridor: { enabled: true, bfsSaloonFareGbp: 5, belfastSaloonFareGbp: 169 } }).ok, false);
  const changes = diffOwnerPricingSettings(OFF, ON);
  assert.deepEqual(changes, [{ setting: "Derry corridor fare", oldValue: "OFF", newValue: "ON" }]);
  assert.deepEqual(toPublicOwnerPricingConfig(ON).derryCorridor, { enabled: true, bfsSaloonFareGbp: 159, belfastSaloonFareGbp: 169 });
}

// 2. Zone matching
{
  for (const p of [P.derry, P.guildhall, P.culmore]) assert.equal(isInDerryCityZone(p), true);
  for (const p of [P.ldy, P.limavady, P.strabane, P.coleraine, P.bfs]) assert.equal(isInDerryCityZone(p), false);
  const r = (a: CorridorPoint, b: CorridorPoint, airportCode: string | null = null, fromAirport = false) =>
    resolveDerryCorridorSaloonFareGbp({ settings: ON, airportCode, fromAirport, pickup: a, dropoff: b });
  assert.equal(r(P.bfs, P.derry, "BFS", true), 159);
  assert.equal(r(P.derry, P.bfs, "BFS", false), 159);
  assert.equal(r(P.bhd, P.derry, "BHD", true), 169);
  assert.equal(r(P.derry, P.bhd, "BHD", false), 169);
  assert.equal(r(P.cityHall, P.derry), 169);
  assert.equal(r(P.derry, P.lisburn), 169);
  assert.equal(r(P.glengormley, P.derry), 169);
  // Never Dublin, never LDY, never other towns.
  assert.equal(r(P.dublinAirport, P.derry, "DUB", true), null);
  assert.equal(r(P.derry, P.dublinAirport, "DUB", false), null);
  assert.equal(r(P.ldy, P.cityHall, "LDY", true), null);
  assert.equal(r(P.derry, P.dublinCity), null);
  assert.equal(r(P.derry, P.newry), null);
  assert.equal(r(P.coleraine, P.cityHall), null);
  assert.equal(r(P.limavady, P.cityHall), null);
  assert.equal(r(P.strabane, P.cityHall), null);
  assert.equal(r(P.bfs, P.coleraine, "BFS", true), null);
  assert.equal(r(P.derry, P.guildhall), null, "within Derry is not the corridor");
  assert.equal(resolveDerryCorridorSaloonFareGbp({ settings: OFF, airportCode: "BFS", fromAirport: true, pickup: P.bfs, dropoff: P.derry }), null);
  assert.equal(r(null as unknown as CorridorPoint, P.derry), null, "missing coordinates never match");
}

// 3. Today's fares are unchanged while the corridor is OFF (live check: £189 / £199 / £184).
{
  assert.equal(quote({ from: P.bfs, to: P.derry, fromLabel: BFS, toLabel: DERRY, miles: 59.2, airportCode: "BFS", fromAirport: true, positioning: 29, pricing: OFF }).amount, 189);
  assert.equal(quote({ from: P.cityHall, to: P.derry, fromLabel: "Belfast City Hall, Belfast BT1 5GS", toLabel: DERRY, miles: 71.2, positioning: 9, pricing: OFF }).amount, 199);
  assert.equal(quote({ from: P.glengormley, to: P.derry, fromLabel: "Glengormley BT36", toLabel: DERRY, miles: 65.0, positioning: 9, pricing: OFF }).amount, 184);
  // ON but no server coordinates → normal fare.
  assert.equal(quote({ from: P.bfs, to: P.derry, fromLabel: BFS, toLabel: DERRY, miles: 59.2, airportCode: "BFS", fromAirport: true, positioning: 29, endpoints: false }).amount, 189);
}

// 4. Corridor ON: £159 BFS ↔ Derry, £169 the rest, both directions; drive charge not added.
{
  const cases: Array<Parameters<typeof quote>[0]> = [
    { from: P.bfs, to: P.derry, fromLabel: BFS, toLabel: DERRY, miles: 59.2, airportCode: "BFS", fromAirport: true, positioning: 29 },
    { from: P.derry, to: P.bfs, fromLabel: DERRY, toLabel: BFS, miles: 59.5, airportCode: "BFS", fromAirport: false, positioning: 29 },
    { from: P.bhd, to: P.derry, fromLabel: BHD, toLabel: DERRY, miles: 72.0, airportCode: "BHD", fromAirport: true, positioning: 29 },
    { from: P.derry, to: P.bhd, fromLabel: DERRY, toLabel: BHD, miles: 73.4, airportCode: "BHD", fromAirport: false, positioning: 30 },
    { from: P.cityHall, to: P.derry, fromLabel: "Belfast City Hall, Belfast BT1 5GS", toLabel: DERRY, miles: 71.2, positioning: 9 },
    { from: P.derry, to: P.cityHall, fromLabel: DERRY, toLabel: "Belfast City Hall, Belfast BT1 5GS", miles: 71.6, positioning: 9 },
    { from: P.lisburn, to: P.guildhall, fromLabel: "Market Square, Lisburn BT28 1AG", toLabel: "Guildhall, Londonderry BT48 6DQ", miles: 71.5, positioning: 9 },
    { from: P.glengormley, to: P.derry, fromLabel: "Glengormley BT36", toLabel: DERRY, miles: 65.0, positioning: 9 },
    { from: P.derry, to: P.glengormley, fromLabel: DERRY, toLabel: "Glengormley BT36", miles: 64.5, positioning: 9 },
  ];
  for (const c of cases) {
    const q = quote(c);
    const expected = c.airportCode === "BFS" ? 159 : 169;
    assert.equal(q.amount, expected, `${c.fromLabel} → ${c.toLabel}`);
    assert.equal(q.corridorSaloonFareGbp, expected);
  }
  // BHD Estate = £169 + £11.
  assert.equal(quote({ ...cases[2]!, vehicleType: ESTATE }).amount, 180);
}

// 5. Vehicles, return discount, surcharges on top of the corridor fare.
{
  const base = { from: P.bfs, to: P.derry, fromLabel: BFS, toLabel: DERRY, miles: 59.2, airportCode: "BFS" as const, fromAirport: true, positioning: 29 };
  assert.equal(quote({ ...base, vehicleType: ESTATE }).amount, 170, "Estate = £159 + £11");
  assert.equal(quote({ ...base, returnJourney: true }).amount, 302.1, "Return = 2 × £159 less 5%");
  assert.equal(quote({ ...base, time: "22:30" }).amount, 162.18, "Night 2%");
  assert.equal(quote({ ...base, date: "2026-12-20" }).amount, 187.62, "Christmas 18% (live setting)");
  assert.equal(quote({ ...base, date: "2026-11-28" }).amount, 159, "Weekend pricing is off");
}

// 6. Never raises a price.
{
  const high = livePricing({ enabled: true, bfsSaloonFareGbp: 250, belfastSaloonFareGbp: 250 });
  const q = quote({ from: P.bfs, to: P.derry, fromLabel: BFS, toLabel: DERRY, miles: 59.2, airportCode: "BFS", fromAirport: true, positioning: 29, pricing: high });
  assert.equal(q.amount, 189);
  assert.equal(q.corridorSaloonFareGbp, undefined);
}

// 7. Dublin and other routes identical with the corridor ON or OFF.
{
  const pairs: Array<Parameters<typeof quote>[0]> = [
    { from: P.cityHall, to: P.dublinAirport, fromLabel: "Belfast City Hall, Belfast BT1 5GS", toLabel: "Dublin Airport, Co. Dublin, Ireland", miles: 103, airportCode: "DUB", fromAirport: false, positioning: 0 },
    { from: P.newry, to: P.dublinAirport, fromLabel: "Newry BT34", toLabel: "Dublin Airport, Co. Dublin, Ireland", miles: 55, airportCode: "DUB", fromAirport: false, positioning: 0 },
    { from: P.cityHall, to: P.dublinCity, fromLabel: "Belfast City Hall, Belfast BT1 5GS", toLabel: "Dublin, Ireland", miles: 104, positioning: 14 },
    { from: P.derry, to: P.dublinCity, fromLabel: DERRY, toLabel: "Dublin, Ireland", miles: 145, positioning: 9 },
    { from: P.coleraine, to: P.cityHall, fromLabel: "Coleraine BT52", toLabel: "Belfast City Hall, Belfast BT1 5GS", miles: 56, positioning: 4 },
    { from: P.bfs, to: P.coleraine, fromLabel: BFS, toLabel: "Coleraine BT52", miles: 44, airportCode: "BFS", fromAirport: true, positioning: 22 },
  ];
  for (const c of pairs) {
    assert.equal(quote({ ...c, pricing: ON }).amount, quote({ ...c, pricing: OFF }).amount, `${c.fromLabel} → ${c.toLabel}`);
  }
}

// 8. Owner breakdown reconciles with no "other adjustment".
{
  const b = buildOwnerFareBreakdown({
    pricing: ON,
    vehicleType: SALOON,
    distanceKm: km(59.2),
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: false,
    schedule: { outboundDate: "2026-11-25", outboundTime: "10:00" },
    positioningChargeGbp: 29,
    finalAmountGbp: 159,
    airportFixedCostsGbp: 0,
    corridorSaloonFareGbp: 159,
  });
  assert.equal(b.otherAdjustments.length, 0, JSON.stringify(b.otherAdjustments));
  assert.ok(b.notes.some((n) => n.includes("Derry corridor fare £159")));
}

console.log("check-corridor-fares: all checks passed");

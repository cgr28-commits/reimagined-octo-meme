/**
 * Business Class distance rule (owner, 15 Nov 2026): instant price for journeys of
 * 50 miles or more; under 50 miles it's a request (personal quote).
 * Run: npx tsx scripts/check-business-class-distance-rule.ts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_BUSINESS_CLASS_INSTANT_FROM_MILES,
  businessClassInstantFromMiles,
  businessClassShortJourneyNeedsQuote,
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  publicVehicleRequiresPersonalQuote,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
  vehiclePersonalQuoteMessage,
} from "../shared/owner-pricing-config";
import { saveOwnerPricingSettings, getOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { EXECUTIVE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";

class MemoryKV {
  private m = new Map<string, string>();
  async get(k: string, t?: unknown) {
    const v = this.m.get(k);
    if (v == null) return null;
    return t === "json" || (typeof t === "object" && t && (t as { type?: string }).type === "json") ? JSON.parse(v) : v;
  }
  async put(k: string, v: string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
  async list() { return { keys: [...this.m.keys()].map((name) => ({ name })), list_complete: true }; }
}

const KM_PER_MILE = 1 / 0.621371;
let passed = 0;
const ok = (name: string) => { passed++; console.log(`  ✓ ${name}`); };

async function quote(store: MemoryKV, vehicle: string, miles: number) {
  const response = await handleQuoteCalculateRequest(
    new Request("https://example.com/quote/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
        dropoffAddress: "Dublin Airport, Ireland",
        airportCode: "DUB",
        fromAirport: false,
        returnJourney: false,
        passengers: 2,
        suitcases: 2,
        vehicleType: vehicle,
        routeMetrics: { distanceKm: miles * KM_PER_MILE, durationMinutes: miles * 1.2, source: "osrm" },
        outboundDate: "2026-12-10",
        outboundTime: "14:00",
      }),
    }),
    null,
    { TRACKING_STORE: store } as never,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function main() {
  console.log("=== Rule ===");
  const d = defaultOwnerPricingSettings();
  assert.equal(DEFAULT_BUSINESS_CLASS_INSTANT_FROM_MILES, 50);
  assert.equal(businessClassInstantFromMiles(d), 50);
  ok("default is 50 miles");
  const cfg = toPublicOwnerPricingConfig(d);
  assert.equal(cfg.executive.instantFromMiles, 50);
  ok("public quote-tool config carries the distance");
  for (const [miles, request] of [[12, true], [49.9, true], [49.96, false], [50, false], [50.4, false], [99, false]] as const) {
    assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, cfg, false, miles), request, `${miles} miles`);
  }
  ok("under 50 → request; 50 and over → instant (to one decimal place)");
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, cfg, false, null), false);
  ok("unknown distance never blocks (the Worker always measures before pricing)");
  assert.equal(publicVehicleRequiresPersonalQuote(SALOON_VEHICLE, cfg, false, 10), false);
  ok("Saloon, Estate and 7-seater unaffected");
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, cfg, true, 10), false);
  ok("owner tools bypass the rule");
  const allRequest = toPublicOwnerPricingConfig({ ...d, executive: { ...d.executive, requestQuote: true } });
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, allRequest, false, 120), true);
  ok("'Request a personal quote' mode still makes every distance a request");
  const anyDistance = toPublicOwnerPricingConfig({ ...d, executive: { ...d.executive, instantFromMiles: 0 } });
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, anyDistance, false, 5), false);
  ok("0 miles = instant at any distance");
  assert.match(vehiclePersonalQuoteMessage(EXECUTIVE_VEHICLE, cfg, 20), /50 miles or more/);
  assert.equal(businessClassShortJourneyNeedsQuote(cfg, 20), true);
  ok("customer message explains the 50-mile rule");

  console.log("=== Stored settings ===");
  const legacy = JSON.parse(JSON.stringify(d));
  delete legacy.executive.instantFromMiles;
  assert.equal(normalizeOwnerPricingSettings(legacy).executive.instantFromMiles, 50);
  ok("settings saved before this change read as 50 miles");
  assert.equal(validateOwnerPricingInput({ ...d, executive: { ...d.executive, instantFromMiles: -1 } }).ok, false);
  assert.equal(validateOwnerPricingInput({ ...d, executive: { ...d.executive, instantFromMiles: 501 } }).ok, false);
  assert.equal(validateOwnerPricingInput({ ...d, executive: { ...d.executive, instantFromMiles: 40 } }).ok, true);
  ok("dashboard value validated (0–500 miles)");

  console.log("=== Worker quote API ===");
  const store = new MemoryKV();
  await saveOwnerPricingSettings(store as never, d, { actor: "test-owner" });
  const loaded = await getOwnerPricingSettings(store as never);
  assert.equal(loaded.executive.instantFromMiles, 50);
  ok("saved and read back");
  const short = await quote(store, EXECUTIVE_VEHICLE, 30);
  assert.equal(short.status, 409);
  assert.equal(short.body.reason, "personal_quote_required");
  assert.equal(short.body.requestReason, "business_class_distance");
  assert.ok(Number(short.body.distanceKm) > 0);
  assert.equal(short.body.amount, undefined);
  ok("Business Class 30 miles → request, no price returned");
  const long = await quote(store, EXECUTIVE_VEHICLE, 99);
  assert.equal(long.status, 200, JSON.stringify(long.body));
  assert.ok(Number(long.body.amount) > 0);
  ok("Business Class 99 miles → instant price");
  const exact = await quote(store, EXECUTIVE_VEHICLE, 50);
  assert.equal(exact.status, 200, JSON.stringify(exact.body));
  ok("Business Class exactly 50 miles → instant price");
  const saloon = await quote(store, SALOON_VEHICLE, 30);
  assert.equal(saloon.status, 200, JSON.stringify(saloon.body));
  ok("Saloon 30 miles → instant price (unchanged)");

  console.log(`\nAll ${passed} Business Class distance-rule checks passed.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

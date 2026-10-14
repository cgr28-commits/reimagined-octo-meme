import assert from "node:assert/strict";
import {
  defaultOwnerPricingSettings,
  validateOwnerPricingInput,
  normalizeOwnerPricingSettings,
  toPublicOwnerPricingConfig,
  diffOwnerPricingSettings,
  publicMinibusRequiresPersonalQuote,
} from "../shared/owner-pricing-config";
import { saveOwnerPricingSettings, getOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { handleCreateA2aQuoteRequest, handleOwnerListA2aQuotes } from "../workers/addresses/src/a2a-quote-handlers";

const data = new Map<string, string>();
const store = {
  async get(key: string, type?: string) { const value = data.get(key); return value == null ? null : type === "json" ? JSON.parse(value) : value; },
  async put(key: string, value: string) { data.set(key, value); },
  async list({ prefix = "" } = {}) { return { keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
} as unknown as KVNamespace;

async function main() {
  const defaults = defaultOwnerPricingSettings();
  assert.equal(defaults.minibus.requestQuote, false);
  const legacy = structuredClone(defaults);
  delete legacy.minibus.requestQuote;
  assert.equal(normalizeOwnerPricingSettings(legacy).minibus.requestQuote, false);
  assert.equal(validateOwnerPricingInput({ ...defaults, minibus: { ...defaults.minibus, requestQuote: "yes" } }).ok, false);
  const personal = { ...defaults, minibus: { ...defaults.minibus, publicEnabled: true, requestQuote: true } };
  assert.equal(validateOwnerPricingInput(personal).ok, true);
  assert.equal(toPublicOwnerPricingConfig(personal).minibus.requestQuote, true);
  assert.equal(publicMinibusRequiresPersonalQuote("Minibus (5–7 passengers)", personal), true);
  assert.equal(publicMinibusRequiresPersonalQuote("Minibus (5–7 passengers)", personal, true), false);
  for (const vehicle of ["Standard Saloon (1–4 passengers)", "Estate Car (1–4 passengers)", "Executive Saloon (1–4 passengers)"]) {
    assert.equal(publicMinibusRequiresPersonalQuote(vehicle, personal), false);
  }
  assert.ok(diffOwnerPricingSettings(defaults, personal).some(change => change.setting === "7 Seater Minibus quote mode"));
  // Real save/read round trip, rather than only checking normalization.
  await saveOwnerPricingSettings(store, personal, "test-owner");
  const loaded = await getOwnerPricingSettings(store);
  assert.equal(loaded.minibus.requestQuote, true);
  assert.equal(loaded.minibus.publicEnabled, true);
  const publicRequest = new Request("https://example.com/quote/calculate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickupAddress: "Belfast City Hall, Belfast BT1 5GS", dropoffAddress: "Dublin Airport, Ireland",
      airportCode: "DUB", fromAirport: false, returnJourney: false, passengers: 7, suitcases: 5, vehicleType: "Minibus (5–7 passengers)",
      routeMetrics: { distanceKm: 160, durationMinutes: 110, source: "osrm" }, outboundDate: "2026-11-01", outboundTime: "14:00" }),
  });
  const response = await handleQuoteCalculateRequest(publicRequest, null, { TRACKING_STORE: store });
  const payload = await response.json();
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "personal_quote_required");

  const instant = { ...loaded, minibus: { ...loaded.minibus, requestQuote: false } };
  await saveOwnerPricingSettings(store, instant, "test-owner");
  assert.equal((await getOwnerPricingSettings(store)).minibus.requestQuote, false);
  // Airport 7-seat requests must be preserved in the owner's price-and-email queue.
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "test-owner" };
  const result = await handleCreateA2aQuoteRequest(env, { booking: {
    customerName: "Test Customer", customerEmail: "test@example.com", mobileNumber: "07700900123",
    pickupLabel: "Dublin Airport", dropoffLabel: "Belfast", tripDate: "2026-11-01", tripTime: "14:00",
    passengers: 7, suitcases: 5, vehicle: "Minibus (5–7 passengers)", isAirportTrip: true,
    airportCode: "DUB", flightNumber: "EI123", returnJourney: true, returnDate: "2026-11-05", returnTime: "12:00", returnFlightNumber: "EI456",
  } });
  assert.ok("ok" in result && result.ok);
  const list = await handleOwnerListA2aQuotes(new Request("https://example.com/owner/a2a-quotes", { headers: { "x-owner-key": "test-owner" } }), env);
  assert.ok("quotes" in list);
  const record = [...data.values()].filter(value => value.startsWith("{")).map(value => JSON.parse(value)).find(value => value.booking?.customerName === "Test Customer");
  assert.equal(record.status, "AWAITING_QUOTE");
  assert.equal(record.booking.passengers, 7);
  assert.equal(record.booking.suitcases, 5);
  assert.equal(record.booking.isAirportTrip, true);
  assert.equal(record.booking.airportCode, "DUB");
  assert.equal(record.booking.returnFlightNumber, "EI456");
  console.log("PASS: legacy defaults, validation, mode save/read/revert, public config, vehicle isolation, owner bypass, airport enquiry persistence");
}
void main();

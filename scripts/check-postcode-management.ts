import assert from "node:assert/strict";
import { BT_DISTRICTS, APPROVED_POSTCODE_RULES, postcodeDistrict, validatePostcodeRules, postcodeTerminalAccessGbp } from "../shared/postcode-pricing";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig, validateOwnerPricingInput } from "../shared/owner-pricing-config";
import { approvedStartingRules, workbookDraftRules, mergeMissingPostcodeRules } from "../src/lib/postcode-pricing-drafts";
import { exportPostcodeCsv, importPostcodeCsv } from "../src/lib/postcode-pricing-csv";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE as S, ESTATE_VEHICLE as E } from "../src/lib/vehicle-selection";
import { roundGbp } from "../shared/gbp";
import { getOwnerPricingSettings, saveOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import worker from "../workers/addresses/src/index";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { postcodeFareHasPence } from "../shared/postcode-pricing";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { OPERATING_BASE } from "../workers/addresses/src/operating-base";

async function main() {
  // Current customer tariff: saved legacy postcode rules cannot override mileage mode.
  const mileage = defaultOwnerPricingSettings();
  mileage.saloonFormula = { enabled: true, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
  mileage.bfsMinimumSaloonFareGbp = 45;
  mileage.estate.upliftGbp = 7;
  mileage.night.enabled = false; mileage.weekend.enabled = false;
  const passengerRoute = { distanceKm: 20 / 0.621371, durationMinutes: 30 };
  for (const airport of ["BFS", "BHD", "DUB"] as const) for (const fromAirport of [false, true]) for (const returning of [false, true]) for (const vehicle of [S, E]) {
    const expected = (10 + 2.5 * 20 + (vehicle === E ? mileage.estate.upliftGbp : 0)) * (returning ? 2 * .95 : 1);
    for (const postcodePricingEnabled of [false, true]) for (const saloonFareGbp of [20, 999]) {
      const settings = { ...mileage, postcodePricingEnabled, postcodeRules: (["to-airport", "from-airport"] as const).map(direction => ({ district: "BT1", airportCode: airport, direction, approvalStatus: "approved" as const, enabled: true, saloonFareGbp })) };
      assert.equal(validateOwnerPricingInput(settings).ok, true, "Retained postcode fixtures must be valid so the engine cannot fall back to defaults");
      for (const pricing of [settings, toPublicOwnerPricingConfig(settings)]) {
        const result = calculateQuote("Belfast City Hall, Belfast BT1 5GS", airport, vehicle, returning, {}, passengerRoute, fromAirport, pricing)!;
        assert.equal(result.journeyFareGbp, roundGbp(expected), "Passenger miles determine the vehicle fare even with retained postcode rules; return discount excludes airport charges");
      }
      assert.equal(toPublicOwnerPricingConfig(settings).postcodePricingEnabled, false, "Public mileage mode keeps postcode pricing disabled");
    }
  }
  console.log("OK mileage tariff overrides retained postcode rules: three airports, both directions, Saloon/Estate, one-way/return and public/server parity");

  // Historical compatibility and owner-only management checks below use isolated settings.
  // They do not enable postcode pricing or profitability adjustments for customer quotes.
  const base = defaultOwnerPricingSettings(); // Explicit historical fixture supplement; current defaults are independently tested.
  base.estate.upliftGbp = 10; base.night.enabled = false; base.weekend.enabled = false;
  const address = "Belfast City Hall, Belfast BT1 5GS";
  const metrics = { distanceKm: 159, durationMinutes: 112 };
  const rules = APPROVED_POSTCODE_RULES;
  const active = { ...base, postcodePricingEnabled: true, postcodeRules: rules };
  assert.equal(composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:123.45}).finalAmountPayableGbp,123,"Existing ordinary whole-pound rounding unchanged");
  assert.equal(composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:123.45,preserveFixedFarePence:true}).finalAmountPayableGbp,123.45);
  assert.equal(resolveSumUpChargeAmountGbp(123.45,123.45),123);
  assert.equal(resolveSumUpChargeAmountGbp(123.46,123.45,undefined,true),123.45,"Charge server pence, never a client penny variant");
  assert.equal(postcodeFareHasPence({enabled:true,rules,context:{address,airportCode:"DUB",fromAirport:false},vehicle:E,estateSupplement:10,returnJourney:true}),false,"Whole-pound postcode fares retain existing return rounding");
  const quote = (p = active, airport = "DUB", from = false, ret = false, vehicle = S) => calculateQuote(address, airport, vehicle, ret, {}, metrics, from, p)!;
  assert.deepEqual(quote({ ...active, postcodePricingEnabled: undefined }), quote(active), "Missing legacy switch preserves active rules");
  assert.deepEqual(quote({ ...active, postcodePricingEnabled: false }), quote({ ...active, postcodeRules: [] }));
  assert.equal(base.postcodePricingEnabled, false);
  assert.equal(toPublicOwnerPricingConfig({ ...active, postcodePricingEnabled: false }).postcodeRules?.length, 0);
  assert.equal(toPublicOwnerPricingConfig({ ...active, postcodeRules: workbookDraftRules() }).postcodeRules?.length, 0);
  assert.ok(BT_DISTRICTS.includes("BT58")); assert.equal(BT_DISTRICTS.length, 81);
  for (const [full, district] of [["BT1 5GS", "BT1"], ["BT15GS", "BT1"], ["bt28aa", "BT2"], ["BT10 0AA", "BT10"], ["BT12 4AA", "BT12"], ["BT94 2AA", "BT94"]]) assert.equal(postcodeDistrict(full), district);
  for (const invalid of ["BT1", "BT0 1AA", "BT99 1AA", "BT50 1AA", "BT1 1CI", "BT1 5GS / BT2 8AA", "Dublin D01 AAAA", ""]) assert.equal(postcodeDistrict(invalid), null, invalid);
  const drafts = workbookDraftRules(); assert.equal(drafts.length, 480); assert.ok(drafts.every(r => !r.enabled));
  assert.equal(drafts.filter(r => r.approvalStatus === "approved").length, 6);
  assert.ok(drafts.filter(r => r.direction === "from-airport").every(r => r.approvalStatus === "needs-verification"));
  assert.equal(approvedStartingRules().length, 12); assert.ok(approvedStartingRules().every(r => !r.enabled));
  assert.equal(mergeMissingPostcodeRules(rules, drafts).length, 480); assert.equal(mergeMissingPostcodeRules(rules, drafts)[0].saloonFareGbp, 245);
  assert.equal(validatePostcodeRules(drafts).errors.length, 0);
  const imported = importPostcodeCsv(exportPostcodeCsv(drafts)); assert.equal(imported.length, 480);
  assert.ok(imported.every(r => !r.enabled && r.approvalStatus === "needs-verification"));
  assert.equal(importPostcodeCsv(exportPostcodeCsv(rules))[0].enabled, false, "CSV cannot activate or claim approval");
  assert.throws(() => importPostcodeCsv("bad header\nBT1,DUB,1"));
  assert.throws(() => importPostcodeCsv(exportPostcodeCsv([rules[0], rules[0]])), /Only one/);
  assert.throws(() => importPostcodeCsv(exportPostcodeCsv(rules).replace("245.00", "=1+1")), /Invalid/);
  assert.throws(() => importPostcodeCsv('"unfinished'), /unclosed/);
  assert.ok(validatePostcodeRules([{ ...rules[0], approvalStatus: "draft" }]).errors.length);
  assert.ok(validatePostcodeRules([rules[0], { ...rules[0], direction: "from-airport" }]).errors.length, "New reverse records cannot borrow legacy approval");
  assert.equal(validatePostcodeRules([rules[0], { ...rules[0], direction: "from-airport", approvalStatus: "approved" }]).errors.length, 0);
  for (const airport of ["BFS", "BHD", "DUB"]) {
    const reverse = { ...rules.find(r => r.district === "BT1" && r.airportCode === airport)!, direction: "from-airport" as const, approvalStatus: "approved" as const, saloonFareGbp: 123.45 };
    const both = { ...active, postcodeRules: [...rules, reverse] };
    assert.equal(quote(both, airport, true).amount + postcodeTerminalAccessGbp(airport), 123.45);
    // The configured Estate supplement is authoritative; do not hard-code an old default.
    assert.equal(quote(both, airport, true, false, E).amount + postcodeTerminalAccessGbp(airport), 123.45 + both.estate.upliftGbp);
    assert.equal(quote({ ...both, estate: { upliftGbp: 12.34 } }, airport, true, false, E).amount + postcodeTerminalAccessGbp(airport), 135.79);
    const out = quote(both, airport), back = quote(both, airport, true), ret = quote(both, airport, false, true);
    assert.equal(ret.amount, roundGbp((out.journeyFareGbp! + back.journeyFareGbp!) * .95 + out.airportFixedCostsGbp! + back.airportFixedCostsGbp!));
    for (const status of ["draft", "needs-verification"] as const) assert.deepEqual(quote({ ...active, postcodeRules: [{ ...reverse, enabled: false, approvalStatus: status }] }, airport, true), quote({ ...active, postcodeRules: [] }, airport, true));
  }
  console.log("OK feature OFF fallback; all districts; strict/ambiguous postcodes; 480 inactive drafts; outbound-only approvals; CSV safe roundtrip/merge/errors; independent arrivals; pence, Estate and return parity");

  const data = new Map<string, string>();
  const store = { async get(k: string, t?: string) { const v = data.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k: string,v: string) { data.set(k,v); }, async delete(k: string) { data.delete(k); }, async list() { return { keys: [], list_complete: true }; } } as unknown as KVNamespace;
  const saved = await saveOwnerPricingSettings(store, { ...active, profitability: approvedProductionProfitabilitySettings() });
  const firstAt = saved.settings.postcodeRules![0].updatedAt; assert.ok(firstAt);
  const unchanged = await saveOwnerPricingSettings(store, { ...saved.settings, postcodeRules: saved.settings.postcodeRules!.map(r => ({ ...r, updatedAt: "2099-01-01T00:00:00.000Z" })) }, { expectedVersion: saved.settings.version });
  assert.equal(unchanged.settings.postcodeRules![0].updatedAt, firstAt, "Client cannot forge a change timestamp");
  const legacy = { ...unchanged.settings }; delete legacy.postcodePricingEnabled; delete legacy.postcodeRules;
  const preserved = await saveOwnerPricingSettings(store, legacy, { expectedVersion: unchanged.settings.version });
  assert.equal(preserved.settings.postcodePricingEnabled, true); assert.equal(preserved.settings.postcodeRules!.length, 6);
  const restored = await saveOwnerPricingSettings(store, {}, { expectedVersion: preserved.settings.version, restoreDefaults: true });
  assert.equal(restored.settings.postcodePricingEnabled, true); assert.equal(restored.settings.postcodeRules!.length, 6);
  const publicConfig = toPublicOwnerPricingConfig({ ...active, postcodeRules: [{ ...rules[0], updatedAt: firstAt }, ...drafts.slice(12, 14)] });
  assert.equal(publicConfig.postcodeRules!.length, 1); assert.ok(!JSON.stringify(publicConfig).includes("needs-verification")); assert.ok(!JSON.stringify(publicConfig.postcodeRules).includes("updatedAt"));
  console.log("OK server-owned timestamps, legacy saves/default restore preserve flag/rules; public config omits drafts, inactive fares and timestamps");

  await saveOwnerPricingSettings(store, { ...active, profitability: approvedProductionProfitabilitySettings() });
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "test-owner", DRIVER_ACCESS_KEY: "test-driver" };
  const body = { rule: { ...rules[0], enabled: false }, address, lat: 54.59641, lng: -5.93021, vehicle: "estate" };
  const req = (key: string, b: unknown = body) => new Request("https://worker.example/owner/postcode-preview", { method: "POST", headers: { "Content-Type": "application/json", "X-Owner-Key": key, Origin: "https://www.myairporttaxini.co.uk" }, body: JSON.stringify(b) });
  const snapshot = JSON.stringify([...data]); const realFetch = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); assert.match(url, /route\/v1\//); urls.push(url);
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 30000, duration: 2400 }] }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    for (const key of ["", "wrong", "test-driver"]) assert.equal((await worker.fetch(req(key), env as never)).status, 401);
    assert.equal(urls.length, 0, "Unauthorised callers cannot run private routing");
    const response = await worker.fetch(req("test-owner"), env as never); assert.equal(response.status, 200);
    const result = await response.json() as { preview: { fareGbp: number; directCostsGbp: number; totalMiles: number; drivingMinutes: number; hourlyGbp: number; contributionGbp: number; belowTarget: boolean } };
    assert.equal(result.preview.fareGbp, 255); assert.equal(result.preview.drivingMinutes, 120); assert.equal(result.preview.totalMiles, 55.9);
    assert.equal(result.preview.contributionGbp, roundGbp(255 - result.preview.directCostsGbp)); assert.equal(result.preview.hourlyGbp, roundGbp(result.preview.contributionGbp / 2));
    assert.equal(urls.length, 3, "Private analysis routes passenger, positioning and homeward legs");
    const airport = SERVED_AIRPORTS.find(a => a.code === body.rule.airportCode)!;
    const point = (p: { lat: number; lng: number }) => `${p.lng},${p.lat}`;
    const legs = urls.map(url => decodeURIComponent(new URL(url).pathname).split("/driving/")[1]);
    assert.deepEqual(legs.sort(), [
      `${point(body)};${point(airport)}`,
      `${point(OPERATING_BASE)};${point(body)}`,
      `${point(airport)};${point(OPERATING_BASE)}`,
    ].sort(), "Private analysis uses the current operating base and canonical airport in the correct directions");
    const low = await worker.fetch(req("test-owner", { ...body, rule: { ...body.rule, saloonFareGbp: 15 } }), env as never);
    assert.equal(low.status, 200); const lowBody = await low.json() as { preview: { fareGbp: number; belowTarget: boolean } }; assert.equal(lowBody.preview.belowTarget, true); assert.equal(lowBody.preview.fareGbp, 25, "Low profit never increases the customer fare");
    assert.equal((await worker.fetch(req("test-owner", { ...body, address: "Road BT10 0AA" }), env as never)).status, 422);
    assert.equal((await worker.fetch(req("test-owner", { ...body, lat: null }), env as never)).status, 422);
    assert.equal(JSON.stringify([...data]), snapshot, "Preview does not write settings, audits or bookings");
  } finally { globalThis.fetch = realFetch; }
  console.log("OK authorised private preview: complete home-based operation, current direct costs, target warning without repricing, bad addresses rejected, no mutations or live calls");
  assert.equal((await getOwnerPricingSettings(store)).postcodeRules!.length, 6);
}
void main().catch(e => { console.error(e); process.exitCode = 1; });

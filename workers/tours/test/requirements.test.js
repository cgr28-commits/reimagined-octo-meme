import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, launchReadiness, validateCruiseItinerary } from "../src/validate.js";
import { migrateSettings } from "../src/migrate.js";
import { MANDATORY_LAUNCH_GATES } from "../src/constants.js";
import { snapshotHash } from "../src/canonical.js";
import { makeDO, fresh } from "./helpers.js";

const codes = (s) => validate(s).errors.map((e) => e.code);
const tour = (s, id) => s.commercial.tours.find((t) => t.id === id);
const openMandatory = (s) => { for (const g of MANDATORY_LAUNCH_GATES) s.gates[g] = { verified: true, evidenceRef: "EVIDENCE-1" }; return s; };
const open = (s, g) => { s.gates[g] = { verified: true, evidenceRef: "EVIDENCE-2" }; return s; };

// ---------- 1. Harbour pick-up approval: mandatory for cruise tours only ----------
test("1. harbour approval blocks cruise tours (active or bookable) and nothing else", () => {
  const s = openMandatory(fresh());
  assert.equal(s.gates.harbourPickupAccess.verified, false);
  for (const id of ["giants-causeway", "game-of-thrones", "belfast-city"]) { tour(s, id).active = true; tour(s, id).bookable = true; }
  tour(s, "antrim-coast").variants[1].active = true; tour(s, "antrim-coast").variants[1].bookable = true;
  s.publicLaunch.enabled = true;
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors)); // ordinary tours launch without it
  assert.equal(launchReadiness(s).launchReady, true);
  const a = structuredClone(s); tour(a, "cruise-express").active = true;
  assert.ok(codes(a).includes("gate-closed"));
  assert.deepEqual(launchReadiness(a).blockingFeatures, ["harbourPickupAccess"]);
  const b = structuredClone(s); tour(b, "cruise-causeway").bookable = true;
  assert.ok(codes(b).includes("gate-closed"));
  open(a, "harbourPickupAccess");
  assert.ok(!codes(a).includes("gate-closed"));
});
test("1. readiness labels harbour as mandatory-when-used and advertising/guiding as optional", () => {
  const f = launchReadiness(fresh()).features;
  assert.equal(f.harbourPickupAccess.requirement, "mandatory-when-used");
  assert.equal(f.routingProvider.requirement, "mandatory-when-used");
  assert.equal(f.advertisingApproval.requirement, "optional");
  assert.equal(f.guidingQualifications.requirement, "optional");
  assert.equal(f.harbourPickupAccess.blocking, false); // cruise not in use yet
});

// ---------- 2. Routing provider approval: mandatory for the Smart Itinerary Builder ----------
test("2. Smart Itinerary Builder needs routing provider approval", () => {
  const s = openMandatory(fresh());
  assert.equal(s.commercial.itinerary.smartItineraryBuilderEnabled, false);
  s.commercial.itinerary.smartItineraryBuilderEnabled = true;
  assert.ok(codes(s).includes("gate-closed"));
  assert.deepEqual(launchReadiness(s).blockingFeatures, ["routingProvider"]);
  s.publicLaunch.enabled = true;
  assert.ok(codes(s).includes("gate-closed"));
  open(s, "routingProvider");
  assert.ok(!codes(s).includes("gate-closed"));
});
test("2. routing approval does not affect ordinary tours while the builder is off", () => {
  const s = openMandatory(fresh());
  assert.equal(s.gates.routingProvider.verified, false);
  tour(s, "belfast-city").bookable = true; s.publicLaunch.enabled = true;
  assert.equal(validate(s).ok, true);
  assert.ok(!("customItinerariesEnabled" in s.commercial.itinerary));
});

// ---------- 3. Cruise scopes and itinerary-level validation ----------
const T = (h, m) => new Date(Date.UTC(2027, 5, 1, h, m)).toISOString();
const itin = (tourId, over = {}) => ({ tourId, stops: [{ id: "titanic", region: "belfast" }], allAboardAt: T(17, 0), allAboardConfirmedByCustomer: true, plannedPortReturnAt: T(15, 0), ...over });

test("3. cruise scopes are seeded: Express Belfast-only, Causeway long-distance", () => {
  const s = fresh();
  assert.equal(tour(s, "cruise-express").cruiseScope, "belfastOnly");
  assert.equal(tour(s, "cruise-causeway").cruiseScope, "longDistance");
  assert.equal(validate(s).ok, true);
});
test("3. Belfast-only itinerary needs 60 minutes; shorter is refused", () => {
  const s = fresh();
  assert.equal(validateCruiseItinerary(s, itin("cruise-express", { plannedPortReturnAt: T(16, 0) })).ok, true); // exactly 60
  const r = validateCruiseItinerary(s, itin("cruise-express", { plannedPortReturnAt: T(16, 1) }));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "return-buffer");
  assert.equal(validateCruiseItinerary(s, itin("cruise-express")).applicableScope, "belfastOnly");
});
test("3. long-distance itinerary needs 90 + 30 minutes", () => {
  const s = fresh();
  const ok = validateCruiseItinerary(s, itin("cruise-causeway", { plannedPortReturnAt: T(15, 0) }));
  assert.equal(ok.ok, true);
  assert.equal(ok.requiredBufferMinutes, 120);
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { plannedPortReturnAt: T(15, 1) })).ok, false);
});
test("3. scope is never reduced: long-distance tour with Belfast-only stops keeps the long buffer", () => {
  const r = validateCruiseItinerary(fresh(), itin("cruise-causeway", { plannedPortReturnAt: T(15, 30) }));
  assert.equal(r.applicableScope, "longDistance");
  assert.equal(r.ok, false);
});
test("3. Belfast-only tour whose itinerary leaves Belfast is refused", () => {
  const r = validateCruiseItinerary(fresh(), itin("cruise-express", { stops: [{ id: "a", region: "belfast" }, { id: "b", region: "outside-belfast" }], plannedPortReturnAt: T(12, 0) }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "scope-exceeded"));
});
test("3. engine contingency can raise but never lower the buffer; owner minimum is the floor", () => {
  const s = fresh();
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { engineContingencyMinutes: 45, plannedPortReturnAt: T(15, 0) })).ok, false); // needs 135
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { engineContingencyMinutes: 45, plannedPortReturnAt: T(14, 45) })).ok, true);
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { engineContingencyMinutes: 5, plannedPortReturnAt: T(15, 1) })).ok, false); // 5 < configured 30: ignored
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = 45;
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { engineContingencyMinutes: 0, plannedPortReturnAt: T(14, 45) })).requiredBufferMinutes, 135);
  assert.equal(validateCruiseItinerary(s, itin("cruise-causeway", { engineContingencyMinutes: -10 })).ok, false);
});
test("3. all-aboard must be customer-confirmed; scope must be configured; malformed input refused; non-cruise not applicable", () => {
  const s = fresh();
  assert.ok(validateCruiseItinerary(s, itin("cruise-express", { allAboardConfirmedByCustomer: false })).errors.some((e) => e.code === "all-aboard"));
  assert.ok(validateCruiseItinerary(s, itin("cruise-express", { allAboardAt: "soon" })).errors.some((e) => e.code === "all-aboard"));
  assert.ok(validateCruiseItinerary(s, itin("cruise-express", { stops: [] })).errors.some((e) => e.code === "stops"));
  assert.ok(validateCruiseItinerary(s, itin("cruise-express", { stops: [{ id: "x", region: "mars" }] })).errors.some((e) => e.code === "stops"));
  tour(s, "cruise-express").cruiseScope = "unconfigured";
  assert.ok(validateCruiseItinerary(s, itin("cruise-express")).errors.some((e) => e.code === "cruise-scope"));
  assert.equal(validateCruiseItinerary(fresh(), itin("giants-causeway")).applicable, false);
  assert.equal(validateCruiseItinerary(fresh(), itin("nope")).ok, false);
  assert.equal(validateCruiseItinerary(fresh(), null).ok, false);
});
test("3. itinerary validation endpoint is owner-only and uses the stored settings", async () => {
  const { call } = makeDO();
  assert.equal((await call("POST", "/validate-itinerary", { itinerary: itin("cruise-express") }, { key: null })).status, 401);
  const good = await call("POST", "/validate-itinerary", { itinerary: itin("cruise-express") });
  assert.equal(good.body.valid, true);
  const bad = await call("POST", "/validate-itinerary", { itinerary: itin("cruise-express", { plannedPortReturnAt: T(16, 30) }) });
  assert.equal(bad.body.valid, false);
});

// ---------- 4. Provisional durations ----------
test("4. agreed provisional durations are seeded (provisional) and others stay unconfigured", () => {
  const s = fresh();
  const want = { "giants-causeway": 9, "game-of-thrones": 9, "belfast-city": 5, "cruise-express": 6, "cruise-causeway": 9 };
  for (const [id, h] of Object.entries(want)) { assert.equal(tour(s, id).durationHours.value, h, id); assert.equal(tour(s, id).durationHours.provisional, true); }
  const a = tour(s, "antrim-coast");
  assert.equal(a.variants.find((v) => v.kind === "full-day").durationHours.value, 8);
  assert.equal(a.variants.find((v) => v.kind === "half-day").durationHours.value, null);
  assert.equal(a.durationHours.value, null); // tour-level stays empty when variants exist
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
});
test("4. unknown mileage, positioning and half-day prices stay unconfigured", () => {
  const s = fresh();
  for (const t of s.commercial.tours) for (const u of [t, ...t.variants]) for (const k of ["estimatedMiles", "homePositioningMiles", "homePositioningHours"]) assert.equal(u[k].value, null, `${t.id}.${k}`);
  assert.equal(tour(s, "antrim-coast").variants.find((v) => v.kind === "half-day").provisionalPricePence.value, null);
});
test("4. a seeded duration plus positioning must still fit the working day", () => {
  const s = fresh();
  tour(s, "giants-causeway").homePositioningHours.value = 2.5; // 9 + 2.5 > 11
  assert.ok(codes(s).includes("duration-bounds"));
});

// ---------- 5. Preserve published prices, durations and URLs ----------
test("5. published price, duration and slug match the live website data (src/lib/tours.ts)", () => {
  const src = readFileSync(new URL("../../../src/lib/tours.ts", import.meta.url), "utf8");
  const blocks = src.split(/\n\s*slug: "/).slice(1);
  const site = Object.fromEntries(blocks.map((b) => [b.slice(0, b.indexOf('"')), { duration: /duration: "([^"]+)"/.exec(b)?.[1], priceFrom: Number(/priceFrom: (\d+)/.exec(b)?.[1]) }]));
  const s = fresh();
  for (const slug of ["giants-causeway", "belfast-city", "game-of-thrones", "antrim-coast"]) {
    const t = s.commercial.tours.find((x) => x.slug === slug);
    assert.ok(t, slug);
    assert.equal(t.publishedDurationLabel, site[slug].duration, `${slug} duration`);
    assert.equal(t.publishedPricePence, site[slug].priceFrom * 100, `${slug} price`);
  }
  assert.deepEqual(tour(s, "antrim-coast").variants.map((v) => [v.publishedPricePence, v.publishedDurationLabel]), [[19500, "Half day (~4 hours)"], [39500, "Full day (~8 hours)"]]);
});
test("5. seeding provisional durations does not overwrite published ones", () => {
  const s = fresh();
  assert.equal(tour(s, "giants-causeway").publishedDurationLabel, "Full day (~8 hours)");
  assert.equal(tour(s, "giants-causeway").durationHours.value, 9);
  assert.ok(s.commercial.tours.filter((t) => t.cruise).every((t) => t.slug === null && t.publishedPricePence === null && t.publishedDurationLabel === null));
});

// ---------- 6. Schema migration preserves saved owner settings ----------
/** Rebuild what the previous deploy stored (schema 2) and add owner edits. */
function oldSchema2WithOwnerEdits() {
  const s = fresh();
  s.schema = "tour-settings/2";
  s.commercial.itinerary.customItinerariesEnabled = false; delete s.commercial.itinerary.smartItineraryBuilderEnabled;
  for (const t of s.commercial.tours) for (const u of [t, ...t.variants]) { delete u.publishedDurationLabel; u.durationHours = { value: null, provisional: true }; }
  tour(s, "cruise-express").cruiseScope = "unconfigured"; tour(s, "cruise-causeway").cruiseScope = "unconfigured";
  // owner edits
  s.commercial.quotes.validityDays = { value: 10, provisional: false };
  s.commercial.finance.paymentProcessingFeePercent = { value: 1.5, provisional: false };
  s.commercial.finance.administrativeCostPencePerBooking = { value: 150, provisional: true };
  s.commercial.finance.vehicleRunningCostPencePerMile = { value: 41, provisional: false };
  tour(s, "belfast-city").provisionalPricePence = { value: 25000, provisional: false };
  tour(s, "giants-causeway").estimatedMiles = { value: 160, provisional: true };
  s.gates.insuranceVerified = { verified: true, evidenceRef: "POLICY-123" };
  s.commercial.cruise.terminals = ["Belfast Harbour Terminal 2"];
  s.commercial.retention.enquiryDays = { value: 365, provisional: true };
  s.commercial.content.photoLibrary = [{ id: "p1", alt: "Coast road", licence: "Own work", credit: "Owner" }];
  s.commercial.drivers.approvedDrivers = [{ id: "d1", label: "Driver one", models: ["owner"], cruiseApproved: false, insuranceVerified: true, licenceVerified: true }];
  s.commercial.finance.marginOverrides = [{ tourId: "belfast-city", model: "owner", reason: "Launch offer", recordedAt: "2026-11-20T10:00:00.000Z" }];
  s.commercial.tours.push({ ...structuredClone(tour(s, "belfast-city")), id: "owner-added", slug: "owner-added", name: "Owner added" });
  return s;
}
async function storeOld(settings) {
  const d = makeDO();
  await d.call("GET", "/settings"); // seeds v1 with the current schema
  d.storage.map.set("v:00000001", { version: 1, settings, hash: await snapshotHash(1, settings), createdAt: "2026-11-24T10:00:00.000Z", actor: "owner", reason: "old", restoredFrom: null });
  return d;
}
test("6. migration keeps every saved owner value", async () => {
  const old = oldSchema2WithOwnerEdits();
  const { call } = await storeOld(old);
  const cur = (await call("GET", "/settings")).body;
  assert.equal(cur.version, 2);
  const s = cur.settings;
  assert.equal(s.schema, "tour-settings/3");
  assert.deepEqual(s.commercial.quotes.validityDays, { value: 10, provisional: false });
  assert.deepEqual(s.commercial.finance.paymentProcessingFeePercent, { value: 1.5, provisional: false });
  assert.equal(s.commercial.finance.administrativeCostPencePerBooking.value, 150);
  assert.deepEqual(s.commercial.finance.vehicleRunningCostPencePerMile, { value: 41, provisional: false });
  assert.deepEqual(tour(s, "belfast-city").provisionalPricePence, { value: 25000, provisional: false }); // owner price beats seed 24500
  assert.equal(tour(s, "giants-causeway").estimatedMiles.value, 160);
  assert.deepEqual(s.gates.insuranceVerified, { verified: true, evidenceRef: "POLICY-123" });
  assert.deepEqual(s.commercial.cruise.terminals, ["Belfast Harbour Terminal 2"]);
  assert.equal(s.commercial.retention.enquiryDays.value, 365);
  assert.deepEqual(s.commercial.content.photoLibrary, old.commercial.content.photoLibrary);
  assert.deepEqual(s.commercial.drivers.approvedDrivers, old.commercial.drivers.approvedDrivers);
  assert.deepEqual(s.commercial.finance.marginOverrides, old.commercial.finance.marginOverrides);
  assert.equal(tour(s, "owner-added").slug, "owner-added"); // owner-added tour carried across
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
});
test("6. migration fills only new/unconfigured values: new durations, scopes, renamed itinerary flag", async () => {
  const { call } = await storeOld(oldSchema2WithOwnerEdits());
  const s = (await call("GET", "/settings")).body.settings;
  assert.equal(tour(s, "giants-causeway").durationHours.value, 9);
  assert.equal(tour(s, "cruise-express").cruiseScope, "belfastOnly");
  assert.equal(tour(s, "cruise-causeway").cruiseScope, "longDistance");
  assert.equal(tour(s, "giants-causeway").publishedDurationLabel, "Full day (~8 hours)");
  assert.equal(s.commercial.itinerary.smartItineraryBuilderEnabled, false);
  assert.ok(!("customItinerariesEnabled" in s.commercial.itinerary));
});
test("6. a saved Smart Itinerary flag value survives the rename; old version is retained; audit records the upgrade", async () => {
  const old = oldSchema2WithOwnerEdits();
  old.commercial.itinerary.customItinerariesEnabled = true;
  old.gates.routingProvider = { verified: true, evidenceRef: "ROUTING-1" };
  const { call } = await storeOld(old);
  const s = (await call("GET", "/settings")).body.settings;
  assert.equal(s.commercial.itinerary.smartItineraryBuilderEnabled, true);
  const v1 = (await call("GET", "/versions/1")).body;
  assert.equal(v1.settings.schema, "tour-settings/2");
  assert.equal(v1.settings.commercial.quotes.validityDays.value, 10); // history untouched
  const entries = (await call("GET", "/audit")).body.entries;
  const up = entries[entries.length - 1];
  assert.equal(up.action, "schema-upgrade");
  assert.equal(up.detail.fromVersion, 1);
  assert.ok(up.detail.notes.some((n) => n.kind === "renamed"));
  assert.equal((await call("GET", "/versions")).body.versions.length, 2);
});
test("6. schema-1 data (first deploy) migrates: renames carried, subcontractor flagged for review, placeholders mapped", async () => {
  const old = fresh();
  old.schema = "tour-settings/1";
  old.commercial.finance.subcontractorCostCeilingPercent = { value: 55, provisional: false };
  delete old.commercial.finance.subcontractorOwnVehicleCeilingPercent; delete old.commercial.finance.subcontractorSuppliedVehicleFeePercent;
  delete old.commercial.drivers.models.subcontractorOwnVehicle; delete old.commercial.drivers.models.subcontractorSuppliedVehicle;
  old.commercial.drivers.models.subcontractor = true;
  old.commercial.itinerary.customItinerariesEnabled = false; delete old.commercial.itinerary.smartItineraryBuilderEnabled;
  for (const t of old.commercial.tours) { delete t.variants; delete t.publishedDurationLabel; delete t.homePositioningMiles; delete t.homePositioningHours; }
  tour(old, "cruise-express").id = "cruise-product-1"; tour(old, "cruise-causeway").id = "cruise-product-2";
  for (const t of old.commercial.tours.filter((x) => x.cruise)) { t.name = null; t.provisionalPricePence = { value: null, provisional: true }; }
  const { call } = await storeOld(old);
  const s = (await call("GET", "/settings")).body.settings;
  assert.equal(s.schema, "tour-settings/3");
  assert.deepEqual(s.commercial.finance.subcontractorOwnVehicleCeilingPercent, { value: 55, provisional: false });
  assert.deepEqual(s.commercial.drivers.models, { owner: true, paidDriver: false, subcontractorOwnVehicle: false, subcontractorSuppliedVehicle: false });
  assert.ok(tour(s, "cruise-express") && tour(s, "cruise-causeway") && !tour(s, "cruise-product-1"));
  assert.equal(tour(s, "antrim-coast").variants.length, 2);
  assert.equal(tour(s, "cruise-express").provisionalPricePence.value, 29500); // unconfigured old value takes the agreed seed
  const note = (await call("GET", "/audit")).body.entries.pop().detail.notes;
  assert.ok(note.some((n) => n.kind === "review" && /subcontractor/i.test(n.message)));
});
test("6. an owner edit that cannot be migrated safely blocks the upgrade, loses nothing, and is reported once", async () => {
  const old = oldSchema2WithOwnerEdits();
  tour(old, "antrim-coast").provisionalPricePence = { value: 42500, provisional: true }; // tour-level figure on a variants tour
  const { call, storage } = await storeOld(old);
  const a = (await call("GET", "/settings")).body;
  assert.equal(a.version, 1);
  assert.equal(a.settings.schema, "tour-settings/2"); // untouched
  await call("GET", "/settings"); await call("GET", "/versions");
  const failures = (await call("GET", "/audit")).body.entries.filter((e) => e.action === "schema-upgrade-failed");
  assert.equal(failures.length, 1);
  assert.ok(failures[0].detail.errorCodes.some((c) => /variant-level/.test(c)));
  assert.equal(storage.map.get("current"), 1);
});
test("6. migration is pure and idempotent on current-schema data", () => {
  const s = fresh();
  const a = migrateSettings(s);
  assert.deepEqual(a.settings, s);
  assert.deepEqual(migrateSettings(a.settings).settings, s);
  assert.equal(a.notes.length, 0);
  assert.equal(migrateSettings(null).settings, null);
});
test("6. migration never loosens mandatory rules: an invalid saved value fails validation instead of being corrected", async () => {
  const old = oldSchema2WithOwnerEdits();
  old.mandatory.capacity.maxPassengers = 7;
  const { call } = await storeOld(old);
  const a = (await call("GET", "/settings")).body;
  assert.equal(a.version, 1);
  assert.ok((await call("GET", "/audit")).body.entries.some((e) => e.action === "schema-upgrade-failed"));
});

// ---------- 7. Atomic version, pointer and audit writes ----------
const snapshotState = (storage) => JSON.stringify([...storage.map].sort(([a], [b]) => (a < b ? -1 : 1)));
test("7. a failure at ANY write of a publish leaves no version, pointer or audit change", async () => {
  for (const n of [1, 2, 3, 4]) {
    const { call, storage } = makeDO();
    await call("GET", "/settings");
    const before = snapshotState(storage);
    const next = fresh(); next.commercial.quotes.validityDays.value = 9;
    storage.failOnPut(n);
    const r = await call("POST", "/publish", { settings: next, baseVersion: 1, reason: "atomic test" });
    assert.equal(r.status, 500, `put #${n}`);
    assert.equal(snapshotState(storage), before, `state changed after failure at put #${n}`);
    assert.equal(storage.map.get("current"), 1);
    assert.equal(storage.map.has("v:00000002"), false);
    const retry = await call("POST", "/publish", { settings: next, baseVersion: 1, reason: "atomic test" });
    assert.equal(retry.status, 201); // clean retry succeeds
    assert.equal(retry.body.version, 2);
  }
});
test("7. rollback is atomic too", async () => {
  for (const n of [1, 2, 3, 4]) {
    const { call, storage } = makeDO();
    const next = fresh(); next.commercial.quotes.validityDays.value = 9;
    await call("POST", "/publish", { settings: next, baseVersion: 1, reason: "first change" });
    const before = snapshotState(storage);
    storage.failOnPut(n);
    assert.equal((await call("POST", "/rollback", { baseVersion: 2, targetVersion: 1, reason: "atomic rollback" })).status, 500);
    assert.equal(snapshotState(storage), before, `put #${n}`);
  }
});
test("7. the initial seed and the schema upgrade are atomic", async () => {
  const seedFail = makeDO();
  seedFail.storage.failOnPut(2); // pointer write fails during the very first seed
  assert.equal((await seedFail.call("GET", "/settings")).status, 500);
  assert.equal(seedFail.storage.map.has("v:00000001"), false);
  assert.equal(seedFail.storage.map.has("current"), false);
  assert.equal((await seedFail.call("GET", "/settings")).status, 200); // recovers on the next request
  for (const n of [1, 2, 3, 4]) {
    const d = await storeOld(oldSchema2WithOwnerEdits());
    const before = snapshotState(d.storage);
    d.storage.failOnPut(n);
    assert.equal((await d.call("GET", "/settings")).status, 500);
    assert.equal(snapshotState(d.storage), before, `upgrade put #${n}`);
    const ok = await d.call("GET", "/settings");
    assert.equal(ok.body.version, 2); // upgrade completes on retry
  }
});
test("7. audit-only writes (conflict) are atomic and an audit entry never exists without its version", async () => {
  const { call, storage } = makeDO();
  await call("GET", "/settings");
  const before = snapshotState(storage);
  storage.failOnPut(2); // sequence write fails after the entry write
  assert.equal((await call("POST", "/publish", { settings: fresh(), baseVersion: 0, reason: "stale one" })).status, 500);
  assert.equal(snapshotState(storage), before);
  const publishes = (await call("GET", "/audit")).body.entries.filter((e) => e.action === "publish");
  const versions = (await call("GET", "/versions")).body.versions;
  assert.equal(publishes.length, versions.length - 1); // every non-seed version has exactly one publish entry
});
test("7. the transaction re-checks sequence: a duplicate or skipped version number is refused", async () => {
  const { stub, storage } = makeDO();
  const s = fresh();
  await stub.fetch(new Request("https://x.test/settings", { headers: { authorization: "Bearer test-owner-key-0123456789abcdef", "x-client-id": "t" } }));
  await assert.rejects(() => stub.commitVersion(1, s, "owner", "dup", null, "publish"), /version-sequence/);
  await assert.rejects(() => stub.commitVersion(3, s, "owner", "skip", null, "publish"), /version-sequence/);
  assert.equal(storage.map.get("current"), 1);
});
test("7. concurrent writers keep pointer, versions and audit consistent", async () => {
  const { call, storage } = makeDO();
  await call("GET", "/settings");
  const mk = (d) => { const s = fresh(); s.commercial.quotes.validityDays.value = d; return s; };
  const results = await Promise.all([2, 3, 4, 5, 6].map((d) => call("POST", "/publish", { settings: mk(d), baseVersion: 1, reason: "race test" })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(storage.map.get("current"), 2);
  const versions = [...storage.map.keys()].filter((k) => k.startsWith("v:")).length;
  assert.equal(versions, 2);
  const seqs = [...storage.map.values()].filter((v) => v && v.seq).map((v) => v.seq);
  assert.deepEqual(seqs, seqs.map((_, i) => i + 1));
});

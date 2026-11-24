import test from "node:test";
import assert from "node:assert/strict";
import { validate, launchReadiness } from "../src/validate.js";
import { profitability } from "../src/profitability.js";
import { MANDATORY_LAUNCH_GATES, FEATURE_GATES, GATE_NAMES } from "../src/constants.js";
import { makeDO, fresh } from "./helpers.js";

const codes = (s) => validate(s).errors.map((e) => e.code);
const tour = (s, id) => s.commercial.tours.find((t) => t.id === id);
const openMandatory = (s) => { for (const g of MANDATORY_LAUNCH_GATES) s.gates[g] = { verified: true, evidenceRef: "EVIDENCE-1" }; return s; };

// ---- 1. mandatory prerequisites vs optional feature gates ----
test("gates are split: advertising and guiding are optional feature gates", () => {
  assert.ok(!MANDATORY_LAUNCH_GATES.includes("advertisingApproval"));
  assert.ok(!MANDATORY_LAUNCH_GATES.includes("guidingQualifications"));
  assert.ok("advertisingApproval" in FEATURE_GATES && "guidingQualifications" in FEATURE_GATES);
  assert.equal(new Set(GATE_NAMES).size, GATE_NAMES.length);
  for (const g of ["insuranceVerified", "licensingVerified", "cancellationLegalReview", "icoRegistrationOrExemption", "pricingApproval"]) assert.ok(MANDATORY_LAUNCH_GATES.includes(g), g);
});
test("ordinary private-driver tours can launch with advertising and guiding gates closed (features off)", () => {
  const s = openMandatory(fresh());
  assert.equal(s.gates.advertisingApproval.verified, false);
  assert.equal(s.gates.guidingQualifications.verified, false);
  const t = tour(s, "giants-causeway");
  t.bookable = true; t.active = true;
  s.publicLaunch.enabled = true;
  const r = validate(s);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const ready = launchReadiness(s);
  assert.equal(ready.launchReady, true);
  assert.deepEqual(ready.mandatoryGatesClosed, []);
  assert.deepEqual(ready.blockingFeatures, []);
});
test("a closed mandatory prerequisite still blocks launch and bookability", () => {
  for (const gate of MANDATORY_LAUNCH_GATES) {
    const s = openMandatory(fresh());
    s.gates[gate] = { verified: false, evidenceRef: null };
    s.publicLaunch.enabled = true;
    assert.ok(codes(s).includes("gate-closed"), gate);
    const b = openMandatory(fresh());
    b.gates[gate] = { verified: false, evidenceRef: null };
    tour(b, "giants-causeway").bookable = true;
    assert.ok(codes(b).includes("gate-closed"), gate);
    assert.ok(launchReadiness(s).mandatoryGatesClosed.includes(gate));
  }
});
test("enabling a feature while its gate is closed is still refused and blocks launch readiness", () => {
  const a = openMandatory(fresh()); a.commercial.advertising.tourAdsEnabled = true;
  assert.ok(codes(a).includes("gate-closed"));
  assert.deepEqual(launchReadiness(a).blockingFeatures, ["advertisingApproval"]);
  const g = openMandatory(fresh()); g.commercial.wording.guidingClaimsAllowed = true;
  assert.ok(codes(g).includes("gate-closed"));
  const r = openMandatory(fresh()); r.commercial.itinerary.customItinerariesEnabled = true;
  assert.ok(codes(r).includes("gate-closed"));
  a.gates.advertisingApproval = { verified: true, evidenceRef: "ADS-OK" };
  assert.ok(!codes(a).includes("gate-closed"));
});
test("cruise tours are a feature: they need the harbour pick-up gate only when in use", () => {
  const s = openMandatory(fresh());
  const c = tour(s, "cruise-express");
  c.cruiseScope = "belfastOnly"; c.bookable = true;
  assert.ok(codes(s).includes("gate-closed"));
  s.gates.harbourPickupAccess = { verified: true, evidenceRef: "HARBOUR-1" };
  assert.ok(!codes(s).includes("gate-closed"));
  assert.equal(launchReadiness(openMandatory(fresh())).features.harbourPickupAccess.blocking, false); // cruise not in use
});
test("readiness endpoint reports blockers and needs owner auth", async () => {
  const { call } = makeDO();
  assert.equal((await call("GET", "/readiness", undefined, { key: null })).status, 401);
  const r = await call("GET", "/readiness");
  assert.equal(r.status, 200);
  assert.equal(r.body.launchReady, false);
  assert.deepEqual(r.body.mandatoryGatesClosed, [...MANDATORY_LAUNCH_GATES]);
  assert.equal(r.body.features.advertisingApproval.blocking, false);
});

// ---- 2. agreed provisional prices, 50% tier, preserved published prices ----
test("six agreed provisional prices are seeded", () => {
  const s = fresh();
  assert.equal(tour(s, "giants-causeway").provisionalPricePence.value, 44500);
  assert.equal(tour(s, "game-of-thrones").provisionalPricePence.value, 44500);
  assert.equal(tour(s, "belfast-city").provisionalPricePence.value, 24500);
  assert.equal(tour(s, "cruise-express").provisionalPricePence.value, 29500);
  assert.equal(tour(s, "cruise-causeway").provisionalPricePence.value, 49500);
  assert.equal(tour(s, "antrim-coast").variants.find((v) => v.kind === "full-day").provisionalPricePence.value, 42500);
  assert.equal(tour(s, "cruise-express").name, "Cruise Express");
  assert.equal(tour(s, "cruise-causeway").name, "Cruise Causeway");
  for (const t of s.commercial.tours) for (const u of [t, ...t.variants]) if (u.provisionalPricePence.value !== null) assert.equal(u.provisionalPricePence.provisional, true);
});
test("existing published prices and URLs are preserved", () => {
  const s = fresh();
  assert.deepEqual(s.commercial.tours.filter((t) => t.slug).map((t) => [t.slug, t.publishedPricePence]), [["giants-causeway", 39500], ["belfast-city", 19500], ["game-of-thrones", 39500], ["antrim-coast", 19500]]);
  const a = tour(s, "antrim-coast");
  assert.deepEqual(a.variants.map((v) => [v.kind, v.publishedPricePence]), [["half-day", 19500], ["full-day", 39500]]);
  assert.ok(s.commercial.tours.filter((t) => t.cruise).every((t) => t.slug === null && t.publishedPricePence === null));
});
test("the unagreed Antrim half-day price is not invented", () => {
  assert.equal(tour(fresh(), "antrim-coast").variants.find((v) => v.kind === "half-day").provisionalPricePence.value, null);
});
test("50% cancellation refund tier is seeded and validated", () => {
  const s = fresh();
  assert.equal(s.commercial.cancellation.partialRefundPercent.value, 50);
  assert.equal(s.commercial.cancellation.fullRefundHoursBefore.value, 48);
  assert.equal(s.commercial.cancellation.partialRefundHoursBefore.value, 24);
  s.commercial.cancellation.partialRefundPercent.value = 120;
  assert.ok(codes(s).includes("range"));
});
test("genuinely unapproved durations, mileage, positioning and costs stay unconfigured", () => {
  const s = fresh();
  for (const t of s.commercial.tours) for (const u of [t, ...t.variants]) for (const k of ["durationHours", "estimatedMiles", "homePositioningMiles", "homePositioningHours"]) assert.equal(u[k].value, null, `${t.id}.${k}`);
  for (const k of ["paymentProcessingFeePercent", "paymentProcessingFeeFixedPence", "administrativeCostPencePerBooking", "advertisingAcquisitionCostPence", "selfDrivingHourlyEarningsTargetPence", "subcontractorSuppliedVehicleFeePercent"]) assert.equal(s.commercial.finance[k].value, null, k);
  assert.equal(s.commercial.finance.vehicleRunningCostPencePerMile.value, 38);
});

// ---- 3. positioning and vehicle-supply models (see profitability.test.js) ----
test("positioning plus tour length cannot exceed the maximum working day", () => {
  const s = fresh();
  const t = tour(s, "giants-causeway");
  t.durationHours.value = 10; t.homePositioningHours.value = 2;
  assert.ok(codes(s).includes("duration-bounds"));
  t.homePositioningHours.value = 1;
  assert.ok(!codes(s).includes("duration-bounds"));
});
test("driver models distinguish subcontractor own vehicle from supplied vehicle", () => {
  const s = fresh();
  assert.deepEqual(Object.keys(s.commercial.drivers.models), ["owner", "paidDriver", "subcontractorOwnVehicle", "subcontractorSuppliedVehicle"]);
  s.commercial.drivers.models.subcontractor = true;
  assert.ok(codes(s).includes("unknown-field"));
});

// ---- 4. half-day / full-day variants, no duplicate products ----
test("antrim half/full day is one product with two variants", () => {
  const s = fresh();
  assert.equal(s.commercial.tours.filter((t) => t.slug === "antrim-coast").length, 1);
  assert.equal(tour(s, "antrim-coast").variants.length, 2);
  assert.equal(validate(s).ok, true);
});
test("a duplicate product (same slug) is rejected", () => {
  const s = fresh();
  const dup = structuredClone(tour(s, "antrim-coast")); dup.id = "antrim-coast-half";
  s.commercial.tours.push(dup);
  assert.ok(codes(s).includes("duplicate-product"));
});
test("duplicate or unknown variant kinds and ids are rejected", () => {
  const a = fresh(); tour(a, "antrim-coast").variants[1].kind = "half-day"; assert.ok(codes(a).includes("duplicate-variant"));
  const b = fresh(); tour(b, "antrim-coast").variants[1].id = "half-day"; assert.ok(codes(b).includes("id"));
  const c = fresh(); tour(c, "antrim-coast").variants[1].kind = "quarter-day"; assert.ok(codes(c).includes("variant-kind"));
  const d = fresh(); tour(d, "antrim-coast").variants[0].extra = 1; assert.ok(codes(d).includes("unknown-field"));
});
test("with variants, figures live on the variants, not the tour", () => {
  const s = fresh();
  tour(s, "antrim-coast").provisionalPricePence.value = 42500;
  assert.ok(codes(s).includes("variant-level"));
  const b = openMandatory(fresh());
  tour(b, "antrim-coast").bookable = true;
  assert.ok(codes(b).includes("variant-level"));
});
test("tour 'from' price must equal its cheapest variant's published price", () => {
  const s = fresh();
  tour(s, "antrim-coast").publishedPricePence = 24500;
  assert.ok(codes(s).includes("price"));
});
test("variants are bookable independently once prerequisites are met", () => {
  const s = openMandatory(fresh());
  const full = tour(s, "antrim-coast").variants.find((v) => v.kind === "full-day");
  full.bookable = true;
  assert.ok(!codes(s).includes("gate-closed"));
  const half = tour(s, "antrim-coast").variants.find((v) => v.kind === "half-day");
  half.bookable = true; // no agreed price yet
  assert.ok(codes(s).includes("gate-closed"));
});
test("profitability is per variant and asks for the variant when a tour has several", () => {
  const s = fresh();
  assert.equal(profitability(s, "antrim-coast", "owner").status, "variant-required");
  assert.equal(profitability(s, "antrim-coast", "owner", "nope").status, "unknown-variant");
  assert.equal(profitability(s, "giants-causeway", "owner", "full-day").status, "unknown-variant");
  const f = s.commercial.finance;
  f.paymentProcessingFeePercent.value = 2; f.paymentProcessingFeeFixedPence.value = 20; f.administrativeCostPencePerBooking.value = 100; f.advertisingAcquisitionCostPence.value = 1000; f.selfDrivingHourlyEarningsTargetPence.value = 2000;
  const full = tour(s, "antrim-coast").variants.find((v) => v.id === "full-day");
  full.durationHours.value = 8; full.estimatedMiles.value = 140; full.homePositioningMiles.value = 20; full.homePositioningHours.value = 1;
  const r = profitability(s, "antrim-coast", "owner", "full-day");
  assert.equal(r.status, "ok");
  assert.equal(r.pricePence, 42500);
  assert.equal(profitability(s, "antrim-coast", "owner", "half-day").status, "unconfigured"); // no agreed price/figures
});
test("margin override can be recorded per variant", () => {
  const s = fresh();
  const f = s.commercial.finance;
  f.paymentProcessingFeePercent.value = 2; f.paymentProcessingFeeFixedPence.value = 20; f.administrativeCostPencePerBooking.value = 100; f.advertisingAcquisitionCostPence.value = 1000; f.selfDrivingHourlyEarningsTargetPence.value = 2000;
  const full = tour(s, "antrim-coast").variants.find((v) => v.id === "full-day");
  full.durationHours.value = 8; full.estimatedMiles.value = 1000; full.homePositioningMiles.value = 20; full.homePositioningHours.value = 1;
  assert.ok(codes(s).includes("margin-below-floor"));
  f.marginOverrides.push({ tourId: "antrim-coast", variantId: "full-day", model: "owner", reason: "Approved by owner", recordedAt: new Date().toISOString() });
  assert.ok(!codes(s).includes("margin-below-floor"));
  f.marginOverrides.push({ tourId: "antrim-coast", variantId: "bogus", model: "owner", reason: "Approved by owner", recordedAt: new Date().toISOString() });
  assert.ok(codes(s).includes("override"));
});

// ---- schema upgrade of data stored by the first WP-B1 deploy ----
test("a settings document stored under the old schema is upgraded by appending a new version", async () => {
  const { call, storage } = makeDO();
  await call("GET", "/settings"); // seeds v1 under the current schema
  const old = storage.map.get("v:00000001");
  old.settings.schema = "tour-settings/1";
  const { snapshotHash } = await import("../src/canonical.js");
  old.hash = await snapshotHash(1, old.settings);
  const r = await call("GET", "/settings");
  assert.equal(r.body.version, 2);
  assert.equal(r.body.settings.schema, "tour-settings/2");
  assert.equal((await call("GET", "/versions/1")).body.settings.schema, "tour-settings/1"); // history retained
  const entries = (await call("GET", "/audit")).body.entries;
  assert.equal(entries[entries.length - 1].action, "schema-upgrade");
  assert.equal((await call("POST", "/rollback", { baseVersion: 2, targetVersion: 1, reason: "try old schema" })).status, 422); // old schema cannot be restored
});

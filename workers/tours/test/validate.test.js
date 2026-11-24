import test from "node:test";
import assert from "node:assert/strict";
import { validate, effectiveReturnBufferMinutes } from "../src/validate.js";
import { fresh, withOpenGates } from "./helpers.js";

const codes = (s) => validate(s).errors.map((e) => e.code);

test("seed settings are valid and launch is closed", () => {
  const r = validate(fresh());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const s = fresh();
  assert.equal(s.publicLaunch.enabled, false);
  assert.ok(Object.values(s.gates).every((g) => g.verified === false && g.evidenceRef === null));
  assert.ok(s.commercial.tours.every((t) => !t.bookable && !t.instantBooking));
});

// ---- Amendment 1: traffic contingency ----
test("traffic contingency defaults to 30 minutes, provisional and owner-configurable", () => {
  const s = fresh();
  assert.equal(s.commercial.cruise.trafficContingencyMinimumMinutes.value, 30);
  assert.equal(s.commercial.cruise.trafficContingencyMinimumMinutes.provisional, true);
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = 45;
  assert.equal(validate(s).ok, true);
});
test("traffic contingency below 30 warns but is never below zero/invalid", () => {
  const s = fresh();
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = 20;
  const r = validate(s);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === "below-provisional"));
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = 0;
  assert.ok(codes(s).includes("range"));
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = null;
  assert.ok(codes(s).includes("required"));
});
test("engine may increase but never reduce contingency; never below configured minimum", () => {
  const s = fresh();
  const base = effectiveReturnBufferMinutes(s, "longDistance", 0);
  assert.equal(base, 90 + 30);
  assert.equal(effectiveReturnBufferMinutes(s, "longDistance", 55), 90 + 55); // increase honoured
  assert.equal(effectiveReturnBufferMinutes(s, "longDistance", 10), 90 + 30); // reduction ignored
  assert.equal(effectiveReturnBufferMinutes(s, "longDistance", -50), 90 + 30);
  assert.equal(effectiveReturnBufferMinutes(s, "longDistance", NaN), 90 + 30);
  s.commercial.cruise.trafficContingencyMinimumMinutes.value = 45;
  assert.equal(effectiveReturnBufferMinutes(s, "longDistance", 30), 90 + 45);
  assert.equal(effectiveReturnBufferMinutes(s, "belfastOnly", 999), 60);
});
test("engine reduction flag cannot be enabled", () => {
  const s = fresh();
  s.mandatory.cruise.engineMayReduceTrafficContingency = true;
  assert.ok(codes(s).includes("mandatory-cruise"));
});
test("60/90-minute return buffers cannot be lowered", () => {
  for (const [scope, bad] of [["belfastOnly", 59], ["longDistance", 89], ["belfastOnly", 0]]) {
    const s = fresh();
    s.mandatory.cruise.returnBufferMinutes[scope] = bad;
    assert.ok(codes(s).includes("mandatory-cruise-buffer"), `${scope}=${bad}`);
  }
  const s = fresh();
  s.mandatory.cruise.returnBufferMinutes.longDistance = 120; // increasing is allowed
  assert.equal(validate(s).ok, true);
});
test("cruise all-aboard must be customer-confirmed; active cruise tour needs a scope", () => {
  const s = fresh();
  s.mandatory.cruise.allAboardTimeCustomerConfirmed = false;
  assert.ok(codes(s).includes("mandatory-cruise"));
  const t = fresh();
  const cruise = t.commercial.tours.find((x) => x.cruise);
  cruise.active = true;
  assert.ok(codes(t).includes("cruise-scope"));
  cruise.cruiseScope = "longDistance";
  assert.equal(validate(t).ok, true);
});

// ---- Amendment 2: independent finance inputs ----
test("finance inputs are independent leaves; unknown ones stay unconfigured", () => {
  const f = fresh().commercial.finance;
  assert.equal(f.vehicleRunningCostPencePerMile.value, 38);
  assert.equal(f.vehicleRunningCostPencePerMile.provisional, true);
  for (const k of ["paymentProcessingFeePercent", "paymentProcessingFeeFixedPence", "administrativeCostPencePerBooking", "advertisingAcquisitionCostPence", "selfDrivingHourlyEarningsTargetPence"]) {
    assert.equal(f[k].value, null, k);
    assert.equal(f[k].provisional, true);
  }
});
test("each finance input is validated on its own", () => {
  const cases = [["vehicleRunningCostPencePerMile", -1], ["paymentProcessingFeePercent", 101], ["paymentProcessingFeeFixedPence", 1.5], ["administrativeCostPencePerBooking", -5], ["advertisingAcquisitionCostPence", "x"], ["selfDrivingHourlyEarningsTargetPence", -1]];
  for (const [k, v] of cases) {
    const s = fresh();
    s.commercial.finance[k].value = v;
    assert.ok(codes(s).includes("range"), k);
  }
  const ok = fresh();
  ok.commercial.finance.paymentProcessingFeePercent.value = 1.5;
  ok.commercial.finance.administrativeCostPencePerBooking.value = 200;
  ok.commercial.finance.advertisingAcquisitionCostPence.value = 1500;
  ok.commercial.finance.selfDrivingHourlyEarningsTargetPence.value = 2500;
  assert.equal(validate(ok).ok, true);
});
test("airport profitability settings are not inherited", () => {
  const s = fresh();
  const txt = JSON.stringify(s).toLowerCase();
  for (const bad of ["airport", "pricing-config", "point-to-point", "drivecharge", "tierfare"]) assert.ok(!txt.includes(bad) || bad === "airport" && !txt.includes("airportpricing"), bad);
  s.commercial.finance.airportPricingConfig = { x: 1 };
  assert.ok(codes(s).includes("unknown-field"));
  const t = fresh();
  t.commercial.wording.note = "uses src/lib/point-to-point-premium.ts";
  assert.ok(validate(t).errors.length > 0);
});

// ---- Amendment 3: max four passengers, no 7-seater ----
test("maximum four passengers; capacity cannot be raised", () => {
  const s = fresh();
  assert.equal(s.mandatory.capacity.maxPassengers, 4);
  s.mandatory.capacity.maxPassengers = 5;
  assert.ok(codes(s).includes("mandatory-capacity"));
  const v = fresh();
  v.commercial.vehicles.push({ id: "v1", label: "Saloon", maxPassengers: 7, luggageRules: [], manualReviewWhenUncertain: true });
  assert.ok(codes(v).includes("mandatory-capacity"));
  const w = fresh();
  w.commercial.vehicles.push({ id: "v1", label: "Saloon", maxPassengers: 4, luggageRules: [{ passengers: 5, suitcases: 1, cabinBags: 1 }], manualReviewWhenUncertain: true });
  assert.ok(codes(w).includes("luggage"));
});
test("no 7-seater, MPV, minibus or fleet wording anywhere in settings", () => {
  for (const phrase of ["7-seater", "7 seater", "seven-seater", "MPV", "minibus", "our fleet", "people carrier"]) {
    const s = fresh();
    s.commercial.cruise.terminals.push(phrase);
    assert.ok(codes(s).includes("forbidden-wording"), phrase);
  }
  assert.ok(!/7[\s-]*seat|seven|mpv|minibus|fleet/i.test(JSON.stringify(fresh())), "seed contains forbidden wording");
  const k = fresh();
  k.commercial["sevenSeaterPrice"] = 1;
  assert.ok(codes(k).includes("unknown-field"));
});

// ---- Amendment 4: synthetic availability only ----
test("availability is synthetic staging fixtures only", () => {
  const s = fresh();
  assert.equal(s.commercial.availability.source, "synthetic-staging-fixture");
  assert.ok(s.commercial.availability.syntheticFixture.every((d) => d.synthetic === true));
  for (const src of ["production-kv", "live", "google-calendar", "airport-availability"]) {
    const t = fresh();
    t.commercial.availability.source = src;
    assert.ok(codes(t).includes("availability-source"), src);
  }
  const u = fresh();
  u.commercial.availability.syntheticFixture[0].synthetic = false;
  assert.ok(codes(u).includes("fixture"));
  const v = fresh();
  v.commercial.availability.liveKvNamespace = "x";
  assert.ok(codes(v).includes("unknown-field"));
});

// ---- Amendment 5: provisional vs mandatory, gates closed ----
test("mandatory protections cannot be switched off", () => {
  const mut = [
    (s) => { s.mandatory.security.ownerOnly = false; },
    (s) => { s.mandatory.security.mobilityPreferencesConsentRequired = false; },
    (s) => { s.mandatory.security.mobilityPreferencesExcludedFromAnalyticsAndAds = false; },
    (s) => { s.mandatory.pickup.outsideNorthernIrelandAllowed = true; },
    (s) => { s.mandatory.drivers.cruiseToursNeedExtraDriverApproval = false; },
    (s) => { s.mandatory.drivers.automaticSubcontractingAllowed = true; },
  ];
  for (const m of mut) { const s = fresh(); m(s); assert.ok(validate(s).errors.length > 0); }
});
test("commercial settings are provisional leaves the owner can change", () => {
  const s = fresh();
  s.commercial.finance.marginFloorPercent.value = 25;
  s.commercial.quotes.validityDays.value = 10;
  s.commercial.availability.maxWorkingDayHours.value = 10;
  assert.equal(validate(s).ok, true);
});
test("gates stay closed: cannot open without evidence; nothing bookable while any gate is closed", () => {
  const s = fresh();
  s.gates.insuranceVerified.verified = true;
  assert.ok(codes(s).includes("gate-evidence"));
  const b = fresh();
  b.commercial.tours[0].bookable = true;
  assert.ok(codes(b).includes("gate-closed"));
  const i = fresh();
  i.commercial.tours[0].instantBooking = true;
  assert.ok(codes(i).includes("gate-closed"));
  const p = fresh();
  p.publicLaunch.enabled = true;
  assert.ok(codes(p).includes("gate-closed"));
  const a = fresh();
  a.commercial.advertising.tourAdsEnabled = true;
  assert.ok(codes(a).includes("gate-closed"));
  const g = fresh();
  g.commercial.wording.guidingClaimsAllowed = true;
  assert.ok(codes(g).includes("gate-closed"));
});
test("with every gate verified and a price, a tour may become bookable", () => {
  const s = withOpenGates(fresh());
  const t = s.commercial.tours.find((x) => x.publishedPricePence);
  t.provisionalPricePence = { value: t.publishedPricePence, provisional: true };
  t.bookable = true;
  assert.ok(!codes(s).includes("gate-closed"), JSON.stringify(validate(s).errors));
});
test("Google Ads API stays disabled and tours excluded from airport conversions", () => {
  const s = fresh();
  s.commercial.advertising.googleAdsApiEnabled = true;
  assert.ok(codes(s).includes("ads"));
  const t = fresh();
  t.commercial.advertising.excludeFromAirportConversions = false;
  assert.ok(codes(t).includes("ads"));
});
test("wording: private local driver; no guiding claims; only Belfast Harbour", () => {
  const s = fresh();
  s.commercial.cruise.pickupInstructions = { value: "Meet your professional tour guide", provisional: true };
  assert.ok(codes(s).includes("guiding-claim"));
  const t = fresh();
  t.commercial.wording.driverTerm = "tour guide";
  assert.ok(codes(t).includes("wording"));
  const p = fresh();
  p.commercial.cruise.port = "dublin-port";
  assert.ok(codes(p).includes("port"));
});

// ---- structure ----
test("unknown fields, missing fields, wrong types and oversize text are rejected", () => {
  const a = fresh(); a.extra = 1; assert.ok(codes(a).includes("unknown-field"));
  const b = fresh(); delete b.gates; assert.ok(codes(b).includes("missing-field"));
  const c = fresh(); c.commercial.tours[0].publishedPricePence = 39500.5; assert.ok(codes(c).includes("price"));
  const d = fresh(); c.commercial.tours[0].publishedPricePence = 0; assert.ok(codes(c).includes("price"));
  const e = fresh(); e.commercial.cruise.terminals.push("x".repeat(3000)); assert.ok(codes(e).includes("too-long"));
  assert.equal(validate(null).ok, false);
  assert.equal(validate([]).ok, false);
});
test("margin floor enforced per tour and model unless owner override has a reason", () => {
  const s = fresh();
  const f = s.commercial.finance;
  f.paymentProcessingFeePercent.value = 1.5; f.paymentProcessingFeeFixedPence.value = 20;
  f.administrativeCostPencePerBooking.value = 100; f.advertisingAcquisitionCostPence.value = 1000; f.selfDrivingHourlyEarningsTargetPence.value = 2000;
  const t = s.commercial.tours.find((x) => x.slug === "belfast-city");
  t.provisionalPricePence = { value: 6000, provisional: true };
  t.durationHours = { value: 4, provisional: true };
  t.estimatedMiles = { value: 120, provisional: true };
  t.homePositioningMiles = { value: 10, provisional: true };
  t.homePositioningHours = { value: 0.5, provisional: true };
  const r = validate(s);
  assert.ok(r.errors.some((e) => e.code === "margin-below-floor"), JSON.stringify(r));
  f.marginOverrides.push({ tourId: t.id, model: "owner", reason: "Loss leader approved", recordedAt: new Date().toISOString() });
  f.marginOverrides.push({ tourId: t.id, model: "paidDriver", reason: "Loss leader approved", recordedAt: new Date().toISOString() });
  f.marginOverrides.push({ tourId: t.id, model: "subcontractorOwnVehicle", reason: "Loss leader approved", recordedAt: new Date().toISOString() });
  f.marginOverrides.push({ tourId: t.id, model: "subcontractorSuppliedVehicle", reason: "Loss leader approved", recordedAt: new Date().toISOString() });
  assert.ok(!validate(s).errors.some((e) => e.code === "margin-below-floor"));
});

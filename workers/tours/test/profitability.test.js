import test from "node:test";
import assert from "node:assert/strict";
import { profitability } from "../src/profitability.js";
import { fresh } from "./helpers.js";

/** Fully configured owner-style scenario on giants-causeway: £445, 8h, 150 miles, 1h / 20 miles home positioning. */
function configured() {
  const s = fresh();
  const f = s.commercial.finance;
  f.paymentProcessingFeePercent.value = 2; f.paymentProcessingFeeFixedPence.value = 20;
  f.administrativeCostPencePerBooking.value = 100; f.advertisingAcquisitionCostPence.value = 1000;
  f.selfDrivingHourlyEarningsTargetPence.value = 2000;
  f.subcontractorSuppliedVehicleFeePercent.value = 45;
  const t = s.commercial.tours.find((x) => x.id === "giants-causeway");
  t.durationHours.value = 8; t.estimatedMiles.value = 150;
  t.homePositioningMiles.value = 20; t.homePositioningHours.value = 1;
  return { s, id: t.id, t };
}

test("unknown financial inputs stay unconfigured (no guessed numbers)", () => {
  const s = fresh();
  const r = profitability(s, "giants-causeway", "owner");
  assert.equal(r.status, "unconfigured");
  assert.ok(r.missing.length >= 6);
  assert.ok(r.missing.includes("tour.homePositioningMiles") && r.missing.includes("tour.homePositioningHours"));
});
test("each missing input is reported independently", () => {
  const { s, id } = configured();
  s.commercial.finance.advertisingAcquisitionCostPence.value = null;
  const r = profitability(s, id, "owner");
  assert.equal(r.status, "unconfigured");
  assert.ok(r.missing.some((m) => /advertising/i.test(m)));
  assert.ok(!r.missing.some((m) => /administrative/i.test(m)));
});
test("home-to-home positioning mileage is charged and its time counts as working time", () => {
  const { s, id } = configured();
  const r = profitability(s, id, "owner");
  assert.equal(r.status, "ok");
  assert.equal(r.totalMiles, 170);
  assert.equal(r.workingHours, 9);
  // vehicle 170*38=6460, fee 2% of 44500=890 + 20, admin 100, ads 1000
  assert.deepEqual(r.breakdown, { vehicle: 6460, labour: 0, processing: 910, admin: 100, advertising: 1000 });
  assert.equal(r.costPence, 6460 + 910 + 100 + 1000);
  assert.equal(r.hourlyEarningsPence, Math.round(r.profitPence / 9)); // 9 hours, not 8
  assert.equal(r.belowHourlyEarningsTarget, false);
});
test("positioning lowers profit versus ignoring it", () => {
  const { s, id, t } = configured();
  const withPos = profitability(s, id, "owner");
  t.homePositioningMiles.value = 0; t.homePositioningHours.value = 0;
  const without = profitability(s, id, "owner");
  assert.ok(withPos.profitPence < without.profitPence);
  assert.ok(withPos.hourlyEarningsPence < without.hourlyEarningsPence + 1);
});
test("missing positioning keeps profitability unconfigured instead of assuming zero", () => {
  const { s, id, t } = configured();
  t.homePositioningMiles.value = null;
  assert.equal(profitability(s, id, "owner").status, "unconfigured");
});
test("changing running cost per mile changes only the vehicle component (incl. positioning miles)", () => {
  const { s, id } = configured();
  const a = profitability(s, id, "owner").costPence;
  s.commercial.finance.vehicleRunningCostPencePerMile.value = 50;
  assert.equal(profitability(s, id, "owner").costPence - a, 170 * 12);
});
test("paid driver (supplied vehicle): wage over working hours incl. positioning, plus vehicle cost", () => {
  const { s, id } = configured();
  const o = profitability(s, id, "owner");
  const p = profitability(s, id, "paidDriver");
  assert.equal(p.costPence - o.costPence, 9 * 1800);
  assert.equal(p.breakdown.vehicle, o.breakdown.vehicle);
});
test("subcontractor with own vehicle: payout covers vehicle; no business vehicle cost", () => {
  const { s, id } = configured();
  const r = profitability(s, id, "subcontractorOwnVehicle");
  assert.equal(r.status, "ok");
  assert.equal(r.breakdown.vehicle, 0);
  assert.equal(r.breakdown.labour, Math.round(44500 * 0.6));
  s.commercial.finance.vehicleRunningCostPencePerMile.value = null; // not needed for this model
  assert.equal(profitability(s, id, "subcontractorOwnVehicle").status, "ok");
});
test("subcontractor driving a supplied vehicle: fee plus the business vehicle cost", () => {
  const { s, id } = configured();
  const own = profitability(s, id, "subcontractorOwnVehicle");
  const supplied = profitability(s, id, "subcontractorSuppliedVehicle");
  assert.equal(supplied.status, "ok");
  assert.equal(supplied.breakdown.vehicle, 6460);
  assert.equal(supplied.breakdown.labour, Math.round(44500 * 0.45));
  assert.notEqual(supplied.costPence, own.costPence);
  s.commercial.finance.vehicleRunningCostPencePerMile.value = null;
  assert.equal(profitability(s, id, "subcontractorSuppliedVehicle").status, "unconfigured");
});
test("supplied-vehicle subcontractor fee is unconfigured until the owner sets it", () => {
  const { s, id } = configured();
  s.commercial.finance.subcontractorSuppliedVehicleFeePercent.value = null;
  const r = profitability(s, id, "subcontractorSuppliedVehicle");
  assert.equal(r.status, "unconfigured");
  assert.ok(r.missing.includes("finance.subcontractorSuppliedVehicleFeePercent"));
});
test("old single 'subcontractor' model no longer exists", () => {
  const { s, id } = configured();
  assert.equal(profitability(s, id, "subcontractor").status, "unknown-model");
});
test("earnings target flag", () => {
  const { s, id } = configured();
  s.commercial.finance.selfDrivingHourlyEarningsTargetPence.value = 999999;
  assert.equal(profitability(s, id, "owner").belowHourlyEarningsTarget, true);
});
test("tours without approved durations/miles are unconfigured, not guessed", () => {
  const s = fresh();
  for (const t of s.commercial.tours.filter((x) => !x.variants.length)) assert.equal(profitability(s, t.id, "owner").status, "unconfigured", t.id);
});

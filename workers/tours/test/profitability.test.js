import test from "node:test";
import assert from "node:assert/strict";
import { profitability } from "../src/profitability.js";
import { fresh } from "./helpers.js";

function configured() {
  const s = fresh();
  const f = s.commercial.finance;
  f.paymentProcessingFeePercent.value = 2; f.paymentProcessingFeeFixedPence.value = 20;
  f.administrativeCostPencePerBooking.value = 100; f.advertisingAcquisitionCostPence.value = 1000;
  f.selfDrivingHourlyEarningsTargetPence.value = 2000;
  const t = s.commercial.tours[0];
  t.provisionalPricePence = { value: 39500, provisional: true };
  t.durationHours = { value: 8, provisional: true };
  t.estimatedMiles = { value: 150, provisional: true };
  return { s, id: t.id };
}

test("unknown financial inputs stay unconfigured (no guessed numbers)", () => {
  const s = fresh();
  const r = profitability(s, s.commercial.tours[0].id, "owner");
  assert.equal(r.status, "unconfigured");
  assert.ok(r.missing.length >= 4);
});
test("each missing input is reported independently", () => {
  const { s, id } = configured();
  s.commercial.finance.advertisingAcquisitionCostPence.value = null;
  const r = profitability(s, id, "owner");
  assert.equal(r.status, "unconfigured");
  assert.ok(r.missing.some((m) => /advertising/i.test(m)));
  assert.ok(!r.missing.some((m) => /administrative/i.test(m)));
});
test("owner model: costs from independent components and hourly earnings", () => {
  const { s, id } = configured();
  const r = profitability(s, id, "owner");
  assert.equal(r.status, "ok");
  // vehicle 150*38=5700, fee 2% of 39500=790 +20, admin 100, ads 1000
  assert.equal(r.costPence, 5700 + 790 + 20 + 100 + 1000);
  assert.equal(r.profitPence, 39500 - r.costPence);
  assert.equal(r.hourlyEarningsPence, Math.round(r.profitPence / 8));
  assert.equal(r.belowHourlyEarningsTarget, false);
});
test("changing running cost per mile changes only the vehicle component", () => {
  const { s, id } = configured();
  const a = profitability(s, id, "owner").costPence;
  s.commercial.finance.vehicleRunningCostPencePerMile.value = 50;
  assert.equal(profitability(s, id, "owner").costPence - a, 150 * 12);
});
test("paid driver adds hourly wage; subcontractor uses ceiling percentage", () => {
  const { s, id } = configured();
  const o = profitability(s, id, "owner");
  const p = profitability(s, id, "paidDriver");
  assert.equal(p.costPence - o.costPence, 8 * 1800);
  const sub = profitability(s, id, "subcontractor");
  assert.ok(sub.status === "ok" || sub.status === "unconfigured");
});
test("earnings target flag", () => {
  const { s, id } = configured();
  s.commercial.finance.selfDrivingHourlyEarningsTargetPence.value = 999999;
  assert.equal(profitability(s, id, "owner").belowHourlyEarningsTarget, true);
});
test("provisional prices are unconfigured for unmapped tours", () => {
  const s = fresh();
  const cruise = s.commercial.tours.find((t) => t.cruise);
  assert.equal(cruise.provisionalPricePence.value, null);
  assert.equal(profitability(s, cruise.id, "owner").status, "unconfigured");
});

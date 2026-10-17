/**
 * Unit checks for Jill / erroneous tracking-status repair planning.
 * Run: npx tsx scripts/check-repair-erroneous-tracking-status.ts
 */
import assert from "node:assert/strict";
import {
  isLivePaidBookingStatus,
  matchesJillMatchettTarget,
  planErroneousTrackingStatusRepair,
} from "../shared/repair-erroneous-tracking-status";

console.log("=== matchesJillMatchettTarget ===");
assert.equal(
  matchesJillMatchettTarget({
    customerName: "Jill Matchett",
    tripDate: "2026-08-23",
    tripTime: "11:30",
  }),
  true,
);
assert.equal(
  matchesJillMatchettTarget({
    customerName: "TEST MANAGE BOOKING",
    tripDate: "2026-08-23",
    tripTime: "11:30",
  }),
  false,
);
assert.equal(
  matchesJillMatchettTarget({
    customerName: "Jill Matchett",
    tripDate: "2026-08-24",
    tripTime: "11:30",
  }),
  false,
);

console.log("=== refuse repair when paid booking truly refunded ===");
{
  const plan = planErroneousTrackingStatusRepair({
    job: {
      token: "t1",
      paymentReference: "pay-jill",
      journeyStatus: "completed",
      refundedAt: "2026-08-19T12:00:00.000Z",
      journeyCompletedAt: "2026-08-19T12:00:00.000Z",
    },
    paidBookingStatus: "refunded",
  });
  assert.equal(plan.shouldRepair, false);
  assert.match(plan.reasons[0] || "", /refusing repair/);
}

console.log("=== clear refundedAt + completed on live confirmed booking ===");
{
  const plan = planErroneousTrackingStatusRepair({
    job: {
      token: "t-jill",
      paymentReference: "pay-jill",
      customerName: "Jill Matchett",
      tripDate: "2026-08-23",
      tripTime: "11:30",
      journeyStatus: "completed",
      journeyCompletedAt: "2026-08-19T20:00:00.000Z",
      trackingStoppedAt: "2026-08-19T20:00:00.000Z",
      refundedAt: "2026-08-19T20:00:00.000Z",
      pairedToken: "token-test",
    },
    paidBookingStatus: "confirmed",
    pairedJobPaymentReference: "pay-test-other",
    tripStillUpcoming: true,
  });
  assert.equal(plan.shouldRepair, true);
  assert.equal(plan.next.journeyStatus, "idle");
  assert.equal(plan.next.refundedAt, undefined);
  assert.equal(plan.next.journeyCompletedAt, undefined);
  assert.equal(plan.next.pairedToken, undefined);
  assert.ok(plan.clearedFields.includes("refundedAt"));
  assert.ok(plan.clearedFields.includes("journeyCompletedAt"));
  assert.ok(plan.clearedFields.includes("pairedToken"));
}

console.log("=== keep same-payment pairedToken ===");
{
  const plan = planErroneousTrackingStatusRepair({
    job: {
      token: "t-out",
      paymentReference: "pay-jill",
      journeyStatus: "idle",
      pairedToken: "t-ret",
    },
    paidBookingStatus: "confirmed",
    pairedJobPaymentReference: "pay-jill",
  });
  assert.equal(plan.shouldRepair, false);
  assert.equal(plan.next.pairedToken, "t-ret");
}

console.log("=== isLivePaidBookingStatus ===");
assert.equal(isLivePaidBookingStatus("confirmed"), true);
assert.equal(isLivePaidBookingStatus("refunded"), false);

console.log("\nAll repair-erroneous-tracking-status checks passed.");

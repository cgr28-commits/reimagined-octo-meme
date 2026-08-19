/**
 * Regression: keep-active refund-test must mark primary tracking refundedAt
 * while foreign pairedToken decoy stays untouched.
 *
 * Run: npx tsx scripts/check-refund-test-primary-tracking-mark.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  refundTestIsolationDecoyPaymentReference,
  refundTestTrackingIsolationPassed,
} from "../shared/refund-test-isolation";
import { shouldMarkTrackingJobsOnRefundSideEffects } from "../shared/refund-tracking-side-effects";
import { selectTrackingJobsForRefundMark } from "../shared/tracking";
import type { TrackingJobRecord } from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseJob(
  overrides: Partial<TrackingJobRecord> & Pick<TrackingJobRecord, "token" | "paymentReference">,
): TrackingJobRecord {
  return {
    createdAt: "2026-08-19T22:00:00.000Z",
    customerName: "REFUND TEST (Owner)",
    customerMobile: "07700000000",
    pickupLabel: "REFUND TEST",
    dropoffLabel: "REFUND TEST",
    tripDate: "2026-08-19",
    tripTime: "12:00",
    pickupAt: "2026-08-19T12:00",
    sharingActive: false,
    journeyStatus: "idle",
    ...overrides,
  };
}

console.log("=== side-effect gate: when to mark tracking ===");
{
  assert.equal(
    shouldMarkTrackingJobsOnRefundSideEffects({ cancelBooking: true, isRefundTest: false }),
    true,
    "cancel+refund marks tracking",
  );
  assert.equal(
    shouldMarkTrackingJobsOnRefundSideEffects({ cancelBooking: false, isRefundTest: false }),
    false,
    "real keep-active refund must NOT mark tracking",
  );
  assert.equal(
    shouldMarkTrackingJobsOnRefundSideEffects({ cancelBooking: false, isRefundTest: true }),
    true,
    "isRefundTest keep-active MUST mark tracking (isolation harness)",
  );
  assert.equal(
    shouldMarkTrackingJobsOnRefundSideEffects({ cancelBooking: true, isRefundTest: true }),
    true,
  );
  console.log("OK  gate preserves real keep-active; enables refund-test keep-active");
}

console.log("=== simulate refund-test isolation after mark ===");
{
  const paymentRef = "TAAA4VFZVLT";
  const decoyRef = refundTestIsolationDecoyPaymentReference(paymentRef);
  const primary = baseJob({
    token: "tok-primary-test",
    paymentReference: paymentRef,
    pairedToken: "tok-decoy-test",
    customerName: "REFUND TEST (Owner)",
  });
  const decoy = baseJob({
    token: "tok-decoy-test",
    paymentReference: decoyRef,
    pairedToken: "tok-primary-test",
    customerName: "REFUND TEST ISOLATION DECOY",
    journeyLeg: "return",
  });

  // What markTrackingJobRefunded would select for the primary token:
  const toMark = selectTrackingJobsForRefundMark({
    primary,
    relatedByPaymentRef: [primary],
    pairedJob: decoy,
  });
  assert.deepEqual(
    toMark.map((j) => j.token),
    ["tok-primary-test"],
  );

  // Apply refundedAt only to selected jobs (mirrors markTrackingJobRefunded).
  const refundedAt = "2026-08-19T22:40:00.000Z";
  const afterPrimary = { ...primary, refundedAt };
  const afterDecoy = { ...decoy }; // untouched

  const result = refundTestTrackingIsolationPassed({
    primaryRefundedAt: afterPrimary.refundedAt,
    decoyRefundedAt: afterDecoy.refundedAt ?? null,
    primaryPaymentReference: paymentRef,
    decoyPaymentReference: decoyRef,
  });
  assert.equal(result.ok, true);
  assert.match(result.reason, /^PASS/);
  console.log("OK  primary refunded + decoy untouched → isolation PASS");
}

console.log("=== reproduce pre-fix symptom (primary never marked) ===");
{
  const paymentRef = "TAAA4VFZVLT";
  const decoyRef = refundTestIsolationDecoyPaymentReference(paymentRef);
  // Old gate: cancelBooking=false && !mark → primary stays without refundedAt
  const oldWouldMark = shouldMarkTrackingJobsOnRefundSideEffects({
    cancelBooking: false,
    isRefundTest: false, // simulating if we forgot isRefundTest on the gate
  });
  assert.equal(oldWouldMark, false);

  const result = refundTestTrackingIsolationPassed({
    primaryRefundedAt: null,
    decoyRefundedAt: null,
    primaryPaymentReference: paymentRef,
    decoyPaymentReference: decoyRef,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "primary_not_marked_refunded_yet");
  console.log("OK  reproduces live UI reason when tracking mark was skipped");
}

console.log("=== source wiring ===");
{
  const handlers = read("workers/addresses/src/refund-handlers.ts");
  assert.match(handlers, /shouldMarkTrackingJobsOnRefundSideEffects/);
  assert.match(handlers, /record\.isRefundTest/);
  assert.match(handlers, /shouldMarkTrackingRefunded/);

  const testHandlers = read("workers/addresses/src/refund-test-handlers.ts");
  assert.match(testHandlers, /cancelBooking: false/);
  assert.match(testHandlers, /full_refund_keep_active|partial_refund_keep_active/);

  const shared = read("shared/refund-tracking-side-effects.ts");
  assert.match(shared, /isRefundTest/);
  console.log("OK  refund-handlers use shared gate; refund-test keeps cancelBooking false");
}

console.log("\nAll refund-test primary tracking mark checks passed.");

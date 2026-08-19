/**
 * Unit checks for owner-only refund-test tracking isolation helpers.
 * Run: npx tsx scripts/check-refund-test-tracking-isolation.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isRefundTestIsolationDecoyPaymentReference,
  refundTestIsolationDecoyPaymentReference,
  refundTestTrackingIsolationPassed,
} from "../shared/refund-test-isolation";
import { selectTrackingJobsForRefundMark } from "../shared/tracking";
import type { TrackingJobRecord } from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== decoy paymentReference naming ===");
{
  const decoy = refundTestIsolationDecoyPaymentReference("TAA123");
  assert.equal(decoy, "REFUND-TEST-ISOLATION-DECOY:TAA123");
  assert.equal(isRefundTestIsolationDecoyPaymentReference(decoy), true);
  assert.equal(isRefundTestIsolationDecoyPaymentReference("TAA123"), false);
  console.log("OK  decoy refs are tagged and cannot collide with SumUp ids");
}

console.log("=== isolation pass/fail after refund mark ===");
{
  const pass = refundTestTrackingIsolationPassed({
    primaryRefundedAt: "2026-08-19T22:00:00.000Z",
    decoyRefundedAt: null,
    primaryPaymentReference: "PAY-TEST",
    decoyPaymentReference: refundTestIsolationDecoyPaymentReference("PAY-TEST"),
  });
  assert.equal(pass.ok, true);

  const fail = refundTestTrackingIsolationPassed({
    primaryRefundedAt: "2026-08-19T22:00:00.000Z",
    decoyRefundedAt: "2026-08-19T22:00:01.000Z",
    primaryPaymentReference: "PAY-TEST",
    decoyPaymentReference: refundTestIsolationDecoyPaymentReference("PAY-TEST"),
  });
  assert.equal(fail.ok, false);
  assert.match(fail.reason, /FAIL_decoy_marked_refunded/);
  console.log("OK  pass when decoy untouched; fail when foreign pairedToken bleed marks decoy");
}

console.log("=== selectTrackingJobsForRefundMark ignores foreign decoy ===");
{
  const primary: TrackingJobRecord = {
    token: "tok-primary",
    createdAt: "2026-08-19T10:00:00.000Z",
    customerName: "REFUND TEST (Owner)",
    customerMobile: "07700000000",
    pickupLabel: "A",
    dropoffLabel: "B",
    tripDate: "2026-08-19",
    tripTime: "12:00",
    pickupAt: "2026-08-19T12:00",
    paymentReference: "PAY-TEST",
    pairedToken: "tok-decoy",
    sharingActive: false,
    journeyStatus: "idle",
  };
  const decoy: TrackingJobRecord = {
    ...primary,
    token: "tok-decoy",
    customerName: "REFUND TEST ISOLATION DECOY",
    paymentReference: refundTestIsolationDecoyPaymentReference("PAY-TEST"),
    pairedToken: "tok-primary",
  };
  const selected = selectTrackingJobsForRefundMark({
    primary,
    relatedByPaymentRef: [primary],
    pairedJob: decoy,
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.token, "tok-primary");
  console.log("OK  foreign decoy pairedToken is ignored by refund mark selector");
}

console.log("=== source wiring ===");
{
  const handlers = read("workers/addresses/src/refund-test-handlers.ts");
  assert.match(handlers, /ensureRefundTestIsolationTrackingPair/);
  assert.match(handlers, /isRefundTestEnsureTrackingPath/);
  assert.match(handlers, /Isolation tracking can only be attached to isRefundTest/);
  assert.match(handlers, /never fuzzy/i);

  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /ensureRefundTestIsolationTrackingPair/);
  assert.match(store, /REFUND TEST ISOLATION DECOY/);
  assert.match(store, /isRefundTest/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /paid-bookings-refund-test-ensure-tracking/);
  assert.match(index, /handleRefundTestEnsureTrackingRequest/);

  const ui = read("src/components/OwnerRefundTestClient.tsx");
  assert.match(ui, /Attach tracking isolation jobs/);
  assert.match(ui, /ensureRefundTestIsolationTracking/);

  const api = read("src/lib/refund-test-api.ts");
  assert.match(api, /ensure-tracking/);
  console.log("OK  owner-only ensure-tracking endpoint + UI wired");
}

console.log("\nAll refund-test tracking isolation checks passed.");

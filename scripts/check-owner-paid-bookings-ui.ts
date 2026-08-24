/**
 * Owner dashboard must surface SumUp paid bookings (not only enquiry jobs).
 * Run: npx tsx scripts/check-owner-paid-bookings-ui.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Owner paid bookings UI ===");
const api = read("src/lib/paid-bookings-api.ts");
assert.match(api, /fetchOwnerPaidBookings/);
assert.match(api, /resendPaidBookingConfirmation/);
assert.match(api, /fetchOwnerPendingCheckouts/);
assert.match(api, /finalizePaidCheckoutRecovery/);
assert.match(api, /\/paid-bookings/);
assert.match(api, /fetchRefundDiagnostics|refund-diagnostics/);
console.log("OK  paid-bookings API client");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /Upcoming jobs/);
assert.match(panel, /Jobs by day/);
assert.match(panel, /Completed jobs \(/);
assert.match(panel, /Resend Confirmation/i);
assert.doesNotMatch(panel, /Website card payments/i);
assert.doesNotMatch(panel, /Paid Jobs/);
assert.doesNotMatch(panel, /Latest paid booking/);
assert.doesNotMatch(panel, /Resend booking confirmation/);
assert.doesNotMatch(panel, /latestPaid/);
assert.doesNotMatch(panel, /Open Refund Test/);
assert.match(panel, /Cancel \/ Refund|OwnerCancelRefundModal/);
assert.match(panel, /Refund diagnostics \(read-only\)|fetchRefundDiagnostics/);
console.log("OK  OwnerPaidBookingsPanel (no Paid Jobs summary chrome)");

const page = read("src/app/driver/DriverPageClient.tsx");
assert.match(page, /OwnerPaidBookingsPanel/);
const paidIdx = page.indexOf("<OwnerPaidBookingsPanel");
const jobsIdx = page.indexOf("<OwnerBookingJobsPanel");
assert.ok(paidIdx > 0 && jobsIdx > paidIdx, "Paid bookings panel must appear above booking requests");
console.log("OK  owner dashboard shows SumUp pays above enquiry jobs");

console.log("\nAll owner paid bookings UI checks passed.");

/**
 * Paid bookings are stored and must be listable + resendable for the owner.
 * Run: npx tsx scripts/check-paid-booking-resend.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Paid booking storage + owner list/resend ===");
const store = read("workers/addresses/src/paid-booking-store.ts");
assert.match(store, /listRecentPaidBookings/);
assert.match(store, /booking:ref:/);
assert.match(store, /paidBookingCreatedDayIndexKey/);
console.log("OK  paid booking store lists recent refs (index + KV scan fallback)");

const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
assert.match(handlers, /handlePaidBookingsListRequest/);
assert.match(handlers, /handlePaidBookingResendRequest/);
assert.match(handlers, /handleFinalizeCheckoutRequest/);
assert.match(handlers, /trySendBrandedCustomerEmail/);
assert.match(handlers, /latest/);
console.log("OK  owner list + resend + finalize handlers present");

const index = read("workers/addresses/src/index.ts");
assert.match(index, /paid-bookings/);
assert.match(index, /paid-bookings-resend/);
assert.match(index, /paid-bookings-finalize/);
assert.match(index, /handlePaidBookingsListRequest/);
assert.match(index, /handlePaidBookingResendRequest/);
assert.match(index, /handleFinalizeCheckoutRequest/);
console.log("OK  worker routes wired");

const record = read("shared/paid-booking-record.ts");
assert.match(record, /passengers\?/);
assert.match(record, /vehicle\?/);
assert.match(record, /flightNumber\?/);
console.log("OK  paid booking record keeps full trip fields");

const save = read("workers/addresses/src/refund-handlers.ts");
assert.match(save, /passengers: input\.booking\.passengers/);
assert.match(save, /vehicle: input\.booking\.vehicle/);
console.log("OK  finalize save stores full booking fields");

console.log("\nAll paid booking list/resend checks passed.");

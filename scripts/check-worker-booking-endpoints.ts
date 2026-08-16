/**
 * Worker bookings/payments URL defaults + CORS origins for Vercel.
 * Run: npx tsx scripts/check-worker-booking-endpoints.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const EXPECTED_BOOKINGS =
  "https://reimagined-octo-meme.cgr28.workers.dev/bookings";
const EXPECTED_WORKER = "https://reimagined-octo-meme.cgr28.workers.dev";
const VERCEL_ORIGIN = "https://my-airport-taxi-ni-quote.vercel.app";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Public Worker booking endpoints ===");
const workerApi = read("src/lib/worker-api.ts");
assert.match(workerApi, new RegExp(EXPECTED_WORKER.replace(/\./g, "\\.")));
assert.match(workerApi, /DEFAULT_WORKER_BOOKINGS/);
assert.match(workerApi, /resolvePaymentsApiUrl/);
assert.match(workerApi, /resolvePaymentsConfirmApiUrl/);
console.log("OK  worker-api defaults to verified production Worker");

const createPayment = read("src/lib/create-payment.ts");
assert.match(createPayment, /resolvePaymentsApiUrl/);
assert.match(createPayment, /from \"@\/lib\/worker-api\"/);
console.log("OK  create-payment uses shared Worker resolver");

const submitBooking = read("src/lib/submit-booking.ts");
assert.match(submitBooking, /resolveBookingsApiUrl/);
assert.match(submitBooking, /from \"@\/lib\/worker-api\"/);
console.log("OK  submit-booking uses shared Worker resolver");

console.log("\n=== CORS origins ===");
const places = read("shared/google-places.ts");
assert.match(places, /www\.myairporttaxini\.co\.uk/);
assert.match(places, /myairporttaxini\.co\.uk/);
assert.match(places, new RegExp(VERCEL_ORIGIN.replace(/\./g, "\\.")));
console.log("OK  ALLOWED_ORIGINS includes custom domain + Vercel production host");

console.log("\n=== Durable secrets sync (names only) ===");
const deploy = read(".github/workflows/deploy-worker.yml");
assert.match(deploy, /RESEND_API_KEY/);
assert.match(deploy, /SUMUP_API_KEY/);
assert.match(deploy, /SUMUP_MERCHANT_CODE/);
assert.match(deploy, /secret put RESEND_API_KEY/);
assert.match(deploy, /secret put SUMUP_API_KEY/);
console.log("OK  deploy-worker syncs Resend + SumUp when GitHub secrets exist");

const index = read("workers/addresses/src/index.ts");
assert.match(index, /email-status/);
assert.match(index, /payment-status/);
assert.match(index, /RESEND_API_KEY/);
console.log("OK  Worker exposes email-status + payment-status diagnostics");

console.log("\nExpected bookings URL:", EXPECTED_BOOKINGS);
console.log("All worker booking endpoint checks passed.");

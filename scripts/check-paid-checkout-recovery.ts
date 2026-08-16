/**
 * Paid checkout recovery + confirmation hardening checks.
 * Run: npx tsx scripts/check-paid-checkout-recovery.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Paid checkout recovery + finalize hardening ===");

const recover = read("workers/addresses/src/recover-paid-checkouts.ts");
assert.match(recover, /recoverPaidCheckout/);
assert.match(recover, /recoverPaidButUnfinalizedCheckouts/);
assert.match(recover, /already_finalized/);
assert.match(recover, /calendar_backfill/);
console.log("OK  recover-paid-checkouts helpers");

const pending = read("workers/addresses/src/pending-checkout-store.ts");
assert.match(pending, /listRecentPendingCheckouts/);
console.log("OK  pending checkout list");

const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
assert.match(finalize, /extractCheckoutIdFromRequest/);
assert.match(finalize, /checkout_uuid/);
console.log("OK  webhook checkout id extraction hardened");

const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
assert.match(handlers, /handleFinalizeCheckoutRequest/);
assert.match(handlers, /handlePendingCheckoutsListRequest/);
assert.match(handlers, /finalize-checkout/);
console.log("OK  owner finalize + pending handlers");

const index = read("workers/addresses/src/index.ts");
assert.match(index, /paid-bookings-finalize/);
assert.match(index, /recoverPaidButUnfinalizedCheckouts/);
assert.match(index, /parseWebhookPayload/);
console.log("OK  worker routes + cron recovery wired");

const confirmed = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
assert.match(confirmed, /Checking your payment/);
assert.doesNotMatch(
  confirmed,
  /if you've just paid, your confirmation email is on its way\. Keep this page as your booking confirmation/i,
);
assert.match(confirmed, /hasPaymentReturn/);
console.log("OK  booking-confirmed does not fake success without payment return");

const deploy = read(".github/workflows/deploy-worker.yml");
assert.match(deploy, /finalize-checkout/);
assert.match(deploy, /preferTestOnePound/);
console.log("OK  deploy recovers PAID-but-unfinalized checkouts");

const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(panel, /Recover PAID checkouts/);
assert.match(panel, /finalizePaidCheckoutRecovery/);
console.log("OK  owner recover UI");

console.log("\nAll paid checkout recovery checks passed.");

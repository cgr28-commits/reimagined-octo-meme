/**
 * Customer confirmation emails must never use FormSubmit first.
 * FormSubmit often returns success for new recipient addresses without delivering.
 * Run: npx tsx scripts/check-customer-confirm-email.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Worker branded customer email (no FormSubmit) ===");
const workerEmail = read("workers/addresses/src/worker-email.ts");
assert.match(workerEmail, /customerDelivery/);
assert.match(workerEmail, /trySendBrandedCustomerEmail/);
assert.match(workerEmail, /never use FormSubmit/);
assert.match(workerEmail, /web3forms-html-autoresponse/);
assert.match(workerEmail, /resend/);

// Customer delivery branch returns before formsubmit is pushed.
const customerBlockMatch = workerEmail.match(
  /if \(customerDelivery\) \{[\s\S]*?return providers;\s*\}/,
);
assert.ok(customerBlockMatch, "customerDelivery provider branch missing");
assert.doesNotMatch(customerBlockMatch[0], /formsubmit/);
console.log("OK  customerDelivery chain excludes FormSubmit");

const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
assert.match(finalize, /trySendBrandedCustomerEmail/);
assert.match(finalize, /buildCustomerConfirmationEmail/);
console.log("OK  paid finalize uses trySendBrandedCustomerEmail");

console.log("\n=== Browser fallback (no FormSubmit for customer invoice) ===");
const browserEmail = read("src/lib/send-paid-booking-email.ts");
assert.match(browserEmail, /autoresponse/);
assert.match(browserEmail, /customerEmail\.html/);
assert.doesNotMatch(
  browserEmail,
  /customerEmailSent = await sendViaFormSubmitEmail/,
);
assert.match(browserEmail, /never use FormSubmit/);
console.log("OK  browser customer path uses Web3Forms HTML autoresponse only");

console.log("\nAll customer confirmation email checks passed.");

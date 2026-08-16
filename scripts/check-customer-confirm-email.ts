/**
 * Paid booking confirmation emails — customer + owner must not rely on FormSubmit first.
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
assert.match(workerEmail, /trySendOwnerOperationalEmail/);
assert.match(workerEmail, /never use FormSubmit/);
assert.match(workerEmail, /web3forms-html-autoresponse/);
assert.match(workerEmail, /resend/);
assert.match(workerEmail, /cloudflare-email/);

// Customer delivery branch returns before formsubmit is pushed.
const customerBlockMatch = workerEmail.match(
  /if \(customerDelivery\) \{[\s\S]*?return providers;\s*\}/,
);
assert.ok(customerBlockMatch, "customerDelivery provider branch missing");
assert.doesNotMatch(customerBlockMatch[0], /formsubmit/);
console.log("OK  customerDelivery chain excludes FormSubmit");

const skipFormSubmitBlock = workerEmail.match(
  /if \(skipFormSubmit\) \{[\s\S]*?return providers;\s*\}/,
);
assert.ok(skipFormSubmitBlock, "preferWorkerProviders / skipFormSubmit branch missing");
assert.doesNotMatch(skipFormSubmitBlock[0], /formsubmit/);
assert.match(skipFormSubmitBlock[0], /cloudflare-email/);
console.log("OK  owner operational chain excludes FormSubmit and includes Cloudflare Email");

const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
assert.match(finalize, /trySendBrandedCustomerEmail/);
assert.match(finalize, /trySendOwnerOperationalEmail/);
assert.match(finalize, /buildCustomerConfirmationEmail/);
assert.match(finalize, /\[Bookings copy\]/);
assert.doesNotMatch(
  finalize,
  /ownerEmailResult = await trySendEmail\(/,
);
console.log("OK  paid finalize uses branded customer + bookings@ invoice copy + owner alert");

console.log("\n=== Browser fallback ===");
const browserEmail = read("src/lib/send-paid-booking-email.ts");
assert.match(browserEmail, /autoresponse/);
assert.match(browserEmail, /customerEmail\.html/);
assert.doesNotMatch(
  browserEmail,
  /customerEmailSent = await sendViaFormSubmitEmail/,
);
assert.match(browserEmail, /never use FormSubmit/);
// Owner: Web3Forms first, FormSubmit only as fallback.
const ownerWeb3Idx = browserEmail.indexOf("let ownerEmailSent = await submitWeb3Forms");
const ownerFormIdx = browserEmail.indexOf("ownerEmailSent = await sendViaFormSubmitEmail");
assert.ok(ownerWeb3Idx > 0, "owner Web3Forms send missing");
assert.ok(ownerFormIdx > ownerWeb3Idx, "owner FormSubmit must be fallback after Web3Forms");
console.log("OK  browser customer = Web3Forms HTML; owner = Web3Forms then FormSubmit");

console.log("\nAll paid confirmation email checks passed.");

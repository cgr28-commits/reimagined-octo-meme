/**
 * Customer-facing cancellation / refund wording consistency.
 * Run: npx tsx scripts/check-cancellation-refund-wording.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAQS } from "../src/lib/data";
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from "../src/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../shared/refund-ops";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Checkout cancellation summary + consent ===");
const consent = read("src/components/BookingTermsConsent.tsx");
assert.match(consent, /Cancellation summary/);
assert.match(
  consent,
  /Cancel more than 24 hours before your scheduled pickup: You’ll receive a full refund/,
);
assert.match(
  consent,
  /Cancel within 24 hours of your scheduled pickup: Your booking is normally\s+non-refundable because your driver and time have already been reserved/,
);
assert.match(
  consent,
  /If we cancel your booking and cannot provide the journey: You’ll receive a full refund/,
);
assert.match(consent, /Your statutory rights are not affected/);
assert.match(
  consent,
  /including the cancellation policy above, and authorise payment of \{fareLabel\}/,
);
assert.match(consent, /My\s+booking is confirmed once payment is completed/);
assert.match(consent, /paymentAmountLabel\?\.trim\(\) \|\| "the displayed fare"/);
assert.doesNotMatch(consent, /£40/);
assert.doesNotMatch(consent, /Terms version:/);
assert.doesNotMatch(consent, /Cancellation policy version:/);
assert.doesNotMatch(consent, /TERMS_LAST_UPDATED/);
assert.doesNotMatch(consent, /CANCELLATION_POLICY_VERSION/);
console.log("OK  checkout summary, dynamic fare consent, no customer-facing version labels");

console.log("\n=== Terms Cancellations & Refunds ===");
const cancelSection = TERMS_SECTIONS.find((s) => s.title === "Cancellations & Refunds") as {
  content?: readonly string[];
  subsections?: ReadonlyArray<{ subtitle?: string; content?: readonly string[] }>;
  footer?: string;
};
assert.ok(cancelSection);
const termsText = [
  ...(cancelSection.content ?? []),
  ...(cancelSection.subsections ?? []).flatMap((sub) => [
    sub.subtitle ?? "",
    ...(sub.content ?? []),
  ]),
  cancelSection.footer ?? "",
].join("\n");
assert.match(termsText, /Cancellation by the customer/);
assert.match(
  termsText,
  /Customers who cancel more than 24 hours before their scheduled pickup will receive a full refund/,
);
assert.match(
  termsText,
  /normally non-refundable because a driver and time have been reserved/,
);
assert.match(termsText, /full or partial refund depending on the circumstances/);
assert.match(termsText, /Cancellation by My Airport Taxi NI/);
assert.match(
  termsText,
  /unable to provide the booked journey, any amount paid for that journey will be refunded in full/,
);
assert.match(
  termsText,
  /Nothing in this cancellation and refund policy affects the customer’s statutory rights/,
);
assert.doesNotMatch(termsText, /reasonable loss directly resulting/);
console.log("OK  terms cancellation section matches published policy");

console.log("\n=== FAQ aligned ===");
const cancelFaq = FAQS.find((f) => /cancel/i.test(f.question));
assert.ok(cancelFaq);
assert.match(cancelFaq!.answer, /full refund/);
assert.match(cancelFaq!.answer, /normally non-refundable/);
assert.match(cancelFaq!.answer, /full or partial refund where appropriate/);
assert.match(cancelFaq!.answer, /statutory rights are not affected/);
console.log("OK  FAQ cancellation answer aligned");

console.log("\n=== Internal version tracking retained ===");
assert.equal(TERMS_LAST_UPDATED, "August 2026 v4");
assert.equal(CANCELLATION_POLICY_VERSION, "August 2026 v3");
assert.match(read("src/components/QuoteCard.tsx"), /cancellationPolicyVersion: CANCELLATION_POLICY_VERSION/);
assert.match(read("src/components/OwnerJourneyEvidenceClient.tsx"), /Cancellation policy version/);
console.log("OK  booking/evidence still store and show versions internally");

console.log("\nAll cancellation/refund wording checks passed.");


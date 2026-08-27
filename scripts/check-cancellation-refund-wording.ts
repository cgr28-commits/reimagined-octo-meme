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
  /Cancel at least 24 hours before your scheduled pickup: You’ll receive a full refund/,
);
assert.match(
  consent,
  /Cancel less than 24 hours before your scheduled pickup: A cancellation charge of up to/,
);
assert.match(consent, /No-shows: A booking will only be treated as a no-show after/);
assert.match(
  consent,
  /The charge will not exceed the reasonable loss caused by the no-show/,
);
assert.match(
  consent,
  /Flight delays: Where a correct flight number has been provided/,
);
assert.match(
  consent,
  /If My Airport Taxi NI cancels the booking and cannot provide the journey: The customer\s+will receive a full refund/,
);
assert.match(consent, /The customer’s statutory rights are not affected/);
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
assert.doesNotMatch(consent, /normally non-refundable/);
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
assert.match(termsText, /At least 24 hours before pickup/);
assert.match(
  termsText,
  /If we receive the cancellation at least 24 hours before the scheduled pickup time, we will issue a full refund of the fare paid/,
);
assert.match(termsText, /Less than 24 hours before pickup/);
assert.match(
  termsText,
  /cancellation charge of up to the full booking price may apply because a driver and time have been reserved specifically for the journey/,
);
assert.match(
  termsText,
  /The cancellation charge will not exceed the reasonable loss directly caused by the cancellation/,
);
assert.match(termsText, /Flight delays/);
assert.match(
  termsText,
  /flight delay will not normally be treated as a cancellation or no-show/,
);
assert.match(termsText, /Cancellations by us/);
assert.match(
  termsText,
  /If we cancel a confirmed booking and cannot provide the journey, we will issue a full refund/,
);
assert.match(termsText, /These terms do not affect the customer’s statutory rights/);
assert.doesNotMatch(termsText, /normally non-refundable/);
console.log("OK  terms cancellation section matches published policy");

console.log("\n=== Terms No-Shows ===");
const noShowSection = TERMS_SECTIONS.find((s) => s.title === "No-Shows") as {
  content?: readonly string[];
  list?: readonly string[];
  contentAfterList?: readonly string[];
  footer?: string;
};
assert.ok(noShowSection);
const noShowText = [
  ...(noShowSection.content ?? []),
  ...(noShowSection.list ?? []),
  ...(noShowSection.contentAfterList ?? []),
  noShowSection.footer ?? "",
].join("\n");
assert.match(
  noShowText,
  /The passenger has not attended the agreed pickup point by the end of the applicable complimentary waiting period described in Section 9/,
);
assert.match(
  noShowText,
  /We have made reasonable attempts to contact the passenger without success/,
);
assert.match(
  noShowText,
  /A no-show charge of up to the full booking price may apply/,
);
assert.match(noShowText, /will not exceed the reasonable loss caused by the no-show/);
assert.doesNotMatch(noShowText, /normally non-refundable/);
console.log("OK  terms no-show section matches published policy");

console.log("\n=== FAQ aligned ===");
const cancelFaq = FAQS.find((f) => /cancel/i.test(f.question));
assert.ok(cancelFaq);
assert.match(cancelFaq!.answer, /at least 24 hours/);
assert.match(cancelFaq!.answer, /cancellation charge of up to the full booking price/);
assert.match(cancelFaq!.answer, /reasonable loss/);
assert.match(cancelFaq!.answer, /statutory rights are not affected/);
assert.doesNotMatch(cancelFaq!.answer, /normally non-refundable/);
console.log("OK  FAQ cancellation answer aligned");

console.log("\n=== Internal version tracking retained ===");
assert.equal(TERMS_LAST_UPDATED, "August 2026 v4");
assert.equal(CANCELLATION_POLICY_VERSION, "August 2026 v3");
assert.match(read("src/components/QuoteCard.tsx"), /cancellationPolicyVersion: CANCELLATION_POLICY_VERSION/);
assert.match(read("src/components/OwnerJourneyEvidenceClient.tsx"), /Cancellation policy version/);
console.log("OK  booking/evidence still store and show versions internally");

console.log("\nAll cancellation/refund wording checks passed.");

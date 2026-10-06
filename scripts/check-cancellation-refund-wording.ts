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
import {
  CANCELLATION_POLICY_PATH,
  CANCELLATION_POLICY_SECTIONS,
  CHECKOUT_CANCELLATION_HEADING,
  CHECKOUT_CANCELLATION_SUMMARY,
  COMPANY_CANCEL_REFUND,
  CONFIRMATION_EMAIL_CANCELLATION_POLICY,
  DEPOSIT_CASH_POLICY_TITLE,
  FAQ_CANCEL_ANSWER,
  AIRPORT_WAITING_FROM_LANDING,
  FLIGHT_DELAY_POLICY,
  FLIGHT_MONITORING_FAQ_ANSWER,
  SIGNIFICANT_FLIGHT_DELAY_LIMIT,
  SIGNIFICANT_FLIGHT_DELAY_POLICY,
  SPECIFIC_DATE_TRANSPORT_NOTE,
  STATUTORY_RIGHTS_NOTE,
  UNDER_24H_CANCEL_CUSTOMER_NOTICE,
  VIEW_FULL_CANCELLATION_POLICY_LABEL,
} from "../shared/cancellation-policy";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const forbiddenCancellationCopy = [
  /cancellation charge of up to the full booking price may apply/,
  /The cancellation charge will not exceed the reasonable loss/,
  /any excess will be refunded/,
  /Any amount paid above our reasonable loss will be refunded/,
];

function assertNoContradictoryCancellationCopy(label: string, text: string) {
  for (const pattern of forbiddenCancellationCopy) {
    assert.doesNotMatch(text, pattern, `${label} still contains contradictory copy: ${pattern}`);
  }
}

console.log("=== Shared 24-hour policy ===");
{
  assert.match(
    CHECKOUT_CANCELLATION_SUMMARY,
    /Cancel more than 24 hours before your scheduled pickup for a refund of the amount actually paid/,
  );
  assert.match(
    CHECKOUT_CANCELLATION_SUMMARY,
    /Cancellations less than 24 hours before pickup are non-refundable/,
  );
  assert.match(STATUTORY_RIGHTS_NOTE, /cannot legally be excluded/);
  assert.match(SPECIFIC_DATE_TRANSPORT_NOTE, /passenger transport on a specific date/);
  assert.match(SPECIFIC_DATE_TRANSPORT_NOTE, /cooling-off right/);
  assert.doesNotMatch(SPECIFIC_DATE_TRANSPORT_NOTE, /you may cancel within 14 days/);
  console.log("OK  shared policy is the simple 24-hour rule");
}

console.log("\n=== Checkout consent links to the policy, without the summary box ===");
{
  const consent = read("src/components/BookingTermsConsent.tsx");
  assert.doesNotMatch(consent, /CHECKOUT_CANCELLATION_HEADING/);
  assert.doesNotMatch(consent, /CHECKOUT_CANCELLATION_SUMMARY/);
  assert.doesNotMatch(consent, /VIEW_FULL_CANCELLATION_POLICY_LABEL/);
  assert.match(consent, /CANCELLATION_POLICY_PATH/);
  assert.match(consent, /href="\/terms\/"/);
  assert.match(consent, /href="\/privacy\/"/);
  assert.match(consent, /Cancellation Policy/);
  assert.match(consent, /I agree to the/);
  assert.doesNotMatch(consent, /proof of agreement/);
  assert.doesNotMatch(consent, /£40/);
  assert.doesNotMatch(consent, /Terms version:/);
  assert.doesNotMatch(consent, /Cancellation policy version:/);
  assert.doesNotMatch(consent, /TERMS_LAST_UPDATED/);
  assert.doesNotMatch(consent, /CANCELLATION_POLICY_VERSION/);
  assert.doesNotMatch(consent, /No-shows: A booking will only be treated as a no-show/);
  assert.doesNotMatch(consent, /reasonable loss/);
  assertNoContradictoryCancellationCopy("checkout consent", consent);
  const page = read("src/app/cancellation/page.tsx");
  assert.match(page, /CHECKOUT_CANCELLATION_HEADING/);
  assert.match(page, /CHECKOUT_CANCELLATION_SUMMARY/);
  console.log("OK  checkout links Terms, Cancellation Policy and Privacy; summary stays on /cancellation/");
}

console.log("\n=== Dedicated Cancellation Policy page ===");
{
  const page = read("src/app/cancellation/page.tsx");
  assert.match(page, /canonical: "\/cancellation\/"/);
  assert.match(page, /CANCELLATION_POLICY_SECTIONS/);
  assert.match(page, /CHECKOUT_CANCELLATION_SUMMARY/);
  assert.match(page, /href="\/terms\/"/);
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /href="\/cancellation\/"/);
  assert.match(footer, /Cancellation Policy/);
  const sitemap = read("public/sitemap.xml");
  assert.match(sitemap, /myairporttaxini\.co\.uk\/cancellation\//);
  assert.match(read("scripts/generate-sitemap.mjs"), /path: "\/cancellation\/"/);
  assert.ok(
    CANCELLATION_POLICY_SECTIONS.some((section) => section.title === DEPOSIT_CASH_POLICY_TITLE),
    "Cancellation Policy page must include Deposit + Cash wording",
  );
  console.log("OK  /cancellation/ page, footer link and sitemap");
}

console.log("\n=== Terms Cancellations & Refunds ===");
{
  const cancelSection = TERMS_SECTIONS.find((s) => s.title === "Cancellations & Refunds") as {
    id?: string;
    content?: readonly string[];
    subsections?: ReadonlyArray<{ subtitle?: string; content?: readonly string[] }>;
    footer?: string;
  };
  assert.ok(cancelSection);
  assert.equal(cancelSection.id, "cancellation");
  const termsText = [
    ...(cancelSection.content ?? []),
    ...(cancelSection.subsections ?? []).flatMap((sub) => [
      sub.subtitle ?? "",
      ...(sub.content ?? []),
    ]),
    cancelSection.footer ?? "",
  ].join("\n");
  assert.match(termsText, /More than 24 hours before pickup/);
  assert.match(
    termsText,
    /If we receive your cancellation more than 24 hours before the scheduled pickup time, we will issue a refund of the amount actually paid/,
  );
  assert.match(termsText, /Less than 24 hours before pickup/);
  assert.match(
    termsText,
    /If we receive your cancellation less than 24 hours before the scheduled pickup time, the booking is non-refundable/,
  );
  assert.match(termsText, /Significant flight delays/);
  assert.match(termsText, new RegExp(SIGNIFICANT_FLIGHT_DELAY_POLICY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(termsText, new RegExp(SIGNIFICANT_FLIGHT_DELAY_LIMIT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(termsText, /will not be treated as a customer cancellation or no-show/);
  assert.doesNotMatch(termsText, /will not normally be treated/);
  assert.equal(FLIGHT_DELAY_POLICY, SIGNIFICANT_FLIGHT_DELAY_POLICY);
  assert.match(termsText, /Deposit \+ Cash bookings/);
  assert.match(termsText, /refund the amount actually paid — the card deposit/);
  assert.match(termsText, /Cancellations by us/);
  assert.match(termsText, new RegExp(COMPANY_CANCEL_REFUND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(termsText, new RegExp(STATUTORY_RIGHTS_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(termsText, new RegExp(SPECIFIC_DATE_TRANSPORT_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assertNoContradictoryCancellationCopy("terms cancellation", termsText);
  const termsPage = read("src/app/terms/page.tsx");
  assert.match(termsPage, /"id" in section \? section\.id/);
  console.log("OK  terms cancellation section matches the simple 24-hour policy");
}

console.log("\n=== Terms No-Shows ===");
{
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
  assert.match(noShowText, /A no-show is non-refundable/);
  assert.doesNotMatch(noShowText, /reasonable loss caused by the no-show/);
  console.log("OK  terms no-show section aligned with non-refundable late cancellation");
}

console.log("\n=== FAQ aligned ===");
{
  const cancelFaq = FAQS.find((f) => /cancel/i.test(f.question));
  assert.ok(cancelFaq);
  assert.equal(cancelFaq!.answer, FAQ_CANCEL_ANSWER);
  assert.match(cancelFaq!.answer, /more than 24 hours/);
  assert.match(cancelFaq!.answer, /non-refundable/);
  assert.match(cancelFaq!.answer, /statutory/);
  assert.match(cancelFaq!.answer, /cooling-off/);
  assert.match(cancelFaq!.answer, /will not be treated as a customer cancellation or no-show/);
  assert.match(cancelFaq!.answer, /more than 24 hours before your scheduled pickup for a refund of the amount actually paid/);
  assert.match(cancelFaq!.answer, /Cancellations less than 24 hours before pickup are non-refundable/);
  assertNoContradictoryCancellationCopy("FAQ", cancelFaq!.answer);
  const flightFaq = FAQS.find((f) => f.question === "Do you monitor flights?");
  assert.ok(flightFaq);
  assert.equal(flightFaq!.answer, FLIGHT_MONITORING_FAQ_ANSWER);
  assert.match(flightFaq!.answer, /60 minutes complimentary waiting from the actual landing time/);
  assert.match(flightFaq!.answer, /will not be treated as a customer cancellation or no-show/);
  assert.match(flightFaq!.answer, /refund in full the amount paid for it/);
  assert.doesNotMatch(flightFaq!.answer, /unlimited waiting/i);
  const delaySection = CANCELLATION_POLICY_SECTIONS.find((section) => section.title === "Significant flight delays");
  assert.ok(delaySection);
  assert.equal(delaySection!.content[0], SIGNIFICANT_FLIGHT_DELAY_POLICY);
  assert.equal(delaySection!.content[1], SIGNIFICANT_FLIGHT_DELAY_LIMIT);
  assert.equal(delaySection!.content[2], AIRPORT_WAITING_FROM_LANDING);
  assert.match(AIRPORT_WAITING_FROM_LANDING, /60 minutes complimentary waiting time from the actual flight landing time/);
  const flightSection = TERMS_SECTIONS.find((section) => section.title === "Significant flight delays") as {
    content?: readonly string[];
  };
  assert.ok(flightSection);
  assert.equal(flightSection.content?.[0], SIGNIFICANT_FLIGHT_DELAY_POLICY);
  assert.equal(flightSection.content?.[1], SIGNIFICANT_FLIGHT_DELAY_LIMIT);
  assert.match(flightSection.content?.[2] ?? "", /60 minutes complimentary waiting time from the actual flight landing time/);
  console.log("OK  FAQ cancellation answer aligned");
}

console.log("\n=== Confirmation and cancellation emails ===");
{
  const notifications = read("shared/booking-notifications.ts");
  assert.match(notifications, /CONFIRMATION_EMAIL_CANCELLATION_POLICY/);
  assert.match(notifications, /CANCELLATION_POLICY_PATH/);
  assert.match(
    notifications,
    /As the cancellation was made within 24 hours of your scheduled pickup time, the fare is non-refundable under our cancellation policy\./,
  );
  assert.match(
    CONFIRMATION_EMAIL_CANCELLATION_POLICY,
    /more than 24 hours before your scheduled pickup for a refund of the amount actually paid/,
  );
  assert.match(CONFIRMATION_EMAIL_CANCELLATION_POLICY, /non-refundable/);
  assert.match(UNDER_24H_CANCEL_CUSTOMER_NOTICE, /this booking is non-refundable/);
  assertNoContradictoryCancellationCopy("booking notifications", notifications);
  console.log("OK  customer emails use the same 24-hour policy");
}

console.log("\n=== Internal version tracking retained ===");
{
  assert.equal(TERMS_LAST_UPDATED, "September 2026 v2");
  assert.equal(CANCELLATION_POLICY_VERSION, "September 2026 v2");
  assert.match(read("src/components/QuoteCard.tsx"), /cancellationPolicyVersion: CANCELLATION_POLICY_VERSION/);
  assert.match(read("src/components/OwnerJourneyEvidenceClient.tsx"), /Cancellation policy version/);
  console.log("OK  booking/evidence still store and show versions internally");
}

void VIEW_FULL_CANCELLATION_POLICY_LABEL;
void CANCELLATION_POLICY_PATH;

console.log("\nAll cancellation/refund wording checks passed.");

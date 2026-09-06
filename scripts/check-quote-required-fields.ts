/**
 * Required-field validation copy and QuoteCard wiring.
 * Run: npx tsx scripts/check-quote-required-fields.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUOTE_REQUIRED_FIELD_MESSAGES } from "../shared/quote-required-field-messages";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Exact required-field messages ===");
{
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.name, "Please enter your name");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.mobile, "Please enter your mobile number");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.mobileInvalid, "Please enter a valid mobile number");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.email, "Please enter your email address");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.emailInvalid, "Please enter a valid email address");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.pickup, "Please select a pickup address");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.destination, "Please select a destination");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.dateTime, "Please select a date and time");
  assert.equal(QUOTE_REQUIRED_FIELD_MESSAGES.flightNumber, "Please enter your flight number");
  assert.equal(
    QUOTE_REQUIRED_FIELD_MESSAGES.terms,
    "Please agree to the Terms & Conditions and Privacy Policy",
  );
  console.log("OK  shared messages match the customer copy");
}

console.log("\n=== QuoteCard uses shared messages + red field UX ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.name/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.mobile/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.mobileInvalid/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.email/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.emailInvalid/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.pickup/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.destination/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.dateTime/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.flightNumber/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.terms/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.passengers/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.suitcases/);
  assert.match(card, /focusFirstInvalidField/);
  assert.match(card, /validateCheckoutRequiredFields/);
  assert.match(card, /aria-invalid=\{Boolean\(customerNameError\)\}/);
  assert.match(card, /aria-invalid=\{Boolean\(mobileNumberError\)\}/);
  assert.match(card, /aria-invalid=\{Boolean\(emailAddressError\)\}/);
  assert.match(card, /aria-invalid=\{Boolean\(tripDateError\)\}/);
  assert.match(card, /disabled=\{paymentLoading \|\| submitted\}/);
  assert.doesNotMatch(
    card,
    /disabled=\{\s*paymentLoading \|\|[\s\S]*!customerName\.trim\(\)/,
  );
  assert.doesNotMatch(
    card,
    /Enter your name, mobile, email and accept the terms before paying/,
  );
  assert.doesNotMatch(
    card,
    /Please accept the Terms & Conditions before continuing/,
  );
  assert.doesNotMatch(card, /Please enter your name\./);
  assert.doesNotMatch(card, /<PreviewRow label="Name"/);
  assert.doesNotMatch(card, /<PreviewRow label="Mobile"/);
  assert.doesNotMatch(card, /<PreviewRow label="Email"/);
  assert.match(card, /Journey summary/);
  assert.match(card, /Edit journey/);
  assert.match(card, /<PreviewRow[\s\S]*label="Trip"/);
  assert.match(card, /<PreviewRow label="Airport"/);
  assert.match(card, /<PreviewRow label="Pickup"/);
  assert.match(card, /<PreviewRow label="Destination"/);
  assert.match(card, /label=\{returnJourney \? "Outbound" : "Date & time"\}/);
  assert.match(card, /<PreviewRow[\s\S]*label="Passengers"/);
  assert.match(card, /<PreviewRow[\s\S]*label="Luggage"/);
  assert.match(card, /<PreviewRow label="Vehicle" value=\{vehicleShortLabel\(quoteVehicle\)\}/);
  assert.match(card, /Your fixed journey price/);
  assert.doesNotMatch(card, /<PreviewRow label="Drop-off"/);
  assert.doesNotMatch(card, /<PreviewRow label="Suitcases"/);
  console.log("OK  QuoteCard wires exact messages and focuses the first invalid field");
}

console.log("\n=== Terms checkbox gets a red border ===");
{
  const terms = read("src/components/BookingTermsConsent.tsx");
  assert.match(terms, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(terms, /border-red-400\/55/);
  assert.match(terms, /booking-terms-error/);
  console.log("OK  Terms/Privacy agreement shows a red border and message");
}

console.log("\n=== Pay tap validates instead of starting SumUp ===");
{
  const card = read("src/components/QuoteCard.tsx");
  const payHandler = card.slice(card.indexOf("async function handlePayNow()"));
  const validateIdx = payHandler.indexOf("if (!validateCheckoutRequiredFields())");
  const loadingIdx = payHandler.indexOf("setPaymentLoading(true)");
  const checkoutIdx = payHandler.search(/\/payments|createCheckout|hosted-checkout|sumup/i);
  assert.ok(validateIdx >= 0, "handlePayNow must validate required fields");
  assert.ok(loadingIdx > validateIdx, "SumUp loading must start only after validation");
  if (checkoutIdx >= 0) {
    assert.ok(checkoutIdx > validateIdx, "no SumUp request before validation");
  }
  assert.match(card, /onClick=\{\(\) => void handlePayNow\(\)\}/);
  assert.match(
    card,
    /if \(e\.target\.value\.trim\(\)\) \{\s*setCustomerNameError\(""\);/,
  );
  assert.match(card, /bookingTextFieldClass\([\s\S]*hasError: Boolean\(customerNameError\)/);
  assert.match(card, /id="customer-name-error"/);
  assert.match(card, /role="alert"/);
  const scroll = read("src/lib/quote-step-nav-scroll.ts");
  assert.match(scroll, /export function focusFirstInvalidField/);
  assert.match(scroll, /scrollBookingTargetIntoView\(field/);
  assert.match(scroll, /field\.focus/);
  console.log("OK  Pay tap validates all fields, marks errors, scrolls, and blocks SumUp");
}

console.log("\n=== Marketing consent stays optional ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /<MarketingOptIn /);
  assert.doesNotMatch(card, /marketingOptIn[\s\S]{0,80}required/);
  assert.doesNotMatch(card, /Please .*marketing/i);
  const validateStart = card.indexOf("function validateCheckoutRequiredFields()");
  const validateEnd = card.indexOf("function buildPaymentDescription()");
  const validateFn = card.slice(validateStart, validateEnd);
  assert.match(validateFn, /validateContactDetails/);
  assert.match(validateFn, /requireTermsAccepted/);
  assert.doesNotMatch(validateFn, /marketingOptIn/);
  console.log("OK  marketing opt-in is not a required field");
}

console.log("\nAll required-field validation checks passed.");

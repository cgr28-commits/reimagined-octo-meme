/**
 * Post-quote checkout page: one compact form, no repeated quote cards.
 * Pricing / SumUp / payload logic must stay in the existing handlers.
 * Run: npx tsx scripts/check-quote-checkout-page.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing slice ${start} → ${end}`);
  return source.slice(from, to);
}

const card = read("src/components/QuoteCard.tsx");
const summary = read("src/components/QuoteCheckoutSummary.tsx");
const checkout = slice(card, "function renderCheckoutPage()", "function renderStep1BookButton");
const submitCheckout = slice(card, "async function submitCheckoutForm()", "function handleSubmit");

console.log("=== Checkout page is compact and sans-serif ===");
{
  assert.match(card, /COMPLETE YOUR BOOKING/);
  assert.match(checkout, /Pickup/);
  assert.match(card, /Scheduled flight arrival time/);
  assert.match(card, /fromAirport \? "Scheduled flight arrival time" : "Pickup time"/);
  assert.match(checkout, /Full name/);
  assert.match(checkout, /Mobile number/);
  assert.match(checkout, /Email address/);
  assert.match(card, /Flight details/);
  assert.match(checkout, /Confirm booking & pay securely/);
  assert.match(checkout, /QuoteCheckoutSummary/);
  assert.match(summary, /Edit journey/);
  assert.match(summary, /Change drop-off/);
  assert.match(card, /Total \$\{amountLabel\}/);
  assert.doesNotMatch(checkout, /quote-price-figure/);
  assert.doesNotMatch(checkout, /font-display/);
  assert.doesNotMatch(checkout, /quote-price-panel/);
  assert.doesNotMatch(checkout, /Continue to your details/);
  assert.doesNotMatch(checkout, /Vehicle for this journey/);
  assert.doesNotMatch(checkout, /FinalPayableBreakdown/);
  assert.doesNotMatch(checkout, /PromotionalPriceBreakdown/);
  assert.doesNotMatch(checkout, /type="checkbox"[\s\S]*expressDropOffConfirmRemovalLabel/);
  console.log("OK  compact checkout copy, no serif price card");
}

console.log("\n=== Flight visibility stays direction-aware ===");
{
  assert.match(card, /needsOutboundFlightNumber/);
  assert.match(card, /renderFlightDetailsSection\(2\)/);
  assert.match(checkout, /renderFlightDetailsSection\(2\)/);
  assert.match(card, /isAirportTrip && isFromAirport/);
  assert.match(card, /validateRequiredFlightNumbers/);
  console.log("OK  flight block still uses existing from-airport gate");
}

console.log("\n=== Checkout submit uses existing pay / booking handlers ===");
{
  assert.match(submitCheckout, /validateTripForBooking/);
  assert.match(submitCheckout, /validateRequiredFlightNumbers/);
  assert.match(submitCheckout, /handlePayNow/);
  assert.match(submitCheckout, /validateCheckoutRequiredFields/);
  assert.match(submitCheckout, /confirmBooking\("email"\)/);
  assert.match(card, /async function handlePayNow/);
  assert.match(card, /createPaymentCheckout/);
  assert.match(card, /composeFareWithExpressDropOff/);
  assert.match(card, /airportAccessChargeGbp: expressSelection\.feeGbp/);
  console.log("OK  submit wires to existing handlers; no new fare math");
}

console.log("\n=== Pricing / payment modules unchanged by this checkout UX ===");
{
  const createPayment = read("src/lib/create-payment.ts");
  const express = read("shared/express-drop-off.ts");
  assert.match(createPayment, /export async function createPaymentCheckout/);
  assert.match(express, /BFS: 5/);
  assert.match(express, /BHD: 4/);
  assert.match(express, /export function composeFareWithExpressDropOff/);
  assert.doesNotMatch(checkout, /EXPRESS_DROP_OFF_FEES_GBP/);
  assert.doesNotMatch(checkout, /createPaymentCheckout/);
  console.log("OK  checkout JSX does not contain fee tables or SumUp create calls");
}

console.log("\n=== Narrow-phone field shells stay full-width ===");
{
  assert.match(checkout, /grid w-full min-w-0 max-w-full gap-3 sm:grid-cols-2/);
  assert.match(checkout, /quoteDateTimeFieldShellClass/);
  assert.match(checkout, /bookingTextFieldClass/);
  assert.match(summary, /text-lg font-bold tracking-tight text-white sm:text-xl/);
  assert.doesNotMatch(summary, /quote-price-figure|font-display/);
  console.log("OK  360/390/430 fields stack; desktop uses two columns");
}

console.log("\nAll quote checkout page checks passed.");

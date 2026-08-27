/**
 * Quote step / required-field highlight regression checks.
 * Run: npx tsx scripts/check-quote-step-highlight.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addressFieldShellClass,
  bookingTextFieldClass,
  choiceGroupNeedsClass,
  quoteTextFieldClass,
} from "../src/lib/quote-ui-highlight";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Highlight helpers ===");
assert.match(quoteTextFieldClass("needs"), /border-emerald\/50/);
assert.match(quoteTextFieldClass("error"), /border-red-400/);
assert.match(quoteTextFieldClass("complete"), /border-emerald\/30/);
assert.match(bookingTextFieldClass("needs"), /border-emerald\/50/);
assert.match(addressFieldShellClass({
  hasError: true,
  needsCompletion: true,
  isComplete: false,
  isActiveUi: false,
}), /border-red-400/);
assert.match(addressFieldShellClass({
  hasError: false,
  needsCompletion: true,
  isComplete: false,
  isActiveUi: false,
}), /border-emerald\/50/);
assert.match(choiceGroupNeedsClass(true), /border-emerald\/45/);
assert.match(choiceGroupNeedsClass(false), /border-transparent/);
assert.match(choiceGroupNeedsClass(false), /p-2/);
console.log("OK  helpers keep stable padding and error > needs priority");

console.log("\n=== QuoteCard step indicator ===");
const card = read("src/components/QuoteCard.tsx");
assert.match(card, /aria-current=\{active \? "step" : undefined\}/);
assert.match(card, /border-emerald bg-emerald\/15/);
assert.match(card, /sr-only">completed/);
assert.match(card, /quoteTextFieldClass/);
assert.match(card, /bookingTextFieldClass/);
assert.match(card, /needsCompletion=\{quoteStep === 1 && !isPlaceSelected/);
assert.doesNotMatch(card, /BOOKING_INPUT_CLASS/);
console.log("OK  step indicator + field classes wired");

console.log("\n=== AddressInput Places completion ===");
const address = read("src/components/AddressInput.tsx");
assert.match(address, /needsCompletion/);
assert.match(address, /placeComplete/);
assert.match(address, /requireSuggestion[\s\S]*hasConfirmedSelection/);
assert.match(address, /z-\[80\]|z-\[90\]/);
console.log("OK  Places needs placeId; z-index intact");

console.log("\n=== Progressive route ===");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
assert.match(progressive, /choiceGroupNeedsClass\(!journeyIntent\)/);
assert.match(progressive, /needsCompletion=\{!pickupConfirmedPlace/);
assert.match(progressive, /needsCompletion=\{!dropoffConfirmedPlace/);
assert.match(progressive, /needsCompletion=\{passengers == null\}/);
console.log("OK  progressive required groups highlighted");

console.log("\n=== Funnel / Ads / consent untouched ===");
assert.match(card, /trackQuoteToolViewed/);
assert.match(card, /GoogleAdsRequestQuote/);
assert.match(read("src/components/CookieConsent.tsx"), /matni-cookie-banner-offset/);
assert.match(card, /--matni-cookie-banner-offset/);
console.log("OK  PR #408 behaviours still referenced");

console.log("\nAll quote step highlight checks passed.");

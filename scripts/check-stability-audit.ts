/**
 * Stability audit smoke checks — shared quote component, LDY preselect, legacy copy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const card = read("src/components/QuoteCard.tsx");
const locationQuote = read("src/components/LocationQuoteSection.tsx");
const airportsPage = read("src/app/airports/[slug]/page.tsx");
const transfersPage = read("src/app/transfers/[slug]/page.tsx");
const intent = read("src/lib/quote-journey-intent.ts");
const footer = read("src/components/Footer.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const quoteTs = read("src/lib/quote.ts");

check("Homepage and location pages use the shared QuoteCard", () => {
  assert.match(hero, /QuoteCard/);
  assert.match(locationQuote, /QuoteCard/);
  assert.match(airportsPage, /LocationQuoteSection/);
  assert.match(transfersPage, /LocationQuoteSection/);
  assert.doesNotMatch(airportsPage, /Quick select airports/i);
  assert.doesNotMatch(transfersPage, /Quick select airports/i);
});

check("Customer airports include LDY and helper recognises it", () => {
  assert.match(intent, /City of Derry Airport/);
  assert.match(intent, /isCustomerAirportCode/);
  assert.match(card, /isCustomerAirportCode\(initialAirportCode\)/);
  assert.match(card, /initialAirportAppliedRef/);
});

check("No legacy driver/fuel/tolls inclusion wording in customer UI", () => {
  for (const file of [
    "src/components/QuoteCard.tsx",
    "src/components/LocationQuoteSection.tsx",
    "src/components/HeroSlideshow.tsx",
    "src/lib/data.ts",
    "src/lib/tours.ts",
  ]) {
    const text = read(file);
    assert.doesNotMatch(text, /Includes vehicle, driver, fuel/i);
    assert.doesNotMatch(text, /driver, fuel and tolls/i);
    assert.doesNotMatch(text, /Northern Ireland'?s trusted airport transfer/i);
  }
});

check("Footer uses professional transfers wording", () => {
  assert.match(footer, /Professional airport transfers across Northern Ireland and beyond/);
});

check("formatQuote guards invalid amounts", () => {
  assert.match(quoteTs, /Price unavailable/);
  assert.match(quoteTs, /Number\.isFinite\(amount\)/);
});

check("Submission double-tap protection exists", () => {
  assert.match(card, /submissionInFlightRef/);
});

check("Location quote waiting copy is policy-accurate", () => {
  assert.match(locationQuote, /60 minutes complimentary waiting/);
  assert.match(locationQuote, /10 minutes/);
  assert.doesNotMatch(locationQuote, /Complimentary waiting time included for flight landings/);
});

console.log("\nAll stability audit checks passed.");

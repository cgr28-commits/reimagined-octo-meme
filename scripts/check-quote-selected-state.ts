/**
 * Quote flow selected-option styling — one shared dark-emerald treatment.
 * Run: npx tsx scripts/check-quote-selected-state.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUOTE_CHOICE_OFF, QUOTE_CHOICE_ON } from "../src/lib/quote-ui-highlight";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const css = read("src/app/globals.css");
const highlight = read("src/lib/quote-ui-highlight.ts");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");
const journey = read("src/components/JourneyOptionCard.tsx");
const express = read("src/components/ExpressDropOffSelector.tsx");
const combined = read("src/components/CombinedAirportAccessSelector.tsx");

console.log("=== Shared selected-state tokens ===");
assert.match(css, /--quote-selected-border: #3ebf55/);
assert.match(css, /--quote-selected-bg: rgba\(47,\s*191,\s*74,\s*0\.2\)/);
assert.match(css, /--quote-selected-glow:/);
assert.match(css, /--quote-selected-icon: #3ebf55/);
assert.match(
  css,
  /\.quote-choice-selected,\s*\.journey-option-card-selected \{[\s\S]*?border: 2px solid var\(--quote-selected-border\)/,
);
assert.match(
  css,
  /\.quote-choice-selected,\s*\.journey-option-card-selected \{[\s\S]*?background: var\(--quote-selected-bg\)/,
);
assert.match(
  css,
  /\.quote-choice-selected,\s*\.journey-option-card-selected \{[\s\S]*?color: #ffffff/,
);
assert.doesNotMatch(
  css,
  /\.quote-choice-selected[\s\S]{0,220}background: var\(--color-emerald\)/,
);
assert.equal(QUOTE_CHOICE_ON, "quote-choice-selected");
assert.match(QUOTE_CHOICE_OFF, /quote-choice/);
assert.match(highlight, /export const QUOTE_CHOICE_ON = "quote-choice-selected"/);
assert.doesNotMatch(highlight, /QUOTE_CHOICE_ON =\s*"quote-choice-selected border-emerald bg-emerald/);
console.log("OK  one shared dark-emerald selected class, not a bright-green fill");

console.log("\n=== Primary CTAs and step indicator stay distinct ===");
assert.match(css, /\.btn-primary \{[\s\S]*?background: var\(--color-emerald\)/);
assert.match(css, /\.quote-step-active \{[\s\S]*?inset 0 0 0 1px rgba\(47,\s*191,\s*74,\s*0\.45\)/);
assert.doesNotMatch(css, /\.quote-step-active \{[^}]*quote-choice-selected/);
assert.doesNotMatch(css, /\.btn-primary \{[^}]*quote-choice-selected/);
console.log("OK  CTAs stay solid emerald; step pills keep the restrained active treatment");

console.log("\n=== Quote flow controls use the shared class ===");
assert.match(progressive, /QUOTE_CHOICE_ON/);
assert.match(progressive, /QUOTE_CHOICE_OFF/);
assert.match(card, /QUOTE_CHOICE_ON/);
assert.match(card, /QUOTE_CHOICE_OFF/);
assert.match(journey, /quote-choice-selected journey-option-card-selected/);
assert.match(
  css,
  /\.journey-option-card \{[\s\S]*\.journey-option-card\.quote-choice-selected(?:,\s*\.journey-option-card\.quote-choice-selected:hover)? \{[\s\S]*?border: 2px solid var\(--quote-selected-border\)/,
);
assert.match(css, /\.quote-choice \{[\s\S]*?background: var\(--quote-choice-bg\)/);
assert.match(css, /\.journey-option-card \{[\s\S]*?background: var\(--quote-choice-bg\)/);
assert.match(
  css,
  /\.journey-option-card\.quote-choice-selected(?:,\s*\.journey-option-card\.quote-choice-selected:hover)? \{[\s\S]*?background: var\(--quote-choice-bg\)/,
);
assert.doesNotMatch(
  css,
  /\.journey-option-card\.quote-choice-selected(?:,\s*\.journey-option-card\.quote-choice-selected:hover)? \{[\s\S]*?background: var\(--quote-selected-bg\)/,
);
assert.match(
  css,
  /\.journey-option-card\.quote-choice-selected(?:,\s*\.journey-option-card\.quote-choice-selected:hover)? \{[\s\S]*?box-shadow: var\(--quote-selected-glow\)/,
);
assert.match(express, /quote-choice-selected/);
assert.match(combined, /accessChoiceStyles/);
assert.doesNotMatch(progressive, /quote-choice-selected bg-emerald text-navy/);
assert.doesNotMatch(progressive, /border-emerald bg-emerald text-navy/);
assert.doesNotMatch(card, /quote-choice-selected bg-emerald text-navy/);
assert.doesNotMatch(card, /journeyMode === "one-way"\s*\n\s*\? "bg-emerald text-navy"/);
console.log("OK  journey, airport, party, return, child-seat and access options share the class");

console.log("\n=== Intentionally not using the dark selected fill ===");
assert.match(express, /border-emerald bg-emerald\/15 text-navy/);
assert.match(express, /border-amber-400\/55 bg-amber-500\/12 text-white/);
assert.doesNotMatch(card, /name="vehicle"[\s\S]{0,80}QUOTE_CHOICE_ON/);
console.log("OK  light-theme access cards, amber free-access, and auto vehicle stay separate");

console.log("\nAll quote selected-state checks passed.");

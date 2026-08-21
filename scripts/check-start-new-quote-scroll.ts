/**
 * Acceptance: Start a new quote? reveal vs confirm scroll behaviour.
 * Run: npx tsx scripts/check-start-new-quote-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const card = read("src/components/QuoteCard.tsx");
const scroll = read("src/lib/quote-step-nav-scroll.ts");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");

check("Confirmation expands without clearing the quote", () => {
  assert.match(card, /function requestStartNewQuote\(\) \{[\s\S]*?setConfirmStartNewQuote\(true\)/);
  assert.match(card, /function keepCurrentQuote\(\) \{[\s\S]*?setConfirmStartNewQuote\(false\)/);
  assert.match(card, /onClick=\{keepCurrentQuote\}/);
  assert.match(card, /onClick=\{performStartNewQuote\}/);
  // Opening with substantial input only expands the panel.
  assert.match(
    card,
    /if \(hasSubstantialQuoteInput\(\)\) \{\s*setConfirmStartNewQuote\(true\);\s*return;/,
  );
});

check("Stable #quote-actions container and reveal scroll", () => {
  assert.match(card, /id="quote-actions"/);
  assert.match(card, /scheduleRevealQuoteActionsScroll\("quote-actions"\)/);
  assert.match(card, /confirmStartNewQuote/);
  assert.match(scroll, /export function scheduleRevealQuoteActionsScroll/);
  assert.match(scroll, /export function computeScrollTopToRevealActions/);
  assert.match(scroll, /visualViewport/);
  assert.match(scroll, /ACTIONS_BOTTOM_CLEARANCE_PX = 16|bottomClearancePx \?\? ACTIONS_BOTTOM_CLEARANCE_PX/);
  assert.match(scroll, /RESULTS_CORRECTION_MS|150/);
  assert.doesNotMatch(scroll, /scheduleRevealQuoteActionsScroll[\s\S]{0,800}scrollIntoView/);
});

check("Confirm clears and scrolls to initial journey buttons only", () => {
  assert.match(card, /setJourneyMode\(null\)/);
  assert.match(card, /setPassengers\(null\)/);
  assert.match(card, /setSuitcases\(null\)/);
  assert.match(card, /scheduleBookingNavAfterRender\("quote-section-journey"/);
  assert.match(progressive, /id="quote-section-journey"/);
  // Must not scroll to #quote on confirm (overshoots past journey buttons).
  assert.doesNotMatch(
    card,
    /performStartNewQuote[\s\S]{0,1200}scheduleBookingNavAfterRender\("quote"/,
  );
});

check("Confirmation panel disables sticky so buttons can be revealed", () => {
  assert.match(card, /confirmStartNewQuote\s*\?\s*"relative/);
  assert.match(card, /sticky bottom-0/);
  assert.match(card, /min-h-11/);
});

console.log("\nAll Start a new quote scroll checks passed.");

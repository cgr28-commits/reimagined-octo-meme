/**
 * Public quote tool must NOT auto-scroll after customer selections.
 * Explicit Book Now / Continue / Back step navigation may scroll on mobile only.
 * Run: npx tsx scripts/check-mobile-quote-autoscroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");

// Shared selection auto-scroll helper must stay retired.
assert.equal(
  fs.existsSync(path.join(root, "src/lib/quote-mobile-scroll.ts")),
  false,
  "quote-mobile-scroll.ts should be removed",
);

assert.doesNotMatch(progressive, /quote-mobile-scroll/);
assert.doesNotMatch(progressive, /scheduleQuoteSectionScroll/);
assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
assert.doesNotMatch(progressive, /scheduleQuoteSectionScrollById/);
assert.doesNotMatch(progressive, /pendingScroll/);
assert.doesNotMatch(progressive, /scrollIntoView/);
assert.doesNotMatch(progressive, /clearScheduledQuoteSectionScroll/);

assert.doesNotMatch(card, /quote-mobile-scroll/);
assert.doesNotMatch(card, /scheduleQuoteSectionScroll/);
assert.doesNotMatch(card, /scheduleQuoteFareResultScroll/);
assert.doesNotMatch(card, /scheduleSmoothScrollTo/);
assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
assert.doesNotMatch(card, /pendingScrollToStep3CustomerRef/);
assert.doesNotMatch(card, /scheduleReadyForScrollRef/);

// No direct element.scrollIntoView in QuoteCard — booking-nav helper owns scrolling.
assert.doesNotMatch(card, /\.scrollIntoView\s*\(/);
assert.match(card, /scheduleBookingNavAfterRender/);
assert.match(card, /pendingQuoteStepNavScrollRef/);
assert.match(card, /from "@\/lib\/quote-step-nav-scroll"/);

// Allowed one-shot: step-2 schedule complete → YOUR JOURNEY (not every keystroke).
assert.match(card, /hadStep2ScheduleScrollRef/);
assert.match(card, /id="step2-journey-summary"/);
assert.match(card, /step2JourneySummaryRef\.current \?\? "step2-journey-summary"/);

// Section ids remain in normal document flow (customers scroll manually for selections).
assert.match(progressive, /id="quote-section-passengers"/);
assert.match(progressive, /id="quote-section-suitcases"/);
assert.match(progressive, /id="quote-section-journey"/);

// Luggage: single 0–4|5+ row — no Exact Large Bags / duplicate 5+ controls.
assert.match(progressive, /formatSuitcaseChoice/);
assert.match(read("src/lib/vehicle-selection.ts"), /FIVE_PLUS_SUITCASES/);
assert.doesNotMatch(progressive, /label="Exact large bags/);
assert.doesNotMatch(progressive, /quote-section-exact-suitcases/);

// Personal quote code-entry stays removed.
assert.doesNotMatch(card, /Have a personal quote\?/);
assert.doesNotMatch(card, /Apply Quote/);
assert.doesNotMatch(card, /id="personal-quote-code"/);
assert.doesNotMatch(card, /placeholder="Quote code"/);

console.log("OK  quote-mobile-scroll helper removed");
console.log("OK  progressive route has no auto-scroll after selections");
console.log("OK  QuoteCard has no per-selection auto-scroll (step-nav + schedule-complete allowed)");
console.log("OK  step-2 schedule-complete scrolls to YOUR JOURNEY once");
console.log("OK  luggage is single 0–4|5+ row (no Exact Large Bags)");
console.log("OK  personal quote code-entry UI remains removed");
console.log("\nAll quote no-autoscroll checks passed.");

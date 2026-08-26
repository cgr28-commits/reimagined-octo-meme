/**
 * Deterministic A2A mobile scroll stages (one target per user transition).
 * Run: npx tsx scripts/check-a2a-scroll-flow.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const card = read("src/components/QuoteCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const helper = read("src/lib/quote-step-nav-scroll.ts");

console.log("=== Central scrollQuoteStage helper ===");
assert.match(helper, /export function scrollQuoteStage/);
assert.match(helper, /cancelCompetingScrollJobs\(\)/);
assert.match(helper, /quote-section-addresses/);
assert.match(helper, /quote-route-summary/);
assert.match(helper, /step2-journey-summary/);
assert.match(helper, /bookingRequestResult/);
console.log("OK  scrollQuoteStage cancels competitors first");

console.log("\n=== Progressive route does not own competing scrolls ===");
assert.doesNotMatch(progressive, /scheduleBookingNavAfterRender/);
assert.doesNotMatch(progressive, /scrollQuoteStage/);
assert.doesNotMatch(progressive, /scrollIntoView/);
assert.doesNotMatch(progressive, /hadJourneyModeScrollRef/);
assert.doesNotMatch(progressive, /hadPartyFieldsScrollRef/);
assert.match(progressive, /id="quote-section-addresses"/);
assert.match(progressive, /id="journey-type-selector"/);
assert.match(progressive, /id="passenger-luggage-section"/);
console.log("OK  QuoteProgressiveRoute is scroll-target only");

console.log("\n=== QuoteCard owns A2A stage sequence ===");
assert.match(card, /scrollQuoteStage\("quote-section-addresses"/);
assert.match(card, /scrollQuoteStage\("journey-type-selector"/);
assert.match(card, /scrollQuoteStage\("passenger-luggage-section"/);
assert.match(card, /scrollQuoteStage\(routeSummaryRef\.current \?\? "quote-route-summary"/);
assert.match(card, /id="step2-journey-summary"/);
assert.match(card, /scrollQuoteStage\(\s*step2JourneySummaryRef/);
assert.match(card, /scrollQuoteStage\(bookingResultRef\.current \?\? "bookingRequestResult"/);
assert.match(card, /becameAddressToAddress/);
assert.match(card, /hadA2aAddressesScrollRef/);
assert.match(card, /hadA2aJourneyTypeScrollRef/);
assert.match(card, /hadA2aPartyScrollRef/);
assert.match(card, /hadRouteSummaryScrollRef/);
assert.match(card, /pendingRouteSummaryScrollRef/);
assert.match(card, /hadJourneySummaryScrollRef/);
assert.match(card, /requestJourneySummaryScrollAfterTimeConfirm/);
assert.doesNotMatch(card, /preferContinueCta/);
assert.doesNotMatch(card, /hadStep1ReadyScrollRef/);
assert.doesNotMatch(card, /hadStep2ScheduleScrollRef/);
assert.doesNotMatch(card, /schedulePreciseResultsScroll/);
console.log("OK  stages wired with one-shot refs (bags → YOUR ROUTE)");

console.log("\n=== Time scroll only after picker Done / blur ===");
assert.match(card, /requestJourneySummaryScrollAfterTimeConfirm/);
assert.match(
  card,
  /id="time"[\s\S]*?onBlur=\{\(\) => \{[\s\S]*?requestJourneySummaryScrollAfterTimeConfirm\(\);/,
);
assert.match(
  card,
  /id="returnTime"[\s\S]*?onBlur=\{\(\) => \{[\s\S]*?requestJourneySummaryScrollAfterTimeConfirm\(\);/,
);
assert.doesNotMatch(
  card,
  /useEffect\(\(\) => \{[\s\S]*if \(quoteStep !== 2\)[\s\S]*isScheduleComplete[\s\S]*\}, \[isScheduleComplete, quoteStep\]\)/,
);
console.log("OK  time → Your Journey uses blur, not isScheduleComplete effect");

console.log("\n=== Capacity incomplete→complete → YOUR ROUTE stack ===");
assert.match(card, /becameComplete/);
assert.match(card, /capacityComplete/);
assert.match(card, /routeSummaryRef/);
assert.match(
  card,
  /scrollQuoteStage\(routeSummaryRef\.current \?\? "quote-route-summary"/,
);
assert.doesNotMatch(
  card,
  /preferContinueCta[\s\S]*scrollQuoteStage\("quote-book-now-anchor"\)/,
);
// Must not wait on metric flicker before the bags→route scroll
assert.doesNotMatch(
  card,
  /if \(!quoteResultsReady\) \{\s*return;\s*\}\s*hadRouteSummaryScrollRef/,
);
console.log("OK  bags complete lands on YOUR ROUTE stack immediately");

console.log("\n=== No homepage airport targets in quote stage scrolls ===");
const stageBlock = card.slice(
  card.indexOf("Consolidated progressive scroll"),
  card.indexOf("Legacy (non-A2A) form"),
);
assert.doesNotMatch(stageBlock, /["']airports["']/);
assert.doesNotMatch(stageBlock, /Airports We Serve/);
assert.doesNotMatch(stageBlock, /getElementById\(["']airports/);
assert.doesNotMatch(stageBlock, /quote-book-now-anchor/);
console.log("OK  no #airports / homepage / Continue-overshoot targets in A2A stages");

console.log("\nAll A2A scroll-flow checks passed.");

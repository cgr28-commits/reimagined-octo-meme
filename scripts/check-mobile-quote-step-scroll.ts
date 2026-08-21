/**
 * Mobile Live Quote step navigation must scroll to the active section.
 * Selection-driven auto-scroll must stay disabled.
 * Run: npx tsx scripts/check-mobile-quote-step-scroll.ts
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
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const helper = read("src/lib/quote-step-nav-scroll.ts");

check("Step section anchors exist for 1 / 2 / 3", () => {
  assert.match(card, /id="step1-journey-details"/);
  assert.match(card, /id="step2-travel-details"/);
  assert.match(card, /id="step3-customer-details"/);
  assert.match(card, /step1JourneyRef/);
  assert.match(card, /step2TravelDetailsRef/);
  assert.match(card, /step3CustomerDetailsRef/);
  assert.match(card, /scroll-mt-44/);
});

check("Explicit step CTAs set pending nav scroll then change step", () => {
  assert.match(card, /pendingQuoteStepNavScrollRef/);
  assert.match(card, /navigateQuoteStep/);
  assert.match(card, /scheduleMobileQuoteStepNavScroll/);
  // Book Now / Continue to travel details (step 1 → 2)
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = 2;\s*setQuoteStep\(2\)/,
  );
  // Continue to your details (step 2 → 3)
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = 3;\s*setQuoteStep\(3\)/,
  );
  // Back / Edit journey / Back to travel details use navigateQuoteStep
  assert.match(card, /navigateQuoteStep\(1\)/);
  assert.match(card, /navigateQuoteStep\(2\)/);
  assert.match(card, /Back to travel details/);
  assert.match(card, /Continue to your details/);
});

check("Scroll effect consumes pending flag once and is quoteStep-gated", () => {
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = null;\s*const element =/,
  );
  assert.match(card, /useEffect\(\(\) => \{[\s\S]*pendingQuoteStepNavScrollRef[\s\S]*\}, \[quoteStep\]\)/);
});

check("Helper is mobile-only and uses a single scrollIntoView", () => {
  assert.match(helper, /detectMobileDevice/);
  assert.match(helper, /scrollIntoView/);
  assert.match(helper, /min-width:\s*768px|detectMobileDevice\(\)/);
  // Cancelable double-rAF — one scroll per action
  assert.match(helper, /requestAnimationFrame/);
  assert.match(helper, /cancelled/);
});

check("Selection-driven auto-scroll stays removed", () => {
  assert.equal(
    fs.existsSync(path.join(root, "src/lib/quote-mobile-scroll.ts")),
    false,
  );
  assert.doesNotMatch(progressive, /scrollIntoView/);
  assert.doesNotMatch(progressive, /scheduleQuoteSectionScroll/);
  assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(progressive, /pendingScroll/);
  assert.doesNotMatch(card, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(card, /scheduleReadyForScrollRef/);
  // Old dual pending refs / shared helper must stay gone
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /pendingScrollToStep3CustomerRef/);
  assert.doesNotMatch(card, /quote-mobile-scroll/);
});

check("Desktop path remains a no-op in the helper", () => {
  assert.match(
    helper,
    /if \(!detectMobileDevice\(\)\) \{\s*return \(\) => \{\};\s*\}/,
  );
});

console.log("\nAll mobile quote step-scroll checks passed.");

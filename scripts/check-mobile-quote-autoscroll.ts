/**
 * Responsive quote auto-scroll (mobile + desktop) — only when next section is not fully visible.
 * Run: npx tsx scripts/check-mobile-quote-autoscroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  clearScheduledQuoteSectionScroll,
  getQuoteScrollBehavior,
  getQuoteScrollTopInsetPx,
  isQuoteSectionFullyVisible,
  prefersQuoteReducedMotion,
  QUOTE_DESKTOP_SCROLL_TOP_INSET_PX,
  QUOTE_FARE_RESULT_ID,
  QUOTE_MOBILE_SCROLL_TOP_INSET_PX,
  scheduleQuoteFareResultScroll,
  scheduleQuoteSectionScroll,
} from "../src/lib/quote-mobile-scroll";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const helper = read("src/lib/quote-mobile-scroll.ts");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");

assert.match(helper, /scheduleQuoteSectionScroll/);
assert.match(helper, /scheduleQuoteFareResultScroll/);
assert.match(helper, /isQuoteSectionFullyVisible/);
assert.match(helper, /getQuoteScrollTopInsetPx/);
assert.match(helper, /prefersQuoteReducedMotion|prefers-reduced-motion/);
assert.match(helper, /clearScheduledQuoteSectionScroll|replaceActiveScroll/);
assert.equal(QUOTE_MOBILE_SCROLL_TOP_INSET_PX, 176);
assert.equal(QUOTE_DESKTOP_SCROLL_TOP_INSET_PX, 112);
assert.equal(QUOTE_FARE_RESULT_ID, "quote-fare-result");
// Must not gate progressive scrolls to mobile-only by default.
assert.doesNotMatch(helper, /mobileOnly !== false/);
assert.doesNotMatch(helper, /if \(mobileOnly && !detectMobileDevice/);

assert.match(progressive, /id="quote-section-airport"/);
assert.match(progressive, /id="quote-section-addresses"/);
assert.match(progressive, /id="quote-section-passengers"/);
assert.match(progressive, /id="quote-section-suitcases"/);
assert.match(progressive, /id="quote-section-exact-passengers"/);
assert.match(progressive, /id="quote-section-exact-suitcases"/);
assert.match(progressive, /scroll-mt-44/);
assert.match(progressive, /md:scroll-mt-28/);
assert.match(progressive, /scheduleQuoteSectionScroll/);
assert.match(progressive, /scheduleQuoteFareResultScroll/);
assert.match(progressive, /handleJourneyIntentChange/);
assert.match(progressive, /handlePassengersChange/);
assert.match(progressive, /handleSuitcasesChange/);
assert.match(progressive, /handleExactPassengersChange/);
assert.match(progressive, /handleExactSuitcasesChange/);
assert.match(progressive, /pendingScrollToExactPassengersRef/);
assert.match(progressive, /pendingScrollToExactSuitcasesRef/);
assert.match(progressive, /revealingExactBags/);
// Suitcase completion must NOT jump to Book/Continue/Save.
assert.doesNotMatch(progressive, /scheduleQuoteSectionScrollById\("quote-step1-next"\)/);
assert.doesNotMatch(progressive, /scheduleQuoteSectionScrollById\("quote-step2-next"\)/);

assert.match(progressive, /onChange=\{onPickupChange\}/);
assert.match(progressive, /onChange=\{onDropoffChange\}/);
assert.doesNotMatch(progressive, /onPickupChange=\{[^}]*scheduleQuote/);
assert.doesNotMatch(progressive, /onDropoffChange=\{[^}]*scheduleQuote/);
assert.match(progressive, /handlePickupPlaceSelect/);

assert.match(card, new RegExp(`id=\\{?QUOTE_FARE_RESULT_ID\\}?|id="${QUOTE_FARE_RESULT_ID}"`));
assert.match(card, /data-quote-ready=\{/);
assert.match(card, /fareResultContentReady/);
assert.match(card, /id="quote-step1-next"/);
assert.match(card, /id="quote-step2-next"/);
assert.match(card, /id="step3-flight-details"/);
assert.match(card, /id="step3-booking-review"/);
assert.match(card, /scheduleQuoteSectionScroll/);
assert.match(card, /onBlur=\{\(\) => \{/);
assert.match(card, /Only after leaving the field — never while typing/);
assert.match(card, /scheduleReadyForScrollRef/);
assert.doesNotMatch(card, /mobileOnly:\s*false/);
assert.match(card, /scroll-mt-44/);
assert.match(card, /md:scroll-mt-28/);

function withViewport(height: number, desktopMedia: boolean, run: () => void) {
  const g = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  if (typeof g.window === "undefined") {
    (g as { window: unknown }).window = g;
  }
  const win = g.window as Window & typeof globalThis & {
    matchMedia?: (query: string) => MediaQueryList;
  };
  Object.defineProperty(win, "innerHeight", { configurable: true, value: height });
  win.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion")
        ? false
        : query.includes("min-width: 768px")
          ? desktopMedia
          : false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }) as MediaQueryList;
  run();
}

withViewport(800, false, () => {
  assert.equal(typeof getQuoteScrollTopInsetPx(), "number");
  assert.equal(prefersQuoteReducedMotion(), false);
  assert.equal(getQuoteScrollBehavior(), "smooth");

  const fullyVisible = {
    getBoundingClientRect: () => ({
      top: 180,
      bottom: 360,
      height: 180,
      left: 0,
      right: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  } as unknown as HTMLElement;
  assert.equal(isQuoteSectionFullyVisible(fullyVisible, 176), true);

  const partlyBelow = {
    getBoundingClientRect: () => ({
      top: 700,
      bottom: 900,
      height: 200,
      left: 0,
      right: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  } as unknown as HTMLElement;
  assert.equal(isQuoteSectionFullyVisible(partlyBelow, 176), false);
  assert.equal(isQuoteSectionFullyVisible(partlyBelow, 112), false);

  const desktopFullyVisible = {
    getBoundingClientRect: () => ({
      top: 120,
      bottom: 280,
      height: 160,
      left: 0,
      right: 0,
      width: 480,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  } as unknown as HTMLElement;
  assert.equal(isQuoteSectionFullyVisible(desktopFullyVisible, 112), true);

  assert.equal(typeof scheduleQuoteSectionScroll(null), "function");
  assert.equal(typeof scheduleQuoteFareResultScroll({ maxAttempts: 1 }), "function");
  clearScheduledQuoteSectionScroll();
});

// Large desktop: fare already fully visible → scheduleQuoteSectionScroll no-ops (no scrollIntoView).
withViewport(1200, true, () => {
  let scrolled = false;
  const alreadyVisible = {
    getBoundingClientRect: () => ({
      top: 120,
      bottom: 400,
      height: 280,
      left: 0,
      right: 900,
      width: 900,
      x: 0,
      y: 0,
      toJSON() {},
    }),
    scrollIntoView() {
      scrolled = true;
    },
  } as unknown as HTMLElement;
  const cancel = scheduleQuoteSectionScroll(alreadyVisible, { topInsetPx: 112 });
  cancel();
  assert.equal(scrolled, false);
});

console.log("OK  scroll section ids present on progressive + QuoteCard");
console.log("OK  viewport visibility helper: skip when fully visible (mobile + desktop insets)");
console.log("OK  address typing is not wired to scroll handlers");
console.log("OK  scroll helper is responsive (not mobile-only)");
console.log("OK  suitcase completion targets fare result (not Book/Save)");
console.log("OK  exact passengers / exact bags have dedicated scroll targets");
console.log("OK  large desktop skips unnecessary scroll when fare already visible");
console.log("\nAll mobile quote autoscroll checks passed.");

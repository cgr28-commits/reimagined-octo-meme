/**
 * Mobile quote auto-scroll targets + helpers.
 * Run: npx tsx scripts/check-mobile-quote-autoscroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isQuoteSectionComfortablyVisible,
  QUOTE_MOBILE_SCROLL_TOP_INSET_PX,
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
assert.match(helper, /isQuoteSectionComfortablyVisible/);
assert.match(helper, /mobileOnly/);
assert.equal(QUOTE_MOBILE_SCROLL_TOP_INSET_PX, 176);

assert.match(progressive, /id="quote-section-airport"/);
assert.match(progressive, /id="quote-section-addresses"/);
assert.match(progressive, /id="quote-section-passengers"/);
assert.match(progressive, /id="quote-section-suitcases"/);
assert.match(progressive, /scroll-mt-44/);
assert.match(progressive, /md:scroll-mt-28/);
assert.match(progressive, /scheduleQuoteSectionScroll/);
assert.match(progressive, /scheduleQuoteSectionScrollById\("quote-step1-next"\)/);
assert.match(progressive, /handleJourneyIntentChange/);
assert.match(progressive, /handlePassengersChange/);
assert.match(progressive, /handleSuitcasesChange/);
// Address fields: typing must not trigger scroll (only place confirm → party fields effect).
assert.match(progressive, /onChange=\{onPickupChange\}/);
assert.match(progressive, /onChange=\{onDropoffChange\}/);
assert.doesNotMatch(progressive, /onPickupChange=\{[^}]*scheduleQuote/);
assert.doesNotMatch(progressive, /onDropoffChange=\{[^}]*scheduleQuote/);
assert.doesNotMatch(progressive, /onChange=\{onPickupChange\}[\s\S]{0,80}scheduleQuote/);

assert.match(card, /id="quote-step1-next"/);
assert.match(card, /id="quote-step2-next"/);
assert.match(card, /id="step3-flight-details"/);
assert.match(card, /id="step3-booking-review"/);
assert.match(card, /scheduleQuoteSectionScroll/);
assert.match(card, /onBlur=\{\(\) => \{/);
assert.match(card, /Only after leaving the field — never while typing/);
assert.match(card, /scheduleReadyForScrollRef/);

// Visibility helper unit check with a minimal window stub (tsx/node).
{
  const g = globalThis as typeof globalThis & { window?: Window & typeof globalThis; innerHeight?: number };
  const hadWindow = typeof g.window !== "undefined";
  if (!hadWindow) {
    (g as { window: unknown }).window = g;
  }
  Object.defineProperty(g.window ?? g, "innerHeight", { configurable: true, value: 800 });

  const visible = {
    getBoundingClientRect: () => ({
      top: 200,
      bottom: 400,
      height: 200,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  } as unknown as HTMLElement;
  assert.equal(isQuoteSectionComfortablyVisible(visible, 176), true);

  const hidden = {
    getBoundingClientRect: () => ({
      top: 700,
      bottom: 900,
      height: 200,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  } as unknown as HTMLElement;
  assert.equal(isQuoteSectionComfortablyVisible(hidden, 176), false);
  assert.equal(typeof scheduleQuoteSectionScroll(null), "function");
}

console.log("OK  scroll section ids present on progressive + QuoteCard");
console.log("OK  mobile scroll helper skips when already visible");
console.log("OK  address typing is not wired to scroll handlers");
console.log("\nAll mobile quote autoscroll checks passed.");

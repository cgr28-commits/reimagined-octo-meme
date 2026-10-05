/**
 * First quote reveal: pause, then glide the vehicle heading under the header.
 * The quote card itself does not animate.
 * Run: npx tsx scripts/check-quote-reveal-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeQuoteRevealScrollTop,
  quoteRevealEaseInOut,
  QUOTE_REVEAL_BREATHING_PX,
  QUOTE_REVEAL_PAUSE_MS,
  QUOTE_REVEAL_SCROLL_MS,
  type QuoteRevealMetrics,
} from "../src/lib/quote-step-nav-scroll";

const root = path.resolve(import.meta.dirname, "..");

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function idealHeading(headerBottom: number): number {
  return headerBottom + QUOTE_REVEAL_BREATHING_PX;
}

function landedHeading(frame: QuoteRevealMetrics, nextTop: number): number {
  return frame.headingTop + (frame.scrollY - nextTop);
}

check("Pause and glide stay in range, and the quote card does not animate", () => {
  assert.ok(QUOTE_REVEAL_PAUSE_MS >= 300 && QUOTE_REVEAL_PAUSE_MS <= 350);
  assert.ok(QUOTE_REVEAL_SCROLL_MS >= 650 && QUOTE_REVEAL_SCROLL_MS <= 800);
  assert.equal(quoteRevealEaseInOut(0), 0);
  assert.equal(quoteRevealEaseInOut(1), 1);
  assert.ok(Math.abs(quoteRevealEaseInOut(0.5) - 0.5) < 0.001);
  assert.ok(quoteRevealEaseInOut(0.25) < 0.25, "ease-in starts slower than linear");
  const scrollLib = fs.readFileSync(path.join(root, "src/lib/quote-step-nav-scroll.ts"), "utf8");
  const reveal = scrollLib.slice(
    scrollLib.indexOf("function readVisualViewport"),
    scrollLib.indexOf("export function quoteStepTargetId"),
  );
  assert.match(reveal, /data-quote-result-heading/);
  assert.match(reveal, /requestAnimationFrame/);
  assert.match(reveal, /scrollBehavior = "auto"/);
  assert.match(reveal, /QUOTE_REVEAL_SCROLL_MS/);
  assert.match(reveal, /visualViewport/);
  assert.match(reveal, /offsetTop/);
  assert.doesNotMatch(reveal, /visual\.height \+/);
  assert.doesNotMatch(reveal, /viewport\.height \+/);
  assert.match(reveal, /touchstart/);
  assert.match(reveal, /haltMotion\(\)/);
  assert.doesNotMatch(reveal, /behavior:\s*"smooth"/);
  assert.doesNotMatch(reveal, /onReveal/);
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  assert.doesNotMatch(css, /quote-result-reveal/);
  const showcase = fs.readFileSync(path.join(root, "src/components/QuoteResultShowcase.tsx"), "utf8");
  assert.match(showcase, /data-quote-result-heading/);
  assert.doesNotMatch(showcase, /quote-result-reveal|entering/);
  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.doesNotMatch(card, /quoteResultReveal|quote-result-reveal/);
});

const phones = [
  { name: "320x568", viewportHeight: 568, headerBottom: 64 },
  { name: "360x640", viewportHeight: 640, headerBottom: 64 },
  { name: "375x667", viewportHeight: 667, headerBottom: 72 },
  { name: "390x844", viewportHeight: 844, headerBottom: 72 },
  { name: "430x932", viewportHeight: 932, headerBottom: 80 },
] as const;

for (const phone of phones) {
  check(`${phone.name} rests the vehicle heading just below the header`, () => {
    const frame: QuoteRevealMetrics = {
      scrollY: 1400,
      viewportHeight: phone.viewportHeight,
      headerBottom: phone.headerBottom,
      headingTop: 980,
    };
    const nextTop = computeQuoteRevealScrollTop(frame);
    assert.ok(nextTop != null, "a heading below the fold must scroll");
    const heading = landedHeading(frame, nextTop);
    assert.ok(Math.abs(heading - idealHeading(phone.headerBottom)) <= 1);
    assert.ok(heading > phone.headerBottom, "heading stays clear of the sticky header");
  });
}

check("Short 320x480 phone still stops on the heading, not on the card top", () => {
  const frame: QuoteRevealMetrics = {
    scrollY: 900,
    viewportHeight: 480,
    headerBottom: 64,
    headingTop: 760,
  };
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  assert.ok(Math.abs(landedHeading(frame, nextTop) - idealHeading(64)) <= 1);
});

check("A heading already sitting under the header does not move", () => {
  const headerBottom = 72;
  const frame: QuoteRevealMetrics = {
    scrollY: 400,
    viewportHeight: 700,
    headerBottom,
    headingTop: idealHeading(headerBottom),
  };
  assert.equal(computeQuoteRevealScrollTop(frame), null);
});

check("Desktop uses the same heading stop", () => {
  const frame: QuoteRevealMetrics = {
    scrollY: 600,
    viewportHeight: 900,
    headerBottom: 80,
    headingTop: 740,
  };
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  assert.ok(Math.abs(landedHeading(frame, nextTop) - idealHeading(80)) <= 1);
});

check("The glide cannot scroll past the document", () => {
  const frame: QuoteRevealMetrics = {
    scrollY: 1000,
    viewportHeight: 700,
    headerBottom: 72,
    headingTop: 900,
    maxScroll: 1040,
  };
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.equal(nextTop, 1040);
});

console.log("OK  quote reveal scroll");

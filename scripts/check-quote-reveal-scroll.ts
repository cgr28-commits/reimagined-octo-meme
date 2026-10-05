/**
 * First quote reveal: pause, then frame the price and Book Now.
 * Run: npx tsx scripts/check-quote-reveal-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeQuoteRevealScrollTop,
  HEADER_CLEARANCE_PX,
  QUOTE_REVEAL_MOTION_MS,
  QUOTE_REVEAL_PAUSE_MS,
  type QuoteRevealMetrics,
} from "../src/lib/quote-step-nav-scroll";

const root = path.resolve(import.meta.dirname, "..");
const BOTTOM_PAD = 16;

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function metrics(overrides: QuoteRevealMetrics): QuoteRevealMetrics {
  return overrides;
}

function headerLine(headerBottom: number): number {
  return headerBottom + HEADER_CLEARANCE_PX;
}

function visibleBottom(viewportHeight: number): number {
  return viewportHeight - BOTTOM_PAD;
}

function place(frame: QuoteRevealMetrics, nextTop: number) {
  const delta = frame.scrollY - nextTop;
  return {
    cardTop: frame.cardTop + delta,
    priceTop: frame.priceTop + delta,
    bookBottom: frame.bookBottom + delta,
  };
}

check("Pause and motion stay in the requested range", () => {
  assert.equal(QUOTE_REVEAL_PAUSE_MS, 350);
  assert.ok(QUOTE_REVEAL_MOTION_MS >= 300 && QUOTE_REVEAL_MOTION_MS <= 500);
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  assert.match(css, /animation: quote-result-reveal 420ms ease-out both/);
  assert.match(css, /translateY\(10px\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.quote-result-reveal \{\s*animation: none;/,
  );
});

const phones = [
  { name: "320x568", viewportHeight: 568, headerBottom: 64 },
  { name: "360x640", viewportHeight: 640, headerBottom: 64 },
  { name: "375x667", viewportHeight: 667, headerBottom: 72 },
  { name: "390x844", viewportHeight: 844, headerBottom: 72 },
  { name: "430x932", viewportHeight: 932, headerBottom: 80 },
] as const;

for (const phone of phones) {
  check(`${phone.name} frames price and Book Now under the header`, () => {
    const frame = metrics({
      scrollY: 1400,
      viewportHeight: phone.viewportHeight,
      headerBottom: phone.headerBottom,
      cardTop: 820,
      cardBottom: 1540,
      priceTop: 1180,
      bookBottom: 1460,
      layout: "mobile",
    });
    const nextTop = computeQuoteRevealScrollTop(frame);
    assert.ok(nextTop != null, "quote below the fold must scroll");
    const landed = place(frame, nextTop);
    const line = headerLine(phone.headerBottom);
    const bottom = visibleBottom(phone.viewportHeight);
    assert.ok(landed.priceTop >= line - 1, "price stays below the sticky header");
    assert.ok(landed.bookBottom <= bottom + 1, "Book Now stays above the bottom edge");
    assert.ok(landed.cardTop < line, "does not pin the vehicle image to the header");
  });
}

check("Short 320x480 phone keeps Book Now when price and button cannot both fit", () => {
  const frame = metrics({
    scrollY: 900,
    viewportHeight: 480,
    headerBottom: 64,
    cardTop: 700,
    cardBottom: 1500,
    priceTop: 980,
    bookBottom: 1420,
    layout: "mobile",
  });
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  const landed = place(frame, nextTop);
  const bottom = visibleBottom(frame.viewportHeight);
  const priceAligned = Math.round(frame.scrollY + frame.priceTop - headerLine(frame.headerBottom));
  assert.ok(nextTop > priceAligned, "scrolls further than the price so Book Now can fit");
  assert.ok(Math.abs(landed.bookBottom - bottom) <= 1, "Book Now sits on the bottom edge");
});

check("Mobile does not use card-top alignment when that hides Book Now", () => {
  const frame = metrics({
    scrollY: 0,
    viewportHeight: 640,
    headerBottom: 80,
    cardTop: 40,
    cardBottom: 860,
    priceTop: 360,
    bookBottom: 700,
    layout: "mobile",
  });
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  const cardAligned = Math.max(0, Math.round(frame.cardTop - headerLine(frame.headerBottom)));
  assert.notEqual(nextTop, cardAligned);
  const landed = place(frame, nextTop);
  assert.ok(landed.bookBottom <= visibleBottom(frame.viewportHeight) + 1);
  assert.ok(landed.priceTop >= headerLine(frame.headerBottom) - 1);
});

check("Mobile leaves the page still when price and Book Now are already visible", () => {
  const frame = metrics({
    scrollY: 400,
    viewportHeight: 700,
    headerBottom: 72,
    cardTop: 40,
    cardBottom: 620,
    priceTop: 180,
    bookBottom: 460,
    layout: "mobile",
  });
  assert.equal(computeQuoteRevealScrollTop(frame), null);
});

check("Desktop smooth-lands the whole card under the header", () => {
  const frame = metrics({
    scrollY: 600,
    viewportHeight: 800,
    headerBottom: 80,
    cardTop: 900,
    cardBottom: 1420,
    priceTop: 980,
    bookBottom: 1280,
    layout: "desktop",
  });
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  const landed = place(frame, nextTop);
  assert.ok(Math.abs(landed.cardTop - headerLine(frame.headerBottom)) <= 1);
  assert.ok(landed.bookBottom <= visibleBottom(frame.viewportHeight));
});

check("Desktop does not move a card that is already in view", () => {
  const frame = metrics({
    scrollY: 200,
    viewportHeight: 900,
    headerBottom: 80,
    cardTop: 120,
    cardBottom: 640,
    priceTop: 220,
    bookBottom: 520,
    layout: "desktop",
  });
  assert.equal(computeQuoteRevealScrollTop(frame), null);
});

check("Tall desktop card falls back to price and Book Now", () => {
  const frame = metrics({
    scrollY: 0,
    viewportHeight: 800,
    headerBottom: 80,
    cardTop: 200,
    cardBottom: 1400,
    priceTop: 760,
    bookBottom: 1100,
    layout: "desktop",
  });
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  const landed = place(frame, nextTop);
  assert.ok(landed.priceTop >= headerLine(frame.headerBottom) - 1);
  assert.ok(landed.bookBottom <= visibleBottom(frame.viewportHeight) + 1);
  assert.ok(landed.cardTop < headerLine(frame.headerBottom));
});

console.log("OK  quote reveal scroll");

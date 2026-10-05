/**
 * First quote reveal: pause, then frame the price and Book Now.
 * Run: npx tsx scripts/check-quote-reveal-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeQuoteRevealScrollTop,
  quoteRevealEaseInOut,
  QUOTE_REVEAL_BREATHING_PX,
  QUOTE_REVEAL_MOTION_MS,
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

function metrics(overrides: QuoteRevealMetrics): QuoteRevealMetrics {
  return overrides;
}

function usableTop(headerBottom: number): number {
  return headerBottom + QUOTE_REVEAL_BREATHING_PX;
}

function usableBottom(viewportHeight: number, safeAreaBottom = 0): number {
  return viewportHeight - QUOTE_REVEAL_BREATHING_PX - safeAreaBottom;
}

function place(frame: QuoteRevealMetrics, nextTop: number) {
  const delta = frame.scrollY - nextTop;
  return {
    cardTop: frame.cardTop + delta,
    priceTop: frame.priceTop + delta,
    bookBottom: frame.bookBottom + delta,
  };
}

check("Pause, glide, and fade stay in the requested range", () => {
  assert.ok(QUOTE_REVEAL_PAUSE_MS >= 300 && QUOTE_REVEAL_PAUSE_MS <= 350);
  assert.ok(QUOTE_REVEAL_SCROLL_MS >= 650 && QUOTE_REVEAL_SCROLL_MS <= 800);
  assert.ok(QUOTE_REVEAL_MOTION_MS >= 300 && QUOTE_REVEAL_MOTION_MS <= 500);
  assert.equal(quoteRevealEaseInOut(0), 0);
  assert.equal(quoteRevealEaseInOut(1), 1);
  assert.ok(Math.abs(quoteRevealEaseInOut(0.5) - 0.5) < 0.001);
  assert.ok(quoteRevealEaseInOut(0.25) < 0.25, "ease-in starts slower than linear");
  const scrollLib = fs.readFileSync(path.join(root, "src/lib/quote-step-nav-scroll.ts"), "utf8");
  const reveal = scrollLib.slice(
    scrollLib.indexOf("function readSafeAreaBottom"),
    scrollLib.indexOf("export function quoteStepTargetId"),
  );
  assert.match(reveal, /requestAnimationFrame/);
  assert.match(reveal, /scrollBehavior = "auto"/);
  assert.match(reveal, /QUOTE_REVEAL_SCROLL_MS/);
  assert.match(reveal, /safe-area-inset-bottom/);
  assert.match(reveal, /visualViewport/);
  assert.match(reveal, /offsetTop/);
  assert.doesNotMatch(reveal, /visual\.height \+/);
  assert.doesNotMatch(reveal, /viewport\.height \+/);
  assert.match(reveal, /touchstart/);
  assert.match(reveal, /haltMotion\(\)/);
  assert.doesNotMatch(reveal, /behavior:\s*"smooth"/);
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
    const top = usableTop(phone.headerBottom);
    const bottom = usableBottom(phone.viewportHeight);
    assert.ok(landed.priceTop >= top - 1, "price sits below the sticky header with room");
    assert.ok(landed.bookBottom <= bottom + 1, "Book Now sits above the bottom edge with room");
    const above = landed.priceTop - top;
    const below = bottom - landed.bookBottom;
    assert.ok(Math.abs(above - below) <= 2, "breathing room above the price and below Book Now matches");
    assert.ok(landed.cardTop < landed.priceTop, "does not rest on the vehicle image");
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
  const bottom = usableBottom(frame.viewportHeight);
  assert.ok(landed.priceTop < usableTop(frame.headerBottom), "price may sit under the header when both cannot fit");
  assert.ok(Math.abs(landed.bookBottom - bottom) <= 1, "Book Now keeps its breathing room at the bottom");
});

check("Safe-area inset keeps Book Now above the home indicator", () => {
  const frame = metrics({
    scrollY: 500,
    viewportHeight: 700,
    headerBottom: 72,
    cardTop: 640,
    cardBottom: 1200,
    priceTop: 860,
    bookBottom: 1100,
    safeAreaBottom: 34,
    layout: "mobile",
  });
  const nextTop = computeQuoteRevealScrollTop(frame);
  assert.ok(nextTop != null);
  const landed = place(frame, nextTop);
  assert.ok(landed.bookBottom <= usableBottom(frame.viewportHeight, 34) + 1);
  assert.ok(landed.priceTop >= usableTop(frame.headerBottom) - 1);
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
  const cardAligned = Math.max(0, Math.round(frame.scrollY + frame.cardTop - usableTop(frame.headerBottom)));
  assert.notEqual(nextTop, cardAligned);
  const landed = place(frame, nextTop);
  assert.ok(landed.bookBottom <= usableBottom(frame.viewportHeight) + 1);
  assert.ok(landed.priceTop >= usableTop(frame.headerBottom) - 1);
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

check("Desktop glides the price and Book Now into the open area", () => {
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
  const top = usableTop(frame.headerBottom);
  const bottom = usableBottom(frame.viewportHeight);
  assert.ok(landed.priceTop >= top - 1);
  assert.ok(landed.bookBottom <= bottom + 1);
  assert.ok(Math.abs(landed.priceTop - top - (bottom - landed.bookBottom)) <= 2);
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
  assert.ok(landed.priceTop >= usableTop(frame.headerBottom) - 1);
  assert.ok(landed.bookBottom <= usableBottom(frame.viewportHeight) + 1);
  assert.ok(landed.cardTop < usableTop(frame.headerBottom));
});

console.log("OK  quote reveal scroll");

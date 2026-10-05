/**
 * Quote haptics are one short Vibration API tick, and only where it exists.
 * Run: npx tsx scripts/check-selection-haptic.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canUseSelectionHaptic,
  SELECTION_HAPTIC_MS,
} from "../src/lib/selection-haptic";
import {
  QUOTE_REVEAL_PAUSE_MS,
  QUOTE_REVEAL_SCROLL_MS,
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

check("The tick is a single short pulse", () => {
  assert.ok(SELECTION_HAPTIC_MS >= 1 && SELECTION_HAPTIC_MS <= 20);
  assert.equal(QUOTE_REVEAL_PAUSE_MS, 350);
  assert.equal(QUOTE_REVEAL_SCROLL_MS, 720);
});

check("iPhone and desktop do not claim haptic support", () => {
  assert.equal(canUseSelectionHaptic({ vibrate: undefined, coarsePointer: true }), false);
  assert.equal(canUseSelectionHaptic({ vibrate: () => true, coarsePointer: false }), false);
  assert.equal(canUseSelectionHaptic({ vibrate: () => true, coarsePointer: true }), true);
});

check("No switch hack and no visual stand-in", () => {
  const haptic = fs.readFileSync(path.join(root, "src/lib/selection-haptic.ts"), "utf8");
  assert.match(haptic, /navigator\.vibrate\(SELECTION_HAPTIC_MS\)/);
  assert.doesNotMatch(haptic, /type=["']checkbox["']|setAttribute\(\s*["']switch["']/);
  assert.doesNotMatch(haptic, /translateY|animation|quote-result-reveal/);
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  assert.doesNotMatch(css, /quote-result-reveal/);
});

check("One tick when a selection also starts the quote glide", () => {
  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.match(card, /revealHapticOwnsRef/);
  assert.match(card, /onSettled:\s*\(\)\s*=>\s*\{[\s\S]*?tickSelectionHaptic\(\)/);
  assert.match(card, /if \(revealHapticOwnsRef\.current\)/);
  assert.match(card, /commitQuoteScheduleHaptic/);
  assert.doesNotMatch(card, /quote-result-reveal|quoteResultReveal/);
  const scroll = fs.readFileSync(path.join(root, "src/lib/quote-step-nav-scroll.ts"), "utf8");
  const reveal = scroll.slice(
    scroll.indexOf("export function scheduleQuoteRevealScroll"),
    scroll.indexOf("export function quoteStepTargetId"),
  );
  const interrupt = reveal.slice(reveal.indexOf("const onUserMove"), reveal.indexOf("const onKey"));
  assert.doesNotMatch(interrupt, /settle\(\)/);
  assert.match(reveal, /settle\(\)/);
});

check("Date and time tick on commit, not on every wheel change", () => {
  const fields = fs.readFileSync(path.join(root, "src/components/QuoteScheduleFields.tsx"), "utf8");
  assert.match(fields, /onBlur=\{\(e\) => onScheduleCommit\?\.\("tripDate"/);
  assert.doesNotMatch(fields, /onChange=\{[^}]*onScheduleCommit/);
  assert.doesNotMatch(fields, /onInput=\{[^}]*onScheduleCommit/);
});

console.log("OK  selection haptic");

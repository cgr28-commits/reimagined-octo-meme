/**
 * Homepage hero: no redundant CTAs next to the live quote panel.
 * Run: npx tsx scripts/check-homepage-hero-ctas.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const hero = read("src/components/HeroSlideshow.tsx");
const header = read("src/components/Header.tsx");

console.log("=== 1. Redundant hero buttons removed ===");
{
  assert.doesNotMatch(hero, /Get a Fixed Quote/);
  assert.doesNotMatch(hero, /Book Your Transfer/);
  assert.match(hero, /id="quote"/);
  assert.match(hero, /<QuoteCard/);
  console.log("OK  hero has no Get a Fixed Quote / Book Your Transfer — quote panel remains");
}

console.log("\n=== 2. Benefits sit under heading without competing CTAs ===");
{
  assert.match(hero, /Instant fixed prices online/);
  assert.match(hero, /Flight monitoring on airport pickups/);
  assert.doesNotMatch(hero, /<DeviceBookingCta/);
  console.log("OK  benefits list under heading; quote panel is the primary CTA");
}

console.log("\n=== 3. Nav Get a Quote + coverage text preserved ===");
{
  assert.match(header, /Get a Quote/);
  assert.match(
    hero,
    /Reliable, fixed-price airport transfers to and from Belfast International, Belfast City and Dublin Airport\. Book in advance and travel with confidence\./,
  );
  console.log("OK  header CTA + destination coverage text present");
}

console.log("\n=== 4. No discontinued first-booking promo near quote CTA ===");
{
  const css = read("src/app/globals.css");
  assert.match(hero, /Fixed fares\. Reliable airport transfers\. No surprises\./);
  assert.doesNotMatch(hero, /FirstBookingOfferStrip|FirstBookingOfferBadge/);
  assert.doesNotMatch(hero, /first-booking|firstBooking|£5 booking offer/i);
  assert.doesNotMatch(css, /first-booking-offer-enter/);
  console.log("OK  homepage has no first-booking / £5 booking-offer promo");
}

console.log("\n=== 5. Mobile above-the-fold compaction ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(hero, /pt-20 md:pt-28/);
  assert.match(card, /Get your fixed price in three quick steps\./);
  assert.doesNotMatch(card.match(/md:hidden[\s\S]{0,200}Get your fixed price/)?.[0] ?? "", /Book and pay securely online/);
  assert.match(card, /Three quick steps — your journey/);
  console.log("OK  mobile quote intro is compacted; desktop copy retained");
}

console.log("\nAll homepage hero CTA checks passed.");

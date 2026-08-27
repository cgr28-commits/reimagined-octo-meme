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
  assert.match(hero, /transfers to \{airportList\} airports/);
  assert.match(hero, /Northern Ireland and the Republic of Ireland\./);
  console.log("OK  header CTA + destination coverage text present");
}

console.log("\n=== 4. First-booking offer promo near quote CTA ===");
{
  const strip = read("src/components/FirstBookingOfferStrip.tsx");
  assert.match(hero, /FirstBookingOfferStrip/);
  assert.match(hero, /FirstBookingOfferBadge/);
  assert.match(hero, /Fixed fares\. Reliable airport transfers\. No surprises\./);
  assert.match(strip, /£\{amount\} OFF YOUR FIRST BOOKING/);
  assert.match(strip, /journey fare is £\{minFare\} or more/);
  assert.match(strip, /New customer offer · £\{amount\} off/i);
  assert.match(strip, /QuoteNavLink/);
  assert.match(strip, /href="\/#quote"/);
  assert.doesNotMatch(strip, /createPayment|resolveFirstBookingOffer|claimOffer/);
  console.log("OK  homepage advertises £5 first-booking offer without applying it");
}

console.log("\nAll homepage hero CTA checks passed.");

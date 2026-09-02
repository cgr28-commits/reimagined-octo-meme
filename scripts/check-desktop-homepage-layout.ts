/**
 * Desktop homepage layout must widen via lg+/xl+ classes without changing base/mobile markup.
 * Run: npx tsx scripts/check-desktop-homepage-layout.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Desktop homepage layout (lg+) ===");

const hero = read("src/components/HeroSlideshow.tsx");
assert.match(hero, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(500px,600px\)\]/);
assert.match(hero, /lg:max-w-\[1400px\]/);
assert.match(hero, /lg:items-start/);
assert.doesNotMatch(hero, /lg:max-w-md/);
assert.match(hero, /font-display/);
assert.match(hero, /id="quote"/);
console.log("OK  hero uses balanced desktop grid + top-aligned columns (no max-w-md quote cap)");

const header = read("src/components/Header.tsx");
assert.match(header, /lg:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
assert.match(header, /hidden items-center gap-6 md:flex/);
assert.match(header, /hidden items-center gap-3 md:flex/);
assert.match(header, /sm:gap-2 md:hidden/);
assert.match(header, /rounded-full bg-emerald px-5 py-2/);
assert.match(header, /bg-gradient-to-b from-navy via-navy\/70 to-transparent/);
assert.doesNotMatch(header, /aria-label="Laptop navigation"/);
assert.doesNotMatch(header, /xl:flex xl:justify-center/);
assert.doesNotMatch(
  header,
  /md:flex lg:justify-self-end[\s\S]*?btn-primary[\s\S]*?Get a Quote/,
);
assert.match(header, /Get a Quote/);
assert.match(header, /Manage Your Booking/);
assert.match(header, /aria-label="Main navigation"/);
console.log("OK  header desktop grid at lg+; slim pre-xl CTAs; mobile chrome md:hidden only");

const quote = read("src/components/QuoteCard.tsx");
assert.match(quote, /lg:grid-cols-2/);
assert.match(quote, /lg:space-y-3\.5|lg:space-y-4/);
assert.match(quote, /lg:p-6/);
assert.match(quote, /Get a Live Quote/);
console.log("OK  quote card desktop spacing / side-by-side fields");

const progressive = read("src/components/QuoteProgressiveRoute.tsx");
assert.match(progressive, /lg:grid-cols-2/);
console.log("OK  progressive route desktop airport + party grids");

const airports = read("src/components/AirportsSection.tsx");
assert.match(airports, /lg:max-w-\[1400px\]/);
assert.match(airports, /lg:py-32/);
console.log("OK  homepage sections use wider desktop shell");

console.log("\nAll desktop homepage layout checks passed.");

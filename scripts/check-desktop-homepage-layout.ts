/**
 * Desktop homepage layout must widen via lg+ classes without changing base/mobile markup.
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
assert.doesNotMatch(hero, /lg:max-w-md/);
assert.match(hero, /xl:text-\[4rem\]/);
assert.match(hero, /id="quote"/);
console.log("OK  hero uses balanced desktop grid + wider content (no max-w-md quote cap)");

const header = read("src/components/Header.tsx");
assert.match(header, /lg:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
assert.match(header, /lg:justify-center/);
assert.match(header, /md:hidden/);
assert.match(header, /Quick services/);
console.log("OK  header desktop grid; mobile menu/quick links preserved");

const quote = read("src/components/QuoteCard.tsx");
assert.match(quote, /lg:grid-cols-2/);
assert.match(quote, /lg:space-y-5/);
assert.match(quote, /lg:gap-3/);
console.log("OK  quote card desktop spacing / side-by-side fields");

const progressive = read("src/components/QuoteProgressiveRoute.tsx");
assert.match(progressive, /lg:grid-cols-2/);
console.log("OK  progressive route desktop airport + party grids");

const airports = read("src/components/AirportsSection.tsx");
assert.match(airports, /lg:max-w-\[1400px\]/);
assert.match(airports, /lg:py-32/);
console.log("OK  homepage sections use wider desktop shell");

console.log("\nAll desktop homepage layout checks passed.");

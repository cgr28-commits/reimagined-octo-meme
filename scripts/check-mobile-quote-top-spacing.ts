/**
 * Mobile homepage: quote tool must start high enough that journey question is near the top.
 * Run: npx tsx scripts/check-mobile-quote-top-spacing.ts
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
const card = read("src/components/QuoteCard.tsx");
const prefill = read("src/lib/quote-prefill.ts");

// Quote column renders first on mobile (order-1), marketing copy after (order-2).
assert.match(hero, /order-1[\s\S]*id="quote"|id="quote"[\s\S]*order-1/);
assert.match(hero, /order-2 min-w-0 lg:order-1/);
assert.match(hero, /lg:order-2/);

// Tighter mobile top clearance under sticky header (desktop stays md:pt-28).
assert.match(hero, /pt-36 md:pt-28/);
assert.doesNotMatch(hero, /pt-44/);
assert.match(hero, /py-5/);
assert.match(hero, /md:py-16/);

// Sticky #quote offset matches tighter mobile header.
assert.match(hero, /scroll-mt-36 md:scroll-mt-28/);
assert.match(prefill, /HEADER_SCROLL_OFFSET = 144/);

// Header keeps logo + Menu + quick pills, but with compact mobile sizing.
assert.match(header, /Logo className="h-14 sm:h-16 md:h-20"/);
assert.match(header, /Quick services/);
assert.match(header, /Airport transfers · Get a quote/);
assert.match(header, /Airports|Manage Your Booking|Get a Quote/);
assert.match(header, /Menu/);

// Quote card uses slightly tighter mobile padding so the journey prompt sits higher.
assert.match(card, /glass-card min-w-0 rounded-2xl p-4 sm:p-8 lg:p-6 xl:p-7/);
assert.match(card, /Where are you travelling\?|QuoteProgressiveRoute/);

console.log("OK  mobile hero places quote above marketing copy");
console.log("OK  mobile top padding / scroll-mt tightened (desktop md:pt-28 unchanged)");
console.log("OK  header remains usable with compact mobile chrome");
console.log("OK  quote card mobile padding reduced");
console.log("\nAll mobile quote top-spacing checks passed.");

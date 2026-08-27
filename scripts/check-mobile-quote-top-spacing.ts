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
const data = read("src/lib/data.ts");

// Quote column renders first on mobile (order-1), marketing copy after (order-2).
assert.match(hero, /order-1[\s\S]*id="quote"|id="quote"[\s\S]*order-1/);
assert.match(hero, /order-2 min-w-0 lg:order-1/);
assert.match(hero, /lg:order-2/);

// Compact mobile top clearance under single-row sticky header (desktop stays md:pt-28).
assert.match(hero, /pt-28 md:pt-28/);
assert.doesNotMatch(hero, /pt-44/);
assert.doesNotMatch(hero, /pt-36/);
assert.match(hero, /py-4/);
assert.match(hero, /md:py-16/);

// Sticky #quote offset matches compact mobile header.
assert.match(hero, /scroll-mt-28/);
assert.match(prefill, /HEADER_SCROLL_OFFSET = 112/);

// Mobile header: logo + Get a Quote + WhatsApp + Menu; Airports/Manage only in drawer data/menu.
assert.match(header, /Logo className="h-12 sm:h-16 md:h-20"/);
assert.match(header, /Get a Quote/);
assert.match(header, /Menu/);
assert.match(header, /data-matni-whatsapp-quick/);
assert.doesNotMatch(header, /aria-label="Quick services"/);
assert.match(header, /href="\/manage-booking\/"/);
assert.match(data, /label: "Get a Quote"/);
assert.doesNotMatch(
  data,
  /ALL_MOBILE_QUICK_LINKS = \[[\s\S]*label: "Airports"/,
);
assert.doesNotMatch(
  data,
  /ALL_MOBILE_QUICK_LINKS = \[[\s\S]*label: "Manage Your Booking"/,
);

// Quote card keeps premium mobile padding.
assert.match(card, /glass-card min-w-0 rounded-\[1\.05rem\] p-4|glass-card min-w-0 rounded-2xl p-4/);
assert.match(card, /Where are you travelling\?|QuoteProgressiveRoute/);
assert.match(card, /quote-secondary|Get a Live Quote/);

console.log("OK  mobile hero places quote above marketing copy");
console.log("OK  mobile top padding / scroll-mt compact under single-row header");
console.log("OK  header CTAs reduced; Airports/Manage live in menu");
console.log("OK  quote card mobile padding preserved");
console.log("\nAll mobile quote top-spacing checks passed.");

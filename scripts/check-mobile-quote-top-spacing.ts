/**
 * Mobile homepage: compact service message first, then the start of the quote form.
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

// Mobile: marketing copy first (order-1). Tablet restores quote-first (md:order-1).
assert.match(hero, /order-1 min-w-0 md:order-2 lg:order-1/);
assert.match(hero, /order-2 min-w-0 w-full[\s\S]*id="quote"|id="quote"[\s\S]*order-2 min-w-0 w-full/);
assert.match(hero, /md:order-1 md:scroll-mt-28 lg:order-2/);

// Compact mobile stack: tighter gap, short supporting line, extra hero blocks hidden.
assert.match(hero, /gap-3\.5/);
assert.match(hero, /md:gap-12/);
assert.match(hero, /section-eyebrow mb-2[\s\S]*md:mb-5/);
assert.match(hero, /Private taxi airport transfers/);
assert.match(
  hero,
  /Fixed-price, pre-booked private taxi transfers to Belfast International, Belfast City and Dublin Airport\./,
);
assert.match(hero, /md:hidden/);
assert.match(hero, /hidden max-w-xl[\s\S]*md:block/);
assert.match(hero, /hidden gap-3\.5[\s\S]*md:grid/);
assert.doesNotMatch(hero, /whitespace-nowrap/);

// Mobile top clearance matches fixed header (~logo h-12 + py-2 ≈ 4rem) + small gap.
// Desktop stays md:pt-28. Do not leave a large empty navy band above the quote card.
assert.match(hero, /pt-20 md:pt-28/);
assert.doesNotMatch(hero, /pt-36/);
assert.doesNotMatch(hero, /pt-\[4\.5rem\]/);
assert.doesNotMatch(hero, /pt-\[4\.75rem\]/);
assert.doesNotMatch(hero, /pt-44/);
assert.match(hero, /py-2/);
assert.match(hero, /md:py-16/);

// Sticky #quote offset matches mobile header clearance.
assert.match(hero, /scroll-mt-20 md:scroll-mt-28|scroll-mt-20[\s\S]*md:scroll-mt-28/);
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

// Quote card keeps premium mobile padding — do not shrink form controls.
assert.match(card, /glass-card min-w-0 rounded-\[1\.05rem\] p-4|glass-card min-w-0 rounded-2xl p-4/);
assert.match(card, /Where are you travelling\?|QuoteProgressiveRoute/);
assert.match(card, /quote-secondary|Get a Live Quote/);

console.log("OK  mobile hero places service message above the quote form");
console.log("OK  tablet/desktop restore the previous column order");
console.log("OK  mobile top padding clears fixed header without a large empty band (pt-20 / py-2)");
console.log("OK  header CTAs reduced; Airports/Manage live in menu");
console.log("OK  quote card mobile padding preserved");
console.log("\nAll mobile quote top-spacing checks passed.");

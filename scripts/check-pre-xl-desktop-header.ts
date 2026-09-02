/**
 * Assert desktop header matches pre-8d153752 responsive behaviour
 * (md/lg desktop chrome; mobile chrome stays md:hidden).
 * Run: npx tsx scripts/check-pre-xl-desktop-header.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const header = readFileSync(join(root, "src/components/Header.tsx"), "utf8");

console.log("=== Pre-8d153752 desktop header restore ===");

assert.match(header, /bg-gradient-to-b from-navy via-navy\/70 to-transparent/);
assert.match(header, /hidden md:block/);
assert.match(header, /24\/7 airport transfers across Northern Ireland/);
assert.match(
  header,
  /mx-auto flex max-w-7xl items-center justify-between gap-3[\s\S]*lg:grid lg:max-w-\[1400px\] lg:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/,
);
assert.match(header, /hidden items-center gap-6 md:flex lg:justify-center lg:gap-5 xl:gap-7/);
assert.match(header, /hidden items-center gap-3 md:flex lg:justify-self-end/);
assert.match(
  header,
  /rounded-full border border-white\/20[\s\S]*Manage Your Booking/,
);
assert.match(
  header,
  /rounded-full bg-emerald px-5 py-2 text-sm font-semibold text-navy/,
);
// Desktop header CTA must not use the tall btn-primary control (mobile drawer may still use it).
assert.match(
  header,
  /md:flex lg:justify-self-end[\s\S]*?rounded-full bg-emerald px-5 py-2[\s\S]*?Get a Quote[\s\S]*?<\/div>/,
);
assert.doesNotMatch(
  header,
  /md:flex lg:justify-self-end[\s\S]*?btn-primary[\s\S]*?Get a Quote/,
);
assert.doesNotMatch(header, /xl:flex xl:justify-center/);
assert.doesNotMatch(header, /aria-label="Laptop navigation"/);

// Mobile chrome must remain strictly below md
assert.match(header, /sm:gap-2 md:hidden/);
assert.match(header, /data-matni-whatsapp-quick/);
assert.match(header, /fixed inset-0 z-\[80\][\s\S]*md:hidden/);

const hero = readFileSync(join(root, "src/components/HeroSlideshow.tsx"), "utf8");
assert.match(hero, /md:pt-28/);
assert.match(hero, /md:scroll-mt-28/);
assert.doesNotMatch(hero, /xl:scroll-mt-28/);

// Landing pages / sections must clear the desktop header from md (not only xl)
for (const rel of [
  "src/app/long-distance-transfers/page.tsx",
  "src/app/locations/page.tsx",
  "src/app/transfers/[slug]/page.tsx",
  "src/app/airports/[slug]/page.tsx",
]) {
  const page = readFileSync(join(root, rel), "utf8");
  assert.match(page, /pt-36 md:pt-28/);
  assert.doesNotMatch(page, /xl:pt-28/);
}

for (const rel of [
  "src/components/AirportsSection.tsx",
  "src/components/AreasSection.tsx",
  "src/components/FAQSection.tsx",
  "src/components/WhyChooseUsSection.tsx",
]) {
  const section = readFileSync(join(root, rel), "utf8");
  assert.match(section, /scroll-mt-36 md:scroll-mt-28/);
  assert.doesNotMatch(section, /xl:scroll-mt-28/);
}

console.log("OK  desktop: gradient chrome, md/lg grid, slim rounded-full CTAs");
console.log("OK  mobile: Quote/WhatsApp/Menu remain md:hidden");
console.log("OK  no xl-gated desktop nav / no laptop secondary nav / no btn-primary header CTA");
console.log("OK  landing/section header clearance uses md: (not xl:)");
console.log("\nAll pre-xl desktop header checks passed.");

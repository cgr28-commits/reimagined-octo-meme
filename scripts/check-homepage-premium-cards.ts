/**
 * Assert homepage premium card/box chrome matches the known-good look
 * from immediately before commit 75d0444 (premium redesign flattened cards),
 * while keeping #446 md:scroll-mt header clearance.
 *
 * Run: npx tsx scripts/check-homepage-premium-cards.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

console.log("=== Homepage premium card restore ===");

const airports = read("src/components/AirportsSection.tsx");
assert.match(airports, /scroll-mt-36 md:scroll-mt-28/);
assert.match(
  airports,
  /group rounded-2xl border border-white\/10 bg-white\/\[0\.03\] p-6 transition-all hover:border-emerald\/30 hover:bg-white\/\[0\.06\] hover:shadow-xl hover:shadow-emerald\/5/,
);
assert.match(airports, /rounded-lg bg-emerald\/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald/);
assert.doesNotMatch(airports, /bg-white\/\[0\.025\]/);
assert.doesNotMatch(airports, /hover:border-white\/20/);

const areas = read("src/components/AreasSection.tsx");
assert.match(areas, /scroll-mt-36 md:scroll-mt-28/);
assert.match(areas, /rounded-xl border border-white\/10 bg-white\/5 px-5 py-4/);
assert.match(areas, /rounded-2xl border border-white\/10 bg-white\/\[0\.03\]/);
assert.match(areas, /hover:bg-emerald\/10 hover:text-white/);
assert.match(areas, /M5\.05 4\.05a7 7 0 119\.9 9\.9L10 18\.9l-4\.95-4\.95a7 7 0 010-9\.9z/);
assert.doesNotMatch(areas, /font-display text-3xl font-semibold text-white/);
assert.doesNotMatch(areas, /h-px w-2\.5 shrink-0 bg-emerald\/70/);

const why = read("src/components/WhyChooseUsSection.tsx");
assert.match(why, /scroll-mt-36 md:scroll-mt-28/);
assert.match(
  why,
  /rounded-2xl border border-white\/10 bg-white\/\[0\.03\] p-6 transition-all hover:border-emerald\/20 hover:bg-white\/\[0\.05\]/,
);
assert.doesNotMatch(why, /border-t border-white\/12 pt-6/);
assert.doesNotMatch(why, /sm:border sm:rounded-2xl/);

const vehicles = read("src/components/VehiclesSection.tsx");
assert.match(vehicles, /scroll-mt-36 md:scroll-mt-28/);
assert.match(vehicles, /rounded-2xl border border-emerald\/30 bg-emerald\/10 px-5 py-5/);
assert.match(
  vehicles,
  /rounded-full bg-emerald px-6 py-3 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald\/25/,
);
assert.doesNotMatch(vehicles, /border-l-2 border-emerald\/60/);
assert.doesNotMatch(vehicles, /btn-primary px-7/);

// #446 desktop header restore must remain intact
const header = read("src/components/Header.tsx");
assert.match(header, /bg-gradient-to-b from-navy via-navy\/70 to-transparent/);
assert.match(header, /hidden items-center gap-6 md:flex/);
assert.match(header, /rounded-full bg-emerald px-5 py-2/);
assert.doesNotMatch(header, /xl:flex xl:justify-center/);

console.log("OK  Airports: bordered cards + emerald badge + hover glow");
console.log("OK  Areas: stat boxes + town panel + pin icons");
console.log("OK  Why Us: always-on bordered cards");
console.log("OK  Vehicles: emerald Saloon/Estate card + pill CTA");
console.log("OK  #446 desktop header chrome preserved");
console.log("\nAll homepage premium card checks passed.");

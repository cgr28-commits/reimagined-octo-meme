/**
 * Homepage hero heading + supporting copy for Google Ads visitors.
 * Run: npx tsx scripts/check-homepage-hero-copy.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const hero = fs.readFileSync(path.join(root, "src/components/HeroSlideshow.tsx"), "utf8");
const header = fs.readFileSync(path.join(root, "src/components/Header.tsx"), "utf8");
const logo = fs.readFileSync(path.join(root, "src/components/Logo.tsx"), "utf8");

assert.match(hero, /Belfast Airport Transfers/);
assert.match(hero, /– Pre-Booked 24\/7/);
assert.match(
  hero,
  /whitespace-nowrap">– Pre-Booked 24\/7/,
  "Pre-Booked 24/7 should stay on one line when the H1 wraps",
);
assert.match(hero, /text-balance/, "longer H1 should use text-balance for clean wraps");
assert.doesNotMatch(
  hero,
  /<h1[\s\S]*?>[\s\S]*My Airport Taxi NI/,
  "homepage H1 should no longer be the brand name",
);

assert.match(
  hero,
  /Reliable, fixed-price airport transfers to and from Belfast International, Belfast City and Dublin Airport\. Book in advance and travel with confidence\./,
  "homepage hero supporting copy should explain pre-booked Belfast and Dublin airport transfers",
);
assert.doesNotMatch(
  hero,
  /on-demand|on demand|taxi rank|immediate taxi/i,
  "homepage hero should not imply an on-demand taxi service",
);

assert.match(header, /<Logo /);
assert.match(logo, /alt="My Airport Taxi NI"/);

// Longer line: keep wrap-safe constraints on mobile + desktop
assert.match(hero, /max-w-xl/);
assert.match(hero, /min-w-0/);
assert.match(hero, /overflow-x-clip/);

console.log("OK  homepage H1 is Belfast Airport Transfers – Pre-Booked 24/7");
console.log("OK  supporting copy explains pre-booked Belfast and Dublin transfers");
console.log("OK  header logo branding is unchanged");
console.log("OK  wrap-safe max-width + overflow guards present");
console.log("\nAll homepage hero copy checks passed.");

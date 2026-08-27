/**
 * Homepage hero subtitle wording + wrap-safe layout.
 * Run: npx tsx scripts/check-homepage-hero-copy.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const hero = fs.readFileSync(path.join(root, "src/components/HeroSlideshow.tsx"), "utf8");

assert.match(hero, /My Airport Taxi NI/);
assert.match(
  hero,
  /transfers to \{airportList\} airports/,
);
assert.match(hero, /Northern Ireland and the Republic of Ireland\./);
assert.doesNotMatch(hero, /\bROI\b/);
assert.match(
  hero,
  /Belfast International, Belfast City, City of Derry and Dublin/,
);
assert.doesNotMatch(
  hero,
  /City of Derry, and Dublin/,
);

// Longer line: keep wrap-safe constraints on mobile + desktop
assert.match(hero, /max-w-xl/);
assert.match(hero, /min-w-0/);
assert.match(hero, /overflow-x-clip/);

console.log("OK  homepage hero subtitle uses Republic of Ireland wording");
console.log("OK  wrap-safe max-width + overflow guards present");
console.log("\nAll homepage hero copy checks passed.");

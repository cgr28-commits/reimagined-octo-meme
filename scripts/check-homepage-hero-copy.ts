/**
 * Homepage hero heading + supporting copy for Google Ads visitors.
 * Run: npx tsx scripts/check-homepage-hero-copy.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { WHY_CHOOSE_US } from "../src/lib/data";

const root = path.resolve(import.meta.dirname, "..");
const hero = fs.readFileSync(path.join(root, "src/components/HeroSlideshow.tsx"), "utf8");
const header = fs.readFileSync(path.join(root, "src/components/Header.tsx"), "utf8");
const logo = fs.readFileSync(path.join(root, "src/components/Logo.tsx"), "utf8");
const why = fs.readFileSync(path.join(root, "src/lib/data.ts"), "utf8");

assert.match(hero, /Belfast Airport Transfers/);
assert.doesNotMatch(
  hero,
  /Pre-Booked 24\/7/,
  "hero must not use Pre-Booked 24/7 in the main message",
);
assert.doesNotMatch(
  hero,
  /<h1[\s\S]*?>[\s\S]*24\/7/,
  "H1 must not include 24/7",
);
assert.doesNotMatch(
  hero,
  /whitespace-nowrap/,
  "H1 should wrap naturally",
);
assert.match(hero, /text-balance/, "H1 should use text-balance for clean wraps");
assert.doesNotMatch(
  hero,
  /<h1[\s\S]*?>[\s\S]*My Airport Taxi NI/,
  "homepage H1 should no longer be the brand name",
);
assert.match(hero, /Private taxi airport transfers/);
assert.doesNotMatch(hero, />Private airport transfers</);
assert.match(
  hero,
  /Fixed-price private airport transfers, booked in advance with a driver reserved for your chosen pickup time\./,
  "hero supporting copy must explain advance-booked reserved-driver transfers",
);
assert.match(
  hero,
  /<h1[\s\S]*?>[\s\S]*Belfast Airport Transfers\s*<\/h1>/,
  "homepage H1 must be Belfast Airport Transfers",
);
assert.match(
  hero,
  /Reserved driver · Fixed price · Flight monitoring · Airport waiting included/,
  "compact benefits row must sit by the quote panel",
);
assert.match(hero, /A driver reserved for your journey/);

assert.doesNotMatch(
  hero,
  /on-demand|on demand|taxi rank|immediate taxi/i,
  "homepage hero should not imply an on-demand taxi service",
);

assert.match(header, /<Logo /);
assert.match(header, /Book online 24\/7 across Northern Ireland/);
assert.doesNotMatch(header, /24\/7 airport transfers/);
assert.match(logo, /alt="My Airport Taxi NI"/);

assert.match(why, /A driver reserved for your journey/);
assert.match(why, /Your confirmed transfer has a driver and pickup time allocated in advance/);
assert.match(why, /Book online 24\/7/);
assert.doesNotMatch(why, /24\/7, 365 days a year/);
assert.doesNotMatch(why, /Your specific driver is guaranteed|exact vehicle is permanently assigned/);

const reserved = WHY_CHOOSE_US.find((item) => item.title === "A driver reserved for your journey");
assert.ok(reserved, "Why Choose Us must include reserved-driver card");
assert.match(reserved!.description, /travel-day updates/i);
assert.match(reserved!.description, /email you when your driver is on the way/);

// Longer line: keep wrap-safe constraints on mobile + desktop
assert.match(hero, /max-w-xl/);
assert.match(hero, /min-w-0/);
assert.match(hero, /overflow-x-clip/);

console.log("OK  homepage H1 is Belfast Airport Transfers");
console.log("OK  supporting copy explains advance-booked reserved-driver transfers");
console.log("OK  compact benefits sit by the quote panel");
console.log("OK  Why Choose Us reserved-driver card retains travel-day updates");
console.log("OK  header 24/7 refers to online booking only");
console.log("OK  wrap-safe max-width + overflow guards present");
console.log("\nAll homepage hero copy checks passed.");

/**
 * Homepage hero: no redundant CTAs next to the live quote panel.
 * Run: npx tsx scripts/check-homepage-hero-ctas.ts
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

console.log("=== 1. Redundant hero buttons removed ===");
{
  assert.doesNotMatch(hero, /Get a Fixed Quote/);
  assert.doesNotMatch(hero, /Book Your Transfer/);
  assert.match(hero, /id="quote"/);
  assert.match(hero, /<QuoteCard/);
  console.log("OK  hero has no Get a Fixed Quote / Book Your Transfer — quote panel remains");
}

console.log("\n=== 2. Benefits sit under heading without large CTA gap ===");
{
  assert.match(
    hero,
    /Republic of Ireland\.\s*<\/p>\s*<div className="mt-6 flex flex-wrap/,
  );
  assert.match(hero, /lg:mt-5 lg:grid lg:grid-cols-2/);
  console.log("OK  benefits spacing tightened under heading copy");
}

console.log("\n=== 3. Nav Get a Quote + coverage text preserved ===");
{
  assert.match(header, /Get a Quote/);
  assert.match(
    hero,
    /Fixed price transfers to \{airportList\} airports — plus door-to-door transfers across/,
  );
  assert.match(hero, /Northern Ireland and the Republic of Ireland\./);
  console.log("OK  header CTA + destination coverage text unchanged");
}

console.log("\nAll homepage hero CTA checks passed.");

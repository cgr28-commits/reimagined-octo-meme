/**
 * Airport pages and transfer routes must use genuine airport hero photographs.
 * Town hubs and tour pages may keep local/landmark imagery.
 * Run: npx tsx scripts/check-airport-hero-images.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AIRPORT_HERO,
  isLandmarkHeroBase,
  type AirportHeroCode,
} from "../src/lib/airport-hero";
import { ALL_HERO_SLIDES } from "../src/lib/data";
import {
  AIRPORT_PAGES,
  TOWN_HUB_PAGES,
  TRANSFER_ROUTE_PAGES,
} from "../src/lib/location-pages";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const CODES: AirportHeroCode[] = ["BFS", "BHD", "DUB", "LDY"];

console.log("=== Central airport hero mapping ===");
{
  for (const code of CODES) {
    const asset = AIRPORT_HERO[code];
    assert.ok(asset.heroBase);
    assert.ok(asset.sourceBasename);
    assert.match(asset.alt, /Airport terminal$/);
    assert.equal(isLandmarkHeroBase(asset.heroBase), false);
    const source = join(root, "public/images/hero", `${asset.sourceBasename}.jpg`);
    assert.ok(existsSync(source), `missing source ${source}`);
    for (const width of [960, 1920]) {
      for (const ext of ["jpg", "webp", "avif"]) {
        const optimized = join(
          root,
          "public/images/hero/optimized",
          `${asset.heroBase}-${width}.${ext}`,
        );
        assert.ok(existsSync(optimized), `missing optimized ${optimized}`);
      }
    }
  }
  console.log("OK  BFS/BHD/DUB/LDY sources and optimized variants exist");
}

console.log("\n=== Airport guide pages ===");
{
  assert.equal(AIRPORT_PAGES.length, 4);
  for (const page of AIRPORT_PAGES) {
    const expected = AIRPORT_HERO[page.code];
    assert.equal(page.heroBase, expected.heroBase, `${page.slug} heroBase`);
    assert.equal(page.heroAlt, expected.alt, `${page.slug} heroAlt`);
    assert.equal(isLandmarkHeroBase(page.heroBase), false, `${page.slug} landmark`);
  }
  console.log("OK  /airports/* use the central airport photographs");
}

console.log("\n=== Transfer route pages ===");
{
  assert.ok(TRANSFER_ROUTE_PAGES.length >= 30);
  for (const route of TRANSFER_ROUTE_PAGES) {
    const expected = AIRPORT_HERO[route.airport.code];
    assert.equal(
      route.airport.heroBase,
      expected.heroBase,
      `${route.slug} must use ${route.airport.code} airport image`,
    );
    assert.equal(isLandmarkHeroBase(route.airport.heroBase), false, route.slug);
  }
  console.log(`OK  ${TRANSFER_ROUTE_PAGES.length} transfer routes use the destination airport image`);
}

console.log("\n=== Town hubs keep local imagery ===");
{
  const airportBases = new Set(CODES.map((code) => AIRPORT_HERO[code].heroBase));
  assert.equal(TOWN_HUB_PAGES.length, 10);
  for (const hub of TOWN_HUB_PAGES) {
    assert.ok(
      !airportBases.has(hub.heroBase),
      `${hub.slug} should not use an airport terminal photograph`,
    );
  }
  console.log("OK  10 town hubs were not converted to airport terminal photos");
}

console.log("\n=== Tours left on attraction imagery ===");
{
  const tours = read("src/lib/tours.ts");
  assert.match(tours, /giants-causeway/);
  assert.match(tours, /antrim-coast/);
  assert.match(tours, /mourne-mountains/);
  assert.doesNotMatch(tours, /belfast-international-arrivals|derry-airport|dublin-airport/);
  console.log("OK  tour pages still use destination/attraction photographs");
}

console.log("\n=== Airport-coded hero slides ===");
{
  for (const slide of ALL_HERO_SLIDES) {
    const expected = AIRPORT_HERO[slide.airportCode];
    assert.match(slide.image, new RegExp(`${expected.heroBase}-1920\\.jpg`));
    assert.equal(slide.alt, expected.alt);
  }
  console.log("OK  unused airport hero-slide catalogue no longer points at landmarks");
}

console.log("\n=== Optimizer lists airport sources ===");
{
  const optimizer = read("scripts/optimize-hero-images.mjs");
  for (const code of CODES) {
    const asset = AIRPORT_HERO[code];
    assert.match(optimizer, new RegExp(`"${asset.sourceBasename}"`));
    assert.match(optimizer, new RegExp(`"${asset.heroBase}"`));
  }
  console.log("OK  optimize-hero-images.mjs includes the four airport sources");
}

console.log("\nAll airport hero image checks passed.");

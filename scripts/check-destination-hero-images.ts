/**
 * Town hubs use DESTINATION_HERO only when a genuine local photograph exists.
 * Missing towns must not fall back to unrelated NI landmarks or airport photos.
 * Run: npx tsx scripts/check-destination-hero-images.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AIRPORT_HERO, isLandmarkHeroBase } from "../src/lib/airport-hero";
import {
  DESTINATION_HERO,
  getDestinationHero,
  MISSING_DESTINATION_HEROES,
} from "../src/lib/destination-hero";
import { AIRPORT_PAGES, TOWN_HUB_PAGES, TRANSFER_ROUTE_PAGES } from "../src/lib/location-pages";
import { TOURS } from "../src/lib/tours";

const root = process.cwd();
const airportBases = new Set(Object.values(AIRPORT_HERO).map((asset) => asset.heroBase));

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Destination mapping only includes real local photographs ===");
{
  for (const [slug, asset] of Object.entries(DESTINATION_HERO)) {
    assert.ok(!airportBases.has(asset.heroBase), `${slug} must not reuse an airport photo`);
    const source = join(root, "public/images", asset.sourceDir, `${asset.sourceBasename}.jpg`);
    assert.ok(existsSync(source), `missing ${source}`);
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
  assert.ok(getDestinationHero("belfast"));
  assert.equal(getDestinationHero("carrickfergus")?.heroBase, "carrickfergus-castle");
  assert.equal(getDestinationHero("holywood"), undefined);
  assert.equal(getDestinationHero("ballymena"), undefined);
  console.log("OK  mapped destinations have source + optimized files");
}

console.log("\n=== Town hubs ===");
{
  const missingSlugs = new Set(MISSING_DESTINATION_HEROES.map((item) => item.slug));
  assert.equal(TOWN_HUB_PAGES.length, 10);
  for (const hub of TOWN_HUB_PAGES) {
    const mapped = getDestinationHero(hub.town.slug);
    if (mapped) {
      assert.equal(hub.heroBase, mapped.heroBase, hub.slug);
      assert.equal(hub.heroAlt, mapped.alt, hub.slug);
      assert.ok(!airportBases.has(hub.heroBase ?? ""), hub.slug);
    } else {
      assert.equal(hub.heroBase, undefined, `${hub.slug} must not use a filler landmark`);
      assert.equal(hub.heroAlt, undefined, hub.slug);
      assert.ok(missingSlugs.has(hub.town.slug), `${hub.town.slug} should be listed as missing`);
    }
  }
  const carrick = TOWN_HUB_PAGES.find((hub) => hub.town.slug === "carrickfergus");
  assert.ok(carrick);
  assert.equal(carrick.heroBase, "carrickfergus-castle");
  assert.equal(carrick.heroAlt, "Carrickfergus Castle on Belfast Lough");
  const holywood = TOWN_HUB_PAGES.find((hub) => hub.town.slug === "holywood");
  assert.ok(holywood);
  assert.equal(holywood.heroBase, undefined);
  const ballymena = TOWN_HUB_PAGES.find((hub) => hub.town.slug === "ballymena");
  assert.ok(ballymena);
  assert.equal(ballymena.heroBase, undefined);
  assert.ok(MISSING_DESTINATION_HEROES.some((item) => item.slug === "holywood"));
  assert.ok(MISSING_DESTINATION_HEROES.some((item) => item.slug === "ballymena"));
  console.log("OK  hubs with a genuine local photo use DESTINATION_HERO");
  console.log("    Holywood and Ballymena stay unresolved until a suitable legal photo exists.");
}

console.log("\n=== Airport pages stay on AIRPORT_HERO ===");
{
  for (const page of AIRPORT_PAGES) {
    assert.equal(page.heroBase, AIRPORT_HERO[page.code].heroBase);
    assert.equal(isLandmarkHeroBase(page.heroBase), false, page.slug);
    assert.notEqual(page.heroBase, "carrickfergus-castle");
    assert.notEqual(page.heroBase, "giants-causeway");
    assert.notEqual(page.heroBase, "antrim-coast");
    assert.notEqual(page.heroBase, "titanic-belfast");
    assert.notEqual(page.heroBase, "mourne-mountains");
  }
  for (const route of TRANSFER_ROUTE_PAGES) {
    assert.equal(route.airport.heroBase, AIRPORT_HERO[route.airport.code].heroBase);
    assert.equal(isLandmarkHeroBase(route.airport.heroBase), false, route.slug);
  }
  console.log("OK  PR #499 airport mapping remains intact");
}

console.log("\n=== Tours keep attraction photographs ===");
{
  const bySlug = Object.fromEntries(TOURS.map((tour) => [tour.slug, tour]));
  assert.match(bySlug["giants-causeway"].image, /giants-causeway/);
  assert.match(bySlug["antrim-coast"].image, /antrim-coast/);
  assert.match(bySlug["mourne-mountains"].image, /mourne-mountains/);
  assert.match(bySlug["belfast-city"].image, /belfast-city/);
  assert.match(bySlug["game-of-thrones"].image, /game-of-thrones/);
  assert.match(bySlug["derry-londonderry"].image, /derry-londonderry/);
  for (const tour of TOURS) {
    assert.ok(!/belfast-international|dublin-airport|derry-airport/.test(tour.image));
  }
  console.log("OK  tour pages still use attraction imagery");
}

console.log("\n=== Town hub content has no hardcoded hero paths ===");
{
  const hubs = read("src/lib/town-hubs-content.ts");
  assert.doesNotMatch(hubs, /heroBase/);
  assert.doesNotMatch(hubs, /antrim-coast|titanic-belfast|dublin-beckett/);
  console.log("OK  hub photographs come only from DESTINATION_HERO");
}

console.log("\n=== Newly sourced destination photos have attribution records ===");
{
  const sourced = [
    "carrickfergus-castle",
    "bangor-harbour",
    "antrim-castle-gardens",
    "larne-chaine-monument",
    "newry-town-hall",
    "lisburn-linen-centre",
    "ballyclare-town-hall",
    "newtownabbey-belfast-lough",
  ];
  for (const name of sourced) {
    const attr = join(root, "public/images/hero/attributions", `${name}.txt`);
    assert.ok(existsSync(attr), `missing attribution ${attr}`);
    const text = readFileSync(attr, "utf8");
    assert.match(text, /Source URL:/);
    assert.match(text, /Creator:/);
    assert.match(text, /Licence:/);
    assert.match(text, /Date accessed:/);
    assert.match(text, /Attribution required:/);
  }
  console.log("OK  attribution files record source, creator, and licence");
}

console.log("\nAll destination hero image checks passed.");

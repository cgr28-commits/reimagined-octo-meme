/**
 * First-batch town hub + route landing page contracts.
 * Run: npx tsx scripts/check-town-landing-pages.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCanonicalTransferSlugs,
  getTownHubPage,
  getTransferRoutePage,
  TOWN_HUB_PAGES,
  TRANSFER_ROUTE_PAGES,
} from "../src/lib/location-pages";
import { TRANSFER_ROUTE_CONTENT } from "../src/lib/transfer-routes-content";
import { TOWN_HUB_CONTENT } from "../src/lib/town-hubs-content";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const FIRST_TOWNS = ["newtownabbey", "carrickfergus", "ballyclare", "lisburn", "bangor"] as const;

console.log("=== First-batch hubs ===");
{
  assert.equal(TOWN_HUB_PAGES.length, 5);
  assert.deepEqual(
    TOWN_HUB_PAGES.map((hub) => hub.town.slug),
    [...FIRST_TOWNS],
  );
  for (const hub of TOWN_HUB_PAGES) {
    assert.equal(hub.h1, `${hub.town.name} Airport Taxi & Airport Transfers`);
    assert.equal(hub.title, hub.h1);
    assert.match(hub.metaDescription, /Belfast International|Dublin Airport|Belfast City/);
    const words = hub.intro.trim().split(/\s+/).length;
    assert.ok(words >= 120 && words <= 200, `${hub.slug} intro words=${words}`);
    assert.doesNotMatch(hub.intro, /Looking for a taxi from/i);
    assert.ok(hub.areas.length >= 3);
  }
  const metas = TOWN_HUB_PAGES.map((hub) => hub.metaDescription);
  assert.equal(new Set(metas).size, metas.length);
  const intros = TOWN_HUB_PAGES.map((hub) => hub.intro);
  assert.equal(new Set(intros).size, intros.length);
  console.log("OK  5 unique town hubs");
}

console.log("\n=== First-batch routes ===");
{
  const landing = TRANSFER_ROUTE_PAGES.filter((route) => route.faqs?.length);
  assert.equal(landing.length, 15);
  assert.equal(TRANSFER_ROUTE_CONTENT.length, 15);
  for (const town of FIRST_TOWNS) {
    const bfs = getTransferRoutePage(`${town}-to-belfast-international`);
    const bhd = getTransferRoutePage(`${town}-to-belfast-city-airport`);
    const dub = getTransferRoutePage(`${town}-to-dublin-airport`);
    assert.ok(bfs && bhd && dub, `missing routes for ${town}`);
    assert.equal(bfs.airport.code, "BFS");
    assert.equal(bhd.airport.code, "BHD");
    assert.equal(dub.airport.code, "DUB");
    assert.ok(bfs.hubSlug?.endsWith("-airport-taxis"));
  }
  assert.ok(getTransferRoutePage("newtownabbey-to-dublin"));
  assert.equal(getTransferRoutePage("newtownabbey-to-dublin")?.slug, "newtownabbey-to-dublin-airport");
  assert.ok(getTransferRoutePage("belfast-to-dublin"));
  assert.equal(getTransferRoutePage("belfast-to-dublin")?.slug, "belfast-to-dublin");

  const titles = landing.map((route) => route.title);
  const descriptions = landing.map((route) => route.metaDescription);
  const intros = landing.map((route) => route.intro);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(new Set(intros).size, intros.length);
  for (const route of landing) {
    const words = route.intro.trim().split(/\s+/).length;
    assert.ok(words >= 120 && words <= 200, `${route.slug} intro words=${words}`);
    assert.doesNotMatch(route.intro, /Looking for a taxi from/i);
    assert.match(route.journeyInfo ?? "", /Journey times are approximate/);
    assert.doesNotMatch(route.journeyInfo ?? "", /\b\d+\s*(miles|km)\b/i);
    assert.ok((route.faqs?.length ?? 0) >= 4);
    assert.ok(route.faqs?.every((faq) => !/£\d/.test(faq.answer)));
    assert.ok(route.faqs?.some((faq) => /instant quote|quote tool|quote box/i.test(faq.answer)));
  }
  console.log("OK  15 unique route pages, no invented fares or mileages");
}

console.log("\n=== Existing catalogue URLs still resolve ===");
{
  assert.ok(getTransferRoutePage("belfast-to-belfast-international"));
  assert.ok(getTransferRoutePage("belfast-to-city-of-derry"));
  assert.ok(getTransferRoutePage("newtownabbey-to-city-of-derry"));
  assert.ok(getTransferRoutePage("lisburn-to-city-of-derry"));
  assert.ok(getTransferRoutePage("bangor-to-city-of-derry"));
  assert.equal(getTownHubPage("holywood-airport-taxis"), undefined);
  assert.equal(getTownHubPage("antrim-airport-taxis"), undefined);
  console.log("OK  leftover Belfast/LDY routes kept · later towns not created");
}

console.log("\n=== Pages, schema, sitemap ===");
{
  const hubPage = read("src/app/locations/[slug]/page.tsx");
  const routePage = read("src/app/transfers/[slug]/page.tsx");
  const locations = read("src/app/locations/page.tsx");
  const sitemap = read("public/sitemap.xml");
  const sitemapScript = read("scripts/generate-sitemap.mjs");
  const robots = read("src/app/robots.ts");

  assert.match(hubPage, /getBreadcrumbJsonLd/);
  assert.match(hubPage, /getServiceAreaJsonLd/);
  assert.match(hubPage, /alternates: \{ canonical:/);
  assert.doesNotMatch(hubPage, /noindex/);
  assert.match(routePage, /getFaqPageJsonLd/);
  assert.match(routePage, /LandingBreadcrumbs/);
  assert.match(routePage, /initialAirportCode|airportCode=\{page\.airport\.code\}/);
  assert.match(locations, /newtownabbey-airport-taxis|TOWN_HUB_PAGES/);
  assert.doesNotMatch(robots, /disallow: "\/locations\//);
  assert.doesNotMatch(robots, /disallow: "\/transfers\//);

  for (const hub of TOWN_HUB_PAGES) {
    assert.match(sitemapScript, new RegExp(`"${hub.slug}"`));
  }
  for (const slug of getCanonicalTransferSlugs()) {
    assert.match(sitemapScript, new RegExp(`"${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.doesNotMatch(sitemapScript, /newtownabbey-to-dublin"/);
  assert.match(sitemap, /\/locations\/newtownabbey-airport-taxis\//);
  assert.match(sitemap, /\/transfers\/newtownabbey-to-dublin-airport\//);
  assert.doesNotMatch(sitemap, /\/transfers\/newtownabbey-to-dublin\//);
  console.log("OK  canonicals, breadcrumbs, FAQ schema, sitemap, robots");
}

console.log("\nAll town landing page checks passed.");

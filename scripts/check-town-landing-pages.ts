/**
 * Town hub + route landing page contracts (Batch 1 + Batch 2).
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
import { LANDING_WHY_BOOK } from "../src/lib/landing-why-book";
import { TRANSFER_ROUTE_CONTENT } from "../src/lib/transfer-routes-content";
import { TOWN_HUB_CONTENT } from "../src/lib/town-hubs-content";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const FIRST_TOWNS = ["newtownabbey", "carrickfergus", "ballyclare", "lisburn", "bangor"] as const;
const SECOND_TOWNS = ["holywood", "antrim", "ballymena", "larne", "newry"] as const;
const ALL_HUB_TOWNS = [...FIRST_TOWNS, ...SECOND_TOWNS] as const;

function assertLandingHub(hub: (typeof TOWN_HUB_PAGES)[number]) {
  assert.equal(hub.h1, `${hub.town.name} Airport Taxi & Airport Transfers`);
  assert.equal(hub.title, hub.h1);
  assert.match(hub.metaDescription, /Belfast International|Dublin Airport|Belfast City/);
  const words = hub.intro.trim().split(/\s+/).length;
  assert.ok(words >= 120 && words <= 200, `${hub.slug} intro words=${words}`);
  assert.doesNotMatch(hub.intro, /Looking for a taxi from/i);
  assert.ok(hub.areas.length >= 3);
  assert.equal(hub.whichAirport.length, 3, `${hub.slug} whichAirport`);
  assert.deepEqual(
    hub.whichAirport.map((item) => item.code),
    ["BFS", "BHD", "DUB"],
  );
}

function assertLandingRoute(route: (typeof TRANSFER_ROUTE_PAGES)[number]) {
  const words = route.intro.trim().split(/\s+/).length;
  assert.ok(words >= 120 && words <= 200, `${route.slug} intro words=${words}`);
  assert.doesNotMatch(route.intro, /Looking for a taxi from/i);
  assert.match(route.journeyInfo ?? "", /Journey times are approximate/);
  assert.doesNotMatch(route.journeyInfo ?? "", /\b\d+\s*(miles|km)\b/i);
  assert.ok((route.faqs?.length ?? 0) >= 4);
  assert.ok(route.faqs?.every((faq) => !/£\d/.test(faq.answer)));
  assert.ok(route.faqs?.some((faq) => /instant quote|quote tool|quote box/i.test(faq.answer)));
  assert.ok(route.goingToAirport);
  assert.ok(route.fromAirport);
  assert.match(route.fromAirport ?? "", /[Tt]ravelling from|return|inbound|Airport →|Airport to /);
}

console.log("=== Combined hubs (Batch 1 + Batch 2) ===");
{
  assert.equal(TOWN_HUB_PAGES.length, 10);
  assert.equal(TOWN_HUB_CONTENT.length, 10);
  assert.deepEqual(
    TOWN_HUB_PAGES.map((hub) => hub.town.slug),
    [...ALL_HUB_TOWNS],
  );
  for (const hub of TOWN_HUB_PAGES) {
    assertLandingHub(hub);
  }
  const metas = TOWN_HUB_PAGES.map((hub) => hub.metaDescription);
  assert.equal(new Set(metas).size, metas.length);
  const titles = TOWN_HUB_PAGES.map((hub) => hub.title);
  assert.equal(new Set(titles).size, titles.length);
  const intros = TOWN_HUB_PAGES.map((hub) => hub.intro);
  assert.equal(new Set(intros).size, intros.length);
  const chooserTexts = TOWN_HUB_PAGES.flatMap((hub) => hub.whichAirport.map((item) => item.text));
  assert.equal(new Set(chooserTexts).size, chooserTexts.length);
  const hubPage = read("src/app/locations/[slug]/page.tsx");
  assert.match(hubPage, /Which airport from/);
  assert.doesNotMatch(hubPage, /LANDING_WHY_BOOK/);
  const whyBook = read("src/lib/landing-why-book.ts");
  assert.match(whyBook, /route pages only/);
  console.log("OK  10 unique town hubs with airport chooser");
}

console.log("\n=== Batch 1 hubs still resolve ===");
{
  for (const town of FIRST_TOWNS) {
    assert.ok(getTownHubPage(`${town}-airport-taxis`), `missing Batch 1 hub ${town}`);
  }
  console.log("OK  Batch 1 hubs intact");
}

console.log("\n=== Batch 2 hubs resolve ===");
{
  for (const town of SECOND_TOWNS) {
    const hub = getTownHubPage(`${town}-airport-taxis`);
    assert.ok(hub, `missing Batch 2 hub ${town}`);
    assert.deepEqual(hub.airportCodes, ["BFS", "BHD", "DUB"]);
  }
  console.log("OK  5 Batch 2 hubs");
}

console.log("\n=== Combined landing routes ===");
{
  const landing = TRANSFER_ROUTE_PAGES.filter((route) => route.faqs?.length);
  assert.equal(landing.length, 30);
  assert.equal(TRANSFER_ROUTE_CONTENT.length, 30);
  for (const town of ALL_HUB_TOWNS) {
    const bfs = getTransferRoutePage(`${town}-to-belfast-international`);
    const bhd = getTransferRoutePage(`${town}-to-belfast-city-airport`);
    const dub = getTransferRoutePage(`${town}-to-dublin-airport`);
    assert.ok(bfs && bhd && dub, `missing routes for ${town}`);
    assert.equal(bfs.airport.code, "BFS");
    assert.equal(bhd.airport.code, "BHD");
    assert.equal(dub.airport.code, "DUB");
    assert.ok(bfs.hubSlug?.endsWith("-airport-taxis"));
  }

  const titles = landing.map((route) => route.title);
  const descriptions = landing.map((route) => route.metaDescription);
  const intros = landing.map((route) => route.intro);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(new Set(intros).size, intros.length);
  for (const route of landing) {
    assertLandingRoute(route);
  }

  const priceFaqs = landing.map((route) => {
    const faq = route.faqs?.find((item) => /how much/i.test(item.question));
    assert.ok(faq, `${route.slug} missing price FAQ`);
    return faq!.answer;
  });
  const timeFaqs = landing.map((route) => {
    const faq = route.faqs?.find((item) => /how long/i.test(item.question));
    assert.ok(faq, `${route.slug} missing time FAQ`);
    return faq!.answer;
  });
  assert.equal(new Set(priceFaqs).size, priceFaqs.length, "price FAQ answers must be unique per route");
  assert.equal(new Set(timeFaqs).size, timeFaqs.length, "time FAQ answers must be unique per route");
  const source = read("src/lib/transfer-routes-content.ts");
  assert.doesNotMatch(source, /QUOTE_PRICE|QUOTE_TIME/);
  console.log("OK  30 unique route pages, unique FAQs, no invented fares or mileages");
}

console.log("\n=== Batch 1 legacy lookups still resolve ===");
{
  assert.ok(getTransferRoutePage("newtownabbey-to-dublin"));
  assert.equal(getTransferRoutePage("newtownabbey-to-dublin")?.slug, "newtownabbey-to-dublin-airport");
  assert.ok(getTransferRoutePage("newtownabbey-to-belfast-city"));
  assert.equal(
    getTransferRoutePage("newtownabbey-to-belfast-city")?.slug,
    "newtownabbey-to-belfast-city-airport",
  );
  assert.ok(getTransferRoutePage("belfast-to-dublin"));
  assert.equal(getTransferRoutePage("belfast-to-dublin")?.slug, "belfast-to-dublin");
  console.log("OK  Batch 1 legacy slugs still map to canonicals");
}

console.log("\n=== Existing catalogue URLs still resolve ===");
{
  assert.ok(getTransferRoutePage("belfast-to-belfast-international"));
  assert.ok(getTransferRoutePage("belfast-to-city-of-derry"));
  assert.ok(getTransferRoutePage("newtownabbey-to-city-of-derry"));
  assert.ok(getTransferRoutePage("lisburn-to-city-of-derry"));
  assert.ok(getTransferRoutePage("bangor-to-city-of-derry"));
  assert.equal(getTransferRoutePage("holywood-to-city-of-derry"), undefined);
  assert.equal(getTransferRoutePage("antrim-to-city-of-derry"), undefined);
  console.log("OK  leftover Belfast/LDY routes kept · no extra LDY pages for Batch 2");
}

console.log("\n=== Pages, schema, sitemap ===");
{
  const hubPage = read("src/app/locations/[slug]/page.tsx");
  const routePage = read("src/app/transfers/[slug]/page.tsx");
  const locations = read("src/app/locations/page.tsx");
  const sitemap = read("public/sitemap.xml");
  const sitemapScript = read("scripts/generate-sitemap.mjs");
  const robots = read("src/app/robots.ts");
  const legacyMap = read("src/lib/transfer-legacy-redirects.mjs");

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
  assert.match(legacyMap, /newtownabbey-to-dublin/);

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
  for (const town of SECOND_TOWNS) {
    assert.match(sitemap, new RegExp(`/locations/${town}-airport-taxis/`));
    assert.match(sitemap, new RegExp(`/transfers/${town}-to-belfast-international/`));
    assert.match(sitemap, new RegExp(`/transfers/${town}-to-belfast-city-airport/`));
    assert.match(sitemap, new RegExp(`/transfers/${town}-to-dublin-airport/`));
  }
  assert.equal(LANDING_WHY_BOOK.length, 3);
  const whyBookTitles = LANDING_WHY_BOOK.map((item) => item.title);
  assert.equal(new Set(whyBookTitles).size, whyBookTitles.length);
  console.log("OK  canonicals, breadcrumbs, FAQ schema, sitemap, robots");
}

console.log("\nAll town landing page checks passed.");

/**
 * Crawlability contracts for the locations hub → town hub → airport route tree.
 * Run: npx tsx scripts/check-locations-crawl.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_LINKS, SITE } from "../src/lib/data";
import { AIRPORT_HERO } from "../src/lib/airport-hero";
import { DESTINATION_HERO } from "../src/lib/destination-hero";
import {
  getRoutesForTown,
  TOWN_HUB_PAGES,
  TRANSFER_ROUTE_PAGES,
} from "../src/lib/location-pages";
import { LOCATIONS_AIRPORT_LINKS } from "../src/lib/locations-content";

const SITE_HOST = "https://www.myairporttaxini.co.uk";
const HUB_TOWNS = [
  "newtownabbey",
  "carrickfergus",
  "bangor",
  "lisburn",
  "holywood",
  "antrim",
  "ballymena",
  "larne",
  "newry",
  "ballyclare",
] as const;
const LANDING_AIRPORTS = ["BFS", "BHD", "DUB"] as const;

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const locationsPage = read("src/app/locations/page.tsx");
const hubPage = read("src/app/locations/[slug]/page.tsx");
const routePage = read("src/app/transfers/[slug]/page.tsx");
const areasSection = read("src/components/AreasSection.tsx");
const footer = read("src/components/Footer.tsx");
const robots = read("src/app/robots.ts");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const sitemap = read("public/sitemap.xml");
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = sitemapLocs.map((loc) => loc.replace(SITE_HOST, "") || "/");

const landingRoutes = TRANSFER_ROUTE_PAGES.filter((route) => route.faqs?.length);

console.log("=== Town hubs and landing routes exist ===");
{
  assert.equal(TOWN_HUB_PAGES.length, 10);
  assert.deepEqual(
    TOWN_HUB_PAGES.map((hub) => hub.town.slug).sort(),
    [...HUB_TOWNS].sort(),
  );
  assert.equal(landingRoutes.length, 31);
  for (const town of HUB_TOWNS) {
    const hub = TOWN_HUB_PAGES.find((item) => item.town.slug === town);
    assert.ok(hub, `missing hub for ${town}`);
    assert.equal(hub.slug, `${town}-airport-taxis`);
    const routes = getRoutesForTown(town);
    assert.equal(routes.length, 3, `${town} should have 3 landing airport routes`);
    assert.deepEqual(
      routes.map((route) => route.airport.code).sort(),
      [...LANDING_AIRPORTS],
    );
    assert.ok(routes.every((route) => route.slug && route.hubSlug === hub.slug));
  }
  console.log("OK  10 town hubs and 31 BFS/BHD/DUB landing routes");
}

console.log("\n=== /locations/ links to every town hub ===");
{
  assert.match(locationsPage, /TOWN_HUB_PAGES\.map/);
  assert.match(locationsPage, /href=\{`\/locations\/\$\{hub\.slug\}\/`\}/);
  assert.match(locationsPage, /<Link/);
  assert.doesNotMatch(locationsPage, /onClick=\{.*router\.push/);
  for (const hub of TOWN_HUB_PAGES) {
    assert.match(
      locationsPage,
      /href=\{`\/locations\/\$\{hub\.slug\}\/`\}/,
      "locations page must render crawlable hub cards",
    );
    assert.ok(hub.town.name);
  }
  console.log("OK  locations hub cards use crawlable Next.js <Link> hrefs");
}

console.log("\n=== Each town hub links to its 3 airport routes ===");
{
  assert.match(hubPage, /getRoutesForTown/);
  assert.match(hubPage, /href=\{`\/transfers\/\$\{route\.slug\}\/`\}/);
  assert.match(hubPage, /<Link/);
  assert.match(hubPage, /shortName\} transfers/);
  assert.doesNotMatch(hubPage, /noindex/);
  console.log("OK  hub pages render crawlable transfer <Link> hrefs");
}

console.log("\n=== Homepage and footer can reach the locations tree ===");
{
  assert.ok(NAV_LINKS.some((link) => link.href === "/locations/"));
  assert.match(areasSection, /getTownHubByAreaName/);
  assert.match(areasSection, /href=\{`\/locations\/\$\{hub\.slug\}\/`\}/);
  assert.match(areasSection, /href="\/locations\/"/);
  assert.match(footer, /TOWN_HUB_PAGES/);
  assert.match(footer, /href=\{`\/locations\/\$\{hub\.slug\}\/`\}/);
  assert.match(footer, /href="\/locations\/"/);
  console.log("OK  homepage nav, Areas We Cover, and footer link into the hub tree");
}

console.log("\n=== Breadcrumbs ===");
{
  assert.match(locationsPage, /LandingBreadcrumbs/);
  assert.match(locationsPage, /getBreadcrumbJsonLd/);
  assert.match(hubPage, /name: "Locations", href: "\/locations\/"/);
  assert.match(hubPage, /name: "Home", href: "\/"/);
  assert.match(routePage, /name: "Locations", href: "\/locations\/"/);
  assert.match(routePage, /name: page\.town\.name, href: hubHref/);
  console.log("OK  Home → Locations → town → route breadcrumbs stay in one system");
}

console.log("\n=== Indexability: no accidental noindex ===");
{
  for (const rel of [
    "src/app/locations/page.tsx",
    "src/app/locations/[slug]/page.tsx",
    "src/app/transfers/[slug]/page.tsx",
    "src/app/airports/page.tsx",
    "src/app/airports/[slug]/page.tsx",
  ]) {
    const source = read(rel);
    assert.doesNotMatch(source, /noindex/);
    assert.doesNotMatch(source, /index:\s*false/);
  }
  console.log("OK  public location/transfer/airport pages do not set noindex");
}

console.log("\n=== Canonicals ===");
{
  assert.match(locationsPage, /canonical: "\/locations\/"/);
  assert.match(hubPage, /canonical: `\/locations\/\$\{page\.slug\}\/`/);
  assert.match(routePage, /canonical: `\/transfers\/\$\{page\.slug\}\/`/);
  assert.equal(SITE.url, SITE_HOST);
  for (const hub of TOWN_HUB_PAGES) {
    assert.equal(new Set(TOWN_HUB_PAGES.map((item) => item.title)).size, 10);
    assert.ok(hub.metaDescription.length > 40);
    assert.equal(hub.h1, hub.title);
  }
  const titles = landingRoutes.map((route) => route.title);
  const descriptions = landingRoutes.map((route) => route.metaDescription);
  const h1s = landingRoutes.map((route) => route.h1);
  assert.equal(new Set(titles).size, 31);
  assert.equal(new Set(descriptions).size, 31);
  assert.equal(new Set(h1s).size, 31);
  console.log("OK  self-referencing HTTPS www canonicals and unique titles/descriptions");
}

console.log("\n=== robots.txt ===");
{
  assert.match(robots, /sitemap: `\$\{SITE\.url\}\/sitemap\.xml`/);
  assert.match(robots, /allow: "\/"/);
  assert.doesNotMatch(robots, /disallow: "\/locations\//);
  assert.doesNotMatch(robots, /disallow: "\/transfers\//);
  assert.doesNotMatch(robots, /disallow: "\/airports\//);
  assert.doesNotMatch(robots, /disallow: "\/images\//);
  assert.match(robots, /disallow: \[\s*"\/driver\/"/);
  console.log("OK  Googlebot can crawl public landing URLs; private areas stay disallowed");
}

console.log("\n=== Sitemap contains the crawl tree and no junk ===");
{
  assert.ok(sitemapPaths.includes("/"));
  assert.ok(sitemapPaths.includes("/locations/"));
  assert.ok(sitemapPaths.includes("/airports/"));
  for (const slug of ["belfast-international", "belfast-city", "dublin", "city-of-derry"]) {
    assert.ok(sitemapPaths.includes(`/airports/${slug}/`), `missing airport ${slug}`);
  }
  for (const hub of TOWN_HUB_PAGES) {
    assert.ok(sitemapPaths.includes(`/locations/${hub.slug}/`), `sitemap missing ${hub.slug}`);
    assert.match(sitemapScript, new RegExp(`"${hub.slug}"`));
  }
  for (const route of landingRoutes) {
    assert.ok(
      sitemapPaths.includes(`/transfers/${route.slug}/`),
      `sitemap missing ${route.slug}`,
    );
  }
  assert.equal(new Set(sitemapLocs).size, sitemapLocs.length, "duplicate sitemap URLs");
  assert.ok(sitemapLocs.every((loc) => loc.startsWith(`${SITE_HOST}/`)));
  assert.ok(sitemapLocs.every((loc) => loc.endsWith("/") || loc === `${SITE_HOST}/`));
  for (const blocked of [
    "/unsubscribe/",
    "/quote/",
    "/book/",
    "/book-quote/",
    "/pay/",
    "/manage-booking/",
    "/owner/",
    "/driver/",
    "/admin/",
    "/track/demo/",
    "/test-booking/",
    "/transfers/newtownabbey-to-dublin/",
    "/transfers/newtownabbey-to-belfast-city/",
  ]) {
    assert.ok(!sitemapPaths.includes(blocked), `sitemap must omit ${blocked}`);
  }
  console.log(`OK  sitemap has ${sitemapLocs.length} unique canonical HTTPS URLs`);
}

console.log("\n=== No orphan landing pages ===");
{
  for (const hub of TOWN_HUB_PAGES) {
    const routes = getRoutesForTown(hub.town.slug);
    assert.equal(routes.length, 3);
    assert.ok(routes.every((route) => route.hubSlug === hub.slug));
  }
  assert.match(locationsPage, /TOWN_HUB_PAGES/);
  assert.match(hubPage, /getRoutesForTown/);
  assert.match(locationsPage, /\/transfers\/dublin-airport-to-belfast\//);
  console.log("OK  every hub and landing route is reachable from /locations/");
}

console.log("\n=== Airport examples on /locations/ stay crawlable ===");
{
  assert.equal(LOCATIONS_AIRPORT_LINKS.length, 4);
  assert.match(locationsPage, /LOCATIONS_AIRPORT_LINKS/);
  for (const airport of LOCATIONS_AIRPORT_LINKS) {
    assert.match(airport.href, /^\/airports\/[a-z0-9-]+\/$/);
  }
  console.log("OK  locations airport list links to airport guides");
}

console.log("\n=== Hero mappings from PR #499 / #500 stay intact ===");
{
  assert.equal(AIRPORT_HERO.BFS.heroBase, "belfast-international");
  assert.equal(AIRPORT_HERO.BHD.heroBase, "belfast-city");
  assert.equal(AIRPORT_HERO.DUB.heroBase, "dublin-airport");
  assert.equal(DESTINATION_HERO.carrickfergus.heroBase, "carrickfergus-castle");
  assert.equal(DESTINATION_HERO.holywood.heroBase, "holywood-old-pier");
  assert.doesNotMatch(hubPage, /AIRPORT_HERO/);
  assert.match(routePage, /page\.airport\.heroBase/);
  console.log("OK  airport, town-hub, and tour hero rules were not mixed");
}

console.log("\nAll locations crawlability checks passed.");

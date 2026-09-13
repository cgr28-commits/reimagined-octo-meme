/**
 * Technical SEO contracts: schema placement, sitemap, 404, homepage metadata.
 * Run: npx tsx scripts/check-technical-seo.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOMEPAGE_SEO_DESCRIPTION,
  HOMEPAGE_SEO_TITLE,
  SITE,
  SITE_PUBLIC_SEO_DESCRIPTION,
} from "../src/lib/data";
import {
  BUSINESS_JSON_LD_ID,
  getFaqPageJsonLd,
  getLocalBusinessJsonLd,
  getServiceAreaJsonLd,
} from "../src/lib/structured-data";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const layout = read("src/app/layout.tsx");
const home = read("src/app/page.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const sitemap = read("public/sitemap.xml");
const unsubscribe = read("src/app/unsubscribe/page.tsx");
const notFound = read("src/app/not-found.tsx");
const emergePage = read("src/app/events/emerge-belfast-taxi/page.tsx");
const pagesFix = read("scripts/fix-github-pages-paths.mjs");
const transferPage = read("src/app/transfers/[slug]/page.tsx");
const airportPage = read("src/app/airports/[slug]/page.tsx");

console.log("=== Homepage title, description, H1 ===");
{
  assert.match(home, /HOMEPAGE_SEO_TITLE/);
  assert.match(home, /HOMEPAGE_SEO_DESCRIPTION/);
  assert.equal(HOMEPAGE_SEO_TITLE, "Belfast Airport Transfers | My Airport Taxi NI");
  assert.equal(
    HOMEPAGE_SEO_DESCRIPTION,
    "Pre-book fixed-price Belfast airport transfers with flight monitoring, up to 60 minutes’ complimentary waiting on airport pickups, and secure online booking.",
  );
  assert.doesNotMatch(HOMEPAGE_SEO_DESCRIPTION, /60 minutes’ waiting(?! on airport pickups)/);
  assert.match(HOMEPAGE_SEO_DESCRIPTION, /up to 60 minutes’ complimentary waiting on airport pickups/);
  assert.equal(SITE.name, "My Airport Taxi NI");
  assert.doesNotMatch(SITE_PUBLIC_SEO_DESCRIPTION, /£\d/);
  assert.match(hero, /Belfast Airport Transfers/);
  assert.doesNotMatch(hero, /Pre-Booked 24\/7/);
  console.log("OK  homepage title, meta description and H1");
}

console.log("\n=== Canonical host ===");
{
  assert.equal(SITE.url, "https://www.myairporttaxini.co.uk");
  assert.match(sitemap, /https:\/\/www\.myairporttaxini\.co\.uk\//);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/myairporttaxini\.co\.uk/);
  console.log("OK  canonical host is https://www.myairporttaxini.co.uk");
}

console.log("\n=== Structured data ===");
{
  assert.doesNotMatch(layout, /getFaqPageJsonLd/);
  assert.match(home, /getFaqPageJsonLd/);
  assert.match(home, /FAQSection/);
  const faq = getFaqPageJsonLd();
  assert.equal(faq["@type"], "FAQPage");
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length > 0);

  const business = getLocalBusinessJsonLd();
  assert.equal(business["@id"], "https://www.myairporttaxini.co.uk/#business");
  assert.equal(BUSINESS_JSON_LD_ID, "https://www.myairporttaxini.co.uk/#business");
  assert.match(layout, /getLocalBusinessJsonLd/);

  const service = getServiceAreaJsonLd({
    name: "Test route",
    description: "Test description",
    path: "/transfers/belfast-to-dublin/",
    areaServed: ["Belfast", "Dublin Airport"],
  });
  assert.equal(service["@type"], "Service");
  assert.deepEqual(service.provider, { "@id": "https://www.myairporttaxini.co.uk/#business" });
  assert.doesNotMatch(JSON.stringify(service), /LocalBusiness/);
  assert.doesNotMatch(JSON.stringify(service), /TaxiService/);
  assert.match(transferPage, /getServiceAreaJsonLd/);
  assert.match(airportPage, /getServiceAreaJsonLd/);
  assert.match(transferPage, /getBreadcrumbJsonLd/);
  assert.match(airportPage, /getBreadcrumbJsonLd/);
  console.log("OK  homepage-only FAQ · one #business · route Service + breadcrumbs");
}

console.log("\n=== Sitemap ===");
{
  assert.doesNotMatch(sitemapScript, /path: "\/unsubscribe\/"/);
  assert.doesNotMatch(sitemap, /\/unsubscribe\//);
  assert.match(sitemapScript, /gitLastModifiedDate/);
  assert.match(sitemapScript, /is-shallow-repository/);
  assert.match(sitemapScript, /if \(SHALLOW_GIT\) return null/);
  assert.doesNotMatch(sitemapScript, /priority/);
  assert.doesNotMatch(sitemapScript, /changefreq/);
  assert.doesNotMatch(sitemap, /<priority>/);
  assert.doesNotMatch(sitemap, /<changefreq>/);
  assert.doesNotMatch(sitemapScript, /new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(sitemapScript, /lastmod.*new Date|new Date\(\).*lastmod/);
  const pagesWorkflow = read(".github/workflows/deploy-pages.yml");
  const previewWorkflow = read(".github/workflows/deploy-pages-preview.yml");
  assert.match(pagesWorkflow, /fetch-depth:\s*0/);
  assert.match(previewWorkflow, /fetch-depth:\s*0/);
  const locationPages = read("src/lib/location-pages.ts");
  assert.doesNotMatch(locationPages, /60 minutes’ waiting/);
  assert.doesNotMatch(
    locationPages,
    /metaDescription: `Pre-book a fixed-price taxi from \$\{town\.name\} to \$\{airport\.name\}[^`]*waiting/,
  );
  assert.match(
    locationPages,
    /from Northern Ireland to Dublin Airport \(DUB\), with flight monitoring, included tolls and secure online booking/,
  );
  assert.doesNotMatch(sitemap, /\/manage-booking\//);
  assert.doesNotMatch(sitemap, /\/quote\//);
  assert.doesNotMatch(sitemap, /\/book\//);
  assert.doesNotMatch(sitemap, /\/pay\//);
  assert.match(unsubscribe, /index:\s*false/);
  assert.match(unsubscribe, /follow:\s*true/);
  console.log("OK  /unsubscribe/ omitted and noindex,follow · git lastmod only");
}

console.log("\n=== Expired event / 404 ===");
{
  assert.match(emergePage, /notFound\(/);
  assert.doesNotMatch(emergePage, /redirect\(|permanentRedirect/);
  assert.match(pagesFix, /removeGeneratedPath\("events\/emerge-belfast-taxi"\)/);
  assert.match(notFound, /index:\s*false/);
  assert.match(notFound, /follow:\s*true/);
  assert.doesNotMatch(notFound, /index:\s*true/);
  console.log("OK  hidden EMERGE uses notFound + Pages prune · 404 is noindex,follow only");
}

console.log("\n=== Homepage hero is a server component ===");
{
  assert.doesNotMatch(hero, /^["']use client["']/);
  assert.match(hero, /<QuoteCard/);
  console.log("OK  static hero copy is not a client-component parent of the H1");
}

console.log("\nAll technical SEO checks passed.");

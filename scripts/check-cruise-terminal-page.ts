/**
 * Contracts for the Belfast cruise-terminal service page.
 * Run: npx tsx scripts/check-cruise-terminal-page.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "../src/lib/data";
import {
  CRUISE_TERMINAL_H1,
  CRUISE_TERMINAL_PATH,
  CRUISE_TERMINAL_SEO_DESCRIPTION,
  CRUISE_TERMINAL_SEO_TITLE,
} from "../src/lib/cruise-terminal-content";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const page = read("src/app/belfast-cruise-terminal-transfers/page.tsx");
const content = read("src/lib/cruise-terminal-content.ts");
const footer = read("src/components/Footer.tsx");
const areas = read("src/components/AreasSection.tsx");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const sitemap = read("public/sitemap.xml");
const redirects = read("src/lib/transfer-legacy-redirects.mjs");
const quote = read("src/lib/quote.ts");
const payment = read("src/lib/create-payment.ts");

const SITE_HOST = "https://www.myairporttaxini.co.uk";
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

console.log("=== Cruise page metadata and indexability ===");
{
  assert.equal(CRUISE_TERMINAL_PATH, "/belfast-cruise-terminal-transfers/");
  assert.equal(CRUISE_TERMINAL_H1, "Belfast Cruise Terminal Transfers");
  assert.match(CRUISE_TERMINAL_SEO_TITLE, /Belfast Cruise Terminal Transfers/);
  assert.match(CRUISE_TERMINAL_SEO_TITLE, /Cruise Port Taxi/);
  assert.ok(CRUISE_TERMINAL_SEO_DESCRIPTION.length > 80);
  assert.ok(CRUISE_TERMINAL_SEO_DESCRIPTION.length < 180);
  assert.match(page, /canonical: CRUISE_TERMINAL_PATH/);
  assert.doesNotMatch(page, /noindex/);
  assert.doesNotMatch(page, /index:\s*false/);
  assert.match(page, /getBreadcrumbJsonLd/);
  assert.match(page, /getServiceAreaJsonLd/);
  assert.match(page, /getFaqPageJsonLd/);
  assert.match(page, /serviceType: "Private transfer"/);
  console.log("OK  canonical, H1, title, description, breadcrumbs and Service schema");
}

console.log("\n=== Copy constraints ===");
{
  const combined = `${page}\n${content}`;
  assert.doesNotMatch(combined, /official (Belfast )?Harbour|official cruise operator/i);
  assert.match(content, /do not sell shore excursions or sightseeing tours/);
  assert.match(content, /do not operate a people carrier, minibus or coach/);
  assert.doesNotMatch(combined, /our (people carrier|minibus|coach|fleet)/i);
  assert.doesNotMatch(combined, /£\d/);
  assert.match(content, /up to 4 passengers/);
  assert.match(content, /do not guarantee pickup immediately beside the ship/i);
  console.log("OK  no invented fares, fleet language, official-operator or tour claims");
}

console.log("\n=== Internal discovery ===");
{
  assert.match(footer, /href="\/belfast-cruise-terminal-transfers\/"/);
  assert.match(areas, /href="\/belfast-cruise-terminal-transfers\/"/);
  assert.match(page, /href="\/airports\/belfast-international\/"/);
  assert.match(page, /href="\/airports\/belfast-city\/"/);
  assert.match(page, /href="\/airports\/dublin\/"/);
  assert.match(page, /href="\/contact\/"/);
  console.log("OK  footer, homepage coverage and airport guide links");
}

console.log("\n=== Sitemap and redirects ===");
{
  assert.match(sitemapScript, /path: "\/belfast-cruise-terminal-transfers\/"/);
  assert.ok(sitemapLocs.includes(`${SITE_HOST}${CRUISE_TERMINAL_PATH}`));
  assert.ok(sitemapLocs.includes(`${SITE_HOST}/`));
  assert.ok(sitemapLocs.includes(`${SITE_HOST}/locations/`));
  assert.equal(new Set(sitemapLocs).size, sitemapLocs.length);
  assert.doesNotMatch(redirects, /belfast-cruise-terminal-transfers/);
  assert.equal(SITE.url, SITE_HOST);
  console.log(`OK  sitemap includes cruise page among ${sitemapLocs.length} unique URLs`);
}

console.log("\n=== Pricing and payment files stay out of this page ===");
{
  assert.doesNotMatch(page, /from "@\/lib\/quote"/);
  assert.doesNotMatch(page, /create-payment/);
  assert.doesNotMatch(page, /LocationQuoteSection/);
  assert.match(quote, /export /);
  assert.match(payment, /export /);
  console.log("OK  cruise page does not import quote or payment engines");
}

console.log("\nAll Belfast cruise-terminal page checks passed.");

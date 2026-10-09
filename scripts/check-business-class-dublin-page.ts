/**
 * Business Class Dublin Airport landing page.
 * Run: npx tsx scripts/check-business-class-dublin-page.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "../src/lib/data";
import { getLocalBusinessJsonLd } from "../src/lib/structured-data";
import {
  BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS,
  BUSINESS_CLASS_DUBLIN_FAQS,
  BUSINESS_CLASS_DUBLIN_H1,
  BUSINESS_CLASS_DUBLIN_PATH,
  BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS,
  BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
  BUSINESS_CLASS_DUBLIN_SEO_TITLE,
} from "../src/lib/business-class-dublin-content";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const page = read("src/app/transfers/business-class-dublin-airport/page.tsx");
const content = read("src/lib/business-class-dublin-content.ts");
const airportPage = read("src/app/airports/[slug]/page.tsx");
const transferPage = read("src/app/transfers/[slug]/page.tsx");
const vehicles = read("src/components/VehiclesSection.tsx");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const sitemap = read("public/sitemap.xml");
const businessSchema = JSON.stringify(getLocalBusinessJsonLd());
const combined = `${page}\n${content}`;

const TOWN_DUBLIN_SOURCES = [
  "src/lib/transfer-routes-content.ts",
  "src/lib/transfer-routes-batch-3.ts",
  "src/lib/transfer-routes-batch-3b.ts",
];

console.log("=== Metadata ===");
{
  assert.equal(BUSINESS_CLASS_DUBLIN_PATH, "/transfers/business-class-dublin-airport/");
  assert.equal(BUSINESS_CLASS_DUBLIN_H1, "Business Class Dublin Airport Transfers");
  assert.equal(BUSINESS_CLASS_DUBLIN_SEO_TITLE, BUSINESS_CLASS_DUBLIN_H1);
  assert.equal(
    BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
    "Upgrade your Dublin Airport transfer with Business Class. Enjoy extra comfort, luggage assistance, bottled water and fixed fares. Book online.",
  );
  assert.equal(page.match(/<h1\b/g)?.length, 1);
  assert.match(page, /title: `\$\{BUSINESS_CLASS_DUBLIN_SEO_TITLE\} \| \$\{SITE\.name\}`/);
  assert.equal(SITE.name, "My Airport Taxi NI");
  assert.match(page, /canonical: BUSINESS_CLASS_DUBLIN_PATH/);
  assert.doesNotMatch(page, /noindex|index:\s*false/);
  assert.match(page, /getServiceAreaJsonLd/);
  assert.match(page, /serviceType: "Airport Transfer"/);
  assert.match(page, /getFaqPageJsonLd\(BUSINESS_CLASS_DUBLIN_FAQS\)/);
  assert.doesNotMatch(businessSchema, /Business Class/);
  assert.equal(getLocalBusinessJsonLd().serviceType, "Airport Transfer");
  console.log("OK  title, description, one H1, canonical, Service schema");
}

console.log("\n=== Quote inclusions and booking limits ===");
{
  assert.deepEqual(BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS, [
    "Meet & Greet inside arrivals",
    "Personalised name board",
    "Luggage assistance",
    "Complimentary bottled water",
    "Phone charging",
    "Terminal access included in the fixed fare",
  ]);
  assert.deepEqual(BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS, [
    "Luggage assistance",
    "Complimentary bottled water",
    "Phone charging",
    "Terminal access included in the fixed fare",
  ]);
  assert.equal(
    BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS.some((item) => /meet/i.test(item)),
    false,
  );
  assert.match(page, /Meet &amp; Greet is not included on a drop-off/);
  assert.match(combined, /1–4 passengers/);
  assert.match(combined, /up to 2 large suitcases/i);
  assert.match(combined, /3 or 4 large suitcases/);
  assert.match(combined, /select Estate instead/);
  assert.match(combined, /not a separate\s+chauffeur service/i);
  assert.match(page, /Business Class is not selected for you/);
  assert.match(page, /Extra comfort for your journey/);
  assert.match(page, /Enjoy a more comfortable Dublin Airport transfer/);
  assert.match(page, /How to book Business Class/);
  assert.match(page, /airportCode="DUB"/);
  assert.match(page, /direction="to-airport"/);
  assert.match(page, /<LocationQuoteSection/);
  assert.match(page, /showStickyQuote=\{false\}/);
  assert.doesNotMatch(page, /chooseExecutive|EXECUTIVE_VEHICLE|initialVehicle|publicExecutiveEnabled=\{false\}/);
  assert.doesNotMatch(combined, /Mercedes|BMW|Audi|Wi-Fi|wifi|limousine|hourly chauffeur/i);
  assert.equal(BUSINESS_CLASS_DUBLIN_FAQS.length >= 4, true);
  console.log("OK  inclusions, luggage rule, quote is not preselected");
}

console.log("\n=== Internal links ===");
{
  assert.match(airportPage, /page\.slug === "dublin"/);
  assert.match(airportPage, /href="\/transfers\/business-class-dublin-airport\/"/);
  assert.match(airportPage, /Meet &amp; Greet with a name board/);
  assert.match(transferPage, /page\.slug === "belfast-to-dublin-airport"/);
  assert.match(transferPage, /page\.slug === "dublin-airport-to-belfast"/);
  assert.equal(
    transferPage.match(/href="\/transfers\/business-class-dublin-airport\/"/g)?.length,
    2,
  );
  assert.match(vehicles, /href="\/transfers\/business-class-dublin-airport\/"/);
  assert.match(page, /href="\/transfers\/belfast-to-dublin-airport\/"/);
  assert.match(page, /href="\/transfers\/dublin-airport-to-belfast\/"/);
  assert.match(page, /href="\/airports\/dublin\/"/);
  for (const rel of TOWN_DUBLIN_SOURCES) {
    assert.doesNotMatch(read(rel), /business-class-dublin-airport/);
  }
  console.log("OK  four link placements; town-to-Dublin sources unchanged");
}

console.log("\n=== Sitemap ===");
{
  assert.match(sitemapScript, /path: "\/transfers\/business-class-dublin-airport\/"/);
  assert.match(
    sitemap,
    /<loc>https:\/\/www\.myairporttaxini\.co\.uk\/transfers\/business-class-dublin-airport\/<\/loc>/,
  );
  console.log("OK  sitemap lists the new page");
}

console.log("\nAll Business Class Dublin page checks passed.");

/**
 * Mercedes-Benz Vito group-transfer pages.
 * Run: npx tsx scripts/check-vito-group-pages.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VITO_GROUP_PAGES } from "../src/lib/vito-group-content";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const home = read("src/app/page.tsx");
const section = read("src/components/VitoGroupTransfersSection.tsx");
const landing = read("src/components/VitoGroupLanding.tsx");
const placeholder = read("src/components/VitoVehiclePlaceholder.tsx");
const quote = read("src/components/QuoteCard.tsx");
const sitemap = read("public/sitemap.xml");
const sitemapScript = read("scripts/generate-sitemap.mjs");
const pricing = read("shared/owner-pricing-config.ts");

assert.equal(VITO_GROUP_PAGES.length, 5);
const h1s = new Set(VITO_GROUP_PAGES.map((page) => page.h1));
const titles = new Set(VITO_GROUP_PAGES.map((page) => page.seoTitle));
const descriptions = new Set(VITO_GROUP_PAGES.map((page) => page.description));
assert.equal(h1s.size, 5);
assert.equal(titles.size, 5);
assert.equal(descriptions.size, 5);

for (const page of VITO_GROUP_PAGES) {
  assert.ok(page.description.length >= 140 && page.description.length <= 170, page.description);
  assert.equal(page.h1, page.seoTitle);
  const source = read(`src/app${page.path}page.tsx`);
  assert.match(source, /canonical: page\.path/);
  assert.match(source, new RegExp(page.slug));
  assert.match(sitemap, new RegExp(`<loc>https://www\\.myairporttaxini\\.co\\.uk${page.path}</loc>`));
  assert.match(sitemapScript, new RegExp(page.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const copy = JSON.stringify(page);
  assert.doesNotMatch(copy, /24\/7|around the clock|guaranteed vehicle|we guarantee/i);
  assert.doesNotMatch(copy, /\d+\s+large suitcases/i);
}

assert.match(landing, /preferMinibus/);
assert.match(landing, /LocationQuoteSection/);
assert.match(landing, /getServiceAreaJsonLd/);
assert.match(landing, /getFaqPageJsonLd/);
assert.match(landing, /getBreadcrumbJsonLd/);
assert.match(placeholder, /quote-minibus\.webp/);
assert.match(placeholder, /Representative Mercedes-Benz Vito-style vehicle/);
assert.doesNotMatch(placeholder, /photograph to follow/);
assert.doesNotMatch(placeholder, /not a picture of a specific vehicle/);
assert.doesNotMatch(placeholder, /guaranteed vehicle/i);
assert.match(home, /VitoGroupTransfersSection/);
assert.match(section, /Get an Instant Quote/);
assert.match(section, /href="\/#quote"/);
assert.match(section, /VITO_GROUP_PAGES/);
assert.ok(VITO_GROUP_PAGES.some((page) => page.path.includes("belfast-to-dublin-airport-7-seater")));
assert.ok(VITO_GROUP_PAGES.some((page) => page.path.includes("hen-party-transport-belfast")));
assert.ok(VITO_GROUP_PAGES.some((page) => page.path.includes("stag-party-transport-belfast")));
assert.match(quote, /preferMinibus = false/);
assert.match(quote, /MINIBUS_VEHICLE_TYPE/);
assert.match(pricing, /DEFAULT_PUBLIC_MINIBUS_ENABLED = false/);
assert.doesNotMatch(read("src/lib/pricing-config.json"), /vito-group/);

console.log("OK  five Vito group pages, sitemap, homepage section and existing quote preference");

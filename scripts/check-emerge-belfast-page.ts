/**
 * Content/restriction checks for the EMERGE Belfast landing page.
 * Run: npx tsx scripts/check-emerge-belfast-page.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMERGE_BELFAST_DESTINATION,
  EMERGE_BELFAST_META,
  EMERGE_BELFAST_PATH,
  EMERGE_DISCLAIMER,
  EMERGE_FAQS,
  emergeWhatsAppHref,
  getEmergeServiceJsonLd,
} from "../src/lib/emerge-belfast";
import { SITE } from "../src/lib/data";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function main() {
  const page = read("src/app/events/emerge-belfast-taxi/page.tsx");
  const client = read("src/components/EmergeBelfastPageClient.tsx");
  const content = read("src/lib/emerge-belfast.ts");
  const home = read("src/app/page.tsx");
  const css = read("src/app/globals.css");
  const sitemapScript = read("scripts/generate-sitemap.mjs");
  const airportPage = read("src/app/airports/[slug]/page.tsx");
  const transferPage = read("src/app/transfers/[slug]/page.tsx");
  const quoteCard = read("src/components/QuoteCard.tsx");

  check("SEO title, description and path are correct", () => {
    assert.equal(EMERGE_BELFAST_PATH, "/events/emerge-belfast-taxi/");
    assert.match(EMERGE_BELFAST_META.title, /EMERGE Belfast Taxi Transfers/);
    assert.match(EMERGE_BELFAST_META.description, /Boucher Playing Fields/);
    assert.match(EMERGE_BELFAST_META.description, /4 passengers/);
  });

  check("Page has a single H1 and uses shared Header/Footer/QuoteCard", () => {
    assert.equal((client.match(/<h1\b/g) || []).length, 1);
    assert.match(client, /Pre-Book Your Taxi to EMERGE Belfast 2026/);
    assert.match(page, /<Header/);
    assert.match(page, /<Footer/);
    assert.match(client, /QuoteCard/);
    assert.match(quoteCard, /initialDropoffHint/);
  });

  check("Destination prefill and WhatsApp reuse existing SITE number", () => {
    assert.equal(EMERGE_BELFAST_DESTINATION, "Boucher Playing Fields, Belfast");
    assert.match(client, /initialDropoffHint=\{EMERGE_BELFAST_DESTINATION\}/);
    const href = emergeWhatsAppHref();
    assert.match(href, new RegExp(`wa\\.me/${SITE.whatsapp}`));
    assert.match(decodeURIComponent(href), /EMERGE Belfast transfer/);
  });

  check("Independent-service disclaimer present; no fleet / people-carrier claims", () => {
    assert.match(EMERGE_DISCLAIMER, /not affiliated/);
    assert.match(client, /EMERGE_DISCLAIMER/);
    const banned =
      /\b(fleet|people carrier|mpv|minibus|executive saloon|eight-seater|8-seater|coach|bus tickets|admission)\b/i;
    assert.doesNotMatch(client, banned);
    assert.doesNotMatch(content, banned);
  });

  check("No invented prices or festival entrance pickup promise", () => {
    assert.doesNotMatch(client, /£\d+/);
    assert.doesNotMatch(content, /£\d+/);
    assert.match(
      EMERGE_FAQS.map((f) => f.answer).join(" "),
      /Not necessarily|safe meeting|legal meeting point/i,
    );
  });

  check("Structured data is BreadcrumbList + Service only", () => {
    assert.match(page, /getBreadcrumbJsonLd/);
    assert.match(page, /getEmergeServiceJsonLd/);
    const service = getEmergeServiceJsonLd();
    assert.equal(service["@type"], "Service");
    assert.doesNotMatch(JSON.stringify(service), /Event/);
    assert.doesNotMatch(JSON.stringify(service), /LocalBusiness/);
  });

  check("Homepage promo + airport/transfer internal links + sitemap entry", () => {
    assert.match(home, /EmergePromoCard/);
    assert.match(airportPage, /events\/emerge-belfast-taxi/);
    assert.match(transferPage, /belfast-to-dublin/);
    assert.match(transferPage, /events\/emerge-belfast-taxi/);
    assert.match(sitemapScript, /\/events\/emerge-belfast-taxi\//);
  });

  check("Page-specific styles are namespaced under .emerge-page", () => {
    assert.match(css, /\.emerge-page/);
    assert.match(css, /\.emerge-sticky-quote/);
    assert.match(client, /emerge-sticky-quote/);
    assert.match(client, /Get an EMERGE Quote/);
  });

  check("Official EMERGE info link is external and safe", () => {
    assert.match(content, /emergebelfast\.com\/information\.php/);
    assert.match(client, /EMERGE_OFFICIAL_INFO_URL/);
    assert.match(client, /rel="noopener noreferrer"/);
    assert.match(client, /target="_blank"/);
  });

  console.log(`\n${passed} EMERGE Belfast page checks passed`);
}

main();

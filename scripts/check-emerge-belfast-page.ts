/**
 * Content + expiry checks for the EMERGE Belfast landing page.
 * Run: npx tsx scripts/check-emerge-belfast-page.ts
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  EMERGE_BELFAST_CONFIG,
  EMERGE_BELFAST_DESTINATION,
  EMERGE_BELFAST_EXPIRES_ON,
  EMERGE_BELFAST_META,
  EMERGE_BELFAST_PATH,
  EMERGE_DISCLAIMER,
  EMERGE_FAQS,
  emergeWhatsAppHref,
  getEmergeServiceJsonLd,
  isEmergeBelfastCampaignActive,
} from "../src/lib/emerge-belfast";
import { SITE } from "../src/lib/data";
import { parseLondonLocalIso } from "../shared/uk-time";

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
  const ended = read("src/components/EmergeBelfastEndedPage.tsx");
  const routeClient = read("src/components/EmergeBelfastRouteClient.tsx");
  const content = read("src/lib/emerge-belfast.ts");
  const configJson = read("src/lib/emerge-belfast-config.json");
  const home = read("src/app/page.tsx");
  const promo = read("src/components/EmergePromoCard.tsx");
  const discovery = read("src/components/EmergeDiscoveryPromo.tsx");
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

  check("Campaign expires 31 August 2026 (UK inclusive)", () => {
    assert.equal(EMERGE_BELFAST_EXPIRES_ON, "2026-08-31");
    assert.equal(EMERGE_BELFAST_CONFIG.campaignYear, 2026);
    assert.match(configJson, /"expiresOn": "2026-08-31"/);
    const stillActive = parseLondonLocalIso("2026-08-31T23:30:00");
    const endedDay = parseLondonLocalIso("2026-09-01T00:30:00");
    assert.ok(stillActive && endedDay);
    assert.equal(isEmergeBelfastCampaignActive(stillActive!), true);
    assert.equal(isEmergeBelfastCampaignActive(endedDay!), false);
  });

  check("Page has a single H1 and uses shared Header/Footer/QuoteCard", () => {
    assert.equal((client.match(/<h1\b/g) || []).length, 1);
    assert.match(client, /Pre-Book Your Taxi to EMERGE Belfast 2026/);
    assert.match(page, /<Header/);
    assert.match(page, /<Footer/);
    assert.match(client, /QuoteCard/);
    assert.match(quoteCard, /initialDropoffHint/);
  });

  check("After expiry: noindex ended page, no 301, runtime switch", () => {
    assert.match(page, /generateMetadata/);
    assert.match(page, /robots/);
    assert.match(page, /index:\s*false/);
    assert.match(page, /EmergeBelfastRouteClient/);
    assert.match(routeClient, /isEmergeBelfastCampaignActive/);
    assert.match(routeClient, /EmergeBelfastEndedPage/);
    assert.match(ended, /transfers have ended/);
    assert.doesNotMatch(page, /redirect\(|permanentRedirect|NextResponse\.redirect/i);
    assert.doesNotMatch(ended, /redirect\(|permanentRedirect|NextResponse\.redirect/i);
    assert.match(ended, /no 301/);
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

  check("Structured data is BreadcrumbList + Service only (Service when active)", () => {
    assert.match(page, /getBreadcrumbJsonLd/);
    assert.match(page, /getEmergeServiceJsonLd/);
    const service = getEmergeServiceJsonLd();
    assert.equal(service["@type"], "Service");
    assert.doesNotMatch(JSON.stringify(service), /Event/);
    assert.doesNotMatch(JSON.stringify(service), /LocalBusiness/);
  });

  check("Homepage promo + airport/transfer links are date-gated", () => {
    assert.match(home, /EmergePromoCard/);
    assert.match(promo, /isEmergeBelfastCampaignActive/);
    assert.match(discovery, /isEmergeBelfastCampaignActive/);
    assert.match(airportPage, /EmergeDiscoveryPromo/);
    assert.match(transferPage, /EmergeDiscoveryPromo/);
    assert.match(sitemapScript, /EMERGE_CAMPAIGN_ACTIVE/);
    assert.match(sitemapScript, /emerge-belfast-config\.json/);
  });

  check("2026 archive preserves campaign source for 2027", () => {
    const archiveRoot = "src/archive/emerge-belfast-2026";
    for (const file of [
      "README.md",
      "emerge-belfast-config.json",
      "lib-emerge-belfast.ts",
      "EmergeBelfastPageClient.tsx",
      "EmergePromoCard.tsx",
      "EmergeDiscoveryPromo.tsx",
      "page.tsx",
      "emerge-page.css",
    ]) {
      assert.equal(existsSync(join(process.cwd(), archiveRoot, file)), true, file);
    }
    const readme = read(`${archiveRoot}/README.md`);
    assert.match(readme, /2027/);
    assert.match(readme, /no permanent 301/i);
    assert.match(readme, /QuoteCard/);
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

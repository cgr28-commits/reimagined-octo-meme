/**
 * Landing-page “Get a Live Quote” CTA — jump to the existing calculator.
 * Run: npx tsx scripts/check-landing-quote-cta.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const cta = read("src/components/LandingPageQuoteCta.tsx");
const section = read("src/components/LocationQuoteSection.tsx");
const row = read("src/components/LandingCtaRow.tsx");
const quoteNav = read("src/components/QuoteNavLink.tsx");
const airports = read("src/app/airports/[slug]/page.tsx");
const locations = read("src/app/locations/[slug]/page.tsx");
const transfers = read("src/app/transfers/[slug]/page.tsx");
const homepage = read("src/app/page.tsx");
const hero = read("src/components/HeroSlideshow.tsx");
const css = read("src/app/globals.css");
const quoteCard = read("src/components/QuoteCard.tsx");
const header = read("src/components/Header.tsx");

console.log("=== Shared landing quote CTA ===");
assert.match(cta, /LANDING_QUOTE_CTA_LABEL = "Get a Live Quote"/);
assert.match(cta, /LANDING_QUOTE_HREF = "#quote"/);
assert.match(cta, /LandingPageQuoteCta/);
assert.match(cta, /LandingPageStickyQuoteCta/);
assert.match(cta, /md:hidden/);
assert.match(cta, /safe-area-inset-bottom/);
assert.match(cta, /matni-cookie-banner-offset/);
assert.match(cta, /z-\[65\]/);
assert.match(cta, /IntersectionObserver/);
assert.match(cta, /href=\{LANDING_QUOTE_HREF\}/);
console.log("OK  shared inline + mobile sticky CTA");

console.log("=== Quote section keeps one calculator and #quote ===");
assert.match(section, /id="quote"/);
assert.match(section, /id="live-quote"/);
assert.match(section, /data-landing-quote/);
assert.match(section, /<LandingPageStickyQuoteCta/);
assert.match(section, /initialAirportCode=\{airportCode\}/);
assert.match(section, /initialDirection=\{direction\}/);
assert.match(section, /initialAddressHint=\{addressHint\}/);
assert.equal(section.split("<QuoteCard").length - 1, 1);
console.log("OK  one QuoteCard; prefills unchanged; #quote retained");

console.log("=== Page types use the shared CTA ===");
assert.match(airports, /LandingPageQuoteCta/);
assert.match(locations, /LandingCtaRow/);
assert.match(locations, /Get a Live Quote/);
assert.match(transfers, /LandingCtaRow/);
assert.match(transfers, /LandingPageQuoteCta/);
assert.match(transfers, /Get a Live Quote/);
assert.match(row, /LandingPageQuoteCta/);
assert.doesNotMatch(homepage, /LandingPageQuoteCta|LandingPageStickyQuoteCta|LocationQuoteSection/);
assert.doesNotMatch(hero, /LandingPageStickyQuoteCta|data-landing-quote/);
console.log("OK  airports, town hubs, transfers; homepage unchanged");

console.log("=== In-page jump does not reset landing prefills ===");
assert.match(quoteNav, /resolveQuoteNavHref/);
assert.doesNotMatch(quoteNav, /href\.startsWith\("\/"\) \? href : "\/#quote"/);
console.log("OK  hash CTA stays on the landing page when #quote exists");

console.log("=== Sticky does not collide with cookie / header chrome ===");
assert.match(css, /main:has\(\[data-landing-quote\]\)/);
assert.match(header, /data-matni-whatsapp-quick/);
assert.match(header, /z-\[60\]/);
console.log("OK  cookie-offset sticky + extra mobile main padding; header WhatsApp stays");

console.log("=== SEO metadata / H1 / schema hooks unchanged ===");
for (const [name, source] of [
  ["airports", airports],
  ["locations", locations],
  ["transfers", transfers],
] as const) {
  assert.match(source, /export async function generateMetadata/);
  assert.match(source, /alternates: \{ canonical:/);
  assert.match(source, /<h1/);
}
assert.match(airports, /getServiceAreaJsonLd|getBreadcrumbJsonLd/);
assert.match(transfers, /getFaqPageJsonLd/);
assert.doesNotMatch(airports, /page\.title =/);
console.log("OK  generateMetadata, canonical, H1, schema helpers still present");

console.log("=== Quote / pricing logic not imported here ===");
assert.doesNotMatch(cta, /calculateFare|SUMUP|returnJourneyDiscount|expressDropOff/);
assert.match(quoteCard, /Get a Live Quote/);
console.log("OK  CTA layer does not touch fare/payment code");

console.log("\nAll landing quote CTA checks passed.");

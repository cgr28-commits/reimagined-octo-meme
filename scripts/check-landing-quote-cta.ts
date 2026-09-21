/**
 * Landing-page “Get a Live Quote” CTA — jump to the existing calculator.
 * Run: npx tsx scripts/check-landing-quote-cta.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LANDING_INLINE_QUOTE_CTA_ATTR,
  collectLandingStickyHideTargets,
  shouldShowLandingStickyQuote,
} from "../src/components/LandingPageQuoteCta";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const cta = read("src/components/LandingPageQuoteCta.tsx");
const section = read("src/components/LocationQuoteSection.tsx");
const row = read("src/components/LandingCtaRow.tsx");
const quoteNav = read("src/components/QuoteNavLink.tsx");
const airports = read("src/app/airports/[slug]/page.tsx");
const airportsIndex = read("src/app/airports/page.tsx");
const locations = read("src/app/locations/[slug]/page.tsx");
const locationsIndex = read("src/app/locations/page.tsx");
const transfers = read("src/app/transfers/[slug]/page.tsx");
const cruise = read("src/app/belfast-cruise-terminal-transfers/page.tsx");
const longDistance = read("src/app/long-distance-transfers/page.tsx");
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
assert.match(cta, /data-landing-sticky-quote/);
assert.match(cta, /LANDING_INLINE_QUOTE_CTA_ATTR = "data-landing-quote-cta"/);
assert.match(cta, /data-landing-quote-cta/);
assert.match(cta, /collectLandingStickyHideTargets/);
assert.match(cta, /shouldShowLandingStickyQuote\(visible\.size\)/);
assert.match(cta, /threshold: 0/);
assert.doesNotMatch(cta, /belfast-cruise-terminal-transfers/);
console.log("OK  shared inline + mobile sticky CTA");

console.log("=== Sticky hides while inline CTA or #quote is on screen ===");
{
  const quote = { id: "quote" } as unknown as Element;
  const inlineA = { id: "cta-a" } as unknown as Element;
  const inlineB = { id: "cta-b" } as unknown as Element;
  const targets = collectLandingStickyHideTargets(
    (id) => (id === "quote" ? quote : null),
    (selector) => {
      assert.equal(selector, `[${LANDING_INLINE_QUOTE_CTA_ATTR}]`);
      return [inlineA, inlineB];
    },
  );
  assert.deepEqual(targets, [quote, inlineA, inlineB]);
  assert.equal(shouldShowLandingStickyQuote(1), false, "inline CTA visible → sticky hidden");
  assert.equal(shouldShowLandingStickyQuote(2), false, "calculator visible → sticky hidden");
  assert.equal(shouldShowLandingStickyQuote(0), true, "neither visible → sticky shown");

  const cruiseLike = collectLandingStickyHideTargets(
    () => null,
    () => [inlineA, inlineB],
  );
  assert.deepEqual(cruiseLike, [inlineA, inlineB]);
  assert.equal(shouldShowLandingStickyQuote(cruiseLike.length > 0 ? 1 : 0), false);

  const noTargets = collectLandingStickyHideTargets(
    () => null,
    () => [],
  );
  assert.deepEqual(noTargets, []);
  assert.equal(shouldShowLandingStickyQuote(0), true);
}
console.log("OK  hide/show rules cover inline CTA and #quote without URL-specific logic");

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
{
  const stickySource = cta.slice(cta.indexOf("export function LandingPageStickyQuoteCta"));
  assert.doesNotMatch(stickySource, /data-landing-quote-cta/);
}
assert.match(cruise, /LandingPageStickyQuoteCta/);
assert.match(cruise, /LandingCtaRow/);
assert.doesNotMatch(cruise, /LocationQuoteSection/);
assert.match(airportsIndex, /LandingPageStickyQuoteCta/);
assert.match(locationsIndex, /LandingPageStickyQuoteCta/);
assert.match(longDistance, /LandingPageStickyQuoteCta/);
assert.doesNotMatch(homepage, /LandingPageQuoteCta|LandingPageStickyQuoteCta|LocationQuoteSection/);
assert.doesNotMatch(hero, /LandingPageStickyQuoteCta|data-landing-quote/);
console.log("OK  airports, town hubs, transfers, cruise and hubs; homepage unchanged");

console.log("=== In-page jump does not reset landing prefills ===");
assert.match(quoteNav, /resolveQuoteNavHref/);
assert.doesNotMatch(quoteNav, /href\.startsWith\("\/"\) \? href : "\/#quote"/);
console.log("OK  hash CTA stays on the landing page when #quote exists");

console.log("=== Sticky does not collide with cookie / header chrome ===");
assert.match(css, /main:has\(\[data-landing-quote\]\)/);
assert.match(css, /main:has\(\[data-landing-sticky-quote\]\)/);
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

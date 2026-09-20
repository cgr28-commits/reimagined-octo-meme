/**
 * Homepage mobile quote UI — benefits row + journey cards + continue CTA.
 * Run: npx tsx scripts/check-homepage-mobile-quote-ui.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const hero = read("src/components/HeroSlideshow.tsx");
const benefits = read("src/components/HeroBenefitsRow.tsx");
const journey = read("src/components/JourneyOptionCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");
const css = read("src/app/globals.css");
const header = read("src/components/Header.tsx");
const page = read("src/app/page.tsx");
const landingCta = read("src/components/LandingPageQuoteCta.tsx");
const landingSection = read("src/components/LocationQuoteSection.tsx");

console.log("=== Homepage hero + quote presentation ===");
assert.match(hero, /<HeroBenefitsRow/);
assert.match(hero, /id="quote"/);
assert.match(hero, /<QuoteCard/);
assert.match(hero, /Belfast Airport Transfers/);
assert.match(hero, /Private taxi airport transfers/);
assert.match(
  hero,
  /Pre-booked private airport transfers to and from Belfast, Dublin and airports across Northern Ireland\./,
);
assert.doesNotMatch(
  hero,
  /Fixed-price private airport transfers, booked in advance with a driver reserved for your chosen pickup time\./,
);
assert.match(hero, /presentation="homepage"/);
assert.doesNotMatch(hero, /Reserved driver · Fixed price/);
assert.match(benefits, /Reserved driver/);
assert.match(benefits, /Fixed price/);
assert.match(benefits, /Flight monitoring/);
assert.match(benefits, /Airport waiting included/);
assert.match(benefits, /\["Reserved", "driver"\]/);
assert.match(benefits, /\["Fixed", "price"\]/);
assert.match(benefits, /\["Flight", "monitoring"\]/);
assert.match(benefits, /\["Airport", "waiting included"\]/);
assert.match(benefits, /md:hidden/);
assert.match(benefits, /hero-benefit-icon/);
assert.match(css, /\.hero-benefit-icon \{/);
assert.match(css, /background: var\(--color-emerald\)/);
assert.match(css, /\.hero-benefit-divider::before/);
console.log("OK  four-column benefits replace the middot line");

console.log("=== Journey option cards ===");
assert.match(progressive, /presentation === "homepage"/);
assert.match(progressive, /<JourneyOptionCard/);
assert.match(progressive, /SELECT_CARD/);
assert.match(progressive, /choiceGroupNeedsClass\(!journeyIntent\)/);
assert.match(
  progressive,
  /presentation === "homepage"[\s\S]{0,180}grid gap-1\.5 sm:gap-2[\s\S]{0,80}: `grid gap-2/,
);
assert.match(progressive, /Where are you travelling\?/);
assert.match(journey, /aria-pressed=\{selected\}/);
assert.match(journey, /To an Airport|id === "to-airport"/);
assert.match(journey, /journey-option-card/);
assert.match(journey, /journey-option-chevron/);
assert.match(css, /\.journey-option-card \{/);
assert.match(css, /\.journey-option-card-selected \{/);
assert.match(css, /min-height: 3\.4rem/);
assert.match(css, /data-quote-presentation="homepage"[\s\S]*min-height: 2\.2rem/);
assert.match(progressive, /QUOTE_JOURNEY_INTENT_OPTIONS/);
assert.match(progressive, /onJourneyIntentChange/);
console.log("OK  existing journey options restyled, same handlers");

console.log("=== Continue button + steps ===");
assert.match(card, /Continue to travel details/);
assert.match(card, /Get a Live Quote/);
assert.match(card, /Get your fixed price in three quick steps\./);
assert.match(card, /label: "Journey"/);
assert.match(card, /label: "Quote"/);
assert.match(card, /label: "Booking & Pay"/);
assert.match(card, /quote-step-active/);
console.log("OK  step labels and continue action text unchanged");

console.log("=== Header / SEO / landing CTA preserved ===");
assert.match(header, /Get a Quote/);
assert.match(header, /data-matni-whatsapp-quick/);
assert.match(page, /HOMEPAGE_SEO_TITLE/);
assert.match(page, /canonical: "\/"/);
assert.match(landingCta, /LANDING_QUOTE_HREF = "#quote"/);
assert.match(landingSection, /id="quote"/);
assert.match(landingSection, /id="live-quote"/);
console.log("OK  header, homepage metadata hooks, and PR #511 anchors remain");

console.log("\nAll homepage mobile quote UI checks passed.");

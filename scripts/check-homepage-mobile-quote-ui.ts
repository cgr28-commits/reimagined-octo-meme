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
assert.match(hero, /Private taxi \| Airport transfers/);
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
assert.match(benefits, /Pre-booked driver/);
assert.match(benefits, /Fixed price/);
assert.match(benefits, /Flight monitoring/);
assert.match(benefits, /Airport waiting included/);
assert.match(benefits, /\["Pre-booked", "driver"\]/);
assert.match(benefits, /\["Fixed", "price"\]/);
assert.match(benefits, /\["Flight", "monitoring"\]/);
assert.match(benefits, /\["Airport", "waiting included"\]/);
assert.match(benefits, /md:hidden/);
assert.match(benefits, /hero-benefit-icon/);
assert.match(benefits, /hero-benefit-pound/);
assert.match(benefits, /className="hero-benefit-pound"/);
assert.match(benefits, /fillRule="evenodd"/);
assert.match(benefits, /<circle cx="12" cy="8"/);
assert.match(benefits, /fill="#ffffff"/);
assert.match(benefits, /hero-benefit-label/);
assert.match(benefits, /grid-cols-4/);
assert.match(benefits, /text-\[0\.8rem\]/);
assert.match(benefits, /leading-\[1\.28\]/);
assert.match(benefits, /text-white/);
assert.doesNotMatch(benefits, /text-white\/88/);
assert.match(css, /\.hero-benefit-icon \{/);
assert.match(css, /height: 2\.1rem/);
assert.match(css, /width: 2\.1rem/);
assert.match(css, /\.hero-benefit-icon svg \{[\s\S]*height: 1\.5rem/);
assert.match(css, /background: var\(--color-emerald\)/);
assert.match(css, /color: #ffffff/);
assert.match(css, /fill: #ffffff/);
assert.match(css, /\.hero-benefit-divider::before/);
assert.match(css, /\.hero-benefit-pound \{/);
assert.match(css, /\.hero-benefit-label \{/);
assert.doesNotMatch(benefits, /<span className="hero-benefit-pound"/);
for (const width of [375, 390, 430]) {
  const column = width / 4;
  const iconBox = 2.1 * 16;
  assert.ok(iconBox < column, `2.1rem icon box must fit one of four columns at ${width}px`);
}
console.log("OK  four-column benefits replace the middot line");

console.log("=== Journey option cards ===");
assert.match(progressive, /presentation === "homepage"/);
assert.match(progressive, /<JourneyOptionCard/);
assert.match(progressive, /SELECT_CARD/);
assert.match(progressive, /choiceGroupNeedsClass\(!journeyIntent\)/);
assert.match(
  progressive,
  /presentation === "homepage"[\s\S]{0,180}grid gap-2 sm:gap-2[\s\S]{0,80}: `grid gap-2/,
);
assert.match(progressive, /Where are you travelling\?/);
assert.match(journey, /aria-pressed=\{selected\}/);
assert.match(journey, /To an Airport|id === "to-airport"/);
assert.match(journey, /journey-option-card/);
assert.match(journey, /journey-option-chevron/);
assert.match(journey, /M2\.5 19h19v2h-19v-2z/);
assert.match(journey, /id === "from-airport"/);
assert.match(journey, /M9\.68 13\.27l4\.35 1\.16 5\.31 1\.42/);
assert.match(journey, /M22\.07 9\.64c-\.21-\.8-1\.04-1\.28-1\.84-1\.06L14\.92 10 8 3\.57/);
assert.doesNotMatch(journey, /rotate\(/);
assert.doesNotMatch(journey, /M19\.57 5\.64/);
assert.match(css, /\.journey-option-card \{/);
assert.match(css, /\.journey-option-card-selected \{/);
assert.match(css, /min-height: 3\.05rem/);
assert.match(css, /data-quote-presentation="homepage"[\s\S]*min-height: 2\.2rem/);
assert.match(progressive, /QUOTE_JOURNEY_INTENT_OPTIONS/);
assert.match(progressive, /onJourneyIntentChange/);
assert.match(progressive, /AIRPORT_SELECT_CARD/);
assert.match(progressive, /min-h-14/);
const partySelectors = read("src/components/PublicPartySelectors.tsx");
assert.match(partySelectors, /choiceGridShellClass/);
assert.match(partySelectors, /Include all children in the passenger total\./);
assert.match(partySelectors, /form-label mb-0/);
assert.match(partySelectors, /mt-1 text-\[11px\] font-medium leading-snug text-white\/70/);
assert.match(progressive, /PublicPartySelectors/);
assert.doesNotMatch(
  progressive,
  /function ChoiceGrid[\s\S]{0,400}choiceGroupNeedsClass/,
);
console.log("OK  existing journey options restyled, same handlers");

console.log("=== Continue button + steps ===");
assert.match(card, /Continue to travel details/);
assert.match(card, /Get a Live Quote/);
assert.match(card, /Get your fixed price in three quick steps\./);
assert.match(card, /label: "Journey"/);
assert.match(card, /label: "Quote"/);
assert.match(card, /label: "Booking & Pay"/);
assert.match(card, /quote-step-active/);
assert.match(card, /quoteResultsReady && quoteStep === 1/);
assert.match(card, /!quoteChoicesReady \|\|\s*!isScheduleComplete/);
assert.match(card, /presentation === "homepage"[\s\S]{0,80}space-y-0/);
console.log("OK  step labels and continue action text unchanged");

console.log("=== Compact mobile cookie banner (copy + layout only) ===");
const cookie = read("src/components/CookieConsent.tsx");
assert.match(cookie, /Cookies &amp; privacy/);
assert.match(cookie, /We use optional cookies to measure advertising performance\./);
assert.match(cookie, /Essential only/);
assert.match(cookie, /choose\("rejected"\)/);
assert.match(cookie, /choose\("accepted"\)/);
assert.match(cookie, /writeCookieConsent\(next\)/);
assert.match(cookie, /updateGoogleConsent\(next === "accepted"\)/);
assert.match(cookie, /cookie-consent-banner/);
assert.match(css, /\.cookie-consent-banner \{/);
assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*\.cookie-consent-banner \{[\s\S]*padding: 0\.5rem 0\.75rem/);
assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*min-height: 2\.25rem/);
assert.doesNotMatch(cookie, /Cookies &amp; advertising measurement/);
console.log("OK  cookie banner compact on mobile; consent handlers unchanged");

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

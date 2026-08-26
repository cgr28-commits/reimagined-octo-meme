/**
 * Live Quote step navigation must scroll to the active section (header-aware).
 * Selection-driven auto-scroll must stay disabled.
 * Run: npx tsx scripts/check-mobile-quote-step-scroll.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const card = read("src/components/QuoteCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const helper = read("src/lib/quote-step-nav-scroll.ts");
const data = read("src/lib/data.ts");
const page = read("src/app/page.tsx");
const vehicles = read("src/components/VehiclesSection.tsx");

check("Step section anchors exist for 1 / 2 / 3", () => {
  assert.match(card, /id="step1-journey-details"/);
  assert.match(card, /id="step2-travel-details"/);
  assert.match(card, /id="step3-customer-details"/);
  assert.match(card, /id="quote-price-summary"/);
  assert.match(card, /step1JourneyRef/);
  assert.match(card, /step2TravelDetailsRef/);
  assert.match(card, /step3CustomerDetailsRef/);
  assert.match(card, /scroll-mt-44/);
});

check("Explicit step CTAs set pending nav scroll then change step", () => {
  assert.match(card, /pendingQuoteStepNavScrollRef/);
  assert.match(card, /navigateQuoteStep/);
  assert.match(card, /scrollQuoteStage/);
  // Book Now / Continue to travel details (step 1 → 2)
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = 2;\s*setQuoteStep\(2\)/,
  );
  // Continue to your details (step 2 → 3)
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = 3;\s*setQuoteStep\(3\)/,
  );
  // Back / Edit journey / Back to travel details use navigateQuoteStep
  assert.match(card, /navigateQuoteStep\(1\)/);
  assert.match(card, /navigateQuoteStep\(2\)/);
  assert.match(card, /Back to travel details/);
  assert.match(card, /Continue to your details/);
});

check("Scroll effect consumes pending flag once and is quoteStep-gated", () => {
  assert.match(
    card,
    /pendingQuoteStepNavScrollRef\.current = null;[\s\S]*scrollQuoteStage/,
  );
  assert.match(card, /useEffect\(\(\) => \{[\s\S]*pendingQuoteStepNavScrollRef[\s\S]*\}, \[quoteStep\]\)/);
  assert.match(card, /correctAfterMs:\s*150/);
  assert.match(
    card,
    /document\.activeElement\.blur\(\);[\s\S]*pendingQuoteStepNavScrollRef\.current = 2/,
  );
});

check("Helper measures header offset and respects reduced motion", () => {
  assert.match(helper, /getFixedHeaderOffsetPx/);
  assert.match(helper, /prefersReducedMotion/);
  assert.match(helper, /scheduleBookingNavAfterRender/);
  assert.match(helper, /scrollQuoteStage/);
  assert.match(helper, /focusFirstInvalidField/);
  assert.match(helper, /requestAnimationFrame/);
  assert.match(helper, /cancelled/);
  assert.match(helper, /correctAfterMs/);
  assert.match(helper, /bookingRequestResult/);
});

check("Selection-driven auto-scroll stays removed from progressive", () => {
  assert.equal(
    fs.existsSync(path.join(root, "src/lib/quote-mobile-scroll.ts")),
    false,
  );
  assert.doesNotMatch(progressive, /scrollIntoView/);
  assert.doesNotMatch(progressive, /scheduleQuoteSectionScroll/);
  assert.doesNotMatch(progressive, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(progressive, /pendingScroll/);
  assert.doesNotMatch(progressive, /scheduleBookingNavAfterRender/);
  assert.doesNotMatch(card, /scheduleQuoteFareResultScroll/);
  assert.doesNotMatch(card, /scheduleReadyForScrollRef/);
  assert.doesNotMatch(card, /pendingScrollToStep2DateRef/);
  assert.doesNotMatch(card, /pendingScrollToStep3CustomerRef/);
  assert.doesNotMatch(card, /quote-mobile-scroll/);
});

check("Fleet / Saloon / Estate public capacity is up to 4", () => {
  assert.match(page, /VehiclesSection/);
  assert.match(data, /href: "\/#vehicles"/);
  assert.match(data, /Private transfers for 1–4 passengers/);
  assert.match(vehicles, /Private transfers for up to 4/);
  assert.match(vehicles, /Up to 4 passengers/);
  assert.doesNotMatch(vehicles, /Minibus — 5–7 passengers/);
  assert.match(card, /Vehicle for this journey/);
  assert.match(card, /vehicleShortLabel/);
});

check("Blocked availability result scrolls to confirmation card on mobile", () => {
  assert.match(helper, /quote-availability-confirmation/);
  assert.match(card, /id="quote-availability-confirmation"/);
  assert.match(card, /shortNoticeResultRef/);
  assert.match(card, /pendingShortNoticeScrollRef/);
  assert.match(
    card,
    /pendingShortNoticeScrollRef\.current = true;\s*setShortNoticeResult/,
  );
  assert.match(
    card,
    /pendingShortNoticeScrollRef\.current = false;[\s\S]*scrollQuoteStage\(\s*shortNoticeResultRef\.current \?\? "quote-availability-confirmation"/,
  );
  assert.match(
    card,
    /useEffect\(\(\) => \{[\s\S]*if \(!shortNoticeResult \|\| !pendingShortNoticeScrollRef\.current\)[\s\S]*\}, \[shortNoticeResult\]\)/,
  );
  assert.match(card, /Booking requires availability confirmation/);
  assert.match(card, /Message us on WhatsApp/);
  assert.match(card, /scroll-mt-44/);
  // Scroll runs only when the pending flag is set for the blocked result
  assert.match(
    card,
    /if \(!shortNoticeResult \|\| !pendingShortNoticeScrollRef\.current\) \{\s*return;/,
  );
  // Header-aware clearance works at 320 / 375 / 390 / 430px (not viewport-hardcoded)
  assert.match(helper, /HEADER_CLEARANCE_PX/);
  assert.match(helper, /getHeaderBottomPx/);
  assert.match(helper, /computeScrollTopBelowHeader/);
});

check("Quote/booking submission confirmation scrolls into view", () => {
  assert.match(card, /id="bookingRequestResult"/);
  assert.match(card, /bookingResultRef/);
  assert.match(card, /pendingBookingResultScrollRef/);
  assert.match(
    card,
    /pendingBookingResultScrollRef\.current = true;\s*setBookingSent\(true\)/,
  );
  assert.match(
    card,
    /pendingBookingResultScrollRef\.current = false;[\s\S]*scrollQuoteStage\(bookingResultRef\.current \?\? "bookingRequestResult"/,
  );
  assert.match(
    card,
    /useEffect\(\(\) => \{[\s\S]*if \(!bookingSent \|\| !pendingBookingResultScrollRef\.current\)[\s\S]*\}, \[bookingSent\]\)/,
  );
  assert.match(card, /data-booking-nav-heading/);
  assert.match(card, /Quote request received/);
});

check("Step 2 time Done/blur scrolls once to YOUR JOURNEY summary", () => {
  assert.match(helper, /step2-journey-summary/);
  assert.match(card, /id="step2-journey-summary"/);
  assert.match(card, /step2JourneySummaryRef/);
  assert.match(card, /hadJourneySummaryScrollRef/);
  assert.match(card, /requestJourneySummaryScrollAfterTimeConfirm/);
  assert.match(
    card,
    /hadJourneySummaryScrollRef\.current = true;[\s\S]*scrollQuoteStage\(\s*step2JourneySummaryRef\.current \?\? "step2-journey-summary"/,
  );
  assert.match(card, /id="time"[\s\S]*onBlur=\{\(\) => \{[\s\S]*requestJourneySummaryScrollAfterTimeConfirm/);
  assert.match(card, /id="returnTime"[\s\S]*onBlur=\{\(\) => \{[\s\S]*requestJourneySummaryScrollAfterTimeConfirm/);
  assert.doesNotMatch(card, /hadStep2ScheduleScrollRef/);
  assert.doesNotMatch(
    card,
    /useEffect\(\(\) => \{[\s\S]*if \(quoteStep !== 2\)[\s\S]*isScheduleComplete[\s\S]*\}, \[isScheduleComplete, quoteStep\]\)/,
  );
});

check("Validation focuses invalid fields", () => {
  assert.match(card, /focusFirstInvalidField/);
  assert.match(card, /aria-invalid=\{Boolean\(tripDateError\)\}/);
  assert.match(card, /role="alert"/);
});

console.log("\nAll mobile quote step-scroll checks passed.");

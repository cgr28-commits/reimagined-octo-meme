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
  // Continue to your details (step 2 → 3): commit + scroll in the same tap
  assert.match(card, /continueToDetailsInFlightRef/);
  assert.match(card, /continueToDetailsBusy/);
  assert.match(card, /flushSync\(\(\) => \{\s*setQuoteStep\(3\);\s*\}\)/);
  assert.match(
    card,
    /scrollQuoteStage\(step3CustomerDetailsRef\.current \?\? "step3-customer-details"/,
  );
  assert.match(card, /immediate:\s*true/);
  assert.doesNotMatch(
    card,
    /pendingQuoteStepNavScrollRef\.current = 3;\s*setQuoteStep\(3\)/,
  );
  assert.match(card, /disabled=\{submitted \|\| continueToDetailsBusy\}/);
  assert.match(
    card,
    /await applyCustomerSmartAvailabilityCheck\(\);[\s\S]*flushSync\(\(\) => \{\s*setQuoteStep\(3\);/,
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
  assert.match(helper, /immediate\?: boolean/);
  assert.match(helper, /options\?\.immediate && resolveBookingNavElement\(target\)/);
  assert.match(helper, /bookingRequestResult/);
});

check("Mobile Step 1 journey-type tap does not scroll", () => {
  assert.match(card, /function applyJourneyIntent/);
  assert.match(
    card,
    /function applyJourneyIntent\([\s\S]*?if \(\s*detectMobileDevice\(\)[\s\S]*?document\.activeElement\.blur\(\)/,
  );
  assert.match(
    card,
    /hadA2aAddressesScrollRef\.current = true;\s*if \(detectMobileDevice\(\)\) return;/,
  );
  assert.match(card, /scrollQuoteStage\("quote-section-addresses"/);
  assert.match(progressive, /onPointerDown/);
  assert.match(progressive, /detectMobileDevice\(\)/);
  // Later Step 1 stages + step changes + validation still scroll.
  assert.match(card, /scrollQuoteStage\("journey-type-selector"/);
  assert.match(card, /scrollQuoteStage\("passenger-luggage-section"/);
  assert.match(card, /pendingQuoteStepNavScrollRef\.current = 2;\s*setQuoteStep\(2\)/);
  assert.match(card, /focusFirstInvalidField/);
});

check("Mobile Step 1 address complete does not scroll", () => {
  // A2A Stage 3: both addresses valid → One way / Return. Gated on mobile.
  assert.match(
    card,
    /hadA2aJourneyTypeScrollRef\.current = true;\s*[\s\S]*?if \(detectMobileDevice\(\)\) return;\s*return scrollQuoteStage\("journey-type-selector", \{ correctAfterMs: 0 \}\)/,
  );
  // Legacy: route becomes valid with no journey mode yet. Gated on mobile.
  assert.match(
    card,
    /hadLegacyJourneyModeScrollRef\.current = true;\s*[\s\S]*?if \(detectMobileDevice\(\)\) return;\s*return scrollQuoteStage\("journey-type-selector", \{ correctAfterMs: 0 \}\)/,
  );
  // Desktop still has the address-complete scroll (gate then scrollQuoteStage).
  assert.match(card, /scrollQuoteStage\("journey-type-selector", \{ correctAfterMs: 0 \}\)/);
  // One way/Return → passengers, bags → route, and validation are not gated.
  assert.match(
    card,
    /hadA2aPartyScrollRef\.current = true;\s*return scrollQuoteStage\("passenger-luggage-section"/,
  );
  assert.match(
    card,
    /hadRouteSummaryScrollRef\.current = true;[\s\S]*?scrollQuoteStage\(routeSummaryRef\.current \?\? "quote-route-summary"/,
  );
  assert.match(
    card,
    /failStep1\("missing_journey_mode"[\s\S]*?scrollQuoteStage\("journey-type-selector"\);/,
  );
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
  assert.match(helper, /export function scrollJourneySummaryAfterTimeConfirm/);
  assert.match(helper, /quote-step2-next/);
  assert.match(helper, /maxKeepCtaInView/);
  assert.match(card, /id="step2-journey-summary"/);
  assert.match(card, /step2JourneySummaryRef/);
  assert.match(card, /hadJourneySummaryScrollRef/);
  assert.match(card, /requestJourneySummaryScrollAfterTimeConfirm/);
  assert.match(card, /scrollJourneySummaryAfterTimeConfirm/);
  assert.match(card, /hadJourneySummaryScrollRef\.current = true;/);
  assert.match(
    card,
    /preferFlightDetails[\s\S]*step2-flight-details[\s\S]*step2-journey-summary|step2-flight-details[\s\S]*step2JourneySummaryRef/,
  );
  assert.match(card, /id="time"[\s\S]*onBlur=\{\(\) => \{[\s\S]*requestJourneySummaryScrollAfterTimeConfirm/);
  assert.match(card, /id="returnTime"[\s\S]*onBlur=\{\(\) => \{[\s\S]*requestJourneySummaryScrollAfterTimeConfirm/);
  assert.doesNotMatch(card, /hadStep2ScheduleScrollRef/);
  assert.doesNotMatch(
    card,
    /useEffect\(\(\) => \{[\s\S]*if \(quoteStep !== 2\)[\s\S]*isScheduleComplete[\s\S]*\}, \[isScheduleComplete, quoteStep\]\)/,
  );
});

check("Continue to details focuses the heading, not the Name field", () => {
  assert.match(
    card,
    /scrollQuoteStage\(step3CustomerDetailsRef\.current \?\? "step3-customer-details"[\s\S]*?focusHeading:\s*true/,
  );
  assert.doesNotMatch(card, /id="name"[\s\S]{0,200}autoFocus/);
  assert.match(helper, /heading\.focus\(\{ preventScroll: true \}\)/);
});

check("Validation focuses invalid fields", () => {
  assert.match(card, /focusFirstInvalidField/);
  assert.match(card, /aria-invalid=\{Boolean\(tripDateError\)\}/);
  assert.match(card, /role="alert"/);
});

const IPHONE_WIDTHS = [320, 375, 390, 430] as const;

function installIphoneQuoteNavWindow(width: number) {
  class FakeHTMLElement {}
  const headerBottom = 88;
  const targetTop = 720;
  const startScrollY = 640;
  const scrolls: Array<{ top: number; behavior?: ScrollBehavior }> = [];
  const rafQueue: FrameRequestCallback[] = [];
  const heading = Object.assign(new FakeHTMLElement(), {
    hasAttribute: (name: string) => name === "tabindex",
    tabIndex: -1,
    focus: () => {},
    matches: () => true,
  });
  const section = Object.assign(new FakeHTMLElement(), {
    id: "step3-customer-details",
    matches: () => false,
    querySelector: () => heading,
    getBoundingClientRect: () => ({
      top: targetTop,
      bottom: targetTop + 520,
      height: 520,
      left: 0,
      right: width,
    }),
  });
  const header = Object.assign(new FakeHTMLElement(), {
    className: "fixed top-0",
    getBoundingClientRect: () => ({
      top: 0,
      bottom: headerBottom,
      height: headerBottom,
      left: 0,
      right: width,
    }),
  });
  const win = {
    scrollY: startScrollY,
    innerHeight: 844,
    matchMedia: () => ({ matches: false }),
    scrollTo: (opts: { top?: number; behavior?: ScrollBehavior }) => {
      win.scrollY = Number(opts.top) || 0;
      scrolls.push({ top: win.scrollY, behavior: opts.behavior });
    },
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const doc = {
    documentElement: { style: {} as CSSStyleDeclaration },
    querySelector: (sel: string) => (String(sel).includes("header") ? header : null),
    getElementById: (id: string) => (id === "step3-customer-details" ? section : null),
    activeElement: null,
  };
  Object.assign(globalThis, { window: win, document: doc, HTMLElement: FakeHTMLElement });
  return { scrolls, rafQueue, win, headerBottom, targetTop, startScrollY };
}

function installMatchMediaViewport(width: number, height: number) {
  const isDesktop = width >= 768;
  const win = {
    innerWidth: width,
    innerHeight: height,
    matchMedia: (query: string) => ({
      matches: String(query).includes("min-width: 768px") ? isDesktop : false,
    }),
  };
  Object.assign(globalThis, { window: win });
}

void (async () => {
  const { detectMobileDevice } = await import("../src/lib/device.ts");
  check("Address-complete mobile gate uses 375 / 390 / 1280+ breakpoints", () => {
    for (const [width, height] of [
      [375, 667],
      [390, 844],
    ] as const) {
      installMatchMediaViewport(width, height);
      assert.equal(
        detectMobileDevice(),
        true,
        `${width}x${height} must gate Step 1 address-complete scroll`,
      );
    }
    installMatchMediaViewport(1280, 800);
    assert.equal(
      detectMobileDevice(),
      false,
      "1280px+ desktop must keep address-complete scroll",
    );
    installMatchMediaViewport(1440, 900);
    assert.equal(detectMobileDevice(), false, "1440px desktop must keep address-complete scroll");
  });

  const { scheduleBookingNavAfterRender, HEADER_CLEARANCE_PX } = await import(
    "../src/lib/quote-step-nav-scroll.ts"
  );
  check("Immediate scroll on iPhone widths starts in the same turn", () => {
    for (const width of IPHONE_WIDTHS) {
      const { scrolls, rafQueue, headerBottom, targetTop, startScrollY } =
        installIphoneQuoteNavWindow(width);
      scheduleBookingNavAfterRender("step3-customer-details", {
        immediate: true,
        focusHeading: true,
        correctAfterMs: 0,
      });
      assert.equal(rafQueue.length, 0, `${width}px must not wait for animation frames`);
      assert.ok(scrolls.length >= 1, `${width}px must scroll immediately`);
      const expected = Math.max(
        0,
        Math.round(startScrollY + targetTop - (headerBottom + HEADER_CLEARANCE_PX)),
      );
      assert.equal(
        scrolls[0]?.top,
        expected,
        `${width}px heading lands ${HEADER_CLEARANCE_PX}px below header`,
      );
    }
  });

  console.log("\nAll mobile quote step-scroll checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

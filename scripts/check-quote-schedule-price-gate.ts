/**
 * Public quote calculator: no monetary price until schedule + party are complete.
 * Night/weekend 10% is included in the first displayed price.
 * Run: npx tsx scripts/check-quote-schedule-price-gate.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  hasEnteredQuoteSchedule,
  QUOTE_INCLUDES_NIGHT_WEEKEND_SURCHARGE,
  QUOTE_PRICE_WAIT_FOR_DETAILS,
  QUOTE_PRICE_WAIT_FOR_SCHEDULE,
} from "../shared/quote-display-gate";
import { calculateQuote, roundGbp } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { isTripPremiumDateTime } from "../src/lib/point-to-point-premium";

const root = path.resolve(import.meta.dirname, "..");
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const card = read("src/components/QuoteCard.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const scheduleUi = read("src/components/QuoteScheduleFields.tsx");
const showcase = read("src/components/QuoteResultShowcase.tsx");
const payment = read("workers/addresses/src/index.ts");

check("journey only / party without date → no displayed price", () => {
  assert.equal(hasEnteredQuoteSchedule({}), false);
  assert.equal(
    hasEnteredQuoteSchedule({
      outboundDate: "2026-08-19",
      outboundTime: "",
      returnJourney: false,
    }),
    false,
  );
  assert.equal(
    hasEnteredQuoteSchedule({
      outboundDate: "",
      outboundTime: "10:00",
      returnJourney: false,
    }),
    false,
  );
  assert.match(card, /hasEnteredQuoteSchedule/);
  assert.match(card, /scheduleEntered/);
  assert.match(card, /canShowPrice =\s*\n?\s*hasQuoteRoute &&\s*\n?\s*quoteChoicesReady &&\s*\n?\s*isScheduleComplete/);
  assert.match(card, /quoteResultsReady =\s*\n?\s*quoteChoicesReady &&\s*\n?\s*hasQuoteRoute &&\s*\n?\s*isScheduleComplete/);
  assert.match(card, /QUOTE_PRICE_WAIT_FOR_SCHEDULE/);
  assert.match(card, /data-quote-price-wait/);
  assert.doesNotMatch(card, /£0\.00/);
});

check("date but no time / time but no date → no price", () => {
  assert.equal(
    hasEnteredQuoteSchedule({ outboundDate: "2026-08-19", outboundTime: "", returnJourney: false }),
    false,
  );
  assert.equal(
    hasEnteredQuoteSchedule({ outboundDate: "", outboundTime: "22:00", returnJourney: false }),
    false,
  );
});

check("return missing return date/time → no final return price", () => {
  assert.equal(
    hasEnteredQuoteSchedule({
      outboundDate: "2026-08-21",
      outboundTime: "14:00",
      returnJourney: true,
    }),
    false,
  );
  assert.equal(
    hasEnteredQuoteSchedule({
      outboundDate: "2026-08-21",
      outboundTime: "14:00",
      returnJourney: true,
      returnDate: "2026-08-23",
      returnTime: "",
    }),
    false,
  );
  assert.equal(
    hasEnteredQuoteSchedule({
      outboundDate: "2026-08-21",
      outboundTime: "14:00",
      returnJourney: true,
      returnDate: "2026-08-23",
      returnTime: "15:00",
    }),
    true,
  );
});

check("customer flow order: journey type → date/time → passengers → suitcases", () => {
  const selectors = read("src/components/PublicPartySelectors.tsx");
  const journeyIdx = progressive.indexOf('id="journey-type-selector"');
  const scheduleIdx = progressive.indexOf("showScheduleFields && scheduleFields");
  const partyIdx = progressive.indexOf('id="passenger-luggage-section"');
  const selectorsIdx = progressive.indexOf("<PublicPartySelectors");
  const paxIdx = selectors.indexOf('id="quote-section-passengers"');
  const bagsIdx = selectors.indexOf('id="quote-section-suitcases"');
  assert.ok(journeyIdx > 0 && scheduleIdx > journeyIdx);
  assert.ok(partyIdx > scheduleIdx);
  assert.ok(selectorsIdx > partyIdx);
  assert.ok(paxIdx > 0 && bagsIdx > paxIdx);
  assert.match(scheduleUi, /Pickup date & time/);
  assert.match(scheduleUi, /\(required\)/);
  assert.match(scheduleUi, /Pickup date/);
  assert.match(scheduleUi, /id="date"/);
  assert.match(scheduleUi, /id="time"/);
  assert.match(scheduleUi, /id="returnDate"/);
  assert.match(scheduleUi, /id="returnTime"/);
  assert.match(card, /showScheduleFields=/);
  assert.match(card, /scheduleFields=\{renderQuoteScheduleFields\("quote"\)\}/);
});

check("vehicle cards / Book Now stay hidden until complete quote", () => {
  assert.match(card, /quoteResultsReady && quoteStep === 1 &&/);
  assert.match(card, /!isScheduleComplete/);
  assert.match(card, /disabled=\{\s*submitted \|\|\s*!quoteChoicesReady \|\|\s*!isScheduleComplete/);
  assert.match(card, /failStep1\(\s*"missing_schedule"/);
  assert.match(card, /scrollQuoteStage\("quote-section-schedule"\)/);
  assert.match(card, /Choose your vehicle/);
  assert.doesNotMatch(card, /From £/);
});

const weekday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
  outboundDate: "2026-08-19",
  outboundTime: "10:00",
}, cityBfsMetrics);
assert.ok(weekday);
const weekdayFare = weekday.amount;

check("complete weekday daytime quote includes no surcharge", () => {
  assert.equal(weekdayFare, 44);
  assert.equal(weekday.premiumApplied, false);
  assert.equal(weekday.nightWeekendSurchargeGbp, 0);
});

check("weekday 21:59 normal; 22:00 / 05:59 include 10% in first price; 06:00 normal", () => {
  const cases: Array<[string, string, boolean]> = [
    ["2026-08-19", "21:59", false],
    ["2026-08-19", "22:00", true],
    ["2026-08-19", "05:59", true],
    ["2026-08-19", "06:00", false],
    ["2026-08-22", "12:00", true],
    ["2026-08-23", "12:00", true],
  ];
  for (const [date, time, expectPremium] of cases) {
    assert.equal(isTripPremiumDateTime(date, time), expectPremium, `${date} ${time}`);
    const quote = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
      outboundDate: date,
      outboundTime: time,
    }, cityBfsMetrics);
    assert.ok(quote);
    if (expectPremium) {
      assert.equal(quote.amount, roundGbp(weekdayFare * 1.1));
      assert.equal(quote.nightWeekendSurchargeGbp, 4.4);
    } else {
      assert.equal(quote.amount, weekdayFare);
      assert.equal(quote.nightWeekendSurchargeGbp, 0);
    }
  }
});

check("completed return + one qualifying leg only surcharges that leg", () => {
  const neither = calculateQuote(
    cityHall,
    "BFS",
    SALOON_VEHICLE,
    true,
    {
      outboundDate: "2026-08-21",
      outboundTime: "14:00",
      returnDate: "2026-08-25",
      returnTime: "10:00",
    },
    cityBfsMetrics,
  );
  const sundayReturn = calculateQuote(
    cityHall,
    "BFS",
    SALOON_VEHICLE,
    true,
    {
      outboundDate: "2026-08-21",
      outboundTime: "14:00",
      returnDate: "2026-08-23",
      returnTime: "15:00",
    },
    cityBfsMetrics,
  );
  assert.ok(neither && sundayReturn);
  assert.equal(neither.amount, 83.6);
  assert.equal(sundayReturn.amount, 88);
  assert.equal(sundayReturn.nightWeekendSurchargeGbp, 4.4);
});

check("first displayed price already includes surcharge copy", () => {
  assert.equal(QUOTE_INCLUDES_NIGHT_WEEKEND_SURCHARGE, "Includes 10% Night & Weekend Surcharge");
  assert.match(card, /QUOTE_INCLUDES_NIGHT_WEEKEND_SURCHARGE/);
  assert.match(card, /data-night-weekend-surcharge-badge/);
  assert.match(showcase, /surchargeNote/);
  assert.match(showcase, /data-night-weekend-surcharge-badge/);
});

check("changing schedule invalidates stale Worker fare before the new quote paints", () => {
  assert.match(card, /setServerFareParts\(null\)/);
  assert.match(
    card,
    /tripDate, tripTime, returnDate, returnTime, returnJourney/,
  );
  assert.match(card, /outboundDate: tripDate/);
  assert.match(card, /outboundTime: tripTime/);
  assert.match(card, /Calculating your fixed price/);
});

check("SumUp / Worker remain authoritative", () => {
  assert.match(payment, /never use client standardWebsiteAmount for SumUp amount/);
  assert.match(payment, /amount = resolved\.amount/);
  assert.match(payment, /composeWebsiteFareBreakdown/);
  assert.match(payment, /nightWeekendSurchargeGbp: authoritativeQuote.nightWeekendSurchargeGbp/);
});

check("wait copy is customer-facing", () => {
  assert.equal(QUOTE_PRICE_WAIT_FOR_SCHEDULE, "Enter your pickup date and time to see your fixed price.");
  assert.equal(QUOTE_PRICE_WAIT_FOR_DETAILS, "Complete your travel details to see your fixed price.");
  assert.match(card, /QUOTE_PRICE_WAIT_FOR_DETAILS/);
});

console.log("\nAll quote schedule / first-price-gate checks passed.");

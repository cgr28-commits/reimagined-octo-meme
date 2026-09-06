/**
 * Optional airport Express Drop-Off — shared pricing + QQ/PQ wiring.
 * Run: npx tsx scripts/check-express-drop-off.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  EXPRESS_DROP_OFF_FEES_GBP,
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
  EXPRESS_PICK_UP_REMOVED_EXPLANATION,
  canProceedWithoutExpressDropOff,
  composeFareWithExpressDropOff,
  expressAirportLegendLabel,
  expressAvoidedChargeMessage,
  expressDropOffBreakdownLabel,
  expressDropOffConfirmRemovalLabel,
  expressDropOffRecommendedLabel,
  expressDropOffRemoveLabel,
  expressDropOffRemovedExplanation,
  canProceedWithoutExpressDropOffLegs,
  formatAirportAccessOptionCustomerLine,
  formatAirportAccessOptionCustomerLines,
  formatAirportAccessOptionDashboardValue,
  formatAirportAccessOptionOwnerLine,
  formatExpressDropOffSummaryLine,
  parseCustomerExpressDropOffSelected,
  resolveExpressDropOff,
  resolveExpressDropOffLegs,
  shouldDefaultExpressSelectedOnNewEligibility,
  toExpressDropOffPersistedFields,
} from "../shared/express-drop-off";
import {
  describePersonalQuotePayment,
  resolvePersonalQuoteCheckoutAmount,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import {
  formatQuickQuoteAmount,
  resolveQuickQuoteCheckoutAmount,
  type QuickQuoteRecord,
} from "../shared/quick-quote";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { buildBookingMessage } from "../src/lib/booking-message";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("Central fees: BFS £5, BHD £4, DUB/LDY not charged", () => {
  assert.equal(EXPRESS_DROP_OFF_FEES_GBP.BFS, 5);
  assert.equal(EXPRESS_DROP_OFF_FEES_GBP.BHD, 4);
  assert.equal(resolveExpressDropOff({ airportCode: "DUB", fromAirport: false }).eligible, false);
  assert.equal(resolveExpressDropOff({ airportCode: "LDY", fromAirport: false }).eligible, false);
  assert.ok(read("src/lib/pricing-config.json").includes('"expressDropOffFeesGbp"'));
  assert.ok(read("src/lib/pricing-config.json").includes('"expressFreePickupConfigured"'));
  assert.ok(read("src/lib/pricing-config.json").includes('"BFS": 5'));
  assert.ok(read("src/lib/pricing-config.json").includes('"BHD": 4'));
});

check("BFS departure with Express Drop-Off: +£5", () => {
  const sel = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    selected: true,
  });
  assert.equal(sel.eligible, true);
  assert.equal(sel.service, "drop-off");
  assert.equal(sel.feeGbp, 5);
  assert.equal(sel.airportCode, "BFS");
  const total = composeFareWithExpressDropOff({
    transferFareGbp: 40,
    expressDropOffFeeGbp: sel.feeGbp,
  });
  assert.equal(total.transferFareGbp, 40);
  assert.equal(total.expressDropOffFeeGbp, 5);
  assert.equal(total.totalGbp, 45);
});

check("BFS departure without Express Drop-Off: +£0 (no transfer discount)", () => {
  const sel = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    selected: false,
  });
  assert.equal(sel.feeGbp, 0);
  const total = composeFareWithExpressDropOff({
    transferFareGbp: 40,
    expressDropOffFeeGbp: sel.feeGbp,
  });
  assert.equal(total.totalGbp, 40);
  assert.equal(total.transferFareGbp, 40);
});

check("BHD departure with Express Drop-Off: +£4", () => {
  const sel = resolveExpressDropOff({
    airportCode: "BHD",
    fromAirport: false,
    selected: true,
  });
  assert.equal(sel.feeGbp, 4);
  assert.equal(
    composeFareWithExpressDropOff({ transferFareGbp: 30, expressDropOffFeeGbp: 4 }).totalGbp,
    34,
  );
});

check("BHD departure without Express Drop-Off: +£0", () => {
  assert.equal(
    resolveExpressDropOff({ airportCode: "BHD", fromAirport: false, selected: false }).feeGbp,
    0,
  );
});

check("Airport pickup: Express Pick-Up eligible when free collection configured", () => {
  for (const code of ["BFS", "BHD"] as const) {
    const sel = resolveExpressDropOff({
      airportCode: code,
      fromAirport: true,
      selected: true,
    });
    assert.equal(sel.eligible, true);
    assert.equal(sel.service, "pick-up");
    assert.equal(sel.freeAlternativeAvailable, true);
    assert.equal(sel.feeGbp, EXPRESS_DROP_OFF_FEES_GBP[code]);
    assert.equal(sel.airportCode, code);

    const removed = resolveExpressDropOff({
      airportCode: code,
      fromAirport: true,
      selected: false,
    });
    assert.equal(removed.feeGbp, 0);
    assert.equal(removed.selected, false);
  }
});

check("Dublin Airport: no charge or eligibility", () => {
  const drop = resolveExpressDropOff({ airportCode: "DUB", fromAirport: false, selected: true });
  const pick = resolveExpressDropOff({ airportCode: "DUB", fromAirport: true, selected: true });
  assert.equal(drop.eligible, false);
  assert.equal(pick.eligible, false);
  assert.equal(drop.feeGbp, 0);
});

check("Return booking: charge Express independently on each applicable leg", () => {
  // Home → BFS → home: outbound drop-off + return pick-up
  const homeToAirport = resolveExpressDropOffLegs({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
  });
  assert.deepEqual(
    homeToAirport.map((l) => ({ leg: l.leg, service: l.service })),
    [
      { leg: "outbound", service: "drop-off" },
      { leg: "return", service: "pick-up" },
    ],
  );
  assert.equal(
    resolveExpressDropOff({
      airportCode: "BFS",
      fromAirport: false,
      returnJourney: true,
      selected: true,
    }).feeGbp,
    10,
  );

  // BFS → home → BFS: outbound pick-up + return drop-off
  const airportToHome = resolveExpressDropOffLegs({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: true,
  });
  assert.deepEqual(
    airportToHome.map((l) => ({ leg: l.leg, service: l.service })),
    [
      { leg: "outbound", service: "pick-up" },
      { leg: "return", service: "drop-off" },
    ],
  );
  assert.equal(
    resolveExpressDropOff({
      airportCode: "BHD",
      fromAirport: true,
      returnJourney: true,
      selected: true,
    }).feeGbp,
    8,
  );
});

check("Switching airports / direction removes obsolete drop-off-only assumption", () => {
  const bfs = toExpressDropOffPersistedFields(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: false, selected: true }),
  );
  assert.equal(bfs.expressDropOffFee, 5);
  assert.equal(bfs.expressDropOffAirport, "BFS");

  const pickup = toExpressDropOffPersistedFields(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: true }),
  );
  assert.equal(pickup.expressDropOffFee, 5);
  assert.equal(pickup.expressDropOffAirport, "BFS");
  assert.equal(pickup.expressDropOffSelected, true);

  const dub = toExpressDropOffPersistedFields(
    resolveExpressDropOff({ airportCode: "DUB", fromAirport: false, selected: true }),
  );
  assert.equal(dub.expressDropOffFee, 0);
  assert.equal(dub.expressDropOffAirport, null);
});

check("QQ and PQ compose the same transfer + express total", () => {
  const transfer = 52.5;
  const qq = composeFareWithExpressDropOff({
    transferFareGbp: transfer,
    expressDropOffFeeGbp: 5,
  });
  const pqPay = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: transfer,
    returnJourney: false,
    expressDropOffFee: 5,
  });
  assert.equal(qq.totalGbp, 57.5);
  assert.equal(pqPay, 57.5);

  const pqReturn = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: 50,
    returnJourney: true,
    expressDropOffFee: 5,
  });
  // Personally discounted / no standard → 2 × 50 + £5 express once
  assert.equal(pqReturn, 105);
});

check("Personal quote public summary + payment display carry Express fields", () => {
  const record: PersonalQuoteRecord = {
    code: "MQ-TEST01",
    customerName: "Test",
    agreedAmount: 40,
    singleUse: true,
    active: true,
    createdAt: new Date().toISOString(),
    expiresOn: "2099-01-01",
    expressDropOffSelected: true,
    expressDropOffFee: 5,
    expressDropOffAirport: "BFS",
    airportCode: "BFS",
    fromAirport: false,
  };
  const summary = toPersonalQuotePublicSummary(record);
  assert.equal(summary.expressDropOffSelected, true);
  assert.equal(summary.expressDropOffFee, 5);
  assert.equal(summary.expressDropOffAirport, "BFS");

  const display = describePersonalQuotePayment({
    agreedAmount: 40,
    returnJourney: false,
    expressDropOffSelected: true,
    expressDropOffFee: 5,
    expressDropOffAirport: "BFS",
  });
  assert.equal(display.paymentAmount, 45);
  assert.equal(display.expressDropOffFee, 5);
});

check("Breakdown / customer copy wording", () => {
  assert.equal(
    expressDropOffRecommendedLabel("BFS"),
    "Keep Express terminal drop-off — £5 (Recommended)",
  );
  assert.equal(
    expressDropOffRecommendedLabel("BHD"),
    "Keep Express terminal drop-off — £4 (Recommended)",
  );
  assert.equal(
    expressDropOffRecommendedLabel("BFS", "pick-up"),
    "Keep Express airport pick-up — £5 (Recommended)",
  );
  assert.equal(
    expressDropOffRecommendedLabel("BHD", "pick-up"),
    "Keep Express airport pick-up — £4 (Recommended)",
  );
  assert.equal(
    expressDropOffRemoveLabel("BFS"),
    "Use the designated free drop-off area and save £5",
  );
  assert.equal(
    expressDropOffRemoveLabel("BHD"),
    "Use the designated free drop-off area and save £4",
  );
  assert.equal(
    expressDropOffRemoveLabel("BFS", "pick-up"),
    "Meet your driver at the designated free pick-up area and save £5",
  );
  assert.equal(
    expressDropOffRemoveLabel("BHD", "pick-up"),
    "Meet your driver at the designated free pick-up area and save £4",
  );
  assert.equal(
    expressDropOffBreakdownLabel("BFS", true),
    "Belfast International Express Drop-Off: £5",
  );
  assert.equal(expressDropOffBreakdownLabel("BFS", false), "Free drop-off selected — you save £5");
  assert.equal(
    expressDropOffBreakdownLabel("BFS", true, "pick-up"),
    "Belfast International Express Pick-Up: £5",
  );
  assert.equal(expressAirportLegendLabel("pick-up"), "Airport Express Pick-Up");
  assert.equal(expressAirportLegendLabel("drop-off"), "Airport Express Drop-Off");
  assert.equal(expressAvoidedChargeMessage("pick-up"), "You’ve avoided the Express Pick-Up charge");
  assert.equal(expressAvoidedChargeMessage("drop-off"), "You’ve avoided the Express Drop-Off charge");
  assert.equal(
    expressDropOffBreakdownLabel("BHD", true, "pick-up"),
    "Belfast City Airport Express Pick-Up: £4",
  );
  assert.equal(
    expressDropOffBreakdownLabel("BHD", true, "drop-off"),
    "Belfast City Airport Express Drop-Off: £4",
  );
  assert.equal(
    expressDropOffBreakdownLabel("BFS", false, "pick-up"),
    "Free pick-up selected — you save £5",
  );
  assert.equal(
    EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
    "You’ll be dropped at the designated free drop-off area instead of Express Drop-Off. It’s only a short walk to the terminal.",
  );
  assert.equal(
    EXPRESS_PICK_UP_REMOVED_EXPLANATION,
    "You’ll meet your driver at the designated free pick-up area instead of Express Pick-Up. It’s only a short walk from the terminal.",
  );
  assert.equal(
    expressDropOffRemovedExplanation("drop-off"),
    EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
  );
  assert.equal(
    expressDropOffRemovedExplanation("pick-up"),
    EXPRESS_PICK_UP_REMOVED_EXPLANATION,
  );
  assert.equal(
    expressDropOffConfirmRemovalLabel("drop-off"),
    "I understand I will be dropped at the designated free drop-off area rather than the Express terminal.",
  );
  assert.equal(
    expressDropOffConfirmRemovalLabel("pick-up"),
    "I understand I will meet my driver at the designated free pick-up area rather than the Express terminal.",
  );
  // Direction comes from resolveExpressDropOff(...).service (fromAirport), not duplicate UI state.
  assert.equal(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: false }).service,
    "drop-off",
  );
  assert.equal(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: true }).service,
    "pick-up",
  );
  assert.doesNotMatch(read("shared/express-drop-off.ts"), /onward transfer/i);
  assert.doesNotMatch(read("src/components/ExpressDropOffSelector.tsx"), /onward transfer/i);
  assert.equal(
    EXPRESS_DROP_OFF_PASSED_ON_NOTE,
    "Airport-imposed Express access charges are passed on at cost with no markup.",
  );
  assert.equal(
    formatExpressDropOffSummaryLine({
      expressDropOffSelected: true,
      expressDropOffFee: 5,
      expressDropOffAirport: "BFS",
    }),
    "Belfast International Express Drop-Off: £5",
  );
  assert.equal(
    formatExpressDropOffSummaryLine({ expressDropOffAirport: "BFS" }),
    null,
  );
});

check("Quick Quote wiring: selector, compose on create, no hard-coded fees in UI", () => {
  const qq = read("src/app/quick-quote/QuickQuoteOwnerClient.tsx");
  assert.match(qq, /ExpressDropOffSelector/);
  assert.match(qq, /expressDropOffSelected/);
  assert.match(qq, /composeFareWithExpressDropOff/);
  assert.doesNotMatch(qq, /Express Drop-Off.*?£5/);
  assert.doesNotMatch(qq, /save £5/);

  const handler = read("workers/addresses/src/quick-quote-handlers.ts");
  assert.match(handler, /resolveExpressDropOff/);
  assert.match(handler, /composeFareWithExpressDropOff/);
  assert.match(handler, /expressDropOffFee/);
  // Server ignores client fee amounts — selection boolean only.
  assert.match(handler, /expressDropOffSelected !== false/);

  const book = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(book, /ExpressDropOffChoice/);
  assert.match(book, /mode="summary"/);
  assert.match(book, /canProceedWithoutExpressDropOff/);
  assert.match(book, /expressDropOffSelected:/);
  assert.match(book, /createPaymentCheckout\(/);
});

check("Personal Quote wiring: selector, persist, checkout + emails", () => {
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /ExpressDropOffSelector/);
  assert.match(panel, /expressDropOffSelected/);
  assert.match(panel, /toExpressDropOffPersistedFields/);

  const store = read("workers/addresses/src/personal-quote-store.ts");
  assert.match(store, /expressDropOffSelected/);
  assert.match(store, /expressDropOffFee/);
  assert.match(store, /expressDropOffAirport/);

  const handlers = read("workers/addresses/src/personal-quote-handlers.ts");
  assert.match(handlers, /resolveExpressDropOff/);
  assert.match(handlers, /selected: options\?\.expressDropOffSelected/);
  assert.match(handlers, /returnJourney: Boolean\(options\?\.returnJourney\)/);

  const customer = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(customer, /ExpressDropOffChoice/);
  assert.match(customer, /mode="summary"/);
  assert.match(customer, /canProceedWithoutExpressDropOff/);
  assert.match(customer, /expressDropOffSelected:/);

  const emails = read("shared/booking-notifications.ts");
  assert.match(emails, /formatExpressDropOffSummaryLine/);
  assert.match(emails, /EXPRESS_DROP_OFF_PASSED_ON_NOTE/);

  const bookingMsg = read("src/lib/booking-message.ts");
  assert.match(bookingMsg, /formatExpressDropOffSummaryLine/);
});

check("SumUp path re-resolves Express from customer choice (not browser fee)", () => {
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /resolveQuickQuoteCheckoutAmount/);
  assert.match(index, /parseCustomerExpressDropOffSelected/);
  assert.match(index, /expressDropOffSelected: customerExpressSelected/);
  assert.match(index, /saveQuickQuote/);
  assert.match(index, /resolvePersonalQuoteForPayment/);
  // Must not trust a client-supplied Express fee for SumUp.
  assert.doesNotMatch(index, /expressDropOffFee:\s*Number\(body\.expressDropOffFee/);

  const createPayment = read("src/lib/create-payment.ts");
  assert.match(createPayment, /expressDropOffSelected\?: boolean/);
  assert.match(createPayment, /expressDropOffSelected: request\.expressDropOffSelected/);

  const pq = read("shared/personal-quote.ts");
  assert.match(pq, /expressDropOffFeeGbp/);
  assert.match(pq, /composeFareWithExpressDropOff/);
});

check("Shared module mirrored into worker", () => {
  const shared = read("shared/express-drop-off.ts");
  const worker = read("workers/addresses/shared/express-drop-off.ts");
  assert.equal(shared, worker);
  assert.equal(read("shared/quick-quote.ts"), read("workers/addresses/shared/quick-quote.ts"));
});

check("QuoteCard shows Express under initial price; payment uses summary + Change", () => {
  const card = read("src/components/QuoteCard.tsx");
  const choice = read("src/components/ExpressDropOffChoice.tsx");

  // Exact order inside the fixed-price card: title → large price → Express → vehicle details.
  assert.match(
    card,
    /Your Fixed Journey Price[\s\S]*?quote-price-figure[\s\S]*?FixedPriceAssurance[\s\S]*?renderExpressChoiceInPriceCard[\s\S]*?Vehicle:/,
  );
  assert.match(card, /data-express-airport-choice/);
  assert.match(card, /renderExpressChoiceInPriceCard/);
  assert.match(card, /service=\{leg\.service\}|service=\{expressSelection\.service/);
  assert.match(card, /ExpressDropOffChoice/);
  assert.match(card, /pricedFare/);
  assert.match(card, /composeFareWithExpressDropOff/);
  assert.match(card, /resolveExpressDropOff/);
  assert.match(card, /expressDropOffSelected/);
  assert.match(card, /renderExpressChoiceInPriceCard\(quoteStep === 1 \? "full" : "summary"\)/);
  // Browser sends transfer fare + boolean — never trusts a client fee for SumUp.
  assert.match(card, /createPaymentCheckout\(\{/);
  assert.match(card, /journeyFareGbp/);
  assert.match(card, /airportAccessChargeGbp: expressSelection\.feeGbp/);
  assert.doesNotMatch(card, /claimFirstBookingOffer/);
  assert.doesNotMatch(card, /claimFirstBookingForCheckout/);
  assert.doesNotMatch(card, /FirstBookingOfferAdvert/);
  assert.doesNotMatch(card, /checkFirstBookingOfferEligibility/);
  assert.doesNotMatch(card, /advertiseFirstBookingOffer/);
  assert.match(card, /expressDropOffSelected: expressSelection\.eligible/);
  assert.match(card, /canProceedWithoutExpressDropOff/);
  // Persist selection across steps / drafts / Book Now + Save Quote.
  assert.match(card, /expressDropOffSelected:/);
  assert.match(card, /Book Now/);
  assert.match(card, /Save Quote/);
  assert.match(read("src/lib/booking-draft-storage.ts"), /expressDropOffSelected\?: boolean/);

  // Choice component: full under initial price; summary + Change on payment pages.
  assert.match(choice, /mode\?: "full" \| "summary"/);
  assert.match(choice, />\s*Change\s*</);
  assert.match(choice, /ExpressDropOffSelector/);
  assert.match(choice, /expressDropOffBreakdownLabel/);

  // Selector copy matches product wording (direction-aware).
  const selector = read("src/components/ExpressDropOffSelector.tsx");
  assert.match(selector, /expressDropOffRecommendedLabel/);
  assert.match(selector, /expressDropOffRemoveLabel/);
  assert.match(selector, /expressDropOffRemovedExplanation/);
  assert.match(selector, /role="radiogroup"/);
  assert.match(selector, /min-h-11/);
  assert.match(selector, /service/);
});

check("Removing Express reduces total immediately without changing transfer fare", () => {
  const transfer = 42;
  const withExpress = composeFareWithExpressDropOff({
    transferFareGbp: transfer,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BFS,
  });
  assert.equal(withExpress.transferFareGbp, 42);
  assert.equal(withExpress.expressDropOffFeeGbp, 5);
  assert.equal(withExpress.totalGbp, 47);

  const without = composeFareWithExpressDropOff({
    transferFareGbp: transfer,
    expressDropOffFeeGbp: 0,
  });
  assert.equal(without.transferFareGbp, 42);
  assert.equal(without.expressDropOffFeeGbp, 0);
  assert.equal(without.totalGbp, 42);
  assert.equal(without.totalGbp, withExpress.totalGbp - 5);
  assert.equal(expressDropOffBreakdownLabel("BFS", false), "Free drop-off selected — you save £5");

  const bhdWith = composeFareWithExpressDropOff({
    transferFareGbp: 30,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BHD,
  });
  const bhdWithout = composeFareWithExpressDropOff({
    transferFareGbp: 30,
    expressDropOffFeeGbp: 0,
  });
  assert.equal(bhdWith.totalGbp - bhdWithout.totalGbp, 4);
  assert.equal(bhdWithout.transferFareGbp, bhdWith.transferFareGbp);
  assert.equal(expressDropOffBreakdownLabel("BHD", false), "Free drop-off selected — you save £4");
});

check("Open website booking (QuoteCard) re-composes Express server-side", () => {
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /Open website booking \(QuoteCard\)/);
  assert.match(index, /composeFareWithExpressDropOff/);
  assert.match(index, /parseCustomerExpressDropOffSelected/);
  assert.match(index, /resolveExpressDropOff/);
  assert.match(index, /toExpressDropOffPersistedFields/);
  // Must not trust a client-supplied Express fee for open bookings either.
  assert.doesNotMatch(index, /expressDropOffFee:\s*Number\(body\.expressDropOffFee/);
});

check("Ineligible journeys hide Express (Dublin / non-airport); pickups stay eligible", () => {
  assert.equal(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: true }).eligible,
    true,
  );
  assert.equal(
    resolveExpressDropOff({ airportCode: "DUB", fromAirport: false, selected: true }).eligible,
    false,
  );
  assert.equal(
    resolveExpressDropOff({ airportCode: null, fromAirport: false, selected: true }).eligible,
    false,
  );
  // Changing airport to Dublin clears obsolete fee.
  const toAirport = resolveExpressDropOff({
    airportCode: "BHD",
    fromAirport: false,
    selected: true,
  });
  assert.equal(toAirport.feeGbp, 4);
  const dublin = resolveExpressDropOff({
    airportCode: "DUB",
    fromAirport: false,
    selected: true,
  });
  assert.equal(dublin.eligible, false);
  assert.equal(dublin.feeGbp, 0);
  assert.equal(toExpressDropOffPersistedFields(dublin).expressDropOffFee, 0);
});

check("Payment pages show saved Express selection with Change (not forced re-choice)", () => {
  const book = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  const pq = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  const choice = read("src/components/ExpressDropOffChoice.tsx");
  assert.match(book, /mode="summary"/);
  assert.match(book, /expressEditing/);
  assert.match(pq, /mode="summary"/);
  assert.match(pq, /expressEditing/);
  assert.match(choice, />\s*Change\s*</);
  assert.match(choice, />\s*Done\s*</);
});

check("Mobile: ticking free Express acknowledgement scrolls to Book Now", () => {
  const card = read("src/components/QuoteCard.tsx");
  const scrollLib = read("src/lib/quote-step-nav-scroll.ts");
  assert.match(scrollLib, /scheduleScrollToBookNowAfterExpressAck/);
  assert.match(scrollLib, /quote-book-now-button/);
  assert.match(scrollLib, /window\.scrollBy/);
  assert.match(scrollLib, /overflowBelowFoldPx/);
  assert.match(scrollLib, /active\.blur/);
  assert.doesNotMatch(
    scrollLib.match(
      /export function scheduleScrollToBookNowAfterExpressAck[\s\S]*?export function schedulePreciseResultsScroll/,
    )?.[0] ?? "",
    /scrollIntoView/,
  );
  // Gentle reveal only — no multi-retry smooth scroll stack (judder).
  assert.doesNotMatch(
    scrollLib.match(
      /export function scheduleScrollToBookNowAfterExpressAck[\s\S]*?export function schedulePreciseResultsScroll/,
    )?.[0] ?? "",
    /for \(const delay of/,
  );
  assert.match(card, /id="quote-book-now-button"/);
  assert.match(card, /scheduleScrollToBookNowAfterExpressAck/);
  assert.match(card, /expressRemovalAckWasCheckedRef/);
  assert.match(
    card,
    /justChecked = eitherAck && !expressRemovalAckWasCheckedRef[\s\S]*?scheduleScrollToBookNowAfterExpressAck/,
  );
});

check("Customer can remove Express on a Quick Quote booking link (display + total)", () => {
  const record: QuickQuoteRecord = {
    id: "a".repeat(48),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "open",
    journey: {
      pickupAddress: "12 Donegall Square, Belfast",
      dropoffAddress: "Belfast International Airport",
      airportCode: "BFS",
      fromAirport: false,
      returnJourney: false,
      outboundDate: "2026-09-01",
      outboundTime: "10:00",
      passengers: 2,
      suitcases: 2,
      expressDropOffSelected: true,
      expressDropOffFee: 5,
      expressDropOffAirport: "BFS",
    },
    quotedAmount: 45,
    quotedAmountLabel: "£45",
    calculatedAmount: 40,
    calculatedAmountLabel: "£40",
    discountType: "none",
    discountValue: 0,
    discountAmount: 0,
    pricingSource: "website-pricing-engine",
  };

  const withExpress = resolveQuickQuoteCheckoutAmount(record, true);
  assert.equal(withExpress.totalGbp, 45);
  assert.equal(withExpress.transferFareGbp, 40);
  assert.equal(withExpress.persisted.expressDropOffFee, 5);

  const without = resolveQuickQuoteCheckoutAmount(record, false);
  assert.equal(without.totalGbp, 40);
  assert.equal(without.transferFareGbp, 40);
  assert.equal(without.persisted.expressDropOffFee, 0);
  assert.equal(without.totalGbp, withExpress.totalGbp - 5);
  assert.equal(
    expressDropOffBreakdownLabel("BFS", false),
    "Free drop-off selected — you save £5",
  );

  // Tampered browser fee must be ignored — only boolean selection matters.
  assert.equal(parseCustomerExpressDropOffSelected(false), false);
  assert.equal(
    resolveQuickQuoteCheckoutAmount(record, parseCustomerExpressDropOffSelected(false)).totalGbp,
    40,
  );
});

check("Customer can remove Express on a Personal Quote link (display + total)", () => {
  const withExpress = describePersonalQuotePayment({
    agreedAmount: 40,
    returnJourney: false,
    expressDropOffSelected: true,
    expressDropOffFee: 5,
    expressDropOffAirport: "BFS",
  });
  assert.equal(withExpress.paymentAmount, 45);

  const without = describePersonalQuotePayment({
    agreedAmount: 40,
    returnJourney: false,
    expressDropOffSelected: false,
    expressDropOffFee: 0,
    expressDropOffAirport: "BFS",
  });
  assert.equal(without.paymentAmount, 40);
  assert.equal(without.paymentAmount, withExpress.paymentAmount - 5);

  const bhd = describePersonalQuotePayment({
    agreedAmount: 30,
    returnJourney: false,
    expressDropOffSelected: true,
    expressDropOffFee: resolveExpressDropOff({
      airportCode: "BHD",
      fromAirport: false,
      selected: true,
    }).feeGbp,
  });
  assert.equal(bhd.paymentAmount, 34);
  assert.equal(
    expressDropOffBreakdownLabel("BHD", false),
    "Free drop-off selected — you save £4",
  );
});

check("Payment is blocked until Express removal is acknowledged", () => {
  assert.equal(
    canProceedWithoutExpressDropOff({
      eligible: true,
      selected: false,
      removalAcknowledged: false,
    }),
    false,
  );
  assert.equal(
    canProceedWithoutExpressDropOff({
      eligible: true,
      selected: false,
      removalAcknowledged: true,
    }),
    true,
  );
  assert.equal(
    canProceedWithoutExpressDropOff({
      eligible: true,
      selected: true,
      removalAcknowledged: false,
    }),
    true,
  );
  assert.equal(
    canProceedWithoutExpressDropOff({
      eligible: false,
      selected: false,
      removalAcknowledged: false,
    }),
    true,
  );

  const book = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(book, /canProceedWithoutExpressDropOff/);
  assert.match(book, /free drop-off area before continuing without Express Drop-Off/);
  const pqPage = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(pqPage, /canProceedWithoutExpressDropOff/);
  assert.match(pqPage, /free drop-off area before continuing without Express Drop-Off/);
});

check("SumUp receives recalculated server-authoritative amount after customer remove", () => {
  const record: QuickQuoteRecord = {
    id: "b".repeat(48),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "open",
    journey: {
      pickupAddress: "Bangor",
      dropoffAddress: "George Best Belfast City Airport",
      airportCode: "BHD",
      fromAirport: false,
      returnJourney: false,
      outboundDate: "2026-09-02",
      outboundTime: "09:00",
      passengers: 1,
      suitcases: 1,
      expressDropOffSelected: true,
      expressDropOffFee: 4,
      expressDropOffAirport: "BHD",
    },
    quotedAmount: 34,
    quotedAmountLabel: "£34",
    calculatedAmount: 30,
    calculatedAmountLabel: "£30",
    pricingSource: "website-pricing-engine",
  };
  // Client might still send amount: 34 — server uses resolveQuickQuoteCheckoutAmount(false).
  const authoritative = resolveQuickQuoteCheckoutAmount(record, false);
  assert.equal(authoritative.totalGbp, 30);
  assert.equal(formatQuickQuoteAmount(authoritative.totalGbp), "£30");
  assert.notEqual(authoritative.totalGbp, record.quotedAmount);
});

check("From-airport Personal Quote uses Pick-Up Express on each return leg", () => {
  const oneWay = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: false,
    selected: true,
  });
  assert.equal(oneWay.feeGbp, 5);
  assert.equal(oneWay.service, "pick-up");

  const returnPickup = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: true,
    selected: true,
  });
  assert.equal(returnPickup.feeGbp, 10);
  assert.equal(returnPickup.service, "pick-up");
  assert.deepEqual(
    returnPickup.legs.map((l) => l.service),
    ["pick-up", "drop-off"],
  );

  const pay = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: 40,
    returnJourney: true,
    expressDropOffFee: returnPickup.feeGbp,
  });
  assert.equal(pay, 90);

  const homeToAirport = resolveExpressDropOff({
    airportCode: "BHD",
    fromAirport: false,
    returnJourney: true,
    selected: true,
  });
  assert.equal(homeToAirport.feeGbp, 8);
  assert.equal(homeToAirport.service, "drop-off");
  assert.deepEqual(
    homeToAirport.legs.map((l) => l.leg),
    ["outbound", "return"],
  );
});

check("BFS/BHD pickup already eligible — enabling return keeps Express selected", () => {
  const oneWayPickup = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: false,
    selected: true,
  });
  assert.equal(oneWayPickup.eligible, true);
  assert.equal(oneWayPickup.feeGbp, 5);
  assert.equal(toExpressDropOffPersistedFields(oneWayPickup).expressDropOffSelected, true);

  assert.equal(
    shouldDefaultExpressSelectedOnNewEligibility({
      wasEligible: oneWayPickup.eligible,
      nowEligible: true,
    }),
    false,
  );

  const afterReturn = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: true,
    selected: true,
  });
  assert.equal(afterReturn.eligible, true);
  assert.equal(afterReturn.feeGbp, 10);
  assert.equal(afterReturn.service, "pick-up");

  const bhd = resolveExpressDropOff({
    airportCode: "BHD",
    fromAirport: true,
    returnJourney: true,
    selected: true,
  });
  assert.equal(bhd.feeGbp, 8);

  const display = describePersonalQuotePayment({
    agreedAmount: 40,
    returnJourney: true,
    expressDropOffSelected: true,
    expressDropOffFee: afterReturn.feeGbp,
    expressDropOffAirport: "BFS",
  });
  assert.equal(display.paymentAmount, 90);

  assert.equal(
    shouldDefaultExpressSelectedOnNewEligibility({
      wasEligible: true,
      nowEligible: true,
    }),
    false,
  );

  const pqPage = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(pqPage, /shouldDefaultExpressSelectedOnNewEligibility/);
  assert.match(pqPage, /expressWasEligibleRef/);
});

check("Emails and booking records show the customer’s final Express choice", () => {
  const removedBooking = {
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport transfer",
    pickupLabel: "Belfast city centre",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    estimatedPrice: "£40.00",
    isAirportTrip: true,
    airportCode: "BFS",
    isFromAirport: false,
    expressDropOffSelected: false,
    expressDropOffFee: 0,
    expressDropOffAirport: "BFS" as const,
    termsAcceptedAt: new Date().toISOString(),
  };

  const enquiry = buildBookingMessage(removedBooking);
  assert.match(enquiry, /Airport access option: Free designated drop-off area/);
  assert.match(enquiry, /Free drop-off selected — you save £5/);
  assert.match(enquiry, /Airport-imposed Express access charges are passed on at cost with no markup/);

  const receipt: PaidBookingReceipt = {
    ...removedBooking,
    amountPaid: "£40.00",
    paymentReference: "PAY-TEST",
    customerReference: "MAT-1001",
  };
  const customerEmail = buildCustomerConfirmationEmail(receipt);
  assert.match(customerEmail.text, /Airport access option: Free designated drop-off area/);
  assert.match(customerEmail.html, /Airport access option/);
  assert.match(customerEmail.html, /Free designated drop-off area/);
  const ownerEmail = buildOwnerPaidBookingEmail(receipt);
  assert.match(ownerEmail.body, /AIRPORT ACCESS: FREE DROP-OFF AREA/);
  assert.match(ownerEmail.body, /Airport access option: Free designated drop-off area/);

  const keptExpressBooking = {
    ...removedBooking,
    expressDropOffSelected: true,
    expressDropOffFee: 5,
  };
  const keptReceipt: PaidBookingReceipt = {
    ...keptExpressBooking,
    amountPaid: "£45.00",
    paymentReference: "PAY-EXPRESS",
    customerReference: "MAT-1002",
  };
  const keptCustomer = buildCustomerConfirmationEmail(keptReceipt);
  assert.match(keptCustomer.text, /Airport access option: Express Drop-Off — £5/);
  assert.match(keptCustomer.html, /Express Drop-Off — £5/);
  const keptOwner = buildOwnerPaidBookingEmail(keptReceipt);
  assert.match(keptOwner.body, /AIRPORT ACCESS: EXPRESS — £5 PAID/);

  // Switching Free → Express before payment stores the final selection.
  const switched = formatAirportAccessOptionCustomerLine({
    expressDropOffSelected: true,
    expressDropOffFee: 5,
    expressDropOffAirport: "BFS",
    fromAirport: false,
  });
  assert.equal(switched, "Airport access option: Express Drop-Off — £5");
  assert.equal(
    formatAirportAccessOptionOwnerLine({
      expressDropOffSelected: false,
      expressDropOffFee: 0,
      expressDropOffAirport: "BFS",
      fromAirport: false,
    }),
    "AIRPORT ACCESS: FREE DROP-OFF AREA",
  );

  const kept = formatExpressDropOffSummaryLine({
    expressDropOffSelected: true,
    expressDropOffFee: 4,
    expressDropOffAirport: "BHD",
  });
  assert.equal(kept, "Belfast City Airport Express Drop-Off: £4");
});

check("Paid booking record + confirmation page persist airport access option", () => {
  const record = read("shared/paid-booking-record.ts");
  const canonical = read("shared/paid-booking-canonical.ts");
  const save = read("workers/addresses/src/refund-handlers.ts");
  const confirmed = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
  const express = read("shared/express-drop-off.ts");

  assert.match(record, /expressDropOffSelected\?:/);
  assert.match(record, /airportAccessOption\?:/);
  assert.match(canonical, /expressDropOffSelected/);
  assert.match(canonical, /airportAccessOption/);
  assert.match(save, /expressDropOffSelected: input\.booking\.expressDropOffSelected/);
  assert.match(save, /airportAccessOption:/);
  assert.match(confirmed, /formatAirportAccessOptionCustomerLine/);
  assert.match(express, /formatAirportAccessOptionCustomerLine/);
  assert.match(express, /formatAirportAccessOptionOwnerLine/);
  assert.match(express, /formatAirportAccessOptionDashboardValue/);
  assert.match(express, /resolveAirportAccessOption/);
});

check("Owner dashboard surfaces paid vs free airport access", () => {
  const handlers = read("workers/addresses/src/paid-booking-handlers.ts");
  const api = read("src/lib/paid-bookings-api.ts");
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");

  assert.match(handlers, /expressDropOffSelected:/);
  assert.match(handlers, /expressDropOffFee:/);
  assert.match(handlers, /expressDropOffAirport:/);
  assert.match(handlers, /airportAccessOption:/);
  assert.match(api, /expressDropOffSelected\?:/);
  assert.match(api, /airportAccessOption\?:/);
  assert.match(panel, /formatAirportAccessOptionDashboardValue/);
  assert.match(panel, /Airport access/);
  assert.match(panel, /airportAccessLabel/);

  assert.equal(
    formatAirportAccessOptionDashboardValue({
      expressDropOffSelected: true,
      expressDropOffFee: 5,
      expressDropOffAirport: "BFS",
    }),
    "Express — £5 paid",
  );
  assert.equal(
    formatAirportAccessOptionDashboardValue({
      expressDropOffSelected: false,
      expressDropOffFee: 0,
      expressDropOffAirport: "BFS",
    }),
    "Free drop-off area",
  );
  assert.equal(
    formatAirportAccessOptionDashboardValue({
      expressDropOffSelected: false,
      expressDropOffFee: 0,
      expressDropOffAirport: "BFS",
      fromAirport: true,
    }),
    "Free pick-up area",
  );
  assert.equal(
    formatAirportAccessOptionDashboardValue({
      expressDropOffAirport: null,
    }),
    null,
  );
});

check("A–J: single vs return Express legs, 5% on taxi only, independent selections", () => {
  const oneWayFare = 40;
  const returnTaxiFare = 76; // 2 × 40 × 0.95
  const returnSaving = 4;

  // A. Single journey to airport – Express selected
  const a = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    selected: true,
  });
  assert.equal(a.legs.length, 1);
  assert.equal(a.feeGbp, 5);
  assert.equal(
    composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: oneWayFare,
      airportAccessChargeGbp: a.feeGbp,
    }).finalAmountPayableGbp,
    45,
  );

  // B. Single journey to airport – free drop-off selected
  const b = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    selected: false,
  });
  assert.equal(b.feeGbp, 0);
  assert.equal(
    composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: oneWayFare,
      airportAccessChargeGbp: b.feeGbp,
    }).finalAmountPayableGbp,
    40,
  );

  // C. Return – Express on both legs
  const c = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
    outboundSelected: true,
    returnSelected: true,
  });
  assert.equal(c.outboundFeeGbp, 5);
  assert.equal(c.returnFeeGbp, 5);
  assert.equal(c.feeGbp, 10);
  const cFare = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: returnTaxiFare,
    airportAccessChargeGbp: c.feeGbp,
    outboundAirportAccessChargeGbp: c.outboundFeeGbp,
    returnAirportAccessChargeGbp: c.returnFeeGbp,
    returnJourney: true,
  });
  assert.equal(cFare.returnJourneySavingGbp, returnSaving);
  assert.equal(cFare.finalAmountPayableGbp, 86);

  // D. Return – free on both legs
  const d = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
    outboundSelected: false,
    returnSelected: false,
  });
  assert.equal(d.feeGbp, 0);
  assert.equal(
    composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: returnTaxiFare,
      airportAccessChargeGbp: 0,
      returnJourney: true,
    }).finalAmountPayableGbp,
    76,
  );

  // E. Return – Express outbound / free return
  const e = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
    outboundSelected: true,
    returnSelected: false,
  });
  assert.equal(e.outboundFeeGbp, 5);
  assert.equal(e.returnFeeGbp, 0);
  assert.equal(e.feeGbp, 5);
  const eFare = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: returnTaxiFare,
    airportAccessChargeGbp: e.feeGbp,
    outboundAirportAccessChargeGbp: e.outboundFeeGbp,
    returnAirportAccessChargeGbp: e.returnFeeGbp,
    returnJourney: true,
  });
  assert.equal(eFare.returnJourneySavingGbp, returnSaving);
  assert.equal(eFare.finalAmountPayableGbp, 81);

  // F. Return – free outbound / Express return
  const f = resolveExpressDropOff({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
    outboundSelected: false,
    returnSelected: true,
  });
  assert.equal(f.outboundFeeGbp, 0);
  assert.equal(f.returnFeeGbp, 5);
  assert.equal(f.feeGbp, 5);
  assert.equal(f.outboundSelected, false);
  assert.equal(f.returnSelected, true);

  // G. Return where only one leg has an airport charge (DUB never Express-eligible)
  const g = resolveExpressDropOff({
    airportCode: "DUB",
    fromAirport: false,
    returnJourney: true,
    selected: true,
  });
  assert.equal(g.eligible, false);
  assert.equal(g.feeGbp, 0);
  assert.equal(g.legs.length, 0);

  // H + I. 5% saving is on taxi fare only; airport fees added at full value after
  assert.equal(cFare.originalEligibleJourneyPriceGbp, 80);
  assert.equal(cFare.journeyFareBeforePromotionsGbp, 76);
  assert.equal(cFare.returnJourneySavingGbp, 4);
  assert.equal(cFare.airportAccessChargeGbp, 10);
  assert.equal(cFare.totalPromotionalSavingGbp, 4);
  assert.equal(cFare.finalAmountPayableGbp, 80 - 4 + 10);

  // J. Changing one leg does not change the other
  assert.equal(e.outboundSelected, true);
  assert.equal(e.returnSelected, false);
  assert.equal(f.outboundSelected, false);
  assert.equal(f.returnSelected, true);
  assert.ok(
    canProceedWithoutExpressDropOffLegs(c, { outbound: false, return: false }),
  );
  assert.equal(
    canProceedWithoutExpressDropOffLegs(e, { outbound: false, return: false }),
    false,
  );
  assert.ok(
    canProceedWithoutExpressDropOffLegs(e, { outbound: false, return: true }),
  );

  const lines = formatAirportAccessOptionCustomerLines({
    expressDropOffAirport: "BFS",
    fromAirport: false,
    returnJourney: true,
    outboundExpressDropOffSelected: true,
    returnExpressDropOffSelected: false,
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /Outbound airport access: Express Drop-Off/);
  assert.match(lines[1]!, /Return airport access: Free designated pick-up/);

  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /returnExpressDropOffSelected/);
  assert.match(card, /CombinedAirportAccessChoice/);
  assert.match(card, /combinedFreeAlternativeAvailable/);
  assert.match(card, /canProceedWithoutExpressDropOffLegs/);
  assert.match(card, /outboundExpressDropOffSelected/);
  assert.match(card, /returnAirportAccessChargeGbp/);

  // Return journey shows one combined "Airport access" choice (not two
  // separate per-leg selectors) — see CombinedAirportAccessChoice.tsx.
  const combinedChoice = read("src/components/CombinedAirportAccessChoice.tsx");
  assert.match(combinedChoice, /Airport access \(return\)/);
  const combinedSelector = read("src/components/CombinedAirportAccessSelector.tsx");
  assert.match(combinedSelector, /Airport access</);
  assert.match(combinedSelector, /COMBINED_AIRPORT_ACCESS_RETURN_NOTE/);
  const expressShared = read("shared/express-drop-off.ts");
  assert.match(
    expressShared,
    /your selection applies to both your outbound and return airport journeys/,
  );
});

console.log("\nAll Express Drop-Off checks passed.");

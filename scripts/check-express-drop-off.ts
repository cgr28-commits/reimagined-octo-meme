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
  composeFareWithExpressDropOff,
  expressDropOffBreakdownLabel,
  expressDropOffRecommendedLabel,
  expressDropOffRemoveLabel,
  formatExpressDropOffSummaryLine,
  resolveExpressDropOff,
  resolveExpressDropOffLegs,
  toExpressDropOffPersistedFields,
} from "../shared/express-drop-off";
import {
  describePersonalQuotePayment,
  resolvePersonalQuoteCheckoutAmount,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";

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

check("Airport pickup: no charge or eligibility", () => {
  for (const code of ["BFS", "BHD"] as const) {
    const sel = resolveExpressDropOff({
      airportCode: code,
      fromAirport: true,
      selected: true,
    });
    assert.equal(sel.eligible, false);
    assert.equal(sel.feeGbp, 0);
    assert.equal(sel.airportCode, null);
  }
});

check("Dublin Airport: no charge or eligibility", () => {
  const drop = resolveExpressDropOff({ airportCode: "DUB", fromAirport: false, selected: true });
  const pick = resolveExpressDropOff({ airportCode: "DUB", fromAirport: true, selected: true });
  assert.equal(drop.eligible, false);
  assert.equal(pick.eligible, false);
  assert.equal(drop.feeGbp, 0);
});

check("Return booking: charge only eligible airport-bound legs", () => {
  // Home → BFS → home: outbound drop-off only
  const homeToAirport = resolveExpressDropOffLegs({
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: true,
  });
  assert.deepEqual(
    homeToAirport.map((l) => l.leg),
    ["outbound"],
  );
  assert.equal(
    resolveExpressDropOff({
      airportCode: "BFS",
      fromAirport: false,
      returnJourney: true,
      selected: true,
    }).feeGbp,
    5,
  );

  // BFS → home → BFS: return leg drop-off only
  const airportToHome = resolveExpressDropOffLegs({
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: true,
  });
  assert.deepEqual(
    airportToHome.map((l) => l.leg),
    ["return"],
  );
  assert.equal(
    resolveExpressDropOff({
      airportCode: "BHD",
      fromAirport: true,
      returnJourney: true,
      selected: true,
    }).feeGbp,
    4,
  );
});

check("Switching airports removes obsolete charge", () => {
  const bfs = toExpressDropOffPersistedFields(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: false, selected: true }),
  );
  assert.equal(bfs.expressDropOffFee, 5);
  assert.equal(bfs.expressDropOffAirport, "BFS");

  const pickup = toExpressDropOffPersistedFields(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: true }),
  );
  assert.equal(pickup.expressDropOffFee, 0);
  assert.equal(pickup.expressDropOffAirport, null);
  assert.equal(pickup.expressDropOffSelected, false);

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
    "Express terminal drop-off — £5 (Recommended)",
  );
  assert.equal(
    expressDropOffRecommendedLabel("BHD"),
    "Express terminal drop-off — £4 (Recommended)",
  );
  assert.equal(expressDropOffRemoveLabel("BFS"), "Remove Express Drop-Off and save £5");
  assert.equal(expressDropOffRemoveLabel("BHD"), "Remove Express Drop-Off and save £4");
  assert.equal(
    expressDropOffBreakdownLabel("BFS", true),
    "Belfast International Express Drop-Off: £5",
  );
  assert.equal(expressDropOffBreakdownLabel("BFS", false), "Express Drop-Off removed: −£5");
  assert.equal(
    EXPRESS_DROP_OFF_PASSED_ON_NOTE,
    "Airport access charges are passed on at cost.",
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
  assert.match(book, /expressDropOffBreakdownLabel/);
  assert.match(book, /EXPRESS_DROP_OFF_PASSED_ON_NOTE/);
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
  assert.match(handlers, /expressDropOffFee: evaluated\.record\.expressDropOffFee/);

  const customer = read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx");
  assert.match(customer, /expressDropOffFee/);
  assert.match(customer, /EXPRESS_DROP_OFF_PASSED_ON_NOTE/);

  const emails = read("shared/booking-notifications.ts");
  assert.match(emails, /formatExpressDropOffSummaryLine/);
  assert.match(emails, /EXPRESS_DROP_OFF_PASSED_ON_NOTE/);

  const bookingMsg = read("src/lib/booking-message.ts");
  assert.match(bookingMsg, /formatExpressDropOffSummaryLine/);
});

check("SumUp path uses quotedAmount / checkout amount with Express included", () => {
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /amount = Math\.round\(record\.quotedAmount \* 100\) \/ 100/);
  assert.match(index, /expressDropOffSelected/);
  assert.match(index, /expressDropOffFee/);

  const pq = read("shared/personal-quote.ts");
  assert.match(pq, /expressDropOffFeeGbp/);
  assert.match(pq, /composeFareWithExpressDropOff/);
});

check("Shared module mirrored into worker", () => {
  const shared = read("shared/express-drop-off.ts");
  const worker = read("workers/addresses/shared/express-drop-off.ts");
  assert.equal(shared, worker);
});

check("QuoteCard stays free of Express Drop-Off owner UI", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(card, /ExpressDropOffSelector/);
  assert.doesNotMatch(card, /expressDropOffSelected/);
});

console.log("\nAll Express Drop-Off checks passed.");

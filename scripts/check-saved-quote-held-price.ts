/**
 * Save My Quote held price: a dated saved quote books at exactly the price shown,
 * held until the saved quote's expiry (default 7 days), never past pickup, and only
 * 2 hours when pickup is under 24h away. Pure logic + email/share copy; no network.
 */
import assert from "node:assert/strict";
import {
  SAVED_QUOTE_ADD_SCHEDULE_COPY,
  SAVED_QUOTE_MIN_HOLD_SECONDS,
  activeSavedQuoteHeldPrice,
  computeSavedQuoteHoldSeconds,
  savedQuoteHasSchedule,
  toSavedQuotePublicSummary,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import {
  buildSavedQuoteFinalReminderEmail,
  buildSavedQuoteFirstReminderEmail,
  buildSavedQuoteInitialEmail,
} from "../shared/saved-quote-emails";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import {
  alignQuickQuoteToSavedPrice,
  savedQuoteHoldEligible,
  savedQuoteQuickQuoteBody,
} from "../workers/addresses/src/saved-quote-handlers";
import { resolveQuickQuoteCheckoutAmount, type QuickQuoteRecord } from "../shared/quick-quote";
import { saveQuoteIntroCopy, savedQuoteWhatsAppUrl } from "../src/lib/saved-quote-share";
import type { SaveQuoteResult } from "../src/lib/saved-quote-api";

const HOUR = 3600;
const DAY = 24 * HOUR;
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

/** London wall-clock date/time `hours` after `now`. */
function londonAt(now: Date, hours: number): { tripDate: string; tripTime: string } {
  const at = new Date(now.getTime() + hours * HOUR * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { tripDate: `${get("year")}-${get("month")}-${get("day")}`, tripTime: `${get("hour")}:${get("minute")}` };
}

const now = new Date("2026-11-02T10:00:00Z"); // GMT, so London = UTC

check("no hold without a pickup date and time", () => {
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "", tripTime: "", now }), null);
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "2026-11-20", tripTime: "", now }), null);
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "", tripTime: "12:00", now }), null);
  assert.equal(
    computeSavedQuoteHoldSeconds({ tripDate: "2026-11-20", tripTime: "12:00", returnJourney: true, now }),
    null,
    "return journey needs its return date/time too",
  );
  assert.equal(savedQuoteHasSchedule({ tripDate: "2026-11-20", tripTime: "12:00", returnJourney: false }), true);
});

check("far-off pickup: held for the saved quote validity (default 7 days)", () => {
  const far = { tripDate: "2026-11-30", tripTime: "12:00", now };
  assert.equal(computeSavedQuoteHoldSeconds(far), 7 * DAY);
  assert.equal(computeSavedQuoteHoldSeconds({ ...far, validityDays: 3 }), 3 * DAY);
  assert.equal(computeSavedQuoteHoldSeconds({ ...far, validityDays: 30 }), 7 * DAY, "validity is capped at 7 days");
  assert.equal(
    computeSavedQuoteHoldSeconds({ ...far, returnJourney: true, returnDate: "2026-12-04", returnTime: "09:00" }),
    7 * DAY,
  );
});

check("hold never runs past the pickup time", () => {
  const pickup = londonAt(now, 72); // 3 days away
  assert.equal(computeSavedQuoteHoldSeconds({ ...pickup, now }), 72 * HOUR);
  const justOver = londonAt(now, 25);
  assert.equal(computeSavedQuoteHoldSeconds({ ...justOver, now }), 25 * HOUR);
});

check("pickup under 24h away: held for 2 hours only", () => {
  assert.equal(computeSavedQuoteHoldSeconds({ ...londonAt(now, 23), now }), 2 * HOUR);
  assert.equal(computeSavedQuoteHoldSeconds({ ...londonAt(now, 5), now }), 2 * HOUR);
  assert.equal(computeSavedQuoteHoldSeconds({ ...londonAt(now, 1), now }), 1 * HOUR, "2h but never past pickup");
  assert.equal(computeSavedQuoteHoldSeconds({ ...londonAt(now, 0.1), now }), null, "pickup imminent: no hold");
  assert.ok(SAVED_QUOTE_MIN_HOLD_SECONDS >= 60, "never below the Quick Quote 60s TTL floor");
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "2026-11-01", tripTime: "09:00", now }), null, "past pickup");
});

check("pickup time is UK local time (BST)", () => {
  const summer = new Date("2026-07-01T08:00:00Z"); // 09:00 BST
  const pickup = parseLondonLocalDateTime("2026-07-02", "09:00")!;
  assert.equal(pickup.toISOString(), "2026-07-02T08:00:00.000Z");
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "2026-07-02", tripTime: "09:00", now: summer }), 24 * HOUR);
  assert.equal(computeSavedQuoteHoldSeconds({ tripDate: "2026-07-02", tripTime: "08:59", now: summer }), 2 * HOUR);
});

const journey = {
  pickupLabel: "Belfast City Hall, Belfast BT1 5GS",
  dropoffLabel: "Belfast International Airport",
  airportCode: "BFS",
  isAirportTrip: true,
  isFromAirport: false,
  tripDate: "2026-11-30",
  tripTime: "12:00",
  returnJourney: false,
  passengers: 2,
  suitcases: 1,
  vehicle: "Standard Saloon (1–4 passengers)",
  tripLabel: "Airport transfer",
  outboundAirportAccessChoice: "free" as const,
  returnAirportAccessChoice: "free" as const,
};

check("Business Class / executive, minibus and Meet & Greet keep the recalculated flow", () => {
  assert.equal(savedQuoteHoldEligible(journey), true);
  assert.equal(savedQuoteHoldEligible({ ...journey, vehicle: "Executive Saloon (1–4 passengers)" }), false);
  assert.equal(savedQuoteHoldEligible({ ...journey, vehicle: "Business Class" }), false);
  assert.equal(savedQuoteHoldEligible({ ...journey, vehicle: "Minibus (5–7 passengers)" }), false);
  assert.equal(savedQuoteHoldEligible({ ...journey, optionalMeetGreetSelected: true }), false);
  assert.equal(savedQuoteHoldEligible({ ...journey, outboundAirportAccessChoice: "meet-greet" }), false);
});

check("Quick Quote body: website engine, held TTL, express only when chosen", () => {
  const body = savedQuoteQuickQuoteBody(journey, 7 * DAY);
  assert.equal(body.priceSource, "website-pricing-engine");
  assert.equal(body.ttlSeconds, 7 * DAY);
  assert.equal(body.validityMode, undefined);
  assert.equal(body.expressDropOffSelected, false);
  assert.equal(body.outboundDate, "2026-11-30");
  assert.equal(body.journeyMode, "one-way");
  assert.equal(savedQuoteQuickQuoteBody({ ...journey, outboundAirportAccessChoice: "express" }, HOUR).expressDropOffSelected, true);
});

const qq = (quoted: number, calculated: number, express = false): QuickQuoteRecord => ({
  id: "a".repeat(48),
  journey: {
    pickupAddress: journey.pickupLabel, dropoffAddress: journey.dropoffLabel, airportCode: "BFS", fromAirport: false,
    returnJourney: false, outboundDate: "2026-11-30", outboundTime: "12:00", passengers: 2, suitcases: 1,
    expressDropOffSelected: express, expressDropOffFee: express ? quoted - calculated : 0, expressDropOffAirport: express ? "BFS" : undefined,
  } as QuickQuoteRecord["journey"],
  quotedAmount: quoted, quotedAmountLabel: `£${quoted}`, calculatedAmount: calculated, calculatedAmountLabel: `£${calculated}`,
  discountType: "none", discountValue: 0, discountAmount: 0, pricingSource: "website-pricing-engine",
  createdByOwner: false, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * DAY * 1000).toISOString(), status: "open",
} as QuickQuoteRecord);

check("Quick Quote aligned to the exact price shown (pound rounding only)", () => {
  const same = qq(103, 103);
  assert.equal(alignQuickQuoteToSavedPrice(same, 103), same, "already equal: unchanged");
  const rounded = alignQuickQuoteToSavedPrice(qq(102.6, 102.6), 103)!;
  assert.equal(rounded.quotedAmount, 103);
  assert.equal(rounded.quotedAmountLabel, "£103");
  assert.equal(rounded.calculatedAmount, 103);
  assert.equal(resolveQuickQuoteCheckoutAmount(rounded, false).totalGbp, 103, "checkout charges the held price");
  assert.equal(alignQuickQuoteToSavedPrice(qq(90, 90), 103), null, "real price difference: no hold");
  assert.equal(alignQuickQuoteToSavedPrice(qq(104.2, 104.2), 103), null);
});

const heldUntil = new Date(now.getTime() + 7 * DAY * 1000).toISOString();
const record: SavedQuoteRecord = {
  id: "1".repeat(24),
  reference: "MAT-261102-1000-ABCD",
  token: "b".repeat(48),
  customerName: "Sam Test",
  customerEmail: "sam@example.invalid",
  journey,
  pricing: { totalAmount: 103, currency: "GBP", amountLabel: "£103.00" },
  status: "saved",
  createdAt: now.toISOString(),
  expiresAt: heldUntil,
  heldPrice: {
    quickQuoteId: "c".repeat(48),
    bookingUrl: `https://www.myairporttaxini.co.uk/book-quote/?id=${"c".repeat(48)}`,
    amount: 103,
    amountLabel: "£103",
    heldUntil,
  },
};

check("emails: Book now uses the held link, says held until <date>, no surcharge", () => {
  const emails = [
    buildSavedQuoteInitialEmail(record, { now }),
    buildSavedQuoteFirstReminderEmail(record, { now }),
    buildSavedQuoteFinalReminderEmail(record, { now }),
  ];
  for (const email of emails) {
    assert.ok(email.text.includes("Book now at £103"), email.subject);
    assert.ok(email.text.includes(record.heldPrice!.bookingUrl));
    assert.match(email.text, /Your price of £103 is held until \w{3}, \d{1,2} \w{3} 2026/);
    assert.ok(email.html.includes(`href="${record.heldPrice!.bookingUrl}"`), "HTML button links to held price");
    assert.ok(email.html.includes("Book now at £103"));
    assert.doesNotMatch(email.text + email.html, /surcharge|recalculated/i);
  }
  assert.ok(emails[0].text.includes("/quote/#t="), "secondary link to view or change the quote");
});

check("emails: held price expired → back to the saved-quote link", () => {
  const later = new Date(Date.parse(heldUntil) + 1000);
  assert.equal(activeSavedQuoteHeldPrice(record, later), undefined);
  const email = buildSavedQuoteFinalReminderEmail(record, { now: later });
  assert.doesNotMatch(email.text, /book-quote|held until/);
  assert.equal(toSavedQuotePublicSummary(record, undefined, later).heldPrice, undefined);
  assert.equal(toSavedQuotePublicSummary(record, undefined, now).heldPrice?.bookingUrl, record.heldPrice!.bookingUrl);
});

check("emails: no date/time → 'Add your date and time to see your fixed price'", () => {
  const undated: SavedQuoteRecord = { ...record, journey: { ...journey, tripDate: "", tripTime: "" }, heldPrice: undefined };
  for (const email of [
    buildSavedQuoteInitialEmail(undated, { now }),
    buildSavedQuoteFirstReminderEmail(undated, { now }),
    buildSavedQuoteFinalReminderEmail(undated, { now }),
  ]) {
    assert.ok(email.text.includes(SAVED_QUOTE_ADD_SCHEDULE_COPY), email.subject);
    assert.doesNotMatch(email.text, /held until|Book now at|fixed price:/i);
    assert.ok(email.text.includes("/quote/#t="));
    assert.doesNotMatch(email.text + email.html, /surcharge/i);
  }
});

const saveResult = (r: SavedQuoteRecord): SaveQuoteResult => {
  const summary = toSavedQuotePublicSummary(r, undefined, now);
  return {
    ok: true, token: r.token, reference: r.reference, expiresAt: r.expiresAt, expiresAtLabel: summary.expiresAtLabel,
    amount: summary.amount, amountLabel: summary.amountLabel, currency: "GBP", email: "", emailSent: false,
    quoteUrl: summary.bookUrl, priceHeld: Boolean(summary.heldPrice), heldPrice: summary.heldPrice, quote: summary,
  };
};

check("WhatsApp share text uses the held booking link", () => {
  const text = new URL(savedQuoteWhatsAppUrl(saveResult(record), true)).searchParams.get("text")!;
  assert.ok(text.includes(`Book at this price: ${record.heldPrice!.bookingUrl}`));
  assert.match(text, /Fixed price: £103 \(held until /);
  assert.doesNotMatch(text, /recalculated|surcharge/i);
  const undated = saveResult({ ...record, journey: { ...journey, tripDate: "", tripTime: "" }, heldPrice: undefined });
  const undatedText = new URL(savedQuoteWhatsAppUrl(undated, false)).searchParams.get("text")!;
  assert.ok(undatedText.includes(SAVED_QUOTE_ADD_SCHEDULE_COPY));
  assert.doesNotMatch(undatedText, /book-quote/);
});

check("Save modal copy: held price and date, never 'recalculated' when held", () => {
  const held = saveQuoteIntroCopy(saveResult(record), 7);
  assert.match(held, /^Your price of £103 is held until .+\. No obligation to book\.$/);
  const undated = saveQuoteIntroCopy(saveResult({ ...record, journey: { ...journey, tripDate: "", tripTime: "" }, heldPrice: undefined }), 7);
  assert.equal(undated, `${SAVED_QUOTE_ADD_SCHEDULE_COPY} No obligation to book.`);
  assert.doesNotMatch(saveQuoteIntroCopy(null, 7), /recalculated|surcharge/i);
});

console.log(`check-saved-quote-held-price: ${passed} checks passed`);

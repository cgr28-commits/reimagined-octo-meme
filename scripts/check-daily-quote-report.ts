/**
 * Quote sessions: no immediate owner email; one record per quoteTransactionId;
 * daily London report; booking marks Booked.
 * Run: npx tsx scripts/check-daily-quote-report.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildDailyQuoteReportHtml,
  buildDailyQuoteReportSubject,
  buildDailyQuoteReportText,
  markQuoteSessionBooked,
  mergeQuoteSessionRecord,
  previousLondonCalendarDate,
  shouldSendDailyQuoteReport,
  summarizeDailyQuoteSessions,
  type DailyQuoteSessionRecord,
} from "../shared/quote-session";
import { expressCheckoutChangeLabel } from "../shared/express-drop-off";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function session(partial: Partial<DailyQuoteSessionRecord> & { quoteTransactionId: string }): DailyQuoteSessionRecord {
  return mergeQuoteSessionRecord(null, {
    quoteTransactionId: partial.quoteTransactionId,
    pickupLabel: partial.pickupLabel || "7 Glen Manor Rd",
    dropoffLabel: partial.dropoffLabel || "Belfast International Airport",
    airportCode: partial.airportCode ?? "BFS",
    journeyDirection: partial.journeyDirection || "Airport drop-off",
    returnJourney: partial.returnJourney,
    passengers: partial.passengers ?? 2,
    suitcases: partial.suitcases ?? 1,
    vehicle: partial.vehicle || "Standard Saloon (1–4 passengers)",
    journeyFareGbp: partial.journeyFareGbp ?? 45,
    airportAccessOption: partial.airportAccessOption ?? "Free Drop-Off",
    airportAccessFeeGbp: partial.airportAccessFeeGbp ?? 0,
    totalGbp: partial.totalGbp ?? 45,
    estimatedPriceLabel: partial.estimatedPriceLabel || "£45",
    now: partial.firstQuotedAt ? new Date(partial.firstQuotedAt) : new Date("2026-09-08T13:22:00.000Z"),
  });
}

console.log("=== A–D: quote view / recalculation never sends an owner email ===");
{
  const client = read("src/lib/submit-quote-lead.ts");
  const card = read("src/components/QuoteCard.tsx");
  const worker = read("workers/addresses/src/index.ts");
  const handler = worker.match(
    /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
  );
  assert.ok(handler, "quote-lead handler missing");
  assert.match(client, /skipEmail:\s*true/);
  assert.match(client, /Never send an immediate owner email/);
  assert.doesNotMatch(client, /Quote lead email failed via worker/);
  assert.match(card, /scheduleQuoteLeadAlert\(/);
  assert.match(card, /quoteTransactionId/);
  assert.doesNotMatch(handler[0], /trySendOwnerOperationalEmail/);
  assert.match(handler[0], /emailed:\s*false/);
  assert.match(handler[0], /upsertQuoteSession/);
  assert.match(card, /if \(quoteTransactionId\) return;/);
  console.log("OK  quote generate / luggage / vehicle / Express changes do not email");
}

console.log("\n=== E/F: same quoteTransactionId upserts one record; new id is separate ===");
{
  const first = mergeQuoteSessionRecord(null, {
    quoteTransactionId: "quote_abc123",
    pickupLabel: "7 Glen Manor Rd",
    dropoffLabel: "Belfast International Airport",
    vehicle: "Standard Saloon (1–4 passengers)",
    passengers: 2,
    suitcases: 1,
    journeyFareGbp: 45,
    airportAccessOption: "Express Drop-Off",
    airportAccessFeeGbp: 5,
    totalGbp: 50,
    now: new Date("2026-09-08T13:22:00.000Z"),
  });
  const afterEstate = mergeQuoteSessionRecord(first, {
    quoteTransactionId: "quote_abc123",
    pickupLabel: "7 Glen Manor Rd",
    dropoffLabel: "Belfast International Airport",
    vehicle: "Estate Car (1–4 passengers)",
    passengers: 2,
    suitcases: 3,
    journeyFareGbp: 51,
    airportAccessOption: "Express Drop-Off",
    airportAccessFeeGbp: 5,
    totalGbp: 56,
    now: new Date("2026-09-08T13:23:00.000Z"),
  });
  const afterFree = mergeQuoteSessionRecord(afterEstate, {
    quoteTransactionId: "quote_abc123",
    pickupLabel: "7 Glen Manor Rd",
    dropoffLabel: "Belfast International Airport",
    vehicle: "Estate Car (1–4 passengers)",
    passengers: 2,
    suitcases: 3,
    journeyFareGbp: 51,
    airportAccessOption: "Free Drop-Off",
    airportAccessFeeGbp: 0,
    totalGbp: 51,
    now: new Date("2026-09-08T13:24:00.000Z"),
  });
  assert.equal(afterFree.quoteTransactionId, first.quoteTransactionId);
  assert.equal(afterFree.firstQuotedAt, first.firstQuotedAt);
  assert.equal(afterFree.vehicle, "Estate Car (1–4 passengers)");
  assert.equal(afterFree.totalGbp, 51);
  assert.equal(afterFree.airportAccessOption, "Free Drop-Off");
  assert.equal(afterFree.airportAccessFeeGbp, 0);
  assert.equal(afterFree.booked, false);

  const other = mergeQuoteSessionRecord(null, {
    quoteTransactionId: "quote_other999",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Dublin Airport",
    vehicle: "Estate Car (1–4 passengers)",
    passengers: 2,
    suitcases: 3,
    journeyFareGbp: 267,
    airportAccessOption: "Express Pick-Up",
    airportAccessFeeGbp: 5,
    totalGbp: 272,
    now: new Date("2026-09-08T14:04:00.000Z"),
  });
  assert.notEqual(other.quoteTransactionId, afterFree.quoteTransactionId);
  console.log("OK  one session updates in place; a new txn is a second quote");
}

console.log("\n=== G/H: completed booking still emails; quote is marked Booked ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  const bookingHandler = worker.match(
    /async function handleBookingRequest\([\s\S]*?\nasync function handleEmailStatusRequest/,
  );
  assert.ok(bookingHandler, "booking handler missing");
  assert.match(bookingHandler[0], /sendBookingEmail/);
  assert.match(bookingHandler[0], /markQuoteSessionBookedInStore/);
  assert.match(finalize, /trySendBrandedCustomerEmail/);
  assert.match(finalize, /buildOwnerPaidBookingEmail/);
  assert.match(finalize, /markQuoteSessionBookedInStore/);

  const quoted = session({ quoteTransactionId: "quote_book1", totalGbp: 45 });
  const booked = markQuoteSessionBooked(quoted, {
    quoteTransactionId: "quote_book1",
    bookingReference: "ABC123",
    now: new Date("2026-09-08T15:04:00.000Z"),
  });
  assert.equal(booked.booked, true);
  assert.equal(booked.bookingReference, "ABC123");
  assert.equal(booked.totalGbp, 45);
  console.log("OK  booking email path unchanged; matching quote becomes Booked");
}

console.log("\n=== I/J/K: daily report lists each session once with latest state and totals ===");
{
  const saloon = session({
    quoteTransactionId: "quote_one",
    firstQuotedAt: "2026-09-08T13:22:00.000Z",
    passengers: 2,
    suitcases: 1,
    vehicle: "Standard Saloon (1–4 passengers)",
    totalGbp: 45,
    airportAccessOption: "Free Drop-Off",
  });
  const latest = mergeQuoteSessionRecord(saloon, {
    quoteTransactionId: "quote_one",
    pickupLabel: "7 Glen Manor Rd",
    dropoffLabel: "Belfast International Airport",
    vehicle: "Estate Car (1–4 passengers)",
    passengers: 2,
    suitcases: 3,
    journeyFareGbp: 51,
    airportAccessOption: "Free Drop-Off",
    airportAccessFeeGbp: 0,
    totalGbp: 51,
    now: new Date("2026-09-08T13:40:00.000Z"),
  });
  const booked = markQuoteSessionBooked(
    session({
      quoteTransactionId: "quote_two",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Dublin",
      vehicle: "Estate Car (1–4 passengers)",
      passengers: 2,
      suitcases: 3,
      totalGbp: 272,
      airportAccessOption: "Express Pick-Up",
      firstQuotedAt: "2026-09-08T14:04:00.000Z",
    }),
    { quoteTransactionId: "quote_two", bookingReference: "ABC123" },
  );
  const sessions = [latest, booked];
  const totals = summarizeDailyQuoteSessions(sessions);
  assert.equal(totals.quotesGenerated, 2);
  assert.equal(totals.bookingsCompleted, 1);
  assert.equal(totals.notBooked, 1);
  assert.equal(totals.conversionPercent, 50);

  const subject = buildDailyQuoteReportSubject("2026-09-08");
  assert.equal(subject, "My Airport Taxi NI — Daily Quote Report — 8 September 2026");
  const text = buildDailyQuoteReportText("2026-09-08", sessions);
  assert.match(text, /Quotes generated: 2/);
  assert.match(text, /Bookings completed: 1/);
  assert.match(text, /Not booked: 1/);
  assert.match(text, /Quote-to-booking conversion: 50%/);
  assert.match(text, /7 Glen Manor Rd → Belfast International/);
  assert.match(text, /Estate/);
  assert.match(text, /£51/);
  assert.match(text, /Free Drop-Off/);
  assert.match(text, /Not booked/);
  assert.match(text, /BOOKED · Ref ABC123/);
  assert.equal((text.match(/7 Glen Manor Rd/g) || []).length, 1);

  const html = buildDailyQuoteReportHtml("2026-09-08", sessions);
  assert.match(html, /<table/);
  assert.match(html, /BOOKED · Ref ABC123/);

  const empty = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T00:10:00.000Z"),
    alreadySent: false,
    quoteCount: 0,
  });
  assert.equal(empty.send, false);
  assert.equal(empty.reason, "empty");
  assert.equal(previousLondonCalendarDate(new Date("2026-09-09T00:10:00+01:00")).length, 10);
  console.log("OK  report uses latest fare/vehicle/access and correct counts");
}

console.log("\n=== Checkout wording is Change airport access ===");
{
  assert.equal(expressCheckoutChangeLabel("pick-up"), "Change airport access");
  assert.equal(expressCheckoutChangeLabel("drop-off"), "Change airport access");
  assert.equal(expressCheckoutChangeLabel("combined"), "Change airport access");
  const summary = read("src/components/QuoteCheckoutSummary.tsx");
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /expressCheckoutChangeLabel\(\)/);
  assert.match(summary, /changeAccessLabel/);
  assert.doesNotMatch(card, /Change pick-up/);
  console.log("OK  checkout link no longer says Change drop-off / pick-up");
}

console.log("\n=== Worker cron + fail-safe recording ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const cron = read("workers/addresses/src/daily-quote-report.ts");
  const client = read("src/lib/submit-quote-lead.ts");
  assert.match(worker, /processDailyQuoteReport/);
  assert.match(cron, /shouldSendDailyQuoteReport/);
  assert.match(cron, /trySendOwnerOperationalEmail/);
  assert.match(client, /Fail safely/);
  assert.match(read("workers/addresses/wrangler.toml"), /DAILY_QUOTE_REPORT_LONDON_HOUR/);
  console.log("OK  daily report is cron-driven and quote logging cannot block customers");
}

console.log("\nAll daily quote report checks passed.");

/**
 * Quote sessions: no immediate owner email; one record per quoteTransactionId;
 * daily London report; booking marks Booked.
 * Run: npx tsx scripts/check-daily-quote-report.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_DAILY_QUOTE_REPORT_LONDON_HOUR,
  buildDailyQuoteReportHtml,
  buildDailyQuoteReportSubject,
  buildDailyQuoteReportText,
  collectQuoteTransactionIdsFromMarkerKeys,
  markQuoteSessionBooked,
  mergeQuoteSessionRecord,
  previousLondonCalendarDate,
  quoteSessionDayMarkerKey,
  quoteSessionDayMarkerPrefix,
  quoteSessionKey,
  shouldSendDailyQuoteReport,
  summarizeDailyQuoteSessions,
  type DailyQuoteSessionInput,
  type DailyQuoteSessionRecord,
} from "../shared/quote-session";
import { expressCheckoutChangeLabel } from "../shared/express-drop-off";
import {
  listQuoteSessionsForLondonDay,
  upsertQuoteSession,
} from "../workers/addresses/src/quote-session-store";

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

console.log("=== A–D: first completed quote emails once; recalculations only upsert ===");
{
  const client = read("src/lib/submit-quote-lead.ts");
  const card = read("src/components/QuoteCard.tsx");
  const worker = read("workers/addresses/src/index.ts");
  const handler = worker.match(
    /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
  );
  assert.ok(handler, "quote-lead handler missing");
  assert.doesNotMatch(client, /skipEmail:\s*true/);
  assert.match(client, /fingerprint, "quote"/);
  assert.match(client, /Quote lead email failed via worker/);
  assert.match(card, /scheduleQuoteLeadAlert\(/);
  assert.match(card, /quoteTransactionId/);
  assert.match(handler[0], /trySendOwnerOperationalEmail/);
  assert.match(handler[0], /runQuoteLeadNotification/);
  assert.match(handler[0], /upsertQuoteSession/);
  assert.match(card, /if \(quoteTransactionId\) return;/);
  console.log("OK  same quoteTransactionId upserts; email dedupe is by txn id");
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
  assert.match(finalize, /trySendOwnerOperationalEmail/);
  assert.match(finalize, /buildOwnerPaidBookingEmail/);
  assert.match(finalize, /markQuoteSessionBookedInStore/);
  assert.match(finalize, /from "\.\/worker-email"/);

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
    now: new Date("2026-09-09T19:30:00+01:00"),
    alreadySent: false,
    quoteCount: 0,
  });
  assert.equal(empty.send, false);
  assert.equal(empty.reason, "empty");
  assert.equal(empty.reportDay, "2026-09-09");
  assert.equal(previousLondonCalendarDate(new Date("2026-09-09T00:10:00+01:00")).length, 10);

  assert.equal(DEFAULT_DAILY_QUOTE_REPORT_LONDON_HOUR, 19);
  const beforeWindow = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T18:30:00+01:00"),
    alreadySent: false,
    quoteCount: 2,
  });
  assert.equal(beforeWindow.send, false);
  assert.equal(beforeWindow.reason, "wrong_hour");
  assert.equal(beforeWindow.reportDay, "2026-09-09");
  const oneAmLondon = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T01:05:00+01:00"),
    alreadySent: false,
    quoteCount: 2,
  });
  assert.equal(oneAmLondon.send, false);
  assert.equal(oneAmLondon.reason, "wrong_hour");
  const sevenThirtyLondon = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T19:30:00+01:00"),
    alreadySent: false,
    quoteCount: 2,
  });
  assert.equal(sevenThirtyLondon.send, true);
  assert.equal(sevenThirtyLondon.reason, "due");
  assert.equal(sevenThirtyLondon.reportDay, "2026-09-09");
  const catchUpSameDay = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T20:30:00+01:00"),
    alreadySent: false,
    quoteCount: 2,
  });
  assert.equal(catchUpSameDay.send, true);
  assert.equal(catchUpSameDay.reason, "due");
  assert.equal(catchUpSameDay.reportDay, "2026-09-09");
  const alreadySent = shouldSendDailyQuoteReport({
    now: new Date("2026-09-09T20:30:00+01:00"),
    alreadySent: true,
    quoteCount: 2,
  });
  assert.equal(alreadySent.send, false);
  assert.equal(alreadySent.reason, "already_sent");
  assert.equal(alreadySent.reportDay, "2026-09-09");
  console.log("OK  report uses latest fare/vehicle/access and sends at 19:30 London");
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
  const email = read("workers/addresses/src/worker-email.ts");
  const client = read("src/lib/submit-quote-lead.ts");
  assert.match(worker, /processDailyQuoteReport/);
  assert.match(cron, /shouldSendDailyQuoteReport/);
  assert.match(cron, /trySendResendOnlyEmail/);
  assert.match(cron, /send\.provider !== "resend"/);
  assert.match(cron, /provider: "resend"/);
  assert.match(cron, /console.error\("Daily quote report email failed"/);
  assert.match(cron, /markDailyQuoteReportSent/);
  assert.doesNotMatch(cron, /trySendOwnerOperationalEmail/);
  assert.doesNotMatch(cron, /web3forms|formsubmit|mailchannels|cloudflare-email|Cloudflare Email/i);
  assert.match(email, /export async function trySendResendOnlyEmail/);
  assert.match(email, /api\.resend.com\/emails/);
  assert.match(email, /RESEND_API_KEY/);
  assert.match(email, /from: `\$\{BUSINESS_NAME\} <\$\{fromEmail\}>`/);
  assert.match(email, /reply_to: fromEmail/);
  assert.match(email, /trySendResendOnlyCustomerEmail[\s\S]*trySendResendOnlyEmail/);
  assert.match(client, /Fail safely/);
  const wrangler = read("workers/addresses/wrangler.toml");
  assert.match(wrangler, /DAILY_QUOTE_REPORT_LONDON_HOUR = "19"/);
  assert.match(wrangler, /crons = \["30 \* \* \* \*"\]/);
  assert.match(wrangler, /current day's quote report is sent at 19:30 London time/);
  assert.doesNotMatch(wrangler, /\[env\.preview\.triggers\]/);
  assert.doesNotMatch(wrangler, /DAILY_QUOTE_REPORT_LONDON_HOUR = "0"/);
  assert.doesNotMatch(wrangler, /DAILY_QUOTE_REPORT_LONDON_HOUR = "1"/);
  const storeSrc = read("workers/addresses/src/quote-session-store.ts");
  const sharedSrc = read("shared/quote-session.ts");
  assert.doesNotMatch(storeSrc, /type DayIndex|readDayIndex|writeDayIndex|quote_sessions_day|quoteSessionDayIndexKey/);
  assert.doesNotMatch(sharedSrc, /quote_sessions_day|quoteSessionDayIndexKey/);
  assert.match(storeSrc, /quoteSessionDayMarkerKey/);
  assert.match(storeSrc, /quoteSessionDayMarkerPrefix/);
  assert.match(storeSrc, /list_complete/);
  assert.match(sharedSrc, /quote_session_day:\$\{londonDay\}:\$\{normalizeQuoteTransactionId/);
  console.log("OK  daily report is Resend-only; failures retry and cannot block customers");
}

type MemoryKvEntry = { value: string };

class MemoryKv {
  readonly data = new Map<string, MemoryKvEntry>();
  pageSize: number;
  listCalls = 0;

  constructor(pageSize = 2) {
    this.pageSize = pageSize;
  }

  async get(key: string, type?: string): Promise<unknown> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (type === "json") {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    return entry.value;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, { value });
  }

  async list(options: { prefix: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    this.listCalls += 1;
    const names = [...this.data.keys()].filter((key) => key.startsWith(options.prefix)).sort();
    const start = options.cursor ? Number(options.cursor) : 0;
    const slice = names.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    const complete = next >= names.length;
    return {
      keys: slice.map((name) => ({ name })),
      list_complete: complete,
      ...(complete ? {} : { cursor: String(next) }),
    };
  }
}

function quoteInput(
  id: string,
  overrides: Partial<DailyQuoteSessionInput> = {},
): DailyQuoteSessionInput {
  return {
    quoteTransactionId: id,
    pickupLabel: overrides.pickupLabel || `${id} pickup`,
    dropoffLabel: overrides.dropoffLabel || "Belfast International Airport",
    vehicle: overrides.vehicle || "Standard Saloon (1–4 passengers)",
    passengers: overrides.passengers ?? 2,
    suitcases: overrides.suitcases ?? 1,
    journeyFareGbp: overrides.journeyFareGbp ?? 45,
    airportAccessOption: overrides.airportAccessOption ?? "Free Drop-Off",
    airportAccessFeeGbp: overrides.airportAccessFeeGbp ?? 0,
    totalGbp: overrides.totalGbp ?? 45,
    estimatedPriceLabel: overrides.estimatedPriceLabel || "£45",
    now: overrides.now ?? new Date("2026-09-08T13:22:00.000Z"),
    ...overrides,
  };
}

console.log("\n=== Independent day markers: concurrency, pagination, sort, dedupe ===");
async function checkIndependentDayMarkers(): Promise<void> {
  assert.equal(
    quoteSessionDayMarkerKey("2026-09-08", "quote_abc123"),
    "quote_session_day:2026-09-08:quote_abc123",
  );
  assert.equal(quoteSessionDayMarkerPrefix("2026-09-08"), "quote_session_day:2026-09-08:");
  assert.equal(quoteSessionKey("quote_abc123"), "quote_session:quote_abc123");

  const store = new MemoryKv(2);

  await Promise.all([
    upsertQuoteSession(store as unknown as KVNamespace, quoteInput("quote_abc123", {
      now: new Date("2026-09-08T12:00:00.000Z"),
    })),
    upsertQuoteSession(store as unknown as KVNamespace, quoteInput("quote_xyz789", {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Dublin Airport",
      now: new Date("2026-09-08T12:01:00.000Z"),
    })),
  ]);

  assert.equal(store.data.has("quote_session:quote_abc123"), true);
  assert.equal(store.data.has("quote_session:quote_xyz789"), true);
  assert.equal(store.data.has("quote_session_day:2026-09-08:quote_abc123"), true);
  assert.equal(store.data.has("quote_session_day:2026-09-08:quote_xyz789"), true);
  assert.equal(store.data.has("quote_sessions_day:2026-09-08"), false);

  await upsertQuoteSession(store as unknown as KVNamespace, quoteInput("quote_abc123", {
    vehicle: "Estate Car (1–4 passengers)",
    totalGbp: 51,
    now: new Date("2026-09-08T12:10:00.000Z"),
  }));

  store.data.set("quote_session_day:2026-09-08:quote_missing", { value: "1" });
  store.data.set("quote_session_day:2026-09-08:quote_broken", { value: "1" });
  store.data.set("quote_session:quote_broken", { value: "{not-json" });

  await upsertQuoteSession(store as unknown as KVNamespace, quoteInput("quote_late999", {
    now: new Date("2026-09-08T11:00:00.000Z"),
  }));
  await upsertQuoteSession(store as unknown as KVNamespace, quoteInput("quote_mid555", {
    now: new Date("2026-09-08T11:30:00.000Z"),
  }));

  const listed = await listQuoteSessionsForLondonDay(
    store as unknown as KVNamespace,
    "2026-09-08",
  );
  assert.ok(store.listCalls >= 3, `expected multiple KV list pages, got ${store.listCalls}`);
  const ids = listed.map((row) => row.quoteTransactionId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("quote_abc123"));
  assert.ok(ids.includes("quote_xyz789"));
  assert.ok(ids.includes("quote_late999"));
  assert.ok(ids.includes("quote_mid555"));
  assert.equal(ids.filter((id) => id === "quote_abc123").length, 1);
  assert.equal(listed.find((row) => row.quoteTransactionId === "quote_abc123")?.vehicle, "Estate Car (1–4 passengers)");
  assert.equal(
    listed.find((row) => row.quoteTransactionId === "quote_abc123")?.firstQuotedAt,
    new Date("2026-09-08T12:00:00.000Z").toISOString(),
  );
  assert.ok(!ids.includes("quote_missing"));
  assert.ok(!ids.includes("quote_broken"));
  const times = listed.map((row) => row.firstQuotedAt);
  assert.deepEqual(times, [...times].sort((a, b) => a.localeCompare(b)));

  const deduped = collectQuoteTransactionIdsFromMarkerKeys([
    "quote_session_day:2026-09-08:quote_abc123",
    "quote_session_day:2026-09-08:quote_abc123",
    "quote_session_day:2026-09-08:quote_xyz789",
    "quote_sessions_day:2026-09-08",
    "quote_session_day:2026-09-08:",
  ]);
  assert.deepEqual(deduped, ["quote_abc123", "quote_xyz789"]);
  console.log("OK  independent markers survive concurrent writes; list paginates, dedupes, and sorts");
}

checkIndependentDayMarkers()
  .then(() => {
    console.log("\nAll daily quote report checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

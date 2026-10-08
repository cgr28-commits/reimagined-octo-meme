/**
 * Saved-quote reminders stop once the same journey is booked.
 * Run: npx tsx scripts/check-saved-quote-reminder-stop.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  SAVED_QUOTE_FINAL_REMINDER_DAYS,
  SAVED_QUOTE_FIRST_REMINDER_HOURS,
  bookingSuppressesSavedQuoteReminders,
  savedQuoteReminderBlockedByBookings,
  savedQuotesShareJourney,
  shouldSendFirstReminder,
  type SavedQuoteJourneyMatchInput,
  type SavedQuoteJourneySnapshot,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import { buildSavedQuoteFirstReminderEmail } from "../shared/saved-quote-emails";
import { getPaidBookingRecord, savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { createSavedQuote, getSavedQuoteByToken as readSavedQuote } from "../workers/addresses/src/saved-quote-store";
import {
  processSavedQuoteReminders,
  suppressSavedQuoteRemindersForBooking,
  type SavedQuoteEnv,
  type SavedQuoteReminderSend,
} from "../workers/addresses/src/saved-quote-handlers";

const root = process.cwd();

function memoryKv() {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw) as unknown;
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return store as unknown as KVNamespace;
}

const JOURNEY: SavedQuoteJourneySnapshot = {
  pickupLabel: "1 Main Street, Belfast",
  dropoffLabel: "Belfast International Airport",
  pickupPlaceId: "place-home",
  dropoffPlaceId: "place-bfs",
  isAirportTrip: true,
  isFromAirport: false,
  tripDirection: "to-airport",
  tripDate: "2026-11-02",
  tripTime: "09:00",
  returnJourney: false,
  passengers: 2,
  suitcases: 1,
  vehicle: "Standard Saloon (1–4 passengers)",
  tripLabel: "Airport drop-off",
};

function matchOf(journey: SavedQuoteJourneySnapshot, email = "customer@example.com"): SavedQuoteJourneyMatchInput {
  return {
    customerEmail: email,
    pickupLabel: journey.pickupLabel,
    dropoffLabel: journey.dropoffLabel,
    pickupPlaceId: journey.pickupPlaceId,
    dropoffPlaceId: journey.dropoffPlaceId,
    tripDate: journey.tripDate,
    tripTime: journey.tripTime,
    returnJourney: journey.returnJourney,
    returnDate: journey.returnDate,
    returnTime: journey.returnTime,
    isFromAirport: journey.isFromAirport,
    tripDirection: journey.tripDirection,
  };
}

function paid(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "PAY-1",
    checkoutId: "chk-1",
    amount: 45,
    currency: "GBP",
    amountPaidLabel: "£45.00",
    customerName: "Alex Example",
    customerEmail: "Customer@Example.com",
    mobileNumber: "07123456789",
    tripLabel: JOURNEY.tripLabel,
    pickupLabel: "1 Main Street, Belfast, United Kingdom",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-11-02",
    tripTime: "9:00",
    isFromAirport: false,
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-10-08T12:00:00.000Z",
    ...overrides,
  };
}

async function saveQuote(
  store: KVNamespace,
  journey: SavedQuoteJourneySnapshot = JOURNEY,
  email = "customer@example.com",
) {
  return createSavedQuote(store, {
    customerName: "Alex Example",
    customerEmail: email,
    journey,
    pricing: { totalAmount: 45, currency: "GBP", amountLabel: "£45.00" },
  });
}

function dueAt(record: { createdAt: string }): Date {
  return new Date(Date.parse(record.createdAt) + 25 * 60 * 60 * 1000);
}

function capturingSend() {
  const messages: Array<{ to: string; subject: string }> = [];
  const sendEmail: SavedQuoteReminderSend = async (_env, message) => {
    messages.push({ to: message.to, subject: message.subject });
    return { sent: true };
  };
  return { messages, sendEmail };
}

async function runReminders(
  store: KVNamespace,
  now: Date,
  sendEmail: SavedQuoteReminderSend,
  afterClaim?: (record: SavedQuoteRecord) => Promise<void>,
) {
  return processSavedQuoteReminders({ TRACKING_STORE: store } as SavedQuoteEnv, {
    now,
    sendEmail,
    afterClaim,
  });
}

async function main() {
  console.log("=== Journey match is not email-only ===");
  const base = matchOf(JOURNEY);
  assert.equal(savedQuotesShareJourney(base, { ...base, customerEmail: "CUSTOMER@example.com" }), true);
  assert.equal(savedQuotesShareJourney(base, { ...base, customerEmail: "other@example.com" }), false);
  assert.equal(savedQuotesShareJourney(base, { ...base, tripDate: "2026-11-09" }), false);
  assert.equal(savedQuotesShareJourney(base, { ...base, tripTime: "10:30" }), false);
  assert.equal(
    savedQuotesShareJourney(base, { ...base, dropoffLabel: "George Best Belfast City Airport", dropoffPlaceId: "place-bhd" }),
    false,
  );
  assert.equal(savedQuotesShareJourney(base, { ...base, isFromAirport: true, tripDirection: "from-airport" }), false);
  assert.equal(
    savedQuotesShareJourney(base, {
      ...base,
      returnJourney: true,
      returnDate: "2026-11-16",
      returnTime: "18:00",
    }),
    false,
  );
  assert.equal(
    savedQuotesShareJourney(
      {
        ...base,
        returnJourney: true,
        returnDate: "2026-11-16",
        returnTime: "18:00",
      },
      {
        ...base,
        returnJourney: true,
        returnDate: "2026-11-16",
        returnTime: "6:00",
      },
    ),
    false,
  );
  assert.equal(
    savedQuotesShareJourney(
      base,
      {
        ...base,
        pickupLabel: "1 Main Street Belfast",
        dropoffLabel: "Somewhere else",
        pickupPlaceId: "place-home",
        dropoffPlaceId: "place-bfs",
      },
    ),
    true,
    "matching place ids identify the journey even when the label text differs",
  );
  assert.equal(
    savedQuotesShareJourney(base, { ...base, pickupPlaceId: "place-other", pickupLabel: base.pickupLabel }),
    false,
    "different place ids are different pickups",
  );

  assert.equal(
    bookingSuppressesSavedQuoteReminders({
      status: "confirmed",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
    }),
    true,
  );
  assert.equal(
    bookingSuppressesSavedQuoteReminders({
      status: "partially_refunded",
      operationalStatus: "confirmed",
      paymentStatus: "partially_refunded",
    }),
    true,
  );
  assert.equal(
    bookingSuppressesSavedQuoteReminders({
      status: "refunded_active",
      operationalStatus: "confirmed",
      paymentStatus: "fully_refunded",
    }),
    true,
  );
  for (const status of ["abandoned", "failed", "awaiting_payment", "cancelled", "refunded"]) {
    assert.equal(bookingSuppressesSavedQuoteReminders({ status, paymentStatus: status }), false, status);
  }
  assert.equal(
    bookingSuppressesSavedQuoteReminders({
      status: "confirmed",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
      isRefundTest: true,
    }),
    false,
  );
  assert.equal(
    savedQuoteReminderBlockedByBookings(
      { customerEmail: "customer@example.com", journey: JOURNEY },
      [{ ...base, customerEmail: "customer@example.com", status: "abandoned" }],
    ),
    false,
  );

  console.log("=== 1. Book from the saved quote — no further reminders ===");
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    const booking = paid({ paymentReference: "PAY-FROM-QUOTE" });
    await savePaidBookingRecord(store, booking);
    const suppressed = await suppressSavedQuoteRemindersForBooking(store, {
      savedQuoteToken: quote.token,
      paymentReference: booking.paymentReference,
      checkoutId: booking.checkoutId,
      match: matchOf(JOURNEY, booking.customerEmail),
    });
    assert.ok(suppressed.markedTokens.includes(quote.token));
    const stored = await readSavedQuote(store, quote.token);
    assert.equal(stored?.status, "booked");
    assert.equal(stored?.paymentReference, "PAY-FROM-QUOTE");
    assert.equal(shouldSendFirstReminder(stored!, dueAt(quote)), false);
    const { messages, sendEmail } = capturingSend();
    await runReminders(store, dueAt(quote), sendEmail);
    assert.equal(messages.length, 0);
  }

  console.log("=== 2. Fresh booking of the same journey — no further reminders ===");
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    const booking = paid({ paymentReference: "PAY-FRESH", checkoutId: "chk-fresh" });
    await savePaidBookingRecord(store, booking);
    await suppressSavedQuoteRemindersForBooking(store, {
      paymentReference: booking.paymentReference,
      checkoutId: booking.checkoutId,
      match: {
        customerEmail: booking.customerEmail,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnJourney: booking.returnJourney,
        isFromAirport: booking.isFromAirport,
      },
    });
    const stored = await readSavedQuote(store, quote.token);
    assert.equal(stored?.status, "booked");
    assert.equal(stored?.bookingId, "PAY-FRESH");
    const { messages, sendEmail } = capturingSend();
    await runReminders(store, dueAt(quote), sendEmail);
    assert.equal(messages.length, 0);
  }

  console.log("=== 3. Three saves of one journey — booking one suppresses all ===");
  {
    const store = memoryKv();
    const quotes = [await saveQuote(store), await saveQuote(store), await saveQuote(store)];
    assert.equal(new Set(quotes.map((quote) => quote.token)).size, 3);
    const booking = paid({ paymentReference: "PAY-ONE-OF-THREE" });
    await savePaidBookingRecord(store, booking);
    await suppressSavedQuoteRemindersForBooking(store, {
      savedQuoteToken: quotes[1].token,
      paymentReference: booking.paymentReference,
      checkoutId: booking.checkoutId,
      match: {
        customerEmail: booking.customerEmail,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnJourney: false,
        isFromAirport: false,
      },
    });
    for (const quote of quotes) {
      const stored = await readSavedQuote(store, quote.token);
      assert.equal(stored?.status, "booked", quote.reference);
      assert.equal(shouldSendFirstReminder(stored!, dueAt(quote)), false);
    }
    const { messages, sendEmail } = capturingSend();
    await runReminders(store, dueAt(quotes[0]), sendEmail);
    assert.equal(messages.length, 0);
  }

  console.log("=== 4. A different date stays eligible ===");
  {
    const store = memoryKv();
    const bookedJourney = await saveQuote(store);
    const otherDate = await saveQuote(store, { ...JOURNEY, tripDate: "2026-11-09" });
    const otherDestination = await saveQuote(store, {
      ...JOURNEY,
      dropoffLabel: "Belfast City Airport",
      dropoffPlaceId: "place-bhd",
      tripDirection: "to-airport",
    });
    const booking = paid({ paymentReference: "PAY-ONE-DATE" });
    await savePaidBookingRecord(store, booking);
    await suppressSavedQuoteRemindersForBooking(store, {
      savedQuoteToken: bookedJourney.token,
      paymentReference: booking.paymentReference,
      checkoutId: booking.checkoutId,
      match: {
        customerEmail: booking.customerEmail,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnJourney: false,
        isFromAirport: false,
      },
    });
    assert.equal((await readSavedQuote(store, bookedJourney.token))?.status, "booked");
    const later = await readSavedQuote(store, otherDate.token);
    const elsewhere = await readSavedQuote(store, otherDestination.token);
    assert.equal(later?.status, "saved");
    assert.equal(elsewhere?.status, "saved");
    assert.equal(shouldSendFirstReminder(later!, dueAt(otherDate)), true);
    assert.equal(shouldSendFirstReminder(elsewhere!, dueAt(otherDestination)), true);
    const { messages, sendEmail } = capturingSend();
    const expected = buildSavedQuoteFirstReminderEmail(later!, {
      origin: "https://www.myairporttaxini.co.uk",
    });
    await runReminders(store, dueAt(otherDate), sendEmail);
    assert.equal(messages.length, 2);
    assert.ok(messages.every((message) => message.subject === expected.subject));
    assert.equal((await readSavedQuote(store, bookedJourney.token))?.firstReminderSentAt, undefined);
    assert.ok((await readSavedQuote(store, otherDate.token))?.firstReminderSentAt);
    assert.ok((await readSavedQuote(store, otherDestination.token))?.firstReminderSentAt);
  }

  console.log("=== 5. Reminder already claimed when the booking is confirmed — do not send ===");
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    const { messages, sendEmail } = capturingSend();
    await runReminders(store, dueAt(quote), sendEmail, async () => {
      await savePaidBookingRecord(store, paid({ paymentReference: "PAY-WHILE-QUEUED" }));
    });
    assert.equal(messages.length, 0);
    const stored = await readSavedQuote(store, quote.token);
    assert.equal(stored?.status, "booked");
    assert.equal(stored?.paymentReference, "PAY-WHILE-QUEUED");
    await runReminders(store, dueAt(quote), sendEmail);
    assert.equal(messages.length, 0);
  }

  console.log("=== 6. Duplicate jobs and a retry do not send twice ===");
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    const messages: string[] = [];
    const sendEmail: SavedQuoteReminderSend = async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      messages.push("sent");
      return { sent: true };
    };
    const now = dueAt(quote);
    await Promise.all([
      runReminders(store, now, sendEmail),
      runReminders(store, now, sendEmail),
    ]);
    await runReminders(store, now, sendEmail);
    assert.equal(messages.length, 1);
    assert.ok((await readSavedQuote(store, quote.token))?.firstReminderSentAt);
  }
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    const messages: string[] = [];
    let attempts = 0;
    const sendEmail: SavedQuoteReminderSend = async () => {
      attempts += 1;
      if (attempts === 1) return { sent: false, error: "temporary" };
      messages.push("sent");
      return { sent: true };
    };
    const now = dueAt(quote);
    await runReminders(store, now, sendEmail);
    assert.equal(messages.length, 0);
    assert.equal((await readSavedQuote(store, quote.token))?.status, "saved");
    assert.equal((await readSavedQuote(store, quote.token))?.firstReminderSentAt, undefined);
    await runReminders(store, now, sendEmail);
    await runReminders(store, now, sendEmail);
    assert.equal(messages.length, 1);
    assert.equal(attempts, 2);
  }

  console.log("=== 7. Failed or abandoned checkout does not mark the quote booked ===");
  {
    const store = memoryKv();
    const quote = await saveQuote(store);
    await savePaidBookingRecord(
      store,
      paid({
        paymentReference: "PAY-ABANDONED",
        status: "cancelled",
        operationalStatus: "cancelled",
        paymentStatus: "paid",
      }),
    );
    await store.put(
      "pending-checkout:abandoned-1",
      JSON.stringify({
        checkoutId: "abandoned-1",
        status: "abandoned",
        booking: { customerEmail: "customer@example.com" },
        savedQuoteToken: quote.token,
      }),
    );
    const storedBefore = await readSavedQuote(store, quote.token);
    assert.equal(storedBefore?.status, "saved");
    assert.equal(
      savedQuoteReminderBlockedByBookings(storedBefore!, [
        {
          ...matchOf(JOURNEY),
          status: "abandoned",
          paymentStatus: "abandoned",
        },
      ]),
      false,
    );
    const { messages, sendEmail } = capturingSend();
    await runReminders(store, dueAt(quote), sendEmail);
    assert.equal(messages.length, 1);
    assert.equal((await readSavedQuote(store, quote.token))?.status, "saved");

    const refundTest = memoryKv();
    const stillOpen = await saveQuote(refundTest);
    await savePaidBookingRecord(
      refundTest,
      paid({ paymentReference: "PAY-REFUND-TEST", isRefundTest: true }),
    );
    const { messages: refundMessages, sendEmail: refundSend } = capturingSend();
    await runReminders(refundTest, dueAt(stillOpen), refundSend);
    assert.equal(refundMessages.length, 1);
    assert.equal((await readSavedQuote(refundTest, stillOpen.token))?.status, "saved");
  }

  console.log("=== 8. Confirmations, payment records, and unbooked reminder timing stay ===");
  assert.equal(SAVED_QUOTE_FIRST_REMINDER_HOURS, 24);
  assert.equal(SAVED_QUOTE_FINAL_REMINDER_DAYS, 5);
  const confirmation = buildCustomerConfirmationEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£45.00",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
  });
  assert.match(confirmation.subject, /Invoice & booking confirmed/);
  assert.match(confirmation.html, /Paid in full/);

  const roundTrip = memoryKv();
  await savePaidBookingRecord(roundTrip, paid({ paymentReference: "PAY-ROUND" }));
  const row = await getPaidBookingRecord(roundTrip, "PAY-ROUND");
  assert.equal(row?.status, "confirmed");
  assert.equal(row?.paymentStatus, "paid");
  assert.equal(row?.amount, 45);

  const unbooked = memoryKv();
  const openQuote = await saveQuote(unbooked);
  assert.equal(shouldSendFirstReminder(openQuote, new Date(Date.parse(openQuote.createdAt) + 60 * 60 * 1000)), false);
  const { messages, sendEmail } = capturingSend();
  await runReminders(unbooked, dueAt(openQuote), sendEmail);
  assert.equal(messages.length, 1);
  assert.equal((await readSavedQuote(unbooked, openQuote.token))?.status, "saved");

  const finalize = readFileSync(join(root, "workers/addresses/src/finalize-paid-checkout.ts"), "utf8");
  const unpaidAt = finalize.indexOf('error: "Payment has not been completed yet"');
  assert.ok(unpaidAt > 0);
  assert.match(finalize.slice(unpaidAt), /suppressSavedQuoteRemindersForBooking/);
  assert.match(finalize, /savePaidBookingRecordFromConfirm/);
  assert.match(finalize, /buildCustomerConfirmationEmail/);
  const webhook = readFileSync(join(root, "workers/addresses/src/index.ts"), "utf8");
  assert.match(webhook, /"FAILED"/);
  assert.doesNotMatch(webhook, /suppressSavedQuoteRemindersForBooking/);
  const handlers = readFileSync(join(root, "workers/addresses/src/saved-quote-handlers.ts"), "utf8");
  const createFn = handlers.slice(
    handlers.indexOf("export async function handleCreateSavedQuote"),
    handlers.indexOf("export async function handleGetSavedQuote"),
  );
  assert.doesNotMatch(createFn, /suppressSavedQuoteRemindersForBooking/);
  assert.match(handlers, /findAuthoritativeBookingBlockingSavedQuote/);

  console.log("OK  saved-quote reminders stop after the same journey is booked");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

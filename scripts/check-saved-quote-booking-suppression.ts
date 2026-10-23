import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import type { SavedQuoteRecord } from "../shared/saved-quote";
import { savedQuoteOpenIndexKey, savedQuoteTokenKey } from "../shared/saved-quote";
import { paidBookingRefKey, paidBookingTripDayIndexKey, type PaidBookingRecord } from "../shared/paid-booking-record";
import { savedQuoteMatchesConfirmedBooking, suppressSavedQuoteReminderForBookedJourney } from "../workers/addresses/src/saved-quote-booking-match";
import { processSavedQuoteReminders } from "../workers/addresses/src/saved-quote-handlers";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
const now = Date.now();
const day = new Date(now + 14 * 86400000).toISOString().slice(0, 10);
function quote(final = false, token = "a".repeat(48)): SavedQuoteRecord {
  return {
    id: token, token, reference: "SAVED-TEST", customerName: "Ron Test", customerEmail: "ron@example.invalid",
    status: "saved", createdAt: new Date(now - (final ? 6 : 2) * 86400000).toISOString(),
    expiresAt: new Date(now + 86400000).toISOString(),
    pricing: { totalAmount: 60, currency: "GBP", amountLabel: "£60" },
    journey: { pickupLabel: "Belfast International Airport, Airport Rd, UK", dropoffLabel: "Leighinmohr House Hotel, Ballymena",
      tripDate: day, tripTime: "10:25", returnJourney: false, isAirportTrip: true,
      passengers: 2, suitcases: 2, vehicle: "Saloon" },
    ...(final ? { firstReminderSentAt: new Date(now - 4 * 86400000).toISOString() } : {}),
  };
}
function booking(): PaidBookingRecord {
  return { paymentReference: "PAID-TEST", checkoutId: "checkout-test", amount: 60, currency: "GBP",
    amountPaidLabel: "£60", customerName: "Ron Test", customerEmail: "RON@example.invalid", mobileNumber: "",
    tripLabel: "Airport pickup", pickupLabel: quote().journey.pickupLabel, dropoffLabel: quote().journey.dropoffLabel,
    returnJourney: false, tripDate: day, tripTime: "10:25", status: "confirmed", createdAt: new Date(now).toISOString(),
  };
}
function memoryStore(quotes: SavedQuoteRecord[], bookings: PaidBookingRecord[], indexed = true) {
  const data = new Map<string, string>();
  data.set(savedQuoteOpenIndexKey(), JSON.stringify({ tokens: quotes.map(q => q.token) }));
  for (const q of quotes) data.set(savedQuoteTokenKey(q.token), JSON.stringify(q));
  for (const b of bookings) data.set(paidBookingRefKey(b.paymentReference), JSON.stringify(b));
  if (indexed) data.set(paidBookingTripDayIndexKey(day), JSON.stringify(bookings.map(b => b.paymentReference)));
  let fail = false;
  const store = {
    async get(key: string, type?: string) {
      if (fail && key.startsWith("booking:")) throw new Error("Simulated booking lookup failure");
      const value = data.get(key) ?? null;
      return type === "json" && value ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) { data.set(key, value); },
    async list({ prefix, cursor }: { prefix: string; cursor?: string }) {
      if (fail) throw new Error("Simulated booking list failure");
      // Force pagination to exercise the legacy fallback.
      const names = [...data.keys()].filter(k => k.startsWith(prefix)).sort();
      const offset = Number(cursor ?? 0);
      return { keys: names.slice(offset, offset + 1).map(name => ({ name })), list_complete: offset + 1 >= names.length, cursor: String(offset + 1) };
    },
  } as unknown as KVNamespace;
  return { store, data, failLookup() { fail = true; } };
}

async function main() {
const q = quote(), b = booking();
assert.ok(savedQuoteMatchesConfirmedBooking(q, b));
assert.ok(savedQuoteMatchesConfirmedBooking(q, { ...b, customerEmail: " ron@example.invalid ", pickupLabel: "  BELFAST International Airport,  Airport Rd, UK " }));
for (const patch of [
  { customerEmail: "other@example.invalid" }, { tripDate: "2030-01-01" }, { tripTime: "11:25" },
  { pickupLabel: "Belfast City Airport" }, { dropoffLabel: "Another hotel" },
  { status: "cancelled" }, { status: "refunded" }, { operationalStatus: "cancelled" },
  { cancelledLegs: ["outbound"] }, { isRefundTest: true }, { isAmendmentTestFixture: true },
]) assert.equal(savedQuoteMatchesConfirmedBooking(q, { ...b, ...patch } as PaidBookingRecord), false, JSON.stringify(patch));
assert.ok(savedQuoteMatchesConfirmedBooking(q, { ...b, status: "partially_refunded", operationalStatus: "confirmed" }));
assert.equal(savedQuoteMatchesConfirmedBooking({ ...q, journey: { ...q.journey, tripDate: "" } }, b), false);

const returnQuote = { ...q, journey: { ...q.journey, returnJourney: true, returnDate: day, returnTime: "19:30" } };
const returnBooking = { ...b, returnJourney: true, returnDate: day, returnTime: "19:30" };
assert.equal(savedQuoteMatchesConfirmedBooking(returnQuote, b), false);
assert.ok(savedQuoteMatchesConfirmedBooking(returnQuote, returnBooking));
assert.equal(savedQuoteMatchesConfirmedBooking(returnQuote, { ...returnBooking, returnTime: "20:30" }), false);
assert.equal(savedQuoteMatchesConfirmedBooking(returnQuote, { ...returnBooking, cancelledLegs: ["return"] }), false);
const returnLegQuote = { ...q, journey: { ...q.journey, pickupLabel: b.dropoffLabel, dropoffLabel: b.pickupLabel, tripTime: "19:30" } };
assert.ok(savedQuoteMatchesConfirmedBooking(returnLegQuote, returnBooking));
console.log("PASS matching: customer/route/date/time, return legs, cancellation, refund and test exclusions");

const historical = memoryStore([q], [{ ...b, paymentReference: "A-DECOY", customerEmail: "other@example.invalid" }, b], false);
assert.ok(await suppressSavedQuoteReminderForBookedJourney(historical.store, q));
assert.equal(JSON.parse(historical.data.get(savedQuoteTokenKey(q.token))!).status, "booked");
assert.deepEqual(JSON.parse(historical.data.get(savedQuoteOpenIndexKey())!).tokens, []);
console.log("PASS historical unindexed booking and paginated lookup; quote closed and removed from open reminders");

const originalFetch = globalThis.fetch;
let sends = 0;
globalThis.fetch = async () => { sends++; return new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 }); };
try {
  for (const final of [false, true]) {
    sends = 0;
    const one = quote(final), two = quote(final, "b".repeat(48));
    const mem = memoryStore([one, two], [b]);
    const result = await processSavedQuoteReminders({ TRACKING_STORE: mem.store, RESEND_API_KEY: "mock-only" });
    assert.equal(sends, 0);
    assert.equal(result.skipped, 2);
    assert.equal(result.errors, 0);
    for (const entry of [one, two]) {
      const stored = JSON.parse(mem.data.get(savedQuoteTokenKey(entry.token))!);
      assert.equal(stored.status, "saved");
      assert.equal(stored.paymentReference, undefined);
    }
    assert.deepEqual(JSON.parse(mem.data.get(savedQuoteOpenIndexKey())!).tokens, [one.token, two.token]);
    console.log(`PASS actual ${final ? "final" : "first"} reminder processor: duplicate saved quotes suppressed, zero sends`);

    const unrelated = memoryStore([quote(final)], [{ ...b, tripTime: "11:25" }]);
    const legitimate = await processSavedQuoteReminders({ TRACKING_STORE: unrelated.store, RESEND_API_KEY: "mock-only" });
    assert.equal(sends, 0);
    assert.equal(final ? legitimate.finalReminders : legitimate.firstReminders, 0);
  }
  sends = 0;
  const broken = memoryStore([q], [b]); broken.failLookup();
  const failure = await processSavedQuoteReminders({ TRACKING_STORE: broken.store, RESEND_API_KEY: "mock-only" });
  assert.equal(sends, 0);
  assert.equal(failure.errors, 0);
  console.log("PASS all automatic follow-ups disabled, including unrelated journeys and failed booking lookups");
} finally { globalThis.fetch = originalFetch; }
console.log("All saved-quote booking suppression checks passed. No real emails or payments sent.");

}
main().catch(error => { console.error(error); process.exitCode = 1; });

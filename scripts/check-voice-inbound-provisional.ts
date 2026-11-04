/** Inbound greeting context + provisional unpaid booking from a phone quote. */
import assert from "node:assert/strict";
import { handleVoiceInbound } from "../workers/addresses/src/voice-inbound";
import { handleVoiceProvisionalBooking } from "../workers/addresses/src/voice-provisional";
import { appendVoiceCallLog, listVoiceCallLogs } from "../workers/addresses/src/voice-call-log-store";

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = kv.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      kv.set(key, value);
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
    kv,
  };
}

async function main() {
  const store = memoryStore();

  // Inbound with no bookings → greeting + no PII dump.
  let res = await handleVoiceInbound(
    new Request("https://w/voice/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromNumber: "07700900123" }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
    new Date("2026-11-04T15:00:00Z"),
  );
  let body = await res.json();
  assert.equal(body.knownCaller, false);
  assert.equal(body.hasUpcomingBooking, false);
  assert.match(body.greeting, /My Airport Taxi NI/);
  assert.equal(body.bookingReference, undefined);
  assert.equal(body.pickupLabel, undefined);

  // Landline still gets a greeting (no booking lookup) — never dumps PII.
  res = await handleVoiceInbound(
    new Request("https://w/voice/inbound", {
      method: "POST",
      body: JSON.stringify({ fromNumber: "02896022952" }),
      headers: { "Content-Type": "application/json" },
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
    new Date("2026-11-04T20:00:00Z"),
  );
  body = await res.json();
  assert.match(body.greeting, /Good evening, My Airport Taxi NI/);
  assert.equal(body.knownCaller, false);
  assert.equal(body.hasUpcomingBooking, false);
  console.log("OK  inbound greeting for unknown / landline; no journey PII");

  // Provisional without a prior voice quote memo → ask for price first.
  res = await handleVoiceProvisionalBooking(
    new Request("https://w/voice/provisional-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId: "aabbccddeeff00112233445566778899",
        name: "Sam Test",
        email: "sam@example.com",
        mobile: "07700900123",
        termsAccepted: "yes",
      }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.say, /fixed price/i);
  console.log("OK  provisional refuses without a phone-made quote");

  // Seed a quote memo + quick-quote record shaped like createPricedQuickQuote.
  const quoteId = "aabbccddeeff00112233445566778899aabbccdd";
  const quote = {
    id: quoteId,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    status: "open",
    journey: {
      pickupAddress: "Belfast International Airport",
      dropoffAddress: "12 Main Street, Bangor",
      airportCode: "BFS",
      fromAirport: true,
      returnJourney: false,
      outboundDate: "2026-12-01",
      outboundTime: "09:00",
      passengers: 2,
      suitcases: 2,
      vehicleType: "Standard Saloon (1–4 passengers)",
    },
    quotedAmount: 45,
    quotedAmountLabel: "£45",
  };
  await store.put(`quick-quote:id:${quoteId}`, JSON.stringify(quote));
  await store.put(
    `voice:quote:${quoteId}`,
    JSON.stringify({
      amountLabel: "£45",
      journeyLabel: "Belfast International Airport to 12 Main Street (return)",
      whenLabel: "1 Dec 2026 at 09:00",
      heldFor: "24 hours",
      bookingUrl: `https://www.myairporttaxini.co.uk/book-quote/?id=${quoteId}`,
    }),
  );

  const counter = memoryStore();
  await counter.put("next_booking_ref", "1001");

  res = await handleVoiceProvisionalBooking(
    new Request("https://w/voice/provisional-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId,
        name: "Sam Test",
        email: "sam@example.com",
        mobile: "07700900123",
        termsAccepted: "yes",
      }),
    }),
    {
      TRACKING_STORE: store as unknown as KVNamespace,
      BOOKING_COUNTER: counter as unknown as KVNamespace,
      SITE_ORIGIN: "https://www.myairporttaxini.co.uk",
    },
  );
  body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.paymentStatus, "awaiting_payment");
  assert.match(body.bookingReference, /^MATNI-\d+$/);
  assert.match(body.say, /not confirmed until you pay|hold only|isn't paid yet|isn.t paid yet/i);
  assert.match(body.say, /Your driver/);
  assert.match(body.say, /We'/);
  assert.match(body.bookingLink, /book-quote/);
  const firstRef = body.bookingReference;

  // Duplicate quoteId → same reference, no second job.
  res = await handleVoiceProvisionalBooking(
    new Request("https://w/voice/provisional-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId,
        name: "Sam Test",
        email: "sam@example.com",
        mobile: "07700900123",
        termsAccepted: "yes",
      }),
    }),
    {
      TRACKING_STORE: store as unknown as KVNamespace,
      BOOKING_COUNTER: counter as unknown as KVNamespace,
    },
  );
  body = await res.json();
  assert.equal(body.deduplicated, true);
  assert.equal(body.bookingReference, firstRef);
  assert.equal(body.paymentStatus, "awaiting_payment");
  console.log("OK  provisional creates awaiting_payment and deduplicates");

  await appendVoiceCallLog(store as unknown as KVNamespace, {
    mobile: "07700900123",
    conversationId: "conv-1",
    summary: "Quoted £45 Bangor",
    outcome: "logged",
    enquiry: "a taxi from Belfast International to Bangor",
  });
  const logs = await listVoiceCallLogs(store as unknown as KVNamespace, 10);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]!.phoneSuffix, "0123");
  assert.doesNotMatch(JSON.stringify(logs), /07700900123/);
  console.log("OK  call log stores redacted suffix only");

  console.log("check-voice-inbound-provisional: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

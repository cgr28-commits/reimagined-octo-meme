/**
 * Realistic receptionist conversation checks (quotation, return, airport, links,
 * provisional, existing booking copy, unavailable/tool-failure style says, messages).
 * Does not call live Fonio or SumUp.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voiceQuoteDraft, voiceQuoteSay } from "../shared/voice-quote";
import {
  VOICE_BOOKING_NOT_FOUND_SAY,
  voiceBookingSay,
  voiceMobileOnlySay,
  matchVoiceBooking,
} from "../shared/voice-booking";
import { handleVoiceMessage } from "../workers/addresses/src/voice-message";

const now = new Date("2026-11-04T12:00:00Z");

function memoryStore() {
  const kv = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = kv.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
  };
}

async function main() {
  // 1) Quotation — one question at a time through a partial journey.
  let step = voiceQuoteDraft({ pickup: "Dublin Airport" }, now);
  assert.ok(!step.ok && step.askNext === "dropoff");
  step = voiceQuoteDraft({ pickup: "Dublin Airport", dropoff: "BT9 Belfast" }, now);
  assert.ok(!step.ok && step.askNext === "date");
  step = voiceQuoteDraft({
    pickup: "Dublin Airport",
    dropoff: "BT9 Belfast",
    date: "2026-11-20",
    time: "14:00",
    passengers: 2,
    suitcases: 2,
    returnJourney: "yes",
  }, now);
  assert.ok(!step.ok && step.askNext === "returnDate");
  console.log("OK  one-question quotation path including return");

  // 2) Airport collection quote say — company voice, quotation≠booking.
  const airport = voiceQuoteDraft({
    pickup: "Belfast International Airport",
    dropoff: "12 Main Street, Bangor",
    date: "2026-11-20",
    time: "09:00",
    passengers: 2,
    suitcases: 1,
    flightNumber: "EI3550",
  }, now);
  assert.ok(airport.ok);
  if (airport.ok) {
    const say = voiceQuoteSay({
      amount: 45,
      draft: airport.draft,
      vehicle: "Standard Saloon (1–4 passengers)",
      requestOnly: false,
      shortNotice: false,
    });
    assert.match(say, /\bWe\b/);
    assert.match(say, /quotation|secure link/i);
    assert.doesNotMatch(say, /\bI am\b|\bI'm your driver\b/i);
    assert.doesNotMatch(say, /surcharge|card number|CVV/i);
  }
  console.log("OK  airport quotation say: we / not paid / no card details");

  // 3) Unavailable-style and unclear-address copy live in the Worker handler.
  const quoteHandler = readFileSync("workers/addresses/src/voice-quote.ts", "utf8");
  assert.match(quoteHandler, /unavailable: availability\.reason/);
  assert.match(quoteHandler, /needsClearerAddress: true/);
  assert.match(quoteHandler, /toolFailed: true/);
  assert.match(quoteHandler, /sendBySms: true/);
  assert.match(quoteHandler, /Your driver is confirmed after payment/);
  console.log("OK  unavailable, clearer-address, tool-failure and SMS fallback wired");

  // 4) Provisional copy stresses unpaid hold.
  const provisional = readFileSync("workers/addresses/src/voice-provisional.ts", "utf8");
  assert.match(provisional, /not confirmed until you pay|That's a hold only/i);
  assert.match(provisional, /awaiting_payment/);
  assert.doesNotMatch(provisional, /createSumUp|status:\s*"paid"/);
  console.log("OK  provisional hold never marks paid");

  // 5) Existing booking verification copy.
  assert.match(voiceMobileOnlySay(1), /security/);
  assert.match(VOICE_BOOKING_NOT_FOUND_SAY, /M-A-T/);
  const fake = {
    customerReference: "MAT-1234",
    mobileNumber: "07700900123",
    customerName: "Sam Test",
    tripDate: "2026-12-01",
    tripTime: "10:00",
    pickupLabel: "BFS",
    dropoffLabel: "Bangor",
    passengers: 2,
    returnJourney: false,
    status: "confirmed",
    paymentReference: "pay1",
  } as const;
  const match = matchVoiceBooking({
    reference: "MAT-1234",
    mobile: "07700900999",
    byReference: fake as never,
    candidates: [],
    now,
  });
  assert.equal(match.kind, "not_found", "Wrong mobile must not reveal the booking");
  const verified = matchVoiceBooking({
    reference: "MAT-1234",
    mobile: "07700900123",
    byReference: fake as never,
    candidates: [],
    now,
  });
  assert.equal(verified.kind, "verified");
  if (verified.kind === "verified") {
    assert.match(voiceBookingSay(verified.booking, { name: "Pat" }, now), /Your driver will be Pat/);
  }
  console.log("OK  existing booking: verify ref+mobile; Manage Booking path only");

  // 6) Leave message / urgent escalation.
  const store = memoryStore();
  let res = await handleVoiceMessage(
    new Request("https://w/voice/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Aoife",
        mobile: "07700900123",
        message: "Flight delayed, need a car from Dublin tonight",
        urgent: "yes",
        pickup: "Dublin Airport",
        destination: "Belfast",
      }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  let body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.urgent, true);
  assert.match(body.say, /urgent/i);
  res = await handleVoiceMessage(
    new Request("https://w/voice/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: "07700900123", message: "Please call back about Bangor tomorrow" }),
    }),
    { TRACKING_STORE: store as unknown as KVNamespace },
  );
  body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.say, /call you back/i);
  assert.doesNotMatch(body.say, /anything else I can help/i);
  assert.doesNotMatch(body.say, /My Airport Taxi NI/i, "Spoken turns omit the full business name");
  console.log("OK  leave-message and urgent escalation");

  // 7) Scenario coverage checklist + reviewable prompt.
  const prompt = readFileSync("docs/fonio-receptionist-prompt.md", "utf8");
  assert.match(prompt, /Ask only one question at a time/);
  assert.match(prompt, /Natural business name usage/);
  assert.match(prompt, /daylight saving|Europe\/London|Inbound Webhook/i);
  assert.match(prompt, /Do NOT ask “Is there anything else I can help you with\?”/);
  assert.match(prompt, /answer truthfully|Do not pretend to be human/i);
  assert.match(prompt, /sayAfterSmsSent|Only after SMS succeeds/i);
  assert.match(prompt, /more than 24 hours before pickup|within 24 hours/i);
  assert.match(prompt, /Belfast International|Dublin|return journey|urgent|interrupt/i);
  assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /sayAfterSmsSent/);
  assert.match(readFileSync("workers/addresses/src/index.ts", "utf8"), /\/voice\/message/);
  assert.doesNotMatch(
    readFileSync("workers/addresses/src/voice-message.ts", "utf8"),
    /Is there anything else I can help/,
  );
  assert.match(readFileSync("AGENTS.md", "utf8"), /natural business name/i);

  // 8) Correction / interruption / AI-honesty are prompt behaviours (documented).
  assert.match(prompt, /interruptions and corrections/i);
  assert.match(prompt, /automated phone receptionist/);
  console.log("check-voice-receptionist-flow: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** NI-local greeting helper + inbound greeting field. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOICE_BOOKING_AFTER_PAYMENT_SAY,
  VOICE_LINK_SENT_SAY,
  londonHourNow,
  voiceDayPart,
  voiceOpeningGreeting,
} from "../shared/voice-greeting";
import { handleVoiceInbound } from "../workers/addresses/src/voice-inbound";

assert.equal(voiceDayPart(new Date("2026-07-01T08:00:00Z")), "morning"); // BST
assert.equal(voiceDayPart(new Date("2026-07-01T14:00:00Z")), "afternoon");
assert.equal(voiceDayPart(new Date("2026-07-01T19:00:00Z")), "evening");
assert.equal(voiceDayPart(new Date("2026-01-15T09:00:00Z")), "morning"); // GMT
assert.ok(londonHourNow(new Date("2026-07-01T12:00:00Z")) === 13); // BST = UTC+1

const morning = voiceOpeningGreeting({ now: new Date("2026-07-01T08:30:00Z") });
assert.equal(morning.dayPart, "morning");
assert.match(morning.greeting, /^Good morning, My Airport Taxi NI\. How can we help\?$/);
const named = voiceOpeningGreeting({ firstName: "Aoife Byrne", now: new Date("2026-07-01T15:00:00Z") });
assert.match(named.greeting, /^Good afternoon, My Airport Taxi NI — hello Aoife\. How can we help\?$/);
assert.match(VOICE_LINK_SENT_SAY, /secure link/i);
assert.doesNotMatch(VOICE_LINK_SENT_SAY, /WhatsApp|anything else/i);
assert.match(VOICE_BOOKING_AFTER_PAYMENT_SAY, /payment is verified/i);
assert.doesNotMatch(VOICE_BOOKING_AFTER_PAYMENT_SAY, /driver has been assigned|Your driver is confirmed after payment/i);
console.log("OK  Europe/London day parts + single-name greeting");

async function inbound() {
  const res = await handleVoiceInbound(
    new Request("https://w/voice/inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromNumber: "07700900123" }),
    }),
    {},
    new Date("2026-11-04T09:15:00Z"),
  );
  const body = await res.json();
  assert.match(body.greeting, /My Airport Taxi NI/);
  assert.equal(body.dayPart, "morning");
  assert.equal(body.knownCaller, false);
  // Only one occurrence of the full name in the greeting string.
  assert.equal((body.greeting.match(/My Airport Taxi NI/g) || []).length, 1);
  assert.match(body.sayHint, /once only|Speak the greeting field once/i);
  assert.match(body.sayHint, /Europe\/London/);
}

inbound()
  .then(() => {
    assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /sayAfterSmsAccepted/);
    assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /messageStatus: "accepted"/);
    assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /VOICE_LINK_SENT_SAY/);
    assert.match(readFileSync("workers/addresses/src/voice-quote.ts", "utf8"), /VOICE_BOOKING_AFTER_PAYMENT_SAY/);
    console.log("OK  inbound greeting once + Europe/London; SMS accepted ≠ delivered");
    console.log("check-voice-greeting: OK");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

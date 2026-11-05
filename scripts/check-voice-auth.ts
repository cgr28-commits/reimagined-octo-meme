/** Voice webhook auth + inbound / provisional / call-log wiring. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voiceAuthDenied, voiceRequestSecret, voiceSecretsEqual } from "../shared/voice-auth";
import { phoneSuffixFromMobile, toOwnerVoiceCallLog, truncateVoiceText } from "../shared/voice-call-log";

assert.equal(voiceSecretsEqual("abc", "abc"), true);
assert.equal(voiceSecretsEqual("abc", "abd"), false);
assert.equal(voiceSecretsEqual("abc", "abcd"), false);

const bearer = new Request("https://w/voice/quote", {
  headers: { Authorization: "Bearer secret-value" },
});
assert.equal(voiceRequestSecret(bearer), "secret-value");
const legacy = new Request("https://w/voice/quote", { headers: { "X-Voice-Secret": "legacy-secret" } });
assert.equal(voiceRequestSecret(legacy), "legacy-secret");

assert.equal(voiceAuthDenied(bearer, {}), null, "unset secret allows (dev)");
assert.equal(voiceAuthDenied(bearer, { VOICE_WEBHOOK_SECRET: "secret-value" }), null);
const denied = voiceAuthDenied(new Request("https://w/voice/quote"), { VOICE_WEBHOOK_SECRET: "secret-value" });
assert.ok(denied);
assert.equal(denied!.status, 401);
console.log("OK  Bearer / X-Voice-Secret auth");

assert.equal(phoneSuffixFromMobile("+447700900123"), "0123");
assert.equal(truncateVoiceText("a".repeat(50), 20).endsWith("…"), true);
const redacted = toOwnerVoiceCallLog({
  id: "vc_1",
  createdAt: "2026-11-04T12:00:00Z",
  phoneSuffix: "0123",
  conversationId: "c1",
  direction: "inbound",
  summary: "Caller wanted a quote",
  outcome: "logged",
  followUpQueued: false,
  enquiry: "a taxi from Dublin Airport to Bangor",
});
assert.equal(redacted.phoneSuffix, "0123");
assert.doesNotMatch(JSON.stringify(redacted), /7700900123/);
console.log("OK  call log redaction helpers");

const index = readFileSync("workers/addresses/src/index.ts", "utf8");
assert.match(index, /voiceAuthDenied/);
assert.match(index, /\/voice\/inbound/);
assert.match(index, /\/voice\/address-search/);
assert.match(index, /\/voice\/provisional-booking/);
assert.match(index, /\/voice\/message/);
assert.match(index, /\/owner\/voice-calls/);
assert.match(index, /VOICE_WEBHOOK_SECRET/);
assert.match(readFileSync("workers/addresses/src/voice-inbound.ts", "utf8"), /hasUpcomingBooking/);
assert.match(readFileSync("workers/addresses/src/voice-inbound.ts", "utf8"), /voiceOpeningGreeting/);
assert.match(readFileSync("workers/addresses/src/voice-provisional.ts", "utf8"), /awaiting_payment/);
assert.match(readFileSync("workers/addresses/src/voice-provisional.ts", "utf8"), /Never invents a fare|never marks paid|awaiting_payment/i);
assert.doesNotMatch(
  readFileSync("workers/addresses/src/voice-provisional.ts", "utf8"),
  /status:\s*"paid"|markPaid|createSumUp|createStripeCheckoutSession/,
);
assert.match(readFileSync("workers/addresses/src/voice-provisional.ts", "utf8"), /Stripe payment/);
assert.match(readFileSync("workers/addresses/src/voice-message.ts", "utf8"), /urgent_message|message_captured/);
assert.match(readFileSync("docs/fonio-integration.md", "utf8"), /Do not change live fonio/);
assert.match(readFileSync("docs/fonio-integration.md", "utf8"), /Stripe Checkout/);
assert.doesNotMatch(readFileSync("docs/fonio-integration.md", "utf8"), /SumUp Hosted Checkout/);
assert.match(
  readFileSync("docs/fonio-receptionist-prompt.md", "utf8"),
  /Live prompt\.|Approved for testing|Do not paste into the live Fonio|Do not deploy to production/,
);
assert.doesNotMatch(readFileSync("docs/fonio-receptionist-prompt.md", "utf8"), /SumUp/);
assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /voice\/message/);
assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /Stripe Checkout/);
assert.match(readFileSync("env.example", "utf8"), /VOICE_WEBHOOK_SECRET/);
console.log("OK  inbound, provisional, message, owner call log, Stripe docs wired");

console.log("check-voice-auth: OK");

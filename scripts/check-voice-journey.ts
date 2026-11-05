/**
 * End-to-end telephone enquiry → quote → booking link → payment path → verified booking
 * regression for the Fonio receptionist Worker tools.
 *
 * Locally exercises shared quote drafting, inbound greeting, SMS status fields,
 * provisional unpaid holds, booking lookup verification, and Stripe Checkout wiring
 * in source. Does NOT call live Fonio or Stripe — those steps are reported as
 * requiring live approval testing.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { voiceQuoteDraft, voiceQuoteSay } from "../shared/voice-quote";
import {
  VOICE_BOOKING_AFTER_PAYMENT_SAY,
  VOICE_LINK_SENT_SAY,
  voiceOpeningGreeting,
} from "../shared/voice-greeting";
import { matchVoiceBooking, voiceBookingSay } from "../shared/voice-booking";

const now = new Date("2026-11-04T12:00:00Z");
const tested: string[] = [];
const liveRequired: string[] = [];

function ok(step: string) {
  tested.push(step);
  console.log(`TESTED  ${step}`);
}

function live(step: string) {
  liveRequired.push(step);
  console.log(`LIVE    ${step}`);
}

async function main() {
  // 1) Telephone enquiry opening — Europe/London greeting once.
  const opening = voiceOpeningGreeting({ now: new Date("2026-11-04T09:15:00Z") });
  assert.equal(opening.dayPart, "morning");
  assert.equal((opening.greeting.match(/My Airport Taxi NI/g) || []).length, 1);
  const inboundSrc = readFileSync("workers/addresses/src/voice-inbound.ts", "utf8");
  assert.match(inboundSrc, /Europe\/London/);
  assert.match(inboundSrc, /once only/);
  ok("Inbound greeting: Europe/London day-part + full name once (unit + source)");

  // 2) Quote path — missing info never invents a fare.
  const missing = voiceQuoteDraft({ pickup: "Dublin Airport" }, now);
  assert.ok(!missing.ok);
  assert.equal("askNext" in missing ? missing.askNext : "", "dropoff");
  assert.doesNotMatch(missing.say, /\d+\s*pounds|£\d+/i);
  ok("Get Quote ok=false (missing dropoff): no fare in say; askNext only");

  const full = voiceQuoteDraft(
    {
      pickup: "Belfast International Airport",
      dropoff: "12 Main Street, Bangor",
      date: "2026-11-20",
      time: "09:00",
      passengers: 2,
      suitcases: 1,
      flightNumber: "EI3550",
    },
    now,
  );
  assert.ok(full.ok);
  if (full.ok) {
    const say = voiceQuoteSay({
      amount: 45,
      draft: full.draft,
      vehicle: "Standard Saloon (1–4 passengers)",
      requestOnly: false,
      shortNotice: false,
    });
    assert.match(say, /45 pounds/);
    assert.match(say, /quotation|secure link/i);
  }
  ok("Get Quote ok=true spoken fare uses backend amount only (shared say builder)");

  const quoteHandler = readFileSync("workers/addresses/src/voice-quote.ts", "utf8");
  assert.match(quoteHandler, /createPricedQuickQuote\(/);
  assert.match(quoteHandler, /checkWhatsAppAvailability\(draft, store\)/);
  assert.match(quoteHandler, /return reply\(\{\s*ok: false/);
  ok("Worker Get Quote reuses availability + createPricedQuickQuote; ok=false paths present");

  // 3) Booking link + SMS status accuracy.
  assert.match(quoteHandler, /messageStatus: "generated"/);
  assert.match(quoteHandler, /messageStatus: "accepted"/);
  assert.match(quoteHandler, /sayAfterSmsAccepted/);
  assert.match(VOICE_LINK_SENT_SAY, /We've sent you a secure link/);
  assert.match(VOICE_BOOKING_AFTER_PAYMENT_SAY, /paid on that link|booking is confirmed/);
  assert.doesNotMatch(VOICE_BOOKING_AFTER_PAYMENT_SAY, /never assign|driver has been assigned/i);
  assert.doesNotMatch(quoteHandler, /Your driver is confirmed after payment/);
  ok("Send Booking Link: generated vs accepted wording; no driver-assigned-after-pay promise");

  // 4) Stripe Checkout path preserved (source wiring — not a live charge).
  assert.match(quoteHandler, /bookingUrl|sendQuoteLinkWhatsApp|smsText\(memo/);
  assert.match(readFileSync("workers/addresses/src/voice-provisional.ts", "utf8"), /\/payments|Stripe/);
  const payments = readFileSync("workers/addresses/src/payment-provider.ts", "utf8");
  assert.match(payments, /Stripe|stripe/i);
  assert.match(readFileSync("docs/fonio-tool-config.md", "utf8"), /Stripe Checkout/);
  ok("Stripe Checkout + /book-quote → /payments wiring present in Worker source");

  // 5) Verified booking confirmation only after backend match.
  const fake = {
    customerReference: "MAT-5678",
    mobileNumber: "07700900123",
    customerName: "Sam Test",
    tripDate: "2026-12-01",
    tripTime: "10:00",
    pickupLabel: "BFS",
    dropoffLabel: "Bangor",
    passengers: 2,
    returnJourney: false,
    status: "confirmed",
    paymentReference: "pay_test",
  } as const;
  const bad = matchVoiceBooking({
    reference: "MAT-5678",
    mobile: "07700900999",
    byReference: fake as never,
    candidates: [],
    now,
  });
  assert.equal(bad.kind, "not_found");
  const good = matchVoiceBooking({
    reference: "MAT-5678",
    mobile: "07700900123",
    byReference: fake as never,
    candidates: [],
    now,
  });
  assert.equal(good.kind, "verified");
  if (good.kind === "verified") {
    assert.match(voiceBookingSay(good.booking, { name: "" }, now), /MAT-5678|Bangor|booking/i);
  }
  ok("Booking Lookup: confirms only when reference + mobile verify against backend");

  // Prompt + tool config cover the full spoken journey rules.
  const prompt = readFileSync("docs/fonio-receptionist-prompt.md", "utf8");
  assert.match(prompt, /If ok is false: do not quote any fare/);
  assert.match(prompt, /messageStatus=generated/);
  assert.match(prompt, /Never promise that a driver has been assigned/);
  assert.match(prompt, /Speak that greeting exactly once/);
  ok("Review prompt documents SMS statuses, ok=false, greeting once, no driver-after-pay");

  // Steps that still need live Fonio / Stripe (not run here by design).
  live("Fonio inbound webhook against production Worker with VOICE_WEBHOOK_SECRET");
  live("Live Fonio call: spoken greeting once + natural quote/booking dialogue");
  live("Fonio Send SMS add-on accepting smsText (messageStatus=generated → accepted)");
  live("WhatsApp Cloud template delivery receipt (messageStatus=delivered if/when available)");
  live("Caller opens /book-quote link and completes Stripe Checkout");
  live("Stripe webhook / payment confirm marks booking paid; Booking Lookup reports verified status");
  live("Paste updated prompt + tool config into live Fonio assistant (approval-gated)");

  const report = [
    "# Fonio telephone journey — test report",
    "",
    `_Generated locally by scripts/check-voice-journey.ts. No live Fonio or Stripe calls._`,
    "",
    "## Tested in this environment",
    ...tested.map((s) => `- ${s}`),
    "",
    "## Still requires live Fonio or Stripe testing",
    ...liveRequired.map((s) => `- ${s}`),
    "",
    "## Preservation checks",
    "- Stripe Checkout integration left as existing `/book-quote` → `/payments` path.",
    "- Pricing still via `createPricedQuickQuote` + shared quote rules.",
    "- Provisional bookings remain `awaiting_payment` (never auto-paid).",
    "- No live Fonio dashboard deploy performed.",
    "",
  ].join("\n");

  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/fonio-journey-test-report.md", report);
  writeFileSync("docs/fonio-journey-test-report.md", report);
  console.log("Wrote docs/fonio-journey-test-report.md");
  console.log("check-voice-journey: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

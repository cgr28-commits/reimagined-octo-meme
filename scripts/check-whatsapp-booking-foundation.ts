/**
 * WhatsApp booking foundation + shared quote service checks.
 * Run: npx tsx scripts/check-whatsapp-booking-foundation.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildQuoteFingerprint,
  detectWhatsAppControl,
  formatQuoteSummary,
  parseAirportCode,
  parseJourneyType,
  parsePassengerCount,
  parseUkDate,
  parseUkTime,
  promptForStep,
  WHATSAPP_ONLINE_MAX_PASSENGERS,
} from "../shared/whatsapp-booking";
import {
  parseMetaWhatsAppWebhook,
  timingSafeEqualHex,
  verifyMetaWhatsAppSignature,
} from "../shared/whatsapp-meta";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";

const root = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  console.log("=== Conversation controls ===");
  assert.equal(detectWhatsAppControl("Book"), "book");
  assert.equal(detectWhatsAppControl("Change details"), "change");
  assert.equal(detectWhatsAppControl("Start again"), "restart");
  assert.equal(detectWhatsAppControl("Speak to Colin"), "handoff");
  assert.equal(WHATSAPP_ONLINE_MAX_PASSENGERS, 4);
  assert.match(promptForStep("handoff"), /Colin/i);
  console.log("OK  Book / Change / Start again / Speak to Colin");

  console.log("\n=== Parsers ===");
  assert.equal(parseJourneyType("return"), true);
  assert.equal(parseJourneyType("one-way"), false);
  assert.equal(parseAirportCode("Belfast International"), "BFS");
  assert.equal(parseAirportCode("Belfast City"), "BHD");
  assert.equal(parseAirportCode("Dublin"), "DUB");
  assert.equal(parseUkDate("18/08/2026"), "2026-08-18");
  assert.equal(parseUkTime("2:30pm"), "14:30");
  assert.equal(parsePassengerCount("3"), 3);
  console.log("OK  Journey / airport / date / time parsers");

  console.log("\n=== Quote service reuses website engine (no second algorithm) ===");
  const weekday = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(weekday.ok, true);
  if (weekday.ok) {
    const direct = calculateQuote(
      "Belfast City Hall, Belfast BT1 5GS",
      "BFS",
      weekday.vehicleType,
      false,
      { outboundDate: "2026-08-19", outboundTime: "10:00" },
    );
    assert.ok(direct);
    assert.equal(weekday.amount, direct!.amount);
    assert.equal(weekday.source, "website-pricing-engine");
  }
  const tooMany = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    returnJourney: false,
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
    passengers: 5,
    suitcases: 2,
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.reason, "passenger_limit");
  console.log("OK  Authoritative quote matches calculateQuote; >4 passengers rejected");

  console.log("\n=== Meta webhook parse + signature helper ===");
  const parsed = parseMetaWhatsAppWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.TEST",
                  from: "447700900000",
                  timestamp: "1",
                  type: "text",
                  text: { body: "Book" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.messages[0]?.text, "Book");
    assert.equal(parsed.messages[0]?.messageId, "wamid.TEST");
  }
  assert.equal(timingSafeEqualHex("abc", "abc"), true);
  assert.equal(timingSafeEqualHex("abc", "abd"), false);
  const sigOk = await verifyMetaWhatsAppSignature("{}", "sha256=deadbeef", "test-secret");
  assert.equal(sigOk, false);
  console.log("OK  Webhook parse + signature verification helpers");

  console.log("\n=== Quote summary + fingerprint ===");
  const summary = formatQuoteSummary({
    returnJourney: false,
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "City Hall",
    dropoffAddress: "BFS",
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 1,
    childSeatRequired: false,
    quotedAmount: 50,
    quotedAmountLabel: "£50",
  });
  assert.match(summary, /£50/);
  assert.match(summary, /Book/i);
  assert.equal(
    buildQuoteFingerprint({
      returnJourney: false,
      airportCode: "BFS",
      pickupAddress: "A",
      outboundDate: "2026-08-19",
      outboundTime: "10:00",
      passengers: 2,
      suitcases: 1,
    }).includes("BFS"),
    true,
  );
  console.log("OK  Quote summary for WhatsApp");

  console.log("\n=== Worker wiring present ===");
  const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
  assert.match(index, /\/whatsapp\/webhook/);
  assert.match(index, /\/quote\/calculate/);
  assert.match(index, /handleWhatsAppWebhookPost/);
  assert.match(index, /handleQuoteCalculateRequest/);
  assert.match(index, /notifyWhatsAppPaymentFinalized/);
  const handlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/whatsapp-handlers.ts"),
    "utf8",
  );
  assert.match(handlers, /calculateAuthoritativeWebsiteQuote/);
  assert.match(handlers, /createSumUpHostedCheckout/);
  assert.match(handlers, /claimWhatsAppMessageId/);
  assert.match(handlers, /savePendingCheckout/);
  assert.doesNotMatch(handlers, /NEXT_PUBLIC_META/);
  console.log("OK  Worker routes + no client Meta tokens");

  console.log("\nAll WhatsApp booking foundation checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

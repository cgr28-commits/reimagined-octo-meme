/**
 * How-heard survey: confirmation footer, reply parsing, and separation from Ads.
 * Run: npx tsx scripts/check-how-heard-source.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickAdsClickIdentifier } from "../shared/google-ads-click-conversions";
import { offlineFeedRowFor } from "../shared/google-ads-offline-feed";
import {
  HOW_HEARD_OPTIONS,
  bookingConfirmedHowHeardFooter,
  parseHowHeardReply,
} from "../shared/how-heard-source";
import { whatsAppTemplateDefinitions } from "../workers/addresses/src/whatsapp-templates";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Confirmation footer options ===");
const footer = bookingConfirmedHowHeardFooter();
assert.match(footer, /One quick question!/);
assert.match(footer, /How did you hear about My Airport Taxi NI\?/);
assert.match(footer, /Google Sponsored Listing \(Advert\)/);
assert.match(footer, /Google Search \(Normal Results\)/);
assert.match(footer, /Facebook \/ Social Media/);
assert.match(footer, /Friend or Family Recommendation/);
assert.match(footer, /Previous Customer/);
assert.match(footer, /Simply reply with the number/);
assert.equal(HOW_HEARD_OPTIONS.length, 6);
console.log("OK  footer matches the approved wording");

console.log("=== Reply parsing ===");
assert.equal(parseHowHeardReply("1")?.key, "google_sponsored_listing");
assert.equal(parseHowHeardReply("1️⃣")?.key, "google_sponsored_listing");
assert.equal(parseHowHeardReply("2")?.key, "google_search_organic");
assert.equal(parseHowHeardReply("6")?.key, "other");
assert.equal(parseHowHeardReply("1."), parseHowHeardReply("1"));
assert.equal(parseHowHeardReply("  3  ")?.number, 3);
assert.equal(parseHowHeardReply("12"), null);
assert.equal(parseHowHeardReply("Belfast International 1"), null);
assert.equal(parseHowHeardReply("yes"), null);
assert.equal(parseHowHeardReply(""), null);
console.log("OK  only bare 1–6 replies are accepted");

console.log("=== Template v2 keeps journey details and appends the survey ===");
const defs = whatsAppTemplateDefinitions();
const v1 = defs.find((d) => d.name === "mat_booking_confirmed")!;
const v2 = defs.find((d) => d.name === "mat_booking_confirmed_v2")!;
const bodyOf = (def: (typeof defs)[number]) =>
  (def.components.find((c) => c.type === "BODY") as { text: string }).text;
const v1Body = bodyOf(v1);
const v2Body = bodyOf(v2);
assert.match(v1Body, /Reference: \{\{2\}\}/);
assert.match(v2Body, /Reference: \{\{2\}\}\nPickup: \{\{3\}\}\nFrom: \{\{4\}\}\nTo: \{\{5\}\}/);
assert.ok(v2Body.startsWith(v1Body), "journey block must be unchanged before the survey");
assert.match(v2Body, /Google Sponsored Listing \(Advert\)/);
assert.doesNotMatch(v1Body, /One quick question/);
assert.equal(v2.category, "UTILITY");
console.log("OK  v2 is legacy confirmation + survey footer");

console.log("=== Self-reported answer is not an Ads click ID ===");
const selfReported = {
  paymentReference: "PAY-HOW-HEARD",
  createdAt: "2026-11-05T12:00:00.000Z",
  status: "confirmed",
  amount: 58,
  currency: "GBP",
  attribution: undefined,
  howHeardSource: "google_sponsored_listing",
  howHeardSourceLabel: "Google Sponsored Listing (Advert)",
} as never;
assert.equal(pickAdsClickIdentifier(undefined), null);
assert.equal(offlineFeedRowFor(selfReported, Date.parse("2026-11-05T18:00:00.000Z")), null);
console.log("OK  how-heard alone never enters the daily Ads file");

console.log("=== Wiring guards ===");
assert.match(read("workers/addresses/src/whatsapp-templates.ts"), /mat_booking_confirmed_v2/);
assert.match(read("workers/addresses/src/whatsapp-handlers.ts"), /parseHowHeardReply/);
assert.match(read("workers/addresses/src/whatsapp-handlers.ts"), /recordHowHeardFromWhatsApp/);
assert.match(read("workers/addresses/src/how-heard-handlers.ts"), /howHeardSource/);
assert.doesNotMatch(read("workers/addresses/src/how-heard-handlers.ts"), /attribution\s*:/);
assert.match(read("src/components/OwnerPaidBookingsPanel.tsx"), /How they heard \(customer reply\)/);
assert.match(
  read("src/lib/privacy.ts"),
  /optional WhatsApp question about how you heard about us/,
);
console.log("OK  handlers, owner panel and privacy keep Ads tracking separate");

console.log("\nAll how-heard source checks passed.");

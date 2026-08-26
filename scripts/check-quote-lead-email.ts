/**
 * Quote-viewed owner alerts must fire via Worker Resend (not browser FormSubmit).
 * Run: npx tsx scripts/check-quote-lead-email.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQuoteLeadFingerprint,
  buildQuoteLeadMessage,
  buildQuoteLeadSubject,
} from "../shared/quote-lead";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Client quote-lead submit path ===");
const client = read("src/lib/submit-quote-lead.ts");
assert.doesNotMatch(client, /sendViaFormSubmitEmail/);
assert.doesNotMatch(client, /submitQuoteLeadViaBrowser/);
assert.match(client, /skipEmail:\s*false/);
assert.match(client, /Quote lead email failed via worker/);
assert.match(client, /readConsentedAdsAttribution/);
assert.match(client, /scheduleQuoteLeadAlert/);
console.log("OK  client posts to Worker only (no FormSubmit / skipEmail:true)");

console.log("\n=== QuoteCard / bot still schedule on live quote ===");
const quoteCard = read("src/components/QuoteCard.tsx");
assert.match(quoteCard, /scheduleQuoteLeadAlert\(/);
assert.match(quoteCard, /quoteStep !== 1/);
const assistant = read("src/components/QuoteAssistant.tsx");
assert.match(assistant, /scheduleQuoteLeadAlert\(/);
console.log("OK  live-quote + bot triggers still present");

console.log("\n=== Worker quote-lead handler ===");
const worker = read("workers/addresses/src/index.ts");
assert.match(worker, /handleQuoteLeadRequest/);
assert.match(worker, /trySendOwnerOperationalEmail/);
assert.match(worker, /releaseQuoteLeadFingerprint/);
assert.match(worker, /buildQuoteLeadSubject/);
assert.match(worker, /buildQuoteLeadMessage/);
// Must not use bare sendEmail (FormSubmit-first) for quote leads.
const quoteLeadHandler = worker.match(
  /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
);
assert.ok(quoteLeadHandler, "handleQuoteLeadRequest block missing");
assert.match(quoteLeadHandler[0], /trySendOwnerOperationalEmail/);
assert.doesNotMatch(
  quoteLeadHandler[0],
  /await sendEmail\(env,\s*\{\s*to: toEmail/,
);
console.log("OK  Worker uses owner operational email chain (Resend-first)");

console.log("\n=== Message content + fingerprint ===");
const details = {
  tripLabel: "Airport drop-off",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "10:00",
  passengers: 2,
  suitcases: 1,
  vehicle: "Estate Car (1–4 passengers)",
  estimatedPrice: "£45.00",
  journeyDistance: "18.2 miles",
  journeyDuration: "32 mins",
  isAirportTrip: true,
  attribution: {
    utm_source: "google",
    utm_medium: "cpc",
    gclid: "test-gclid",
  },
};
const subject = buildQuoteLeadSubject(details);
assert.match(subject, /^Quote viewed — £45\.00 —/);
const message = buildQuoteLeadMessage(details);
assert.match(message, /Pickup: 249 Rashee Road/);
assert.match(message, /Drop-off: Belfast International/);
assert.match(message, /Your fixed journey price: £45\.00/);
assert.match(message, /Passengers: 2/);
assert.match(message, /No contact details yet/);
assert.match(message, /ATTRIBUTION/);
assert.match(message, /Source: google/);
assert.match(message, /Google Ads click identifier captured: gclid/);

const fpA = buildQuoteLeadFingerprint(details);
const fpB = buildQuoteLeadFingerprint({
  ...details,
  attribution: { utm_campaign: "other" },
});
assert.equal(fpA, fpB, "fingerprint must ignore attribution to avoid duplicate emails");
console.log("OK  subject/body include route/fare/attribution; fingerprint stable");

console.log("\nAll quote-lead email checks passed.");

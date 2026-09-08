/**
 * Quote sessions are recorded for the daily report — no immediate owner email.
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

console.log("=== Client records quote sessions and never emails immediately ===");
const client = read("src/lib/submit-quote-lead.ts");
assert.doesNotMatch(client, /sendViaFormSubmitEmail/);
assert.doesNotMatch(client, /submitQuoteLeadViaBrowser/);
assert.match(client, /skipEmail:\s*true/);
assert.match(client, /Never send an immediate owner email/);
assert.doesNotMatch(client, /Quote lead email failed via worker/);
assert.match(client, /scheduleQuoteLeadAlert/);
assert.doesNotMatch(client, /marketingConsent|adsConsent|gtag\(/);
console.log("OK  client posts session updates only (skipEmail true)");

console.log("\n=== QuoteCard / bot keep a stable quoteTransactionId ===");
const quoteCard = read("src/components/QuoteCard.tsx");
assert.match(quoteCard, /scheduleQuoteLeadAlert\(/);
assert.match(quoteCard, /quoteTransactionId/);
assert.match(quoteCard, /if \(quoteTransactionId\) return;/);
assert.doesNotMatch(
  quoteCard,
  /returning with a changed calculation creates a new one/,
);
const assistant = read("src/components/QuoteAssistant.tsx");
assert.match(assistant, /scheduleQuoteLeadAlert\(/);
assert.match(assistant, /botQuoteSessionIdRef/);
console.log("OK  live-quote triggers pass a stable session id");

console.log("\n=== Worker quote-lead handler records only — no owner email ===");
const worker = read("workers/addresses/src/index.ts");
assert.match(worker, /handleQuoteLeadRequest/);
assert.match(worker, /upsertQuoteSession/);
const quoteLeadHandler = worker.match(
  /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
);
assert.ok(quoteLeadHandler, "handleQuoteLeadRequest block missing");
assert.doesNotMatch(quoteLeadHandler[0], /trySendOwnerOperationalEmail/);
assert.doesNotMatch(quoteLeadHandler[0], /trySendEmail|trySendResend|sendViaResend|sendBookingEmail/);
assert.match(quoteLeadHandler[0], /emailed:\s*false/);
assert.match(worker, /sendBookingEmail/);
console.log("OK  Worker stores the session; booking emails stay on the booking path");

console.log("\n=== Transaction-id fingerprint still identifies one session ===");
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
};
const subject = buildQuoteLeadSubject(details);
assert.match(subject, /^Quote viewed — £45\.00 —/);
const message = buildQuoteLeadMessage(details);
assert.match(message, /Pickup: 249 Rashee Road/);
assert.doesNotMatch(message, /ATTRIBUTION/);

const withTxn = { ...details, quoteTransactionId: "quote_abc123XYZ" };
const txnFp = buildQuoteLeadFingerprint(withTxn);
assert.equal(txnFp, "txn:quote_abc123xyz");
assert.equal(
  buildQuoteLeadFingerprint({ ...withTxn, pickupLabel: "Different Road" }),
  txnFp,
  "transaction id must dominate fingerprint even if journey fields change",
);
console.log("OK  txn fingerprint still groups recalculations as one session");

console.log("\nAll quote-lead email restore checks passed.");

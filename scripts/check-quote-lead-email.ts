/**
 * Restore quote-viewed owner alerts via existing Worker email (Resend-first).
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

console.log("=== Client quote-lead submit path (immediate, txn-deduped) ===");
const client = read("src/lib/submit-quote-lead.ts");
assert.doesNotMatch(client, /sendViaFormSubmitEmail/);
assert.doesNotMatch(client, /submitQuoteLeadViaBrowser/);
assert.doesNotMatch(client, /DEBOUNCE_MS/);
assert.doesNotMatch(client, /setTimeout/);
assert.doesNotMatch(client, /clearTimeout/);
assert.match(client, /skipEmail:\s*false/);
assert.match(client, /Quote lead email failed via worker/);
assert.match(client, /scheduleQuoteLeadAlert/);
assert.match(client, /Intentionally no-op/);
assert.doesNotMatch(client, /marketingConsent|adsConsent|gtag\(/);
assert.doesNotMatch(client, /consent.*skip|skip.*consent/i);
console.log("OK  client posts immediately to Worker (no delay / cancel / Ads gate)");

console.log("\n=== QuoteCard / bot fire with quoteTransactionId ===");
const quoteCard = read("src/components/QuoteCard.tsx");
assert.match(quoteCard, /scheduleQuoteLeadAlert\(/);
assert.match(quoteCard, /quoteTransactionId/);
assert.match(quoteCard, /quoteStep !== 1/);
const assistant = read("src/components/QuoteAssistant.tsx");
assert.match(assistant, /scheduleQuoteLeadAlert\(/);
assert.match(assistant, /quoteTransactionId:\s*createQuoteTransactionId/);
console.log("OK  existing live-quote triggers pass transaction id");

console.log("\n=== Worker quote-lead handler (existing Resend operational chain) ===");
const worker = read("workers/addresses/src/index.ts");
assert.match(worker, /handleQuoteLeadRequest/);
assert.match(worker, /trySendOwnerOperationalEmail/);
assert.match(worker, /releaseQuoteLeadFingerprint/);
const quoteLeadHandler = worker.match(
  /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
);
assert.ok(quoteLeadHandler, "handleQuoteLeadRequest block missing");
assert.match(quoteLeadHandler[0], /trySendOwnerOperationalEmail/);
assert.doesNotMatch(
  quoteLeadHandler[0],
  /await sendEmail\(env,\s*\{\s*to: toEmail/,
);
console.log("OK  Worker uses existing owner operational email chain (Resend-first)");

console.log("\n=== Same subject/body as before + transaction-id fingerprint dedupe ===");
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
assert.match(message, /Drop-off: Belfast International/);
assert.match(message, /Your fixed journey price: £45\.00/);
assert.match(message, /Passengers: 2/);
assert.match(message, /No contact details yet/);
assert.doesNotMatch(message, /ATTRIBUTION/);

const legacyFp = buildQuoteLeadFingerprint(details);
assert.match(legacyFp, /249 rashee road/);
assert.equal(legacyFp, buildQuoteLeadFingerprint({ ...details }));

const withTxn = { ...details, quoteTransactionId: "quote_abc123XYZ" };
const txnFp = buildQuoteLeadFingerprint(withTxn);
assert.equal(txnFp, "txn:quote_abc123xyz");
assert.equal(
  buildQuoteLeadFingerprint({ ...withTxn, pickupLabel: "Different Road" }),
  txnFp,
  "transaction id must dominate fingerprint even if journey fields change",
);
assert.notEqual(txnFp, legacyFp);
console.log("OK  classic Quote viewed subject/body preserved; txn fingerprint preferred");

console.log("\nAll quote-lead email restore checks passed.");

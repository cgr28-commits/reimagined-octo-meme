/**
 * Immediate owner quote emails + one contact-details follow-up.
 * Run: npx tsx scripts/check-quote-lead-email.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NO_QUOTE_CONTACT_YET,
  buildQuoteContactFingerprint,
  buildQuoteContactMessage,
  buildQuoteContactSubject,
  buildQuoteLeadFingerprint,
  buildQuoteLeadMessage,
  buildQuoteLeadSubject,
  decideQuoteLeadEmails,
  hasQuoteLeadContact,
  isCompleteFixedPriceQuote,
  runQuoteLeadNotification,
  sanitizeQuoteLeadContact,
  sanitizeQuoteLeadPhone,
  type QuoteLeadDetails,
  type QuoteLeadMarkerStore,
} from "../shared/quote-lead";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const quoteBase: QuoteLeadDetails = {
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
  airportAccessOption: "Free Drop-Off",
  quoteTransactionId: "quote_abc123XYZ",
  source: "website",
};

function createMemoryStore(initial: string[] = []): QuoteLeadMarkerStore {
  const claimed = new Set(initial);
  return {
    async peek(fingerprint) {
      return claimed.has(fingerprint);
    },
    async claim(fingerprint) {
      if (claimed.has(fingerprint)) {
        return false;
      }
      claimed.add(fingerprint);
      return true;
    },
    async release(fingerprint) {
      claimed.delete(fingerprint);
    },
  };
}

console.log("=== Client posts quote sessions and may email; never blocks the UI ===");
{
  const client = read("src/lib/submit-quote-lead.ts");
  assert.doesNotMatch(client, /sendViaFormSubmitEmail/);
  assert.doesNotMatch(client, /submitQuoteLeadViaBrowser/);
  assert.doesNotMatch(client, /skipEmail:\s*true/);
  assert.match(client, /kind,\s*$|kind: "quote"|kind: kind/m);
  assert.match(client, /scheduleQuoteLeadAlert/);
  assert.match(client, /scheduleQuoteContactAlert/);
  assert.match(client, /Quote lead email failed via worker/);
  assert.match(client, /Fail safely/);
  assert.doesNotMatch(client, /marketingConsent|adsConsent|gtag\(/);
  console.log("OK  client requests owner email and keeps the fail-safe");
}

console.log("\n=== QuoteCard / bot keep a stable quoteTransactionId ===");
{
  const quoteCard = read("src/components/QuoteCard.tsx");
  const assistant = read("src/components/QuoteAssistant.tsx");
  assert.match(quoteCard, /scheduleQuoteLeadAlert\(/);
  assert.match(quoteCard, /scheduleQuoteContactAlert\(/);
  assert.match(quoteCard, /notifyOwnerQuoteContactIfReady/);
  assert.match(quoteCard, /quoteTransactionId/);
  assert.match(quoteCard, /if \(quoteTransactionId\) return;/);
  assert.match(quoteCard, /setQuoteTransactionId\(""\)/);
  assert.match(quoteCard, /id="step3-customer-details"/);
  assert.match(quoteCard, /type="tel"/);
  const step1 = quoteCard.slice(
    quoteCard.indexOf('id="step1-journey-details"'),
    quoteCard.indexOf('id="step3-customer-details"'),
  );
  assert.doesNotMatch(step1, /type="tel"/);
  assert.doesNotMatch(step1, /customerMobile|customerName/);
  assert.match(assistant, /scheduleQuoteLeadAlert\(/);
  assert.match(assistant, /scheduleQuoteContactAlert\(/);
  assert.match(assistant, /botQuoteSessionIdRef/);
  assert.match(assistant, /botQuoteSessionIdRef\.current = ""/);
  console.log("OK  form and assistant use a stable session id; phone stays off step 1");
}

console.log("\n=== Worker quote-lead handler emails via operational Resend path ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const handler = worker.match(
    /async function handleQuoteLeadRequest\([\s\S]*?\nasync function handleBookingRequest/,
  );
  assert.ok(handler, "handleQuoteLeadRequest block missing");
  assert.match(handler[0], /upsertQuoteSession/);
  assert.match(handler[0], /runQuoteLeadNotification/);
  assert.match(handler[0], /trySendOwnerOperationalEmail/);
  assert.match(worker, /QUOTE_LEAD_DEDUPE_TTL_SECONDS/);
  assert.doesNotMatch(handler[0], /sendBookingEmail/);
  assert.doesNotMatch(handler[0], /formatAdsAttributionForOwner/);
  assert.match(worker, /sendBookingEmail/);
  const session = read("shared/quote-session.ts");
  assert.match(session, /Never stores customer name \/ mobile \/ email/);
  console.log("OK  Worker emails once via operational path; booking emails stay separate");
}

console.log("\n=== Quote email copy includes journey fields and no-contact wording ===");
{
  const subject = buildQuoteLeadSubject(quoteBase);
  assert.equal(
    subject,
    "Quote viewed — £45.00 — 249 Rashee Road, Ballyclare → Belfast International Airport (BFS)",
  );
  const message = buildQuoteLeadMessage({
    ...quoteBase,
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
    mobileNumber: "07700900123",
  });
  assert.match(message, /Quote source: Website form/);
  assert.match(message, /Journey direction: Airport drop-off/);
  assert.match(message, /Pickup: 249 Rashee Road/);
  assert.match(message, /Destination: Belfast International Airport/);
  assert.match(message, /One-way or return: One-way/);
  assert.match(message, /Travel date & time:/);
  assert.match(message, /Passengers: 2/);
  assert.match(message, /Luggage: 1 large suitcase/);
  assert.match(message, /Quoted price: £45\.00/);
  assert.match(message, /Airport access: Free Drop-Off/);
  assert.match(message, new RegExp(NO_QUOTE_CONTACT_YET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(message, /Ada Example|ada@example\.com|07700900123/);
  assert.doesNotMatch(message, /ATTRIBUTION|gclid|wbraid|gbraid/i);

  const botMessage = buildQuoteLeadMessage({ ...quoteBase, source: "bot" });
  assert.match(botMessage, /Quote source: Chat assistant/);

  const unset = buildQuoteLeadMessage({
    ...quoteBase,
    tripDate: undefined,
    tripTime: undefined,
  });
  assert.match(unset, /Not set/);

  const contactSubject = buildQuoteContactSubject(quoteBase);
  assert.equal(
    contactSubject,
    "Contact details added to quote — £45.00 — 249 Rashee Road, Ballyclare → Belfast International Airport (BFS)",
  );
  const contactMessage = buildQuoteContactMessage({
    ...quoteBase,
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
    mobileNumber: "07700 900123",
  });
  assert.match(contactMessage, /Name: Ada Example/);
  assert.match(contactMessage, /Mobile: 07700 900123/);
  assert.match(contactMessage, /Email: ada@example\.com/);
  console.log("OK  quote and contact email copy");
}

console.log("\n=== Phone validation and contact sanitisation ===");
{
  assert.equal(sanitizeQuoteLeadPhone("07700900123"), "07700900123");
  assert.equal(sanitizeQuoteLeadPhone("07700"), "");
  assert.equal(sanitizeQuoteLeadPhone("not-a-phone"), "");
  assert.equal(sanitizeQuoteLeadPhone(123 as unknown as string), "");
  const valid = sanitizeQuoteLeadContact({
    customerName: " Ada Example ",
    customerEmail: "ada@example.com",
    mobileNumber: "07700900123",
  });
  assert.deepEqual(valid, {
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
    mobileNumber: "07700900123",
  });
  const invalidPhoneOnly = sanitizeQuoteLeadContact({ mobileNumber: "123" });
  assert.equal(hasQuoteLeadContact(invalidPhoneOnly), false);
  assert.equal(isCompleteFixedPriceQuote({ ...quoteBase, pickupLabel: "" }), false);
  assert.equal(isCompleteFixedPriceQuote(quoteBase), true);
  console.log("OK  invalid telephone numbers are dropped before send");
}

console.log("\n=== Transaction-id fingerprint still identifies one session ===");
{
  const txnFp = buildQuoteLeadFingerprint(quoteBase);
  assert.equal(txnFp, "txn:quote_abc123xyz");
  assert.equal(
    buildQuoteLeadFingerprint({ ...quoteBase, pickupLabel: "Different Road", estimatedPrice: "£99.00" }),
    txnFp,
  );
  assert.equal(buildQuoteContactFingerprint(quoteBase), "txn-contact:quote_abc123xyz");
  assert.notEqual(
    buildQuoteLeadFingerprint({ ...quoteBase, quoteTransactionId: "quote_new999" }),
    txnFp,
  );
  console.log("OK  txn fingerprint groups recalculations; a new id is a new quote");
}

console.log("\n=== Behavioural notify: incomplete / first send / recalculate / new quote / retry / contact ===");
async function checkQuoteLeadBehaviour(): Promise<void> {
  async function collect(
    store: QuoteLeadMarkerStore,
    details: QuoteLeadDetails,
    kind: "quote" | "contact",
    sendOk = true,
  ) {
    const emails: Array<{ subject: string; body: string }> = [];
    const result = await runQuoteLeadNotification({
      details,
      kind,
      store,
      sendEmail: async (subject, body) => {
        if (!sendOk) return false;
        emails.push({ subject, body });
        return true;
      },
    });
    return { result, emails };
  }

  const incomplete = await collect(createMemoryStore(), { ...quoteBase, pickupLabel: "" }, "quote");
  assert.equal(incomplete.result.emailed, false);
  assert.equal(incomplete.emails.length, 0);

  const store = createMemoryStore();
  const first = await collect(store, quoteBase, "quote");
  assert.equal(first.result.quoteEmailed, true);
  assert.equal(first.emails.length, 1);
  assert.match(first.emails[0].subject, /^Quote viewed — £45\.00 —/);
  assert.match(first.emails[0].body, /Website form/);

  const recalculated = await collect(
    store,
    { ...quoteBase, passengers: 3, suitcases: 4, estimatedPrice: "£56.00", vehicle: "Estate Car (1–4 passengers)" },
    "quote",
  );
  assert.equal(recalculated.result.emailed, false);
  assert.equal(recalculated.emails.length, 0);

  const newQuote = await collect(
    store,
    { ...quoteBase, quoteTransactionId: "quote_new999", source: "bot" },
    "quote",
  );
  assert.equal(newQuote.result.quoteEmailed, true);
  assert.equal(newQuote.emails.length, 1);
  assert.match(newQuote.emails[0].body, /Chat assistant/);

  const failStore = createMemoryStore();
  const failed = await collect(failStore, quoteBase, "quote", false);
  assert.equal(failed.result.emailed, false);
  const retried = await collect(failStore, quoteBase, "quote", true);
  assert.equal(retried.result.quoteEmailed, true);
  assert.equal(retried.emails.length, 1);

  const contactFirst = await collect(store, {
    ...quoteBase,
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
    mobileNumber: "07700900123",
  }, "contact");
  assert.equal(contactFirst.result.contactEmailed, true);
  assert.equal(contactFirst.result.quoteEmailed, false);
  assert.equal(contactFirst.emails.length, 1);
  assert.match(contactFirst.emails[0].subject, /^Contact details added to quote — £45\.00 —/);
  assert.match(contactFirst.emails[0].body, /Mobile: 07700900123/);

  const contactAgain = await collect(store, {
    ...quoteBase,
    customerName: "Ada Example",
    mobileNumber: "07700900999",
  }, "contact");
  assert.equal(contactAgain.result.emailed, false);
  assert.equal(contactAgain.emails.length, 0);

  const typing = decideQuoteLeadEmails({
    kind: "contact",
    completeQuote: true,
    quoteAlreadyClaimed: true,
    contactAlreadyClaimed: false,
    hasValidContact: false,
  });
  assert.equal(typing.sendContactEmail, false);

  const websiteDecision = decideQuoteLeadEmails({
    kind: "quote",
    completeQuote: true,
    quoteAlreadyClaimed: false,
    contactAlreadyClaimed: false,
    hasValidContact: false,
  });
  assert.equal(websiteDecision.sendQuoteEmail, true);
  console.log("OK  first quote once; recalculation silent; new txn emails; failed send retries; one contact follow-up");
}

checkQuoteLeadBehaviour()
  .then(() => {
    console.log("\nAll quote-lead email restore checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

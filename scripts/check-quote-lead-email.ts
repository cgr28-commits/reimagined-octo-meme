/**
 * Immediate owner quote emails + one contact-details follow-up.
 * Run: npx tsx scripts/check-quote-lead-email.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { profitabilityAdjustmentGbp } from "../workers/addresses/src/profitability";
import {
  NO_QUOTE_CONTACT_YET,
  formatQuoteLeadPricingLines,
  parseQuoteLeadPricing,
  quoteLeadPricingFromDisplayedFare,
  buildQuoteContactFingerprint,
  buildQuoteContactMessage,
  buildQuoteContactSubject,
  buildQuoteLeadFingerprint,
  buildQuoteLeadMessage,
  buildQuoteLeadSubject,
  createSerializedQuoteLeadMarkerStore,
  decideQuoteLeadEmails,
  hasQuoteLeadContact,
  isCompleteFixedPriceQuote,
  sanitizeQuoteLeadAutomaticPrice,
  isFallbackQuotePriceLabel,
  parsePositiveQuotePriceGbp,
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
  totalGbp: 45,
};

function createRacyGetThenPutStore(): QuoteLeadMarkerStore {
  const claimed = new Set<string>();
  return {
    async peek(fingerprint) {
      return claimed.has(fingerprint);
    },
    async claim(fingerprint) {
      const existing = claimed.has(fingerprint);
      await new Promise((resolve) => setTimeout(resolve, 8));
      if (existing) {
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
  assert.match(quoteCard, /instantPriceExpected && !displayedQuoteLeadPricing/);
  assert.match(quoteCard, /quoteLeadPricingFromDisplayedFare/);
  assert.match(quoteCard, /pricing: displayedQuoteLeadPricing/);
  assert.doesNotMatch(quoteCard, /applyProfitabilityProtection/);
  assert.doesNotMatch(quoteCard, /owner-profitability-settings/);
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
  assert.match(worker, /parseQuoteLeadPricing\(body\.pricing\)/);
  assert.doesNotMatch(handler[0], /applyProfitabilityProtection/);
  assert.doesNotMatch(handler[0], /composeWebsiteFareBreakdown/);
  assert.doesNotMatch(handler[0], /calculateQuote\(/);
  const quoteHandlers = read("workers/addresses/src/quote-handlers.ts");
  assert.match(quoteHandlers, /profitabilityAdjustmentGbp\(\{/);
  assert.match(quoteHandlers, /amount: protectedFare\.amountGbp/);
  assert.match(quoteHandlers, /profitabilityAdjustmentGbp: profitabilityAdjustment/);
  assert.match(worker, /QUOTE_LEAD_COORDINATOR/);
  assert.match(worker, /createSerializedQuoteLeadMarkerStore/);
  assert.doesNotMatch(worker, /quote_lead_fp:\$\{fingerprint\}/);
  assert.doesNotMatch(worker, /quote-lead-dedup\.internal/);
  assert.doesNotMatch(
    worker,
    /BOOKING_COUNTER\.get\(key\)[\s\S]{0,180}BOOKING_COUNTER\.put\(key/,
  );
  const coordinator = read("workers/addresses/src/quote-lead-coordinator.ts");
  assert.match(coordinator, /blockConcurrencyWhile/);
  assert.match(coordinator, /class QuoteLeadCoordinator/);
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
  assert.match(message, /Profitability adjustment: Not applied/);
  assert.match(message, /Final customer price: £45\.00/);
  assert.doesNotMatch(message, /Profitability adjustment:\s*$/m);
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
  assert.equal(isFallbackQuotePriceLabel("Quote"), true);
  assert.equal(isFallbackQuotePriceLabel("quote"), true);
  assert.equal(isFallbackQuotePriceLabel("TBC"), true);
  assert.equal(isFallbackQuotePriceLabel("£45.00"), false);
  assert.equal(parsePositiveQuotePriceGbp({ estimatedPrice: "Quote" }), null);
  assert.equal(parsePositiveQuotePriceGbp({ estimatedPrice: "Quote", totalGbp: 45 }), null);
  assert.equal(parsePositiveQuotePriceGbp({ estimatedPrice: "£0.00", totalGbp: 0 }), null);
  assert.equal(isCompleteFixedPriceQuote({ ...quoteBase, estimatedPrice: "Quote", totalGbp: undefined }), false);
  assert.equal(isCompleteFixedPriceQuote({ ...quoteBase, estimatedPrice: "Quote", totalGbp: 45 }), false);
  assert.equal(isCompleteFixedPriceQuote({ ...quoteBase, estimatedPrice: "£0", totalGbp: 0 }), false);
  // NI destinations, including towns outside Greater Belfast, stay on the instant quote.
  const northernIrelandAirportPickup = {
    ...quoteBase,
    tripLabel: "Airport pickup",
    pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
    dropoffLabel: "18 Line of Road, Coalisland, Dungannon BT71 4FJ, UK",
    airportCode: "DUB",
    estimatedPrice: "£204.00",
    totalGbp: 204,
  };
  assert.equal(isCompleteFixedPriceQuote(northernIrelandAirportPickup), true);
  assert.equal(
    sanitizeQuoteLeadAutomaticPrice(northernIrelandAirportPickup).estimatedPrice,
    "£204.00",
  );
  console.log("OK  invalid telephone numbers are dropped; fallback price text cannot email");
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

  const incomplete = await collect(createSerializedQuoteLeadMarkerStore(), { ...quoteBase, pickupLabel: "" }, "quote");
  assert.equal(incomplete.result.emailed, false);
  assert.equal(incomplete.emails.length, 0);

  const store = createSerializedQuoteLeadMarkerStore();
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

  const failStore = createSerializedQuoteLeadMarkerStore();
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

  const fallbackQuote = await collect(
    createSerializedQuoteLeadMarkerStore(),
    { ...quoteBase, estimatedPrice: "Quote", totalGbp: undefined },
    "quote",
  );
  assert.equal(fallbackQuote.result.emailed, false);
  assert.equal(fallbackQuote.emails.length, 0);

  const atomicStore = createSerializedQuoteLeadMarkerStore();
  let atomicSends = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      runQuoteLeadNotification({
        details: quoteBase,
        kind: "quote",
        store: atomicStore,
        sendEmail: async () => {
          atomicSends += 1;
          await new Promise((resolve) => setTimeout(resolve, 15));
          return true;
        },
      }),
    ),
  );
  assert.equal(atomicSends, 1);

  const racyStore = createRacyGetThenPutStore();
  let racySends = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      runQuoteLeadNotification({
        details: quoteBase,
        kind: "quote",
        store: racyStore,
        sendEmail: async () => {
          racySends += 1;
          return true;
        },
      }),
    ),
  );
  assert.ok(racySends > 1, `expected get-then-put race to send more than once, got ${racySends}`);
  console.log("OK  first quote once; recalculation silent; new txn emails; failed send retries; one contact follow-up; concurrent claims send once");
}

console.log("\n=== Owner email reports the customer breakdown without repricing ===");
{
  assert.equal(profitabilityAdjustmentGbp({ applied: false, protectedAmountGbp: 55, existingAmountGbp: 40 }), null);
  assert.equal(profitabilityAdjustmentGbp({ applied: true, protectedAmountGbp: 55, existingAmountGbp: 55 }), 0);
  assert.equal(profitabilityAdjustmentGbp({ applied: true, protectedAmountGbp: 55, existingAmountGbp: 44 }), 11);
  assert.equal(profitabilityAdjustmentGbp({ applied: true, protectedAmountGbp: 40, existingAmountGbp: 55 }), 0);

  const saloonAbove = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 55,
    nightWeekendSurchargeGbp: 5,
    airportAccessChargeGbp: 0,
  });
  assert.equal(saloonAbove.vehicleMinimumFareGbp, null);
  assert.equal(saloonAbove.vehicleMinimumApplied, false);
  assert.equal(saloonAbove.finalAmountPayableGbp, 55);

  const droppedOff = quoteLeadPricingFromDisplayedFare({
    baseJourneyFareGbp: saloonAbove.journeyFareBeforePromotionsGbp,
    nightWeekendSurchargeGbp: saloonAbove.nightWeekendSurchargeGbp,
    airportAccessChargeGbp: saloonAbove.airportAccessChargeGbp,
    returnJourney: false,
    returnDiscountGbp: 0,
    vehicleMinimumFareGbp: saloonAbove.vehicleMinimumFareGbp,
    vehicleMinimumApplied: saloonAbove.vehicleMinimumApplied,
    finalCustomerPriceGbp: saloonAbove.finalAmountPayableGbp,
    profitabilityAdjustmentGbp: 11,
    pricingVersion: 4,
  });
  assert.equal(droppedOff.finalCustomerPriceGbp, saloonAbove.finalAmountPayableGbp);
  assert.equal(droppedOff.baseJourneyFareGbp, 50);
  const dropoffEmail = buildQuoteLeadMessage({
    ...quoteBase,
    vehicle: "Standard Saloon (1–4 passengers)",
    estimatedPrice: "£40.00",
    totalGbp: 40,
    pricing: droppedOff,
  });
  assert.match(dropoffEmail, /Vehicle: Standard Saloon \(1–4 passengers\)/);
  assert.match(dropoffEmail, /Base journey fare: £50/);
  assert.match(dropoffEmail, /Profitability adjustment: £11 \(included in the customer fare; not added again\)/);
  assert.match(dropoffEmail, /Night & Weekend Surcharge \(10%\): \+£5/);
  assert.match(dropoffEmail, /Airport terminal access: Not applied/);
  assert.match(dropoffEmail, /Vehicle minimum fare: Not applied/);
  assert.match(dropoffEmail, /5% return discount: Not applied/);
  assert.match(dropoffEmail, /Final customer price: £55/);
  assert.match(dropoffEmail, /Quoted price: £55/);
  assert.match(dropoffEmail, /Pricing configuration: 4/);
  assert.match(dropoffEmail, /Quote ID: quote_abc123XYZ/);
  assert.doesNotMatch(dropoffEmail, /Final customer price: £66/);
  assert.doesNotMatch(dropoffEmail, /Final customer price: £71/);
  assert.equal(
    buildQuoteLeadSubject({ ...quoteBase, estimatedPrice: "£40.00", pricing: droppedOff }),
    "Quote viewed — £55 — 249 Rashee Road, Ballyclare → Belfast International Airport (BFS)",
  );

  const noUplift = { ...droppedOff, profitabilityAdjustmentGbp: 0 as number | null };
  assert.match(buildQuoteLeadMessage({ ...quoteBase, pricing: noUplift }), /Profitability adjustment: £0\.00/);
  const notRun = { ...droppedOff, profitabilityAdjustmentGbp: null };
  assert.match(buildQuoteLeadMessage({ ...quoteBase, pricing: notRun }), /Profitability adjustment: Not applied/);

  const withAccess = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 50,
    airportAccessChargeGbp: 5,
    outboundAirportAccessChargeGbp: 5,
  });
  const pickupPricing = quoteLeadPricingFromDisplayedFare({
    baseJourneyFareGbp: withAccess.journeyFareBeforePromotionsGbp,
    nightWeekendSurchargeGbp: withAccess.nightWeekendSurchargeGbp,
    airportAccessChargeGbp: withAccess.airportAccessChargeGbp,
    outboundAirportAccessChargeGbp: withAccess.outboundAirportAccessChargeGbp,
    returnJourney: false,
    returnDiscountGbp: 0,
    vehicleMinimumFareGbp: null,
    vehicleMinimumApplied: false,
    finalCustomerPriceGbp: withAccess.finalAmountPayableGbp,
    profitabilityAdjustmentGbp: null,
    pricingVersion: 4,
  });
  const pickupEmail = buildQuoteLeadMessage({
    ...quoteBase,
    tripLabel: "Airport pickup",
    vehicle: "Estate Car (1–4 passengers)",
    airportAccessOption: "Express Pick-Up",
    pricing: pickupPricing,
  });
  assert.match(pickupEmail, /Journey direction: Airport pickup/);
  assert.match(pickupEmail, /Vehicle: Estate Car \(1–4 passengers\)/);
  assert.match(pickupEmail, /Airport terminal access: \+£5/);
  assert.match(pickupEmail, new RegExp(`Final customer price: £${withAccess.finalAmountPayableGbp}`));
  assert.equal(pickupEmail.match(/\+£5/g)?.length, 1);

  const minimumRaised = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 60,
    airportAccessChargeGbp: 5,
    outboundAirportAccessChargeGbp: 5,
    businessClassMinimumFareGbp: 75,
    outboundOneWayBeforeAccessGbp: 60,
    returnDiscountRate: 0.05,
  });
  assert.equal(minimumRaised.finalAmountPayableGbp, 75);
  assert.equal(minimumRaised.vehicleMinimumApplied, true);
  assert.equal(minimumRaised.vehicleMinimumFareGbp, 75);
  const minimumPricing = quoteLeadPricingFromDisplayedFare({
    baseJourneyFareGbp: minimumRaised.journeyFareBeforePromotionsGbp,
    nightWeekendSurchargeGbp: minimumRaised.nightWeekendSurchargeGbp,
    airportAccessChargeGbp: minimumRaised.airportAccessChargeGbp,
    outboundAirportAccessChargeGbp: minimumRaised.outboundAirportAccessChargeGbp,
    returnJourney: false,
    returnDiscountGbp: 0,
    vehicleMinimumFareGbp: minimumRaised.vehicleMinimumFareGbp,
    vehicleMinimumApplied: minimumRaised.vehicleMinimumApplied,
    finalCustomerPriceGbp: minimumRaised.finalAmountPayableGbp,
    profitabilityAdjustmentGbp: 0,
  });
  const businessEmail = buildQuoteLeadMessage({
    ...quoteBase,
    vehicle: "Executive Saloon (1–4 passengers)",
    pricing: minimumPricing,
  });
  assert.match(businessEmail, /Vehicle minimum fare: £75 \(included in the customer fare; not added again\)/);
  assert.match(businessEmail, /Airport terminal access: \+£5/);
  assert.match(businessEmail, /Final customer price: £75/);
  assert.doesNotMatch(businessEmail, /Final customer price: £150/);
  assert.doesNotMatch(businessEmail, /Final customer price: £80/);

  const aboveMinimum = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 90,
    businessClassMinimumFareGbp: 75,
    outboundOneWayBeforeAccessGbp: 90,
  });
  assert.equal(aboveMinimum.vehicleMinimumApplied, false);
  assert.equal(aboveMinimum.finalAmountPayableGbp, 90);
  const abovePricing = quoteLeadPricingFromDisplayedFare({
    baseJourneyFareGbp: aboveMinimum.journeyFareBeforePromotionsGbp,
    nightWeekendSurchargeGbp: 0,
    airportAccessChargeGbp: 0,
    returnJourney: false,
    returnDiscountGbp: 0,
    vehicleMinimumFareGbp: aboveMinimum.vehicleMinimumFareGbp,
    vehicleMinimumApplied: aboveMinimum.vehicleMinimumApplied,
    finalCustomerPriceGbp: aboveMinimum.finalAmountPayableGbp,
    profitabilityAdjustmentGbp: null,
  });
  assert.match(
    buildQuoteLeadMessage({ ...quoteBase, vehicle: "Minibus (5–7 passengers)", pricing: abovePricing }),
    /Vehicle: Minibus \(5–7 passengers\)[\s\S]*Vehicle minimum fare: Not applied[\s\S]*Final customer price: £90/,
  );

  const returnFare = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 95,
    nightWeekendSurchargeGbp: 0,
    returnJourney: true,
    airportAccessChargeGbp: 10,
    outboundAirportAccessChargeGbp: 5,
    returnAirportAccessChargeGbp: 5,
  });
  const returnPricing = quoteLeadPricingFromDisplayedFare({
    baseJourneyFareGbp: returnFare.originalEligibleJourneyPriceGbp,
    nightWeekendSurchargeGbp: returnFare.nightWeekendSurchargeGbp,
    airportAccessChargeGbp: returnFare.airportAccessChargeGbp,
    outboundAirportAccessChargeGbp: returnFare.outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp: returnFare.returnAirportAccessChargeGbp,
    returnJourney: true,
    returnDiscountGbp: returnFare.returnJourneySavingGbp,
    vehicleMinimumFareGbp: null,
    vehicleMinimumApplied: false,
    finalCustomerPriceGbp: returnFare.finalAmountPayableGbp,
    profitabilityAdjustmentGbp: 8,
    pricingVersion: 4,
  });
  const returnEmail = buildQuoteContactMessage({
    ...quoteBase,
    returnJourney: true,
    tripLabel: "Airport pickup",
    vehicle: "Standard Saloon (1–4 passengers)",
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
    mobileNumber: "07700900123",
    pricing: returnPricing,
  });
  assert.match(returnEmail, /5% return discount: −£/);
  assert.match(returnEmail, /Outbound airport terminal access: \+£5/);
  assert.match(returnEmail, /Return airport terminal access: \+£5/);
  assert.match(returnEmail, /Profitability adjustment: £8 \(included in the customer fare; not added again\)/);
  assert.match(returnEmail, new RegExp(`Final customer price: £${returnFare.finalAmountPayableGbp}`));
  assert.equal(returnPricing.finalCustomerPriceGbp, returnFare.finalAmountPayableGbp);
  const doubled = returnFare.finalAmountPayableGbp + 8;
  assert.doesNotMatch(returnEmail, new RegExp(`Final customer price: £${doubled}`));

  assert.equal(parseQuoteLeadPricing({ finalCustomerPriceGbp: 55, profitabilityAdjustmentGbp: -1 }), undefined);
  assert.deepEqual(parseQuoteLeadPricing(droppedOff), droppedOff);
  const lines = formatQuoteLeadPricingLines({ ...quoteBase, pricing: droppedOff });
  assert.ok(lines.includes("Final customer price: £55"));
  assert.equal(lines.filter((line) => line.startsWith("Profitability adjustment:")).length, 1);
  console.log("OK  email uses the customer total and does not add profitability or minimums again");
}

checkQuoteLeadBehaviour()
  .then(() => {
    console.log("\nAll quote-lead email restore checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

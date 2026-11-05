/**
 * Save My Quote → later paid booking: consented Google Ads click ID continuity.
 * Pure logic + source guards. No live Worker, SumUp, or Google Ads calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  offlineFeedRowFor,
  OFFLINE_FEED_CONVERSION_NAME,
} from "../shared/google-ads-offline-feed";
import { pickAdsClickIdentifier } from "../shared/google-ads-click-conversions";
import {
  buildSavedQuoteCustomerUrl,
  evaluateSavedQuoteAccess,
  toSavedQuotePublicSummary,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import {
  attributionForSavedQuoteStorage,
  mergeSavedQuoteAttributionForPayment,
} from "../shared/saved-quote-ads-attribution";
import { buildOwnerSavedQuoteAlert } from "../workers/addresses/src/saved-quote-handlers";
import { savedQuoteWhatsAppUrl } from "../src/lib/saved-quote-share";

const GCLID = "TEST-GCLID-SAVE-QUOTE-81ec";
const OTHER_GCLID = "TEST-GCLID-BOOKING-81ec";
const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseRecord(overrides: Partial<SavedQuoteRecord> = {}): SavedQuoteRecord {
  return {
    id: "sq1",
    reference: "MAT-261105-1200-ABCD",
    token: "a".repeat(48),
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    journey: {
      pickupLabel: "1 Main St, Belfast",
      dropoffLabel: "Belfast International Airport",
      isAirportTrip: true,
      airportCode: "BFS",
      tripDate: "2026-11-12",
      tripTime: "09:00",
      returnJourney: false,
      passengers: 2,
      suitcases: 2,
      vehicle: "Standard Saloon (1–4 passengers)",
      tripLabel: "Airport drop-off",
    },
    pricing: {
      totalAmount: 58,
      currency: "GBP",
      amountLabel: "£58.00",
    },
    status: "saved",
    createdAt: "2026-11-05T10:00:00.000Z",
    expiresAt: "2026-11-12T10:00:00.000Z",
    ...overrides,
  };
}

console.log("=== Consented Ads click → save storage ===");
const consentedStore = attributionForSavedQuoteStorage({
  measurementConsent: "accepted",
  attribution: { gclid: GCLID, utm_source: "google", utm_medium: "cpc", ad_click: "google" },
});
assert.equal(consentedStore.attributionConsent, "accepted");
assert.equal(consentedStore.attribution?.gclid, GCLID);
assert.equal(consentedStore.attribution?.ad_click, "google");
console.log("OK  accepted consent stores gclid on the saved quote");

console.log("=== Ads click without consent → save storage ===");
const noConsentStore = attributionForSavedQuoteStorage({
  measurementConsent: "unanswered",
  attribution: { gclid: GCLID, ad_click: "google" },
});
assert.equal(noConsentStore.attributionConsent, undefined);
assert.deepEqual(noConsentStore.attribution, { ad_click: "google" });
assert.equal(pickAdsClickIdentifier(noConsentStore.attribution), null);

const rejectedStore = attributionForSavedQuoteStorage({
  measurementConsent: "rejected",
  attribution: { gclid: GCLID },
});
assert.deepEqual(rejectedStore.attribution, { ad_click: "google" });
assert.equal(rejectedStore.attributionConsent, undefined);
console.log("OK  without consent only ad_click is stored; never a click ID");

console.log("=== Organic visitor → save storage ===");
assert.deepEqual(
  attributionForSavedQuoteStorage({
    measurementConsent: "accepted",
    attribution: undefined,
  }),
  {},
);
assert.deepEqual(
  attributionForSavedQuoteStorage({
    measurementConsent: "unanswered",
    attribution: { utm_source: "newsletter" },
  }),
  {},
);
console.log("OK  organic / non-ad saves store no attribution");

console.log("=== Consented save → book later on another device ===");
const restored = mergeSavedQuoteAttributionForPayment({
  bookingAttribution: undefined,
  savedAttribution: consentedStore.attribution,
  savedAttributionConsent: consentedStore.attributionConsent,
  measurementConsent: "accepted",
});
assert.equal(restored?.gclid, GCLID);
assert.equal(pickAdsClickIdentifier(restored)?.value, GCLID);

const feedRow = offlineFeedRowFor(
  {
    paymentReference: "PAY-SAVE-81ec",
    createdAt: "2026-11-05T12:00:00.000Z",
    status: "confirmed",
    amount: 58,
    currency: "GBP",
    attribution: restored,
  } as never,
  Date.parse("2026-11-05T18:00:00.000Z"),
);
assert.ok(feedRow);
assert.equal(feedRow.gclid, GCLID);
assert.equal(feedRow.orderId, "PAY-SAVE-81ec");
assert.match(OFFLINE_FEED_CONVERSION_NAME, /PAID BOOKING-SERVER/);
console.log("OK  later booking restores gclid into the daily HTTPS export");

console.log("=== Ads without consent → book → no click ID ===");
const unpaidConsentBook = mergeSavedQuoteAttributionForPayment({
  bookingAttribution: undefined,
  savedAttribution: noConsentStore.attribution,
  savedAttributionConsent: noConsentStore.attributionConsent,
  measurementConsent: "accepted",
});
assert.deepEqual(unpaidConsentBook, { ad_click: "google" });
assert.equal(pickAdsClickIdentifier(unpaidConsentBook), null);
assert.equal(
  offlineFeedRowFor(
    {
      paymentReference: "PAY-NO-CLICK",
      createdAt: "2026-11-05T12:00:00.000Z",
      status: "confirmed",
      amount: 58,
      currency: "GBP",
      attribution: unpaidConsentBook,
    } as never,
    Date.parse("2026-11-05T18:00:00.000Z"),
  ),
  null,
);
console.log("OK  no captured click ID when the save never stored one");

console.log("=== Organic → save → book unchanged ===");
assert.equal(
  mergeSavedQuoteAttributionForPayment({
    bookingAttribution: undefined,
    savedAttribution: undefined,
    savedAttributionConsent: undefined,
    measurementConsent: "accepted",
  }),
  undefined,
);
console.log("OK  organic path stays empty");

console.log("=== Existing eligible booking click ID wins ===");
const preferBooking = mergeSavedQuoteAttributionForPayment({
  bookingAttribution: { gclid: OTHER_GCLID, utm_campaign: "retarget" },
  savedAttribution: consentedStore.attribution,
  savedAttributionConsent: "accepted",
  measurementConsent: "accepted",
});
assert.equal(preferBooking?.gclid, OTHER_GCLID);
assert.equal(preferBooking?.utm_campaign, "retarget");
console.log("OK  current booking click ID is never overwritten by the saved quote");

console.log("=== Consent withdrawal blocks restore ===");
const withdrawn = mergeSavedQuoteAttributionForPayment({
  bookingAttribution: undefined,
  savedAttribution: consentedStore.attribution,
  savedAttributionConsent: "accepted",
  measurementConsent: "rejected",
});
assert.equal(withdrawn, undefined);
assert.equal(pickAdsClickIdentifier(withdrawn), null);
console.log("OK  known rejection does not restore saved attribution");

console.log("=== Expired saved quote cannot restore ===");
const expired = baseRecord({
  status: "expired",
  attribution: consentedStore.attribution,
  attributionConsent: "accepted",
});
const access = evaluateSavedQuoteAccess(expired, new Date("2026-11-13T10:00:00.000Z"));
assert.equal(access.ok, false);
if (!access.ok) assert.equal(access.error, "expired");
console.log("OK  expired quotes fail access before payment merge");

console.log("=== No click IDs in public APIs, URLs, or customer communications ===");
const withSecret = baseRecord({
  attribution: consentedStore.attribution,
  attributionConsent: "accepted",
});
const publicSummary = toSavedQuotePublicSummary(withSecret);
assert.equal("attribution" in publicSummary, false);
assert.equal("attributionConsent" in publicSummary, false);
assert.doesNotMatch(JSON.stringify(publicSummary), new RegExp(GCLID));

const quoteUrl = buildSavedQuoteCustomerUrl(withSecret.token);
assert.doesNotMatch(quoteUrl, /gclid|wbraid|gbraid|TEST-GCLID/i);

const owner = buildOwnerSavedQuoteAlert(withSecret, "email", "12 Nov 2026");
assert.doesNotMatch(owner.body, new RegExp(GCLID));
assert.doesNotMatch(owner.subject, new RegExp(GCLID));

const wa = savedQuoteWhatsAppUrl(
  {
    ok: true,
    token: withSecret.token,
    reference: withSecret.reference,
    expiresAt: withSecret.expiresAt,
    expiresAtLabel: "12 Nov 2026",
    amount: 58,
    amountLabel: "£58.00",
    currency: "GBP",
    email: withSecret.customerEmail,
    emailSent: false,
    quoteUrl,
    quote: publicSummary,
  },
  true,
);
assert.doesNotMatch(wa, new RegExp(GCLID));
assert.doesNotMatch(decodeURIComponent(wa), new RegExp(GCLID));

const privacy = read("src/lib/privacy.ts");
assert.match(
  privacy,
  /With your consent, Google Ads click identifiers may be stored with your saved quote until it expires\./,
);

const createPayment = read("src/lib/create-payment.ts");
assert.match(createPayment, /measurementConsent:\s*currentMeasurementConsent\(\)/);
assert.match(read("src/lib/saved-quote-api.ts"), /saveQuoteAdsFields/);
assert.match(read("workers/addresses/src/saved-quote-handlers.ts"), /attributionForSavedQuoteStorage/);
assert.match(read("workers/addresses/src/index.ts"), /mergeSavedQuoteAttributionForPayment/);
assert.match(read("shared/saved-quote.ts"), /attribution\?: AdsAttribution/);
const publicType = read("shared/saved-quote.ts");
const publicBlock = publicType.slice(
  publicType.indexOf("export type SavedQuotePublicSummary"),
  publicType.indexOf("export function savedQuoteTokenKey"),
);
assert.doesNotMatch(publicBlock, /attribution/);
console.log("OK  click IDs stay off public APIs, URLs, WhatsApp, owner alert body, and privacy names the practice");

console.log("\nAll saved-quote Ads attribution checks passed.");

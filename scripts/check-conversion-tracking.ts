/** Regression checks for quote → saved lead → verified SumUp purchase measurement. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADS_EVENT_BOOKING_REQUEST_SUBMITTED,
  ADS_EVENT_PURCHASE,
  ADS_EVENT_QUOTE_GENERATED,
} from "../src/lib/google-ads";
import {
  trackBookingRequestSubmitted,
  trackPurchase,
  trackRequestQuoteConversion,
} from "../src/lib/google-ads-client";
import {
  captureAdsAttributionFromLocation,
  readConsentedAdsAttribution,
  readStoredAdsAttribution,
} from "../src/lib/ads-attribution";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import {
  formatAdsAttributionForOwner,
  sanitizeAdsAttribution,
} from "../shared/ads-attribution";

function memoryStorage(store: Map<string, string>): Storage {
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

const local = new Map<string, string>();
const session = new Map<string, string>();
const dataLayer: unknown[] = [];
const gtagCalls: unknown[][] = [];
(globalThis as { window?: unknown }).window = globalThis;
(globalThis as { localStorage?: Storage }).localStorage = memoryStorage(local);
(globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage(session);
(globalThis as { dataLayer?: unknown[] }).dataLayer = dataLayer;
(globalThis as { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
  gtagCalls.push(args);
};
local.set(COOKIE_CONSENT_KEY, "accepted");

function countEvent(name: string): number {
  return dataLayer.filter(
    (item) => item && typeof item === "object" && (item as { event?: string }).event === name,
  ).length;
}

console.log("=== Quote calculation boundary ===");
assert.equal(trackRequestQuoteConversion({ transactionId: "Q-invalid", value: 0 }), false);
assert.equal(countEvent(ADS_EVENT_QUOTE_GENERATED), 0);
assert.equal(
  trackRequestQuoteConversion({
    transactionId: "Q-1001",
    value: 52.5,
    currency: "GBP",
    airport: "BFS",
    journeyType: "Airport drop-off",
    passengers: 2,
    returnJourney: false,
  }),
  true,
);
assert.equal(
  trackRequestQuoteConversion({
    transactionId: "Q-1001",
    value: 52.5,
    currency: "GBP",
  }),
  true,
);
assert.equal(countEvent(ADS_EVENT_QUOTE_GENERATED), 1, "rerender must not duplicate quote");
const directQuoteConversions = gtagCalls.filter(
  (call) =>
    call[0] === "event" &&
    call[1] === "conversion",
);
assert.equal(
  directQuoteConversions.length,
  1,
  "a rerender must produce exactly one direct Request quote conversion",
);
const directQuotePayload = directQuoteConversions[0]?.[2] as Record<string, unknown>;
assert.equal(directQuotePayload.send_to, "AW-18303631278/_hcXCPSz7cscEK7_7JdE");
assert.equal(directQuotePayload.value, 52.5);
assert.equal(directQuotePayload.currency, "GBP");
assert.equal(directQuotePayload.transaction_id, "Q-1001");
const quote = dataLayer.find(
  (item) => item && typeof item === "object" && (item as { event?: string }).event === ADS_EVENT_QUOTE_GENERATED,
) as Record<string, unknown>;
assert.deepEqual(
  {
    airport: quote.airport,
    journey_type: quote.journey_type,
    passengers: quote.passengers,
    return_journey: quote.return_journey,
    value: quote.value,
    currency: quote.currency,
  },
  {
    airport: "BFS",
    journey_type: "Airport drop-off",
    passengers: 2,
    return_journey: false,
    value: 52.5,
    currency: "GBP",
  },
);
console.log("OK  invalid=no event; valid=one event; rerender=idempotent");

console.log("=== Saved booking request boundary ===");
assert.equal(trackBookingRequestSubmitted({ value: 52.5 }), false);
assert.equal(countEvent(ADS_EVENT_BOOKING_REQUEST_SUBMITTED), 0);
assert.equal(
  trackBookingRequestSubmitted({
    bookingReference: "MATNI-4100",
    value: 52.5,
    airport: "BFS",
    journeyType: "Airport drop-off",
  }),
  true,
);
assert.equal(
  trackBookingRequestSubmitted({ bookingReference: "MATNI-4100", value: 52.5 }),
  true,
);
assert.equal(countEvent(ADS_EVENT_BOOKING_REQUEST_SUBMITTED), 1);
console.log("OK  server reference required; saved lead emitted once");

console.log("=== Verified purchase boundary ===");
assert.equal(trackPurchase({ transactionId: "MAT-9001", value: 0 }), false);
assert.equal(trackPurchase({ value: 52.5 }), false);
assert.equal(countEvent(ADS_EVENT_PURCHASE), 0);
const conversionsBeforePurchase = gtagCalls.filter(
  (args) => args[0] === "event" && args[1] === "conversion",
).length;
assert.equal(
  trackPurchase({
    transactionId: "MAT-9001",
    bookingReference: "MAT-9001",
    value: 52.5,
    currency: "GBP",
  }),
  true,
);
assert.equal(
  trackPurchase({
    transactionId: "MAT-9001",
    bookingReference: "MAT-9001",
    value: 52.5,
    currency: "GBP",
  }),
  true,
);
assert.equal(countEvent(ADS_EVENT_PURCHASE), 1, "refresh must not duplicate purchase");
assert.equal(
  gtagCalls.filter((args) => args[0] === "event" && args[1] === "conversion").length,
  conversionsBeforePurchase + 1,
  "verified purchase must fire one labelled Paid Booking Ads conversion",
);
console.log("OK  positive server payload required; refresh is idempotent; one browser Ads send_to");

console.log("=== Attribution persistence and sanitisation ===");
const captured = captureAdsAttributionFromLocation(
  "?gclid=click-123&utm_source=google&utm_medium=cpc&utm_campaign=airport&utm_term=belfast+taxi&utm_content=ad-a&ignored=secret",
);
assert.equal(captured.gclid, "click-123");
assert.equal(readStoredAdsAttribution().utm_campaign, "airport");
assert.equal(readConsentedAdsAttribution()?.utm_source, "google");
assert.deepEqual(
  sanitizeAdsAttribution({ ...captured, ignored: "no", gclid: 123 }),
  {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "airport",
    utm_term: "belfast taxi",
    utm_content: "ad-a",
  },
);
assert.match(formatAdsAttributionForOwner(captured).join("\n"), /Campaign: airport/);
assert.doesNotMatch(formatAdsAttributionForOwner(captured).join("\n"), /click-123/);
assert.deepEqual(sanitizeAdsAttribution({ utm_campaign: "airport\r\nInjected: no" }), {
  utm_campaign: "airport Injected: no",
});
local.set(COOKIE_CONSENT_KEY, "rejected");
assert.equal(readConsentedAdsAttribution(), undefined);
local.set(COOKIE_CONSENT_KEY, "accepted");
console.log("OK  Ads/UTM fields persist; unknown fields and raw click IDs stay out of email");

console.log("=== Server and UI trust boundaries ===");
const quoteCard = readFileSync(join(process.cwd(), "src/components/QuoteCard.tsx"), "utf8");
const submitBooking = readFileSync(join(process.cwd(), "src/lib/submit-booking.ts"), "utf8");
const worker = readFileSync(join(process.cwd(), "workers/addresses/src/index.ts"), "utf8");
const finalize = readFileSync(
  join(process.cwd(), "workers/addresses/src/finalize-paid-checkout.ts"),
  "utf8",
);
const confirmation = readFileSync(
  join(process.cwd(), "src/app/booking-confirmed/BookingConfirmedClient.tsx"),
  "utf8",
);
assert.ok(quoteCard.indexOf("quoteAnalyticsValue") < quoteCard.indexOf("bookingRequestResult"));
assert.match(submitBooking, /bookingSaved && bookingReference/);
assert.match(worker, /bookingSaved,/);
assert.match(finalize, /if \(!isSumUpCheckoutPaid\(checkout\)\)/);
assert.match(finalize, /purchase: verifiedPurchase/);
assert.match(finalize, /maybeUploadPaidBookingAdsConversion/);
assert.doesNotMatch(confirmation, /params\.get\(["']paid["']\) === ["']1["']/);
assert.match(confirmation, /result\.result\?\.purchase/);
console.log("OK  no click/page-load conversions; purchase is server-authored after SumUp PAID");

const adsConfigSource = readFileSync(join(process.cwd(), "src/lib/google-ads.ts"), "utf8");
assert.match(adsConfigSource, /DEFAULT_PURCHASE_CONVERSION_LABEL/);
assert.match(adsConfigSource, /NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL/);
console.log("OK  verified Paid Booking uses its dedicated browser Ads destination");

console.log("\nAll conversion tracking checks passed.");

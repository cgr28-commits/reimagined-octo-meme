/**
 * Step 1 quote funnel diagnostic events — no Ads conversion changes.
 * Run: npx tsx scripts/check-quote-funnel-analytics.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import {
  QUOTE_FUNNEL_EVENTS,
  resetQuoteFunnelAnalyticsForTests,
  trackDropoffPlaceSelected,
  trackPickupPlaceSelected,
  trackQuoteFunnelEvent,
  trackQuoteManualEnquiry,
  trackQuoteRequestClicked,
  trackQuoteStarted,
  trackQuoteToolViewed,
  trackQuoteValidationError,
} from "../src/lib/quote-funnel-analytics";
import {
  ADS_EVENT_QUOTE_GENERATED,
  DEFAULT_QUOTE_CONVERSION_LABEL,
  getGoogleAdsConfig,
} from "../src/lib/google-ads";
import { trackRequestQuoteConversion } from "../src/lib/google-ads-client";

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

function acceptConsent() {
  local.set(COOKIE_CONSENT_KEY, "accepted");
}

function clearConsent() {
  local.delete(COOKIE_CONSENT_KEY);
}

function eventsNamed(name: string) {
  return dataLayer.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "event" in entry &&
      (entry as { event: string }).event === name,
  );
}

console.log("=== Quote funnel diagnostic events ===");

clearConsent();
resetQuoteFunnelAnalyticsForTests();
assert.equal(trackQuoteToolViewed({ page_type: "home" }), false);
assert.equal(eventsNamed(QUOTE_FUNNEL_EVENTS.TOOL_VIEWED).length, 0);
console.log("OK  no funnel events without marketing consent");

acceptConsent();
assert.equal(trackQuoteToolViewed({ page_type: "home" }), true);
assert.equal(trackQuoteToolViewed({ page_type: "home" }), false);
assert.equal(eventsNamed(QUOTE_FUNNEL_EVENTS.TOOL_VIEWED).length, 1);
console.log("OK  quote_tool_viewed once per session/page_type");

assert.equal(trackQuoteStarted("attempt-1", { journey_intent: "to-airport" }), true);
assert.equal(trackQuoteStarted("attempt-1", { journey_intent: "to-airport" }), false);
assert.equal(trackQuoteStarted("attempt-2", { journey_intent: "from-airport" }), true);
console.log("OK  quote_started once per attempt");

assert.equal(
  trackPickupPlaceSelected("attempt-1", "place-abc", { airport_code: "BFS" }),
  true,
);
assert.equal(trackPickupPlaceSelected("attempt-1", "place-abc", {}), false);
assert.equal(
  trackDropoffPlaceSelected("attempt-1", "place-xyz", { airport_code: "BFS" }),
  true,
);
console.log("OK  place selected events require Places placeId and dedupe");

assert.equal(trackQuoteRequestClicked({ cta: "book_now" }), true);
assert.equal(trackQuoteValidationError("places_pickup_not_selected", {}), true);
assert.equal(trackQuoteManualEnquiry("attempt-1", { pricing_path: "manual_quote" }), true);
assert.equal(trackQuoteManualEnquiry("attempt-1", { pricing_path: "manual_quote" }), false);
console.log("OK  request click / validation / manual enquiry");

const lastValidation = eventsNamed(QUOTE_FUNNEL_EVENTS.VALIDATION_ERROR).at(-1) as {
  validation_reason?: string;
};
assert.equal(lastValidation.validation_reason, "places_pickup_not_selected");

for (const call of gtagCalls) {
  const params = call[2];
  if (params && typeof params === "object") {
    assert.equal(
      "send_to" in (params as object),
      false,
      "diagnostic gtag events must not include send_to",
    );
  }
}
console.log("OK  diagnostic events never set Ads send_to");

console.log("\n=== Existing Ads conversions unchanged ===");
assert.equal(ADS_EVENT_QUOTE_GENERATED, "quote_generated");
assert.match(DEFAULT_QUOTE_CONVERSION_LABEL, /^_hcX/);
const config = getGoogleAdsConfig();
assert.ok(config.quoteSendTo.includes(DEFAULT_QUOTE_CONVERSION_LABEL));
assert.equal(config.purchaseSendTo, "");

const beforeQuote = gtagCalls.length;
trackRequestQuoteConversion({
  value: 45,
  currency: "GBP",
  transactionId: "test-quote-funnel-1",
});
assert.ok(gtagCalls.length > beforeQuote);
const conversion = gtagCalls.find(
  (call) => call[0] === "event" && call[1] === "conversion",
);
assert.ok(conversion);
assert.equal(
  (conversion?.[2] as { send_to?: string } | undefined)?.send_to,
  config.quoteSendTo,
);
console.log("OK  quote_generated Ads send_to still works");

const root = process.cwd();
const quoteCard = readFileSync(join(root, "src/components/QuoteCard.tsx"), "utf8");
assert.match(quoteCard, /trackQuoteToolViewed/);
assert.match(quoteCard, /trackQuoteStarted/);
assert.match(quoteCard, /trackPickupPlaceSelected/);
assert.match(quoteCard, /trackDropoffPlaceSelected/);
assert.match(quoteCard, /trackQuoteRequestClicked/);
assert.match(quoteCard, /trackQuoteValidationError/);
assert.match(quoteCard, /trackQuoteManualEnquiry/);
assert.match(quoteCard, /GoogleAdsRequestQuote/);
assert.match(quoteCard, /--matni-cookie-banner-offset/);

const adsClient = readFileSync(join(root, "src/lib/google-ads-client.ts"), "utf8");
assert.match(adsClient, /ADS_EVENT_QUOTE_GENERATED/);
assert.match(adsClient, /hasMarketingCookieConsent/);

const paid = readFileSync(
  join(root, "workers/addresses/src/paid-booking-ads-conversion.ts"),
  "utf8",
);
assert.match(paid, /uploadPaidBookingClickConversion/);

const cookie = readFileSync(join(root, "src/components/CookieConsent.tsx"), "utf8");
assert.match(cookie, /matni-cookie-banner-offset/);
assert.match(cookie, /z-\[70\]/);

const address = readFileSync(join(root, "src/components/AddressInput.tsx"), "utf8");
assert.match(address, /z-\[80\]|z-\[90\]/);
assert.match(address, /typing alone is not enough/);

console.log("OK  wiring + cookie/Places z-index guards");
console.log("\nAll quote funnel analytics checks passed.");

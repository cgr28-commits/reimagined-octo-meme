import assert from "node:assert/strict";
import { consent, memoryStorage } from "./measurement-test-helpers";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import {
  captureAdsAttributionFromLocation,
  dropInMemoryAdsAttribution,
  bookingWithConsentedAdsAttribution,
  hrefWithPendingAdsAttribution,
  clearStoredAdsAttribution,
} from "../src/lib/ads-attribution";
const local = memoryStorage(),
  session = memoryStorage();
Object.assign(globalThis, {
  window: globalThis,
  localStorage: local,
  sessionStorage: session,
  location: { search: "", pathname: "/", hostname: "audit.invalid" },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { cookie: "", referrer: "" },
});
assert.equal(
  hrefWithPendingAdsAttribution("/book", "https://audit.invalid/?gclid=TEST"),
  null,
);
assert.deepEqual(captureAdsAttributionFromLocation("?gclid=TEST"), {});
assert.equal(local.length, 0);
local.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent()));
const first = captureAdsAttributionFromLocation(
  "?gclid=TEST-PAID&utm_source=google&utm_medium=cpc&utm_campaign=paid",
);
assert.equal(first.lastTouch?.source, "Google Ads");
dropInMemoryAdsAttribution();
const second = captureAdsAttributionFromLocation(
  "?utm_source=google&utm_medium=organic&utm_campaign=gbp&utm_content=website",
);
assert.equal(second.firstTouch?.gclid, "TEST-PAID");
assert.equal(second.lastTouch?.source, "Google Business Profile");
assert.equal(second.gclid, undefined);
assert.equal(second.lastTouch?.gclid, undefined);
assert.equal(
  bookingWithConsentedAdsAttribution({ attribution: first }).attribution
    ?.utm_campaign,
  "gbp",
);
dropInMemoryAdsAttribution();
(globalThis as any).location.pathname = "/booking-confirmed/";
assert.equal(
  captureAdsAttributionFromLocation("?checkout_id=TEST").lastTouch?.source,
  "Google Business Profile",
);
local.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent(false)));
clearStoredAdsAttribution();
assert.equal(
  bookingWithConsentedAdsAttribution({ attribution: first }).attribution,
  undefined,
);
console.log(
  "PASS no pre-consent decoration, whole first/last touches, Ads then GBP, payment-return preservation, decline strips attribution",
);

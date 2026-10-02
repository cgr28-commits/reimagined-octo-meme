/**
 * Isolated click-id retention. Test identifiers only.
 * Does not create a booking or call Google Ads.
 * Run: npx tsx scripts/check-ads-click-id-retention.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADS_ATTRIBUTION_COOKIE,
  bookingWithConsentedAdsAttribution,
  captureAdsAttributionFromLocation,
  clearStoredAdsAttribution,
  dropInMemoryAdsAttribution,
  adsClickIdSearchForNavigation,
  hrefWithPendingAdsAttribution,
  readConsentedAdsAttribution,
  readStoredAdsAttribution,
  rememberLandingAdsAttribution,
} from "../src/lib/ads-attribution";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import { sanitizeAdsAttribution } from "../shared/ads-attribution";

const GCLID = "TEST-GCLID-ACCEPT-514b";
const WBRAID = "TEST-WBRAID-ACCEPT-514b";
const GBRAID = "TEST-GBRAID-REJECT-514b";
const RETURN_GCLID = "TEST-GCLID-RETURN-514b";

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
const cookies = new Map<string, string>();
const landingWindow = globalThis as typeof globalThis & {
  window: Window & { __matniLandingSearch?: string };
  localStorage: Storage;
  sessionStorage: Storage;
  document: { cookie: string };
  location: { protocol: string; search: string };
};

landingWindow.window = landingWindow as unknown as Window & { __matniLandingSearch?: string };
landingWindow.localStorage = memoryStorage(local);
landingWindow.sessionStorage = memoryStorage(session);
landingWindow.location = { protocol: "http:", search: "" };
Object.defineProperty(landingWindow, "document", {
  configurable: true,
  value: {
    get cookie() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      if (/Max-Age=0/i.test(raw)) cookies.delete(name);
      else cookies.set(name, pair.slice(eq + 1));
    },
  },
});

function reset() {
  local.clear();
  session.clear();
  cookies.clear();
  dropInMemoryAdsAttribution();
  landingWindow.window.__matniLandingSearch = "";
  landingWindow.location.search = "";
}

function accept() {
  local.set(COOKIE_CONSENT_KEY, "accepted");
}

function reject() {
  local.set(COOKIE_CONSENT_KEY, "rejected");
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("=== Accepted consent after the landing query is gone ===");
reset();
landingWindow.window.__matniLandingSearch = `?gclid=${GCLID}&wbraid=${WBRAID}`;
rememberLandingAdsAttribution(`?gclid=${GCLID}&wbraid=${WBRAID}`);
assert.equal(readConsentedAdsAttribution(), undefined);
assert.equal(session.size, 0);
assert.equal(cookies.size, 0);
rememberLandingAdsAttribution("");
landingWindow.location.search = "";
accept();
const captured = captureAdsAttributionFromLocation("");
assert.equal(captured.gclid, GCLID);
assert.equal(captured.wbraid, WBRAID);
assert.equal(readConsentedAdsAttribution()?.gclid, GCLID);
assert.equal(readStoredAdsAttribution().wbraid, WBRAID);
assert.match(cookies.get(ADS_ATTRIBUTION_COOKIE) ?? "", new RegExp(GCLID));
const paymentBooking = bookingWithConsentedAdsAttribution({
  customerName: "Test Visitor",
  attribution: { gclid: "STALE-NOT-SENT" },
});
assert.equal(paymentBooking.attribution?.gclid, GCLID);
assert.equal(paymentBooking.attribution?.wbraid, WBRAID);
assert.doesNotMatch(JSON.stringify(paymentBooking), /STALE-NOT-SENT/);
console.log("OK  accepted consent keeps gclid and wbraid after the URL changes");

console.log("=== Undecided consent keeps the click ID on the next same-site page ===");
reset();
rememberLandingAdsAttribution(`?gclid=${GCLID}&wbraid=${WBRAID}`);
assert.equal(
  hrefWithPendingAdsAttribution("/airports", `http://127.0.0.1:3023/?gclid=${GCLID}&wbraid=${WBRAID}`),
  `/airports?gclid=${GCLID}&wbraid=${WBRAID}`,
);
assert.equal(adsClickIdSearchForNavigation(""), `?gclid=${GCLID}&wbraid=${WBRAID}`);
accept();
assert.equal(
  hrefWithPendingAdsAttribution("/airports", `http://127.0.0.1:3023/?gclid=${GCLID}`),
  null,
);
assert.equal(adsClickIdSearchForNavigation(""), `?gclid=${GCLID}&wbraid=${WBRAID}`);
reject();
assert.equal(
  hrefWithPendingAdsAttribution("https://wa.me/447549815538", `http://127.0.0.1:3023/?gclid=${GCLID}`),
  null,
);
landingWindow.location.search = `?gbraid=${GBRAID}`;
clearStoredAdsAttribution();
assert.equal(adsClickIdSearchForNavigation(landingWindow.location.search), "");
console.log("OK  links carry the test click ID only while consent is undecided");

console.log("=== Rejected consent ===");
reset();
landingWindow.window.__matniLandingSearch = `?gbraid=${GBRAID}`;
rememberLandingAdsAttribution(`?gbraid=${GBRAID}`);
reject();
clearStoredAdsAttribution();
assert.equal(readConsentedAdsAttribution(), undefined);
assert.equal(session.size, 0);
assert.equal(cookies.size, 0);
assert.equal(landingWindow.window.__matniLandingSearch, "");
accept();
captureAdsAttributionFromLocation("");
assert.equal(readConsentedAdsAttribution(), undefined);
const stripped = bookingWithConsentedAdsAttribution({
  customerName: "Test Visitor",
  attribution: { gbraid: GBRAID },
});
assert.equal("attribution" in stripped, false);
assert.doesNotMatch(JSON.stringify(stripped), /gbraid/);
console.log("OK  rejected consent stores nothing and does not revive the click ID");

console.log("=== Returning visit ===");
reset();
accept();
landingWindow.window.__matniLandingSearch = `?gclid=${RETURN_GCLID}`;
captureAdsAttributionFromLocation(`?gclid=${RETURN_GCLID}`);
assert.equal(readConsentedAdsAttribution()?.gclid, RETURN_GCLID);
dropInMemoryAdsAttribution();
session.clear();
landingWindow.window.__matniLandingSearch = "";
landingWindow.location.search = "";
assert.equal(session.size, 0);
assert.equal(readConsentedAdsAttribution()?.gclid, RETURN_GCLID);
assert.equal(adsClickIdSearchForNavigation(""), `?gclid=${RETURN_GCLID}`);
captureAdsAttributionFromLocation("");
assert.equal(readStoredAdsAttribution().gclid, RETURN_GCLID);
const returnBooking = bookingWithConsentedAdsAttribution({ customerName: "Returning Test" });
assert.equal(returnBooking.attribution?.gclid, RETURN_GCLID);
console.log("OK  a later visit with accepted consent still has the test gclid");

console.log("=== Quote, checkout and paid record keep a consented click ID ===");
const createPayment = read("src/lib/create-payment.ts");
const submitBooking = read("src/lib/submit-booking.ts");
const captureComponent = read("src/components/AdsAttributionCapture.tsx");
const layout = read("src/app/layout.tsx");
const siteNav = read("src/lib/site-nav-scroll.ts");
const quotePrefill = read("src/lib/quote-prefill.ts");
const worker = read("workers/addresses/src/index.ts");
const paidRecord = read("workers/addresses/src/refund-handlers.ts");
const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
assert.match(createPayment, /bookingWithConsentedAdsAttribution\(request\.booking\)/);
assert.match(submitBooking, /bookingWithConsentedAdsAttribution\(submission\.booking\)/);
assert.match(captureComponent, /rememberLandingAdsAttribution\(\)/);
assert.match(captureComponent, /clearStoredAdsAttribution\(\)/);
assert.match(layout, /__matniLandingSearch/);
assert.match(siteNav, /adsClickIdSearchForNavigation\(window\.location\.search\)/);
assert.match(quotePrefill, /adsClickIdSearchForNavigation\(window\.location\.search\)/);
assert.match(captureComponent, /window\.location\.assign\(next\)/);
assert.match(worker, /attribution: sanitizeAdsAttribution\(details\.attribution\)/);
assert.match(paidRecord, /attribution: input\.booking\.attribution/);
assert.match(finalize, /attribution: booking\.attribution/);
const storedForPaidRecord = sanitizeAdsAttribution({
  gclid: GCLID,
  wbraid: WBRAID,
  customerEmail: "not-an-attribution-field",
});
assert.equal(storedForPaidRecord?.gclid, GCLID);
assert.equal(storedForPaidRecord?.wbraid, WBRAID);
assert.equal(
  (storedForPaidRecord as { customerEmail?: string } | undefined)?.customerEmail,
  undefined,
);
console.log("OK  quote submission, SumUp checkout and paid record keep the sanitized click ID");

console.log("\nAll click-id retention checks passed.");

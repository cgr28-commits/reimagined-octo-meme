/**
 * Regression checks for Start a New Quote persistence clearing.
 * Run: npx tsx scripts/check-start-new-quote.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ABANDONED_QUOTE_STORAGE_KEYS,
  clearAbandonedQuotePersistence,
  clearAbandonedQuoteUrlParams,
} from "../src/lib/reset-quote-journey";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

console.log("=== Wiring / wording ===");
const header = read("src/components/Header.tsx");
const footer = read("src/components/Footer.tsx");
const data = read("src/lib/data.ts");
assert.match(header, /Manage Your Booking/);
assert.match(footer, /Manage Your Booking/);
assert.match(data, /Manage Your Booking/);
assert.doesNotMatch(header, />\s*Manage Booking\s*</);
assert.doesNotMatch(footer, />\s*Manage Booking\s*</);
assert.match(header, /href="\/manage-booking\/"/);
assert.match(footer, /href="\/manage-booking\/"/);
assert.match(data, /href: "\/manage-booking\/"/);

const quoteCard = read("src/components/QuoteCard.tsx");
assert.match(quoteCard, /performStartNewQuote/);
assert.match(quoteCard, /clearAbandonedQuotePersistence/);
assert.match(quoteCard, /Start a new quote\?/);
assert.match(quoteCard, /Keep Current Quote/);
assert.match(quoteCard, /id="quote-actions"/);
assert.match(quoteCard, /scheduleRevealQuoteActionsScroll/);
assert.match(quoteCard, /keepCurrentQuote|onClick=\{keepCurrentQuote\}/);
assert.match(quoteCard, /scheduleBookingNavAfterRender\("quote-section-journey"/);
assert.doesNotMatch(
  quoteCard,
  /function requestStartNewQuote\(\) \{[\s\S]*?performStartNewQuote\(\);\s*setConfirmStartNewQuote/,
);
// Opening the panel must not clear; only the green confirm calls performStartNewQuote.
assert.match(quoteCard, /function requestStartNewQuote\(\) \{[\s\S]*?setConfirmStartNewQuote\(true\)/);
const scrollLib = read("src/lib/quote-step-nav-scroll.ts");
assert.match(scrollLib, /scheduleRevealQuoteActionsScroll/);
assert.match(scrollLib, /computeScrollTopToRevealActions/);
assert.match(scrollLib, /visualViewport/);
assert.doesNotMatch(scrollLib, /scheduleRevealQuoteActionsScroll[\s\S]*scrollIntoView/);
console.log("OK  Manage Your Booking nav + Start a New Quote wiring");

console.log("\n=== Persistence clear (jsdom-less memory polyfill) ===");
const store: Record<string, string> = {};
const session: Record<string, string> = {};

(globalThis as { window?: unknown }).window = globalThis;
(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
  key: () => null,
  length: 0,
};
(globalThis as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k) => (k in session ? session[k] : null),
  setItem: (k, v) => {
    session[k] = String(v);
  },
  removeItem: (k) => {
    delete session[k];
  },
  clear: () => {
    for (const k of Object.keys(session)) delete session[k];
  },
  key: () => null,
  length: 0,
};

for (const key of ABANDONED_QUOTE_STORAGE_KEYS.local) {
  store[key] = "stale";
}
store["matni-pending-token-abc"] = "stale-token";
store["matni-payment-confirmed-paid123"] = "1";
store["matni-cookie-consent-v1"] = "accepted";
store["matni-owner-key"] = "secret-owner";
for (const key of ABANDONED_QUOTE_STORAGE_KEYS.session) {
  session[key] = "stale";
}
session["matni-open-checkout-v1"] = JSON.stringify({
  paymentUrl: "https://example.test/pay",
  checkoutId: "chk_abandoned",
  amountLabel: "£45.00",
  returnToken: "abc",
  openedAt: new Date().toISOString(),
});

clearAbandonedQuotePersistence();

for (const key of ABANDONED_QUOTE_STORAGE_KEYS.local) {
  assert.equal(store[key], undefined, `local key should clear: ${key}`);
}
for (const key of ABANDONED_QUOTE_STORAGE_KEYS.session) {
  assert.equal(session[key], undefined, `session key should clear: ${key}`);
}
assert.equal(store["matni-payment-confirmed-paid123"], "1", "confirmed payment marker preserved");
assert.equal(store["matni-cookie-consent-v1"], "accepted", "cookie consent preserved");
assert.equal(store["matni-owner-key"], "secret-owner", "owner key preserved");
console.log("OK  abandoned quote storage cleared; confirmed/auth/consent preserved");

console.log("\n=== URL payment params ===");
const loc = {
  href: "https://www.myairporttaxini.co.uk/?payment=return&return_token=abc&checkout_id=chk1#quote",
  pathname: "/",
  search: "?payment=return&return_token=abc&checkout_id=chk1",
  hash: "#quote",
};
let replaced = "";
(globalThis as { location: typeof loc }).location = loc;
(globalThis as { history: { replaceState: (a: unknown, b: string, url: string) => void } }).history = {
  replaceState: (_a, _b, url) => {
    replaced = url;
  },
};
clearAbandonedQuoteUrlParams();
assert.equal(replaced, "/#quote");
console.log("OK  payment return params stripped; #quote kept");

console.log("\nAll Start a New Quote checks passed.");

/**
 * Validates Google Ads Request quote conversion wiring.
 * Run: npx tsx scripts/check-google-ads-request-quote.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_GOOGLE_ADS_ID,
  DEFAULT_QUOTE_CONVERSION_LABEL,
  getGoogleAdsConfig,
} from "../src/lib/google-ads";
import {
  hasRequestQuoteConversionBeenSent,
  resetRequestQuoteConversion,
  trackRequestQuoteConversion,
} from "../src/lib/google-ads-client";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function installBrowserMocks() {
  const gtagCalls: unknown[][] = [];
  const store = new Map<string, string>();

  // Minimal browser stubs for consent + gtag helpers.
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => (id === "quoteResult" ? { id } : null),
  };
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  (globalThis as { sessionStorage?: Storage }).sessionStorage = {
    getItem: (key: string) => store.get(`s:${key}`) ?? null,
    setItem: (key: string, value: string) => {
      store.set(`s:${key}`, value);
    },
    removeItem: (key: string) => {
      store.delete(`s:${key}`);
    },
    clear: () => {
      for (const key of [...store.keys()]) {
        if (key.startsWith("s:")) store.delete(key);
      }
    },
    key: () => null,
    length: 0,
  } as Storage;

  (globalThis as { dataLayer?: unknown[] }).dataLayer = [];
  (globalThis as { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
    gtagCalls.push(args);
  };

  return {
    gtagCalls,
    acceptConsent() {
      store.set(COOKIE_CONSENT_KEY, "accepted");
    },
    rejectConsent() {
      store.set(COOKIE_CONSENT_KEY, "rejected");
    },
    clearConsent() {
      store.delete(COOKIE_CONSENT_KEY);
    },
  };
}

function main() {
  const mocks = installBrowserMocks();
  const expectedSendTo = `${DEFAULT_GOOGLE_ADS_ID}/${DEFAULT_QUOTE_CONVERSION_LABEL}`;

  check("Defaults use the live Request quote Ads ID and label", () => {
    assert.equal(DEFAULT_GOOGLE_ADS_ID, "AW-18303631278");
    assert.equal(DEFAULT_QUOTE_CONVERSION_LABEL, "_hcXCPSz7cscEK7_7JdE");
    const config = getGoogleAdsConfig();
    assert.equal(config.adsId, "AW-18303631278");
    assert.equal(config.quoteSendTo, expectedSendTo);
    assert.equal(config.quoteEnabled, true);
    assert.equal(config.tagEnabled, true);
  });

  check("Known-bad typo Ads ID/label are rejected in favour of defaults", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-10303631278";
    process.env.NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL = "_hcXCP5z7cscEK7_73dE";
    const config = getGoogleAdsConfig();
    assert.equal(config.adsId, "AW-18303631278");
    assert.equal(config.quoteSendTo, expectedSendTo);
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_QUOTE_CONVERSION_LABEL;
  });

  check("Quote form and quoteResult IDs exist in QuoteCard", () => {
    const source = readFileSync(join(process.cwd(), "src/components/QuoteCard.tsx"), "utf8");
    assert.match(source, /id=["']quoteForm["']/);
    assert.match(source, /id=["']quoteResult["']/);
    assert.match(source, /GoogleAdsRequestQuote/);
    assert.match(source, /resetRequestQuoteConversion/);
  });

  check("Sitewide GoogleAdsTag is mounted from the shared layout", () => {
    const source = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    assert.match(source, /GoogleAdsTag/);
    assert.match(source, /getGoogleAdsConfig/);
    assert.match(source, /CookieConsent/);
  });

  check("Airport and transfer pages reuse the shared QuoteCard", () => {
    const locationQuote = readFileSync(
      join(process.cwd(), "src/components/LocationQuoteSection.tsx"),
      "utf8",
    );
    assert.match(locationQuote, /QuoteCard/);
    const airportPage = readFileSync(join(process.cwd(), "src/app/airports/[slug]/page.tsx"), "utf8");
    const transferPage = readFileSync(
      join(process.cwd(), "src/app/transfers/[slug]/page.tsx"),
      "utf8",
    );
    assert.match(airportPage, /LocationQuoteSection/);
    assert.match(transferPage, /LocationQuoteSection/);
  });

  check("Invalid / no-consent quote does not fire a conversion", () => {
    resetRequestQuoteConversion();
    mocks.gtagCalls.length = 0;
    mocks.clearConsent();
    const fired = trackRequestQuoteConversion({ transactionId: "TEST-INVALID" });
    assert.equal(fired, false);
    assert.equal(hasRequestQuoteConversionBeenSent(), false);
    assert.equal(
      mocks.gtagCalls.filter((call) => call[0] === "event" && call[1] === "conversion").length,
      0,
    );
  });

  check("Valid quote fires exactly one Request quote conversion", () => {
    resetRequestQuoteConversion();
    mocks.gtagCalls.length = 0;
    mocks.acceptConsent();
    const first = trackRequestQuoteConversion({
      transactionId: "TEST-VALID-1",
      value: 45,
      currency: "GBP",
    });
    const second = trackRequestQuoteConversion({
      transactionId: "TEST-VALID-1",
      value: 45,
      currency: "GBP",
    });
    assert.equal(first, true);
    assert.equal(second, true);
    assert.equal(hasRequestQuoteConversionBeenSent(), true);

    const conversionEvents = mocks.gtagCalls.filter(
      (call) => call[0] === "event" && call[1] === "conversion",
    );
    assert.equal(conversionEvents.length, 1);
    const payload = conversionEvents[0]?.[2] as { send_to?: string };
    assert.equal(payload.send_to, "AW-18303631278/_hcXCPSz7cscEK7_7JdE");
  });

  check("Reset allows a later successful quote interaction to convert once", () => {
    mocks.gtagCalls.length = 0;
    resetRequestQuoteConversion();
    mocks.acceptConsent();
    assert.equal(trackRequestQuoteConversion({ transactionId: "TEST-VALID-2" }), true);
    assert.equal(
      mocks.gtagCalls.filter((call) => call[0] === "event" && call[1] === "conversion").length,
      1,
    );
  });

  console.log(`\n${passed} Google Ads Request quote checks passed`);
}

main();

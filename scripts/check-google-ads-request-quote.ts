/**
 * Validates Google Ads quote_generated / Request quote conversion wiring.
 * Run: npx tsx scripts/check-google-ads-request-quote.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADS_EVENT_QUOTE_GENERATED,
  DEFAULT_GOOGLE_ADS_ID,
  DEFAULT_PURCHASE_CONVERSION_LABEL,
  DEFAULT_QUOTE_CONVERSION_LABEL,
  getGoogleAdsConfig,
} from "../src/lib/google-ads";
import {
  resetRequestQuoteConversion,
  trackRequestQuoteConversion,
} from "../src/lib/google-ads-client";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";
import { VEHICLE_TYPES } from "../src/lib/data";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function installBrowserMocks() {
  const gtagCalls: unknown[][] = [];
  const dataLayer: unknown[] = [];
  const store = new Map<string, string>();

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

  (globalThis as { dataLayer?: unknown[] }).dataLayer = dataLayer;
  (globalThis as { gtag?: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
    gtagCalls.push(args);
  };

  return {
    gtagCalls,
    dataLayer,
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
    assert.equal(ADS_EVENT_QUOTE_GENERATED, "quote_generated");
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

  check("Public Ads environment values use statically inlined Next.js reads", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/google-ads.ts"), "utf8");
    assert.match(source, /process\.env\.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL/);
    assert.match(source, /process\.env\.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL/);
    assert.doesNotMatch(source, /process\.env\[name\]/);
  });

  check("Paid Booking uses its verified website conversion label", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL = "GoTQCPuJ3eccEK7_7JdE";
    process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL = "legacy-should-not-apply";
    const config = getGoogleAdsConfig();
    assert.equal(DEFAULT_PURCHASE_CONVERSION_LABEL, "GoTQCPuJ3eccEK7_7JdE");
    assert.equal(
      config.purchaseSendTo,
      `${DEFAULT_GOOGLE_ADS_ID}/${DEFAULT_PURCHASE_CONVERSION_LABEL}`,
    );
    assert.equal(config.purchaseEnabled, true);
    assert.equal(config.purchaseConversionLabel, DEFAULT_PURCHASE_CONVERSION_LABEL);
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL;
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL;
  });

  check("Quote tracking is mounted in the live quote form, not booking success", () => {
    const source = readFileSync(join(process.cwd(), "src/components/QuoteCard.tsx"), "utf8");
    assert.match(source, /id=["']quoteForm["']/);
    assert.match(source, /id=["']bookingRequestResult["']/);
    assert.match(source, /GoogleAdsRequestQuote/);
    assert.match(source, /quoteAnalyticsValue/);
    assert.match(source, /resetRequestQuoteConversion/);
    assert.match(source, /pageType/);
    assert.match(source, /includeUserData=\{false\}/);
  });

  check("EMERGE page reuses QuoteCard with pageType and shared pricing", () => {
    const emerge = readFileSync(
      join(process.cwd(), "src/components/EmergeBelfastPageClient.tsx"),
      "utf8",
    );
    assert.match(emerge, /<QuoteCard/);
    assert.match(emerge, /pageType=["']emerge_belfast["']/);
    assert.match(emerge, /maxPassengers=\{4\}/);
    assert.match(emerge, /initialDropoffHint=\{EMERGE_BELFAST_DESTINATION\}/);
    assert.doesNotMatch(emerge, /calculateQuote|calculatePointToPointQuote|£\d+/);
  });

  check("Identical journeys produce identical prices (shared rate card)", () => {
    const schedule = {
      tripDate: "2026-08-29",
      tripTime: "16:00",
      returnDate: "",
      returnTime: "",
    };
    const metrics = { distanceKm: 108, durationMinutes: 77 };
    const vehicle = VEHICLE_TYPES[0];
    const a2a = calculatePointToPointQuote(
      "1 High Street, Omagh BT78 1AB, Northern Ireland",
      "Boucher Playing Fields, Belfast",
      vehicle,
      false,
      schedule,
      metrics,
    );
    const a2aAgain = calculatePointToPointQuote(
      "1 High Street, Omagh BT78 1AB, Northern Ireland",
      "Boucher Playing Fields, Belfast",
      vehicle,
      false,
      schedule,
      metrics,
    );
    assert.ok(a2a);
    assert.ok(Number.isFinite(a2a!.amount) && a2a!.amount > 0);
    assert.equal(a2a!.amount, a2aAgain!.amount);

    const airport = calculateQuote(
      "10 Donegall Square, Belfast BT1 5GS",
      "BFS",
      vehicle,
      false,
      schedule,
    );
    const airportAgain = calculateQuote(
      "10 Donegall Square, Belfast BT1 5GS",
      "BFS",
      vehicle,
      false,
      schedule,
    );
    assert.ok(airport);
    assert.equal(airport!.amount, airportAgain!.amount);
  });

  check("Sitewide GoogleAdsTag is mounted from the shared layout", () => {
    const source = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    assert.match(source, /GoogleAdsTag/);
    assert.match(source, /AdsAttributionCapture/);
    assert.match(source, /getGoogleAdsConfig/);
    assert.match(source, /CookieConsent/);
  });

  check("Airport and transfer pages reuse the shared QuoteCard", () => {
    const locationQuote = readFileSync(
      join(process.cwd(), "src/components/LocationQuoteSection.tsx"),
      "utf8",
    );
    assert.match(locationQuote, /QuoteCard/);
  });

  check("Invalid / no-consent / missing value or id does not fire a conversion", () => {
    resetRequestQuoteConversion();
    mocks.gtagCalls.length = 0;
    mocks.dataLayer.length = 0;
    mocks.clearConsent();
    assert.equal(
      trackRequestQuoteConversion({ transactionId: "TEST-INVALID", value: 50 }),
      false,
    );

    mocks.acceptConsent();
    assert.equal(trackRequestQuoteConversion({ transactionId: "TEST-NO-VALUE" }), false);
    assert.equal(trackRequestQuoteConversion({ value: 50 }), false);
    assert.equal(trackRequestQuoteConversion({ transactionId: "TEST-ZERO", value: 0 }), false);
    assert.equal(
      mocks.gtagCalls.filter((call) => call[0] === "event" && call[1] === "conversion").length,
      0,
    );
  });

  check("Successful priced quote emits one named event and one direct Ads hit after rerenders", () => {
    resetRequestQuoteConversion();
    mocks.gtagCalls.length = 0;
    mocks.dataLayer.length = 0;
    mocks.acceptConsent();
    const first = trackRequestQuoteConversion({
      transactionId: "TEST-VALID-1",
      value: 45,
      currency: "GBP",
      pageType: "emerge_belfast",
    });
    const second = trackRequestQuoteConversion({
      transactionId: "TEST-VALID-1",
      value: 45,
      currency: "GBP",
      pageType: "emerge_belfast",
    });
    const rerender = trackRequestQuoteConversion({
      transactionId: "TEST-VALID-1",
      value: 45,
      currency: "GBP",
      pageType: "emerge_belfast",
    });
    assert.equal(first, true);
    assert.equal(second, true);
    assert.equal(rerender, true);

    const directConversionEvents = mocks.gtagCalls.filter(
      (call) => call[0] === "event" && call[1] === "conversion",
    );
    const directQuoteConversionEvents = directConversionEvents.filter(
      (call) =>
        (call[2] as { send_to?: string } | undefined)?.send_to === expectedSendTo,
    );
    assert.equal(
      directQuoteConversionEvents.length,
      1,
      "the helper must send exactly one direct Request quote conversion",
    );
    const directQuotePayload = directQuoteConversionEvents[0]?.[2] as Record<string, unknown>;
    assert.equal(directQuotePayload.send_to, expectedSendTo);
    assert.equal(directQuotePayload.value, 45);
    assert.equal(directQuotePayload.currency, "GBP");
    assert.equal(directQuotePayload.transaction_id, "TEST-VALID-1");
    assert.equal(directQuotePayload.page_type, "emerge_belfast");
    assert.equal(directQuotePayload.email, undefined);
    assert.equal(directQuotePayload.phone, undefined);

    const quoteGeneratedEvents = mocks.dataLayer.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as { event?: string }).event === ADS_EVENT_QUOTE_GENERATED,
    );
    assert.equal(quoteGeneratedEvents.length, 1);
    const payload = quoteGeneratedEvents[0] as {
      value?: number;
      currency?: string;
      transaction_id?: string;
      page_type?: string;
      email?: string;
      phone?: string;
    };
    assert.equal(payload.value, 45);
    assert.equal(payload.currency, "GBP");
    assert.equal(payload.transaction_id, "TEST-VALID-1");
    assert.equal(payload.page_type, "emerge_belfast");
    assert.equal(payload.email, undefined);
    assert.equal(payload.phone, undefined);

    assert.equal(
      quoteGeneratedEvents.length,
      1,
      "one quote calculation must yield exactly one quote_generated event",
    );
  });

  check("A genuinely new quote ID emits one named event and one direct Ads hit", () => {
    mocks.gtagCalls.length = 0;
    mocks.dataLayer.length = 0;
    resetRequestQuoteConversion();
    mocks.acceptConsent();
    assert.equal(
      trackRequestQuoteConversion({
        transactionId: "TEST-VALID-2",
        value: 60,
        currency: "GBP",
      }),
      true,
    );
    assert.equal(
      mocks.dataLayer.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as { event?: string }).event === ADS_EVENT_QUOTE_GENERATED,
      ).length,
      1,
    );
    assert.equal(
      mocks.gtagCalls.filter(
        (call) =>
          call[0] === "event" &&
          call[1] === "conversion" &&
          (call[2] as { send_to?: string } | undefined)?.send_to === expectedSendTo,
      ).length,
      1,
    );
  });

  console.log(`\n${passed} Google Ads Request quote checks passed`);
}

main();

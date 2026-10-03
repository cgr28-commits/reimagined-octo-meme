/**
 * Isolated Google Ads click-id journey.
 * Test identifiers only. Does not create a booking, take a payment,
 * or upload a conversion to Google.
 *
 * Run: npx tsx scripts/check-ads-click-id-journey.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookingWithConsentedAdsAttribution,
  captureAdsAttributionFromLocation,
  dropInMemoryAdsAttribution,
  rememberLandingAdsAttribution,
} from "../src/lib/ads-attribution";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";
import { ownerGoogleAdsPaidConversionLabel } from "../src/lib/google-ads-owner-status";
import { applyAdsMeasurementToBooking } from "../shared/ads-attribution";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";

const GCLID = "TEST-GCLID-BELFAST-514b";
const OLD_GCLID = "TEST-GCLID-OLD-COOKIE-514b";
const WBRAID = "TEST-WBRAID-BELFAST-514b";
const GBRAID = "TEST-GBRAID-REJECT-JOURNEY-514b";
const PAID_GCLID = "TEST-GCLID-PAID60-514b";
const ORIGIN = "https://myairporttaxini.co.uk";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

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

type ClickResult = {
  assigned: string[];
  href: string;
  prevented: boolean;
};

function loadEarlyScript(): string {
  const layout = read("src/app/layout.tsx");
  const blockStart = layout.indexOf('id="matni-landing-click-id"');
  assert.ok(blockStart >= 0, "landing click-id script must be in the root layout");
  const tag = layout.slice(blockStart, layout.indexOf("</Script>", blockStart));
  assert.match(tag, /beforeInteractive/);
  const inline = tag.match(/\{`([\s\S]*?)`\}/);
  if (inline?.[1]) return inline[1];
  assert.match(tag, /ADS_CLICK_ID_EARLY_SCRIPT/);
  const source = read("src/lib/ads-click-id-early-script.ts");
  const matched = source.match(/ADS_CLICK_ID_EARLY_SCRIPT = `([\s\S]*)`;\s*$/);
  if (!matched?.[1]) throw new Error("Early click-id script is missing");
  return matched[1];
}

function withEarlyScript(options: {
  pathname: string;
  search: string;
  consent?: "accepted" | "rejected" | null;
  cookie?: string;
}): { click: (href: string) => ClickResult; landingSearch: () => string } {
  const local = new Map<string, string>();
  if (options.consent) local.set(COOKIE_CONSENT_KEY, options.consent);
  const assigned: string[] = [];
  const listeners: Array<(event: Record<string, unknown>) => void> = [];
  const win = {
    __matniLandingSearch: "",
    location: {
      protocol: "https:",
      origin: ORIGIN,
      pathname: options.pathname,
      search: options.search,
      href: `${ORIGIN}${options.pathname}${options.search}`,
      assign(url: string) {
        assigned.push(url);
      },
    },
    localStorage: memoryStorage(local),
    document: {
      cookie: options.cookie ?? "",
      addEventListener(_type: string, fn: (event: Record<string, unknown>) => void) {
        listeners.push(fn);
      },
    },
  };
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
  };
  (globalThis as { window?: unknown }).window = win;
  (globalThis as { document?: unknown }).document = win.document;
  (globalThis as { localStorage?: Storage }).localStorage = win.localStorage;
  try {
    // The layout script is an IIFE. It must register its own listener; this
    // harness does not add the React listener.
    eval(loadEarlyScript());
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.localStorage = previous.localStorage;
  }

  return {
    landingSearch: () => win.__matniLandingSearch,
    click(href: string): ClickResult {
      let current = href;
      const anchor = {
        getAttribute(name: string) {
          return name === "href" ? current : null;
        },
        setAttribute(name: string, value: string) {
          if (name === "href") current = value;
        },
      };
      const event: Record<string, unknown> = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: { closest: (selector: string) => (selector === "a" ? anchor : null) },
        preventDefault() {
          event.defaultPrevented = true;
        },
        stopPropagation() {},
        stopImmediatePropagation() {},
      };
      (globalThis as { window?: unknown }).window = win;
      (globalThis as { document?: unknown }).document = win.document;
      (globalThis as { localStorage?: Storage }).localStorage = win.localStorage;
      try {
        for (const listener of listeners) listener(event);
      } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        globalThis.localStorage = previous.localStorage;
      }
      return { assigned, href: current, prevented: event.defaultPrevented === true };
    },
  };
}

function assertKept(result: ClickResult, href: string, id: string): void {
  assert.match(result.href, new RegExp(`[?&]gclid=${id}(?:&|#|$)`), `${href} dropped the click ID`);
  assert.doesNotMatch(result.href, new RegExp(OLD_GCLID));
  // Leave the click to the browser before hydration, and to the site handler after it.
  assert.equal(result.assigned.length, 0, href);
  assert.equal(result.prevented, false, href);
  assert.doesNotMatch(JSON.stringify(result), /googleads|googletagmanager|gtag/i);
}

const local = new Map<string, string>();
const session = new Map<string, string>();
const cookies = new Map<string, string>();
const browser = globalThis as typeof globalThis & {
  window: Window & { __matniLandingSearch?: string };
  localStorage: Storage;
  sessionStorage: Storage;
  document: { cookie: string };
  location: { protocol: string; search: string; href: string; pathname: string; origin: string };
};

function installBrowser() {
  browser.window = browser as unknown as Window & { __matniLandingSearch?: string };
  browser.localStorage = memoryStorage(local);
  browser.sessionStorage = memoryStorage(session);
  browser.location = {
    protocol: "https:",
    search: "",
    href: `${ORIGIN}/`,
    pathname: "/",
    origin: ORIGIN,
  };
  Object.defineProperty(browser, "document", {
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
}

function resetBrowser() {
  local.clear();
  session.clear();
  cookies.clear();
  dropInMemoryAdsAttribution();
  browser.window.__matniLandingSearch = "";
  browser.location.search = "";
  browser.location.pathname = "/";
  browser.location.href = `${ORIGIN}/`;
}

function memoryKv() {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      const keys = [...data.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  };
}

async function main(): Promise<void> {
console.log("=== Belfast landing pages share the quote and plain same-site links ===");
const airportPage = read("src/app/airports/[slug]/page.tsx");
assert.match(airportPage, /belfast-international/);
assert.match(airportPage, /belfast-city/);
assert.match(airportPage, /LocationQuoteSection/);
assert.match(airportPage, /\/locations\/\$\{hub\.slug\}\//);
assert.match(airportPage, /\/transfers\/\$\{route\.slug\}\//);
const header = read("src/components/Header.tsx");
assert.match(header, /href="\/"/);
assert.match(header, /Get a Quote/);
const quoteCta = read("src/components/LandingPageQuoteCta.tsx");
assert.match(quoteCta, /href=\{LANDING_QUOTE_HREF\}/);
assert.match(quoteCta, /LANDING_QUOTE_HREF = "#quote"/);
console.log("OK  both Belfast airport pages render in-page quote plus ordinary links");

console.log("=== Unanswered consent: pre-hydration navigation keeps the landing click ID ===");
{
  const search = `?gclid=${GCLID}&wbraid=${WBRAID}`;
  for (const pathname of ["/airports/belfast-international/", "/airports/belfast-city/"]) {
    for (const href of [
      "/#quote",
      "/",
      "/airports/",
      "/locations/lisburn/",
      "/transfers/lisburn-to-belfast-international/",
      "/privacy/",
    ]) {
      const page = withEarlyScript({ pathname, search, consent: null });
      assert.equal(page.landingSearch(), search);
      const result = page.click(href);
      assertKept(result, `${pathname} -> ${href}`, GCLID);
      assert.match(result.href, new RegExp(`wbraid=${WBRAID}`));
      if (href === "/#quote") assert.match(result.href, /#quote$/);
    }
    const inPage = withEarlyScript({ pathname, search, consent: null });
    const hash = inPage.click("#quote");
    assert.equal(hash.assigned.length, 0, "in-page #quote must stay on the landing URL");
    const external = inPage.click("https://wa.me/447549815538");
    assert.equal(external.assigned.length, 0);
    assert.equal(external.href, "https://wa.me/447549815538");
  }
}
console.log("OK  header, logo, airports, town, route and privacy links keep the test click ID");

console.log("=== Rejected consent does not copy the click ID onto the next page ===");
{
  const page = withEarlyScript({
    pathname: "/airports/belfast-international/",
    search: `?gbraid=${GBRAID}`,
    consent: "rejected",
  });
  const result = page.click("/#quote");
  assert.equal(result.assigned.length, 0);
  assert.equal(result.href, "/#quote");
  assert.doesNotMatch(result.href, new RegExp(GBRAID));
}
console.log("OK  a rejected visitor is not given the click ID on the next URL");

console.log("=== Accepted consent keeps the current landing click ID, not an older cookie ===");
{
  const cookie = `matni-ads-attribution-v1=${encodeURIComponent(JSON.stringify({ gclid: OLD_GCLID }))}`;
  const page = withEarlyScript({
    pathname: "/airports/belfast-city/",
    search: `?gclid=${GCLID}`,
    consent: "accepted",
    cookie,
  });
  const result = page.click("/#quote");
  assertKept(result, "accepted new landing", GCLID);
}
console.log("OK  the new test gclid wins over the older cookie");

installBrowser();

console.log("=== Unanswered, rejected and accepted consent are recorded without sending a click ID early ===");
{
  resetBrowser();
  browser.location.search = `?gclid=${GCLID}`;
  browser.location.pathname = "/airports/belfast-international/";
  browser.window.__matniLandingSearch = `?gclid=${GCLID}`;
  rememberLandingAdsAttribution(`?gclid=${GCLID}`);
  const unanswered = bookingWithConsentedAdsAttribution({
    customerName: "Test Visitor",
    attribution: { gclid: GCLID },
  });
  assert.equal(unanswered.adsMeasurement?.consent, "unanswered");
  assert.equal(unanswered.adsMeasurement?.outcome, "consent_unanswered");
  assert.equal(unanswered.adsMeasurement?.clickIdObserved, true);
  assert.equal("attribution" in unanswered, false);
  assert.doesNotMatch(JSON.stringify(unanswered), new RegExp(GCLID));

  resetBrowser();
  browser.window.__matniLandingSearch = `?gbraid=${GBRAID}`;
  rememberLandingAdsAttribution(`?gbraid=${GBRAID}`);
  local.set(COOKIE_CONSENT_KEY, "rejected");
  const rejected = bookingWithConsentedAdsAttribution({
    customerName: "Test Visitor",
    attribution: { gbraid: GBRAID },
  });
  assert.equal(rejected.adsMeasurement?.consent, "rejected");
  assert.equal(rejected.adsMeasurement?.outcome, "consent_rejected");
  assert.equal("attribution" in rejected, false);
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(GBRAID));

  resetBrowser();
  local.set(COOKIE_CONSENT_KEY, "accepted");
  browser.window.__matniLandingSearch = `?gclid=${GCLID}&wbraid=${WBRAID}`;
  rememberLandingAdsAttribution(`?gclid=${GCLID}&wbraid=${WBRAID}`);
  captureAdsAttributionFromLocation("");
  dropInMemoryAdsAttribution();
  browser.window.__matniLandingSearch = "";
  browser.location.search = "";
  browser.location.pathname = "/quote/";
  const savedPay = bookingWithConsentedAdsAttribution({ customerName: "Saved Quote Visitor" });
  assert.equal(savedPay.adsMeasurement?.consent, "accepted");
  assert.equal(savedPay.adsMeasurement?.outcome, "click_id_captured");
  assert.equal(savedPay.attribution?.gclid, GCLID);
  assert.equal(savedPay.attribution?.wbraid, WBRAID);

  resetBrowser();
  local.set(COOKIE_CONSENT_KEY, "accepted");
  const direct = bookingWithConsentedAdsAttribution({ customerName: "Direct Pay" });
  assert.equal(direct.adsMeasurement?.outcome, "no_click_id");
  assert.equal(direct.adsMeasurement?.clickIdObserved, false);
  assert.equal("attribution" in direct, false);
}
console.log("OK  consent state is attached and click IDs stay off the payload until accepted");

console.log("=== Existing paid rows without evidence stay Reason unknown ===");
assert.equal(ownerGoogleAdsPaidConversionLabel("skipped_no_click_id", false), "Reason unknown");
assert.equal(ownerGoogleAdsPaidConversionLabel(undefined, false), "Reason unknown");
assert.equal(
  ownerGoogleAdsPaidConversionLabel("skipped_no_click_id", false, "no_click_id"),
  "No captured click ID",
);
assert.equal(
  ownerGoogleAdsPaidConversionLabel("skipped_no_click_id", false, "consent_rejected"),
  "Consent rejected",
);
assert.equal(
  ownerGoogleAdsPaidConversionLabel("skipped_no_click_id", false, "consent_unanswered"),
  "Consent not answered",
);
assert.equal(ownerGoogleAdsPaidConversionLabel("sent", true, "click_id_captured"), "Sent");
console.log("OK  old rows are not given a guessed reason");

console.log("=== Server drops a click ID when consent was not accepted ===");
{
  const smuggled = applyAdsMeasurementToBooking({
    customerName: "Saved quote",
    attribution: { gclid: GCLID },
    adsMeasurement: {
      consent: "unanswered",
      outcome: "click_id_captured",
      clickIdObserved: true,
    },
  });
  assert.equal(smuggled.adsMeasurement?.outcome, "consent_unanswered");
  assert.equal("attribution" in smuggled, false);
  assert.doesNotMatch(JSON.stringify(smuggled), new RegExp(GCLID));

  const rejected = applyAdsMeasurementToBooking({
    attribution: { gbraid: GBRAID },
    adsMeasurement: {
      consent: "rejected",
      outcome: "no_click_id",
      clickIdObserved: true,
    },
  });
  assert.equal(rejected.adsMeasurement?.outcome, "consent_rejected");
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(GBRAID));

  const legacy = applyAdsMeasurementToBooking({
    attribution: { gclid: GCLID },
  });
  assert.equal(legacy.attribution?.gclid, GCLID);
  assert.equal(legacy.adsMeasurement, undefined);

  const worker = read("workers/addresses/src/index.ts");
  const paidSave = read("workers/addresses/src/refund-handlers.ts");
  const jobs = read("workers/addresses/src/booking-job-handlers.ts");
  const upload = read("workers/addresses/src/paid-booking-ads-conversion.ts");
  assert.match(worker, /applyAdsMeasurementToBooking/);
  assert.match(paidSave, /applyAdsMeasurementToBooking/);
  assert.match(jobs, /applyAdsMeasurementToBooking/);
  assert.match(upload, /existing\?\.adsMeasurement/);
  assert.match(worker, /\.\.\.booking/);
  for (const file of [
    "src/app/quote/SavedQuoteCustomerClient.tsx",
    "src/app/book-quote/BookQuoteCustomerClient.tsx",
    "src/app/personal-quote/PersonalQuoteCustomerClient.tsx",
    "src/app/pay/a2a-quote/A2aQuotePayClient.tsx",
    "src/app/pay/short-notice/ShortNoticePayClient.tsx",
    "src/components/QuoteCard.tsx",
  ]) {
    assert.match(read(file), /createPaymentCheckout\(/);
  }
  assert.match(read("src/lib/create-payment.ts"), /bookingWithConsentedAdsAttribution\(request\.booking\)/);
  assert.match(read("src/lib/submit-booking.ts"), /bookingWithConsentedAdsAttribution\(submission\.booking\)/);
}
console.log("OK  direct, saved and approved pay paths cannot send an unconsented click ID");

console.log("=== One SumUp payment, one paid booking, one £60 conversion ===");
{
  const store = memoryKv();
  const uploads: Array<{ url: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("api.sumup.com")) {
      throw new Error(`Unexpected SumUp ${method} ${url}`);
    }
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-access-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("googleads.googleapis.com")) {
      uploads.push({ url, body: String(init?.body ?? "") });
      assert.equal(method, "POST");
      assert.doesNotMatch(url, /campaigns|bidding|budgets/i);
      return new Response(JSON.stringify({ results: [{}] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("blocked", { status: 503 });
  }) as typeof fetch;

  const booking = {
    customerName: "Test Visitor",
    customerEmail: "visitor@example.com",
    mobileNumber: "07700900123",
    tripLabel: "Lisburn to Belfast International",
    pickupLabel: "Lisburn",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-10-10",
    tripTime: "09:30",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon",
    isAirportTrip: true,
    airportCode: "BFS",
    attribution: { gclid: PAID_GCLID },
    adsMeasurement: {
      consent: "accepted",
      outcome: "click_id_captured",
      clickIdObserved: true,
    },
  } as PaidBookingDetails;

  try {
    const env = {
      SUMUP_API_KEY: "test-sumup-key",
      SUMUP_MERCHANT_CODE: "MCODE",
      TRACKING_STORE: store as unknown as KVNamespace,
      GOOGLE_ADS_DEVELOPER_TOKEN: "test-dev-token",
      GOOGLE_ADS_CLIENT_ID: "test-client",
      GOOGLE_ADS_CLIENT_SECRET: "test-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "test-refresh",
      GOOGLE_ADS_CUSTOMER_ID: "4955115517",
      GOOGLE_ADS_PAID_BOOKING_CONVERSION_ACTION_ID: "7734768680",
    };
    const checkout = {
      id: "chk-paid-60",
      status: "PAID",
      amount: 60,
      currency: "GBP",
      checkout_reference: "matni-paid-60",
      transactions: [
        { id: "txn-paid-60", transaction_code: "TCODE60", status: "SUCCESSFUL" },
      ],
    };
    const first = await finalizePaidCheckout({
      env,
      checkoutId: checkout.id,
      booking,
      checkout,
      logPaidBookingCalendar: async () => ({ logged: true, events: 1, eventIds: ["cal-60"] }),
    });
    const second = await finalizePaidCheckout({
      env,
      checkoutId: checkout.id,
      booking,
      checkout,
      logPaidBookingCalendar: async () => ({ logged: true, events: 1, eventIds: ["cal-60-again"] }),
    });
    assert.equal(first.ok, true);
    assert.equal(first.alreadyFinalized, undefined);
    assert.equal(second.alreadyFinalized, true);
    const records = [...store.data.keys()].filter((key) => key.startsWith("booking:ref:"));
    assert.equal(records.length, 1);
    const saved = (await store.get("booking:ref:TCODE60", "json")) as PaidBookingRecord;
    assert.equal(saved.amount, 60);
    assert.equal(saved.attribution?.gclid, PAID_GCLID);
    assert.equal(saved.adsMeasurement?.outcome, "click_id_captured");
    assert.equal(saved.googleAdsPaidConversionStatus, "sent");
    assert.equal(uploads.length, 1);
    const payload = JSON.parse(uploads[0].body) as {
      conversions: Array<{ conversionValue: number; gclid?: string; orderId?: string }>;
    };
    assert.equal(payload.conversions.length, 1);
    assert.equal(payload.conversions[0]?.conversionValue, 60);
    assert.equal(payload.conversions[0]?.gclid, PAID_GCLID);
    assert.equal(payload.conversions[0]?.orderId, "TCODE60");
    assert.doesNotMatch(uploads[0].url, /campaigns|bidding|budgets/i);

    uploads.length = 0;
    const unanswered = await finalizePaidCheckout({
      env,
      checkoutId: "chk-unanswered",
      booking: {
        ...booking,
        attribution: { gclid: GCLID },
        adsMeasurement: {
          consent: "unanswered",
          outcome: "click_id_captured",
          clickIdObserved: true,
        },
      },
      checkout: {
        ...checkout,
        id: "chk-unanswered",
        checkout_reference: "matni-unanswered",
        transactions: [
          { id: "txn-unanswered", transaction_code: "TCODEUN", status: "SUCCESSFUL" },
        ],
      },
      logPaidBookingCalendar: async () => ({ logged: true, events: 1, eventIds: ["cal-un"] }),
    });
    assert.equal(unanswered.ok, true);
    const withheld = (await store.get("booking:ref:TCODEUN", "json")) as PaidBookingRecord;
    assert.equal(withheld.adsMeasurement?.outcome, "consent_unanswered");
    assert.equal(withheld.attribution, undefined);
    assert.equal(withheld.googleAdsPaidConversionStatus, "skipped_no_click_id");
    assert.doesNotMatch(JSON.stringify(withheld), new RegExp(GCLID));
    assert.equal(uploads.length, 0);
    assert.equal(
      [...store.data.keys()].filter((key) => key.startsWith("booking:ref:")).length,
      2,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
console.log("OK  one paid record and one £60 conversion for the consented test click ID");

console.log("\nAll click-id journey checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

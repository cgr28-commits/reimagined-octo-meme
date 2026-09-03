/** Regression checks for saved-booking conversion delivery before SumUp navigation. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADS_EVENT_BOOKING_REQUEST_SUBMITTED } from "../src/lib/google-ads";
import { trackBookingRequestSubmittedBeforeNavigation } from "../src/lib/google-ads-client";
import { COOKIE_CONSENT_KEY } from "../src/lib/cookie-consent";

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

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_REQUEST_CONVERSION_LABEL =
    "test-booking-request-label";

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

  console.log("=== Immediate SumUp navigation waits for conversion delivery ===");
  let navigated = false;
  const navigation = (async () => {
    const tracked = await trackBookingRequestSubmittedBeforeNavigation(
      {
        bookingReference: "matni-checkout-1001",
        value: 45,
        currency: "GBP",
        airport: "BFS",
        journeyType: "Airport drop-off",
      },
      50,
    );
    navigated = true;
    return tracked;
  })();

  await Promise.resolve();
  assert.equal(navigated, false, "external navigation must wait for callback or timeout");

  const namedEvents = dataLayer.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { event?: string }).event === ADS_EVENT_BOOKING_REQUEST_SUBMITTED,
  );
  assert.equal(namedEvents.length, 1);
  const namedPayload = namedEvents[0] as Record<string, unknown>;
  assert.equal(namedPayload.booking_reference, "matni-checkout-1001");
  assert.equal(namedPayload.transaction_id, "matni-checkout-1001");
  assert.equal(namedPayload.value, 45);
  assert.equal(namedPayload.currency, "GBP");

  const directEvents = gtagCalls.filter(
    (call) => call[0] === "event" && call[1] === "conversion",
  );
  assert.equal(directEvents.length, 1);
  const directPayload = directEvents[0]?.[2] as Record<string, unknown>;
  assert.equal(
    directPayload.send_to,
    "AW-18303631278/test-booking-request-label",
  );
  assert.equal(directPayload.transaction_id, "matni-checkout-1001");
  assert.equal(directPayload.value, 45);
  assert.equal(directPayload.currency, "GBP");
  assert.equal(directPayload.event_timeout, 50);
  assert.equal(typeof directPayload.event_callback, "function");

  (directPayload.event_callback as () => void)();
  assert.equal(await navigation, true);
  assert.equal(navigated, true);
  console.log("OK  one named event + one labelled hit leave before navigation");

  console.log("=== Duplicate checkout reference remains idempotent ===");
  assert.equal(
    await trackBookingRequestSubmittedBeforeNavigation(
      { bookingReference: "matni-checkout-1001", value: 45, currency: "GBP" },
      10,
    ),
    true,
  );
  assert.equal(
    dataLayer.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as { event?: string }).event === ADS_EVENT_BOOKING_REQUEST_SUBMITTED,
    ).length,
    1,
  );
  assert.equal(
    gtagCalls.filter((call) => call[0] === "event" && call[1] === "conversion").length,
    1,
  );
  console.log("OK  retry/rerender sends no duplicate lead conversion");

  console.log("=== Bounded timeout is fail-open ===");
  let navigatedAfterTimeout = false;
  const timeoutTracked = await trackBookingRequestSubmittedBeforeNavigation(
    { bookingReference: "matni-checkout-1002", value: 60, currency: "GBP" },
    5,
  );
  navigatedAfterTimeout = true;
  assert.equal(timeoutTracked, true);
  assert.equal(navigatedAfterTimeout, true);
  assert.equal(
    gtagCalls.filter((call) => call[0] === "event" && call[1] === "conversion").length,
    2,
  );
  console.log("OK  a missing callback cannot block SumUp navigation");

  console.log("=== Denied consent still sends a cookieless booking conversion ===");
  local.set(COOKIE_CONSENT_KEY, "rejected");
  const cookielessPromise = trackBookingRequestSubmittedBeforeNavigation(
    { bookingReference: "matni-checkout-cookieless", value: 70, currency: "GBP" },
    50,
  );
  await Promise.resolve();
  const cookielessEvent = gtagCalls.find(
    (call) =>
      call[0] === "event" &&
      call[1] === "conversion" &&
      (call[2] as { transaction_id?: string } | undefined)?.transaction_id ===
        "matni-checkout-cookieless",
  );
  assert.ok(cookielessEvent, "denied consent must still emit a Consent Mode ping");
  const cookielessPayload = cookielessEvent![2] as Record<string, unknown>;
  assert.equal(cookielessPayload.email, undefined);
  assert.equal(cookielessPayload.phone_number, undefined);
  (cookielessPayload.event_callback as () => void)();
  assert.equal(await cookielessPromise, true);
  local.set(COOKIE_CONSENT_KEY, "accepted");
  console.log("OK  booking conversion is cookieless; no enhanced user data");

  console.log("=== Persistence acknowledgement gates the live Pay handler ===");
  const card = read("src/components/QuoteCard.tsx");
  const worker = read("workers/addresses/src/index.ts");
  const createPayment = read("src/lib/create-payment.ts");
  const gateIndex = card.indexOf(
    "checkout.bookingSaved === true && checkout.bookingReference",
  );
  const trackingIndex = card.indexOf(
    "await trackBookingRequestSubmittedBeforeNavigation",
    gateIndex,
  );
  const navigationIndex = card.indexOf(
    "window.location.assign(checkout.paymentUrl)",
    trackingIndex,
  );
  assert.ok(gateIndex >= 0, "Pay handler must require the Worker persistence acknowledgement");
  assert.ok(trackingIndex > gateIndex, "tracking must run inside the persistence gate");
  assert.ok(navigationIndex > trackingIndex, "SumUp navigation must happen after tracking wait");

  const saveIndex = worker.indexOf("await savePendingCheckout(env.TRACKING_STORE");
  const acknowledgementIndex = worker.indexOf("bookingSaved: true", saveIndex);
  assert.ok(saveIndex >= 0, "Worker must persist the pending checkout");
  assert.ok(
    acknowledgementIndex > saveIndex,
    "Worker must acknowledge bookingSaved only after persistence succeeds",
  );
  assert.match(worker.slice(acknowledgementIndex, acknowledgementIndex + 300), /bookingReference:\s*checkout\.checkoutReference/);
  assert.match(createPayment, /bookingSaved\?: boolean/);
  assert.match(createPayment, /bookingReference\?: string/);
  console.log("OK  no success acknowledgement means no booking conversion");

  console.log("\nAll SumUp booking-conversion checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

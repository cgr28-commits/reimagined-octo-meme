// Exercise the same owner POST and public GET used by the two pages, entirely in memory.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { quickQuoteKey } from "../shared/quick-quote";
import { markQuickQuoteCheckout } from "../workers/addresses/src/quick-quote-store";
import { fetchQuickQuoteById } from "../src/lib/quick-quote-api";
import {
  handleOwnerCreateQuickQuote,
  handlePublicQuickQuoteLookup,
} from "../workers/addresses/src/quick-quote-handlers";

async function createLink(t: TestContext, validityMode: "none" | "2h") {
  const records = new Map<string, { value: string; options?: unknown }>();
  const store = {
    async get(key: string, type?: string) {
      const entry = records.get(key);
      if (!entry) return null;
      return type === "json" ? JSON.parse(entry.value) : entry.value;
    },
    async put(key: string, value: string, options?: unknown) {
      records.set(key, { value, options });
    },
  };
  const origin = "https://example.test";
  const env = {
    OWNER_ACCESS_KEY: "test-owner",
    SITE_ORIGIN: origin,
    TRACKING_STORE: store as unknown as KVNamespace,
  };
  const now = Date.UTC(2030, 0, 1);
  const clock = t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.method, "GET");
    assert.equal(new URL(request.url).pathname, "/quick-quotes/by-id");
    return handlePublicQuickQuoteLookup(request, env, origin);
  });

  const response = await handleOwnerCreateQuickQuote(new Request(origin + "/owner/quick-quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Owner-Key": env.OWNER_ACCESS_KEY },
    body: JSON.stringify({
      validityMode, priceSource: "owner-manual", manualTransferFare: 45,
      pickupAddress: "Belfast City Hall", dropoffAddress: "Belfast International Airport",
      outboundDate: "2030-03-01", outboundTime: "12:00", returnJourney: false,
      pickupLat: 54.5965, pickupLng: -5.9301, dropoffLat: 54.6575, dropoffLng: -6.2158,
      routeMetrics: { distanceKm: 30, durationMinutes: 35 },
      passengers: 1, suitcases: 1,
    }),
  }), env, origin);
  assert.equal(response.status, 200);
  const created = await response.json();
  const url = new URL(created.bookingUrl);
  assert.equal(url.pathname, "/book-quote/");
  const id = url.searchParams.get("id");
  assert.ok(id);
  assert.equal(id, created.quote.id);
  const entry = records.get(quickQuoteKey(id));
  assert.ok(entry);

  const stored = JSON.parse(entry.value);
  assert.equal(stored.status, "open");
  assert.deepEqual(stored.journey.diaryRoute, {
    pickupLat: 54.5965, pickupLng: -5.9301, dropoffLat: 54.6575, dropoffLng: -6.2158,
    routeDistanceKm: 30, routeDurationMinutes: 35,
  });
  return { env, now, clock, id, entry, stored };
}

test("a new no-time-limit owner link opens immediately and past the legacy deadline", async (t) => {
  const { env, now, clock, id, entry, stored } = await createLink(t, "none");
  assert.equal(entry.options, undefined, "no KV expiration on the quote key");
  assert.equal(stored.expiresAt, null);
  for (const daysLater of [0, 31]) {
    clock.mock.mockImplementation(() => now + daysLater * 86_400_000);
    const quote = await fetchQuickQuoteById(id);
    assert.equal(quote.id, id);
    assert.equal(quote.status, "open");
    assert.equal(quote.expiresAt, null);
    assert.equal(quote.expired, false);
  }
  const checkout = await markQuickQuoteCheckout(env.TRACKING_STORE, id, {
    checkoutId: "local-checkout", checkoutReference: "local-reference",
  });
  assert.equal(checkout?.status, "checkout_created");
  assert.equal(checkout.expiresAt, null);
});

test("a two-hour owner link works immediately and closes exactly two hours after creation", async (t) => {
  const { now, clock, id, stored } = await createLink(t, "2h");
  const lifetime = 2 * 60 * 60 * 1000;
  assert.equal(Date.parse(stored.createdAt), now);
  assert.equal(Date.parse(stored.expiresAt), now + lifetime);
  for (const elapsed of [0, lifetime - 60_000, lifetime - 1]) {
    clock.mock.mockImplementation(() => now + elapsed);
    const quote = await fetchQuickQuoteById(id);
    assert.equal(quote.status, "open");
    assert.equal(quote.expired, false);
    assert.equal(quote.expiresAt, stored.expiresAt);
  }
  clock.mock.mockImplementation(() => now + lifetime);
  await assert.rejects(fetchQuickQuoteById(id), /quote link has expired/i);
});

/**
 * Signed quote route token: issue, verify, Pay reuse, and safe fallback.
 * Run: npx tsx scripts/check-quote-route-token.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { checkoutAmountsMatch } from "../shared/open-website-payment-fares";
import {
  inspectQuoteRouteTokenPayload,
  QUOTE_ROUTE_TOKEN_TTL_MS,
  QUOTE_ROUTE_TOKEN_VERSION,
  resolveQuoteRouteTokenSecret,
  signQuoteRouteToken,
  verifyQuoteRouteToken,
} from "../workers/addresses/src/quote-route-token";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const SECRET = "test-quote-route-token-secret-do-not-use-in-prod";
const PICKUP_ID = "ChIJcityhall";
const DROPOFF_ID = "ChIJy4dKsjJVYEgRntaoTC4U5gw";
const PICKUP_LABEL = "Belfast City Hall, Belfast BT1 5GS, UK";
const DROPOFF_LABEL = "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK";
const TRUSTED = { distanceKm: 25.82, durationMinutes: 25.1 };
const TAMPERED = { distanceKm: 1, durationMinutes: 1 };

type RouteDecision = {
  source: "signed_quote_token" | "full_resolve";
  resolveCalls: number;
  distanceKm: number;
  durationMinutes: number;
};

async function decidePaymentRoute(options: {
  token?: string | null;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  nowMs?: number;
  secret?: string;
  browserRouteMetrics?: { distanceKm: number; durationMinutes: number };
}): Promise<RouteDecision> {
  let resolveCalls = 0;
  const verified = await verifyQuoteRouteToken({
    token: options.token,
    secret: options.secret ?? SECRET,
    pickupPlaceId: options.pickupPlaceId ?? PICKUP_ID,
    dropoffPlaceId: options.dropoffPlaceId ?? DROPOFF_ID,
    pickupLabel: options.pickupLabel ?? PICKUP_LABEL,
    dropoffLabel: options.dropoffLabel ?? DROPOFF_LABEL,
    nowMs: options.nowMs,
  });
  if (verified.ok) {
    return {
      source: "signed_quote_token",
      resolveCalls,
      distanceKm: verified.distanceKm,
      durationMinutes: verified.durationMinutes,
    };
  }
  resolveCalls += 1;
  // Fallback: full Worker resolve. Browser metrics are ignored here on purpose.
  void options.browserRouteMetrics;
  return {
    source: "full_resolve",
    resolveCalls,
    distanceKm: TRUSTED.distanceKm,
    durationMinutes: TRUSTED.durationMinutes,
  };
}

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`OK  ${label}`))
    .catch((error) => {
      console.error(`FAIL  ${label}`);
      throw error;
    });
}

async function main() {
  const nowMs = Date.UTC(2026, 8, 9, 14, 0, 0);
  const issued = await signQuoteRouteToken({
    secret: SECRET,
    pickupPlaceId: PICKUP_ID,
    dropoffPlaceId: DROPOFF_ID,
    pickupLabel: PICKUP_LABEL,
    dropoffLabel: DROPOFF_LABEL,
    distanceKm: TRUSTED.distanceKm,
    durationMinutes: TRUSTED.durationMinutes,
    nowMs,
  });

  await check("1. authoritative quote calculation returns a signed route token", async () => {
    const quote = read("workers/addresses/src/quote-handlers.ts");
    assert.match(quote, /routeMetricsSource === "worker"/);
    assert.match(quote, /quoteBody\.routeToken = await signQuoteRouteToken/);
    assert.match(quote, /pickupPlaceId/);
    assert.match(quote, /dropoffPlaceId/);
    assert.match(quote, /pickupLabel: pickupAddress/);
    assert.match(quote, /dropoffLabel: dropoffAddress/);
    assert.ok(issued.includes("."), "token is payload.signature");
    assert.equal(QUOTE_ROUTE_TOKEN_VERSION, 1);
    assert.ok(QUOTE_ROUTE_TOKEN_TTL_MS >= 10 * 60 * 1000);
    assert.ok(QUOTE_ROUTE_TOKEN_TTL_MS <= 15 * 60 * 1000);
    const api = read("src/lib/quick-quote-api.ts");
    assert.match(api, /routeToken: payload\.routeToken\.trim\(\)/);
  });

  await check("2. token contains no secrets", () => {
    const payload = inspectQuoteRouteTokenPayload(issued);
    assert.ok(payload);
    const blob = `${issued}\n${JSON.stringify(payload)}`;
    assert.doesNotMatch(blob, /SECRET|HMAC|OWNER_ACCESS_KEY|SUMUP|api[_-]?key/i);
    assert.equal(payload.v, 1);
    assert.equal(typeof payload.pickupPlaceId, "string");
    assert.equal(typeof payload.distanceKm, "number");
    assert.ok(!("secret" in payload!));
    assert.ok(!("key" in payload!));
    const create = read("src/lib/create-payment.ts");
    const card = read("src/components/QuoteCard.tsx");
    assert.doesNotMatch(create, /QUOTE_ROUTE_TOKEN_SECRET|OWNER_ACCESS_KEY/);
    assert.doesNotMatch(card, /QUOTE_ROUTE_TOKEN_SECRET|OWNER_ACCESS_KEY/);
    assert.equal(resolveQuoteRouteTokenSecret({ QUOTE_ROUTE_TOKEN_SECRET: SECRET }), SECRET);
    assert.equal(
      resolveQuoteRouteTokenSecret({ OWNER_ACCESS_KEY: "owner-only" }),
      "owner-only",
    );
  });

  await check("3. valid token allows /payments to skip route re-resolution", async () => {
    const decision = await decidePaymentRoute({ token: issued, nowMs: nowMs + 1000 });
    assert.equal(decision.source, "signed_quote_token");
    assert.equal(decision.resolveCalls, 0);
    assert.equal(decision.distanceKm, 25.82);
    assert.equal(decision.durationMinutes, 25.1);
    const worker = read("workers/addresses/src/index.ts");
    assert.match(worker, /paymentRouteSource = "signed_quote_token"/);
    assert.match(worker, /routeResolveMs = 0/);
    const tokenIdx = worker.indexOf("verifyQuoteRouteToken");
    const fallbackIdx = worker.indexOf("resolveWorkerTripRouteMetricsForPayment", tokenIdx);
    assert.ok(tokenIdx >= 0 && fallbackIdx > tokenIdx);
  });

  await check("4. browser-provided raw route metrics are still not trusted", async () => {
    const decision = await decidePaymentRoute({
      token: issued,
      nowMs: nowMs + 1000,
      browserRouteMetrics: TAMPERED,
    });
    assert.equal(decision.distanceKm, TRUSTED.distanceKm);
    assert.notEqual(decision.distanceKm, TAMPERED.distanceKm);
    const worker = read("workers/addresses/src/index.ts");
    assert.match(worker, /Never trust body\.routeMetrics/);
    assert.doesNotMatch(
      worker,
      /const routeMetrics = parseClientRouteMetrics\(body\.routeMetrics\)/,
    );
    assert.doesNotMatch(
      worker,
      /routeMetrics:\s*body\.routeMetrics/,
    );
    const verifySrc = read("workers/addresses/src/quote-route-token.ts");
    assert.doesNotMatch(verifySrc, /routeMetrics/);
  });

  await check("5. modifying pickup invalidates route-token reuse", async () => {
    const decision = await decidePaymentRoute({
      token: issued,
      nowMs: nowMs + 1000,
      pickupPlaceId: "ChIJdifferent-pickup",
    });
    assert.equal(decision.source, "full_resolve");
    assert.equal(decision.resolveCalls, 1);
    const labelDecision = await decidePaymentRoute({
      token: issued,
      nowMs: nowMs + 1000,
      pickupLabel: "Some other pickup, Belfast",
    });
    assert.equal(labelDecision.source, "full_resolve");
  });

  await check("6. modifying drop-off invalidates route-token reuse", async () => {
    const decision = await decidePaymentRoute({
      token: issued,
      nowMs: nowMs + 1000,
      dropoffPlaceId: "ChIJdifferent-dropoff",
    });
    assert.equal(decision.source, "full_resolve");
    assert.equal(decision.resolveCalls, 1);
    const labelDecision = await decidePaymentRoute({
      token: issued,
      nowMs: nowMs + 1000,
      dropoffLabel: "Dublin Airport, Ireland",
    });
    assert.equal(labelDecision.source, "full_resolve");
  });

  await check("7. expired token falls back to normal route resolution", async () => {
    const expiredAt = nowMs + QUOTE_ROUTE_TOKEN_TTL_MS + 1000;
    const decision = await decidePaymentRoute({ token: issued, nowMs: expiredAt });
    assert.equal(decision.source, "full_resolve");
    assert.equal(decision.resolveCalls, 1);
    const verified = await verifyQuoteRouteToken({
      token: issued,
      secret: SECRET,
      pickupPlaceId: PICKUP_ID,
      dropoffPlaceId: DROPOFF_ID,
      pickupLabel: PICKUP_LABEL,
      dropoffLabel: DROPOFF_LABEL,
      nowMs: expiredAt,
    });
    assert.equal(verified.ok, false);
    if (!verified.ok) assert.equal(verified.reason, "expired");
  });

  await check("8. invalid signature falls back safely", async () => {
    const [payload] = issued.split(".");
    const tampered = `${payload}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const decision = await decidePaymentRoute({ token: tampered, nowMs: nowMs + 1000 });
    assert.equal(decision.source, "full_resolve");
    assert.equal(decision.resolveCalls, 1);
    const missing = await decidePaymentRoute({ token: "", nowMs: nowMs + 1000 });
    assert.equal(missing.source, "full_resolve");
    const malformed = await decidePaymentRoute({ token: "not-a-token", nowMs: nowMs + 1000 });
    assert.equal(malformed.source, "full_resolve");
  });

  await check("9. fare is still recalculated server-side", () => {
    const trustedFare = calculateAuthoritativeWebsiteQuote({
      airportCode: "BFS",
      fromAirport: false,
      pickupAddress: PICKUP_LABEL,
      dropoffAddress: DROPOFF_LABEL,
      returnJourney: false,
      outboundDate: "2026-09-20",
      outboundTime: "10:00",
      passengers: 2,
      suitcases: 2,
      routeMetrics: TRUSTED,
    });
    const tamperedFare = calculateAuthoritativeWebsiteQuote({
      airportCode: "BFS",
      fromAirport: false,
      pickupAddress: PICKUP_LABEL,
      dropoffAddress: DROPOFF_LABEL,
      returnJourney: false,
      outboundDate: "2026-09-20",
      outboundTime: "10:00",
      passengers: 2,
      suitcases: 2,
      routeMetrics: TAMPERED,
    });
    assert.equal(trustedFare.ok, true);
    assert.equal(tamperedFare.ok, true);
    if (trustedFare.ok && tamperedFare.ok) {
      assert.notEqual(trustedFare.amount, tamperedFare.amount);
    }
    const worker = read("workers/addresses/src/index.ts");
    const tokenIdx = worker.indexOf('paymentRouteSource = "signed_quote_token"');
    const fareIdx = worker.indexOf("calculateAuthoritativeWebsiteQuote", tokenIdx);
    const a2aIdx = worker.indexOf("calculateAirportToAirportQuote", tokenIdx);
    assert.ok(fareIdx > tokenIdx && a2aIdx > tokenIdx);
  });

  await check("10. altered customer amount is still rejected", () => {
    const worker = read("workers/addresses/src/index.ts");
    assert.match(worker, /acceptedFinalAmountGbp/);
    assert.match(worker, /checkoutAmountsMatch/);
    assert.match(worker, /buildFareMismatchPaymentError/);
    assert.match(worker, /code: "fare_mismatch"/);
    assert.equal(checkoutAmountsMatch(40, 40), true);
    assert.equal(checkoutAmountsMatch(1, 40), false);
    const tokenIdx = worker.indexOf('paymentRouteSource = "signed_quote_token"');
    const mismatchIdx = worker.indexOf("buildFareMismatchPaymentError", tokenIdx);
    assert.ok(mismatchIdx > tokenIdx, "amount match still runs after token reuse");
  });

  await check("11. Smart Availability still runs", () => {
    const worker = read("workers/addresses/src/index.ts");
    const fareEnd = worker.indexOf("addPaymentMs(\"fareValidationMs\"");
    const saIdx = worker.indexOf("blockedCustomerSmartAvailabilityResponse", fareEnd);
    const sumupIdx = worker.indexOf("createSumUpHostedCheckout", saIdx);
    assert.ok(fareEnd >= 0 && saIdx > fareEnd && saIdx < sumupIdx);
    assert.match(worker, /code: "smart_availability_unavailable"/);
  });

  await check("12. SumUp is not created before validation completes", () => {
    const worker = read("workers/addresses/src/index.ts");
    const tokenIdx = worker.indexOf("verifyQuoteRouteToken");
    const fareIdx = worker.indexOf("calculateAuthoritativeWebsiteQuote", tokenIdx);
    const acceptedIdx = worker.indexOf("acceptedFinalAmountGbp", fareIdx);
    const saIdx = worker.indexOf("blockedCustomerSmartAvailabilityResponse", fareIdx);
    const sumupIdx = worker.indexOf("createSumUpHostedCheckout", saIdx);
    assert.ok(
      tokenIdx >= 0 &&
        fareIdx > tokenIdx &&
        acceptedIdx > fareIdx &&
        saIdx > acceptedIdx &&
        sumupIdx > saIdx,
    );
    assert.doesNotMatch(worker, /createSumUpHostedCheckout\([\s\S]{0,80}acceptedFinalAmountGbp/);
  });

  await check("13. savePendingCheckout still completes before paymentUrl is returned", () => {
    const worker = read("workers/addresses/src/index.ts");
    const persistIdx = worker.indexOf('await timePaymentStage("persistMs", () =>');
    const saveIdx = worker.indexOf("savePendingCheckout(paymentStore", persistIdx);
    const urlIdx = worker.indexOf("paymentUrl: checkout.paymentUrl", saveIdx);
    assert.ok(persistIdx >= 0 && saveIdx > persistIdx && urlIdx > saveIdx);
    assert.match(worker, /bookingSaved: true/);
  });

  await check("QuoteCard stores the token with the displayed quote and clears it on journey change", () => {
    const card = read("src/components/QuoteCard.tsx");
    assert.match(card, /const \[quoteRouteToken, setQuoteRouteToken\]/);
    assert.match(card, /setQuoteRouteToken\(result\.routeToken/);
    assert.match(card, /routeToken: quoteRouteToken\.trim\(\)/);
    assert.match(card, /clearStaleRouteAndPriceAfterAddressEdit[\s\S]*setQuoteRouteToken\(null\)/);
  });

  console.log("\nAll quote route-token checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

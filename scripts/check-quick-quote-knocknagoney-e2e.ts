/**
 * End-to-end proof for Quick Quote Knocknagoney → BFS £65.
 * Simulates the UI payload shapes that previously produced £55:
 *   - missing airportCode (point-to-point path)
 *   - short/wrong client routeMetrics overriding Worker resolve
 *
 * Run: npx tsx scripts/check-quick-quote-knocknagoney-e2e.ts
 * Optional live hit: QUOTE_E2E_LIVE=1 npx tsx scripts/check-quick-quote-knocknagoney-e2e.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { fetchTripRouteMetrics } from "../src/lib/trip-route";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const root = process.cwd();
const KNOCK = "66 Knocknagoney Park, Belfast BT4 2PW";
const BFS = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const BFS_ADDR = BFS.formattedAddress;
const KNOCK_COORDS = { lat: 54.618214, lng: -5.8582652 };

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("Inference: Knocknagoney → BFS address text yields airportCode=BFS", () => {
  const inferred = resolveAirportTransferIntent({
    airportCode: null,
    fromAirport: false,
    pickupAddress: KNOCK,
    dropoffAddress: BFS_ADDR,
  });
  assert.ok(inferred);
  assert.equal(inferred?.airportCode, "BFS");
  assert.equal(inferred?.fromAirport, false);
});

check("Missing airportCode without inference prices as £55 (the UI bug)", () => {
  const metrics = { distanceKm: 35.4, durationMinutes: 31 };
  const without = calculateAuthoritativeWebsiteQuote({
    airportCode: null,
    fromAirport: false,
    pickupAddress: KNOCK,
    dropoffAddress: BFS_ADDR,
    returnJourney: false,
    outboundDate: "2026-08-30",
    outboundTime: "12:37",
    passengers: 2,
    suitcases: 2,
    routeMetrics: metrics,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(without.ok, true);
  if (without.ok) assert.equal(without.amount, 55);

  const inferred = resolveAirportTransferIntent({
    airportCode: null,
    pickupAddress: KNOCK,
    dropoffAddress: BFS_ADDR,
  });
  const withInference = calculateAuthoritativeWebsiteQuote({
    airportCode: inferred?.airportCode ?? null,
    fromAirport: inferred?.fromAirport ?? false,
    pickupAddress: KNOCK,
    dropoffAddress: BFS_ADDR,
    returnJourney: false,
    outboundDate: "2026-08-30",
    outboundTime: "12:37",
    passengers: 2,
    suitcases: 2,
    routeMetrics: metrics,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(withInference.ok, true);
  if (withInference.ok) assert.equal(withInference.amount, 65);
});

check("Wiring: Worker infers airport + prefers Worker metrics", () => {
  const quoteHandlers = readFileSync(
    join(root, "workers/addresses/src/quote-handlers.ts"),
    "utf8",
  );
  const qqHandlers = readFileSync(
    join(root, "workers/addresses/src/quick-quote-handlers.ts"),
    "utf8",
  );
  const qqClient = readFileSync(
    join(root, "src/app/quick-quote/QuickQuoteOwnerClient.tsx"),
    "utf8",
  );
  assert.match(quoteHandlers, /resolveAirportTransferIntent/);
  assert.match(quoteHandlers, /routeMetricsSource/);
  assert.match(quoteHandlers, /airportCodeSource/);
  assert.match(quoteHandlers, /Worker resolve first/);
  assert.match(qqHandlers, /resolveAirportTransferIntent/);
  assert.match(qqClient, /resolveAirportTransferIntent/);
});

async function liveProbe() {
  if (process.env.QUOTE_E2E_LIVE !== "1") {
    console.log("SKIP live Worker probe (set QUOTE_E2E_LIVE=1 to enable)");
    return;
  }

  const workerBase =
    process.env.QUOTE_E2E_WORKER_BASE?.trim() ||
    "https://reimagined-octo-meme.cgr28.workers.dev";

  const metrics = await fetchTripRouteMetrics(
    KNOCK_COORDS.lat,
    KNOCK_COORDS.lng,
    BFS.lat,
    BFS.lng,
  );
  assert.ok(metrics, "local OSRM/fallback metrics required");

  async function post(label: string, body: Record<string, unknown>) {
    const response = await fetch(`${workerBase}/quote/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 QuickQuoteE2E",
        Origin: "https://www.myairporttaxini.com",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    console.log(`\n=== LIVE ${label} → ${workerBase} ===`);
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  const baseBody = {
    pickupAddress: KNOCK,
    dropoffAddress: BFS_ADDR,
    fromAirport: false,
    returnJourney: false,
    outboundDate: "2026-08-30",
    outboundTime: "12:37",
    passengers: 2,
    suitcases: 2,
    vehicleChoice: "Saloon",
    childSeatRequired: false,
  };

  // Reproduce the UI bug shape: no airportCode + short client metrics.
  const buggy = await post("UI bug shape (no airportCode + short client metrics)", {
    ...baseBody,
    airportCode: null,
    routeMetrics: { distanceKm: 22.5, durationMinutes: 25 },
  });

  const good = await post("explicit BFS + real metrics", {
    ...baseBody,
    airportCode: "BFS",
    routeMetrics: metrics,
  });

  const inferredOnly = await post("no airportCode, no client metrics (Worker resolve)", {
    ...baseBody,
    airportCode: null,
  });

  console.log("\n=== Summary ===");
  console.log({
    workerBase,
    buggyAmount: buggy.amount,
    buggyDiagnostics: buggy.diagnostics,
    goodAmount: good.amount,
    goodDiagnostics: good.diagnostics,
    inferredAmount: inferredOnly.amount,
    inferredDiagnostics: inferredOnly.diagnostics,
  });

  // After Worker redeploy of this branch: all three must be £65.
  if (buggy.diagnostics && typeof buggy.diagnostics === "object") {
    assert.equal(buggy.amount, 65, "Worker must infer BFS and ignore short client metrics");
    assert.equal(inferredOnly.amount, 65);
    assert.equal(good.amount, 65);
  } else {
    console.log(
      "NOTE: live Worker has not redeployed airport-inference yet (no diagnostics field).",
    );
    console.log("Waiting for Cloudflare Workers Builds from this branch.");
  }
}

liveProbe().catch((error) => {
  console.error(error);
  process.exit(1);
});

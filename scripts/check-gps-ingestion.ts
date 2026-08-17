/**
 * Server-side GPS ingestion / storage path checks (no live KV writes).
 * Run: npx tsx scripts/check-gps-ingestion.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyJourneyAction,
  shouldStoreGpsPoint,
  type DriverLocationPoint,
  type TrackingJobRecord,
} from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

section("History key matches job token (not GPS session token)");
{
  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /track:driver-history:/);
  assert.match(store, /function driverHistoryKey\(token: string\)/);
  assert.match(store, /appendDriverLocationPoint\([\s\S]*driverHistoryKey\(token\)/);
  const handlers = read("workers/addresses/src/tracking-handlers.ts");
  // Location handler appends with job token from body.token
  assert.match(
    handlers,
    /appendDriverLocationPoint\(env\.TRACKING_STORE,\s*token,/,
  );
  console.log("OK  GPS history keyed by job token");
}

section("Location handler persists lat/lng/accuracy/speed/heading");
{
  const handlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(handlers, /const lat = Number\(body\.lat\)/);
  assert.match(handlers, /const lng = Number\(body\.lng\)/);
  assert.match(handlers, /accuracyMeters:\s*Number\(body\.accuracy\)/);
  assert.match(handlers, /speedMps:\s*Number\(body\.speed\)/);
  assert.match(handlers, /headingDegrees:\s*Number\(body\.heading\)/);
  assert.match(handlers, /driverLocationPointCount = appendResult\.pointCount/);
  assert.match(handlers, /saveTrackingJob\(env\.TRACKING_STORE,\s*record\)/);
  // Stop/complete must not wipe history — only live pin.
  const shared = read("shared/tracking.ts");
  assert.match(shared, /case "stop_tracking":/);
  assert.doesNotMatch(shared, /driverLocationPointCount\s*=\s*0/);
  assert.doesNotMatch(shared, /delete next\.driverLocationPointCount/);
  console.log("OK  fields mapped; history survives stop");
}

section("First GPS point is always stored; throttle does not drop first");
{
  const t0 = "2026-08-17T12:00:00.000Z";
  assert.equal(
    shouldStoreGpsPoint(undefined, { lat: 54.597, lng: -5.93, recordedAt: t0 }),
    true,
  );

  const first: DriverLocationPoint = {
    lat: 54.597,
    lng: -5.93,
    recordedAt: t0,
    accuracyMeters: 12,
    speedMps: 8,
    headingDegrees: 90,
  };
  // Tiny move within 20s → skip
  assert.equal(
    shouldStoreGpsPoint(first, {
      lat: 54.59701,
      lng: -5.93001,
      recordedAt: "2026-08-17T12:00:05.000Z",
    }),
    false,
  );
  // 25s later → store
  assert.equal(
    shouldStoreGpsPoint(first, {
      lat: 54.59701,
      lng: -5.93001,
      recordedAt: "2026-08-17T12:00:25.000Z",
    }),
    true,
  );

  const handlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(handlers, /nowMs - lastPost < 4_000/);
  assert.match(handlers, /throttled:\s*true/);
  console.log("OK  store thresholds + soft 4s rate limit");
}

section("Start tracking enables sharing; stop keeps payment link fields");
{
  const job: TrackingJobRecord = {
    token: "a".repeat(32),
    createdAt: tStamp(),
    customerName: "Test",
    customerMobile: "07700900000",
    pickupLabel: "A",
    dropoffLabel: "B",
    tripDate: "2026-08-17",
    tripTime: "07:15",
    pickupAt: "2026-08-17T07:15",
    sharingActive: false,
    paymentReference: "TAAA4T2D47S",
  };
  const started = applyJourneyAction(job, "start_tracking");
  assert.ok(started.ok);
  if (started.ok) {
    assert.equal(started.job.sharingActive, true);
    assert.ok(started.job.trackingStartedAt);
    assert.equal(started.job.paymentReference, "TAAA4T2D47S");
  }
  const stopped = applyJourneyAction(started.ok ? started.job : job, "stop_tracking");
  assert.ok(stopped.ok);
  if (stopped.ok) {
    assert.equal(stopped.job.sharingActive, false);
    assert.ok(stopped.job.trackingStoppedAt);
    assert.equal(stopped.job.paymentReference, "TAAA4T2D47S");
    // Live pin cleared; history fields on job are not wiped by applyJourneyAction
    assert.equal(stopped.job.driverLat, undefined);
  }
  console.log("OK  journey start/stop preserves paymentReference");
}

section("CORS + client always send session and dashboard key");
{
  const cors = read("shared/google-places.ts");
  assert.match(cors, /X-Tracking-Session/);
  const api = read("src/lib/tracking-api.ts");
  assert.match(api, /headers\["X-Tracking-Session"\]/);
  assert.match(api, /"X-Driver-Key":\s*driverKey/);
  assert.match(api, /pointCount\?:/);
  console.log("OK  client posts session + key; returns pointCount");
}

section("Owner UI waits for server-accepted GPS");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /serverConnected/);
  assert.match(panel, /WAITING FOR GPS/);
  assert.match(panel, /GPS NOT RECORDING/);
  assert.match(panel, /Points recorded:/);
  assert.match(panel, /GPS: Connected/);
  assert.match(panel, /getCurrentPosition/);
  assert.match(panel, /customerSeesHistoricalRoute|Historical GPS stays owner-only/);
  console.log("OK  owner panel gates LIVE on server ack");
}

function tStamp() {
  return "2026-08-17T05:45:14.661Z";
}

console.log("\nAll GPS ingestion checks passed.");

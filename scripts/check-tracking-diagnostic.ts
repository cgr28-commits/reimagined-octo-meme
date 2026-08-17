/**
 * Static checks for owner-only tracking diagnostic (read-only, no secret leakage).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

section("Worker diagnostic endpoint (owner-only, read-only)");
{
  const handlers = read("workers/addresses/src/journey-handlers.ts");
  const index = read("workers/addresses/src/index.ts");
  assert.match(handlers, /handleTrackingDiagnosticRequest/);
  assert.match(handlers, /isJourneyDiagnosticPath/);
  assert.match(handlers, /ownerAuthorized\(request, env\)/);
  assert.match(handlers, /findTrackingJobsByPaymentReference/);
  assert.match(handlers, /getDriverLocationHistory/);
  assert.match(handlers, /Read-only diagnostic\. No journey data was modified/);
  assert.match(handlers, /customerSeesHistoricalRoute: false/);
  // Diagnostic handler must not mutate jobs or create sessions.
  const diagStart = handlers.indexOf("export async function handleTrackingDiagnosticRequest");
  assert.ok(diagStart > 0);
  const diagBody = handlers.slice(diagStart, diagStart + 5500);
  assert.doesNotMatch(diagBody, /saveTrackingJob|appendDriverLocationPoint|store\.delete|store\.put/);
  assert.doesNotMatch(diagBody, /createTrackingJobFromBooking|createTrackingSession|ensure/);
  assert.match(index, /handleTrackingDiagnosticRequest/);
  assert.match(index, /isJourneyDiagnosticPath/);
  assert.match(handlers, /paid-bookings\/tracking-diagnostic/);
  console.log("OK  owner-only GET diagnostic; no KV writes in handler");
}

section("No secrets in diagnostic response shape");
{
  const handlers = read("workers/addresses/src/journey-handlers.ts");
  assert.match(handlers, /function buildSessionDiagnostic/);
  assert.match(handlers, /fieldsStored/);
  assert.match(handlers, /cloudflare_kv/);
  assert.match(handlers, /latitudeLongitude/);
  const diagStart = handlers.indexOf("export async function handleTrackingDiagnosticRequest");
  const diagBody = handlers.slice(diagStart, diagStart + 5500);
  assert.doesNotMatch(diagBody, /OWNER_ACCESS_KEY\s*:/);
  assert.doesNotMatch(diagBody, /points:\s*points/);
  console.log("OK  response omits access keys and full GPS trail");
}

section("Owner dashboard wiring");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  const api = read("src/lib/paid-bookings-api.ts");
  assert.match(api, /fetchTrackingDiagnostic/);
  assert.match(api, /paid-bookings\/tracking-diagnostic/);
  assert.match(api, /X-Owner-Key/);
  assert.match(panel, /Tracking diagnostic \(read-only\)/);
  assert.match(panel, /fetchTrackingDiagnostic/);
  assert.match(panel, /TrackingDiagnosticView/);
  console.log("OK  owner panel button + client API use existing owner key header");
}

section("Retention export");
{
  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /export const TRACKING_JOB_TTL_SECONDS/);
  console.log("OK  job TTL exported for diagnostic retention reporting");
}

console.log("\nAll tracking-diagnostic checks passed.");

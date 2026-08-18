/**
 * Owner-only Journey Evidence — offline checks.
 * Run: npx tsx scripts/check-journey-evidence.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Evidence endpoint is owner-only + paymentReference lookup ===");
{
  const handlers = read("workers/addresses/src/journey-handlers.ts");
  assert.match(handlers, /handleJourneyEvidenceRequest/);
  assert.match(handlers, /ownerAuthorized/);
  assert.match(handlers, /Unauthorized — owner access required/);
  assert.match(handlers, /paymentReference/);
  assert.match(handlers, /getDriverLocationHistory/);
  assert.match(handlers, /routeReconstructable/);
  assert.match(handlers, /integrityNotes/);
  assert.match(handlers, /does not prove the identity of any passenger/i);
  assert.match(handlers, /customerSeesHistoricalRoute: false/);
  assert.match(handlers, /timeline:/);
  assert.match(handlers, /Not recorded|booking_created|tracking_started/);
  assert.match(handlers, /paid-bookings\/journey-evidence/);
  // Evidence handler must not mutate GPS collection / tracking jobs.
  const evidenceFn = handlers.slice(
    handlers.indexOf("export async function handleJourneyEvidenceRequest"),
    handlers.indexOf("export async function handleEnsureTrackingRequest"),
  );
  assert.doesNotMatch(evidenceFn, /appendDriverLocationPoint/);
  assert.doesNotMatch(evidenceFn, /saveTrackingJob\(/);
  console.log("OK  owner-only evidence API; read-only; payment ref lookup; integrity notes");
}

console.log("\n=== 2. Client uses X-Owner-Key header (no key in URL) ===");
{
  const api = read("src/lib/tracking-api.ts");
  const evidenceFn = api.slice(api.indexOf("export async function fetchJourneyEvidence"));
  const nextExport = evidenceFn.search(/\nexport async function (?!fetchJourneyEvidence)/);
  const body = nextExport >= 0 ? evidenceFn.slice(0, nextExport) : evidenceFn;
  assert.match(body, /X-Owner-Key/);
  assert.match(body, /paid-bookings\/journey-evidence/);
  assert.doesNotMatch(body, /driverQueryKey/);
  assert.doesNotMatch(body, /searchParams\.set\("key"/);
  console.log("OK  fetchJourneyEvidence authenticates via header only");
}

console.log("\n=== 3. Owner dashboard + dedicated evidence page ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /View Journey Evidence/);
  assert.match(panel, /\/owner\/journey-evidence\/\?ref=/);
  assert.match(panel, /Tracking diagnostic \(read-only\)/);
  // Normal paid-booking links must not put the customer tracking token in the URL.
  assert.doesNotMatch(panel, /journey-evidence\/\?ref=[^"']*&token=/);
  assert.doesNotMatch(panel, /journey-evidence\/[^"']*token=/);

  const page = read("src/app/owner/journey-evidence/page.tsx");
  assert.match(page, /index:\s*false/);
  assert.match(page, /OwnerJourneyEvidenceClient/);
  assert.match(page, /Suspense/);
  assert.match(page, /Static-export friendly|client-side/);
  assert.doesNotMatch(page, /await searchParams\)/);

  const client = read("src/components/OwnerJourneyEvidenceClient.tsx");
  assert.match(client, /useSearchParams/);
  assert.match(client, /Journey Evidence/);
  assert.match(client, /Evidence summary/);
  assert.match(client, /Download Journey Evidence PDF/);
  assert.match(client, /Export dispute evidence/);
  assert.match(client, /buildDisputeEvidenceSummary/);
  assert.match(client, /window\.print/);
  assert.match(client, /Not recorded/);
  assert.match(client, /LiveTrackMap/);
  assert.match(client, /matni-owner-key/);
  assert.match(client, /existing owner dashboard/i);
  assert.match(client, /future hardening/i);
  assert.match(client, /does not prove|passenger/i);
  assert.match(client, /paymentReference \? undefined : token/);
  assert.doesNotMatch(client, /OWNER_ACCESS_KEY/);
  assert.doesNotMatch(client, /searchParams\.set\(["']key["']/);

  const driver = read("src/app/driver/DriverPageClient.tsx");
  assert.match(
    driver,
    /journey-evidence\/\?ref=\$\{encodeURIComponent\(job\.paymentReference\)\}/,
  );
  assert.doesNotMatch(
    driver,
    /journey-evidence\/\?ref=\$\{encodeURIComponent\(job\.paymentReference\)\}&token=/,
  );
  console.log("OK  owner UI + dedicated page; paid links use ref only; auth matches dashboard");
}

console.log("\n=== 3b. Owner auth architecture note ===");
{
  const driver = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driver, /matni-owner-key/);
  assert.match(driver, /sessionStorage/);
  const refund = read("src/app/admin/refund/RefundPageClient.tsx");
  assert.match(refund, /matni-owner-key/);
  const paidApi = read("src/lib/paid-bookings-api.ts");
  assert.match(paidApi, /X-Owner-Key/);
  console.log(
    "OK  Journey Evidence reuses the same sessionStorage + X-Owner-Key owner pattern as dashboard/refund (no separate session proxy exists yet)",
  );
}

console.log("\n=== 4. Customer live tracking stays live-pin only ===");
{
  const track = read("src/app/track/TrackPageClient.tsx");
  assert.match(track, /LiveTrackMap/);
  assert.doesNotMatch(track, /route=\{/);
  assert.doesNotMatch(track, /journey-evidence|Journey Evidence|fetchJourneyEvidence/);
  console.log("OK  customer /track does not load historical evidence");
}

console.log("\n=== 5. GPS collection path unchanged by evidence feature ===");
{
  const store = read("workers/addresses/src/tracking-store.ts");
  assert.match(store, /appendDriverLocationPoint/);
  assert.match(store, /getDriverLocationHistory/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /handleJourneyEvidenceRequest/);
  assert.match(index, /isJourneyEvidencePath/);
  console.log("OK  GPS store helpers still present; evidence wired in Worker index");
}

console.log("\nAll journey evidence checks passed.");

/**
 * Safer Owner primary journey buttons — colours, spacing, two-stage confirm.
 * Offline only. Run: npx tsx scripts/check-owner-safer-journey-buttons.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_PRIMARY_JOURNEY_BUTTON_LABELS,
  ownerPrimaryJourneyConfirmCopy,
  ownerUpcomingPrimaryJourneyActions,
} from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Confirm copy + button order ===");
{
  assert.deepEqual(
    ownerUpcomingPrimaryJourneyActions({
      journeyStatus: "idle",
      bookingStatus: "confirmed",
    }),
    ["start_tracking", "arrived_pickup", "complete_journey"],
  );
  assert.deepEqual(Object.values(OWNER_PRIMARY_JOURNEY_BUTTON_LABELS), [
    "Driver on the way",
    "Driver arrived",
    "Complete job",
  ]);

  const onWay = ownerPrimaryJourneyConfirmCopy("start_tracking");
  assert.match(onWay.title, /Driver on the way/i);
  assert.equal(onWay.confirmLabel, "Confirm");
  assert.equal(onWay.cancelLabel, "Cancel");

  const arrived = ownerPrimaryJourneyConfirmCopy("arrived_pickup");
  assert.match(arrived.title, /arrived/i);
  assert.equal(arrived.confirmLabel, "Confirm");

  const complete = ownerPrimaryJourneyConfirmCopy("complete_journey");
  assert.equal(complete.title, "Complete this journey?");
  assert.match(complete.body || "", /Active jobs to Completed jobs/);
  assert.equal(complete.confirmLabel, "Confirm completion");

  console.log("OK  order + confirmation copy");
}

console.log("\n=== 2. Owner panel: colours, spacing, two-stage confirm ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /data-owner-primary-journey-controls/);
  assert.match(panel, /gap-3\.5/);
  assert.match(panel, /min-h-14/);
  assert.match(panel, /bg-sky-400/);
  assert.match(panel, /bg-amber-300/);
  assert.match(panel, /bg-emerald/);
  assert.match(panel, /ownerPrimaryJourneyConfirmCopy/);
  assert.match(panel, /data-owner-journey-confirm=/);
  assert.match(panel, /data-owner-journey-confirm-yes=/);
  assert.match(panel, /data-owner-journey-confirm-cancel=/);
  assert.match(panel, /confirmCopy\.confirmLabel/);
  assert.match(panel, /setJourneyConfirm/);
  const sharedCopy = read("shared/upcoming-jobs.ts");
  assert.match(sharedCopy, /confirmLabel:\s*"Confirm completion"/);

  // Primary CTA tap must open confirm — not fire handleJourneyAction directly.
  const actionBtn = panel.match(
    /data-owner-journey-action=\{item\.action\}[\s\S]{0,400}?onClick=\{\(\) => \{([\s\S]{0,500}?)\}\}/,
  );
  assert.ok(actionBtn, "primary action button onClick present");
  assert.match(actionBtn![1]!, /setJourneyConfirm/);
  assert.doesNotMatch(actionBtn![1]!, /handleJourneyAction/);

  // Confirm yes fires the journey action.
  assert.match(
    panel,
    /data-owner-journey-confirm-yes=\{item\.action\}[\s\S]{0,250}?handleJourneyAction\(booking, item\.action\)/,
  );

  // Retry arrival notification can still fire without the primary confirm sheet.
  assert.match(panel, /retryArrivalNotification:\s*true/);

  // No slide-to-confirm / GPS live UI. Primary journey CTAs must not use red.
  assert.doesNotMatch(panel, /slide-to-confirm|Slide to/i);
  assert.doesNotMatch(panel, /PaidBookingLiveTracking|Start Live Tracking|GPS Live/);
  const controlsStart = panel.indexOf("function renderJourneyControls");
  const controlsEnd = panel.indexOf("function renderBookingCard");
  assert.ok(controlsStart > 0 && controlsEnd > controlsStart);
  const controls = panel.slice(controlsStart, controlsEnd);
  assert.doesNotMatch(controls, /\bbg-red-/);
  assert.match(controls, /bg-sky-400/);
  assert.match(controls, /bg-amber-300/);
  assert.match(controls, /bg-emerald/);

  // Customer notification wiring preserved.
  assert.match(panel, /openOnTheWayWhatsAppForBooking/);
  assert.match(panel, /openArrivalWhatsAppForBooking/);

  const shared = read("shared/upcoming-jobs.ts");
  const workerShared = read("workers/addresses/shared/upcoming-jobs.ts");
  assert.equal(shared, workerShared);
  assert.match(shared, /ownerPrimaryJourneyConfirmCopy/);

  console.log("OK  colours · spacing · confirm-before-side-effects · no GPS");
}

console.log("\nSafer Owner journey button checks passed.");

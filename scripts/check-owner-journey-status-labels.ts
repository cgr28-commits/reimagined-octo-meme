/**
 * Owner Dashboard journey status + default-driver label presentation.
 * Run: npx tsx scripts/check-owner-journey-status-labels.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignedDriverDisplay,
  journeyStatusLabel,
} from "../shared/upcoming-jobs";
import {
  PRIMARY_DRIVER_LABEL,
  resolveAssignedDriverLabel,
} from "../shared/paid-booking-record";
import { customerJourneyLabel, type TrackingJobRecord } from "../shared/tracking";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Owner dashboard journey wording (idle → Upcoming) ===");
{
  assert.equal(journeyStatusLabel("idle"), "Upcoming");
  assert.equal(journeyStatusLabel(undefined), "Upcoming");
  assert.equal(journeyStatusLabel("tracking"), "Live Tracking");
  assert.equal(journeyStatusLabel("idle", { sharingActive: true }), "Live Tracking");
  assert.equal(journeyStatusLabel("arrived_pickup"), "Arrived at Pickup");
  assert.equal(journeyStatusLabel("en_route"), "Journey in Progress");
  assert.equal(journeyStatusLabel("completed"), "Completed");
  console.log("OK  Upcoming → Live Tracking → Arrived at Pickup → Journey in Progress → Completed");
}

console.log("\n=== 2. Customer track labels unchanged (Driver preparing) ===");
{
  const idle: Pick<TrackingJobRecord, "journeyStatus" | "sharingActive"> = {
    journeyStatus: "idle",
    sharingActive: false,
  };
  assert.equal(customerJourneyLabel(idle), "Driver preparing");
  assert.equal(
    customerJourneyLabel({ journeyStatus: "idle", sharingActive: true }),
    "Driver on the way",
  );
  console.log("OK  customerJourneyLabel / JOURNEY_STATUS_LABELS preserved for /track");
}

console.log("\n=== 3. Default driver display — not UNASSIGNED ===");
{
  assert.equal(resolveAssignedDriverLabel(undefined), PRIMARY_DRIVER_LABEL);
  assert.equal(resolveAssignedDriverLabel(""), PRIMARY_DRIVER_LABEL);
  assert.equal(resolveAssignedDriverLabel(undefined, "Colin"), "Colin");
  assert.equal(resolveAssignedDriverLabel("Gary", "Colin"), "Gary");
  assert.equal(assignedDriverDisplay(undefined, undefined), PRIMARY_DRIVER_LABEL);
  assert.equal(assignedDriverDisplay("Colin", undefined), "Colin");
  console.log("OK  explicit assignee wins; else Owner display name / Primary Driver");
}

console.log("\n=== 4. Owner UI + API wiring ===");
{
  const driverPage = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driverPage, /defaultDriverLabel/);
  assert.match(driverPage, /Owner \/ Primary Driver/);
  assert.match(driverPage, /"Upcoming"/);
  assert.doesNotMatch(
    driverPage,
    /const journeyLabel = job\.journeyStatusLabel \?\? \(job\.sharingActive \? "Driver on the way" : "Driver preparing"\);/,
  );

  const trackingHandlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(trackingHandlers, /ownerDashboardJourneyLabel/);
  assert.match(trackingHandlers, /assignedDriverLabel/);
  assert.match(trackingHandlers, /defaultDriverName/);
  assert.match(trackingHandlers, /role === "owner"/);

  const paidHandlers = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(paidHandlers, /getOwnerAccountProfile/);
  assert.match(paidHandlers, /resolveAssignedDriverLabel\(assignedDriverName, ownerDisplayName\)/);

  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /journeyStatusLabel\(booking\.journeyStatus/);
  assert.match(panel, /sharingActive:\s*booking\.sharingActive/);

  // Arrival WhatsApp still falls back to owner vehicle when no explicit assignee.
  assert.match(panel, /fetchOwnerAccountProfile/);
  assert.match(panel, /resolveArrivalVehicleForBooking/);
  console.log("OK  Owner job cards + paid bookings use dashboard labels / default driver");
}

console.log("\nAll owner journey status label checks passed.");

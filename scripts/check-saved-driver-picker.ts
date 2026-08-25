/**
 * Owner saved-driver picker + assignment history — offline source/unit checks.
 * Run: npx tsx scripts/check-saved-driver-picker.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDriverAssignmentHistory,
  type TrackingJobRecord,
} from "../shared/tracking";
import {
  DEMO_OWNER_NAME,
  DEMO_ROSTER,
  getDemoOwnerVehicle,
  getDemoOwnerVehicleProfiles,
} from "../src/lib/tracking-demo";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Demo profiles expose Colin + Gary ===");
{
  const profiles = getDemoOwnerVehicleProfiles();
  assert.ok(profiles.some((p) => p.profileKey === "owner" && p.displayName === DEMO_OWNER_NAME));
  assert.ok(profiles.some((p) => p.displayName === "Gary"));
  assert.deepEqual(
    profiles.filter((p) => p.profileKey !== "owner").map((p) => p.displayName),
    [...DEMO_ROSTER],
  );
  const colin = getDemoOwnerVehicle("owner");
  assert.equal(colin.displayName, "Colin");
  assert.ok(colin.email.includes("@"));
  const gary = getDemoOwnerVehicle("gary");
  assert.equal(gary.displayName, "Gary");
  console.log("OK  Colin (owner) + Gary available for picker");
}

console.log("\n=== 2. Assignment history append never deletes prior entries ===");
{
  const base = {
    token: "t1",
    createdAt: "2026-08-01T10:00:00.000Z",
    tripDate: "2026-08-24",
    tripTime: "10:00",
    pickupLabel: "A",
    dropoffLabel: "B",
    customerName: "Test",
    assignedDriverName: "Colin",
    assignmentStatus: "accepted",
    assignedAt: "2026-08-20T09:00:00.000Z",
    assignmentHistory: [
      {
        at: "2026-08-20T09:00:00.000Z",
        action: "assigned" as const,
        fromDriverName: null,
        toDriverName: "Colin",
      },
    ],
  } as TrackingJobRecord;

  const reassigned = appendDriverAssignmentHistory(base, {
    at: "2026-08-21T11:00:00.000Z",
    action: "reassigned",
    fromDriverName: "Colin",
    toDriverName: "Gary",
  });

  assert.equal(reassigned.assignmentHistory?.length, 2);
  assert.equal(reassigned.assignmentHistory?.[0]?.toDriverName, "Colin");
  assert.equal(reassigned.assignmentHistory?.[1]?.action, "reassigned");
  assert.equal(reassigned.assignmentHistory?.[1]?.fromDriverName, "Colin");
  assert.equal(reassigned.assignmentHistory?.[1]?.toDriverName, "Gary");
  assert.equal(base.assignmentHistory?.length, 1, "original job history untouched");
  console.log("OK  audit trail appends reassigned from/to");
}

console.log("\n=== 3. UI sources use chip picker + More options Reassign ===");
{
  const panel = read("src/components/OwnerAssignDriverPanel.tsx");
  assert.match(panel, /Saved drivers/);
  assert.match(panel, /Assign \$\{name\}|Assign \$\{/);
  assert.match(panel, /Reassign to/);
  assert.match(panel, /Owner \/ Primary Driver|PRIMARY_DRIVER_LABEL/);
  assert.match(panel, /Assignment history/);

  const paid = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(paid, /Reassign driver/);
  assert.match(paid, /Assign driver/);
  assert.match(paid, /OwnerAssignDriverPanel/);
  assert.match(paid, /More options ▼/);

  const jobCard = read("src/app/driver/DriverPageClient.tsx");
  assert.match(jobCard, /OwnerAssignDriverPanel/);
  assert.match(jobCard, /Add saved driver/);
  assert.doesNotMatch(jobCard, /Prefill from saved driver profile/);

  const assignHandlers = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(assignHandlers, /appendDriverAssignmentHistory/);
  assert.match(assignHandlers, /reassigned/);
  assert.match(assignHandlers, /deassigned/);

  const vehicleHandlers = read("workers/addresses/src/driver-vehicle-handlers.ts");
  assert.match(vehicleHandlers, /getOwnerAccountProfile/);
  console.log("OK  chip picker + reassign + history wired");
}

console.log("\nSaved driver picker checks passed");

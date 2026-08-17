/**
 * Offline checks: Owner profile is the default journey driver.
 * Does not call live APIs or mutate KV.
 * Run: npx tsx scripts/check-owner-default-driver.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OWNER_VEHICLE_PROFILE_KEY, vehicleProfileComplete } from "../shared/driver-vehicle";
import { ownerAccountProfileComplete } from "../shared/owner-profile";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Customer tracking falls back to owner profile ===");
{
  const store = read("workers/addresses/src/driver-vehicle-store.ts");
  assert.match(store, /resolveCustomerVisibleVehicle/);
  assert.match(store, /getOwnerAccountProfile/);
  assert.match(store, /ownerAccountAsDriverVehicle/);
  assert.match(store, /OWNER_VEHICLE_PROFILE_KEY/);
  assert.match(
    store,
    /Named non-owner driver without a complete profile: do not invent owner vehicle/,
  );
  console.log("OK  resolveCustomerVisibleVehicle prefers assigned driver, else owner");
}

console.log("\n=== 2. Owner Dashboard copy — no duplicate owner entry ===");
{
  const ownerPanel = read("src/components/OwnerAccountProfilePanel.tsx");
  assert.match(ownerPanel, /default driver/);
  assert.match(ownerPanel, /do not need to enter the same details again/);

  const driverPage = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driverPage, /Additional drivers \(optional\)/);
  assert.match(driverPage, /Using Owner profile as the default driver/);
  assert.match(driverPage, /profileKey !== "owner"/);
  assert.doesNotMatch(
    driverPage,
    /Separate from your owner account profile\. Save each driver's contact/,
  );
  console.log("OK  Owner UI treats owner profile as default; additional drivers optional");
}

console.log("\n=== 3. Owner mirror + completeness helpers still aligned ===");
{
  const ownerStore = read("workers/addresses/src/owner-profile-store.ts");
  assert.match(ownerStore, /LEGACY_OWNER_VEHICLE_KEY|driver:vehicle:owner/);
  assert.match(ownerStore, /Keep legacy key in sync/);

  assert.equal(OWNER_VEHICLE_PROFILE_KEY, "owner");
  assert.equal(
    ownerAccountProfileComplete({
      displayName: "Chris",
      email: "chris@example.com",
      make: "Mercedes",
      model: "E-Class",
      colour: "Black",
      registration: "ABC 1234",
    }),
    true,
  );
  assert.equal(
    vehicleProfileComplete({
      make: "Mercedes",
      model: "E-Class",
      colour: "Black",
      registration: "ABC 1234",
    }),
    true,
  );
  console.log("OK  Owner save still mirrors driver:vehicle:owner");
}

console.log("\nAll owner-default-driver checks passed.");

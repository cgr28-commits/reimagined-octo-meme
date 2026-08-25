/**
 * Verifies client-side demo data for owner/driver dashboards and track demos.
 * Used by the daily health check so regressions in demo features fail the run.
 */

import assert from "node:assert/strict";
import {
  DEMO_DRIVER_KEY,
  DEMO_DRIVER_NAME,
  DEMO_OWNER_KEY,
  DEMO_ROSTER,
  getDemoDriverJobs,
  getDemoDriverPendingJobRaw,
  getDemoDriverPendingJobs,
  getDemoDriverStatus,
  getDemoDriverUpcomingJobs,
  getDemoDriverVehicle,
  getDemoOwnerJobs,
  getDemoOwnerLocationHistory,
  getDemoOwnerPendingJobs,
  getDemoOwnerStatus,
  getDemoOwnerVehicleProfiles,
  getDemoTrackResponse,
  sanitizeDemoJobForDriver,
  setDemoDriverPendingAssignmentStatus,
} from "../src/lib/tracking-demo";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("demo keys are distinct", () => {
  assert.notEqual(DEMO_DRIVER_KEY, DEMO_OWNER_KEY);
  assert.equal(DEMO_DRIVER_KEY, "demo-driver-key");
  assert.equal(DEMO_OWNER_KEY, "demo-owner-key");
});

check("driver status role", () => {
  const status = getDemoDriverStatus();
  assert.equal(status.role, "driver");
  assert.equal(status.driverName, DEMO_DRIVER_NAME);
  assert.equal(status.ok, true);
});

check("owner status role + roster", () => {
  const status = getDemoOwnerStatus();
  assert.equal(status.role, "owner");
  assert.deepEqual(status.availableDrivers, [...DEMO_ROSTER]);
  assert.ok(status.availableDrivers.includes(DEMO_DRIVER_NAME));
});

check("driver today jobs are sanitized", () => {
  const response = getDemoDriverJobs();
  assert.equal(response.role, "driver");
  assert.ok(response.jobs.length >= 2);

  for (const job of response.jobs) {
    assert.equal(job.assignmentStatus, "accepted");
    assert.equal(job.customerMobile, "+447700900456");
    assert.equal(job.paymentReference, undefined);
    assert.equal(job.amountPaidLabel, undefined);
    assert.equal(job.driverLocationPointCount, undefined);
    assert.ok(job.journeyNotes);
  }

  const airport = response.jobs.find((job) => job.token === "demo-waiting");
  assert.ok(airport);
  assert.equal(airport.isAirportPickup, true);
  assert.equal(airport.flightNumber, "EZY123");
  assert.ok(airport.flight);

  const live = response.jobs.find((job) => job.token === "demo-live");
  assert.ok(live);
  assert.equal(live.sharingActive, true);
  assert.ok(live.driver);
});

check("driver pending job is accept-ready", () => {
  const response = getDemoDriverPendingJobs();
  assert.equal(response.jobs.length, 1);
  const pending = response.jobs[0];
  assert.ok(pending);
  assert.equal(pending.token, "demo-pending");
  assert.equal(pending.assignmentStatus, "pending");
  assert.equal(pending.assignedDriverName, DEMO_DRIVER_NAME);
  assert.equal(pending.customerMobile, undefined);
  assert.equal(pending.flightNumber, undefined);
  assert.equal(pending.customerName, "Customer details available after acceptance");
  assert.equal(pending.trackUrl, undefined);

  const accepted = sanitizeDemoJobForDriver({
    ...getDemoDriverPendingJobRaw(),
    assignmentStatus: "accepted",
  });
  assert.equal(accepted.customerName, "Jordan Demo");
  assert.equal(accepted.customerMobile, "+447700900321");
  assert.equal(accepted.dropoffLabel, "Grand Central Hotel, Belfast");
  assert.equal(accepted.flightNumber, "BA1234");
  assert.ok(accepted.journeyNotes);
});

check("owner today jobs include payments + unassigned", () => {
  const response = getDemoOwnerJobs();
  assert.equal(response.role, "owner");
  assert.ok(response.jobs.length >= 3);

  const live = response.jobs.find((job) => job.token === "demo-live");
  assert.ok(live);
  assert.ok(live.customerMobile);
  assert.ok(live.paymentReference);
  assert.ok(live.amountPaidLabel);
  assert.ok((live.driverLocationPointCount ?? 0) > 0);

  const unassigned = response.jobs.find((job) => job.token === "demo-unassigned");
  assert.ok(unassigned);
  assert.equal(unassigned.assignmentStatus, "unassigned");
  assert.ok(unassigned.customerMobile);
});

check("owner pending job retains owner fields", () => {
  const response = getDemoOwnerPendingJobs();
  const pending = response.jobs[0];
  assert.ok(pending);
  assert.equal(pending.assignmentStatus, "pending");
  assert.ok(pending.customerMobile);
  assert.ok(pending.paymentReference);
  assert.equal(pending.flightNumber, "BA1234");
});

check("owner GPS audit history for live job", () => {
  const history = getDemoOwnerLocationHistory("demo-live");
  assert.ok(history.count >= 3);
  assert.ok(history.points.length >= 3);
  assert.equal(getDemoOwnerLocationHistory("demo-waiting").count, 0);
});

check("owner vehicle profiles roster", () => {
  const profiles = getDemoOwnerVehicleProfiles();
  assert.ok(profiles.some((profile) => profile.profileKey === "owner"));
  assert.ok(profiles.some((profile) => profile.displayName === "Colin"));
  assert.ok(profiles.some((profile) => profile.displayName === "Gary"));
  assert.deepEqual(
    profiles.filter((profile) => profile.profileKey !== "owner").map((p) => p.displayName),
    [...DEMO_ROSTER],
  );
});

check("driver vehicle profile", () => {
  const vehicle = getDemoDriverVehicle();
  assert.equal(vehicle.displayName, DEMO_DRIVER_NAME);
  assert.ok(vehicle.make);
  assert.ok(vehicle.model);
  assert.ok(vehicle.registration);
});

check("public track demos", () => {
  const early = getDemoTrackResponse("demo-early");
  assert.equal(early.trackingWindow.open, false);
  assert.equal(early.sharingActive, false);

  const waiting = getDemoTrackResponse("demo-waiting");
  assert.equal(waiting.trackingWindow.open, true);
  assert.equal(waiting.sharingActive, false);
  assert.equal(waiting.customerName, "Jamie Demo");

  const live = getDemoTrackResponse("demo-live");
  assert.equal(live.sharingActive, true);
  assert.ok(live.driver);
  assert.ok(live.vehicle?.registration);
});

check("sanitize keeps accepted contact but strips owner-only fields", () => {
  const ownerJob = getDemoOwnerJobs().jobs.find((job) => job.token === "demo-live");
  assert.ok(ownerJob);
  const sanitized = sanitizeDemoJobForDriver(ownerJob);
  assert.equal(sanitized.customerMobile, ownerJob.customerMobile);
  assert.equal(sanitized.paymentReference, undefined);
  assert.equal(sanitized.amountPaidLabel, undefined);
  assert.equal(sanitized.driverLocationPointCount, undefined);
});

check("accepted demo assignment persists across Upcoming reload", () => {
  setDemoDriverPendingAssignmentStatus("accepted");
  assert.equal(getDemoDriverPendingJobs().jobs.length, 0);
  const accepted = getDemoDriverUpcomingJobs().jobs.find((job) => job.token === "demo-pending");
  assert.ok(accepted);
  assert.equal(accepted.assignmentStatus, "accepted");
  assert.equal(accepted.customerName, "Jordan Demo");
  assert.equal(accepted.customerMobile, "+447700900321");
  assert.ok(accepted.journeyNotes);
  setDemoDriverPendingAssignmentStatus("pending");
});

console.log(`Demo feature integrity: ${passed} checks passed`);

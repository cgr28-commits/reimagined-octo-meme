/**
 * Regression: assign → email accept → job appears on Driver Dashboard.
 * Also checks driver-pay privacy (£ format, no customer fare) and reassignment.
 * Run: npx tsx scripts/check-driver-accept-dashboard.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDriverAssignmentHistory,
  driverNamesMatch,
  formatDriverPayAmount,
  jobVisibleToDriver,
  type TrackingJobRecord,
} from "../shared/tracking";
import { buildDriverAssignmentEmail, type BookingJobRecord } from "../shared/booking-job";
import { filterJobsForSession } from "../workers/addresses/src/driver-assignment-utils";
import {
  resolveStoredDriverSession,
  sanitizeDriverJobForRole,
} from "../workers/addresses/src/driver-auth";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
console.log("=== 1. Driver name matching (Gary ↔ session) ===");
{
  assert.equal(driverNamesMatch("Gary", "Gary"), true);
  assert.equal(driverNamesMatch("Gary", "gary"), true);
  assert.equal(driverNamesMatch("Gary Wilson", "Gary"), true);
  assert.equal(driverNamesMatch("Gary", "Colin"), false);
  assert.equal(jobVisibleToDriver({ assignedDriverName: "Gary", assignmentStatus: "accepted" }, "Gary"), true);
  assert.equal(jobVisibleToDriver({ assignedDriverName: "Gary", assignmentStatus: "pending" }, "Gary"), true);
  assert.equal(jobVisibleToDriver({ assignedDriverName: "Gary", assignmentStatus: "accepted" }, "Colin"), false);
  assert.equal(jobVisibleToDriver({ assignedDriverName: "Gary", assignmentStatus: "declined" }, "Gary"), false);
  assert.equal(jobVisibleToDriver({ assignedDriverName: "Gary", assignmentStatus: "unassigned" }, "Gary"), false);
  console.log("OK  visibility rules for pending/accepted only");
}

console.log("\n=== 1b. Saved profile resolves missing deployed DRIVER_NAME ===");
{
  const records = new Map<string, unknown>([
    ["driver:vehicle-index", ["gary"]],
    [
      "driver:vehicle:gary",
      {
        profileKey: "gary",
        displayName: "Gary",
        email: "gary@example.com",
        mobile: "07700900123",
        make: "Skoda",
        model: "Superb",
        colour: "Black",
        registration: "ABC123",
        updatedAt: "2026-08-24T12:00:00.000Z",
      },
    ],
  ]);
  const store = {
    get: async (key: string) => records.get(key) ?? null,
  } as unknown as KVNamespace;
  const request = new Request("https://worker.example/driver/jobs?key=live-driver-key");
  const resolved = await resolveStoredDriverSession(
    request,
    { DRIVER_ACCESS_KEY: "live-driver-key" },
    store,
  );
  assert.deepEqual(resolved, {
    authorized: true,
    role: "driver",
    driverName: "Gary",
    driverEmail: "gary@example.com",
  });

  records.set("driver:vehicle-index", ["gary", "another-driver"]);
  records.set("driver:vehicle:another-driver", {
    profileKey: "another-driver",
    displayName: "Another Driver",
    email: "another@example.com",
    make: "Ford",
    model: "Galaxy",
    colour: "Blue",
    registration: "XYZ789",
    updatedAt: "2026-08-24T12:00:00.000Z",
  });
  const ambiguous = await resolveStoredDriverSession(
    request,
    { DRIVER_ACCESS_KEY: "live-driver-key" },
    store,
  );
  assert.equal(
    ambiguous.authorized && ambiguous.role === "driver" ? ambiguous.driverName : null,
    "Driver",
  );
  console.log("OK  one saved driver resolves by profile; multiple profiles fail closed");
}

console.log("\n=== 2. filterJobsForSession after accept / reassign ===");
{
  const garyAccepted = {
    token: "t-gary",
    assignedDriverName: "Gary",
    assignmentStatus: "accepted",
  } as TrackingJobRecord;
  const colinPending = {
    token: "t-colin",
    assignedDriverName: "Colin",
    assignmentStatus: "pending",
  } as TrackingJobRecord;

  const forGary = filterJobsForSession([garyAccepted, colinPending], {
    authorized: true,
    role: "driver",
    driverName: "Gary",
  });
  assert.deepEqual(
    forGary.map((j) => j.token),
    ["t-gary"],
  );

  // Reassign Gary → Colin: Gary no longer sees it
  const reassigned = {
    ...garyAccepted,
    assignedDriverName: "Colin",
    assignmentStatus: "pending",
  } as TrackingJobRecord;
  const afterReassign = filterJobsForSession([reassigned], {
    authorized: true,
    role: "driver",
    driverName: "Gary",
  });
  assert.equal(afterReassign.length, 0);

  const forColin = filterJobsForSession([reassigned], {
    authorized: true,
    role: "driver",
    driverName: "Colin",
  });
  assert.equal(forColin.length, 1);
  console.log("OK  accept shows for Gary; reassign removes from Gary");
}

console.log("\n=== 3. Driver pay formatting + fare privacy ===");
{
  assert.equal(formatDriverPayAmount("40"), "£40.00");
  assert.equal(formatDriverPayAmount("40.5"), "£40.50");
  assert.equal(formatDriverPayAmount("£40"), "£40.00");
  assert.equal(formatDriverPayAmount(""), "TBC");

  const email = buildDriverAssignmentEmail({
    job: {
      id: "job-1",
      createdAt: new Date().toISOString(),
      status: "paid",
      kind: "booking-request",
      customerName: "Jamie",
      customerEmail: "jamie@example.com",
      customerMobile: "07700900111",
      tripLabel: "Transfer",
      pickupLabel: "A",
      dropoffLabel: "B",
      returnJourney: false,
      tripDate: "2026-08-28",
      tripTime: "10:00",
      passengers: 2,
      suitcases: 2,
      vehicle: "Estate",
      isAirportTrip: true,
      driverFirstName: "Gary",
      driverPayAmount: "40",
      amountPaidLabel: "£85.00",
      trackingToken: "track-abc",
    } as BookingJobRecord,
    acceptUrl: "https://example.com/driver-accept/?token=x",
  });
  assert.match(email.text, /Your pay for this journey: £40\.00/);
  assert.doesNotMatch(email.text, /£85/);
  assert.doesNotMatch(email.html, /£85/);
  assert.match(email.html, /£40\.00/);

  const sanitized = sanitizeDriverJobForRole(
    {
      token: "t1",
      amountPaidLabel: "£85.00",
      paymentReference: "PAY-1",
      bookingReference: "PAY-1",
      bookingStatus: "partially_refunded",
      refundAmountLabel: "£10",
      customerMobile: "07700",
      driverPayAmount: "£40.00",
      assignedDriverName: "Gary",
    },
    "driver",
  );
  assert.equal(sanitized.amountPaidLabel, undefined);
  assert.equal(sanitized.paymentReference, undefined);
  assert.equal(sanitized.bookingReference, undefined);
  assert.equal(sanitized.bookingStatus, undefined);
  assert.equal(sanitized.refundAmountLabel, undefined);
  assert.equal(sanitized.driverPayAmount, "£40.00");
  console.log("OK  £40.00 pay shown; customer fare stripped");
}

console.log("\n=== 4. Assignment history preserved on reassign ===");
{
  let job = {
    token: "t1",
    createdAt: "2026-08-01T00:00:00.000Z",
    tripDate: "2026-08-28",
    tripTime: "10:00",
    pickupLabel: "A",
    dropoffLabel: "B",
    customerName: "Jamie",
    assignedDriverName: "Gary",
    assignmentStatus: "accepted",
    assignmentHistory: [
      {
        at: "2026-08-20T09:00:00.000Z",
        action: "assigned" as const,
        fromDriverName: null,
        toDriverName: "Gary",
      },
    ],
  } as TrackingJobRecord;

  job = appendDriverAssignmentHistory(job, {
    at: "2026-08-21T10:00:00.000Z",
    action: "reassigned",
    fromDriverName: "Gary",
    toDriverName: "Colin",
  });
  assert.equal(job.assignmentHistory?.length, 2);
  assert.equal(job.assignmentHistory?.[0]?.toDriverName, "Gary");
  assert.equal(job.assignmentHistory?.[1]?.fromDriverName, "Gary");
  assert.equal(job.assignmentHistory?.[1]?.toDriverName, "Colin");
  console.log("OK  history keeps originally assigned + reassigned from/to");
}

console.log("\n=== 5. Source contracts (trackingToken sync + dashboard UI) ===");
{
  const assign = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(assign, /trackingToken:\s*token/);

  const bookingHandlers = read("workers/addresses/src/booking-job-handlers.ts");
  assert.match(bookingHandlers, /trackingToken/);
  assert.match(bookingHandlers, /getTrackingJob\(store, trackingToken\)/);
  assert.match(bookingHandlers, /job\.trackingToken = primary\.token/);

  const trackingHandlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(trackingHandlers, /syncTrackingAssignmentFromBooking/);
  assert.match(trackingHandlers, /driverPayAmount/);
  assert.match(trackingHandlers, /listBookingJobsForDateRange/);

  const driverUi = read("src/app/driver/DriverPageClient.tsx");
  assert.match(driverUi, /Your pay for this journey/);
  assert.match(driverUi, /formatDriverPayAmount/);

  const acceptUi = read("src/app/driver-accept/DriverAcceptClient.tsx");
  assert.match(acceptUi, /formatDriverPayAmount/);
  assert.match(acceptUi, /Driver Dashboard/);

  const sharedBooking = read("shared/booking-job.ts");
  assert.match(sharedBooking, /trackingToken\?:/);
  console.log("OK  assign stores trackingToken; jobs list self-heals; pay UI present");
}

console.log("\nDriver accept → dashboard checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

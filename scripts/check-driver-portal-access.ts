/**
 * Per-driver portal access. No payouts.
 * Run: npx tsx scripts/check-driver-portal-access.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDriverAssignmentEmail, type BookingJobRecord } from "../shared/booking-job";
import {
  assertNoDriverForbiddenFields,
  DRIVER_FORBIDDEN_FINANCIAL_KEYS,
} from "../shared/driver-job-sanitize";
import {
  authorizeDriverJobAction,
  buildSanitizedDriverJobView,
  createPortalToken,
  FUTURE_DRIVER_PAY_LEDGER_FIELDS,
  googleMapsNavigateUrl,
  jobVisibleToPortalDriver,
  PORTAL_LINK_PREFIX,
  sequentialDriverJourneyActions,
} from "../shared/driver-portal-access";
import { filterJobsForSession } from "../workers/addresses/src/driver-assignment-utils";
import type { TrackingJobRecord } from "../shared/tracking";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const driverA = {
  authorized: true as const,
  role: "driver" as const,
  driverName: "Driver A",
  profileKey: "driver-a",
};
const driverB = {
  authorized: true as const,
  role: "driver" as const,
  driverName: "Driver B",
  profileKey: "driver-b",
};
const owner = { authorized: true as const, role: "owner" as const };

const jobA = {
  assignedDriverName: "Driver A",
  assignedDriverProfileKey: "driver-a",
  assignmentStatus: "accepted" as const,
};
const jobB = {
  assignedDriverName: "Driver A",
  assignedDriverProfileKey: "driver-b",
  assignmentStatus: "accepted" as const,
};
const tamperedBody = {
  driverName: "Driver A",
  profileKey: "driver-a",
  assignedDriverProfileKey: "driver-a",
  token: "job-b",
};

check("Driver A cannot see Driver B’s job", () => {
  assert.equal(jobVisibleToPortalDriver(jobB, driverA), false);
  assert.equal(jobVisibleToPortalDriver(jobA, driverA), true);
  assert.equal(jobVisibleToPortalDriver(jobA, driverB), false);
  const visible = filterJobsForSession(
    [jobA, jobB] as unknown as TrackingJobRecord[],
    driverA,
  );
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.assignedDriverProfileKey, "driver-a");
});

check("Driver A cannot operate Driver B’s job by changing request values", () => {
  assert.equal(
    authorizeDriverJobAction(driverA, jobB, tamperedBody, "operate"),
    "This job is not assigned to you",
  );
  assert.equal(
    authorizeDriverJobAction(driverA, jobB, tamperedBody, "view"),
    "This job is not assigned to you",
  );
  assert.equal(authorizeDriverJobAction(driverA, jobA, tamperedBody, "operate"), null);
});

check("Accepted drivers see the customer mobile; pending drivers do not", () => {
  const source = {
    customerName: "Alex Customer",
    customerMobile: "07700900123",
    customerEmail: "alex@example.com",
    amountPaidLabel: "£120.00",
    paymentReference: "SUMUP-SECRET",
    sumupCheckoutId: "chk_123",
    bookingReference: "SUMUP-SECRET",
    refundAmountLabel: "£20.00",
  };
  const extras = {
    customerReference: "MAT-1001",
    driverPayAmount: "£45",
    passengers: 3,
    suitcases: 2,
    bookedVehicle: "Estate",
    notes: "Meet at arrivals",
    paymentMethod: "DEPOSIT_CASH",
    cashBalanceDue: 40,
  };
  const pending = buildSanitizedDriverJobView(
    { ...source, assignmentStatus: "pending" },
    extras,
    { accepted: false },
  );
  assert.equal("customerMobile" in pending, false);
  assert.equal(pending.customerName, "Alex Customer");

  const accepted = buildSanitizedDriverJobView(
    { ...source, assignmentStatus: "accepted" },
    extras,
    { accepted: true },
  );
  assert.equal(accepted.customerMobile, "07700900123");
});

check("Agreed pay, luggage, vehicle, notes and cash survive a fresh driver view", () => {
  const reloaded = buildSanitizedDriverJobView(
    {
      customerName: "Alex Customer",
      customerMobile: "07700900123",
      amountPaidLabel: "£120.00",
      paymentReference: "SUMUP-SECRET",
      sumupCheckoutId: "chk_123",
      quotedPrice: "£120",
      bookingReference: "SUMUP-SECRET",
      profit: "£75",
      ownerMargin: "£75",
    },
    {
      customerReference: "MAT-1001",
      driverPayAmount: "£45",
      passengers: 3,
      suitcases: 2,
      bookedVehicle: "Saloon",
      notes: "Two large cases",
      childSeatNotes: "One booster",
      paymentMethod: "DEPOSIT_CASH",
      cashBalanceDue: 18,
      cashCollected: false,
    },
    { accepted: true },
  );
  assert.equal(reloaded.driverPayAmount, "£45");
  assert.equal(reloaded.passengers, 3);
  assert.equal(reloaded.suitcases, 2);
  assert.equal(reloaded.bookedVehicle, "Saloon");
  assert.equal(reloaded.notes, "Two large cases\nOne booster");
  assert.equal(reloaded.paymentMethod, "DEPOSIT_CASH");
  assert.equal(reloaded.cashBalanceDue, 18);
  assert.equal(reloaded.bookingReference, "MAT-1001");
  assert.equal("amountPaidLabel" in reloaded, false);
  assert.equal("paymentReference" in reloaded, false);
  assert.equal("sumupCheckoutId" in reloaded, false);
  assert.equal("quotedPrice" in reloaded, false);
  assert.equal("profit" in reloaded, false);
  assert.equal("ownerMargin" in reloaded, false);
  assert.equal("customerEmail" in reloaded, false);
  assert.deepEqual(assertNoDriverForbiddenFields(reloaded), []);
  for (const key of FUTURE_DRIVER_PAY_LEDGER_FIELDS) {
    assert.equal(key in reloaded, false);
  }
  for (const key of DRIVER_FORBIDDEN_FINANCIAL_KEYS) {
    assert.equal(key in reloaded, false);
  }
});

check("Reassignment and deassignment remove the previous driver’s access", () => {
  const reassigned = {
    ...jobA,
    assignedDriverProfileKey: "driver-b",
    assignedDriverName: "Driver B",
  };
  assert.equal(authorizeDriverJobAction(driverA, jobA, null, "operate"), null);
  assert.equal(
    authorizeDriverJobAction(driverA, reassigned, { profileKey: "driver-a" }, "operate"),
    "This job is not assigned to you",
  );
  assert.equal(authorizeDriverJobAction(driverB, reassigned, null, "operate"), null);

  const deassigned = {
    assignedDriverName: "Driver A",
    assignmentStatus: "unassigned" as const,
  };
  assert.equal(jobVisibleToPortalDriver(deassigned, driverA), false);
  assert.equal(
    authorizeDriverJobAction(driverA, deassigned, null, "operate"),
    "This job is not assigned to you",
  );
});

check("Owner access still operates every job", () => {
  assert.equal(authorizeDriverJobAction(owner, jobA, tamperedBody, "operate"), null);
  assert.equal(authorizeDriverJobAction(owner, jobB, tamperedBody, "view"), null);
  const visible = filterJobsForSession(
    [jobA, jobB] as unknown as TrackingJobRecord[],
    owner,
  );
  assert.equal(visible.length, 2);
});

check("Legacy configured driver still matches by name when no profile key is stored", () => {
  const legacy = { authorized: true as const, role: "driver" as const, driverName: "Sam" };
  const job = { assignedDriverName: "Sam", assignmentStatus: "accepted" as const };
  assert.equal(authorizeDriverJobAction(legacy, job, { profileKey: "driver-b" }, "operate"), null);
  assert.equal(
    authorizeDriverJobAction(
      driverA,
      { ...job, assignedDriverProfileKey: "driver-b" },
      { driverName: "Sam" },
      "operate",
    ),
    "This job is not assigned to you",
  );
});

check("Driver journey actions stay sequential", () => {
  assert.deepEqual(sequentialDriverJourneyActions("idle"), ["start_tracking", "arrived_pickup"]);
  assert.deepEqual(sequentialDriverJourneyActions("arrived_pickup"), ["start_journey"]);
  assert.deepEqual(sequentialDriverJourneyActions("en_route"), ["arrived_destination"]);
  assert.deepEqual(sequentialDriverJourneyActions("arrived_destination"), ["complete_journey"]);
  assert.deepEqual(sequentialDriverJourneyActions("completed"), []);
  assert.equal(sequentialDriverJourneyActions("idle").includes("complete_journey"), false);
  assert.equal(sequentialDriverJourneyActions("arrived_pickup").includes("stop_tracking"), false);
});

check("Navigate links use the phone maps destination URL", () => {
  const url = googleMapsNavigateUrl("Belfast International Airport");
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(url, /Belfast%20International%20Airport/);
});

check("Assignment email points at My Jobs and does not promise the email is the portal", () => {
  const job: BookingJobRecord = {
    id: "job-1",
    createdAt: new Date().toISOString(),
    status: "paid",
    kind: "booking-request",
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    customerMobile: "07700900123",
    tripLabel: "Airport transfer",
    pickupLabel: "City Hall",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-10-20",
    tripTime: "10:30",
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon",
    isAirportTrip: true,
    driverFirstName: "Ann",
    driverPayAmount: "£45",
  };
  const email = buildDriverAssignmentEmail({
    job,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver-accept/?token=accept-token",
    portalUrl: "https://www.myairporttaxini.co.uk/driver/?access=dpl_example",
  });
  assert.match(email.text, /Your pay for this journey: £45/);
  assert.match(email.text, /Open My Jobs/);
  assert.match(email.text, /driver\/\?access=dpl_example/);
  assert.match(email.html, /Open My Jobs/);
  assert.doesNotMatch(email.text, /everything is in this email/i);
  assert.doesNotMatch(email.text, /do not need a login/i);
  assert.doesNotMatch(email.text, /07700900123/);
  assert.doesNotMatch(email.text, /SUMUP|amount paid|£120/i);
});

check("Portal tokens are unpredictable and prefixed", () => {
  const first = createPortalToken(PORTAL_LINK_PREFIX);
  const second = createPortalToken(PORTAL_LINK_PREFIX);
  assert.notEqual(first, second);
  assert.match(first, /^dpl_[0-9a-f]{48}$/);
  assert.match(createPortalToken("dps_"), /^dps_[0-9a-f]{48}$/);
});

check("Later pay ledger is identified and not wired to SumUp", () => {
  assert.deepEqual(FUTURE_DRIVER_PAY_LEDGER_FIELDS, [
    "driverPayAmountPence",
    "driverPayStatus",
    "driverPayPaidAt",
    "driverPayMethod",
    "driverPayProviderReference",
  ]);
  const access = read("shared/driver-portal-access.ts");
  assert.match(access, /Do not send driver pay through SumUp/);
  const sumup = read("shared/sumup-checkout.ts");
  assert.doesNotMatch(sumup, /driverPayAmountPence|payouts\/|\/transfers/);
  const worker = read("workers/addresses/src/index.ts");
  assert.doesNotMatch(worker, /driver\/pay|driver-payout/);
});

check("Portal session does not fall through to a shared key, and reassignment revokes the accept link", () => {
  const session = read("workers/addresses/src/driver-portal-session.ts");
  assert.match(session, /if \(presented\)/);
  assert.match(session, /X-Driver-Session/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=None/);
  const auth = read("workers/addresses/src/driver-auth.ts");
  assert.match(auth, /X-Driver-Session/);
  const assign = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(assign, /deleteDriverAcceptToken/);
  assert.match(assign, /assignedDriverProfileKey/);
  assert.match(assign, /authorizeDriverJobAction/);
  const jobs = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(jobs, /buildSanitizedDriverJobView/);
  assert.match(jobs, /resolveAuthorizedSession/);
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /authorizeDriverJobAction\(session, record, body, "operate"\)/);
  assert.match(journey, /sequentialDriverJourneyActions/);
  const api = read("src/lib/tracking-api.ts");
  assert.match(api, /X-Driver-Session/);
  assert.match(api, /function driverGetHeaders/);
  const onTheWay = read("shared/company-voice-journey.ts");
  assert.match(onTheWay, /your driver is now on the way to your pickup location/);
});

console.log("\nAll assigned-driver portal access checks passed.");

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
  buildDriverAcceptConfirmResponse,
  buildDriverAcceptLookupResponse,
  completeDriverAcceptConfirmation,
  buildSanitizedDriverJobView,
  createPortalToken,
  FUTURE_DRIVER_PAY_LEDGER_FIELDS,
  googleMapsNavigateUrl,
  jobVisibleToPortalDriver,
  PORTAL_LINK_PREFIX,
  sequentialDriverJourneyActions,
} from "../shared/driver-portal-access";
import {
  assignmentIdentityFromProfile,
  savedProfileAssignmentDecision,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
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

const FORBIDDEN_ACCEPT_KEYS = [
  "customerEmail",
  "quotedPrice",
  "amountPaidLabel",
  "paymentReference",
  "attribution",
  "driverAcceptToken",
  "sumupCheckoutId",
  "job",
];

const poisonedAcceptJob = {
  id: "job-secret",
  customerName: "Alex Customer",
  customerEmail: "alex-secret@example.com",
  customerMobile: "07700900999",
  pickupLabel: "City Hall, Belfast",
  dropoffLabel: "Belfast International Airport",
  tripDate: "2026-10-20",
  tripTime: "10:30",
  driverFirstName: "Ann",
  driverPayAmount: "£45",
  driverAssignmentStatus: "accepted",
  vehicle: "Saloon",
  driverCarMake: "Skoda",
  driverCarModel: "Superb",
  driverReg: "ABC1234",
  quotedPrice: "£240.00",
  amountPaidLabel: "£240.00",
  paymentReference: "SUMUP-SECRET-REF",
  attribution: { gclid: "gclid-secret-value" },
  driverAcceptToken: "accept-token-secret",
  sumupCheckoutId: "chk_secret",
};

check("Driver accept confirmation returns no raw booking or payment fields", () => {
  const confirmed = buildDriverAcceptConfirmResponse({
    assignmentStatus: "accepted",
    portalUrl: "https://www.myairporttaxini.co.uk/driver/?access=dpl_example",
  });
  const already = buildDriverAcceptConfirmResponse({
    assignmentStatus: poisonedAcceptJob.driverAssignmentStatus,
    alreadyAccepted: true,
    portalUrl: "https://www.myairporttaxini.co.uk/driver/?access=dpl_example",
  });
  const declined = buildDriverAcceptConfirmResponse({
    assignmentStatus: "declined",
  });
  for (const body of [confirmed, already, declined]) {
    const encoded = JSON.stringify(body);
    assert.equal(body.ok, true);
    assert.equal("job" in body, false);
    for (const key of FORBIDDEN_ACCEPT_KEYS) {
      assert.equal(key in body, false, key);
    }
    assert.doesNotMatch(encoded, /alex-secret@example.com/);
    assert.doesNotMatch(encoded, /SUMUP-SECRET-REF/);
    assert.doesNotMatch(encoded, /gclid-secret-value/);
    assert.doesNotMatch(encoded, /accept-token-secret/);
    assert.doesNotMatch(encoded, /chk_secret/);
    assert.doesNotMatch(encoded, /£240/);
    assert.doesNotMatch(encoded, /quotedPrice|amountPaidLabel|paymentReference|customerEmail|attribution|driverAcceptToken/);
  }
  assert.equal(confirmed.assignmentStatus, "accepted");
  assert.equal(confirmed.portalUrl?.includes("/driver/?access="), true);
  assert.equal(already.alreadyAccepted, true);
  assert.equal(declined.portalUrl, undefined);

  const lookup = buildDriverAcceptLookupResponse(poisonedAcceptJob);
  const lookupJson = JSON.stringify({ ok: true, job: lookup });
  assert.equal(lookup.customerName, "Alex Customer");
  assert.equal(lookup.driverPayAmount, "£45");
  assert.equal("customerEmail" in lookup, false);
  assert.equal("quotedPrice" in lookup, false);
  assert.equal("amountPaidLabel" in lookup, false);
  assert.equal("paymentReference" in lookup, false);
  assert.equal("attribution" in lookup, false);
  assert.equal("driverAcceptToken" in lookup, false);
  assert.doesNotMatch(lookupJson, /alex-secret@example.com|SUMUP-SECRET-REF|gclid-secret-value|accept-token-secret|chk_secret|£240/);

  const handlers = read("workers/addresses/src/booking-job-handlers.ts");
  const confirmStart = handlers.indexOf("export async function handleDriverAcceptConfirmRequest");
  const confirmEnd = handlers.indexOf("\nexport async function ", confirmStart + 10);
  const confirm = handlers.slice(confirmStart, confirmEnd === -1 ? undefined : confirmEnd);
  assert.match(confirm, /completeDriverAcceptConfirmation/);
  assert.doesNotMatch(confirm, /action \?\? ["']accept["']/);
  assert.doesNotMatch(confirm, /ok:\s*true,\s*job|job:\s*updated|job,\s*alreadyAccepted/);
  const flow = read("shared/driver-portal-access.ts");
  const flowFn = flow.slice(flow.indexOf("export async function completeDriverAcceptConfirmation"));
  const alreadyAcceptedAt = flowFn.indexOf('job.driverAssignmentStatus === "accepted"');
  const issueAt = flowFn.indexOf("await input.issuePortalAccess");
  assert.ok(alreadyAcceptedAt >= 0 && issueAt > alreadyAcceptedAt);
  const lookupStart = handlers.indexOf("export async function handleDriverAcceptLookupRequest");
  const lookupFn = handlers.slice(lookupStart, confirmStart);
  assert.match(lookupFn, /buildDriverAcceptLookupResponse/);
});

check("A profile key and a different email cannot issue a My Jobs link", () => {
  const profileA: DriverVehicleProfile = {
    profileKey: "driver-a",
    displayName: "Ann Driver",
    email: "ann@example.com",
    mobile: "07700900111",
    make: "Skoda",
    model: "Superb",
    colour: "Black",
    registration: "abc 1234",
    updatedAt: "2026-10-06T00:00:00.000Z",
  };
  const mismatch = savedProfileAssignmentDecision({
    requestedProfileKey: "driver-a",
    loadedProfile: profileA,
    suppliedEmail: "bob@example.com",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.match(mismatch.error, /No My Jobs link was created/);
    assert.equal("profile" in mismatch, false);
  }
  const missing = savedProfileAssignmentDecision({
    requestedProfileKey: "driver-a",
    loadedProfile: null,
    suppliedEmail: "ann@example.com",
  });
  assert.equal(missing.ok, false);

  const matched = savedProfileAssignmentDecision({
    requestedProfileKey: "driver-a",
    loadedProfile: profileA,
    suppliedEmail: " Ann@Example.com ",
  });
  assert.equal(matched.ok, true);
  if (matched.ok) {
    const identity = assignmentIdentityFromProfile(matched.profile);
    assert.equal(identity.driverEmail, "ann@example.com");
    assert.equal(identity.driverProfileKey, "driver-a");
    assert.equal(identity.driverMobile, "07700900111");
    assert.equal(identity.driverReg, "ABC 1234");
    assert.notEqual(identity.driverEmail, "bob@example.com");
  }

  const bookingAssign = read("workers/addresses/src/booking-job-handlers.ts");
  const assignStart = bookingAssign.indexOf("export async function handleBookingJobAssignDriverRequest");
  const assignFn = bookingAssign.slice(assignStart, bookingAssign.indexOf("export async function handleDriverAcceptLookupRequest"));
  const decisionAt = assignFn.indexOf("savedProfileAssignmentDecision");
  const linkAt = assignFn.indexOf("createDriverPortalLink");
  assert.ok(decisionAt >= 0 && linkAt > decisionAt);
  assert.match(assignFn, /if \(!decision\.ok\)/);

  const trackingAssign = read("workers/addresses/src/driver-assignment-handlers.ts");
  const trackStart = trackingAssign.indexOf("export async function handleDriverAssignRequest");
  const trackFn = trackingAssign.slice(trackStart);
  const trackDecision = trackFn.indexOf("resolveSavedAssignmentProfile");
  const trackLink = trackFn.indexOf("createDriverPortalLink");
  assert.ok(trackDecision >= 0 && trackLink > trackDecision);
  assert.match(trackFn, /if \(!resolvedProfile\.ok\)/);
  assert.match(trackingAssign, /savedProfileAssignmentDecision/);
});

type StoredAcceptJob = {
  id: string;
  driverAssignmentStatus?: string;
  driverAcceptToken?: string;
  driverAcceptedAt?: string;
  driverDeclinedAt?: string;
};

function acceptTokenStore(initial: StoredAcceptJob) {
  const records = new Map<string, StoredAcceptJob>([[initial.id, { ...initial }]]);
  const tokens = new Map<string, string>();
  if (initial.driverAcceptToken) tokens.set(initial.driverAcceptToken, initial.id);
  let portalMints = 0;
  return {
    get portalMints() {
      return portalMints;
    },
    loadByToken: async (token: string) => {
      const id = tokens.get(token);
      const job = id ? records.get(id) : undefined;
      return job ? { ...job } : null;
    },
    saveJob: async (job: StoredAcceptJob) => {
      records.set(job.id, { ...job });
      if (job.driverAcceptToken?.trim()) {
        tokens.set(job.driverAcceptToken.trim(), job.id);
      }
    },
    deleteAcceptToken: async (token: string) => {
      tokens.delete(token);
    },
    issuePortalAccess: async (job: StoredAcceptJob) => {
      portalMints += 1;
      return { portalUrl: `https://www.myairporttaxini.co.uk/driver/?access=dpl_once_${portalMints}`, job };
    },
    saved(id: string) {
      return records.get(id);
    },
  };
}

void (async () => {
  const label = "Accepting a job returns one portal link and then the accept token is dead";
  try {
    const token = "accept-once";
    const store = acceptTokenStore({
      id: "job-1",
      driverAssignmentStatus: "pending",
      driverAcceptToken: token,
    });
    const first = await completeDriverAcceptConfirmation({
      action: "accept",
      token,
      loadByToken: store.loadByToken,
      saveJob: store.saveJob,
      deleteAcceptToken: store.deleteAcceptToken,
      issuePortalAccess: store.issuePortalAccess,
    });
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.body.assignmentStatus, "accepted");
      assert.equal(first.body.portalUrl, "https://www.myairporttaxini.co.uk/driver/?access=dpl_once_1");
      assert.equal("job" in first.body, false);
    }
    assert.equal(store.portalMints, 1);
    assert.equal(store.saved("job-1")?.driverAcceptToken, undefined);
    assert.equal(store.saved("job-1")?.driverAssignmentStatus, "accepted");
    assert.equal(await store.loadByToken(token), null);

    const second = await completeDriverAcceptConfirmation({
      action: "accept",
      token,
      loadByToken: store.loadByToken,
      saveJob: store.saveJob,
      deleteAcceptToken: store.deleteAcceptToken,
      issuePortalAccess: store.issuePortalAccess,
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.status, 404);
    assert.equal(store.portalMints, 1);

    const legacy = acceptTokenStore({
      id: "job-legacy",
      driverAssignmentStatus: "accepted",
      driverAcceptToken: "still-indexed",
    });
    const reuse = await completeDriverAcceptConfirmation({
      action: "accept",
      token: "still-indexed",
      loadByToken: legacy.loadByToken,
      saveJob: legacy.saveJob,
      deleteAcceptToken: legacy.deleteAcceptToken,
      issuePortalAccess: legacy.issuePortalAccess,
    });
    assert.equal(reuse.ok, false);
    if (!reuse.ok) assert.equal(reuse.status, 409);
    assert.equal(legacy.portalMints, 0);
    assert.equal(await legacy.loadByToken("still-indexed"), null);
    assert.equal(legacy.saved("job-legacy")?.driverAcceptToken, undefined);

    const declined = acceptTokenStore({
      id: "job-no",
      driverAssignmentStatus: "pending",
      driverAcceptToken: "decline-token",
    });
    const decline = await completeDriverAcceptConfirmation({
      action: "decline",
      token: "decline-token",
      loadByToken: declined.loadByToken,
      saveJob: declined.saveJob,
      deleteAcceptToken: declined.deleteAcceptToken,
      issuePortalAccess: declined.issuePortalAccess,
    });
    assert.equal(decline.ok, true);
    if (decline.ok) {
      assert.equal(decline.body.assignmentStatus, "declined");
      assert.equal(decline.body.portalUrl, undefined);
    }
    assert.equal(declined.portalMints, 0);

    const invalid = acceptTokenStore({
      id: "job-bad",
      driverAssignmentStatus: "pending",
      driverAcceptToken: "bad-token",
    });
    for (const action of ["", "approve", "accepted"]) {
      const rejected = await completeDriverAcceptConfirmation({
        action,
        token: "bad-token",
        loadByToken: invalid.loadByToken,
        saveJob: invalid.saveJob,
        deleteAcceptToken: invalid.deleteAcceptToken,
        issuePortalAccess: invalid.issuePortalAccess,
      });
      assert.equal(rejected.ok, false, action);
      if (!rejected.ok) assert.equal(rejected.status, 400);
    }
    assert.equal(invalid.portalMints, 0);
    assert.equal((await invalid.loadByToken("bad-token"))?.driverAssignmentStatus, "pending");
    console.log(`OK  ${label}`);
    console.log("\nAll assigned-driver portal access checks passed.");
  } catch (error) {
    console.error(`FAIL  ${label}`);
    console.error(error);
    process.exit(1);
  }
})();

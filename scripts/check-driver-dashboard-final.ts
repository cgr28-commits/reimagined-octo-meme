/** Regression: final driver dashboard state machine, contact reveal, and owner payout ledger. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrackingJobRecord } from "../shared/tracking";
import {
  buildDriverAssignmentEmail,
  toDriverAssignmentJobSummary,
  type BookingJobRecord,
} from "../shared/booking-job";
import { sanitizeDriverJobForRole } from "../workers/addresses/src/driver-auth";
import { handleJourneyTransitionRequest } from "../workers/addresses/src/journey-handlers";
import { handleDriverPaymentRequest } from "../workers/addresses/src/driver-payment-handlers";
import {
  handleDriverAcceptConfirmRequest,
  handleDriverAcceptLookupRequest,
  syncTrackingAssignmentFromBooking,
} from "../workers/addresses/src/booking-job-handlers";
import { handleDriverUpdateBookingRequest } from "../workers/addresses/src/driver-booking-handlers";
import {
  buildPublicTrackResponse,
  handleDriverJobsRequest,
  handleDriverSharingRequest,
} from "../workers/addresses/src/tracking-handlers";
import { postJourneyAction as postClientJourneyAction } from "../src/lib/tracking-api";
import {
  DEMO_DRIVER_KEY,
  getDemoDriverJobs,
  resetDemoJourneyTransitions,
} from "../src/lib/tracking-demo";

const values = new Map<string, string>();
const store = {
  async get(key: string, type?: string) {
    const value = values.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  },
  async put(key: string, value: string) {
    values.set(key, value);
  },
  async delete(key: string) {
    values.delete(key);
  },
  async list() {
    return { keys: [], list_complete: true, cacheStatus: null };
  },
} as unknown as KVNamespace;

const token = "driver-final-regression";
const job: TrackingJobRecord = {
  token,
  createdAt: "2026-08-24T08:00:00.000Z",
  customerName: "Jamie Private",
  customerEmail: "customer@example.com",
  customerMobile: "07700111222",
  pickupLabel: "10 Donegall Square, Belfast, BT1 5GS",
  dropoffLabel: "Grand Central Hotel, Belfast",
  tripDate: "2026-08-24",
  tripTime: "10:00",
  pickupAt: "2026-08-24T10:00",
  paymentReference: "booking-private",
  isAirportTrip: true,
  airportCode: "BFS",
  flightNumber: "BA1234",
  sharingActive: false,
  assignedDriverName: "Gary",
  assignmentStatus: "pending",
  assignedAt: "2026-08-24T08:05:00.000Z",
  driverPayAmount: "40",
};

values.set(`track:job:${token}`, JSON.stringify(job));
values.set("track:day:2026-08-24", JSON.stringify([token]));
values.set(
  "driver:vehicle:gary",
  JSON.stringify({
    profileKey: "gary",
    displayName: "Gary",
    email: "gary@example.com",
    mobile: "07700900999",
    make: "Skoda",
    model: "Superb",
    colour: "Black",
    registration: "ABC123",
    updatedAt: "2026-08-24T08:00:00.000Z",
  }),
);

const env = {
  TRACKING_STORE: store,
  DRIVER_ACCESS_KEY: "driver-key",
  DRIVER_NAME: "Gary",
  OWNER_ACCESS_KEY: "owner-key",
  RESEND_API_KEY: "",
};

async function postJourney(action: string) {
  const response = await handleJourneyTransitionRequest(
    new Request("https://worker.example/driver/journey?key=driver-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "driver-key" },
      body: JSON.stringify({ token, action }),
    }),
    env,
    "https://example.com",
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function main() {
  console.log("=== Pre-acceptance privacy gate and post-acceptance unlock ===");
  const booking = {
    id: "booking-private",
    createdAt: "2026-08-24T08:00:00.000Z",
    status: "paid",
    kind: "booking-request",
    customerName: "Jamie Private",
    customerEmail: "jamie@example.com",
    customerMobile: "07700111222",
    tripLabel: "Airport transfer",
    pickupLabel: "10 Donegall Square, Belfast, BT1 5GS",
    dropoffLabel: "Grand Central Hotel, Belfast",
    returnJourney: false,
    tripDate: "2026-08-28",
    tripTime: "10:00",
    flightNumber: "BA1234",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate",
    isAirportTrip: true,
    message: "Meet at reception; passenger has a blue suitcase.",
    driverFirstName: "Gary",
    driverEmail: "gary@example.com",
    driverMobile: "07700900999",
    driverPayAmount: "40",
    amountPaidLabel: "£85.00",
    paymentReference: "SUMUP-CUSTOMER-SECRET",
    driverAssignmentStatus: "pending",
    driverAcceptToken: "accept-secret",
    trackingToken: token,
  } as BookingJobRecord;

  const pendingSummary = toDriverAssignmentJobSummary(booking);
  assert.equal(pendingSummary.customerName, undefined);
  assert.equal(pendingSummary.customerMobile, undefined);
  assert.equal(pendingSummary.pickupLabel, "Belfast");
  assert.equal(pendingSummary.dropoffLabel, "Belfast");
  assert.equal(pendingSummary.flightNumber, undefined);
  assert.equal(pendingSummary.journeyNotes, undefined);
  assert.equal(pendingSummary.driverPayAmount, "£40.00");
  assert.equal(
    toDriverAssignmentJobSummary({
      ...booking,
      pickupLabel: "Ballyclare",
      dropoffLabel: "42 Main Street",
    }).pickupLabel,
    "Ballyclare",
  );
  assert.equal(
    toDriverAssignmentJobSummary({
      ...booking,
      pickupLabel: "Ballyclare",
      dropoffLabel: "42 Main Street",
    }).dropoffLabel,
    "Area available after acceptance",
  );
  assert.equal(
    toDriverAssignmentJobSummary({
      ...booking,
      pickupLabel: "Belfast International Airport, Airport Road, BT29 4AB",
    }).pickupLabel,
    "Belfast International Airport",
  );
  const pendingReturn = toDriverAssignmentJobSummary({
    ...booking,
    returnJourney: true,
    returnDate: "2026-08-29",
    returnTime: "15:30",
  });
  assert.equal(pendingReturn.returnJourney, true);
  assert.equal(pendingReturn.returnDate, "2026-08-29");
  assert.equal(pendingReturn.returnTime, "15:30");

  const assignmentEmail = buildDriverAssignmentEmail({
    job: booking,
    acceptUrl: "https://example.com/driver-accept/?token=secret",
  });
  for (const body of [assignmentEmail.text, assignmentEmail.html]) {
    assert.doesNotMatch(body, /Jamie Private|07700111222|10 Donegall Square|Grand Central Hotel|BA1234|blue suitcase/);
    assert.match(body, /Belfast/);
    assert.match(body, /£40\.00/);
  }

  const acceptedSummary = toDriverAssignmentJobSummary({
    ...booking,
    driverAssignmentStatus: "accepted",
  });
  assert.equal(acceptedSummary.customerName, "Jamie Private");
  assert.equal(acceptedSummary.customerMobile, "07700111222");
  assert.equal(acceptedSummary.pickupLabel, booking.pickupLabel);
  assert.equal(acceptedSummary.dropoffLabel, booking.dropoffLabel);
  assert.equal(acceptedSummary.flightNumber, "BA1234");
  assert.equal(acceptedSummary.journeyNotes, booking.message);
  assert.equal(acceptedSummary.driverPayAmount, "£40.00");

  values.set(`booking-job:${booking.id}`, JSON.stringify(booking));
  values.set("driver-accept:accept-secret", booking.id);

  const pendingApiResponse = await handleDriverJobsRequest(
    new Request("https://worker.example/driver/jobs?key=driver-key&date=2026-08-24", {
      headers: { "X-Driver-Key": "driver-key" },
    }),
    env,
    "https://example.com",
  );
  const pendingApiBody = (await pendingApiResponse.json()) as {
    jobs?: Array<Record<string, unknown>>;
  };
  assert.equal(pendingApiResponse.status, 200);
  assert.equal(pendingApiBody.jobs?.length, 1);
  const pendingApiJob = pendingApiBody.jobs?.[0] ?? {};
  assert.equal(pendingApiJob.assignmentStatus, "pending");
  assert.equal(pendingApiJob.customerName, "Customer details available after acceptance");
  assert.equal(pendingApiJob.customerMobile, undefined);
  assert.equal(pendingApiJob.pickupLabel, "Belfast");
  assert.equal(pendingApiJob.dropoffLabel, "Belfast");
  assert.equal(pendingApiJob.flightNumber, undefined);
  assert.equal(pendingApiJob.journeyNotes, undefined);
  assert.equal(pendingApiJob.driverPayAmount, "£40.00");
  assert.equal(pendingApiJob.amountPaidLabel, undefined);

  const lookupResponse = await handleDriverAcceptLookupRequest(
    new Request("https://worker.example/driver-accept?token=accept-secret"),
    env,
    "https://example.com",
  );
  const lookupBody = (await lookupResponse.json()) as { job: Record<string, unknown> };
  assert.equal(lookupBody.job.customerName, undefined);
  assert.equal(lookupBody.job.customerMobile, undefined);
  assert.equal(lookupBody.job.pickupLabel, "Belfast");

  const confirmResponse = await handleDriverAcceptConfirmRequest(
    new Request("https://worker.example/driver-accept/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "accept-secret", action: "accept" }),
    }),
    env,
    "https://example.com",
  );
  const confirmBody = (await confirmResponse.json()) as { job: Record<string, unknown> };
  assert.equal(confirmBody.job.customerName, booking.customerName);
  assert.equal(confirmBody.job.customerMobile, booking.customerMobile);
  assert.equal(confirmBody.job.pickupLabel, booking.pickupLabel);
  assert.equal(confirmBody.job.journeyNotes, booking.message);
  assert.equal(confirmBody.job.customerEmail, undefined);
  assert.equal(confirmBody.job.amountPaidLabel, undefined);
  assert.equal(confirmBody.job.paymentReference, undefined);
  assert.equal(confirmBody.job.trackingToken, undefined);

  const dashboardResponse = await handleDriverJobsRequest(
    new Request("https://worker.example/driver/jobs?key=driver-key&date=2026-08-24", {
      headers: { "X-Driver-Key": "driver-key" },
    }),
    env,
    "https://example.com",
  );
  const dashboardBody = (await dashboardResponse.json()) as {
    role?: string;
    driverName?: string;
    jobs?: Array<Record<string, unknown>>;
  };
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardBody.role, "driver");
  assert.equal(dashboardBody.driverName, "Gary");
  assert.equal(dashboardBody.jobs?.length, 1);
  const acceptedApiJob = dashboardBody.jobs?.[0] ?? {};
  assert.equal(acceptedApiJob.assignmentStatus, "accepted");
  assert.equal(acceptedApiJob.customerName, booking.customerName);
  assert.equal(acceptedApiJob.customerMobile, booking.customerMobile);
  assert.equal(acceptedApiJob.pickupLabel, booking.pickupLabel);
  assert.equal(acceptedApiJob.dropoffLabel, booking.dropoffLabel);
  assert.equal(acceptedApiJob.flightNumber, booking.flightNumber);
  assert.equal(acceptedApiJob.journeyNotes, booking.message);
  assert.equal(acceptedApiJob.driverPayAmount, "£40.00");
  assert.equal(acceptedApiJob.amountPaidLabel, undefined);
  assert.equal(acceptedApiJob.paymentReference, undefined);
  assert.equal(acceptedApiJob.refundAmountLabel, undefined);

  const driverEditResponse = await handleDriverUpdateBookingRequest(
    new Request("https://worker.example/driver/booking?key=driver-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "driver-key" },
      body: JSON.stringify({ token, pickupLabel: "Driver must not change this" }),
    }),
    env,
    "https://example.com",
  );
  assert.equal(driverEditResponse.status, 403);
  const afterBlockedEdit = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.equal(afterBlockedEdit.pickupLabel, booking.pickupLabel);

  await syncTrackingAssignmentFromBooking(store, {
    ...booking,
    driverFirstName: "Colin",
    driverEmail: "colin@example.com",
    driverMobile: "07700900888",
    driverAssignmentStatus: "pending",
    driverAcceptedAt: undefined,
  });
  const afterReassignResponse = await handleDriverJobsRequest(
    new Request("https://worker.example/driver/jobs?key=driver-key&date=2026-08-24", {
      headers: { "X-Driver-Key": "driver-key" },
    }),
    env,
    "https://example.com",
  );
  const afterReassignBody = (await afterReassignResponse.json()) as {
    jobs?: Array<Record<string, unknown>>;
  };
  assert.equal(afterReassignResponse.status, 200);
  assert.equal(afterReassignBody.jobs?.length, 0);
  const reassignedTracking = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.deepEqual(reassignedTracking.assignmentHistory?.at(-1), {
    at: reassignedTracking.assignmentHistory?.at(-1)?.at,
    action: "reassigned",
    fromDriverName: "Gary",
    toDriverName: "Colin",
  });

  await syncTrackingAssignmentFromBooking(store, {
    ...booking,
    driverAssignmentStatus: "accepted",
    driverAcceptedAt: "2026-08-24T08:10:00.000Z",
  });

  const pendingDashboard = sanitizeDriverJobForRole(
    {
      assignmentStatus: "pending",
      customerName: booking.customerName,
      customerMobile: booking.customerMobile,
      pickupLabel: booking.pickupLabel,
      dropoffLabel: booking.dropoffLabel,
      flightNumber: booking.flightNumber,
      journeyNotes: booking.message,
      driverPayAmount: "£40.00",
      trackUrl: "https://example.com/track/private-token",
    },
    "driver",
  );
  assert.equal(pendingDashboard.customerMobile, undefined);
  assert.equal(pendingDashboard.pickupLabel, "Belfast");
  assert.equal(pendingDashboard.dropoffLabel, "Belfast");
  assert.equal(pendingDashboard.flightNumber, undefined);
  assert.equal(pendingDashboard.journeyNotes, undefined);
  assert.equal(pendingDashboard.trackUrl, undefined);
  assert.equal(pendingDashboard.driverPayAmount, "£40.00");

  const acceptedDashboard = sanitizeDriverJobForRole(
    { ...pendingDashboard, ...acceptedSummary, assignmentStatus: "accepted" },
    "driver",
  );
  assert.equal(acceptedDashboard.customerName, "Jamie Private");
  assert.equal(acceptedDashboard.customerMobile, "07700111222");
  assert.equal(acceptedDashboard.pickupLabel, booking.pickupLabel);
  assert.equal(acceptedDashboard.dropoffLabel, booking.dropoffLabel);
  assert.equal(acceptedDashboard.journeyNotes, booking.message);

  console.log("=== Driver actions are ordered, email/status-only, and never start GPS ===");
  const beforeOnWay = await buildPublicTrackResponse(job, env, "https://example.com");
  assert.equal(beforeOnWay.vehicle, undefined);

  const originalFetch = globalThis.fetch;
  let journeyEmailCount = 0;
  const journeyEmailBodies: string[] = [];
  env.RESEND_API_KEY = "test-resend-key";
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === "https://api.resend.com/emails") {
      journeyEmailCount += 1;
      journeyEmailBodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ id: `email-${journeyEmailCount}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  const onWay = await postJourney("start_tracking");
  assert.equal(onWay.journeyStatus, "tracking");
  assert.equal(onWay.sharingActive, false);
  assert.equal(onWay.trackingSession, undefined);
  assert.deepEqual(onWay.allowedActions, ["arrived_pickup"]);
  assert.equal(journeyEmailCount, 1);
  assert.match(journeyEmailBodies[0] ?? "", /07700900999/);
  assert.doesNotMatch(journeyEmailBodies[0] ?? "", /live location|whatsapp/i);
  const onWayRetry = await postJourney("start_tracking");
  assert.equal(onWayRetry.idempotent, true);
  assert.equal(onWayRetry.sharingActive, false);
  assert.equal(onWayRetry.trackingSession, undefined);
  assert.equal(journeyEmailCount, 1, "duplicate on-way action must not resend email");

  const directSharing = await handleDriverSharingRequest(
    new Request("https://worker.example/driver/sharing?key=driver-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "driver-key" },
      body: JSON.stringify({ token, active: true }),
    }),
    env,
    "https://example.com",
  );
  assert.equal(directSharing.status, 403);

  const afterOnWay = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.ok(afterOnWay.driverContactRevealedAt);
  assert.equal(afterOnWay.driverLat, undefined);
  assert.equal(afterOnWay.driverLng, undefined);

  const customer = await buildPublicTrackResponse(afterOnWay, env, "https://example.com");
  assert.equal(customer.vehicle?.driverName, "Gary");
  assert.equal(customer.vehicle?.mobile, "07700900999");

  const arrived = await postJourney("arrived_pickup");
  assert.equal(arrived.sharingActive, false);
  assert.deepEqual(arrived.allowedActions, ["complete_journey"]);
  assert.equal(journeyEmailCount, 2);
  const arrivedRetry = await postJourney("arrived_pickup");
  assert.equal(arrivedRetry.idempotent, true);
  assert.equal(journeyEmailCount, 2, "duplicate arrived action must not resend email");

  globalThis.fetch = originalFetch;
  env.RESEND_API_KEY = "";

  const completed = await postJourney("complete_journey");
  assert.equal(completed.journeyStatus, "completed");
  assert.equal(completed.sharingActive, false);
  assert.deepEqual(completed.allowedActions, []);

  const completedJob = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.equal(completedJob.driverPaymentStatus, "due");
  assert.equal(completedJob.driverPaymentAmount, "£40.00");
  assert.equal(completedJob.driverPaymentHistory?.[0]?.status, "due");

  console.log("=== Preview demo follows the real Driver journey state machine ===");
  const demoOnWay = await postClientJourneyAction(
    DEMO_DRIVER_KEY,
    "demo-live",
    "start_tracking",
  );
  assert.equal(demoOnWay.journeyStatus, "tracking");
  assert.deepEqual(demoOnWay.allowedActions, ["arrived_pickup"]);
  assert.equal(demoOnWay.sharingActive, false);
  assert.equal(demoOnWay.trackingSession, undefined);
  const demoArrived = await postClientJourneyAction(
    DEMO_DRIVER_KEY,
    "demo-live",
    "arrived_pickup",
  );
  assert.equal(demoArrived.journeyStatus, "arrived_pickup");
  assert.equal(demoArrived.journeyStatusLabel, "Driver has arrived");
  assert.deepEqual(demoArrived.allowedActions, ["complete_journey"]);
  assert.equal(demoArrived.sharingActive, false);
  const demoCompleted = await postClientJourneyAction(
    DEMO_DRIVER_KEY,
    "demo-live",
    "complete_journey",
  );
  assert.equal(demoCompleted.journeyStatus, "completed");
  assert.equal(demoCompleted.journeyStatusLabel, "Journey completed");
  assert.deepEqual(demoCompleted.allowedActions, []);
  const refreshedDemo = getDemoDriverJobs().jobs.find((entry) => entry.token === "demo-live");
  assert.equal(refreshedDemo?.journeyStatus, "completed");
  assert.deepEqual(refreshedDemo?.allowedJourneyActions, []);
  assert.equal(refreshedDemo?.sharingActive, false);
  resetDemoJourneyTransitions();

  console.log("=== Payment is owner-only and keeps amount/status/history ===");
  const driverAttempt = await handleDriverPaymentRequest(
    new Request("https://worker.example/driver/payment?key=driver-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "driver-key" },
      body: JSON.stringify({ token, amount: "40" }),
    }),
    env,
    "https://example.com",
  );
  assert.equal(driverAttempt.status, 401);

  const ownerPayment = await handleDriverPaymentRequest(
    new Request("https://worker.example/driver/payment?key=owner-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "owner-key" },
      body: JSON.stringify({ token, amount: "40" }),
    }),
    env,
    "https://example.com",
  );
  assert.equal(ownerPayment.status, 200);
  const paid = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.equal(paid.driverPaymentStatus, "paid");
  assert.equal(paid.driverPaymentAmount, "£40.00");
  assert.deepEqual(paid.driverPaymentHistory?.map((entry) => entry.status), ["due", "paid"]);

  const repeatedOwnerPayment = await handleDriverPaymentRequest(
    new Request("https://worker.example/driver/payment?key=owner-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Driver-Key": "owner-key" },
      body: JSON.stringify({ token, amount: "40" }),
    }),
    env,
    "https://example.com",
  );
  const repeatedPaymentBody = (await repeatedOwnerPayment.json()) as { idempotent?: boolean };
  assert.equal(repeatedOwnerPayment.status, 200);
  assert.equal(repeatedPaymentBody.idempotent, true);
  const repeatedlyPaid = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.deepEqual(repeatedlyPaid.driverPaymentHistory?.map((entry) => entry.status), ["due", "paid"]);

  console.log("=== Driver response keeps pay and strips owner/customer financial metadata ===");
  const driverResponse = sanitizeDriverJobForRole(
    {
      assignmentStatus: "accepted",
      customerMobile: "07700900111",
      driverPayAmount: "£40.00",
      driverPaymentStatus: "paid",
      driverPaymentAmount: "£40.00",
      driverPaymentHistory: paid.driverPaymentHistory,
      amountPaidLabel: "£85.00",
      paymentReference: "sumup-ref",
      bookingReference: "MAT-1234",
      refundAmountLabel: "£10.00",
    },
    "driver",
  );
  assert.equal(driverResponse.driverPayAmount, "£40.00");
  assert.equal(driverResponse.customerMobile, "07700900111");
  assert.equal(driverResponse.driverPaymentStatus, "paid");
  assert.equal(driverResponse.driverPaymentAmount, undefined);
  assert.equal(driverResponse.driverPaymentHistory, undefined);
  assert.equal(driverResponse.amountPaidLabel, undefined);
  assert.equal(driverResponse.paymentReference, undefined);
  assert.equal(driverResponse.bookingReference, undefined);
  assert.equal(driverResponse.refundAmountLabel, undefined);

  const paidDashboardResponse = await handleDriverJobsRequest(
    new Request("https://worker.example/driver/jobs?key=driver-key&date=2026-08-24", {
      headers: { "X-Driver-Key": "driver-key" },
    }),
    env,
    "https://example.com",
  );
  const paidDashboardBody = (await paidDashboardResponse.json()) as {
    jobs?: Array<Record<string, unknown>>;
  };
  const paidApiJob = paidDashboardBody.jobs?.[0] ?? {};
  assert.equal(paidDashboardResponse.status, 200);
  assert.equal(paidApiJob.driverPaymentStatus, "paid");
  assert.equal(paidApiJob.driverPaymentAmount, undefined);
  assert.equal(paidApiJob.driverPaymentHistory, undefined);
  assert.equal(paidApiJob.driverPayAmount, "£40.00");
  assert.equal(paidApiJob.amountPaidLabel, undefined);
  assert.equal(paidApiJob.paymentReference, undefined);

  console.log("=== UI contracts: no driver editing/WhatsApp, persistent steps, completed split ===");
  const page = readFileSync(join(process.cwd(), "src/app/driver/DriverPageClient.tsx"), "utf8");
  assert.match(page, /const canEdit = !isRefunded && isOwner/);
  assert.match(page, /isOwner && action === "arrived_pickup"/);
  assert.match(page, /isOwner && action === "start_tracking"/);
  assert.match(page, /action: "start_tracking",[\s\S]*?label: "Driver on way"/);
  assert.match(page, /action: "arrived_pickup",[\s\S]*?label: "Driver arrived"/);
  assert.match(page, /action: "complete_journey",[\s\S]*?label: "Complete journey"/);
  assert.match(page, /completedLabel: "On the way ✓"/);
  assert.match(page, /completedLabel: "Arrived ✓"/);
  assert.match(page, /completedLabel: "Completed ✓"/);
  assert.match(page, /data-driver-primary-journey-controls/);
  assert.match(page, /data-driver-journey-confirm=/);
  assert.match(page, /data-driver-journey-confirm-yes=/);
  assert.match(page, /data-driver-journey-confirm-cancel=/);
  assert.match(page, /ownerPrimaryJourneyConfirmCopy/);
  assert.match(page, /gap-3\.5/);
  assert.match(page, /min-h-14/);
  assert.match(page, /bg-sky-400/);
  assert.match(page, /bg-amber-300/);
  assert.match(page, /bg-emerald/);
  assert.match(page, /canOperateJourney && current && allowedActions\.includes\(item\.action\)/);
  assert.match(page, /journeyActionInFlightRef\.current/);
  const actionButton = page.match(
    /data-driver-journey-action=\{item\.action\}[\s\S]{0,500}?onClick=\{\(\) => \{([\s\S]{0,500}?)\}\}/,
  );
  assert.ok(actionButton, "driver primary action button onClick present");
  assert.match(actionButton![1]!, /setJourneyConfirmAction/);
  assert.doesNotMatch(actionButton![1]!, /runJourneyAction/);
  assert.match(
    page,
    /data-driver-journey-confirm-yes=\{item\.action\}[\s\S]{0,350}?runJourneyAction\(item\.action\)/,
  );
  assert.doesNotMatch(page, /today&apos;s jobs and live tracking/);
  assert.doesNotMatch(page, /live tracking opens on the day of travel/);
  assert.doesNotMatch(page, /live tracking starts on the day of travel/);
  assert.match(page, /const showMap =[\s\S]*?isOwner &&/);
  assert.match(page, /isOwner && job\.customerSharingActive/);
  assert.match(page, /isOwner && job\.customer && trackingAvailable/);
  assert.match(page, /isOwner && job\.sharingActive && job\.activeDriverName/);
  assert.match(page, /return visibleJobs\.filter\(\(job\) => !isOwnerCompletedDriverJob\(job\)\)/);
  assert.match(
    page,
    /updatedJob\.assignmentStatus === "accepted"[\s\S]*?setView\(updatedJob\.tripDate === today \? "today" : "upcoming"\)/,
  );
  assert.match(page, /Completed — Payment Due/);
  assert.match(page, /Confirm payment paid/);
  assert.match(page, /data-driver-payment-status/);
  assert.match(page, /Payment status: \{driverPaymentPaid \? "Paid" : "Payment pending"\}/);
  const driverNotesIndex = page.indexOf("!isOwner && isAcceptedAssignment && job.journeyNotes");
  const ownerPaymentIndex = page.indexOf(
    '{isOwner && journeyStatus === "completed" && driverPaymentStatus ? (',
  );
  assert.ok(driverNotesIndex >= 0 && driverNotesIndex < ownerPaymentIndex);

  console.log("\nFinal driver dashboard regression checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

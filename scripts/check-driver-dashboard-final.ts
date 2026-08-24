/** Regression: final driver dashboard state machine, contact reveal, and owner payout ledger. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrackingJobRecord } from "../shared/tracking";
import { sanitizeDriverJobForRole } from "../workers/addresses/src/driver-auth";
import { handleJourneyTransitionRequest } from "../workers/addresses/src/journey-handlers";
import { handleDriverPaymentRequest } from "../workers/addresses/src/driver-payment-handlers";
import {
  buildPublicTrackResponse,
  handleDriverSharingRequest,
} from "../workers/addresses/src/tracking-handlers";

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
  customerName: "Customer",
  customerEmail: "customer@example.com",
  customerMobile: "07700900111",
  pickupLabel: "Belfast",
  dropoffLabel: "Belfast International Airport",
  tripDate: "2026-08-24",
  tripTime: "10:00",
  pickupAt: "2026-08-24T10:00",
  sharingActive: false,
  assignedDriverName: "Gary",
  assignmentStatus: "accepted",
  acceptedAt: "2026-08-24T08:10:00.000Z",
  driverPayAmount: "40",
};

values.set(`track:job:${token}`, JSON.stringify(job));
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
  console.log("=== Driver actions are ordered, email/status-only, and never start GPS ===");
  const beforeOnWay = await buildPublicTrackResponse(job, env, "https://example.com");
  assert.equal(beforeOnWay.vehicle, undefined);

  const onWay = await postJourney("start_tracking");
  assert.equal(onWay.journeyStatus, "tracking");
  assert.equal(onWay.sharingActive, false);
  assert.equal(onWay.trackingSession, undefined);
  assert.deepEqual(onWay.allowedActions, ["arrived_pickup"]);
  const onWayRetry = await postJourney("start_tracking");
  assert.equal(onWayRetry.sharingActive, false);
  assert.equal(onWayRetry.trackingSession, undefined);

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

  const completed = await postJourney("complete_journey");
  assert.equal(completed.journeyStatus, "completed");
  assert.equal(completed.sharingActive, false);
  assert.deepEqual(completed.allowedActions, []);

  const completedJob = JSON.parse(values.get(`track:job:${token}`) ?? "null") as TrackingJobRecord;
  assert.equal(completedJob.driverPaymentStatus, "due");
  assert.equal(completedJob.driverPaymentAmount, "£40.00");
  assert.equal(completedJob.driverPaymentHistory?.[0]?.status, "due");

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
  assert.equal(paid.driverPaymentStatus, "sent");
  assert.equal(paid.driverPaymentAmount, "£40.00");
  assert.deepEqual(paid.driverPaymentHistory?.map((entry) => entry.status), ["due", "sent"]);

  console.log("=== Driver response keeps pay and strips owner/customer financial metadata ===");
  const driverResponse = sanitizeDriverJobForRole(
    {
      driverPayAmount: "£40.00",
      driverPaymentStatus: "sent",
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
  assert.equal(driverResponse.driverPaymentStatus, undefined);
  assert.equal(driverResponse.driverPaymentHistory, undefined);
  assert.equal(driverResponse.amountPaidLabel, undefined);
  assert.equal(driverResponse.paymentReference, undefined);
  assert.equal(driverResponse.bookingReference, undefined);
  assert.equal(driverResponse.refundAmountLabel, undefined);

  console.log("=== UI contracts: no driver editing/WhatsApp, persistent steps, completed split ===");
  const page = readFileSync(join(process.cwd(), "src/app/driver/DriverPageClient.tsx"), "utf8");
  assert.match(page, /const canEdit = !isRefunded && isOwner/);
  assert.match(page, /isOwner && action === "arrived_pickup"/);
  assert.match(page, /isOwner && action === "start_tracking"/);
  assert.match(page, /\["start_tracking", "Driver on way"\]/);
  assert.match(page, /\["arrived_pickup", "Driver arrived"\]/);
  assert.match(page, /\["complete_journey", "Complete journey"\]/);
  assert.match(page, /return visibleJobs\.filter\(\(job\) => !isOwnerCompletedDriverJob\(job\)\)/);
  assert.match(page, /Completed — Payment Due/);
  assert.match(page, /Confirm payment sent/);

  console.log("\nFinal driver dashboard regression checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

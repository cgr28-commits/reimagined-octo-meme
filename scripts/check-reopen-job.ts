/**
 * Owner-only Reopen job: restore the last real journey stage, keep payment,
 * cancel an unsent review email, and stay idempotent.
 * Offline only. Run: npx tsx scripts/check-reopen-job.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { paidBookingRefKey } from "../shared/paid-booking-record";
import {
  completionTimestampsMatch,
  ownerReopenStatusLabel,
  proposedStatusBeforeCompletion,
  reopenCompletedJourney,
  type TrackingJobRecord,
} from "../shared/tracking";
import { handleReopenJobRequest } from "../workers/addresses/src/reopen-job-handlers";
import { savePaidBookingRecord, getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { getTrackingJob, saveTrackingJob } from "../workers/addresses/src/tracking-store";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const OWNER = "owner-test-key";
const DRIVER = "driver-test-key";
const COMPLETED_AT = "2026-10-05T03:51:00.000Z";

function memoryKv() {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw) as unknown;
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return { data, store: store as unknown as KVNamespace };
}

function job(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return {
    token: "job-token",
    createdAt: "2026-10-02T13:53:00.000Z",
    customerName: "Example Customer",
    customerEmail: "customer@example.com",
    customerMobile: "+447000000000",
    pickupLabel: "Pickup",
    dropoffLabel: "Drop-off",
    tripDate: "2026-10-05",
    tripTime: "15:40",
    pickupAt: "2026-10-05T15:40",
    paymentReference: "PAYREF",
    sharingActive: false,
    journeyStatus: "completed",
    journeyCompletedAt: COMPLETED_AT,
    trackingStoppedAt: COMPLETED_AT,
    driverLocationPointCount: 0,
    ...overrides,
  };
}

function paid(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "PAYREF",
    checkoutId: "checkout-1",
    transactionId: "txn-1",
    amount: 67,
    currency: "GBP",
    amountPaidLabel: "£67.00",
    originalAmount: 67,
    amountRefunded: 0,
    customerName: "Example Customer",
    customerEmail: "customer@example.com",
    mobileNumber: "+447000000000",
    tripLabel: "Pickup to drop-off",
    pickupLabel: "Pickup",
    dropoffLabel: "Drop-off",
    returnJourney: false,
    tripDate: "2026-10-05",
    tripTime: "15:40",
    passengers: 2,
    suitcases: 0,
    vehicle: "Saloon",
    expressDropOffSelected: false,
    airportAccessOption: "free",
    termsAcceptedAt: "2026-10-02T13:53:00.000Z",
    termsVersion: "September 2026 v2",
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    refundHistory: [],
    editHistory: [
      {
        changedAt: "2026-10-02T14:00:00.000Z",
        field: "notes",
        previousValue: "",
        newValue: "Gate note",
        changedBy: "Owner",
      },
    ],
    outboundCompletedAt: COMPLETED_AT,
    ...overrides,
  };
}

function envFor(store: KVNamespace) {
  return {
    TRACKING_STORE: store,
    OWNER_ACCESS_KEY: OWNER,
    DRIVER_ACCESS_KEY: DRIVER,
  };
}

async function call(
  store: KVNamespace,
  options: {
    key?: string | null;
    header?: string;
    body?: unknown;
    method?: string;
  } = {},
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.key) headers.set(options.header || "X-Owner-Key", options.key);
  const method = options.method || "POST";
  const response = await handleReopenJobRequest(
    new Request("https://worker.test/paid-bookings/reopen-job", {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    }),
    envFor(store),
    "https://www.myairporttaxini.co.uk",
  );
  const payload = (await response.json()) as Record<string, unknown>;
  return { status: response.status, payload };
}

function snapshot(data: Map<string, string>): string {
  return JSON.stringify([...data.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function seed(primary: TrackingJobRecord, primaryPaid: PaidBookingRecord, extra?: {
  job: TrackingJobRecord;
  paid: PaidBookingRecord;
}) {
  const memory = memoryKv();
  await saveTrackingJob(memory.store, primary);
  await savePaidBookingRecord(memory.store, primaryPaid);
  memory.data.set(`track:driver-history:${primary.token}`, JSON.stringify([{ lat: 54.6, lng: -5.9 }]));
  if (extra) {
    await saveTrackingJob(memory.store, extra.job);
    await savePaidBookingRecord(memory.store, extra.paid);
  }
  return memory;
}

function assertMoneyUnchanged(before: PaidBookingRecord, after: PaidBookingRecord) {
  assert.equal(after.amount, before.amount);
  assert.equal(after.amountPaidLabel, before.amountPaidLabel);
  assert.equal(after.originalAmount, before.originalAmount);
  assert.equal(after.amountRefunded, before.amountRefunded);
  assert.equal(after.status, before.status);
  assert.equal(after.operationalStatus, before.operationalStatus);
  assert.equal(after.paymentStatus, before.paymentStatus);
  assert.equal(after.transactionId, before.transactionId);
  assert.deepEqual(after.refundHistory, before.refundHistory);
}

function assertBookingUnchanged(before: PaidBookingRecord, after: PaidBookingRecord) {
  assert.equal(after.customerName, before.customerName);
  assert.equal(after.customerEmail, before.customerEmail);
  assert.equal(after.mobileNumber, before.mobileNumber);
  assert.equal(after.paymentReference, before.paymentReference);
  assert.equal(after.pickupLabel, before.pickupLabel);
  assert.equal(after.dropoffLabel, before.dropoffLabel);
  assert.equal(after.vehicle, before.vehicle);
  assert.equal(after.passengers, before.passengers);
  assert.equal(after.suitcases, before.suitcases);
  assert.equal(after.expressDropOffSelected, before.expressDropOffSelected);
  assert.equal(after.airportAccessOption, before.airportAccessOption);
  assert.equal(after.termsAcceptedAt, before.termsAcceptedAt);
  assert.equal(after.termsVersion, before.termsVersion);
  assert.equal(after.tripDate, before.tripDate);
  assert.equal(after.tripTime, before.tripTime);
  assert.deepEqual(after.editHistory, before.editHistory);
}

async function main() {
  console.log("=== 1. Restore the last recorded stage ===");
  {
    const idle = job();
    assert.equal(proposedStatusBeforeCompletion(idle), "idle");
    assert.equal(ownerReopenStatusLabel("idle"), "Booked / Not started");
    const reopened = reopenCompletedJourney(idle, { nowIso: "2026-10-05T08:00:00.000Z" });
    assert.equal(reopened.restoredStatus, "idle");
    assert.equal(reopened.job.journeyStatus, "idle");
    assert.equal(reopened.job.journeyCompletedAt, undefined);
    assert.equal(reopened.job.trackingStoppedAt, undefined);
    assert.equal(reopened.job.sharingActive, false);
    assert.equal(reopened.audit?.summary, "Job reopened by owner");
    assert.equal(reopened.audit?.previousStatus, "completed");
    assert.equal(reopened.audit?.originalCompletionTimestamp, COMPLETED_AT);

    const onWay = job({
      token: "on-way",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
    });
    assert.equal(proposedStatusBeforeCompletion(onWay), "tracking");
    assert.equal(reopenCompletedJourney(onWay).restoredStatus, "tracking");
    assert.equal(reopenCompletedJourney(onWay).job.sharingActive, true);
    assert.equal(reopenCompletedJourney(onWay).job.trackingStartedAt, onWay.trackingStartedAt);
    assert.equal(reopenCompletedJourney(onWay).job.trackingStoppedAt, undefined);

    const arrived = job({
      token: "arrived",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      arrivedPickupAt: "2026-10-05T02:20:00.000Z",
    });
    assert.equal(reopenCompletedJourney(arrived).restoredStatus, "arrived_pickup");
    assert.equal(reopenCompletedJourney(arrived).job.arrivedPickupAt, arrived.arrivedPickupAt);

    const started = job({
      token: "started",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      arrivedPickupAt: "2026-10-05T02:20:00.000Z",
      journeyStartedAt: "2026-10-05T02:30:00.000Z",
    });
    assert.equal(reopenCompletedJourney(started).restoredStatus, "en_route");
    assert.equal(ownerReopenStatusLabel("en_route"), "Journey started");

    const destination = job({
      token: "destination",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      arrivedPickupAt: "2026-10-05T02:20:00.000Z",
      journeyStartedAt: "2026-10-05T02:30:00.000Z",
      arrivedDestinationAt: "2026-10-05T03:00:00.000Z",
    });
    const restoredDestination = reopenCompletedJourney(destination);
    assert.equal(restoredDestination.restoredStatus, "arrived_destination");
    assert.equal(restoredDestination.job.arrivedDestinationAt, destination.arrivedDestinationAt);
    assert.equal(restoredDestination.job.journeyStartedAt, destination.journeyStartedAt);

    const earlierStop = job({
      token: "stopped-earlier",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      trackingStoppedAt: "2026-10-05T02:10:00.000Z",
    });
    const keptStop = reopenCompletedJourney(earlierStop);
    assert.equal(keptStop.restoredStatus, "tracking");
    assert.equal(keptStop.job.trackingStoppedAt, "2026-10-05T02:10:00.000Z");
    assert.equal(keptStop.job.sharingActive, false);
    assert.equal(completionTimestampsMatch("2026-10-05T03:51:01.000Z", COMPLETED_AT), true);
    console.log("OK  booked, on the way, arrived, started, destination");
  }

  console.log("\n=== 2. Review email, tip, and idempotency ===");
  {
    const pending = job({
      reviewRequestScheduledAt: COMPLETED_AT,
      reviewRequestDueAt: "2026-10-05T05:51:00.000Z",
      reviewRequestFailedAt: "2026-10-05T05:52:00.000Z",
      reviewRequestLastError: "temporary",
      tipDecision: "no",
      tipToken: "a".repeat(32),
      tipWhatsappPreparedAt: COMPLETED_AT,
    });
    const cancelled = reopenCompletedJourney(pending);
    assert.equal(cancelled.reviewOutcome, "cancelled");
    assert.equal(cancelled.reviewMessage, "Pending review request cancelled");
    assert.equal(cancelled.job.reviewRequestScheduledAt, undefined);
    assert.equal(cancelled.job.reviewRequestDueAt, undefined);
    assert.equal(cancelled.job.reviewRequestFailedAt, undefined);
    assert.equal(cancelled.job.tipDecision, undefined);
    assert.equal(cancelled.job.tipToken, undefined);
    assert.equal(cancelled.unpaidTipTokenToDelete, "a".repeat(32));

    const sent = job({
      reviewRequestScheduledAt: COMPLETED_AT,
      reviewRequestDueAt: "2026-10-05T05:51:00.000Z",
      reviewRequestSentAt: "2026-10-05T06:30:00.000Z",
    });
    const kept = reopenCompletedJourney(sent);
    assert.equal(kept.reviewOutcome, "already_sent");
    assert.equal(kept.reviewMessage, "Review request had already been sent");
    assert.equal(kept.job.reviewRequestSentAt, sent.reviewRequestSentAt);
    assert.equal(kept.job.reviewRequestScheduledAt, sent.reviewRequestScheduledAt);

    const paidTip = reopenCompletedJourney(
      job({ tipDecision: "no", tipToken: "b".repeat(32), tipWhatsappPreparedAt: COMPLETED_AT }),
      { preservePaidTip: true },
    );
    assert.equal(paidTip.job.tipDecision, "no");
    assert.equal(paidTip.job.tipToken, "b".repeat(32));
    assert.equal(paidTip.unpaidTipTokenToDelete, null);

    const again = reopenCompletedJourney(cancelled.job);
    assert.equal(again.changed, false);
    assert.equal(again.audit, null);
    assert.equal(again.job.reopenHistory?.length, 1);
    console.log("OK  pending review cancelled, sent review kept, second call is a no-op");
  }

  console.log("\n=== 3. Handler: no journey activity restores Booked ===");
  {
    const primary = job({
      token: "idle-token",
      paymentReference: "IDLE1",
      customerName: "Idle Customer",
    });
    const primaryPaid = paid({
      paymentReference: "IDLE1",
      customerName: "Idle Customer",
      checkoutId: "checkout-idle",
    });
    const otherJob = job({
      token: "other-token",
      paymentReference: "OTHER1",
      customerName: "Other Customer",
      trackingStartedAt: "2026-10-05T01:00:00.000Z",
    });
    const otherPaid = paid({
      paymentReference: "OTHER1",
      customerName: "Other Customer",
      checkoutId: "checkout-other",
      amount: 29,
      amountPaidLabel: "£29.00",
    });
    const memory = await seed(primary, primaryPaid, { job: otherJob, paid: otherPaid });
    const otherBefore = memory.data.get(paidBookingRefKey("OTHER1"));
    const otherJobBefore = memory.data.get("track:job:other-token");
    const gpsBefore = memory.data.get("track:driver-history:idle-token");

    const result = await call(memory.store, {
      key: OWNER,
      body: { paymentReference: "IDLE1", trackingToken: "idle-token" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.idempotent, false);
    assert.equal(result.payload.restoredStatus, "idle");
    assert.equal(result.payload.restoredStatusLabel, "Booked / Not started");
    assert.equal(result.payload.reviewMessage, null);

    const stored = await getTrackingJob(memory.store, "idle-token");
    assert.ok(stored);
    assert.equal(stored!.journeyStatus, "idle");
    assert.equal(stored!.journeyCompletedAt, undefined);
    assert.equal(stored!.trackingStartedAt, undefined);
    assert.equal(stored!.reopenHistory?.length, 1);
    assert.equal(stored!.reopenHistory?.[0]?.summary, "Job reopened by owner");
    assert.equal(stored!.driverLocationPointCount, 0);
    assert.equal(memory.data.get("track:driver-history:idle-token"), gpsBefore);

    const paidAfter = await getPaidBookingRecord(memory.store, "IDLE1");
    assert.ok(paidAfter);
    assertMoneyUnchanged(primaryPaid, paidAfter!);
    assertBookingUnchanged(primaryPaid, paidAfter!);
    assert.equal(paidAfter!.outboundCompletedAt, undefined);
    assert.equal(memory.data.get(paidBookingRefKey("OTHER1")), otherBefore);
    assert.equal(memory.data.get("track:job:other-token"), otherJobBefore);

    const repeat = await call(memory.store, {
      key: OWNER,
      body: { paymentReference: "IDLE1", trackingToken: "idle-token" },
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.payload.idempotent, true);
    const afterRepeat = await getTrackingJob(memory.store, "idle-token");
    assert.equal(afterRepeat?.reopenHistory?.length, 1);
    assert.equal(afterRepeat?.journeyStatus, "idle");
    console.log("OK  idle restore, payment unchanged, other booking untouched, repeat safe");
  }

  console.log("\n=== 4. Handler: stage restore, review email, paid tip ===");
  {
    const onWay = job({
      token: "way-token",
      paymentReference: "WAY1",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      reviewRequestScheduledAt: COMPLETED_AT,
      reviewRequestDueAt: "2026-10-05T05:51:00.000Z",
      tipDecision: "no",
      tipToken: "c".repeat(32),
      tipWhatsappPreparedAt: COMPLETED_AT,
    });
    const onWayPaid = paid({
      paymentReference: "WAY1",
      checkoutId: "checkout-way",
      outboundCompletedAt: "2026-10-04T09:00:00.000Z",
    });
    const memory = await seed(onWay, onWayPaid);
    memory.data.set(
      `tip:${"c".repeat(32)}`,
      JSON.stringify({
        tipToken: "c".repeat(32),
        trackingJobToken: "way-token",
        paymentReference: "WAY1",
        requestedAt: COMPLETED_AT,
        status: "requested",
      }),
    );
    const result = await call(memory.store, {
      key: OWNER,
      body: { paymentReference: "WAY1", trackingToken: "way-token" },
    });
    assert.equal(result.payload.restoredStatus, "tracking");
    assert.equal(result.payload.reviewMessage, "Pending review request cancelled");
    const stored = await getTrackingJob(memory.store, "way-token");
    assert.equal(stored?.journeyStatus, "tracking");
    assert.equal(stored?.trackingStartedAt, onWay.trackingStartedAt);
    assert.equal(stored?.reviewRequestScheduledAt, undefined);
    assert.equal(stored?.reviewRequestSentAt, undefined);
    assert.equal(stored?.tipToken, undefined);
    assert.equal(memory.data.has(`tip:${"c".repeat(32)}`), false);
    const paidAfter = await getPaidBookingRecord(memory.store, "WAY1");
    assert.equal(paidAfter?.outboundCompletedAt, "2026-10-04T09:00:00.000Z");
    assertMoneyUnchanged(onWayPaid, paidAfter!);

    const arrived = job({
      token: "arrived-token",
      paymentReference: "ARR1",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      arrivedPickupAt: "2026-10-05T02:20:00.000Z",
    });
    const arrivedMemory = await seed(
      arrived,
      paid({ paymentReference: "ARR1", checkoutId: "checkout-arr" }),
    );
    const arrivedResult = await call(arrivedMemory.store, {
      key: OWNER,
      body: { paymentReference: "ARR1" },
    });
    assert.equal(arrivedResult.payload.restoredStatus, "arrived_pickup");

    const started = job({
      token: "started-token",
      paymentReference: "START1",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      arrivedPickupAt: "2026-10-05T02:20:00.000Z",
      journeyStartedAt: "2026-10-05T02:40:00.000Z",
      reviewRequestSentAt: "2026-10-05T06:30:00.000Z",
      reviewRequestScheduledAt: COMPLETED_AT,
      journeyLeg: "return",
    });
    const startedPaid = paid({
      paymentReference: "START1",
      checkoutId: "checkout-start",
      returnJourney: true,
      returnDate: "2026-10-06",
      returnTime: "09:00",
      outboundCompletedAt: "2026-10-04T09:00:00.000Z",
      returnCompletedAt: COMPLETED_AT,
    });
    const startedMemory = await seed(started, startedPaid);
    const startedResult = await call(startedMemory.store, {
      key: OWNER,
      body: { paymentReference: "START1", trackingToken: "started-token" },
    });
    assert.equal(startedResult.payload.restoredStatus, "en_route");
    assert.equal(startedResult.payload.reviewMessage, "Review request had already been sent");
    const startedJob = await getTrackingJob(startedMemory.store, "started-token");
    assert.equal(startedJob?.reviewRequestSentAt, started.reviewRequestSentAt);
    assert.equal(startedJob?.journeyStartedAt, started.journeyStartedAt);
    const startedPaidAfter = await getPaidBookingRecord(startedMemory.store, "START1");
    assert.equal(startedPaidAfter?.outboundCompletedAt, "2026-10-04T09:00:00.000Z");
    assert.equal(startedPaidAfter?.returnCompletedAt, undefined);
    assertBookingUnchanged(startedPaid, startedPaidAfter!);

    const tipped = job({
      token: "paid-tip-token",
      paymentReference: "TIP1",
      trackingStartedAt: "2026-10-05T02:00:00.000Z",
      tipDecision: "no",
      tipToken: "d".repeat(32),
      tipWhatsappPreparedAt: COMPLETED_AT,
    });
    const tipMemory = await seed(
      tipped,
      paid({ paymentReference: "TIP1", checkoutId: "checkout-tip" }),
    );
    tipMemory.data.set(
      `tip:${"d".repeat(32)}`,
      JSON.stringify({
        tipToken: "d".repeat(32),
        trackingJobToken: "paid-tip-token",
        paymentReference: "TIP1",
        requestedAt: COMPLETED_AT,
        status: "paid",
        amountGbp: 5,
      }),
    );
    await call(tipMemory.store, {
      key: OWNER,
      body: { paymentReference: "TIP1", trackingToken: "paid-tip-token" },
    });
    const tippedJob = await getTrackingJob(tipMemory.store, "paid-tip-token");
    assert.equal(tippedJob?.tipToken, "d".repeat(32));
    assert.equal(tippedJob?.journeyStatus, "tracking");
    const tipRaw = tipMemory.data.get(`tip:${"d".repeat(32)}`);
    assert.match(tipRaw || "", /"status":"paid"/);
    console.log("OK  stages, review outcomes, unpaid tip removed, paid tip kept");
  }

  console.log("\n=== 5. Auth, wrong booking, and repeated safety ===");
  {
    const primary = job({ token: "auth-token", paymentReference: "AUTH1" });
    const primaryPaid = paid({ paymentReference: "AUTH1", checkoutId: "checkout-auth" });
    const memory = await seed(primary, primaryPaid);
    const before = snapshot(memory.data);

    const anon = await call(memory.store, { body: { paymentReference: "AUTH1" } });
    assert.equal(anon.status, 401);
    const driver = await call(memory.store, {
      key: DRIVER,
      header: "X-Owner-Key",
      body: { paymentReference: "AUTH1", trackingToken: "auth-token" },
    });
    assert.equal(driver.status, 401);
    const get = await call(memory.store, { key: OWNER, method: "GET" });
    assert.equal(get.status, 405);
    assert.equal(snapshot(memory.data), before);

    const wrong = await call(memory.store, {
      key: OWNER,
      body: { paymentReference: "SOMEONE-ELSE", trackingToken: "auth-token" },
    });
    assert.equal(wrong.status, 409);
    const still = await getTrackingJob(memory.store, "auth-token");
    assert.equal(still?.journeyStatus, "completed");
    assert.equal(still?.reopenHistory, undefined);

    const bothA = job({ token: "leg-a", paymentReference: "LEGS", journeyLeg: "outbound" });
    const bothB = job({ token: "leg-b", paymentReference: "LEGS", journeyLeg: "return" });
    const legs = memoryKv();
    await saveTrackingJob(legs.store, bothA);
    await saveTrackingJob(legs.store, bothB);
    await savePaidBookingRecord(
      legs.store,
      paid({ paymentReference: "LEGS", checkoutId: "checkout-legs", returnJourney: true }),
    );
    const ambiguous = await call(legs.store, { key: OWNER, body: { paymentReference: "LEGS" } });
    assert.equal(ambiguous.status, 409);
    assert.equal((await getTrackingJob(legs.store, "leg-a"))?.journeyStatus, "completed");
    assert.equal((await getTrackingJob(legs.store, "leg-b"))?.journeyStatus, "completed");
    console.log("OK  anonymous and driver rejected, other booking and ambiguous legs refused");
  }

  console.log("\n=== 6. Charlotte Baker replica — in memory only ===");
  {
    const charlotte = job({
      token: "charlotte-token",
      paymentReference: "TAAA6PZMBA7",
      customerName: "Charlotte Baker",
      customerEmail: "customer@example.com",
      customerMobile: "+447000000000",
      pickupLabel: "Mediq, Unit 3, Curran Business Park, Portland Rd, Larne BT40 1DH, UK",
      dropoffLabel: "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK",
      tripDate: "2026-10-05",
      tripTime: "15:40",
      pickupAt: "2026-10-05T15:40",
      journeyStatus: "completed",
      journeyCompletedAt: COMPLETED_AT,
      trackingStoppedAt: COMPLETED_AT,
      driverLocationPointCount: 0,
      reviewRequestScheduledAt: COMPLETED_AT,
      reviewRequestDueAt: "2026-10-05T05:51:00.000Z",
    });
    assert.equal(charlotte.trackingStartedAt, undefined);
    assert.equal(charlotte.arrivedPickupAt, undefined);
    assert.equal(charlotte.journeyStartedAt, undefined);
    assert.equal(charlotte.arrivedDestinationAt, undefined);
    const charlottePaid = paid({
      paymentReference: "TAAA6PZMBA7",
      checkoutId: "bcfce629-c690-4dd3-b435-37c675a0c731",
      transactionId: "dec6374f-134e-46b5-b89e-8f9082648ef2",
      customerName: "Charlotte Baker",
      amount: 67,
      amountPaidLabel: "£67.00",
      pickupLabel: charlotte.pickupLabel,
      dropoffLabel: charlotte.dropoffLabel,
      tripLabel: `${charlotte.pickupLabel} to ${charlotte.dropoffLabel}`,
    });
    const memory = await seed(charlotte, charlottePaid);
    const result = await call(memory.store, {
      key: OWNER,
      body: { paymentReference: "TAAA6PZMBA7", trackingToken: "charlotte-token" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.restoredStatus, "idle");
    assert.equal(result.payload.restoredStatusLabel, "Booked / Not started");
    assert.equal(result.payload.reviewMessage, "Pending review request cancelled");
    const stored = await getTrackingJob(memory.store, "charlotte-token");
    assert.equal(stored?.journeyStatus, "idle");
    assert.equal(stored?.journeyCompletedAt, undefined);
    assert.equal(stored?.customerName, "Charlotte Baker");
    const paidAfter = await getPaidBookingRecord(memory.store, "TAAA6PZMBA7");
    assert.equal(paidAfter?.amount, 67);
    assert.equal(paidAfter?.amountPaidLabel, "£67.00");
    assert.equal(paidAfter?.status, "confirmed");
    assert.equal(paidAfter?.paymentStatus, "paid");
    assert.equal(paidAfter?.outboundCompletedAt, undefined);
    assert.deepEqual(paidAfter?.editHistory, charlottePaid.editHistory);
    console.log("OK  Charlotte replica returns to Booked / Not started without a payment change");
  }

  console.log("\n=== 7. Owner dashboard wiring ===");
  {
    const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
    const controlsStart = panel.indexOf("function renderJourneyControls");
    const controlsEnd = panel.indexOf("function renderBookingCard");
    const controls = panel.slice(controlsStart, controlsEnd);
    assert.equal(controls.includes("Reopen job"), false);
    assert.match(panel, /data-owner-reopen-job/);
    assert.match(panel, /↩ Reopen job/);
    assert.match(panel, /data-owner-reopen-modal/);
    assert.match(panel, /Reopen this job\?/);
    assert.match(panel, /Payment and booking details will not be changed/);
    assert.match(panel, /data-owner-reopen-confirm/);
    assert.match(panel, /Reopen Job/);
    assert.match(panel, /Pending review request cancelled|reviewMessage/);
    const handler = read("workers/addresses/src/reopen-job-handlers.ts");
    assert.match(handler, /ownerAuthorized/);
    assert.doesNotMatch(handler, /driverAuthorized/);
    assert.match(read("workers/addresses/src/index.ts"), /paid-bookings-reopen-job/);
    assert.doesNotMatch(read("workers/addresses/src/journey-handlers.ts"), /reopenCompletedJourney/);
    assert.equal(
      read("shared/tracking.ts"),
      read("workers/addresses/shared/tracking.ts"),
    );
    console.log("OK  reopen stays under More options and the route is owner-only");
  }

  console.log("\nReopen job checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

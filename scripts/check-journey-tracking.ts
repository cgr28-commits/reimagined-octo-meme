/**
 * Offline checks for journey lifecycle + GPS throttle helpers.
 * Does not call SumUp, Resend, or Google Calendar.
 */
import assert from "node:assert/strict";
import {
  applyJourneyAction,
  allowedJourneyActions,
  customerJourneyLabel,
  generateTrackingSessionToken,
  generateTrackingToken,
  shouldStoreGpsPoint,
  type TrackingJobRecord,
} from "../shared/tracking";

function baseJob(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return {
    token: generateTrackingToken(),
    createdAt: new Date().toISOString(),
    customerName: "Test Customer",
    customerMobile: "07700900000",
    pickupLabel: "1 Test Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-08-17",
    tripTime: "14:00",
    pickupAt: "2026-08-17T14:00",
    sharingActive: false,
    paymentReference: "TEST-PAY-REF-001",
    ...overrides,
  };
}

function mustApply(job: TrackingJobRecord, action: Parameters<typeof applyJourneyAction>[1]) {
  const result = applyJourneyAction(job, action);
  assert.ok(result.ok, result.ok ? undefined : result.error);
  return result.ok ? result.job : job;
}

function run() {
  const token = generateTrackingToken();
  assert.equal(token.length, 32);
  assert.match(token, /^[0-9a-f]+$/);

  const session = generateTrackingSessionToken();
  assert.equal(session.length, 48);
  assert.notEqual(token, session);

  let job = baseJob();
  assert.deepEqual(allowedJourneyActions("idle"), ["start_tracking"]);

  job = mustApply(job, "start_tracking");
  assert.equal(job.journeyStatus, "tracking");
  assert.equal(job.sharingActive, true);
  assert.equal(customerJourneyLabel(job), "Driver on the way");

  job = mustApply(job, "arrived_pickup");
  assert.equal(job.journeyStatus, "arrived_pickup");

  job = mustApply(job, "start_journey");
  assert.equal(job.journeyStatus, "en_route");
  assert.equal(customerJourneyLabel(job), "Journey underway");

  job = mustApply(job, "arrived_destination");
  job = mustApply(job, "complete_journey");
  assert.equal(job.journeyStatus, "completed");
  assert.equal(job.sharingActive, false);
  assert.equal(allowedJourneyActions("completed").length, 0);

  const blocked = applyJourneyAction(job, "start_tracking");
  assert.equal(blocked.ok, false);

  const t0 = "2026-08-17T12:00:00.000Z";
  const t1 = "2026-08-17T12:00:05.000Z";
  const t2 = "2026-08-17T12:00:25.000Z";
  assert.equal(
    shouldStoreGpsPoint(undefined, { lat: 54.6, lng: -5.9, recordedAt: t0 }),
    true,
  );
  assert.equal(
    shouldStoreGpsPoint(
      { lat: 54.6, lng: -5.9, recordedAt: t0 },
      { lat: 54.60001, lng: -5.9, recordedAt: t1 },
    ),
    false,
  );
  assert.equal(
    shouldStoreGpsPoint(
      { lat: 54.6, lng: -5.9, recordedAt: t0 },
      { lat: 54.6, lng: -5.9, recordedAt: t2 },
    ),
    true,
  );
  assert.equal(
    shouldStoreGpsPoint(
      { lat: 54.6, lng: -5.9, recordedAt: t0 },
      { lat: 54.601, lng: -5.9, recordedAt: t1 },
    ),
    true,
  );

  console.log("check-journey-tracking: ok");
}

run();

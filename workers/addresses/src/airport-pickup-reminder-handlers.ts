/**
 * Hourly 2-hour journey reminder for every confirmed leg.
 * Resend email only. WhatsApp and phone links are for the customer to open.
 */

import { beginJourneyReminderClaim, evaluateJourneyReminder, type JourneyReminderInput } from "../shared/journey-reminder";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import type { TrackingJobRecord } from "../shared/tracking";
import { getJourneyReminderAirportCopy } from "./journey-reminder-store";
import { getPaidBookingRecord } from "./paid-booking-store";
import {
  findTrackingJobsByPaymentReference,
  getTrackingJob,
  listUpcomingTrackingJobs,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
};

export type AirportPickupReminderRunResult = {
  scanned: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: number;
};

export function airportPickupReminderInput(
  job: TrackingJobRecord,
  paid: PaidBookingRecord | null,
): JourneyReminderInput {
  const leg = job.journeyLeg === "return" ? "return" : "outbound";
  const schedule =
    leg === "return"
      ? {
          tripDate: paid?.returnDate?.trim() || job.tripDate,
          tripTime: paid?.returnTime?.trim() || job.tripTime,
          pickupLabel: paid?.dropoffLabel?.trim() || job.pickupLabel,
          dropoffLabel: paid?.pickupLabel?.trim() || job.dropoffLabel,
          flightNumber: paid?.returnFlightNumber?.trim() || job.flightNumber,
        }
      : {
          tripDate: paid?.tripDate?.trim() || job.tripDate,
          tripTime: paid?.tripTime?.trim() || job.tripTime,
          pickupLabel: paid?.pickupLabel?.trim() || job.pickupLabel,
          dropoffLabel: paid?.dropoffLabel?.trim() || job.dropoffLabel,
          flightNumber: paid?.flightNumber?.trim() || job.flightNumber,
        };
  const isFromAirport =
    typeof paid?.isFromAirport === "boolean"
      ? leg === "return"
        ? !paid.isFromAirport
        : paid.isFromAirport
      : job.isFromAirport;
  return {
    customerName: paid?.customerName || job.customerName,
    customerEmail: paid?.customerEmail || job.customerEmail,
    pickupLabel: schedule.pickupLabel,
    dropoffLabel: schedule.dropoffLabel,
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    journeyLeg: leg,
    isFromAirport,
    airportCode: job.airportCode || paid?.airportCode,
    flightNumber: schedule.flightNumber,
    vehicle: paid?.vehicle || undefined,
    airportAccessOption: paid?.airportAccessOption,
    outboundAirportAccessOption: paid?.outboundAirportAccessOption,
    returnAirportAccessOption: paid?.returnAirportAccessOption,
    expressDropOffSelected: paid?.expressDropOffSelected,
    outboundExpressDropOffSelected: paid?.outboundExpressDropOffSelected,
    returnExpressDropOffSelected: paid?.returnExpressDropOffSelected,
    expressDropOffFee:
      leg === "return"
        ? paid?.returnAirportAccessChargeGbp
        : (paid?.outboundAirportAccessChargeGbp ?? paid?.expressDropOffFee),
    expressDropOffAirport: paid?.expressDropOffAirport,
    dublinArrivalTerminal: paid?.dublinArrivalTerminal,
    returnDublinArrivalTerminal: paid?.returnDublinArrivalTerminal,
    reminderSentAt: job.airportCollectionInfoSentAt || job.airportPickupReminderSentAt,
    reminderSentForPickupAt: job.journeyReminderSentForPickupAt,
    reminderDriverKey: job.journeyReminderDriverKey,
    driverUpdateSentForKey: job.journeyDriverUpdateSentForKey,
    assignmentStatus: job.assignmentStatus,
    assignedDriverName: job.assignedDriverName,
    assignedDriverMobile: job.assignedDriverMobile,
    refundedAt: job.refundedAt,
    operationalStatus: paid?.operationalStatus,
    bookingStatus: paid?.status,
    cancelledLegs: paid?.cancelledLegs,
    outboundCancelledAt: paid?.outboundCancelledAt,
    returnCancelledAt: paid?.returnCancelledAt,
    journeyStatus: job.journeyStatus,
    isRefundTest: paid?.isRefundTest,
  };
}

export async function processDueAirportPickupReminders(
  env: Env,
  now: Date = new Date(),
): Promise<AirportPickupReminderRunResult> {
  const result: AirportPickupReminderRunResult = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
  };
  if (!trackingStoreConfigured(env.TRACKING_STORE)) return result;
  const jobs = await listUpcomingTrackingJobs(env.TRACKING_STORE, 1);
  result.scanned = jobs.length;
  for (const job of jobs) {
    const outcome = await maybeSendAirportPickupReminder(env, job, now);
    if (outcome === "sent") {
      result.sent += 1;
      result.eligible += 1;
    } else if (outcome === "eligible_error") {
      result.eligible += 1;
      result.errors += 1;
    } else if (outcome === "eligible_skipped") {
      result.eligible += 1;
      result.skipped += 1;
    }
  }
  return result;
}

/** Send immediately when a new booking is already inside the two-hour window. */
export async function processJourneyRemindersForPayment(
  env: Env,
  paymentReference: string,
  now: Date = new Date(),
): Promise<void> {
  if (!trackingStoreConfigured(env.TRACKING_STORE) || !paymentReference.trim()) return;
  const jobs = await findTrackingJobsByPaymentReference(env.TRACKING_STORE, paymentReference);
  for (const job of jobs) {
    await maybeSendAirportPickupReminder(env, job, now);
  }
}

export async function notifyJourneyDriverUpdateIfNeeded(
  env: Env,
  job: TrackingJobRecord,
  now: Date = new Date(),
): Promise<void> {
  await maybeSendAirportPickupReminder(env, job, now);
}

async function maybeSendAirportPickupReminder(
  env: Env,
  job: TrackingJobRecord,
  now: Date,
): Promise<"not_eligible" | "eligible_skipped" | "sent" | "eligible_error"> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) return "not_eligible";
  const store = env.TRACKING_STORE;
  const paymentReference = job.paymentReference?.trim() ?? "";
  const paid = paymentReference ? await getPaidBookingRecord(store, paymentReference) : null;
  const airportCopy = await getJourneyReminderAirportCopy(store).catch(() => undefined);
  const first = evaluateJourneyReminder(
    { ...airportPickupReminderInput(job, paid), airportCopy },
    now,
  );
  if (!first.eligible) return "not_eligible";

  const updateAlreadySent =
    first.kind === "driver_update" && job.journeyDriverUpdateSentForKey === first.driverKey;
  const reminderAlreadySent =
    first.kind === "reminder" &&
    Boolean(job.airportCollectionInfoSentAt || job.airportPickupReminderSentAt) &&
    job.journeyReminderSentForPickupAt === first.pickupKey;
  const claim = beginJourneyReminderClaim(
    {
      sentAt: updateAlreadySent
        ? job.journeyDriverUpdateSentAt
        : reminderAlreadySent
          ? job.airportCollectionInfoSentAt || job.airportPickupReminderSentAt
          : "",
      claimId: first.kind === "driver_update" ? job.journeyDriverUpdateClaimId : job.journeyReminderClaimId,
      claimedAt:
        first.kind === "driver_update" ? job.journeyDriverUpdateClaimedAt : job.journeyReminderClaimedAt,
    },
    now,
  );
  if (!claim.ok) return "eligible_skipped";

  const claimedAt = now.toISOString();
  if (first.kind === "driver_update") {
    job.journeyDriverUpdateClaimId = claim.claimId;
    job.journeyDriverUpdateClaimedAt = claimedAt;
  } else {
    job.journeyReminderClaimId = claim.claimId;
    job.journeyReminderClaimedAt = claimedAt;
  }
  await saveTrackingJob(store, job);

  const fresh = await getTrackingJob(store, job.token);
  const owns =
    fresh &&
    (first.kind === "driver_update"
      ? fresh.journeyDriverUpdateClaimId === claim.claimId
      : fresh.journeyReminderClaimId === claim.claimId);
  if (!fresh || !owns) return "eligible_skipped";

  const freshPaid = paymentReference ? await getPaidBookingRecord(store, paymentReference) : paid;
  const decision = evaluateJourneyReminder(
    { ...airportPickupReminderInput(fresh, freshPaid), airportCopy },
    now,
  );
  if (!decision.eligible || decision.kind !== first.kind || decision.pickupKey !== first.pickupKey) {
    clearClaim(fresh, first.kind, claim.claimId);
    await saveTrackingJob(store, fresh);
    return "eligible_skipped";
  }

  const email = (fresh.customerEmail || freshPaid?.customerEmail || "").trim();
  const name = (fresh.customerName || freshPaid?.customerName || email).trim();
  const sendResult = await trySendResendOnlyCustomerEmail(env, {
    to: email,
    toName: name,
    subject: decision.subject,
    body: decision.text,
    htmlBody: decision.html,
  });

  if (!sendResult.sent || sendResult.provider !== "resend") {
    clearClaim(fresh, decision.kind, claim.claimId);
    fresh.airportPickupReminderFailedAt = new Date().toISOString();
    fresh.airportPickupReminderLastError = sendResult.error || "Journey reminder email failed";
    await saveTrackingJob(store, fresh);
    console.error("Journey reminder email failed", fresh.airportPickupReminderLastError, fresh.token);
    return "eligible_error";
  }

  const sentAt = new Date().toISOString();
  if (decision.kind === "driver_update") {
    fresh.journeyDriverUpdateSentForKey = decision.driverKey;
    fresh.journeyDriverUpdateSentAt = sentAt;
    fresh.journeyReminderDriverKey = decision.driverKey;
    delete fresh.journeyDriverUpdateClaimId;
    delete fresh.journeyDriverUpdateClaimedAt;
  } else {
    fresh.airportCollectionInfoSentAt = sentAt;
    fresh.airportPickupReminderSentAt = sentAt;
    fresh.journeyReminderSentForPickupAt = decision.pickupKey;
    fresh.journeyReminderDriverKey = decision.driverKey;
    delete fresh.journeyReminderClaimId;
    delete fresh.journeyReminderClaimedAt;
  }
  delete fresh.airportPickupReminderFailedAt;
  delete fresh.airportPickupReminderLastError;
  await saveTrackingJob(store, fresh);
  return "sent";
}

function clearClaim(job: TrackingJobRecord, kind: "reminder" | "driver_update", claimId: string): void {
  if (kind === "driver_update") {
    if (job.journeyDriverUpdateClaimId === claimId) {
      delete job.journeyDriverUpdateClaimId;
      delete job.journeyDriverUpdateClaimedAt;
    }
    return;
  }
  if (job.journeyReminderClaimId === claimId) {
    delete job.journeyReminderClaimId;
    delete job.journeyReminderClaimedAt;
  }
}

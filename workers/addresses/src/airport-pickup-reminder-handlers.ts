/**
 * Hourly 2-hour journey reminder for every confirmed leg.
 * Resend email only. WhatsApp and phone links are for the customer to open.
 */

import {
  buildDriverJourneyNoticeEmail,
  customerDriverStillCurrent,
  driverDispatchDecision,
  driverJourneyNoticeRecipient,
  noteDriverNotification,
} from "../shared/driver-notification-safety";
import {
  beginJourneyReminderClaim,
  evaluateJourneyReminder,
  journeyReminderFirstName,
  type JourneyReminderInput,
} from "../shared/journey-reminder";
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
import { trySendEmail, trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

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
  if (!first.eligible) {
    if (first.reason === "already_sent") {
      await maybeSendAcceptedDriverNotice(env, job, now).catch((error) => {
        console.error("Accepted driver journey notice failed", error);
      });
    }
    return "not_eligible";
  }

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
    noteDriverNotification(fresh, {
      at: now.toISOString(),
      kind: first.kind === "driver_update" ? "customer_driver_update" : "customer_journey_reminder",
      outcome: "suppressed",
      reason: "assignment_changed_before_dispatch",
    });
    await saveTrackingJob(store, fresh);
    return "eligible_skipped";
  }

  const latest = await getTrackingJob(store, fresh.token);
  const latestPaid = paymentReference ? await getPaidBookingRecord(store, paymentReference) : freshPaid;
  const latestInput = { ...airportPickupReminderInput(latest ?? fresh, latestPaid), airportCopy };
  const latestDecision = evaluateJourneyReminder(latestInput, now);
  if (
    !latest ||
    !latestDecision.eligible ||
    latestDecision.kind !== decision.kind ||
    latestDecision.pickupKey !== decision.pickupKey ||
    !customerDriverStillCurrent(latestDecision.driverKey, latestInput)
  ) {
    clearClaim(latest ?? fresh, first.kind, claim.claimId);
    noteDriverNotification(latest ?? fresh, {
      at: now.toISOString(),
      kind: first.kind === "driver_update" ? "customer_driver_update" : "customer_journey_reminder",
      outcome: "suppressed",
      reason: "stale_assignment",
    });
    await saveTrackingJob(store, latest ?? fresh);
    return "eligible_skipped";
  }

  const email = (latest.customerEmail || latestPaid?.customerEmail || "").trim();
  const name = (latest.customerName || latestPaid?.customerName || email).trim();
  const sendResult = await trySendResendOnlyCustomerEmail(env, {
    to: email,
    toName: name,
    subject: latestDecision.subject,
    body: latestDecision.text,
    htmlBody: latestDecision.html,
  });

  if (!sendResult.sent || sendResult.provider !== "resend") {
    clearClaim(latest, latestDecision.kind, claim.claimId);
    latest.airportPickupReminderFailedAt = new Date().toISOString();
    latest.airportPickupReminderLastError = sendResult.error || "Journey reminder email failed";
    await saveTrackingJob(store, latest);
    console.error("Journey reminder email failed", latest.airportPickupReminderLastError, latest.token);
    return "eligible_error";
  }

  const sentAt = new Date().toISOString();
  if (latestDecision.kind === "driver_update") {
    latest.journeyDriverUpdateSentForKey = latestDecision.driverKey;
    latest.journeyDriverUpdateSentAt = sentAt;
    latest.journeyReminderDriverKey = latestDecision.driverKey;
    delete latest.journeyDriverUpdateClaimId;
    delete latest.journeyDriverUpdateClaimedAt;
  } else {
    latest.airportCollectionInfoSentAt = sentAt;
    latest.airportPickupReminderSentAt = sentAt;
    latest.journeyReminderSentForPickupAt = latestDecision.pickupKey;
    latest.journeyReminderDriverKey = latestDecision.driverKey;
    delete latest.journeyReminderClaimId;
    delete latest.journeyReminderClaimedAt;
  }
  delete latest.airportPickupReminderFailedAt;
  delete latest.airportPickupReminderLastError;
  noteDriverNotification(latest, {
    at: sentAt,
    kind: latestDecision.kind === "driver_update" ? "customer_driver_update" : "customer_journey_reminder",
    outcome: "sent",
    driverName: latestDecision.contact.kind === "driver" ? latestDecision.contact.firstName : undefined,
  });
  await saveTrackingJob(store, latest);
  await maybeSendAcceptedDriverNotice(env, latest, now).catch((error) => {
    console.error("Accepted driver journey notice failed", error);
  });
  return "sent";
}

async function maybeSendAcceptedDriverNotice(env: Env, job: TrackingJobRecord, now: Date): Promise<void> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) return;
  const store = env.TRACKING_STORE;
  const recipient = driverJourneyNoticeRecipient(job);
  if (!recipient.allow) return;

  const claim = beginJourneyReminderClaim(
    { claimId: job.journeyDriverNoticeClaimId, claimedAt: job.journeyDriverNoticeClaimedAt },
    now,
  );
  if (!claim.ok) return;
  job.journeyDriverNoticeClaimId = claim.claimId;
  job.journeyDriverNoticeClaimedAt = now.toISOString();
  await saveTrackingJob(store, job);

  const fresh = await getTrackingJob(store, job.token);
  if (!fresh || fresh.journeyDriverNoticeClaimId !== claim.claimId) return;
  const again = driverJourneyNoticeRecipient(fresh);
  const gate = driverDispatchDecision(fresh, {
    kind: "journey_reminder",
    assignmentVersion: recipient.assignmentVersion,
    driverEmail: recipient.email,
  });
  if (!again.allow || !gate.allow || again.email !== recipient.email) {
    delete fresh.journeyDriverNoticeClaimId;
    delete fresh.journeyDriverNoticeClaimedAt;
    noteDriverNotification(fresh, {
      at: now.toISOString(),
      kind: "driver_journey_reminder",
      outcome: "suppressed",
      reason: gate.allow ? "stale_assignment" : gate.reason,
      driverEmail: recipient.email,
      driverName: recipient.name,
    });
    await saveTrackingJob(store, fresh);
    return;
  }

  const paymentReference = fresh.paymentReference?.trim() ?? "";
  const paid = paymentReference ? await getPaidBookingRecord(store, paymentReference) : null;
  const input = airportPickupReminderInput(fresh, paid);
  const notice = buildDriverJourneyNoticeEmail({
    driverName: again.name,
    pickupLabel: String(input.pickupLabel ?? ""),
    dropoffLabel: String(input.dropoffLabel ?? ""),
    tripDate: String(input.tripDate ?? ""),
    tripTime: String(input.tripTime ?? ""),
    flightNumber: input.flightNumber,
    customerFirstName: journeyReminderFirstName(input.customerName),
  });
  const sendResult = await trySendEmail(env, {
    to: again.email,
    toName: again.name,
    subject: notice.subject,
    body: notice.text,
    htmlBody: notice.html,
    requireHtml: true,
  });
  delete fresh.journeyDriverNoticeClaimId;
  delete fresh.journeyDriverNoticeClaimedAt;
  if (!sendResult.sent) {
    noteDriverNotification(fresh, {
      at: now.toISOString(),
      kind: "driver_journey_reminder",
      outcome: "suppressed",
      reason: sendResult.error || "send_failed",
      driverEmail: again.email,
      driverName: again.name,
    });
    await saveTrackingJob(store, fresh);
    return;
  }
  fresh.journeyDriverNoticeSentFor = again.sentKey;
  noteDriverNotification(fresh, {
    at: now.toISOString(),
    kind: "driver_journey_reminder",
    outcome: "sent",
    driverEmail: again.email,
    driverName: again.name,
  });
  await saveTrackingJob(store, fresh);
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

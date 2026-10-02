/**
 * Hourly journey-day email for customers collected from an airport.
 * Uses Resend, the same customer-email path as other scheduled reminders.
 * Does not open WhatsApp or SMS, and does not call a paid SMS provider.
 */

import {
  evaluateAirportPickupReminder,
  type AirportPickupReminderInput,
} from "../shared/airport-pickup-reminder";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import type { TrackingJobRecord } from "../shared/tracking";
import { getPaidBookingRecord } from "./paid-booking-store";
import { listTrackingJobsForDate, saveTrackingJob, trackingStoreConfigured } from "./tracking-store";
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

function londonToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function airportPickupReminderInput(
  job: TrackingJobRecord,
  paid: PaidBookingRecord | null,
): AirportPickupReminderInput {
  const leg = job.journeyLeg === "return" ? "return" : "outbound";
  return {
    customerName: job.customerName || paid?.customerName,
    customerEmail: job.customerEmail || paid?.customerEmail,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    journeyLeg: leg,
    isFromAirport:
      typeof job.isFromAirport === "boolean"
        ? job.isFromAirport
        : leg === "return"
          ? typeof paid?.isFromAirport === "boolean"
            ? !paid.isFromAirport
            : undefined
          : paid?.isFromAirport,
    airportCode: job.airportCode || paid?.airportCode,
    flightNumber: job.flightNumber,
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
    reminderSentAt: job.airportPickupReminderSentAt,
    refundedAt: job.refundedAt,
    operationalStatus: paid?.operationalStatus,
    bookingStatus: paid?.status,
    cancelledLegs: paid?.cancelledLegs,
    outboundCancelledAt: paid?.outboundCancelledAt,
    returnCancelledAt: paid?.returnCancelledAt,
    journeyStatus: job.journeyStatus,
    isRefundTest: paid?.isRefundTest,
    assignedDriverMobile: job.assignedDriverMobile,
    customerReference: paid?.customerReference,
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

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return result;
  }

  const jobs = await listTrackingJobsForDate(env.TRACKING_STORE, londonToday(now));
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

async function maybeSendAirportPickupReminder(
  env: Env,
  job: TrackingJobRecord,
  now: Date,
): Promise<"not_eligible" | "eligible_skipped" | "sent" | "eligible_error"> {
  if (job.airportPickupReminderSentAt?.trim()) {
    return "not_eligible";
  }

  const paymentReference = job.paymentReference?.trim() ?? "";
  const paid = paymentReference
    ? await getPaidBookingRecord(env.TRACKING_STORE!, paymentReference)
    : null;
  const decision = evaluateAirportPickupReminder(airportPickupReminderInput(job, paid), now);
  if (!decision.eligible) {
    return "not_eligible";
  }

  const email = (job.customerEmail || paid?.customerEmail || "").trim();
  const name = (job.customerName || paid?.customerName || email).trim();
  const sendResult = await trySendResendOnlyCustomerEmail(env, {
    to: email,
    toName: name,
    subject: decision.subject,
    body: decision.text,
    htmlBody: decision.html,
  });

  if (!sendResult.sent || sendResult.provider !== "resend") {
    job.airportPickupReminderFailedAt = new Date().toISOString();
    job.airportPickupReminderLastError = sendResult.error || "Airport pickup reminder email failed";
    await saveTrackingJob(env.TRACKING_STORE!, job);
    console.error("Airport pickup reminder email failed", job.airportPickupReminderLastError, job.token);
    return "eligible_error";
  }

  job.airportPickupReminderSentAt = new Date().toISOString();
  delete job.airportPickupReminderFailedAt;
  delete job.airportPickupReminderLastError;
  await saveTrackingJob(env.TRACKING_STORE!, job);
  return "sent";
}

import { evaluateJourneyReminder } from "../shared/journey-reminder";
import { airportPickupReminderInput } from "./airport-pickup-reminder-handlers";
import { getPaidBookingRecord } from "./paid-booking-store";
import { listUpcomingTrackingJobs, saveTrackingJob } from "./tracking-store";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & { TRACKING_STORE?: KVNamespace };

/** Each leg is evaluated separately using current booking details, not the quote snapshot. */
export async function processDueJourneyReminders(env: Env, now = new Date()) {
  const result = { scanned: 0, eligible: 0, sent: 0, errors: 0 };
  if (!env.TRACKING_STORE) return result;
  // Tomorrow is included because a four-hour lead can cross midnight.
  const jobs = await listUpcomingTrackingJobs(env.TRACKING_STORE, 1);
  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.token)) continue;
    seen.add(job.token);
    result.scanned++;
    if (job.journeyReminderSentAt || !job.paymentReference) continue;
    const paid = await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference);
    if (!paid || (job.journeyLeg === "return" && !paid.returnJourney)) continue; // Never remind unpaid requests or orphaned tracking records.
    const current = airportPickupReminderInput(job, paid);
    const decision = evaluateJourneyReminder({ ...current,
      reminderSentAt: job.journeyReminderSentAt,
      refundedAt: paid.refundedAt || job.refundedAt,
      passengers: paid.passengers, suitcases: paid.suitcases,
      suitcasesExact: paid.suitcasesExact, vehicle: paid.vehicle,
    }, now);
    if (!decision.eligible) continue;
    result.eligible++;
    // Resend also deduplicates retries if overlapping KV writes lose the sent stamp.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
      `${current.customerEmail}\n${decision.subject}\n${decision.text}\n${decision.html}`));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const send = await trySendResendOnlyCustomerEmail(env, {
      idempotencyKey: `journey-reminder-${job.token}-${fingerprint}`,
      to: current.customerEmail!.trim(), toName: current.customerName || "Customer",
      subject: decision.subject, body: decision.text, htmlBody: decision.html,
    });
    if (send.sent) {
      job.journeyReminderSentAt = now.toISOString();
      delete job.journeyReminderFailedAt;
      delete job.journeyReminderLastError;
      result.sent++;
    } else {
      job.journeyReminderFailedAt = now.toISOString();
      job.journeyReminderLastError = send.error || "Journey reminder email failed";
      result.errors++;
    }
    await saveTrackingJob(env.TRACKING_STORE, job);
  }
  return result;
}

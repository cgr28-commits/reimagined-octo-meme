import { cashDueForLegGbp, remainingCashDueGbp } from "../shared/deposit-cash";
import { evaluateJourneyReminder, resolveJourneyReminderCustomerName } from "../shared/journey-reminder";
import { airportPickupReminderInput } from "./airport-pickup-reminder-handlers";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { getPaidBookingRecord } from "./paid-booking-store";
import { listUpcomingTrackingJobs, saveTrackingJob } from "./tracking-store";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { sendJourneyReminderWhatsApp, type WhatsAppTemplateEnv } from "./whatsapp-templates";
import { matchServedAirportCode } from "../shared/served-airports";

type Env = WorkerEmailEnv & WhatsAppTemplateEnv & { TRACKING_STORE?: KVNamespace };

/**
 * This leg's half of an uncollected Deposit + Cash balance. When the other
 * leg of a return is cancelled the balance is unsettled, so state no amount.
 */
function journeyReminderCashDue(paid: PaidBookingRecord, leg: "outbound" | "return"): number {
  const cashDue = remainingCashDueGbp(paid);
  if (!cashDue) return 0;
  if (paid.returnJourney) {
    const other = leg === "return" ? "outbound" : "return";
    const otherCancelledAt = other === "return" ? paid.returnCancelledAt : paid.outboundCancelledAt;
    if (paid.cancelledLegs?.includes(other) || otherCancelledAt?.trim()) return 0;
  }
  return cashDueForLegGbp(cashDue, paid.returnJourney === true, leg);
}

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
    // A whitespace-only/placeholder name on an older payment must not hide the tracking name.
    const legacy = paid as typeof paid & { firstName?: string; customerFirstName?: string; name?: string };
    current.customerName = resolveJourneyReminderCustomerName(
      paid.customerName, job.customerName, legacy.customerFirstName, legacy.firstName, legacy.name,
    );
    const decision = evaluateJourneyReminder({ ...current,
      reminderSentAt: job.journeyReminderSentAt,
      refundedAt: paid.refundedAt || job.refundedAt,
      passengers: paid.passengers, suitcases: paid.suitcases,
      // Older paid records have no exact-quantity flag; preserve 5+ as a lower bound.
      suitcasesExact: (paid as typeof paid & { suitcasesExact?: boolean }).suitcasesExact ?? ((paid.suitcases ?? 0) < 5),
      vehicle: paid.vehicle,
      cashDueGbp: journeyReminderCashDue(paid, job.journeyLeg === "return" ? "return" : "outbound"),
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
    // WhatsApp copy for pickups that aren't at an airport (airport collections get the
    // airport pickup message with directions instead). Approved template only; never blocks.
    if (send.sent && !matchServedAirportCode(current.pickupLabel ?? "")) {
      await sendJourneyReminderWhatsApp(env, {
        jobKey: job.token,
        customerName: current.customerName,
        mobile: job.customerMobile || paid.mobileNumber,
        tripDate: current.tripDate,
        tripTime: current.tripTime,
        pickupLabel: current.pickupLabel,
        dropoffLabel: current.dropoffLabel,
      });
    }
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

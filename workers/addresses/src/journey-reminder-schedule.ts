/**
 * When a booked pickup time changes, forget the reminder already sent for the old time.
 */

import { clearJourneyReminderDelivery } from "../shared/journey-reminder";
import type { TrackingJobRecord } from "../shared/tracking";
import { findTrackingJobsByPaymentReference, saveTrackingJob } from "./tracking-store";

export async function invalidateJourneyRemindersOnScheduleChange(
  store: KVNamespace,
  input: {
    paymentReference: string;
    previousTripDate?: string | null;
    previousTripTime?: string | null;
    nextTripDate?: string | null;
    nextTripTime?: string | null;
    previousReturnDate?: string | null;
    previousReturnTime?: string | null;
    nextReturnDate?: string | null;
    nextReturnTime?: string | null;
  },
): Promise<void> {
  const outboundChanged =
    (input.previousTripDate ?? "") !== (input.nextTripDate ?? "") ||
    (input.previousTripTime ?? "") !== (input.nextTripTime ?? "");
  const returnChanged =
    (input.previousReturnDate ?? "") !== (input.nextReturnDate ?? "") ||
    (input.previousReturnTime ?? "") !== (input.nextReturnTime ?? "");
  if (!outboundChanged && !returnChanged) return;

  const jobs = await findTrackingJobsByPaymentReference(store, input.paymentReference);
  for (const job of jobs) {
    const leg = job.journeyLeg === "return" ? "return" : "outbound";
    if (leg === "outbound" && !outboundChanged) continue;
    if (leg === "return" && !returnChanged) continue;
    clearJourneyReminderDelivery(job as TrackingJobRecord & Record<string, unknown>);
    await saveTrackingJob(store, job);
  }
}

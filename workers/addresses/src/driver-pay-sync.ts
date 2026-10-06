/**
 * Keeps the durable driver-payment ledger aligned with a tracking journey
 * while that journey still exists.
 */

import type { TrackingJobRecord } from "../shared/tracking";
import { legHasOwnDriverPayLedger, driverPayShownForLeg } from "../shared/driver-pay-ledger";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import { persistTrackingDriverPay } from "./driver-pay-store";
import { findTrackingJobsByPaymentReference } from "./tracking-store";

export async function syncDurableDriverPayFromTracking(
  store: KVNamespace,
  job: TrackingJobRecord,
): Promise<void> {
  let bookingReference: string | undefined;
  const paymentReference = job.paymentReference?.trim();
  if (paymentReference && paidBookingStoreConfigured(store)) {
    const paid = await getPaidBookingRecord(store, paymentReference);
    bookingReference = paid?.customerReference?.trim() || undefined;
  }
  await persistTrackingDriverPay(store, job, { bookingReference });
}

export async function linkedJourneyCountForDriverPay(
  store: KVNamespace | undefined,
  job: Pick<TrackingJobRecord, "token" | "paymentReference" | "pairedToken" | "journeyLeg">,
): Promise<number> {
  if (job.pairedToken?.trim() || job.journeyLeg === "return") return 2;
  const ref = job.paymentReference?.trim();
  if (!store || !ref) return 1;
  const jobs = await findTrackingJobsByPaymentReference(store, ref);
  const tokens = new Set(jobs.map((entry) => entry.token));
  tokens.add(job.token);
  return Math.max(tokens.size, 1);
}

export async function driverPayAmountVisibleForJob(
  store: KVNamespace | undefined,
  job: TrackingJobRecord,
  bookingPayAmount?: string,
): Promise<string | undefined> {
  const linkedJourneyCount = legHasOwnDriverPayLedger(job)
    ? 1
    : await linkedJourneyCountForDriverPay(store, job);
  return driverPayShownForLeg({
    job,
    bookingPayAmount,
    linkedJourneyCount,
    journeyLeg: job.journeyLeg,
    pairedToken: job.pairedToken,
  });
}

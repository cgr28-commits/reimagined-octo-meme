/**
 * Keeps the dispatch job record (what the driver portal reads) in step with an amended paid booking.
 *
 * - Updates the EXISTING BookingJobRecord only. It never creates a job, so no duplicate jobs.
 * - Date/time/pickup/drop-off changes are written to the job; the existing driver change-request
 *   flow (syncJob in driver-jobs.ts) then asks the driver to accept, exactly as before.
 * - Notes-type details (cruise ship / ferry sailing, pickup-point note) are not part of that flow,
 *   so the assigned driver gets ONE email, only when the value really changed.
 * - Nothing is written or sent when nothing changed, so repeat saves cannot duplicate alerts.
 */
import type { BookingJobRecord } from "../shared/booking-job";
import { getBookingJob, saveBookingJob } from "./booking-job-store";

export interface JobSyncFields {
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  flightNumber?: string;
  passengers?: number;
  suitcases?: number;
  mobileNumber?: string;
  sailingDetails?: string;
  portPickupNote?: string;
}

export interface JobSyncRecordRef {
  paymentReference: string;
  trackingToken?: string;
}

export interface JobSyncResult {
  found: boolean;
  changed: string[];
  driverNotified: boolean;
}

export type DriverNotifier = (driver: { email: string; name: string }, subject: string, body: string) => Promise<void>;

const NOTE_LABELS: Record<"sailingDetails" | "portPickupNote", string> = {
  sailingDetails: "Cruise ship / ferry",
  portPickupNote: "Pickup point",
};

export async function findLinkedBookingJob(store: KVNamespace, ref: JobSyncRecordRef): Promise<BookingJobRecord | null> {
  const byRef = ref.paymentReference ? await getBookingJob(store, ref.paymentReference) : null;
  if (byRef) return byRef;
  return ref.trackingToken ? getBookingJob(store, `track-${ref.trackingToken}`) : null;
}

export async function syncBookingJobFromAmendment(
  store: KVNamespace | undefined,
  ref: JobSyncRecordRef,
  fields: JobSyncFields,
  notifyDriver?: DriverNotifier,
): Promise<JobSyncResult> {
  if (!store) return { found: false, changed: [], driverNotified: false };
  const job = await findLinkedBookingJob(store, ref);
  if (!job) return { found: false, changed: [], driverNotified: false };

  const next: BookingJobRecord = { ...job };
  const changed: string[] = [];
  const setText = (key: "tripDate" | "tripTime" | "pickupLabel" | "dropoffLabel" | "flightNumber" | "sailingDetails" | "portPickupNote", value: string | undefined) => {
    if (value === undefined) return;
    const v = String(value).trim();
    if ((job[key] ?? "") === v) return;
    (next as unknown as Record<string, unknown>)[key] = v || undefined;
    changed.push(key);
  };
  setText("tripDate", fields.tripDate);
  setText("tripTime", fields.tripTime);
  setText("pickupLabel", fields.pickupLabel);
  setText("dropoffLabel", fields.dropoffLabel);
  setText("flightNumber", fields.flightNumber);
  setText("sailingDetails", fields.sailingDetails);
  setText("portPickupNote", fields.portPickupNote);
  if (fields.passengers !== undefined && Number(fields.passengers) !== job.passengers) {
    next.passengers = Number(fields.passengers);
    changed.push("passengers");
  }
  if (fields.suitcases !== undefined && Number(fields.suitcases) !== job.suitcases) {
    next.suitcases = Number(fields.suitcases);
    changed.push("suitcases");
  }
  if (fields.mobileNumber !== undefined && fields.mobileNumber.trim() && fields.mobileNumber.trim() !== job.customerMobile) {
    next.customerMobile = fields.mobileNumber.trim();
    changed.push("customerMobile");
  }
  if (changed.length === 0) return { found: true, changed, driverNotified: false };

  await saveBookingJob(store, next);

  const noteChanges = (["sailingDetails", "portPickupNote"] as const).filter((k) => changed.includes(k));
  const active = job.driverAssignmentStatus === "pending" || job.driverAssignmentStatus === "accepted";
  if (noteChanges.length === 0 || !active || !job.driverEmail?.trim() || !notifyDriver) {
    return { found: true, changed, driverNotified: false };
  }
  const lines = noteChanges.map((k) => `${NOTE_LABELS[k]}: ${(next[k] ?? "").trim() || "(removed)"}  (was: ${(job[k] ?? "").trim() || "none"})`);
  try {
    await notifyDriver(
      { email: job.driverEmail.trim(), name: job.driverFirstName || "Driver" },
      `Updated pickup details — ${job.tripDate || "your job"}`,
      `Hi ${job.driverFirstName || "there"},\n\nThe customer has updated details on a job you have accepted:\n\n${lines.join("\n")}\n\nThe date, time and route are unchanged. Open your driver portal for the full job.`,
    );
    return { found: true, changed, driverNotified: true };
  } catch {
    return { found: true, changed, driverNotified: false };
  }
}

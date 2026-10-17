/**
 * Pure helpers for repairing a tracking job that was incorrectly marked
 * refunded/completed while the paid booking remains live (confirmed/paid).
 */

export type RepairablePaidStatus =
  | "confirmed"
  | "paid"
  | "partially_refunded"
  | "refunded_active";

export type RepairableTrackingJob = {
  token: string;
  paymentReference?: string;
  customerName?: string;
  tripDate?: string;
  tripTime?: string;
  journeyStatus?: string;
  journeyCompletedAt?: string;
  trackingStoppedAt?: string;
  arrivedDestinationAt?: string;
  refundedAt?: string;
  refundAmountLabel?: string;
  pairedToken?: string;
  sharingActive?: boolean;
  customerSharingActive?: boolean;
  reviewRequestScheduledAt?: string;
  reviewRequestDueAt?: string;
  reviewRequestSentAt?: string;
};

export type TrackingStatusRepairPlan = {
  shouldRepair: boolean;
  reasons: string[];
  clearedFields: string[];
  next: RepairableTrackingJob;
};

const LIVE_PAID_STATUSES = new Set<string>([
  "confirmed",
  "paid",
  "partially_refunded",
  "refunded_active",
]);

export function isLivePaidBookingStatus(status: string | undefined | null): boolean {
  return LIVE_PAID_STATUSES.has(String(status || "").trim().toLowerCase());
}

/**
 * Build a repair patch for a single tracking job.
 * Only clears erroneous finished/refunded markers when the paid booking is still live.
 * Does not invent new journey progress (leaves idle / arrived_pickup / tracking as-is
 * except when status is completed/stopped from a false completion).
 */
export function planErroneousTrackingStatusRepair(input: {
  job: RepairableTrackingJob;
  paidBookingStatus: string | undefined | null;
  /** When set, clear pairedToken if it points at a different payment reference. */
  pairedJobPaymentReference?: string | null;
  /** Future trip still pending — safe to unwind false completion. */
  tripStillUpcoming?: boolean;
}): TrackingStatusRepairPlan {
  const reasons: string[] = [];
  const clearedFields: string[] = [];
  const next: RepairableTrackingJob = { ...input.job };

  if (!isLivePaidBookingStatus(input.paidBookingStatus)) {
    return {
      shouldRepair: false,
      reasons: [
        `Paid booking status is ${input.paidBookingStatus || "unknown"} — refusing repair`,
      ],
      clearedFields: [],
      next,
    };
  }

  if (next.refundedAt?.trim()) {
    reasons.push("tracking.refundedAt set while paid booking is still live");
    delete next.refundedAt;
    clearedFields.push("refundedAt");
    if (next.refundAmountLabel) {
      delete next.refundAmountLabel;
      clearedFields.push("refundAmountLabel");
    }
  }

  const status = (next.journeyStatus || "idle").trim();
  const tripUpcoming = input.tripStillUpcoming !== false;
  if (
    tripUpcoming &&
    (status === "completed" ||
      status === "stopped" ||
      Boolean(next.journeyCompletedAt?.trim()))
  ) {
    reasons.push(
      `tracking.journeyStatus/journeyCompletedAt marked finished (${status || "idle"}) on an upcoming live booking`,
    );
    next.journeyStatus = "idle";
    clearedFields.push("journeyStatus→idle");
    if (next.journeyCompletedAt) {
      delete next.journeyCompletedAt;
      clearedFields.push("journeyCompletedAt");
    }
    if (next.trackingStoppedAt) {
      delete next.trackingStoppedAt;
      clearedFields.push("trackingStoppedAt");
    }
    if (next.arrivedDestinationAt) {
      delete next.arrivedDestinationAt;
      clearedFields.push("arrivedDestinationAt");
    }
    next.sharingActive = false;
    next.customerSharingActive = false;
    if (next.reviewRequestScheduledAt) {
      delete next.reviewRequestScheduledAt;
      clearedFields.push("reviewRequestScheduledAt");
    }
    if (next.reviewRequestDueAt) {
      delete next.reviewRequestDueAt;
      clearedFields.push("reviewRequestDueAt");
    }
    if (next.reviewRequestSentAt) {
      delete next.reviewRequestSentAt;
      clearedFields.push("reviewRequestSentAt");
    }
  }

  const jobRef = next.paymentReference?.trim() || "";
  const pairedRef = input.pairedJobPaymentReference?.trim() || "";
  if (next.pairedToken?.trim() && jobRef && pairedRef && pairedRef !== jobRef) {
    reasons.push(
      `pairedToken pointed at a different paymentReference (${pairedRef})`,
    );
    delete next.pairedToken;
    clearedFields.push("pairedToken");
  }

  return {
    shouldRepair: clearedFields.length > 0,
    reasons,
    clearedFields,
    next,
  };
}

export function matchesJillMatchettTarget(input: {
  customerName?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
}): boolean {
  const name = String(input.customerName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const date = String(input.tripDate || "").trim();
  const time = String(input.tripTime || "").trim();
  if (!name.includes("jill") || !name.includes("matchett")) return false;
  if (date !== "2026-08-23") return false;
  // Accept 11:30 or 11:30:00
  return time === "11:30" || time.startsWith("11:30");
}

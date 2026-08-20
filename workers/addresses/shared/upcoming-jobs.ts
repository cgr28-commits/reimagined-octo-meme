import { PRIMARY_DRIVER_LABEL } from "./paid-booking-record";
import {
  isRefundTestIsolationDecoyPaymentReference,
  REFUND_TEST_ISOLATION_DECOY_PREFIX,
} from "./refund-test-isolation";

export type UpcomingBucket = "today" | "tomorrow" | "later" | "past";

/** Owner-only / diagnostic booking markers used for dashboard filtering. */
export type OwnerTestBookingFlags = {
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
  paymentReference?: string;
};

/**
 * True for owner/test/diagnostic fixtures that must never appear in normal
 * operational dashboard sections (Upcoming, Completed/History, calendar counts).
 * Prefer explicit metadata flags; payment-reference prefixes are a secondary signal
 * for isolation decoys and tagged refund-test / amendment-test refs.
 */
export function isOwnerOperationalTestBooking(
  booking: OwnerTestBookingFlags,
): boolean {
  if (booking.isRefundTest === true) return true;
  if (booking.isAmendmentTestFixture === true) return true;

  const ref = booking.paymentReference?.trim() ?? "";
  if (!ref) return false;
  if (isRefundTestIsolationDecoyPaymentReference(ref)) return true;
  if (ref.startsWith(REFUND_TEST_ISOLATION_DECOY_PREFIX)) return true;
  if (ref.startsWith("REFUND-TEST-")) return true;
  if (ref.startsWith("AMEND-TEST-")) return true;
  return false;
}

export function londonYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysYmd(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function upcomingBucketForTripDate(
  tripDate: string,
  today = londonYmd(),
): UpcomingBucket {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return "later";
  if (tripDate === today) return "today";
  if (tripDate === addDaysYmd(today, 1)) return "tomorrow";
  if (tripDate < today) return "past";
  return "later";
}

/** Booking fields used for Upcoming vs Completed and next-leg ordering. */
export type LegAwareBooking = {
  status?: string;
  returnJourney?: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  journeyStatus?: string;
  outboundJourneyStatus?: string;
  returnJourneyStatus?: string;
  allLegsCompleted?: boolean;
  nextUnfinishedLegDate?: string;
  nextUnfinishedLegTime?: string;
};

function legStatusCompleted(status?: string | null): boolean {
  return status === "completed";
}

/**
 * True when every journey leg that exists for this paid booking is completed.
 * Return bookings stay unfinished until BOTH outbound and return are completed.
 * Missing return tracking does not count as completed.
 */
export function bookingFullyCompleted(booking: LegAwareBooking): boolean {
  if (typeof booking.allLegsCompleted === "boolean") {
    return booking.allLegsCompleted;
  }

  if (booking.returnJourney) {
    const outboundDone = legStatusCompleted(
      booking.outboundJourneyStatus ?? booking.journeyStatus,
    );
    const returnDone = legStatusCompleted(booking.returnJourneyStatus);
    return outboundDone && returnDone;
  }

  return legStatusCompleted(
    booking.outboundJourneyStatus ?? booking.journeyStatus,
  );
}

/**
 * Next unfinished journey date for Upcoming Jobs bucketing / display.
 * Uses API `nextUnfinishedLegDate` when present; otherwise derives from leg statuses.
 * Past unfinished outbound stays on the outbound date (not auto-skipped).
 */
export function relevantUpcomingJourneyDate(
  booking: LegAwareBooking,
  _today = londonYmd(),
): string {
  const explicit = booking.nextUnfinishedLegDate?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit;
  }

  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";

  if (booking.returnJourney) {
    const outboundDone = legStatusCompleted(
      booking.outboundJourneyStatus ?? booking.journeyStatus,
    );
    if (!outboundDone) {
      return tripDate;
    }
    if (!legStatusCompleted(booking.returnJourneyStatus)) {
      return returnDate || tripDate;
    }
  }

  return tripDate;
}

export function relevantUpcomingJourneyTime(booking: LegAwareBooking): string {
  const explicitDate = booking.nextUnfinishedLegDate?.trim() ?? "";
  const explicitTime = booking.nextUnfinishedLegTime?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return explicitTime;
  }

  const nextDate = relevantUpcomingJourneyDate(booking);
  if (
    booking.returnJourney &&
    nextDate === (booking.returnDate || "").trim() &&
    nextDate !== (booking.tripDate || "").trim()
  ) {
    return booking.returnTime?.trim() ?? "";
  }
  return booking.tripTime?.trim() ?? "";
}

/** Sort key: next unfinished leg date+time ascending (soonest due first). */
export function nextUnfinishedSortKey(booking: LegAwareBooking): string {
  const date = relevantUpcomingJourneyDate(booking) || "9999-99-99";
  const time = relevantUpcomingJourneyTime(booking) || "99:99";
  return `${date}T${time}`;
}

/** True when outbound and/or return falls inside the Upcoming Jobs horizon. */
export function bookingInUpcomingHorizon(
  booking: {
    tripDate?: string;
    returnJourney?: boolean;
    returnDate?: string;
  },
  horizonStart: string,
  horizonEnd: string,
): boolean {
  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";
  const tripOk = /^\d{4}-\d{2}-\d{2}$/.test(tripDate);
  const returnOk =
    Boolean(booking.returnJourney) && /^\d{4}-\d{2}-\d{2}$/.test(returnDate);

  if (!tripOk && !returnOk) return true;

  if (tripOk && tripDate >= horizonStart && tripDate <= horizonEnd) {
    return true;
  }
  if (returnOk && returnDate >= horizonStart && returnDate <= horizonEnd) {
    return true;
  }
  return false;
}

export function formatDisplayTripDate(tripDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return tripDate || "—";
  const [y, m, d] = tripDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function journeyStatusLabel(status?: string): string {
  switch (status) {
    case "tracking":
      return "Live tracking";
    case "arrived_pickup":
      return "Arrived at pickup";
    case "en_route":
      return "Passenger on board";
    case "arrived_destination":
      return "Arrived at destination";
    case "completed":
      return "Completed";
    case "stopped":
      return "Tracking stopped";
    default:
      return "Upcoming";
  }
}

export function assignedDriverDisplay(label?: string | null, name?: string | null): string {
  return label?.trim() || name?.trim() || PRIMARY_DRIVER_LABEL;
}

/**
 * Upcoming Jobs: real unfinished customer work whose next unfinished pickup
 * day is today or in the future. Excludes tests, cancelled/refunded, completed,
 * and past incomplete trip days.
 */
export function isUpcomingWorkBooking(
  booking: LegAwareBooking & OwnerTestBookingFlags,
  today = londonYmd(),
): boolean {
  if (isOwnerOperationalTestBooking(booking)) return false;
  // refunded_active = money fully returned but journey still live — keep in upcoming.
  if (booking.status === "refunded" || booking.status === "cancelled") return false;
  if (bookingFullyCompleted(booking)) return false;

  const nextDate = relevantUpcomingJourneyDate(booking, today);
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate) && nextDate < today) {
    return false;
  }
  return true;
}

/**
 * Completed Jobs / History: fully completed legs, cancelled, or cancel+full-refund.
 * Test fixtures are excluded from the normal archive (diagnostics pages only).
 */
export function isCompletedWorkBooking(
  booking: LegAwareBooking & OwnerTestBookingFlags,
): boolean {
  if (isOwnerOperationalTestBooking(booking)) return false;
  if (booking.status === "refunded" || booking.status === "cancelled") return true;
  return bookingFullyCompleted(booking);
}

export type CompletionTimestampSource =
  | "journeyCompletedAt"
  | "cancelledAt"
  | "refundedAt"
  | "returnTripDateTime"
  | "tripDateTime"
  | "createdAt";

export type CompletionTimestampResolution = {
  /** ISO-ish instant used for ordering within a day (may be synthetic for date-only fallbacks). */
  at: string;
  /** Europe/London calendar day the job is grouped under. */
  day: string;
  source: CompletionTimestampSource;
};

function londonYmdFromInstant(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return londonYmd(new Date(ms));
}

function tripDateTimeIso(date?: string, time?: string): string | null {
  const d = date?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = (time?.trim() || "12:00").slice(0, 5);
  // Treat trip local clock as Europe/London wall time without offset math —
  // sufficient for day grouping; within-day sort uses the same string.
  return `${d}T${t}:00`;
}

/**
 * Resolve the calendar day a completed/cancelled/refunded booking belongs under.
 * Prefer actual journeyCompletedAt; fall back through status timestamps then trip datetime.
 */
export function resolveCompletionTimestamp(
  booking: LegAwareBooking &
    OwnerTestBookingFlags & {
      journeyCompletedAt?: string;
      cancelledAt?: string;
      refundedAt?: string;
      createdAt?: string;
    },
): CompletionTimestampResolution | null {
  const completedAt = booking.journeyCompletedAt?.trim();
  if (completedAt) {
    const day = londonYmdFromInstant(completedAt);
    if (day) {
      return { at: completedAt, day, source: "journeyCompletedAt" };
    }
  }

  const cancelledAt = booking.cancelledAt?.trim();
  if (cancelledAt) {
    const day = londonYmdFromInstant(cancelledAt);
    if (day) {
      return { at: cancelledAt, day, source: "cancelledAt" };
    }
  }

  const refundedAt = booking.refundedAt?.trim();
  if (refundedAt) {
    const day = londonYmdFromInstant(refundedAt);
    if (day) {
      return { at: refundedAt, day, source: "refundedAt" };
    }
  }

  if (booking.returnJourney) {
    const returnIso = tripDateTimeIso(booking.returnDate, booking.returnTime);
    if (returnIso && /^\d{4}-\d{2}-\d{2}$/.test(booking.returnDate?.trim() ?? "")) {
      return {
        at: returnIso,
        day: booking.returnDate!.trim(),
        source: "returnTripDateTime",
      };
    }
  }

  const tripIso = tripDateTimeIso(booking.tripDate, booking.tripTime);
  if (tripIso && /^\d{4}-\d{2}-\d{2}$/.test(booking.tripDate?.trim() ?? "")) {
    return {
      at: tripIso,
      day: booking.tripDate!.trim(),
      source: "tripDateTime",
    };
  }

  const createdAt = booking.createdAt?.trim();
  if (createdAt) {
    const day = londonYmdFromInstant(createdAt);
    if (day) {
      return { at: createdAt, day, source: "createdAt" };
    }
  }

  return null;
}

export type CompletedJobsDayGroup<T> = {
  day: string;
  title: string;
  items: T[];
  /** True when day === today (London). */
  isToday: boolean;
};

function formatCompletedDayHeading(day: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day || "Unknown date";
  if (day === today) {
    return `Today — ${formatDisplayTripDate(day)}`;
  }
  return formatDisplayTripDate(day);
}

/**
 * Group completed/history bookings by completion calendar day (newest day first).
 * Within each day, newest completion timestamp first.
 */
export function groupCompletedBookingsByDay<
  T extends LegAwareBooking &
    OwnerTestBookingFlags & {
      journeyCompletedAt?: string;
      cancelledAt?: string;
      refundedAt?: string;
      createdAt?: string;
    },
>(bookings: T[], today = londonYmd()): CompletedJobsDayGroup<T>[] {
  const byDay = new Map<string, { booking: T; sortAt: string }[]>();

  for (const booking of bookings) {
    const resolved = resolveCompletionTimestamp(booking);
    const day = resolved?.day || "unknown";
    const at = resolved?.at || "";
    const bucket = byDay.get(day) ?? [];
    bucket.push({ booking, sortAt: at });
    byDay.set(day, bucket);
  }

  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  return days.map((day) => {
    const entries = byDay.get(day) ?? [];
    entries.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    return {
      day,
      title: formatCompletedDayHeading(day, today),
      isToday: day === today,
      items: entries.map((entry) => entry.booking),
    };
  });
}

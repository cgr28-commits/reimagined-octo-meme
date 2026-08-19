/**
 * Owner Booking Calendar — maps existing tracking/paid booking legs into
 * calendar entries. No separate booking database.
 */

import { addDaysYmd, londonYmd } from "../../shared/upcoming-jobs";
import type { DriverJob } from "@/lib/tracking-api";
import type { OwnerPaidBookingSummary } from "@/lib/paid-bookings-api";

export type CalendarViewMode = "month" | "week" | "day";

/** Visual status for calendar chips — derived from existing journey/booking fields. */
export type CalendarLegStatus =
  | "upcoming"
  | "live"
  | "arrived_pickup"
  | "completed"
  | "refunded";

export type OwnerCalendarEntry = {
  /** Stable id: tracking token when present, else synthetic payment+leg. */
  id: string;
  token?: string;
  paymentReference?: string;
  journeyLeg: "outbound" | "return" | "one_way";
  tripDate: string;
  tripTime: string;
  pickupAt: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  airportCode?: string | null;
  flightNumber?: string | null;
  isAirportPickup?: boolean;
  serviceType: "SALOON" | "ESTATE" | "MINIBUS" | "OTHER";
  serviceLabel: string;
  paymentStatus:
    | "confirmed"
    | "partially_refunded"
    | "refunded_active"
    | "refunded"
    | "cancelled"
    | "unknown";
  assignedDriver: string;
  calendarStatus: CalendarLegStatus;
  journeyStatus?: string;
  sharingActive?: boolean;
};

export function normalizeServiceType(
  vehicle?: string | null,
): { serviceType: OwnerCalendarEntry["serviceType"]; serviceLabel: string } {
  const raw = (vehicle ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("minibus")) {
    return { serviceType: "MINIBUS", serviceLabel: "MINIBUS" };
  }
  if (lower.includes("estate")) {
    return { serviceType: "ESTATE", serviceLabel: "ESTATE" };
  }
  if (lower.includes("saloon") || lower.includes("standard") || lower.includes("car")) {
    return { serviceType: "SALOON", serviceLabel: "SALOON" };
  }
  if (!raw) {
    return { serviceType: "OTHER", serviceLabel: "—" };
  }
  return { serviceType: "OTHER", serviceLabel: raw.toUpperCase() };
}

export function deriveCalendarLegStatus(input: {
  bookingStatus?: string | null;
  journeyStatus?: string | null;
  sharingActive?: boolean | null;
}): CalendarLegStatus {
  if (input.bookingStatus === "refunded" || input.bookingStatus === "cancelled") {
    return "refunded";
  }
  // refunded_active keeps calendar/upcoming operationally live.
  const status = input.journeyStatus || "idle";
  if (status === "completed") {
    return "completed";
  }
  if (status === "arrived_pickup") {
    return "arrived_pickup";
  }
  if (
    input.sharingActive ||
    status === "tracking" ||
    status === "en_route" ||
    status === "arrived_destination"
  ) {
    return "live";
  }
  return "upcoming";
}

export const CALENDAR_STATUS_STYLES: Record<
  CalendarLegStatus,
  { label: string; chip: string; bar: string }
> = {
  upcoming: {
    label: "Upcoming",
    chip: "border-sky-400/40 bg-sky-500/15 text-sky-100",
    bar: "bg-sky-400",
  },
  live: {
    label: "Driver on the way",
    chip: "border-emerald/50 bg-emerald/20 text-emerald",
    bar: "bg-emerald",
  },
  arrived_pickup: {
    label: "Arrived at Pickup",
    chip: "border-amber-300/50 bg-amber-400/20 text-amber-100",
    bar: "bg-amber-400",
  },
  completed: {
    label: "Completed",
    chip: "border-white/20 bg-white/10 text-white/70",
    bar: "bg-white/40",
  },
  refunded: {
    label: "Refunded",
    chip: "border-red-400/40 bg-red-500/15 text-red-100",
    bar: "bg-red-400",
  },
};

export function calendarEntryFromDriverJob(
  job: DriverJob,
  vehicleByPaymentRef?: Map<string, string>,
): OwnerCalendarEntry {
  const paymentReference = job.paymentReference?.trim() || undefined;
  const vehicle =
    (paymentReference ? vehicleByPaymentRef?.get(paymentReference) : undefined) ??
    undefined;
  const { serviceType, serviceLabel } = normalizeServiceType(vehicle);
  const journeyLeg =
    job.journeyLeg === "return"
      ? "return"
      : job.journeyLeg === "outbound"
        ? "outbound"
        : "one_way";
  const calendarStatus = deriveCalendarLegStatus({
    bookingStatus: job.bookingStatus,
    journeyStatus: job.journeyStatus,
    sharingActive: job.sharingActive,
  });

  return {
    id: job.token,
    token: job.token,
    paymentReference,
    journeyLeg,
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    pickupAt: job.pickupAt || `${job.tripDate}T${job.tripTime}`,
    customerName: job.customerName,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    airportCode: job.airportCode,
    flightNumber: job.flightNumber,
    isAirportPickup: job.isAirportPickup,
    serviceType,
    serviceLabel,
    paymentStatus: job.bookingStatus === "refunded" ? "refunded" : job.bookingStatus === "confirmed" ? "confirmed" : "unknown",
    assignedDriver:
      job.assignedDriverName?.trim() ||
      job.activeDriverName?.trim() ||
      "Owner / Primary Driver",
    calendarStatus,
    journeyStatus: job.journeyStatus,
    sharingActive: job.sharingActive,
  };
}

/**
 * Expand a paid booking into outbound (+ return) synthetic legs when tracking
 * jobs are missing — keeps calendar complete without inventing a second DB.
 */
export function calendarEntriesFromPaidBooking(
  booking: OwnerPaidBookingSummary,
  existingTokens: Set<string>,
): OwnerCalendarEntry[] {
  if (
    booking.status !== "confirmed" &&
    booking.status !== "partially_refunded" &&
    booking.status !== "refunded_active" &&
    booking.status !== "refunded" &&
    booking.status !== "cancelled"
  ) {
    return [];
  }

  const { serviceType, serviceLabel } = normalizeServiceType(booking.vehicle);
  const entries: OwnerCalendarEntry[] = [];

  const outboundToken = booking.trackingToken?.trim();
  // Only synthesize outbound if we don't already have any job for this payment
  // (token set is checked by caller per-leg). Use payment+leg ids when no token.
  const outboundId = outboundToken || `${booking.paymentReference}:outbound`;
  if (!existingTokens.has(outboundId) && !existingTokens.has(booking.paymentReference)) {
    const outboundStatus = deriveCalendarLegStatus({
      bookingStatus: booking.status,
      journeyStatus: booking.outboundJourneyStatus ?? booking.journeyStatus,
      sharingActive: booking.sharingActive && !booking.returnJourney,
    });
    entries.push({
      id: outboundId,
      token: outboundToken,
      paymentReference: booking.paymentReference,
      journeyLeg: booking.returnJourney ? "outbound" : "one_way",
      tripDate: booking.tripDate,
      tripTime: booking.tripTime || "00:00",
      pickupAt: `${booking.tripDate}T${booking.tripTime || "00:00"}`,
      customerName: booking.customerName,
      pickupLabel: booking.pickupLabel,
      dropoffLabel: booking.dropoffLabel,
      flightNumber: booking.flightNumber,
      serviceType,
      serviceLabel,
      paymentStatus:
        booking.status === "refunded" ||
        booking.status === "cancelled" ||
        booking.status === "refunded_active" ||
        booking.status === "partially_refunded"
          ? booking.status
          : "confirmed",
      assignedDriver: booking.assignedDriverLabel || booking.assignedDriverName || "Owner / Primary Driver",
      calendarStatus: outboundStatus,
      journeyStatus: booking.outboundJourneyStatus ?? booking.journeyStatus,
    });
  }

  if (
    booking.returnJourney &&
    booking.returnDate?.trim() &&
    booking.returnTime?.trim()
  ) {
    const returnId = `${booking.paymentReference}:return`;
    if (!existingTokens.has(returnId)) {
      const returnStatus = deriveCalendarLegStatus({
        bookingStatus: booking.status,
        journeyStatus: booking.returnJourneyStatus,
        sharingActive: false,
      });
      entries.push({
        id: returnId,
        paymentReference: booking.paymentReference,
        journeyLeg: "return",
        tripDate: booking.returnDate.trim(),
        tripTime: booking.returnTime.trim(),
        pickupAt: `${booking.returnDate.trim()}T${booking.returnTime.trim()}`,
        customerName: booking.customerName,
        pickupLabel: booking.dropoffLabel,
        dropoffLabel: booking.pickupLabel,
        flightNumber: booking.returnFlightNumber,
        serviceType,
        serviceLabel,
        paymentStatus:
        booking.status === "refunded" ||
        booking.status === "cancelled" ||
        booking.status === "refunded_active" ||
        booking.status === "partially_refunded"
          ? booking.status
          : "confirmed",
        assignedDriver: booking.assignedDriverLabel || booking.assignedDriverName || "Owner / Primary Driver",
        calendarStatus: returnStatus,
        journeyStatus: booking.returnJourneyStatus,
      });
    }
  }

  return entries;
}

export function mergeCalendarEntries(
  jobs: DriverJob[],
  bookings: OwnerPaidBookingSummary[],
): OwnerCalendarEntry[] {
  const vehicleByRef = new Map<string, string>();
  for (const booking of bookings) {
    if (booking.paymentReference && booking.vehicle) {
      vehicleByRef.set(booking.paymentReference, booking.vehicle);
    }
  }

  const fromJobs = jobs.map((job) => calendarEntryFromDriverJob(job, vehicleByRef));
  const tokenSet = new Set(fromJobs.map((entry) => entry.id));
  const paymentRefsWithJobs = new Set(
    fromJobs.map((entry) => entry.paymentReference).filter(Boolean) as string[],
  );

  // Mark payment refs that already have outbound/return from jobs so we don't
  // double-add synthetic outbound when a return-only gap exists.
  const jobsByRefLeg = new Set<string>();
  for (const job of jobs) {
    const ref = job.paymentReference?.trim();
    if (!ref) continue;
    const leg = job.journeyLeg === "return" ? "return" : "outbound";
    jobsByRefLeg.add(`${ref}:${leg}`);
    tokenSet.add(`${ref}:${leg}`);
  }

  const synthetic: OwnerCalendarEntry[] = [];
  for (const booking of bookings) {
    const ref = booking.paymentReference;
    const hasOutboundJob = jobsByRefLeg.has(`${ref}:outbound`);
    const hasReturnJob = jobsByRefLeg.has(`${ref}:return`);
    const existing = new Set<string>(tokenSet);
    if (hasOutboundJob) {
      existing.add(booking.trackingToken?.trim() || `${ref}:outbound`);
      existing.add(ref);
    }
    if (hasReturnJob) {
      existing.add(`${ref}:return`);
    }
    // If we already have tracking jobs for this payment, only fill missing return.
    if (paymentRefsWithJobs.has(ref) && hasOutboundJob && hasReturnJob) {
      continue;
    }
    for (const entry of calendarEntriesFromPaidBooking(booking, existing)) {
      if (entry.journeyLeg === "outbound" || entry.journeyLeg === "one_way") {
        if (hasOutboundJob) continue;
      }
      if (entry.journeyLeg === "return" && hasReturnJob) continue;
      synthetic.push(entry);
      tokenSet.add(entry.id);
    }
  }

  return [...fromJobs, ...synthetic].sort((a, b) =>
    a.pickupAt.localeCompare(b.pickupAt),
  );
}

export function entriesForDate(
  entries: OwnerCalendarEntry[],
  date: string,
): OwnerCalendarEntry[] {
  return entries.filter((entry) => entry.tripDate === date);
}

export function startOfWeekMonday(dateYmd: string): string {
  const date = new Date(`${dateYmd}T12:00:00Z`);
  // en-CA London weekday: get UTC day from London ymd
  const asLocal = new Date(`${dateYmd}T12:00:00`);
  const day = asLocal.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysYmd(dateYmd, offset);
}

export function weekDates(anchorYmd: string): string[] {
  const start = startOfWeekMonday(anchorYmd);
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i));
}

export function monthGridDates(monthYmd: string): string[] {
  const [y, m] = monthYmd.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const start = startOfWeekMonday(first);
  // 6 weeks grid
  return Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
}

export function monthAnchor(dateYmd: string): string {
  return `${dateYmd.slice(0, 7)}-01`;
}

export function shiftMonth(monthYmd: string, delta: number): string {
  const [y, m] = monthYmd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function formatCalendarDayHeading(dateYmd: string): string {
  const date = new Date(`${dateYmd}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatCalendarMonthHeading(monthYmd: string): string {
  const date = new Date(`${monthYmd.slice(0, 7)}-15T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function defaultMobileCalendarView(): CalendarViewMode {
  return "month";
}

export function defaultOwnerCalendarView(): CalendarViewMode {
  return "month";
}

export function rangeForView(
  mode: CalendarViewMode,
  anchorYmd: string,
): { from: string; to: string } {
  if (mode === "day") {
    return { from: anchorYmd, to: anchorYmd };
  }
  if (mode === "week") {
    const days = weekDates(anchorYmd);
    return { from: days[0]!, to: days[6]! };
  }
  const grid = monthGridDates(monthAnchor(anchorYmd));
  return { from: grid[0]!, to: grid[41]! };
}

export function isToday(dateYmd: string, today = londonYmd()): boolean {
  return dateYmd === today;
}

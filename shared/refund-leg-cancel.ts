/**
 * Leg-specific cancel/refund helpers.
 *
 * Payment reference is a membership check only — it must never be the selector
 * for which tracking job or calendar event is cancelled.
 */

export type JourneyCancelLeg = "outbound" | "return";

export type CalendarEventIdsByLeg = {
  outbound?: string;
  return?: string;
};

export type LegCancelTargetJob = {
  token: string;
  paymentReference?: string;
  journeyLeg?: JourneyCancelLeg | string;
  pairedToken?: string;
  refundedAt?: string;
  tripDate?: string;
  tripTime?: string;
  pickupAt?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  calendarEventId?: string;
};

export type LegCancelBookingContext = {
  paymentReference: string;
  returnJourney?: boolean;
  tripDate?: string;
  returnDate?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
};

export function isJourneyCancelLeg(value: unknown): value is JourneyCancelLeg {
  return value === "outbound" || value === "return";
}

export function resolveTrackingJobLeg(
  job: LegCancelTargetJob,
  booking: LegCancelBookingContext,
): JourneyCancelLeg | null {
  if (job.journeyLeg === "outbound" || job.journeyLeg === "return") {
    return job.journeyLeg;
  }
  if (!booking.returnJourney) {
    return "outbound";
  }
  const jobDate = String(job.tripDate || job.pickupAt || "").slice(0, 10);
  const outboundDate = String(booking.tripDate || "").slice(0, 10);
  const returnDate = String(booking.returnDate || "").slice(0, 10);
  const jobPickup = String(job.pickupLabel || "").trim().toLowerCase();
  const bookingPickup = String(booking.pickupLabel || "").trim().toLowerCase();
  const bookingDropoff = String(booking.dropoffLabel || "").trim().toLowerCase();

  const looksReturn =
    Boolean(returnDate) &&
    jobDate === returnDate &&
    jobPickup === bookingDropoff;
  const looksOutbound =
    Boolean(outboundDate) &&
    jobDate === outboundDate &&
    jobPickup === bookingPickup;

  if (looksReturn && !looksOutbound) return "return";
  if (looksOutbound && !looksReturn) return "outbound";
  return null;
}

export function assertLegCancelTarget(input: {
  job: LegCancelTargetJob | null | undefined;
  requestedToken: string;
  cancelLeg: JourneyCancelLeg;
  booking: LegCancelBookingContext;
}): { ok: true; job: LegCancelTargetJob; resolvedLeg: JourneyCancelLeg } | { ok: false; error: string } {
  const requestedToken = input.requestedToken.trim();
  if (!requestedToken) {
    return { ok: false, error: "A specific tracking job token is required to cancel one leg." };
  }
  const job = input.job;
  if (!job?.token?.trim()) {
    return { ok: false, error: "Tracking job not found for that token." };
  }
  if (job.token.trim() !== requestedToken) {
    return { ok: false, error: "Tracking token does not match the loaded job." };
  }
  const bookingRef = input.booking.paymentReference.trim();
  const jobRef = job.paymentReference?.trim() || "";
  if (!bookingRef || !jobRef || jobRef !== bookingRef) {
    return {
      ok: false,
      error: "That tracking job does not belong to this payment. The other leg was not touched.",
    };
  }
  const resolvedLeg = resolveTrackingJobLeg(job, input.booking);
  if (!resolvedLeg) {
    return {
      ok: false,
      error: "Could not confirm whether this job is outbound or return. Refusing to cancel.",
    };
  }
  if (resolvedLeg !== input.cancelLeg) {
    return {
      ok: false,
      error: `Tracking job is the ${resolvedLeg} leg, not the ${input.cancelLeg} leg. Refusing to cancel.`,
    };
  }
  if (job.pairedToken?.trim() && job.pairedToken.trim() === job.token.trim()) {
    return { ok: false, error: "Paired token is invalid. Refusing to cancel." };
  }
  return { ok: true, job, resolvedLeg };
}

/** Whole-booking fan-out must stay unused for one-leg cancel. */
export function tokensSafeForSingleLegCancel(input: {
  cancelledToken: string;
  markedTokens: string[];
  pairedToken?: string;
}): { ok: true } | { ok: false; error: string } {
  const cancelled = input.cancelledToken.trim();
  const marked = [...new Set(input.markedTokens.map((token) => token.trim()).filter(Boolean))];
  if (marked.length !== 1 || marked[0] !== cancelled) {
    return {
      ok: false,
      error: "One-leg cancel would mark more than the requested tracking job.",
    };
  }
  const paired = input.pairedToken?.trim() || "";
  if (paired && marked.includes(paired)) {
    return { ok: false, error: "One-leg cancel would also mark the paired leg." };
  }
  return { ok: true };
}

export function otherCalendarEventIds(input: {
  calendarEventIds?: string[];
  calendarEventIdsByLeg?: CalendarEventIdsByLeg;
  keepEventId?: string | null;
}): string[] {
  const ids = new Set<string>();
  for (const id of input.calendarEventIds ?? []) {
    if (id.trim()) ids.add(id.trim());
  }
  const outbound = input.calendarEventIdsByLeg?.outbound?.trim();
  const inbound = input.calendarEventIdsByLeg?.return?.trim();
  if (outbound) ids.add(outbound);
  if (inbound) ids.add(inbound);
  const keep = input.keepEventId?.trim();
  if (keep) ids.delete(keep);
  return [...ids];
}

export function pickStoredCalendarEventIdForLeg(input: {
  cancelLeg: JourneyCancelLeg;
  jobCalendarEventId?: string;
  calendarEventIdsByLeg?: CalendarEventIdsByLeg;
}): { eventId: string | null; source: "job" | "by_leg" | "none" } {
  const fromJob = input.jobCalendarEventId?.trim() || "";
  const fromMap =
    (input.cancelLeg === "return"
      ? input.calendarEventIdsByLeg?.return
      : input.calendarEventIdsByLeg?.outbound)?.trim() || "";
  if (fromJob && fromMap && fromJob !== fromMap) {
    return { eventId: null, source: "none" };
  }
  if (fromJob) return { eventId: fromJob, source: "job" };
  if (fromMap) return { eventId: fromMap, source: "by_leg" };
  return { eventId: null, source: "none" };
}

export function calendarEventIdsByLegFromCreated(input: {
  returnJourney?: boolean;
  eventIds: string[];
}): CalendarEventIdsByLeg {
  const outbound = input.eventIds[0]?.trim();
  const inbound = input.eventIds[1]?.trim();
  if (!input.returnJourney) {
    return outbound ? { outbound } : {};
  }
  return {
    ...(outbound ? { outbound } : {}),
    ...(inbound ? { return: inbound } : {}),
  };
}

export function nextCancelledLegs(
  existing: JourneyCancelLeg[] | undefined,
  cancelLeg: JourneyCancelLeg,
): JourneyCancelLeg[] {
  const next = new Set(existing ?? []);
  next.add(cancelLeg);
  return [...next];
}

export function bothReturnLegsCancelled(
  cancelledLegs: JourneyCancelLeg[] | undefined,
  returnJourney?: boolean,
): boolean {
  if (!returnJourney) {
    return (cancelledLegs ?? []).includes("outbound");
  }
  return (
    (cancelledLegs ?? []).includes("outbound") && (cancelledLegs ?? []).includes("return")
  );
}

export function londonMinuteKey(value: string | undefined | null): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const local = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (local) return `${local[1]}T${local[2]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function calendarEventMatchesTrackingJob(
  eventStart: string | undefined,
  job: Pick<LegCancelTargetJob, "pickupAt" | "tripDate" | "tripTime">,
): boolean {
  const eventKey = londonMinuteKey(eventStart);
  const jobKey = londonMinuteKey(job.pickupAt) || londonMinuteKey(`${job.tripDate || ""}T${job.tripTime || ""}`);
  return Boolean(eventKey && jobKey && eventKey === jobKey);
}

/**
 * Duplicate-safe Google Calendar logging for bespoke (Event / Business Class) bookings.
 *
 * Problem: the standard insert lets Google choose the event id. If the Worker
 * crashes (or the response is lost) after Google created the event but before
 * we stored its id, a retry creates a SECOND event.
 *
 * Fix: we choose the event id ourselves, derived from the booking's payment
 * reference and journey leg. Google Calendar guarantees event ids are unique per
 * calendar and rejects a second insert with the same id (HTTP 409), so:
 *   1. look the id up first (exists → reuse it, create nothing);
 *   2. otherwise insert WITH that id;
 *   3. a 409 means it already exists (created by a lost earlier attempt) → reuse.
 * A retry can therefore never create a second event for the same booking leg.
 * If Google returns anything unexpected, nothing is guessed: the step reports
 * "uncertain" and the caller stops and flags the booking for owner review.
 *
 * The existing airport calendar path (logPaidBookingCalendar) is unchanged.
 */

import {
  buildTransferCalendarEvents,
  getCalendarEvent,
  getGoogleAccessToken,
  parseServiceAccountJson,
} from "./google-calendar";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { BUSINESS_NAME, BUSINESS_WEBSITE } from "../shared/business-email";

export type BespokeCalendarEnv = {
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

export type BespokeCalendarResult =
  | { status: "not_configured"; eventIds: [] }
  | { status: "logged"; eventIds: string[]; byLeg: { outbound?: string; return?: string }; reused: number }
  /** Google answered something we cannot interpret safely. Do NOT retry automatically. */
  | { status: "uncertain"; eventIds: string[]; error: string };

/** Google event ids: base32hex characters [a-v0-9], 5–1024 long. Hex digits qualify. */
export async function bespokeCalendarEventId(calendarId: string, paymentReference: string, leg: "outbound" | "return"): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bespoke|${calendarId}|${paymentReference}|${leg}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `bq${hex.slice(0, 40)}`;
}

export function calendarConfiguredFor(env: BespokeCalendarEnv): boolean {
  return Boolean(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim());
}

export async function logBespokeBookingCalendar(
  env: BespokeCalendarEnv,
  booking: PaidBookingDetails,
  amountPaid: string,
  paymentReference: string,
): Promise<BespokeCalendarResult> {
  if (!calendarConfiguredFor(env)) return { status: "not_configured", eventIds: [] };
  const calendarId = env.GOOGLE_CALENDAR_ID!.trim();
  const accessToken = await getGoogleAccessToken(parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!));
  const events = buildTransferCalendarEvents(
    {
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      mobileNumber: booking.mobileNumber,
      tripLabel: booking.tripLabel,
      pickupLabel: booking.pickupLabel,
      dropoffLabel: booking.dropoffLabel,
      returnJourney: booking.returnJourney,
      tripDate: booking.tripDate,
      tripTime: booking.tripTime,
      returnDate: booking.returnDate,
      returnTime: booking.returnTime,
      flightNumber: booking.flightNumber,
      passengers: booking.passengers,
      suitcases: booking.suitcases,
      vehicle: booking.vehicle,
      estimatedPrice: amountPaid,
      isAirportTrip: false,
      amountPaid,
      paymentReference,
      paid: true,
    },
    `Bespoke ${booking.tripLabel}${booking.bespokeQuoteReference ? ` — quotation ${booking.bespokeQuoteReference}` : ""}`,
  );

  const eventIds: string[] = [];
  const byLeg: { outbound?: string; return?: string } = {};
  let reused = 0;
  for (let i = 0; i < events.length; i++) {
    const leg: "outbound" | "return" = i === 0 ? "outbound" : "return";
    const id = await bespokeCalendarEventId(calendarId, paymentReference, leg);

    // 1. Already there (an earlier attempt created it)? Reuse, create nothing.
    let existing: Awaited<ReturnType<typeof getCalendarEvent>>;
    try {
      existing = await getCalendarEvent(accessToken, calendarId, id);
    } catch (error) {
      return { status: "uncertain", eventIds, error: `lookup failed: ${error instanceof Error ? error.message : "unknown"}` };
    }
    if (existing) {
      eventIds.push(id);
      byLeg[leg] = id;
      reused += 1;
      continue;
    }

    // 2. Insert with OUR id. Google rejects a second insert with the same id.
    const e = events[i];
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: { dateTime: `${e.startDateTime}:00`, timeZone: "Europe/London" },
        end: { dateTime: `${e.endDateTime}:00`, timeZone: "Europe/London" },
        source: { title: BUSINESS_NAME, url: BUSINESS_WEBSITE },
        colorId: "9",
      }),
    }).catch((error: unknown) => error);

    if (response instanceof Response && response.ok) {
      eventIds.push(id);
      byLeg[leg] = id;
      continue;
    }
    // 3. 409 = an event with this id already exists (lost response earlier) → reuse.
    if (response instanceof Response && response.status === 409) {
      eventIds.push(id);
      byLeg[leg] = id;
      reused += 1;
      continue;
    }
    // Network error or any other status: the insert MAY have happened. A later
    // retry is still safe (same id), but we stop here and let the caller decide.
    const detail =
      response instanceof Response
        ? `insert failed (${response.status})`
        : `insert error: ${response instanceof Error ? response.message : "unknown"}`;
    return { status: "uncertain", eventIds, error: detail };
  }
  return { status: "logged", eventIds, byLeg, reused };
}

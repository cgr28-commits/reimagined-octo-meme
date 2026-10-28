/**
 * Flight watch for airport collections (owner, Oct 2026):
 * - check the inbound flight every 30 minutes from 3 hours before the booked pickup
 *   until it lands (or 4 hours after the pickup time);
 * - tell the owner / assigned driver when it is delayed or early by 15+ minutes,
 *   moves by another 15+ minutes, lands, is cancelled or diverted;
 * - never change the booked pickup time — the new landing time is shown alongside it.
 */
import type { VerifiedFlight } from "./flight-lookup";
import { parseLondonLocalDateTime } from "./uk-time";

export const FLIGHT_WATCH_START_BEFORE_PICKUP_MS = 3 * 60 * 60 * 1000;
export const FLIGHT_WATCH_STOP_AFTER_PICKUP_MS = 4 * 60 * 60 * 1000;
export const FLIGHT_WATCH_INTERVAL_MS = 30 * 60 * 1000;
/** Smallest change worth an alert. */
export const FLIGHT_ALERT_THRESHOLD_MINUTES = 15;

export type FlightWatchAlertKind = "delayed" | "early" | "landed" | "cancelled" | "diverted";

export type FlightWatchState = {
  checkedAt: string;
  status?: string | null;
  expectedTime?: string | null;
  expectedUtc?: string | null;
  delayMinutes?: number | null;
  landed?: boolean;
  lastAlert?: { at: string; kind: FlightWatchAlertKind; delayMinutes?: number | null };
  lastError?: string;
};

export type FlightWatchJob = {
  isFromAirport?: boolean;
  isAirportTrip?: boolean;
  flightNumber?: string;
  airportCode?: string;
  tripDate: string;
  tripTime: string;
  journeyStatus?: string;
  flightWatch?: FlightWatchState;
};

export function flightWatchPickupMs(job: Pick<FlightWatchJob, "tripDate" | "tripTime">): number | null {
  return parseLondonLocalDateTime(job.tripDate, job.tripTime)?.getTime() ?? null;
}

/** Is this collection's flight due a check right now? */
export function isFlightCheckDue(job: FlightWatchJob, now: Date): boolean {
  if (!job.isFromAirport || !job.flightNumber?.trim() || !job.airportCode?.trim()) return false;
  if (job.journeyStatus === "completed" || job.journeyStatus === "en_route" || job.journeyStatus === "arrived_destination") {
    return false;
  }
  if (job.flightWatch?.landed) return false;
  const lastAlertKind = job.flightWatch?.lastAlert?.kind;
  if (lastAlertKind === "cancelled" || lastAlertKind === "diverted") return false;
  const pickup = flightWatchPickupMs(job);
  if (pickup == null) return false;
  const t = now.getTime();
  if (t < pickup - FLIGHT_WATCH_START_BEFORE_PICKUP_MS || t > pickup + FLIGHT_WATCH_STOP_AFTER_PICKUP_MS) return false;
  const checked = Date.parse(job.flightWatch?.checkedAt ?? "");
  return Number.isNaN(checked) || t - checked >= FLIGHT_WATCH_INTERVAL_MS - 60_000;
}

function isLanded(flight: VerifiedFlight): boolean {
  const status = String(flight.status ?? "").toLowerCase();
  return Boolean(flight.actualReported) || status === "arrived" || status === "landed";
}

/** What (if anything) is worth telling the driver after this check. */
export function decideFlightAlert(
  previous: FlightWatchState | undefined,
  flight: VerifiedFlight,
): FlightWatchAlertKind | null {
  const status = String(flight.status ?? "").toLowerCase();
  const last = previous?.lastAlert;
  if (status.includes("cancel")) return last?.kind === "cancelled" ? null : "cancelled";
  if (status.includes("divert")) return last?.kind === "diverted" ? null : "diverted";
  if (isLanded(flight)) return last?.kind === "landed" ? null : "landed";

  const delay = flight.delayMinutes;
  if (delay == null || Math.abs(delay) < FLIGHT_ALERT_THRESHOLD_MINUTES) {
    // Back on time after an alert is itself worth a note.
    if (delay != null && last && (last.kind === "delayed" || last.kind === "early") &&
        Math.abs((last.delayMinutes ?? 0) - delay) >= FLIGHT_ALERT_THRESHOLD_MINUTES) {
      return delay >= 0 ? "delayed" : "early";
    }
    return null;
  }
  const kind: FlightWatchAlertKind = delay > 0 ? "delayed" : "early";
  if (!last || (last.kind !== "delayed" && last.kind !== "early")) return kind;
  return Math.abs((last.delayMinutes ?? 0) - delay) >= FLIGHT_ALERT_THRESHOLD_MINUTES ? kind : null;
}

export function nextFlightWatchState(
  previous: FlightWatchState | undefined,
  flight: VerifiedFlight,
  alert: FlightWatchAlertKind | null,
  now: Date,
): FlightWatchState {
  return {
    checkedAt: now.toISOString(),
    status: flight.status ?? null,
    expectedTime: flight.expectedTime ?? null,
    expectedUtc: flight.expectedUtc ?? null,
    delayMinutes: flight.delayMinutes ?? null,
    landed: isLanded(flight),
    lastAlert: alert ? { at: now.toISOString(), kind: alert, delayMinutes: flight.delayMinutes ?? null } : previous?.lastAlert,
  };
}

function minutesLabel(minutes: number): string {
  const m = Math.abs(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "HH:MM" + minutes → "HH:MM" (wraps past midnight). */
function addMinutesToClock(clock: string, minutes: number): string {
  const m = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return clock;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function buildFlightAlertEmail(input: {
  kind: FlightWatchAlertKind;
  flight: VerifiedFlight;
  customerName?: string | null;
  bookingReference?: string | null;
  bookedPickupTime: string;
  airportName: string;
  driverName?: string | null;
}): { subject: string; body: string } {
  const { kind, flight } = input;
  const who = input.customerName?.trim() || "customer";
  const expected = flight.expectedTime || "unknown";
  const delay = flight.delayMinutes ?? 0;
  const headline =
    kind === "cancelled"
      ? `${flight.flightNumber} CANCELLED`
      : kind === "diverted"
        ? `${flight.flightNumber} DIVERTED`
        : kind === "landed"
          ? `${flight.flightNumber} landed ${expected}`
          : delay === 0
            ? `${flight.flightNumber} back on time (${expected})`
            : `${flight.flightNumber} ${kind === "delayed" ? "delayed" : "early"} ${minutesLabel(delay)} — now ${expected}`;
  const subject = `Flight update: ${headline} · ${who} ${input.bookedPickupTime}`;

  const action =
    kind === "cancelled"
      ? "The flight is showing as cancelled. Contact the customer to confirm their new arrangements before travelling."
      : kind === "diverted"
        ? "The flight is showing as diverted. Contact the customer before travelling to the airport."
        : kind === "landed"
          ? `Landed at ${expected}. The 60 minutes complimentary waiting runs until about ${addMinutesToClock(expected, 60)}.`
          : delay > 0
            ? `Plan to be at ${input.airportName} for about ${expected} rather than the booked ${input.bookedPickupTime}. The booking time has not been changed.`
            : delay < 0
              ? `The flight is running early. Plan to be at ${input.airportName} for about ${expected}. The booking time has not been changed.`
              : `Back on schedule — plan for the booked ${input.bookedPickupTime}.`;

  const lines = [
    headline,
    "",
    action,
    "",
    `Customer: ${who}`,
    input.bookingReference ? `Booking: ${input.bookingReference}` : "",
    `Booked pickup: ${input.bookedPickupTime} at ${input.airportName}`,
    `Flight: ${flight.flightNumber}${flight.airline ? ` (${flight.airline})` : ""} · ${flight.departureAirport} → ${flight.arrivalAirport}`,
    `Scheduled arrival: ${flight.scheduledTime}`,
    `Expected arrival: ${expected}${flight.status ? ` · status ${flight.status}` : ""}`,
    input.driverName ? `Driver: ${input.driverName}` : "",
    "",
    "Checked automatically every 30 minutes from 3 hours before pickup until the flight lands.",
  ].filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""));
  return { subject, body: lines.join("\n") };
}

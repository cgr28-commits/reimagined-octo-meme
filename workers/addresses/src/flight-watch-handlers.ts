/**
 * Cron: watch inbound flights for airport collections and email the owner and the
 * assigned driver when a flight is delayed / early (15+ min), lands, is cancelled or
 * diverted. Booked pickup times are never changed. See shared/flight-watch.ts.
 */
import { lookupFlight } from "../shared/flight-lookup";
import {
  buildFlightAlertEmail,
  decideFlightAlert,
  isFlightCheckDue,
  nextFlightWatchState,
} from "../shared/flight-watch";
import type { TrackingJobRecord } from "../shared/tracking";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import { isTrackingJobCancelled, listUpcomingTrackingJobs, saveTrackingJob, trackingStoreConfigured } from "./tracking-store";
import { trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";

type Env = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  AERODATABOX_RAPIDAPI_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  /** "false" stops automatic flight checks. */
  FLIGHT_WATCH_ENABLED?: string;
};

/** Caps flight-data usage per cron run (runs every 5 minutes). */
const MAX_LOOKUPS_PER_RUN = 6;

const AIRPORT_NAMES: Record<string, string> = {
  BFS: "Belfast International Airport",
  BHD: "George Best Belfast City Airport",
  DUB: "Dublin Airport",
  LDY: "City of Derry Airport",
};

export type FlightWatchRunResult = { due: number; checked: number; alerts: number; errors: number };

export async function processFlightWatch(env: Env, now: Date = new Date()): Promise<FlightWatchRunResult> {
  const result: FlightWatchRunResult = { due: 0, checked: 0, alerts: 0, errors: 0 };
  if (env.FLIGHT_WATCH_ENABLED?.trim().toLowerCase() === "false") return result;
  const apiKey = env.AERODATABOX_RAPIDAPI_KEY?.trim();
  const store = env.TRACKING_STORE;
  if (!apiKey || !store || !trackingStoreConfigured(store)) return result;

  // Today and tomorrow cover every pickup within the 3-hour window (incl. after midnight).
  const jobs = (await listUpcomingTrackingJobs(store, 1)).filter(
    (job) => !isTrackingJobCancelled(job) && isFlightCheckDue(job, now),
  );
  result.due = jobs.length;

  for (const job of jobs.slice(0, MAX_LOOKUPS_PER_RUN)) {
    try {
      await checkOne(env, store, apiKey, job, now, result);
    } catch (err) {
      result.errors += 1;
      console.error("Flight watch failed", job.token, err);
    }
  }
  return result;
}

async function checkOne(
  env: Env,
  store: KVNamespace,
  apiKey: string,
  job: TrackingJobRecord,
  now: Date,
  result: FlightWatchRunResult,
): Promise<void> {
  const airportCode = String(job.airportCode ?? "").toUpperCase();
  const airportName = AIRPORT_NAMES[airportCode] ?? airportCode;
  const lookup = await lookupFlight(apiKey, {
    flightNumber: job.flightNumber ?? "",
    tripDate: job.tripDate,
    airportCode,
    airportName,
    direction: "from-airport",
  });
  result.checked += 1;

  if (!lookup.ok) {
    // Record the attempt so the 30-minute spacing still applies.
    await saveTrackingJob(store, {
      ...job,
      flightWatch: { ...(job.flightWatch ?? {}), checkedAt: now.toISOString(), lastError: lookup.error },
    });
    if (lookup.code !== "not_found") result.errors += 1;
    return;
  }

  const alert = decideFlightAlert(job.flightWatch, lookup.flight);
  const next: TrackingJobRecord = {
    ...job,
    flightWatch: nextFlightWatchState(job.flightWatch, lookup.flight, alert, now),
  };
  await saveTrackingJob(store, next);
  if (!alert) return;

  const paid =
    job.paymentReference && paidBookingStoreConfigured(store)
      ? await getPaidBookingRecord(store, job.paymentReference).catch(() => null)
      : null;
  const email = buildFlightAlertEmail({
    kind: alert,
    flight: lookup.flight,
    customerName: job.customerName || paid?.customerName,
    bookingReference: paid?.customerReference || job.paymentReference,
    bookedPickupTime: job.tripTime,
    airportName,
    driverName: job.assignedDriverName,
  });

  const recipients = new Set<string>([env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk"]);
  const driverEmail = job.assignedDriverEmail?.trim();
  if (driverEmail) recipients.add(driverEmail);
  for (const to of recipients) {
    const sent = await trySendOwnerOperationalEmail(env, { to, subject: email.subject, body: email.body });
    if (sent.sent) result.alerts += 1;
    else result.errors += 1;
  }
}

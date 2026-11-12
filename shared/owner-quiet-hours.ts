/**
 * Owner quiet hours (asleep, can't answer short-notice requests): 22:00–07:00 UK time.
 *
 * - The owner's response window only counts awake time: a request sent at 23:00
 *   starts its window at 07:00; one sent at 21:00 gets an hour that evening and
 *   the rest from 07:00.
 * - The deadline is never later than 1 hour before pickup, and never falls
 *   inside quiet hours (it moves back to 22:00 that evening instead).
 * - A short-notice pickup is not bookable online if that leaves the owner less
 *   than 15 awake minutes to answer (e.g. a 06:30 pickup requested at 01:00).
 */
import { nowLondonTime, parseLondonLocalDateTime, todayLondonDate } from "./uk-time";
import {
  decideBookingApproval,
  decideBookingApprovalForTrip,
  nextApprovalClockStart,
} from "./approval-policy";

export const OWNER_QUIET_START_HOUR = 22;
export const OWNER_QUIET_END_HOUR = 7;
export const OWNER_RESPONSE_BEFORE_PICKUP_MS = 60 * 60 * 1000;
export const OWNER_MIN_RESPONSE_MS = 15 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

function londonHourMinute(at: Date): number {
  const [h, m] = nowLondonTime(at).split(":").map(Number);
  return h * 60 + m;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function londonAt(date: string, hour: number): Date {
  return parseLondonLocalDateTime(date, `${String(hour).padStart(2, "0")}:00`) as Date;
}

export function isOwnerQuietTime(at: Date): boolean {
  const minutes = londonHourMinute(at);
  return minutes >= OWNER_QUIET_START_HOUR * 60 || minutes < OWNER_QUIET_END_HOUR * 60;
}

/** `at` if the owner is awake, otherwise the next 07:00 UK time. */
export function nextOwnerAwakeAt(at: Date): Date {
  if (!isOwnerQuietTime(at)) return at;
  const today = todayLondonDate(at);
  const minutes = londonHourMinute(at);
  const date = minutes >= OWNER_QUIET_START_HOUR * 60 ? addDays(today, 1) : today;
  return londonAt(date, OWNER_QUIET_END_HOUR);
}

/** 22:00 UK time at the start of the quiet period containing `at` (which must be quiet). */
function quietPeriodStart(at: Date): Date {
  const today = todayLondonDate(at);
  const minutes = londonHourMinute(at);
  const date = minutes >= OWNER_QUIET_START_HOUR * 60 ? today : addDays(today, -1);
  return londonAt(date, OWNER_QUIET_START_HOUR);
}

/** Next 22:00 UK time after an awake moment. */
function nextQuietStart(at: Date): Date {
  return londonAt(todayLondonDate(at), OWNER_QUIET_START_HOUR);
}

/** Add `hours` of owner-awake time to `start`, skipping 22:00–07:00. */
export function addOwnerAwakeHours(start: Date, hours: number): Date {
  let cursor = nextOwnerAwakeAt(start);
  let remaining = Math.max(0, hours) * HOUR_MS;
  for (let i = 0; i < 30 && remaining > 0; i += 1) {
    const sleepAt = nextQuietStart(cursor);
    const awakeLeft = sleepAt.getTime() - cursor.getTime();
    if (remaining <= awakeLeft) return new Date(cursor.getTime() + remaining);
    remaining -= awakeLeft;
    cursor = nextOwnerAwakeAt(sleepAt);
  }
  return cursor;
}

/** Latest moment the owner can answer for this pickup (awake, ≥1h before pickup). */
export function latestOwnerAnswerFor(pickupAt: Date): Date {
  const latest = new Date(pickupAt.getTime() - OWNER_RESPONSE_BEFORE_PICKUP_MS);
  return isOwnerQuietTime(latest) ? quietPeriodStart(latest) : latest;
}

/**
 * True when an owner-approval request for this pickup could not be answered
 * before pickup under the 24/7 approval policy (shared/approval-policy.ts),
 * e.g. a 02:30 pickup requested at 01:00 (approval clock starts at 07:00).
 */
export function isPickupTooSoonForOwnerOvernight(
  tripDate: string,
  tripTime: string,
  now = new Date(),
): boolean {
  const decision = decideBookingApprovalForTrip(tripDate, tripTime, now, { forceManual: true });
  return decision.mode === "reject" && decision.reason === "deadline_after_pickup";
}

/** Earliest pickup the customer can book right now (UK time "HH:MM", plus whether it's tomorrow). */
export function earliestOvernightPickup(now = new Date()): { time: string; tomorrow: boolean } {
  // First quarter-hour pickup the approval policy can accept from `now`.
  const quarter = 15 * 60 * 1000;
  let candidate = Math.ceil(nextApprovalClockStart(now).getTime() / quarter) * quarter;
  for (let i = 0; i < 200; i += 1, candidate += quarter) {
    const pickupAt = new Date(candidate);
    const decision = decideBookingApproval({ pickupAt, submittedAt: now, forceManual: true });
    if (decision.mode === "manual") break;
  }
  const earliest = new Date(candidate);
  return {
    time: nowLondonTime(earliest),
    tomorrow: todayLondonDate(earliest) !== todayLondonDate(now),
  };
}

/** Customer wording — never mentions internal approval or overnight rules. */
export function overnightTooSoonHeading(): string {
  return "Please choose a later pickup time";
}

export function overnightTooSoonBody(now = new Date()): string {
  const { time, tomorrow } = earliestOvernightPickup(now);
  return (
    `We’re unable to take an online booking for this pickup time.\n\n` +
    `Please choose a pickup from ${time}${tomorrow ? " tomorrow" : ""} or later, or message us on WhatsApp @belfasttaxi.`
  );
}

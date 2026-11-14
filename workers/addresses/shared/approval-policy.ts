/**
 * 24/7 booking approval policy (Europe/London, GMT/BST aware).
 *
 * Daytime (07:00–23:00 UK time) submissions:
 *   12h+ before pickup  → automatic confirmation (normal Stripe flow)
 *   4–12h               → owner approval, 30-minute deadline
 *   2–4h                → owner approval, 15-minute deadline
 *   under 2h            → owner approval, 5-minute deadline
 *
 * Overnight (23:00–07:00 UK time) submissions:
 *   every booking needs owner approval (12h+ included, with a 30-minute window).
 *   The owner is asleep, so the approval clock starts at 07:00 — the request is
 *   never confirmed just because the night ended; it simply becomes answerable.
 *
 * Approval time is counted only while the owner is available (07:00–23:00): a
 * 30-minute window that starts at 22:50 has 10 minutes that evening and the
 * other 20 from 07:00.
 *
 * The deadline never goes past pickup. A request whose deadline would land
 * after pickup cannot be processed safely and is rejected up front.
 *
 * The tier is chosen from the time between submission and pickup, as the
 * customer sees it. Customers are never told any of these rules.
 */
import { nowLondonTime, parseLondonLocalDateTime, todayLondonDate } from "./uk-time";

export const OVERNIGHT_START_HOUR = 23;
export const OVERNIGHT_END_HOUR = 7;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** At or above this lead time a daytime booking confirms automatically. */
export const AUTO_CONFIRM_LEAD_MS = 12 * HOUR_MS;

export type ApprovalTier = "12h_plus" | "4_to_12h" | "2_to_4h" | "under_2h";

export const APPROVAL_WINDOW_MINUTES: Record<ApprovalTier, number> = {
  "12h_plus": 30,
  "4_to_12h": 30,
  "2_to_4h": 15,
  under_2h: 5,
};

export function approvalTierForLead(leadMs: number): ApprovalTier {
  if (leadMs >= AUTO_CONFIRM_LEAD_MS) return "12h_plus";
  if (leadMs >= 4 * HOUR_MS) return "4_to_12h";
  if (leadMs >= 2 * HOUR_MS) return "2_to_4h";
  return "under_2h";
}

function londonMinuteOfDay(at: Date): number {
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

/** 23:00–07:00 UK time. */
export function isOvernight(at: Date): boolean {
  const minutes = londonMinuteOfDay(at);
  return minutes >= OVERNIGHT_START_HOUR * 60 || minutes < OVERNIGHT_END_HOUR * 60;
}

/** `at` when the owner is available, otherwise the next 07:00 UK time. */
export function nextApprovalClockStart(at: Date): Date {
  if (!isOvernight(at)) return at;
  const today = todayLondonDate(at);
  const date = londonMinuteOfDay(at) >= OVERNIGHT_START_HOUR * 60 ? addDays(today, 1) : today;
  return londonAt(date, OVERNIGHT_END_HOUR);
}

/** Add `minutes` of available time (07:00–23:00) to `start`. */
export function addApprovalMinutes(start: Date, minutes: number): Date {
  let cursor = nextApprovalClockStart(start);
  let remaining = Math.max(0, minutes) * MINUTE_MS;
  for (let i = 0; i < 10 && remaining > 0; i += 1) {
    const nightAt = londonAt(todayLondonDate(cursor), OVERNIGHT_START_HOUR);
    const available = nightAt.getTime() - cursor.getTime();
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    cursor = nextApprovalClockStart(nightAt);
  }
  return cursor;
}

export type ApprovalDecision =
  | { mode: "auto"; leadMs: number }
  | {
      mode: "manual";
      tier: ApprovalTier;
      windowMinutes: number;
      overnight: boolean;
      leadMs: number;
      /** When the approval clock starts (07:00 for overnight submissions). */
      clockStartsAt: string;
      /** Authoritative approval deadline (ISO). Never after pickup. */
      deadlineAt: string;
    }
  | {
      mode: "reject";
      reason: "invalid_pickup" | "pickup_passed" | "deadline_after_pickup";
      leadMs: number;
    };

export function decideBookingApproval(input: {
  pickupAt: Date | null;
  submittedAt: Date;
  /** Keep a request manual even if recomputed later (e.g. at card authorisation). */
  forceManual?: boolean;
  /** Keep the tier chosen at submission when recomputing later. */
  tier?: ApprovalTier;
}): ApprovalDecision {
  const { pickupAt, submittedAt } = input;
  if (!pickupAt || Number.isNaN(pickupAt.getTime())) {
    return { mode: "reject", reason: "invalid_pickup", leadMs: 0 };
  }
  const leadMs = pickupAt.getTime() - submittedAt.getTime();
  if (leadMs <= 0) return { mode: "reject", reason: "pickup_passed", leadMs };
  const overnight = isOvernight(submittedAt);
  if (!overnight && !input.forceManual && leadMs >= AUTO_CONFIRM_LEAD_MS) {
    return { mode: "auto", leadMs };
  }
  const tier = input.tier ?? approvalTierForLead(leadMs);
  const windowMinutes = APPROVAL_WINDOW_MINUTES[tier];
  const clockStartsAt = nextApprovalClockStart(submittedAt);
  const deadline = addApprovalMinutes(submittedAt, windowMinutes);
  if (deadline.getTime() > pickupAt.getTime()) {
    return { mode: "reject", reason: "deadline_after_pickup", leadMs };
  }
  return {
    mode: "manual",
    tier,
    windowMinutes,
    overnight,
    leadMs,
    clockStartsAt: clockStartsAt.toISOString(),
    deadlineAt: deadline.toISOString(),
  };
}

export function decideBookingApprovalForTrip(
  tripDate: string,
  tripTime: string,
  submittedAt: Date,
  options: { forceManual?: boolean; tier?: ApprovalTier } = {},
): ApprovalDecision {
  return decideBookingApproval({
    pickupAt: parseLondonLocalDateTime(tripDate, tripTime),
    submittedAt,
    ...options,
  });
}

/** Customer-facing wording when a request can't be processed in time. No internal rules. */
export const APPROVAL_REJECT_CUSTOMER_MESSAGE =
  "We’re sorry — we can’t take an online booking for this pickup time. " +
  "Please choose a later pickup time or message us on WhatsApp @belfasttaxi.";

/**
 * "Expected demand for your date" on the quote screen (owner, 15 Nov 2026).
 *
 * A forecast from the calendar — Christmas/New Year, big events, Easter, bank holidays,
 * summer — and how soon the journey is. It never says a date is booked up (that only shows
 * when the owner has blocked the time).
 *
 * Booked levels are the exception (owner, 16 Nov 2026), shown at the owner's instruction that
 * they reflect his diary: Fri/Sat/Sun for the rest of November 2026 70% booked; 1–13 Dec 60%;
 * 14–31 Dec 80% (New Year's Eve 80%); New Year's Day 70%. Other dates stay "Expected demand".
 */
import { bookingSeasonFor, seasonalBookingMessage, type BookingSeason } from "./seasonal-booking-message";
import { matchWebsiteEventNotice, type WebsiteEventNotice } from "./website-event-notices";

export type DemandLevel = "very-high" | "high" | "soon" | "normal";

export const DEMAND_BAR_SEGMENTS = 5;

export type DemandIndicator = {
  level: DemandLevel;
  /** Filled bar segments out of DEMAND_BAR_SEGMENTS (0 = no bar). */
  filledSegments: number;
  /** "Very high" / "High" — null when no label is shown. */
  label: string | null;
  /** Owner-set booked level for the date (e.g. 60), shown as "60% booked"; null otherwise. */
  bookedPercent: number | null;
  body: string;
  event: WebsiteEventNotice | null;
  season: BookingSeason;
};

/** Journeys this many days away or fewer count as "travelling soon". */
export const SOON_WITHIN_DAYS = 3;

const VERY_HIGH_SEASONS: BookingSeason[] = ["christmas", "christmas-run-up", "between-christmas-new-year", "new-year"];
// Early December (1–13 Dec) shows "High" (owner, 16 Nov 2026).
const HIGH_SEASONS: BookingSeason[] = ["december", "easter", "bank-holiday", "summer"];

/** Owner-set booked levels (16 Nov 2026). */
export function bookedPercentFor(tripDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tripDate);
  if (!m) return null;
  const [year, month, day] = [+m[1], +m[2], +m[3]];
  if (month === 12) return day >= 14 ? 80 : 60; // New Year's Eve included in the 80%
  if (month === 1 && day === 1) return 70; // New Year's Day
  if (year === 2026 && month === 11) {
    const weekday = new Date(Date.UTC(year, 10, day)).getUTCDay();
    if (weekday === 5 || weekday === 6 || weekday === 0) return 70; // Fri, Sat, Sun
  }
  return null;
}

function londonToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function demandIndicatorFor(
  input: {
    tripDate: string;
    pickup?: string;
    dropoff?: string;
    returnDate?: string;
    /** Published venue matched by the quote form for this date. */
    highDemandVenue?: string;
    /** Short-notice / request bookings: never say "secure your driver". */
    needsApproval?: boolean;
  },
  now: Date = new Date(),
): DemandIndicator | null {
  const seasonal = seasonalBookingMessage(input.tripDate);
  if (!seasonal) return null;
  const season = bookingSeasonFor(input.tripDate);
  const event = matchWebsiteEventNotice(
    { pickup: input.pickup, dropoff: input.dropoff, dates: [input.tripDate, input.returnDate] },
    now,
  );

  const dateBody = input.highDemandVenue ? `High demand at ${input.highDemandVenue} on this date.` : seasonal.body;
  const bookedPercent = bookedPercentFor(input.tripDate);
  if (bookedPercent !== null) {
    const veryHigh = Boolean(event) || bookedPercent >= 80;
    return {
      level: veryHigh ? "very-high" : "high",
      filledSegments: Math.round((bookedPercent / 100) * DEMAND_BAR_SEGMENTS),
      label: `${bookedPercent}% booked`,
      bookedPercent,
      body: event
        ? `${event.title} makes this a very busy date. We recommend booking your airport, cruise or event transfer early to avoid disappointment.`
        : dateBody,
      event,
      season,
    };
  }

  if (event) {
    return {
      level: "very-high",
      filledSegments: 4,
      label: "Very high",
      bookedPercent: null,
      body: `${event.title} makes this a very busy date. We recommend booking your airport, cruise or event transfer early to avoid disappointment.`,
      event,
      season,
    };
  }
  if (VERY_HIGH_SEASONS.includes(season)) {
    return { level: "very-high", filledSegments: 4, label: "Very high", bookedPercent: null, body: dateBody, event: null, season };
  }
  if (input.highDemandVenue || HIGH_SEASONS.includes(season)) {
    return { level: "high", filledSegments: 3, label: "High", bookedPercent: null, body: dateBody, event: null, season };
  }
  const daysAway = daysBetween(londonToday(now), input.tripDate);
  if (daysAway >= 0 && daysAway <= SOON_WITHIN_DAYS) {
    return {
      level: "soon",
      filledSegments: 0,
      label: null,
      bookedPercent: null,
      body: input.needsApproval
        ? "Travelling soon? Send your request now and we'll confirm as quickly as we can."
        : "Travelling soon? Book now to secure your driver.",
      event: null,
      season,
    };
  }
  return { level: "normal", filledSegments: 0, label: null, bookedPercent: null, body: seasonal.body, event: null, season };
}

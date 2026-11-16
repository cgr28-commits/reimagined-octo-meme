/**
 * "Expected demand for your date" on the quote screen (owner, 15 Nov 2026).
 *
 * A forecast from the calendar — Christmas/New Year, big events, Easter, bank holidays,
 * summer — and how soon the journey is. It never says a date is booked up (that only shows
 * when the owner has blocked the time).
 *
 * December is the exception (owner, 16 Nov 2026): every December date shows how booked it
 * is — 60% booked on 1–13 Dec, 80% booked from 14 Dec — at the owner's instruction that this
 * reflects his diary. Outside December the bar stays labelled "Expected demand".
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
  /** December only: how booked the date is (60 or 80), shown as "60% booked". */
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

/** December booking level (owner, 16 Nov 2026): 60% on 1–13 Dec, 80% from 14 Dec. */
export function decemberBookedPercent(tripDate: string): number | null {
  if (!/^\d{4}-12-\d{2}$/.test(tripDate)) return null;
  return +tripDate.slice(8, 10) >= 14 ? 80 : 60;
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

  const bookedPercent = decemberBookedPercent(input.tripDate);
  if (bookedPercent !== null) {
    const veryHigh = Boolean(event) || bookedPercent >= 80;
    return {
      level: veryHigh ? "very-high" : "high",
      filledSegments: Math.round((bookedPercent / 100) * DEMAND_BAR_SEGMENTS),
      label: `${bookedPercent}% booked`,
      bookedPercent,
      body: event
        ? `${event.title} makes this a very busy date. We recommend booking your airport, cruise or event transfer early to avoid disappointment.`
        : seasonal.body,
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
    return { level: "very-high", filledSegments: 4, label: "Very high", bookedPercent: null, body: seasonal.body, event: null, season };
  }
  if (HIGH_SEASONS.includes(season)) {
    return { level: "high", filledSegments: 3, label: "High", bookedPercent: null, body: seasonal.body, event: null, season };
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

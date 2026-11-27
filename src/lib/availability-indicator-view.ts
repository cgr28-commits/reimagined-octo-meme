import type { DemandIndicator } from "../../shared/demand-indicator";

/**
 * Presentation rules for the quote-results availability indicator (owner, 27 Nov 2026).
 *
 * Honesty rules (owner decision, 27 Nov 2026 — "honest estimates"):
 * - No figure here comes from live bookings. `bookedPercent` is either a level the owner set from his
 *   diary (`estimated: false`) or a seasonal estimate (`estimated: true`, December 2026).
 * - Estimates are worded as expected demand and never as "booked".
 * - "Fully booked" wording is never produced: nothing in this calculation can know a date is full.
 *   (A genuinely full time is handled by the smart-availability block, not by this indicator.)
 * - Dates with no percentage get no bar and no invented number.
 */

export const AVAILABILITY_SEGMENTS = 10;

export type AvailabilityTone = "green" | "yellow" | "amber" | "red";

export type AvailabilityBand = {
  tone: AvailabilityTone;
  /** Status shown for a figure the owner set from his diary. */
  status: string;
  /** Same band worded as an expectation, for estimated figures. */
  estimatedStatus: string;
};

/** 0–39 green, 40–59 yellow, 60–79 amber, 80–100 red. */
export function availabilityBandFor(percent: number): AvailabilityBand {
  const p = Math.max(0, Math.min(100, percent));
  if (p >= 80) return { tone: "red", status: "Very limited availability", estimatedStatus: "Very limited availability expected" };
  if (p >= 60) return { tone: "amber", status: "Limited availability", estimatedStatus: "Limited availability expected" };
  if (p >= 40) return { tone: "yellow", status: "Bookings filling up", estimatedStatus: "Bookings expected to fill up" };
  return { tone: "green", status: "Good availability", estimatedStatus: "Good availability expected" };
}

/** Filled segments out of 10 (rounded; at least one for any non-zero figure). */
export function availabilitySegmentsFor(percent: number): number {
  const p = Math.max(0, Math.min(100, percent));
  if (p === 0) return 0;
  return Math.max(1, Math.round((p / 100) * AVAILABILITY_SEGMENTS));
}

export const AVAILABILITY_HEADING_FILLING = "Availability is filling up";
export const AVAILABILITY_HEADING_EXPECTED = "Expected demand for your date";
export const AVAILABILITY_BOOK_EARLY = "Book early to secure your preferred pickup time";
export const AVAILABILITY_FREE_CANCELLATION = "Free cancellation 24+ hours before pickup";

export type AvailabilityPalette = { accent: string; text: string; background: string; border: string; track: string };

export const AVAILABILITY_PALETTE: Record<AvailabilityTone, AvailabilityPalette> = {
  green: { accent: "#2FBF4A", text: "#0F6E3A", background: "#F3FBF5", border: "#CBEBD3", track: "#DCEFE1" },
  yellow: { accent: "#E3B505", text: "#765A00", background: "#FFFBE8", border: "#F0E3A2", track: "#F2EBC4" },
  amber: { accent: "#F08C00", text: "#8A4B00", background: "#FFF5E6", border: "#F4D49A", track: "#F5E3C2" },
  red: { accent: "#D93025", text: "#B3261E", background: "#FDF0EE", border: "#F2C2BC", track: "#F4D9D6" },
};

export type AvailabilityView = {
  /** "figure" = a percentage and 10-segment bar; "level" = no number (busy season/event); "none" = nothing to say beyond the date. */
  kind: "figure" | "level" | "none";
  tone: AvailabilityTone;
  heading: string | null;
  /** Show the trending-up icon beside the heading. */
  showTrendIcon: boolean;
  percent: number | null;
  filledSegments: number;
  /** e.g. "70% booked" or "80% expected demand". */
  percentLabel: string | null;
  status: string | null;
  estimated: boolean;
  /** "Book early…" — only when availability is limited (60%+ or a busy season/event). */
  bookEarly: boolean;
  /** Short non-scarcity line for journeys that are days away. */
  note: string | null;
};

export function availabilityViewFor(demand: DemandIndicator): AvailabilityView {
  if (demand.bookedPercent !== null) {
    const percent = Math.max(0, Math.min(100, Math.round(demand.bookedPercent)));
    const band = availabilityBandFor(percent);
    const estimated = demand.estimated;
    const filling = band.tone !== "green";
    return {
      kind: "figure",
      tone: band.tone,
      heading: estimated ? AVAILABILITY_HEADING_EXPECTED : filling ? AVAILABILITY_HEADING_FILLING : "Availability for your date",
      showTrendIcon: filling,
      percent,
      filledSegments: availabilitySegmentsFor(percent),
      percentLabel: estimated ? `${percent}% expected demand` : `${percent}% booked`,
      status: estimated ? band.estimatedStatus : band.status,
      estimated,
      bookEarly: band.tone === "amber" || band.tone === "red",
      note: null,
    };
  }
  if (demand.level === "very-high" || demand.level === "high") {
    const veryHigh = demand.level === "very-high";
    return {
      kind: "level",
      tone: veryHigh ? "red" : "amber",
      heading: AVAILABILITY_HEADING_EXPECTED,
      showTrendIcon: true,
      percent: null,
      filledSegments: 0,
      percentLabel: null,
      status: veryHigh ? "Very high demand expected" : "High demand expected",
      estimated: true,
      bookEarly: true,
      note: null,
    };
  }
  return {
    kind: "none",
    tone: "green",
    heading: null,
    showTrendIcon: false,
    percent: null,
    filledSegments: 0,
    percentLabel: null,
    status: null,
    estimated: false,
    bookEarly: false,
    note: demand.level === "soon" ? demand.body : null,
  };
}

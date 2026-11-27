import type { DemandIndicator } from "../../shared/demand-indicator";

/**
 * Presentation rules for the quote-results demand indicator (owner, 27 Nov 2026, final).
 *
 * Honesty rules:
 * - Nothing here is checked against live bookings. The internal figures in shared/demand-indicator.ts
 *   are a fixed calendar table (owner diary levels + a December 2026 weekday estimate). They only decide
 *   the demand LEVEL and colour; no number, percentage or "booked" wording is shown to customers.
 * - Wording is "expected demand" only. Never "booked", "fully booked", "sold out", counts or deadlines.
 * - Dates with no demand figure and no busy-season/event flag get no demand bar at all (nothing to say).
 */

export const AVAILABILITY_SEGMENTS = 10;

export type AvailabilityTone = "green" | "yellow" | "amber" | "red";

export type AvailabilityBand = {
  tone: AvailabilityTone;
  /** Customer-facing demand level. */
  status: string;
};

/** Internal figure → level: 0–39 green, 40–59 yellow, 60–79 amber, 80–100 red. */
export function availabilityBandFor(percent: number): AvailabilityBand {
  const p = Math.max(0, Math.min(100, percent));
  if (p >= 80) return { tone: "red", status: "Very high expected demand" };
  if (p >= 60) return { tone: "amber", status: "High expected demand" };
  if (p >= 40) return { tone: "yellow", status: "Moderate expected demand" };
  return { tone: "green", status: "Low expected demand" };
}

/** Filled segments out of 10 (rounded; at least one for any non-zero figure). Internal only. */
export function availabilitySegmentsFor(percent: number): number {
  const p = Math.max(0, Math.min(100, percent));
  if (p === 0) return 0;
  return Math.max(1, Math.round((p / 100) * AVAILABILITY_SEGMENTS));
}

export const AVAILABILITY_HEADING = "Expected demand for your date";
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
  /** "bar" = 10-segment indicator with a demand level; "none" = no demand claim, just date + reassurance. */
  kind: "bar" | "none";
  tone: AvailabilityTone;
  heading: string | null;
  /** Trending-up icon beside the heading (moderate demand and above). */
  showTrendIcon: boolean;
  filledSegments: number;
  /** Customer-facing level, e.g. "High expected demand". Never contains a number. */
  status: string | null;
  /** "Book early…" — only for high / very high expected demand. */
  bookEarly: boolean;
  /** Short non-scarcity line for journeys that are days away. */
  note: string | null;
};

export function availabilityViewFor(demand: DemandIndicator): AvailabilityView {
  if (demand.bookedPercent !== null) {
    const band = availabilityBandFor(demand.bookedPercent);
    return {
      kind: "bar",
      tone: band.tone,
      heading: AVAILABILITY_HEADING,
      showTrendIcon: band.tone !== "green",
      filledSegments: availabilitySegmentsFor(demand.bookedPercent),
      status: band.status,
      bookEarly: band.tone === "amber" || band.tone === "red",
      note: null,
    };
  }
  if (demand.level === "very-high" || demand.level === "high") {
    const veryHigh = demand.level === "very-high";
    const band = availabilityBandFor(veryHigh ? 90 : 70);
    return {
      kind: "bar",
      tone: band.tone,
      heading: AVAILABILITY_HEADING,
      showTrendIcon: true,
      filledSegments: veryHigh ? 9 : 7,
      status: band.status,
      bookEarly: true,
      note: null,
    };
  }
  return {
    kind: "none",
    tone: "green",
    heading: null,
    showTrendIcon: false,
    filledSegments: 0,
    status: null,
    bookEarly: false,
    note: demand.level === "soon" ? demand.body : null,
  };
}

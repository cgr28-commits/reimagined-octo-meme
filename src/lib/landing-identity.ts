import type { PlaceChipId } from "@/lib/quote-place-chips";

/**
 * Landing page identity (owner approved the prototype, 15 Nov 2026).
 * Per page: the hero background photo (laptops/tablets), whether the homepage's
 * rotating cards show, and a short caption under the page photo.
 * Pages not listed keep today's layout. The quote tool is never changed here.
 */
export type LandingIdentity = {
  /** Optimised hero basename shown behind the heading and quote tool (768px+). */
  heroBackground: { baseName: string; widths: readonly number[] };
  /** The homepage's rotating cards under the quote tool. Off on landing pages. */
  showRotatingCards: boolean;
  /** Two or three lines shown with the page photo. */
  photoCaption?: { title: string; text: string };
  /** Destination words shown in brand green in the H1 (and for ?from=airport). */
  headingHighlight?: { toAirport: string; fromAirport?: string };
  /** Short, factual points for the premium summary card (only what the page already states). */
  keyFacts?: readonly string[];
  /** One-tap place chips under the quote tool (cruise ports only, owner-approved). */
  placeChips?: readonly PlaceChipId[];
};

const LANDING_IDENTITY: Record<string, LandingIdentity> = {
  // Phase 1 prototype: Belfast to Dublin Airport.
  "belfast-to-dublin-airport": {
    heroBackground: { baseName: "dublin-airport", widths: [960, 1920] },
    showRotatingCards: false,
    headingHighlight: { toAirport: "Dublin Airport", fromAirport: "Belfast" },
    placeChips: ["belfast-cruise-terminal"],
    keyFacts: [
      "Around 2 hours, door to door",
      "Fixed price before you pay",
      "M1 tolls included",
      "Business Class available",
    ],
    photoCaption: {
      title: "Belfast to Dublin Airport, door to door",
      text: "One fixed price agreed before you travel, a pre-booked driver, and your flight tracked if you're coming back with us.",
    },
  },
  "dublin-airport-to-belfast": {
    heroBackground: { baseName: "belfast-city", widths: [960, 1920] },
    showRotatingCards: false,
    headingHighlight: { toAirport: "Belfast", fromAirport: "Belfast" },
    placeChips: ["belfast-cruise-terminal"],
    keyFacts: [
      "Met in Arrivals, T1 or T2",
      "Your flight tracked",
      "Up to 60 minutes' free waiting",
      "M1 tolls included",
    ],
    photoCaption: {
      title: "Dublin Airport to Belfast, met in Arrivals",
      text: "One fixed price agreed before you travel, your flight tracked, and your driver waiting when you land.",
    },
  },
};

export function getLandingIdentity(slug: string): LandingIdentity | null {
  return LANDING_IDENTITY[slug] ?? null;
}

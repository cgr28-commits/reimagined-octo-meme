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
};

const LANDING_IDENTITY: Record<string, LandingIdentity> = {
  // Phase 1 prototype: Belfast to Dublin Airport.
  "belfast-to-dublin-airport": {
    heroBackground: { baseName: "dublin-airport", widths: [960, 1920] },
    showRotatingCards: false,
    photoCaption: {
      title: "Belfast to Dublin Airport, door to door",
      text: "One fixed price agreed before you travel, a pre-booked driver, and your flight tracked if you're coming back with us.",
    },
  },
};

export function getLandingIdentity(slug: string): LandingIdentity | null {
  return LANDING_IDENTITY[slug] ?? null;
}

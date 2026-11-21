/**
 * Design 3 airport guide heroes (approval batch).
 * Concept photographs from public/preview-airport-images — treat as preliminary
 * until landmark / terminal accuracy is verified. Does not replace AIRPORT_HERO
 * production assets used for OG tags and transfer-route strips.
 */
export type AirportDesign3Hero = {
  /** Airport page slug under /airports/{slug}/ */
  slug: string;
  code: "BFS" | "BHD" | "DUB" | "LDY";
  heroBase: string;
  widths: readonly number[];
  alt: string;
};

export const AIRPORT_DESIGN3_HEROES = [
  {
    slug: "belfast-international",
    code: "BFS",
    heroBase: "d3-concept-belfast-international",
    widths: [640, 960, 1280] as const,
    alt: "Concept: Belfast International Airport at dusk (unverified)",
  },
  {
    slug: "belfast-city",
    code: "BHD",
    heroBase: "d3-concept-belfast-city",
    widths: [640, 960, 1280] as const,
    alt: "Concept: George Best Belfast City Airport at dusk (unverified)",
  },
  {
    slug: "dublin",
    code: "DUB",
    heroBase: "d3-concept-dublin-airport",
    widths: [640, 960, 1280] as const,
    alt: "Concept: Dublin Airport at dusk (unverified)",
  },
  {
    slug: "city-of-derry",
    code: "LDY",
    heroBase: "d3-airport-ai-city-of-derry",
    widths: [640, 960, 1280] as const,
    alt: "City of Derry Airport at sunset",
  },
] as const satisfies readonly AirportDesign3Hero[];

const bySlug = new Map<string, AirportDesign3Hero>(
  AIRPORT_DESIGN3_HEROES.map((entry) => [entry.slug, entry]),
);

export function getAirportDesign3Hero(slug: string): AirportDesign3Hero | undefined {
  return bySlug.get(slug);
}

/** Compact Design 3 photo URL for CSS --design3-hero-image. */
export function getAirportDesign3HeroImageUrl(slug: string): string | undefined {
  const entry = bySlug.get(slug);
  if (!entry) return undefined;
  return `/images/hero/optimized/${entry.heroBase}-960.webp`;
}

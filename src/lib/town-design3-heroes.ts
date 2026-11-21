/**
 * Design 3 town/city heroes — compact homepage-style photo treatment.
 * Only towns with committed optimized assets are listed here so production
 * never points at gitignored preview-pack files.
 */
export type TownDesign3Hero = {
  townSlug: string;
  /** Optimized basename under /images/hero/optimized/ */
  heroBase: string;
  widths: readonly number[];
  alt: string;
};

/** Towns with Design 3 compact heroes ready to ship. */
export const TOWN_DESIGN3_HEROES = [
  {
    townSlug: "newtownabbey",
    heroBase: "d3-concept-newtownabbey-belfast-lough",
    widths: [640, 960, 1280] as const,
    alt: "Belfast Lough toward Newtownabbey at dusk",
  },
  {
    townSlug: "carrickfergus",
    heroBase: "d3-concept-carrickfergus-castle",
    widths: [640, 960, 1280] as const,
    alt: "Carrickfergus Castle at sunset",
  },
  {
    townSlug: "bangor",
    heroBase: "d3-concept-bangor-harbour",
    widths: [640, 960, 1280] as const,
    alt: "Bangor harbour at sunset",
  },
] as const satisfies readonly TownDesign3Hero[];

const byTownSlug = new Map<string, TownDesign3Hero>(
  TOWN_DESIGN3_HEROES.map((entry) => [entry.townSlug, entry]),
);

export function getTownDesign3Hero(townSlug: string): TownDesign3Hero | undefined {
  return byTownSlug.get(townSlug);
}

export function townUsesDesign3Hero(townSlug: string): boolean {
  return byTownSlug.has(townSlug);
}

/** Compact Design 3 photo URL for CSS --design3-hero-image. */
export function getTownDesign3HeroImageUrl(townSlug: string): string | undefined {
  const entry = byTownSlug.get(townSlug);
  if (!entry) return undefined;
  return `/images/hero/optimized/${entry.heroBase}-960.webp`;
}

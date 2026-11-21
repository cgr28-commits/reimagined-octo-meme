/**
 * Design 3 Belfast Grand Central Station hero — compact homepage-style photo.
 * Owner-supplied dusk plaza photograph (21 Nov 2026). The body figure on the
 * page still uses the documented CC0 Grosvenor Road entrance photo + credit.
 */
export const GRAND_CENTRAL_DESIGN3_HERO = {
  heroBase: "d3-concept-belfast-grand-central",
  widths: [640, 960, 1280] as const,
  alt: "Belfast Grand Central Station plaza at dusk",
} as const;

/** Compact Design 3 photo URL for CSS --design3-hero-image. */
export function getGrandCentralDesign3HeroImageUrl(): string {
  return `/images/hero/optimized/${GRAND_CENTRAL_DESIGN3_HERO.heroBase}-960.webp`;
}

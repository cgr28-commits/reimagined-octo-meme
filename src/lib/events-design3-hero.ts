/**
 * Design 3 Events & Concerts hub hero — compact homepage-style photo treatment.
 * Source: owner-supplied Belfast sunset composite (O₂ / Titanic), cropped to the
 * landmark side so baked-in marketing copy is not shown in the CSS photo panel.
 */
export const EVENTS_DESIGN3_HERO = {
  heroBase: "d3-concept-belfast-events",
  widths: [640, 960, 1280] as const,
  previewFile: "belfast-events-sunset.jpg",
  alt: "O₂ Belfast and Titanic Belfast at sunset",
} as const;

/** Compact Design 3 photo URL for CSS --design3-hero-image. */
export function getEventsDesign3HeroImageUrl(): string {
  return `/images/hero/optimized/${EVENTS_DESIGN3_HERO.heroBase}-960.webp`;
}

import type { AirportHeroCode } from "./airport-hero";

/**
 * Design 3 hero photographs for the four /airports/* guide pages only (phones and tablets).
 * Files: /images/hero/optimized/{baseName}-phone|tablet.{avif,webp,jpg},
 * made by scripts/optimize-airport-page-heroes.mjs. Desktop keeps AIRPORT_HERO.
 */
export type AirportPageHero = {
  baseName: string;
  /** Short label on the phone banner. */
  badge: string;
};

export const AIRPORT_PAGE_HERO = {
  BFS: { baseName: "airport-page-bfs", badge: "BFS · Belfast International" },
  BHD: { baseName: "airport-page-bhd", badge: "BHD · Belfast City" },
  DUB: { baseName: "airport-page-dub", badge: "DUB · Dublin Airport" },
  LDY: { baseName: "airport-page-ldy", badge: "LDY · City of Derry" },
} as const satisfies Record<AirportHeroCode, AirportPageHero>;

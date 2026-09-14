/**
 * Central local-destination hero imagery.
 * Town hubs use these photographs when a genuine local image exists.
 * Airport guide and transfer pages must keep AIRPORT_HERO from airport-hero.ts.
 */
export type DestinationHeroAsset = {
  /** Optimized basename: /images/hero/optimized/{heroBase}-{width}.{ext} */
  heroBase: string;
  /** Original filename without extension */
  sourceBasename: string;
  sourceDir: "hero" | "tours";
  alt: string;
};

/**
 * Only destinations that already have a legitimate, recognisable photograph.
 * Do not add a town here just to fill a gap.
 */
export const DESTINATION_HERO = {
  belfast: {
    heroBase: "titanic-belfast",
    sourceBasename: "titanic-belfast",
    sourceDir: "hero",
    alt: "Titanic Belfast",
  },
} as const satisfies Record<string, DestinationHeroAsset>;

export type DestinationHeroSlug = keyof typeof DESTINATION_HERO;

/** Town hubs and destination pages that still need a genuine local photograph. */
export const MISSING_DESTINATION_HEROES = [
  { slug: "carrickfergus", needed: "Carrickfergus Castle" },
  { slug: "bangor", needed: "Bangor Marina or Bangor seafront" },
  { slug: "holywood", needed: "Holywood or Belfast Lough local scene" },
  { slug: "antrim", needed: "Antrim town or Lough Neagh local scene" },
  { slug: "ballymena", needed: "Recognisable Ballymena town or local scene" },
  { slug: "larne", needed: "Larne harbour or Larne coast" },
  { slug: "newry", needed: "Newry city, canal, or a clearly Newry local scene" },
  { slug: "lisburn", needed: "Recognisable Lisburn local scene" },
  { slug: "ballyclare", needed: "Recognisable Ballyclare local scene" },
  { slug: "newtownabbey", needed: "Newtownabbey, Shore Road, or Belfast Lough local scene" },
] as const;

export function getDestinationHero(slug: string): DestinationHeroAsset | undefined {
  return DESTINATION_HERO[slug as DestinationHeroSlug];
}

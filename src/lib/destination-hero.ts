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
 * Only destinations that have a legitimate, recognisable photograph.
 * Do not add a town here just to fill a gap.
 */
export const DESTINATION_HERO = {
  belfast: {
    heroBase: "titanic-belfast",
    sourceBasename: "titanic-belfast",
    sourceDir: "hero",
    alt: "Titanic Belfast",
  },
  carrickfergus: {
    heroBase: "carrickfergus-castle",
    sourceBasename: "carrickfergus-castle",
    sourceDir: "hero",
    alt: "Carrickfergus Castle on Belfast Lough",
  },
  bangor: {
    heroBase: "bangor-harbour",
    sourceBasename: "bangor-harbour",
    sourceDir: "hero",
    alt: "Bangor harbour from the North Pier",
  },
  holywood: {
    heroBase: "holywood-old-pier",
    sourceBasename: "holywood-old-pier",
    sourceDir: "hero",
    alt: "Belfast Lough at sunset from Holywood Old Pier",
  },
  antrim: {
    heroBase: "antrim-castle-gardens",
    sourceBasename: "antrim-castle-gardens",
    sourceDir: "hero",
    alt: "Deerpark Bridge in Antrim Castle Gardens",
  },
  larne: {
    heroBase: "larne-chaine-monument",
    sourceBasename: "larne-chaine-monument",
    sourceDir: "hero",
    alt: "Chaine Memorial Tower on the Larne coast",
  },
  newry: {
    heroBase: "newry-town-hall",
    sourceBasename: "newry-town-hall",
    sourceDir: "hero",
    alt: "Newry Town Hall beside the canal",
  },
  lisburn: {
    heroBase: "lisburn-linen-centre",
    sourceBasename: "lisburn-linen-centre",
    sourceDir: "hero",
    alt: "Irish Linen Centre and Lisburn Museum",
  },
  ballyclare: {
    heroBase: "ballyclare-town-hall",
    sourceBasename: "ballyclare-town-hall",
    sourceDir: "hero",
    alt: "Ballyclare Town Hall",
  },
  newtownabbey: {
    heroBase: "newtownabbey-belfast-lough",
    sourceBasename: "newtownabbey-belfast-lough",
    sourceDir: "hero",
    alt: "Belfast Lough from Cave Hill, looking towards the Newtownabbey shoreline",
  },
} as const satisfies Record<string, DestinationHeroAsset>;

export type DestinationHeroSlug = keyof typeof DESTINATION_HERO;

/** Town hubs that still need a genuine local photograph. */
export const MISSING_DESTINATION_HEROES = [
  { slug: "ballymena", needed: "Recognisable Ballymena town or local scene" },
] as const;

export function getDestinationHero(slug: string): DestinationHeroAsset | undefined {
  return DESTINATION_HERO[slug as DestinationHeroSlug];
}

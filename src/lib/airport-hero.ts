/**
 * Central airport hero imagery.
 * Airport guide pages and town→airport transfer pages must use these bases.
 * Town hubs and tour pages keep their own local/attraction photographs.
 */
export type AirportHeroCode = "BFS" | "BHD" | "DUB" | "LDY";

export type AirportHeroAsset = {
  /** Optimized basename: /images/hero/optimized/{heroBase}-{width}.{ext} */
  heroBase: string;
  /** Existing original under /images/hero/{sourceBasename}.jpg */
  sourceBasename: string;
  alt: string;
};

export const AIRPORT_HERO = {
  BFS: {
    heroBase: "belfast-international",
    sourceBasename: "belfast-international-arrivals-2025",
    alt: "Belfast International Airport terminal",
  },
  BHD: {
    heroBase: "belfast-city",
    sourceBasename: "belfast-city",
    alt: "George Best Belfast City Airport terminal",
  },
  DUB: {
    heroBase: "dublin-airport",
    sourceBasename: "dublin",
    alt: "Dublin Airport terminal",
  },
  LDY: {
    heroBase: "derry-airport",
    sourceBasename: "derry-airport",
    alt: "City of Derry Airport terminal",
  },
} as const satisfies Record<AirportHeroCode, AirportHeroAsset>;

export const LANDMARK_HERO_BASES = [
  "antrim-coast",
  "giants-causeway",
  "titanic-belfast",
  "harland-wolff-cranes",
  "dublin-beckett-bridge",
  "dublin-custom-house",
  "derry-guildhall",
  "derry-st-columbs",
  "mourne-mountains",
  "carrickfergus-castle",
  "bangor-harbour",
  "holywood-old-pier",
  "antrim-castle-gardens",
  "larne-chaine-monument",
  "newry-town-hall",
  "lisburn-linen-centre",
  "ballyclare-town-hall",
  "newtownabbey-belfast-lough",
] as const;

export function getAirportHero(code: AirportHeroCode): AirportHeroAsset {
  return AIRPORT_HERO[code];
}

export function isLandmarkHeroBase(base: string): boolean {
  return (LANDMARK_HERO_BASES as readonly string[]).includes(base);
}

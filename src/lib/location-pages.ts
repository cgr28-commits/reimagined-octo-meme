import { ALL_AIRPORTS, SERVICE_FLAGS } from "@/lib/data";
import { TOWN_HUB_CONTENT } from "@/lib/town-hubs-content";
import { TRANSFER_ROUTE_CONTENT } from "@/lib/transfer-routes-content";

export type AirportPage = {
  slug: string;
  code: "BFS" | "BHD" | "DUB" | "LDY";
  name: string;
  shortName: string;
  title: string;
  metaDescription: string;
  intro: string;
  highlights: string[];
  localTips: string[];
  fromPriceLabel: string;
  durationNote: string;
  /** Basename under /images/hero/optimized/{base}-{width}.{ext} */
  heroBase: string;
  heroAlt: string;
  areaServed: string[];
};

export type TownArea = {
  slug: string;
  name: string;
  /** Used as address hint in the quote tool */
  addressHint: string;
  blurb: string;
};

export type TransferRoutePage = {
  slug: string;
  legacySlugs?: string[];
  town: TownArea;
  airport: AirportPage;
  hubSlug: string | null;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  journeyInfo?: string;
  goingToAirport?: string;
  fromAirport?: string;
  whyBookIntro?: string;
  localAreasText?: string;
  faqs?: Array<{ question: string; answer: string }>;
  journeyNotes: string[];
};

export type TownHubPage = {
  slug: string;
  town: TownArea;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  areas: string[];
  localNotes: string[];
  airportCodes: AirportPage["code"][];
  heroBase: string;
  heroAlt: string;
};

const AIRPORT_PAGES_ALL: AirportPage[] = [
  {
    slug: "belfast-international",
    code: "BFS",
    name: "Belfast International Airport",
    shortName: "Belfast International",
    title: "Belfast International Transfers",
    metaDescription:
      "Pre-book fixed-price Belfast International (BFS) transfers, with flight monitoring and up to 60 minutes’ complimentary waiting on airport pickups.",
    intro:
      "Belfast International (Aldergrove) is Northern Ireland’s main long-haul and holiday airport. We provide door-to-door private transfers across Greater Belfast and beyond. We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include up to 60 minutes complimentary waiting time.",
    highlights: [
      "Fixed online prices for 1–4 passengers",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Meet & greet can be requested during booking where available",
      "Book online 24/7, including early-morning and late-night transfers",
    ],
    localTips: [
      "For departures, allow extra time for the M2/M22 corridor in peak morning traffic — we’ll quote a pickup time that suits your flight.",
      "Arrivals pickups use the airport’s designated private-hire meeting points; share your flight number so we can track landing time.",
      "Spacious private transfers are ideal for family holidays with multiple large suitcases from BFS.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 30 minutes from Belfast city centre in normal traffic",
    heroBase: "antrim-coast",
    heroAlt: "Coastal Northern Ireland near Belfast International Airport routes",
    areaServed: [
      "Belfast",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Lisburn",
      "Bangor",
      "Antrim",
      "Northern Ireland",
    ],
  },
  {
    slug: "belfast-city",
    code: "BHD",
    name: "George Best Belfast City Airport",
    shortName: "Belfast City Airport",
    title: "Belfast City Airport Transfers",
    metaDescription:
      "Pre-book fixed-price Belfast City Airport (BHD) transfers, with flight monitoring and up to 60 minutes’ complimentary waiting on airport pickups.",
    intro:
      "George Best Belfast City Airport sits close to the Titanic Quarter and city centre — ideal for short-haul and business travel. Our drivers know the Sydenham Bypass and airport approach roads for punctual drop-offs and collections.",
    highlights: [
      "Short transfer times from Belfast city centre, Holywood, and Bangor",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Meet & greet can be requested during booking where available",
      "Licensed private hire with clear fixed pricing",
    ],
    localTips: [
      "City Airport security queues are usually shorter than Aldergrove, but still allow buffer for morning business flights.",
      "Hotel pickups in the Titanic Quarter and Cathedral Quarter are a frequent route for us.",
      "If you have a connecting flight from BHD, tell us your departure time and we’ll plan the drop-off window carefully.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 15 minutes from Belfast city centre in normal traffic",
    heroBase: "titanic-belfast",
    heroAlt: "Titanic Belfast near George Best Belfast City Airport",
    areaServed: [
      "Belfast",
      "Holywood",
      "Bangor",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Lisburn",
      "Northern Ireland",
    ],
  },
  {
    slug: "dublin",
    code: "DUB",
    name: "Dublin Airport",
    shortName: "Dublin Airport",
    title: "Dublin Airport Transfers from NI",
    metaDescription:
      "Pre-book fixed-price transfers from Northern Ireland to Dublin Airport (DUB), with flight monitoring, included tolls and secure online booking.",
    intro:
      "Dublin Airport is a major gateway for Northern Ireland travellers. We run comfortable cross-border transfers with drivers who know the A1/M1 corridor, border timing, and terminal pickup arrangements. We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals.",
    highlights: [
      "Fixed prices for NI ↔ Dublin Airport journeys",
      "Applicable tolls included on Dublin Airport fares",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Return bookings available with a 5% discount online",
    ],
    localTips: [
      "Cross-border journeys take around two hours from Belfast depending on traffic and checks — we build a realistic schedule around your flight.",
      "For early Dublin departures, overnight or very early pickups from Bangor, Belfast, and Lisburn are common.",
      "Tell us which Dublin terminal you need when known; we’ll confirm the pickup point for arrivals.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 2 hours from Belfast in normal traffic",
    heroBase: "dublin-beckett-bridge",
    heroAlt: "Dublin Beckett Bridge for Dublin Airport transfer routes",
    areaServed: [
      "Belfast",
      "Lisburn",
      "Bangor",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Northern Ireland",
      "Dublin Airport",
    ],
  },
  {
    slug: "city-of-derry",
    code: "LDY",
    name: "City of Derry Airport",
    shortName: "City of Derry Airport",
    title: "City of Derry Airport Transfers",
    metaDescription:
      "Pre-book fixed-price City of Derry Airport (LDY) transfers, with flight monitoring and up to 60 minutes’ complimentary waiting on airport pickups.",
    intro:
      "City of Derry Airport (Eglinton) connects the north-west with UK routes. We specialise in transfers between LDY and the greater Belfast area — not short local Derry city hops — so Bangor, Belfast, and Lisburn travellers can travel with one clear booked price.",
    highlights: [
      "Belfast-area ↔ Derry Airport focus (Bangor, Belfast, Lisburn and surrounds)",
      "Flight monitoring with up to 60 minutes complimentary waiting on airport pickups",
      "Guide pricing shown online with confirmation before payment",
      "Meet & greet can be requested during booking where available",
    ],
    localTips: [
      "Pickup must be in the greater Belfast area for journeys to LDY — enter a Bangor, Belfast, or Lisburn-area address in the quote tool.",
      "For arrivals at LDY heading to Belfast/Bangor, share your flight number so we can adjust for delays.",
      "These are longer inter-city runs; return bookings are popular for weekend trips.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Belfast area ↔ Derry Airport (longer inter-city transfer)",
    heroBase: "derry-guildhall",
    heroAlt: "Derry Guildhall for City of Derry Airport transfer routes",
    areaServed: ["Belfast", "Bangor", "Lisburn", "Newtownabbey", "City of Derry Airport"],
  },
];

const BELFAST_TOWN: TownArea = {
  slug: "belfast",
  name: "Belfast",
  addressHint: "Belfast",
  blurb:
    "From city-centre hotels and business districts to south Belfast and the Titanic Quarter, we cover Belfast pickups for every major airport.",
};

export const TOWN_AREAS: TownArea[] = [
  BELFAST_TOWN,
  ...TOWN_HUB_CONTENT.map((hub) => ({
    slug: hub.townSlug,
    name: hub.name,
    addressHint: hub.addressHint,
    blurb: hub.blurb,
  })),
];

function airportPagesPublic(): AirportPage[] {
  return AIRPORT_PAGES_ALL.filter(
    (page) => SERVICE_FLAGS.belfastCityAirport || page.code !== "BHD",
  );
}

export const AIRPORT_PAGES = airportPagesPublic();

function buildRouteNotes(town: TownArea, airport: AirportPage): string[] {
  if (airport.code === "BFS") {
    return [
      `${town.name} to Belfast International typically uses the M2/M22 corridor — we time pickups around your check-in window.`,
      `Private transfers from ${town.name} suit family holidays with multiple suitcases.`,
      "Share your flight number for arrivals so waiting time starts from the actual landing.",
    ];
  }
  if (airport.code === "BHD") {
    return [
      `${town.name} to Belfast City Airport is a shorter coastal/city run — ideal for short-haul and business flights.`,
      "We recommend confirming your terminal and departure time when you book.",
      "Meet & greet can be requested during booking where available if you are arriving and need help with luggage.",
    ];
  }
  if (airport.code === "DUB") {
    return [
      `${town.name} to Dublin Airport is a cross-border journey — expect around two hours depending on traffic.`,
      "Early-morning Dublin departures from North Down and Greater Belfast are a core part of our diary.",
      "Return transfers can be booked together online with a 5% return discount.",
    ];
  }
  return [
    `${town.name} sits in our LDY service area for Belfast-side pickups to City of Derry Airport.`,
    "Enter your full street address so we can confirm you are within the greater Belfast coverage zone.",
    "Flight monitoring is available for LDY arrivals heading back to the Belfast area — airport pickups include up to 60 minutes complimentary waiting time.",
  ];
}

function townBySlug(slug: string): TownArea | undefined {
  return TOWN_AREAS.find((town) => town.slug === slug);
}

function airportByCode(code: AirportPage["code"]): AirportPage | undefined {
  return AIRPORT_PAGES.find((airport) => airport.code === code);
}

export function getTownHubPages(): TownHubPage[] {
  return TOWN_HUB_CONTENT.map((hub) => ({
    slug: hub.hubSlug,
    town: {
      slug: hub.townSlug,
      name: hub.name,
      addressHint: hub.addressHint,
      blurb: hub.blurb,
    },
    title: hub.title,
    h1: hub.h1,
    metaDescription: hub.metaDescription,
    intro: hub.intro,
    areas: hub.areas,
    localNotes: hub.localNotes,
    airportCodes: hub.airportCodes.filter((code) =>
      AIRPORT_PAGES.some((airport) => airport.code === code),
    ),
    heroBase: hub.heroBase,
    heroAlt: hub.heroAlt,
  }));
}

export const TOWN_HUB_PAGES = getTownHubPages();

function leftoverTransferSlug(town: TownArea, airport: AirportPage): string {
  if (airport.code === "DUB" && town.slug === "belfast") {
    return "belfast-to-dublin";
  }
  return `${town.slug}-to-${airport.slug}`;
}

function buildLegacyRoute(town: TownArea, airport: AirportPage): TransferRoutePage {
  return {
    slug: leftoverTransferSlug(town, airport),
    town,
    airport,
    hubSlug: TOWN_HUB_PAGES.find((hub) => hub.town.slug === town.slug)?.slug ?? null,
    title: `${town.name} to ${airport.shortName} Taxi`,
    h1: `${town.name} to ${airport.shortName} Taxi`,
    metaDescription: `Pre-book a fixed-price taxi from ${town.name} to ${airport.name}, with flight monitoring and secure online booking.`,
    intro: `${town.blurb} This page is for ${town.name} ↔ ${airport.shortName} transfers — get a live quote with the airport already selected.`,
    journeyNotes: buildRouteNotes(town, airport),
  };
}

export function getTransferRoutePages(): TransferRoutePage[] {
  const routes: TransferRoutePage[] = [];
  const seen = new Set<string>();

  for (const content of TRANSFER_ROUTE_CONTENT) {
    const town = townBySlug(content.townSlug);
    const airport = airportByCode(content.airportCode);
    if (!town || !airport) continue;
    const hubSlug = TOWN_HUB_PAGES.find((hub) => hub.town.slug === town.slug)?.slug ?? null;
    routes.push({
      slug: content.slug,
      legacySlugs: content.legacySlugs,
      town,
      airport,
      hubSlug,
      title: content.title,
      h1: content.h1,
      metaDescription: content.metaDescription,
      intro: content.intro,
      journeyInfo: content.journeyInfo,
      goingToAirport: content.goingToAirport,
      fromAirport: content.fromAirport,
      whyBookIntro: content.whyBookIntro,
      localAreasText: content.localAreasText,
      faqs: content.faqs,
      journeyNotes: [
        content.journeyInfo,
        content.goingToAirport,
        content.fromAirport,
        content.localAreasText,
      ],
    });
    seen.add(content.slug);
    for (const legacy of content.legacySlugs ?? []) {
      seen.add(legacy);
    }
  }

  // Keep existing Belfast catalogue pages and LDY pages for the original towns.
  const leftoverTowns = TOWN_AREAS.filter((town) => town.slug === "belfast");
  const ldyTowns = TOWN_AREAS.filter((town) =>
    ["belfast", "newtownabbey", "lisburn", "bangor"].includes(town.slug),
  );

  for (const town of leftoverTowns) {
    for (const airport of AIRPORT_PAGES) {
      const slug = leftoverTransferSlug(town, airport);
      if (seen.has(slug)) continue;
      routes.push(buildLegacyRoute(town, airport));
      seen.add(slug);
    }
  }

  const ldy = AIRPORT_PAGES.find((airport) => airport.code === "LDY");
  if (ldy) {
    for (const town of ldyTowns) {
      if (town.slug === "belfast") continue;
      const slug = `${town.slug}-to-${ldy.slug}`;
      if (seen.has(slug)) continue;
      routes.push(buildLegacyRoute(town, ldy));
      seen.add(slug);
    }
  }

  return routes;
}

export const TRANSFER_ROUTE_PAGES = getTransferRoutePages();

export function getAirportPage(slug: string): AirportPage | undefined {
  return AIRPORT_PAGES.find((page) => page.slug === slug);
}

export function getTownHubPage(slug: string): TownHubPage | undefined {
  return TOWN_HUB_PAGES.find((page) => page.slug === slug);
}

export function getTownHubByTownSlug(townSlug: string): TownHubPage | undefined {
  return TOWN_HUB_PAGES.find((page) => page.town.slug === townSlug);
}

export function getTownHubByAreaName(name: string): TownHubPage | undefined {
  return TOWN_HUB_PAGES.find((page) => page.town.name === name);
}

export function getTransferRoutePage(slug: string): TransferRoutePage | undefined {
  return TRANSFER_ROUTE_PAGES.find(
    (page) => page.slug === slug || page.legacySlugs?.includes(slug),
  );
}

export function getTransferStaticSlugs(): string[] {
  const slugs = new Set<string>();
  for (const page of TRANSFER_ROUTE_PAGES) {
    slugs.add(page.slug);
    for (const legacy of page.legacySlugs ?? []) {
      slugs.add(legacy);
    }
  }
  return [...slugs];
}

export function getRoutesForTown(townSlug: string): TransferRoutePage[] {
  return TRANSFER_ROUTE_PAGES.filter((route) => route.town.slug === townSlug && route.faqs);
}

export function getCanonicalTransferSlugs(): string[] {
  return TRANSFER_ROUTE_PAGES.map((page) => page.slug);
}

/** Short CTA for airport cards/pages — not a marketing fare. */
export function airportFromPrice(code: string): string {
  return ALL_AIRPORTS.find((airport) => airport.code === code)?.distance ?? "Get a fixed quote";
}

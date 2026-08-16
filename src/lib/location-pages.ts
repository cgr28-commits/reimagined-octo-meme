import { ALL_AIRPORTS, SERVICE_FLAGS } from "@/lib/data";

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
  town: TownArea;
  airport: AirportPage;
  title: string;
  metaDescription: string;
  intro: string;
  journeyNotes: string[];
};

const AIRPORT_PAGES_ALL: AirportPage[] = [
  {
    slug: "belfast-international",
    code: "BFS",
    name: "Belfast International Airport",
    shortName: "Belfast International",
    title: "Belfast International Airport Transfers",
    metaDescription:
      "Private taxi transfers to and from Belfast International Airport (BFS / Aldergrove). Fixed prices, flight monitoring, meet & greet on request, and up to 60 minutes complimentary waiting time on airport pickups.",
    intro:
      "Belfast International (Aldergrove) is Northern Ireland’s main long-haul and holiday airport. We provide door-to-door private transfers across Greater Belfast and beyond. We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include up to 60 minutes complimentary waiting time.",
    highlights: [
      "Fixed online prices for 1–4 passengers",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Meet & greet can be requested during booking where available",
      "24/7 coverage including early-morning charters and late arrivals",
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
    areaServed: ["Belfast", "Newtownabbey", "Lisburn", "Bangor", "Antrim", "Northern Ireland"],
  },
  {
    slug: "belfast-city",
    code: "BHD",
    name: "George Best Belfast City Airport",
    shortName: "Belfast City Airport",
    title: "Belfast City Airport Transfers",
    metaDescription:
      "Quick private transfers to and from George Best Belfast City Airport (BHD). Ideal for business trips and short-haul flights with flight monitoring, meet & greet on request, and up to 60 minutes complimentary waiting on airport pickups.",
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
    areaServed: ["Belfast", "Holywood", "Bangor", "Newtownabbey", "Northern Ireland"],
  },
  {
    slug: "dublin",
    code: "DUB",
    name: "Dublin Airport",
    shortName: "Dublin Airport",
    title: "Dublin Airport Transfers from Northern Ireland",
    metaDescription:
      "Cross-border private transfers between Northern Ireland and Dublin Airport (DUB). Fixed prices, flight monitoring, applicable tolls included, and up to 60 minutes complimentary waiting on airport pickups.",
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
    areaServed: ["Belfast", "Lisburn", "Bangor", "Newtownabbey", "Northern Ireland", "Dublin Airport"],
  },
  {
    slug: "city-of-derry",
    code: "LDY",
    name: "City of Derry Airport",
    shortName: "City of Derry Airport",
    title: "City of Derry Airport Transfers",
    metaDescription:
      "Transfers between City of Derry Airport (LDY) and the greater Belfast area — Bangor, Belfast, Lisburn and surrounds. Flight monitoring, meet & greet on request, and up to 60 minutes complimentary waiting time on airport pickups.",
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

export const TOWN_AREAS: TownArea[] = [
  {
    slug: "belfast",
    name: "Belfast",
    addressHint: "Belfast",
    blurb:
      "From city-centre hotels and business districts to south Belfast and the Titanic Quarter, we cover Belfast pickups for every major airport.",
  },
  {
    slug: "newtownabbey",
    name: "Newtownabbey",
    addressHint: "Newtownabbey",
    blurb:
      "Newtownabbey and the Shore Road corridor are well placed for Belfast International and Belfast City Airport runs, with straightforward access to the M2.",
  },
  {
    slug: "lisburn",
    name: "Lisburn",
    addressHint: "Lisburn",
    blurb:
      "Lisburn and surrounding BT28/BT27 areas are a regular pickup zone for Aldergrove, City Airport, and Dublin Airport transfers.",
  },
  {
    slug: "bangor",
    name: "Bangor",
    addressHint: "Bangor",
    blurb:
      "Bangor and North Down are among our most requested pickup areas — especially for early Belfast International flights and Dublin Airport runs.",
  },
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

export function getTransferRoutePages(): TransferRoutePage[] {
  const routes: TransferRoutePage[] = [];
  for (const town of TOWN_AREAS) {
    for (const airport of AIRPORT_PAGES) {
      // LDY only for greater Belfast-area towns (all four qualify).
      const slug = `${town.slug}-to-${airport.slug}`;
      routes.push({
        slug,
        town,
        airport,
        title: `${town.name} to ${airport.shortName} Taxi`,
        metaDescription: `Private airport taxi from ${town.name} to ${airport.name}. Fixed prices, flight monitoring, and 24/7 licensed transfers with ${"My Airport Taxi NI"}.`,
        intro: `${town.blurb} This page is for ${town.name} ↔ ${airport.shortName} transfers — get a live quote with the airport already selected.`,
        journeyNotes: buildRouteNotes(town, airport),
      });
    }
  }
  return routes;
}

export const TRANSFER_ROUTE_PAGES = getTransferRoutePages();

export function getAirportPage(slug: string): AirportPage | undefined {
  return AIRPORT_PAGES.find((page) => page.slug === slug);
}

export function getTransferRoutePage(slug: string): TransferRoutePage | undefined {
  return TRANSFER_ROUTE_PAGES.find((page) => page.slug === slug);
}

/** Short CTA for airport cards/pages — not a marketing fare. */
export function airportFromPrice(code: string): string {
  return ALL_AIRPORTS.find((airport) => airport.code === code)?.distance ?? "Get a fixed quote";
}

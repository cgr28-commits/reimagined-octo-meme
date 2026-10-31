import { FLIGHT_MONITORING_SHORT } from "../../shared/cancellation-policy";
import { ALL_AIRPORTS, SERVICE_FLAGS } from "@/lib/data";
import { getAirportHero } from "@/lib/airport-hero";
import { getDestinationHero } from "@/lib/destination-hero";
import { TOWN_HUB_CONTENT } from "@/lib/town-hubs-content";
import { TRANSFER_ROUTE_CONTENT } from "@/lib/transfer-routes-content";
import type { TownHubContent } from "@/lib/town-transfer-types";

export type AirportPage = {
  slug: string;
  code: "BFS" | "BHD" | "DUB" | "LDY";
  name: string;
  shortName: string;
  title: string;
  seoTitle?: string;
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
  /** Visible FAQ section + FAQPage JSON-LD on the airport page. */
  faqs?: Array<{ question: string; answer: string }>;
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
  direction: "to-airport" | "from-airport";
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
  seoTitle?: string;
  h1: string;
  metaDescription: string;
  intro: string;
  areas: string[];
  localNotes: string[];
  airportCodes: AirportPage["code"][];
  heroBase?: string;
  heroAlt?: string;
  relatedTownSlugs: string[];
  whichAirport: TownHubContent["whichAirport"];
}

const AIRPORT_PAGES_ALL: AirportPage[] = [
  {
    slug: "belfast-international",
    code: "BFS",
    name: "Belfast International Airport",
    shortName: "Belfast International",
    title: "Belfast International Airport Taxi & Transfers",
    seoTitle: "Belfast International Airport Taxi (Aldergrove) | Fixed Price, 5★",
    metaDescription:
      "Taxi to or from Belfast International Airport (Aldergrove), pre-booked at a fixed price. Airport charges included, flight tracking, 60 mins free waiting. 5★.",
    intro:
      `Book a taxi to or from Belfast International Airport (BFS), also known as Aldergrove. We collect from homes and hotels in Belfast, Newtownabbey, Antrim, Lisburn and the surrounding towns, and provide airport pickups for the journey home. Enter your addresses, passengers and suitcases for a fixed-price online quote, then add your travel date and time when booking. Applicable airport access charges are included in the quoted total. Choose a car or 7 Seater Minibus when available. ${FLIGHT_MONITORING_SHORT}`,
    highlights: [
      "Fixed online prices for cars and 7 Seater Minibus when available",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Applicable airport access charges included in your fixed fare",
      "Business Class airport pickups include Meet & Greet with a name board",
      "Book online 24/7, including early-morning and late-night transfers",
    ],
    localTips: [
      "For departures, allow extra time for the M2/M22 corridor in peak morning traffic — we’ll quote a pickup time that suits your flight.",
      "For an airport collection, follow the meeting point confirmed for your booking. Read your driver’s instructions before leaving the terminal; do not assume a different car park or the airport taxi rank is your collection point.",
      "Spacious private transfers are ideal for family holidays with multiple standard suitcases (23kg) from BFS.",
      "For an airport collection, use “Swap pickup and drop-off” to put the airport in Pickup location, then enter your destination in Drop-off location and choose the matching address suggestion. Select your passengers and suitcases, then choose “Get My Fixed Price”. Add your flight number when completing the booking.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 30 minutes from Belfast city centre in normal traffic",
    heroBase: getAirportHero("BFS").heroBase,
    heroAlt: getAirportHero("BFS").alt,
    areaServed: [
      "Belfast",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Lisburn",
      "Bangor",
      "Holywood",
      "Antrim",
      "Ballymena",
      "Larne",
      "Newry",
      "Newtownards",
      "Dundonald",
      "Comber",
      "Carryduff",
      "Hillsborough",
      "Moira",
      "Glengormley",
      "Whiteabbey",
      "Northern Ireland",
    ],
    faqs: [
      {
        question: "How much is a taxi to Belfast International Airport?",
        answer:
          "Every Belfast International Airport taxi is priced from the exact pickup address, so enter your street, passengers and suitcases in the quote box for your fixed fare. The price you are shown is the price you pay — it does not change with traffic, delays or the time of day.",
      },
      {
        question: "Is the airport drop-off or pick-up charge included?",
        answer:
          "Yes. Your fixed quote includes the applicable Express Drop-Off or Express Pick-Up charge at Belfast International. Where the airport offers a designated free drop-off or pick-up area, the quote lets you choose that instead and the Express charge is removed from your total.",
      },
      {
        question: "Where will my driver meet me at Belfast International Airport?",
        answer:
          "Your booking confirmation gives the agreed collection point, and your driver contacts you on the day. Business Class pickups include Meet & Greet with a name board in arrivals. Please follow the instructions for your booking rather than heading to the public taxi rank or a different car park.",
      },
      {
        question: "What happens if my flight into Aldergrove is delayed?",
        answer:
          "Add your flight number when you book. We monitor inbound flights where possible and adjust the collection time, and airport pickups include up to 60 minutes complimentary waiting time.",
      },
      {
        question: "Can you take a family or group with lots of luggage?",
        answer:
          "Yes. Choose an Estate for extra suitcases or a 7 Seater Minibus when available for larger groups. Enter your passengers and suitcases in the quote so we send the right vehicle.",
      },
      {
        question: "Do you cover early-morning flights from Belfast International?",
        answer:
          "Yes. Booking is online 24/7 and we run early-morning and late-night airport transfers. We will suggest a pickup time that leaves enough margin for the M2/M22 corridor and your airline's check-in.",
      },
      {
        question: "How long is a taxi from Belfast International Airport to Belfast city centre?",
        answer:
          "Around 30 minutes in normal traffic, via the A57 and M2. Allow longer at morning and evening peak times. Your fixed price does not change if the journey takes longer.",
      },
      {
        question: "Do I need to queue at the taxi rank?",
        answer:
          "No. Ours is a pre-booked private transfer, not the airport taxi rank. Your driver is booked for your flight and meets you at the collection point in your booking confirmation, so there is no queue and no meter.",
      },
      {
        question: "Can I get a taxi from Belfast International to Dublin Airport or Derry?",
        answer:
          "Yes. We run long-distance transfers across Northern Ireland and the whole of Ireland, including Belfast International to Dublin Airport, City of Derry Airport and the North Coast. Enter both places in the quote box for a fixed price.",
      },
      {
        question: "Belfast International or Belfast City Airport — which is which?",
        answer:
          "Belfast International (BFS, Aldergrove) is in County Antrim, north-west of the city, and handles most holiday flights. George Best Belfast City Airport (BHD) is beside the harbour, close to the city centre. Check your ticket for the airport code — we run fixed-price taxis to both.",
      },
    ],
  },
  {
    slug: "belfast-city",
    code: "BHD",
    name: "George Best Belfast City Airport",
    shortName: "Belfast City Airport",
    title: "Belfast City Airport Taxi & Transfers",
    seoTitle: "City Airport Taxi Belfast (George Best BHD) | Fixed Price, 5★",
    metaDescription:
      "Belfast City Airport taxi (George Best, BHD), pre-booked at a fixed price. Airport charges included, flight tracking, 60 mins free waiting. Rated 5★ on Google.",
    intro:
      `Book a taxi to or from George Best Belfast City Airport (BHD), close to Belfast city centre and the Titanic Quarter. We collect from homes and hotels in Belfast, Holywood, Bangor, Lisburn and the surrounding towns, with airport pickups for returning travellers. Enter your journey details for a fixed-price online quote with applicable airport access charges included. The Sydenham Bypass is the usual airport approach, so allow extra time during peak traffic. ${FLIGHT_MONITORING_SHORT}`,
    highlights: [
      "Short transfer times from Belfast city centre, Holywood, and Bangor",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Applicable airport access charges included in your fixed fare",
      "Business Class airport pickups include Meet & Greet with a name board",
      "Licensed private hire with clear fixed pricing",
    ],
    localTips: [
      "For departures, follow your airline’s check-in and bag-drop guidance and allow extra road travel time during the morning and evening peaks.",
      "The airport has an Express Pick-Up & Drop-Off area and separate car parks. Follow the collection instructions for your booked option rather than heading to a different car park.",
      "Hotel pickups in the Titanic Quarter and Cathedral Quarter are a frequent route for us.",
      "If you have a connecting flight from BHD, tell us your departure time and we’ll plan the drop-off window carefully.",
      "For an airport collection, use “Swap pickup and drop-off” to put the airport in Pickup location, then enter your destination in Drop-off location and choose the matching address suggestion. Select your passengers and suitcases, then choose “Get My Fixed Price”. Add your flight number when completing the booking.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 15 minutes from Belfast city centre in normal traffic",
    heroBase: getAirportHero("BHD").heroBase,
    heroAlt: getAirportHero("BHD").alt,
    areaServed: [
      "Belfast",
      "Holywood",
      "Bangor",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Lisburn",
      "Antrim",
      "Ballymena",
      "Larne",
      "Newry",
      "Newtownards",
      "Dundonald",
      "Comber",
      "Carryduff",
      "Hillsborough",
      "Moira",
      "Glengormley",
      "Whiteabbey",
      "Northern Ireland",
    ],
    faqs: [
      {
        question: "How much is a taxi to Belfast City Airport?",
        answer:
          "Each Belfast City Airport taxi is priced from your exact pickup address, so enter your street, passengers and suitcases in the quote box for your fixed fare. The price shown is the price you pay, with no meter running in traffic on the Sydenham Bypass.",
      },
      {
        question: "Is the Express Drop-Off or Pick-Up charge included?",
        answer:
          "Yes. Your fixed quote includes the applicable Express Drop-Off or Express Pick-Up charge at George Best Belfast City Airport. Where the airport offers a designated free drop-off or pick-up area, the quote lets you choose that instead and the Express charge is removed from your total.",
      },
      {
        question: "Where will my driver meet me at Belfast City Airport?",
        answer:
          "Your booking confirmation gives the agreed collection point, and your driver contacts you on the day. Business Class pickups include Meet & Greet with a name board. Follow the instructions for your booked option rather than heading to a different car park.",
      },
      {
        question: "What if my flight into Belfast City is delayed?",
        answer:
          "Add your flight number when you book. We monitor inbound flights where possible and adjust the collection time, and airport pickups include up to 60 minutes complimentary waiting time.",
      },
      {
        question: "Can you collect from a Belfast hotel for a City Airport flight?",
        answer:
          "Yes. Hotel pickups in the city centre, Titanic Quarter and Cathedral Quarter are a regular City Airport route for us. Enter the hotel name or address in the quote box and choose the matching suggestion.",
      },
      {
        question: "Do you go between Belfast City Airport and Belfast International?",
        answer:
          "Yes. Airport-to-airport transfers between BHD and BFS can be quoted and booked online like any other journey — enter one airport as the pickup and the other as the drop-off.",
      },
      {
        question: "How long is a taxi from Belfast City Airport to the city centre?",
        answer:
          "Around 15 minutes to most city-centre and Titanic Quarter hotels in normal traffic, via the Sydenham Bypass. Allow longer at peak times — your fixed price stays the same.",
      },
      {
        question: "Do you do City Airport taxis from further away, like Coleraine or the North Coast?",
        answer:
          "Yes. We cover the whole of Northern Ireland, including Coleraine, Portrush, Ballymena and Newry to and from Belfast City Airport. Longer journeys are priced the same way — enter your address for a fixed fare.",
      },
      {
        question: "Belfast City or Belfast International Airport — which is which?",
        answer:
          "George Best Belfast City Airport (BHD) is beside the harbour, close to the city centre and Titanic Quarter. Belfast International (BFS, Aldergrove) is in County Antrim, north-west of the city. Check your ticket for the airport code — we run fixed-price taxis to both.",
      },
    ],
  },
  {
    slug: "dublin",
    code: "DUB",
    name: "Dublin Airport",
    shortName: "Dublin Airport",
    title: "Dublin Airport Transfers to & from Northern Ireland",
    seoTitle: "Taxi to Dublin Airport from Belfast & NI | Fixed Price, Tolls Incl.",
    metaDescription:
      "Private taxi between Dublin Airport and Belfast or anywhere in Northern Ireland. Door-to-door, fixed price, tolls included, flight tracking. Rated 5★ on Google.",
    intro:
      `Pre-book a private transfer to or from Dublin Airport (DUB), with Belfast, Bangor, Lisburn and surrounding towns in our Northern Ireland service area. Choose a departure transfer from your home or hotel to the airport, or an arrival collection from Dublin Airport to your Northern Ireland address. Tell us whether you need Terminal 1 or Terminal 2 when known. Enter your journey details for a fixed-price quote with applicable tolls included. ${FLIGHT_MONITORING_SHORT}`,
    highlights: [
      "Fixed prices for NI ↔ Dublin Airport journeys",
      "Applicable tolls included on Dublin Airport fares",
      "Up to 60 minutes complimentary waiting time on airport pickups",
      "Applicable airport access charges included in your fixed fare",
      "5% return-booking discount on the combined journey fare, excluding fixed charges and surcharges",
    ],
    localTips: [
      "Allow around two hours for the road journey from Belfast in normal traffic, plus the time your airline recommends for check-in and security. Allow extra travel time during busy periods.",
      "For early Dublin departures, overnight or very early pickups from Bangor, Belfast, and Lisburn are common.",
      "For departures, select Dublin Airport as your destination and tell us whether your flight leaves from Terminal 1 or Terminal 2 when known.",
      "For arrivals, select Dublin Airport as your pickup and provide your flight number when completing the booking. Your driver meets you in Arrivals at Terminal 1 or Terminal 2 after you collect your bags.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Around 2 hours from Belfast in normal traffic",
    heroBase: getAirportHero("DUB").heroBase,
    heroAlt: getAirportHero("DUB").alt,
    areaServed: [
      "Belfast",
      "Lisburn",
      "Bangor",
      "Newtownabbey",
      "Carrickfergus",
      "Ballyclare",
      "Holywood",
      "Antrim",
      "Ballymena",
      "Larne",
      "Newry",
      "Newtownards",
      "Dundonald",
      "Comber",
      "Carryduff",
      "Hillsborough",
      "Moira",
      "Glengormley",
      "Whiteabbey",
      "Northern Ireland",
      "Dublin Airport",
    ],
    faqs: [
      {
        question: "Can I get a taxi from Dublin Airport to Belfast?",
        answer:
          "Yes. We collect from Dublin Airport Terminal 1 or Terminal 2 and drive you door to door to Belfast or anywhere in Northern Ireland. Book online at a fixed price and add your flight number so we can track your arrival.",
      },
      {
        question: "How much is a taxi from Belfast to Dublin Airport?",
        answer:
          "Every Dublin Airport transfer is priced from your exact address, so enter your pickup, passengers and suitcases in the quote box for a fixed fare. M1 tolls and the applicable Dublin Airport charges are already included, and the price does not change with traffic.",
      },
      {
        question: "How long does the journey take?",
        answer:
          "Around two hours between Belfast and Dublin Airport in normal traffic, via the A1 and M1. For a departure, we will suggest a pickup time that leaves enough margin for check-in and security.",
      },
      {
        question: "What if my flight into Dublin is delayed?",
        answer:
          "Add your flight number when you book. We track your flight and adjust the collection time, and airport pickups include up to 60 minutes' complimentary waiting.",
      },
      {
        question: "Do you go to Dublin Airport from towns outside Belfast?",
        answer:
          "Yes — including Lisburn, Bangor, Newry, Newtownabbey, Antrim, Ballymena and the rest of Northern Ireland. Enter your town and street in the quote box for your fixed price.",
      },
      {
        question: "Is there a discount for a return trip?",
        answer:
          "Yes. Book your outward and return journeys together and get 5% off the combined journey fare (fixed charges excluded).",
      },
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
      "Business Class airport pickups include Meet & Greet with a name board",
    ],
    localTips: [
      "Pickup must be in the greater Belfast area for journeys to LDY — enter a Bangor, Belfast, or Lisburn-area address in the quote tool.",
      "For arrivals at LDY heading to Belfast/Bangor, share your flight number so we can adjust for delays.",
      "For an arrival collection, select City of Derry Airport as your pickup and enter your Belfast-area destination. Follow the agreed collection instructions after collecting your luggage.",
      "These are longer inter-city runs; return bookings are popular for weekend trips.",
    ],
    fromPriceLabel: "Get your fixed price based on your journey.",
    durationNote: "Belfast area ↔ Derry Airport (longer inter-city transfer)",
    heroBase: getAirportHero("LDY").heroBase,
    heroAlt: getAirportHero("LDY").alt,
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
      "Business Class airport pickups include Meet & Greet and luggage assistance.",
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
    seoTitle: hub.seoTitle,
    h1: hub.h1,
    metaDescription: hub.metaDescription,
    intro: hub.intro,
    areas: hub.areas,
    localNotes: hub.localNotes,
    airportCodes: hub.airportCodes.filter((code) =>
      AIRPORT_PAGES.some((airport) => airport.code === code),
    ),
    relatedTownSlugs: hub.relatedTownSlugs ?? [],
    whichAirport: hub.whichAirport,
    heroBase: getDestinationHero(hub.townSlug)?.heroBase,
    heroAlt: getDestinationHero(hub.townSlug)?.alt,
  }));
}

export const TOWN_HUB_PAGES = getTownHubPages();

function leftoverTransferSlug(town: TownArea, airport: AirportPage): string {
  if (airport.code === "DUB" && town.slug === "belfast") {
    return "belfast-to-dublin-airport";
  }
  return `${town.slug}-to-${airport.slug}`;
}

function leftoverLegacySlugs(town: TownArea, airport: AirportPage): string[] | undefined {
  if (airport.code === "DUB" && town.slug === "belfast") {
    return ["belfast-to-dublin"];
  }
  return undefined;
}

function cityOfDerryRouteFaqs(town: TownArea): Array<{ question: string; answer: string }> | undefined {
  if (town.slug === "newtownabbey") {
    return [
      {
        question: "How much is a taxi from Newtownabbey to City of Derry Airport?",
        answer:
          "The quote box on this page already has City of Derry Airport selected. Enter the Newtownabbey street — Glengormley, Jordanstown, Mallusk or another local address. The quote is a fixed price for that start. It is an inter-city fare to Eglinton, not the shorter Newtownabbey to Aldergrove run and not a local Derry price, and we do not publish one figure for every Newtownabbey pickup.",
      },
      {
        question: "How long does Newtownabbey to City of Derry Airport take?",
        answer:
          "This is a longer inter-city transfer from the north side of Belfast to City of Derry Airport at Eglinton. Most Newtownabbey pickups join the M2 at Sandyknowes and then continue toward the north-west, rather than ending at Aldergrove. We do not publish a single duration. The quote tool maps the time from the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City of Derry Airport to Newtownabbey?",
        answer:
          "Yes. Choose Return on the quote form, or book the inbound collection on its own. Share the flight number so we can monitor the arrival at Eglinton where possible. Airport pickups include up to 60 minutes complimentary waiting. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "Is a Newtownabbey to City of Derry Airport taxi a local Derry hop?",
        answer:
          "No. The pickup on this page should be a Newtownabbey address in the greater Belfast area. We do not run short local hops from Derry city centre to the terminal.",
      },
    ];
  }
  if (town.slug === "lisburn") {
    return [
      {
        question: "How much is a taxi from Lisburn to City of Derry Airport?",
        answer:
          "The quote box already has City of Derry Airport selected. Enter the Lisburn, Sprucefield, Lambeg or Hillsborough street. The quote is a fixed price for that start. This is an inter-city fare to Eglinton, not the Lisburn to Belfast International fare that leaves on the M1, and we do not publish one figure for every south-west Belfast pickup.",
      },
      {
        question: "How long does Lisburn to City of Derry Airport take?",
        answer:
          "Lisburn sits at the south-west of Greater Belfast, so the car has to cross toward the north-west to reach City of Derry Airport at Eglinton. That is a different journey from Lisburn to Belfast International, which usually starts on the M1 toward Aldergrove. We do not publish a single duration. The quote tool maps the time from the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City of Derry Airport to Lisburn?",
        answer:
          "Yes. Choose Return on the quote form, or book the inbound on its own back to Lisburn, Sprucefield or Hillsborough. Share the flight number so we can monitor the Eglinton arrival where possible. Airport pickups include up to 60 minutes complimentary waiting. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "Do you collect in Derry city for this Lisburn page?",
        answer:
          "No. This page is for a greater Belfast pickup — Lisburn, Hillsborough, Sprucefield, Lambeg, Hilden or Dunmurry — going to City of Derry Airport, or the return from the airport to that area. It is not a local taxi from Derry city centre to the terminal.",
      },
    ];
  }
  if (town.slug === "bangor") {
    return [
      {
        question: "How much is a taxi from Bangor to City of Derry Airport?",
        answer:
          "The quote box already has City of Derry Airport selected. Enter the Bangor, Ballyholme, Helen’s Bay or Crawfordsburn address. The quote is a fixed price for that North Down start. It is not the short Belfast City Airport hop along the A2, and it is not a local Derry price. We do not publish one figure for every coastal pickup.",
      },
      {
        question: "How long does Bangor to City of Derry Airport take?",
        answer:
          "Bangor pickups start on the North Down coast. Belfast City Airport is the shorter A2 hop toward Holywood. Belfast International is already a longer reserved run, using the A2 into Belfast and then the motorway. City of Derry Airport is a further inter-city journey to Eglinton, so book it as a full trip, especially for an early departure. We do not publish a single duration. The quote tool maps the time from the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City of Derry Airport to Bangor?",
        answer:
          "Yes. Choose Return on the quote form, or book the inbound collection on its own to Bangor or the North Down address. Share the flight number so we can monitor the arrival at Eglinton where possible. Airport pickups include up to 60 minutes complimentary waiting. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "Is Bangor to City of Derry Airport the same as the City Airport run?",
        answer:
          "No. Belfast City Airport from Bangor is the shorter coastal hop. This page is the longer inter-city transfer to City of Derry Airport at Eglinton. The pickup should be a Bangor or North Down address, not a Derry city-centre hop to the terminal.",
      },
    ];
  }
  return undefined;
}

function buildLegacyRoute(town: TownArea, airport: AirportPage): TransferRoutePage {
  return {
    slug: leftoverTransferSlug(town, airport),
    legacySlugs: leftoverLegacySlugs(town, airport),
    town,
    airport,
    hubSlug: TOWN_HUB_PAGES.find((hub) => hub.town.slug === town.slug)?.slug ?? null,
    direction: "to-airport",
    title: `${town.name} to ${airport.shortName} Taxi`,
    h1: `${town.name} to ${airport.shortName} Taxi`,
    metaDescription: `Pre-book a fixed-price taxi from ${town.name} to ${airport.name}, with flight monitoring and secure online booking.`,
    intro: `${town.blurb} This page is for ${town.name} ↔ ${airport.shortName} transfers — get your fixed quote with the airport already selected.`,
    journeyNotes: buildRouteNotes(town, airport),
    faqs: airport.code === "LDY" ? cityOfDerryRouteFaqs(town) : undefined,
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
      direction: content.direction ?? "to-airport",
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

/**
 * Descriptive internal-link anchor for an airport page, e.g.
 * "Belfast International Airport taxi" / "Belfast City Airport taxi".
 * Matches the searches we want the airport pages to rank for.
 */
export function airportTaxiAnchor(page: Pick<AirportPage, "shortName">): string {
  const name = page.shortName.trim();
  return /airport$/i.test(name) ? `${name} taxi` : `${name} Airport taxi`;
}

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
  return (
    TOWN_HUB_PAGES.find((page) => page.town.name === name) ??
    // Towns covered by a combined hub, e.g. Portadown and Lurgan → Craigavon.
    TOWN_HUB_PAGES.find((page) => page.slug === "craigavon-airport-taxis" && page.areas.includes(name))
  );
}

export function getTransferRoutePage(slug: string): TransferRoutePage | undefined {
  return TRANSFER_ROUTE_PAGES.find(
    (page) => page.slug === slug || page.legacySlugs?.includes(slug),
  );
}

export type TransferLegacyRedirect = {
  fromSlug: string;
  toSlug: string;
  source: string;
  sourceTrailing: string;
  destination: string;
};

/** Previously indexed transfer slugs that now permanently redirect to a new canonical. */
export function getTransferLegacyRedirects(): TransferLegacyRedirect[] {
  const canonical = new Set(TRANSFER_ROUTE_PAGES.map((page) => page.slug));
  const redirects: TransferLegacyRedirect[] = [];
  for (const page of TRANSFER_ROUTE_PAGES) {
    for (const fromSlug of page.legacySlugs ?? []) {
      if (!fromSlug || fromSlug === page.slug || canonical.has(fromSlug)) {
        continue;
      }
      redirects.push({
        fromSlug,
        toSlug: page.slug,
        source: `/transfers/${fromSlug}`,
        sourceTrailing: `/transfers/${fromSlug}/`,
        destination: `/transfers/${page.slug}/`,
      });
    }
  }
  return redirects;
}

export function getTransferStaticSlugs(): string[] {
  return getCanonicalTransferSlugs();
}

export function getRoutesForTown(townSlug: string): TransferRoutePage[] {
  return TRANSFER_ROUTE_PAGES.filter(
    (route) => route.town.slug === townSlug && route.faqs?.length && route.journeyInfo,
  );
}

export function getCanonicalTransferSlugs(): string[] {
  return TRANSFER_ROUTE_PAGES.map((page) => page.slug);
}

/** Short CTA for airport cards/pages — not a marketing fare. */
export function airportFromPrice(code: string): string {
  return ALL_AIRPORTS.find((airport) => airport.code === code)?.distance ?? "Get a fixed quote";
}

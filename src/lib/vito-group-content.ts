/**
 * Mercedes-Benz Vito group-transfer pages.
 * The vehicle in the quote remains the existing 7 Seater Minibus option.
 */

export type VitoFaq = { question: string; answer: string };

export type VitoPageContent = {
  slug: string;
  path: string;
  h1: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  intro: string;
  sections: ReadonlyArray<{ heading: string; paragraphs: readonly string[] }>;
  related: ReadonlyArray<{ href: string; label: string }>;
  faqs: readonly VitoFaq[];
  quoteHeading: string;
  airportCode: string;
  direction: "to-airport" | "from-airport";
  areaServed: readonly string[];
  serviceType: string;
  breadcrumbParent?: { name: string; href: string };
};

export const VITO_GROUP_HOME_PATH = "/transfers/7-seater-airport-transfers-belfast/";

const LUGGAGE =
  "Luggage space depends on how many people are travelling and what you bring. The quote does not reserve a set number of suitcases.";

const AVAILABILITY =
  "The 7 Seater Minibus is offered in the quote when it is available for that journey. A booking is confirmed only after the quote is accepted. Some departure times need availability confirmation before any payment is taken.";

const SEATS =
  "The Mercedes-Benz Vito is arranged for up to seven passengers, with the driver in the eighth seat.";

const PAYMENT =
  "The fare is the same calculator used across the website. Eligible bookings continue to the existing secure card payment. This page does not use a separate booking system.";

export const VITO_GROUP_PAGES: readonly VitoPageContent[] = [
  {
    slug: "7-seater-airport-transfers-belfast",
    path: "/transfers/7-seater-airport-transfers-belfast/",
    h1: "7-Seater Airport Transfers Belfast",
    seoTitle: "7-Seater Airport Transfers Belfast",
    description:
      "Private 7-seater taxi transfers from Belfast in a Mercedes-Benz Vito. Fixed fares for Belfast International, Belfast City Airport and Dublin Airport. Book online.",
    eyebrow: "Up to seven passengers",
    intro:
      "Travel together on a private airport transfer from Belfast. The Mercedes-Benz Vito is the 7-seater used for group airport journeys, so your party can leave from one door and arrive at the terminal together.",
    sections: [
      {
        heading: "Airports this transfer covers",
        paragraphs: [
          "Use it for Belfast International Airport, Belfast City Airport and Dublin Airport, in either direction. Enter the hotel, home or office on the quote and the fixed fare is shown before you book.",
          "Airport pickups use the agreed meeting point and your flight number, in the same way as other 7-seater bookings. Meet and greet inside arrivals is part of Business Class, not this vehicle.",
        ],
      },
      {
        heading: "The vehicle",
        paragraphs: [SEATS, LUGGAGE, AVAILABILITY],
      },
      {
        heading: "How the quote works",
        paragraphs: [
          "Choose To an Airport, From an Airport, or Address to Address. Add the date, passengers and luggage. When the 7 Seater Minibus is offered and fits the party, this page selects it for you. You can still switch to another suitable vehicle.",
          PAYMENT,
        ],
      },
    ],
    related: [
      { href: "/transfers/belfast-to-dublin-airport-7-seater/", label: "Belfast to Dublin Airport 7-seater" },
      { href: "/transfers/belfast-to-belfast-international/", label: "Belfast to Belfast International" },
      { href: "/transfers/belfast-to-belfast-city/", label: "Belfast to Belfast City Airport" },
      { href: "/airports/belfast-international/", label: "Belfast International Airport transfers" },
      { href: "/transfers/private-group-transfers-belfast/", label: "Private group transfers in Belfast" },
    ],
    faqs: [
      {
        question: "How many passengers can the 7-seater take?",
        answer:
          "Up to seven passengers, plus the driver. Enter the full passenger count on the quote, including children.",
      },
      {
        question: "Is a Mercedes-Benz Vito guaranteed for every booking?",
        answer:
          "The 7-seater option is a Mercedes-Benz Vito when that vehicle is offered and the booking is confirmed. If the 7 Seater Minibus is not available for the time you choose, the quote tells you and shows the other vehicles that fit.",
      },
      {
        question: "How much luggage can we bring?",
        answer: LUGGAGE,
      },
    ],
    quoteHeading: "Quote a 7-seater airport transfer",
    airportCode: "",
    direction: "to-airport",
    areaServed: ["Belfast", "Belfast International Airport", "Belfast City Airport", "Dublin Airport"],
    serviceType: "Airport Transfer",
  },
  {
    slug: "belfast-to-dublin-airport-7-seater",
    path: "/transfers/belfast-to-dublin-airport-7-seater/",
    h1: "Belfast to Dublin Airport 7-Seater Transfers",
    seoTitle: "Belfast to Dublin Airport 7-Seater Transfers",
    description:
      "Book a Belfast to Dublin Airport 7-seater for up to seven passengers in a Mercedes-Benz Vito. The quote shows the fixed fare, including the usual Dublin toll allowance.",
    eyebrow: "Belfast to Dublin Airport",
    intro:
      "A Belfast to Dublin Airport 7-seater keeps a group in one private vehicle for the cross-border run. The Mercedes-Benz Vito collects from a Belfast address and the quote confirms the fixed fare before anyone pays.",
    sections: [
      {
        heading: "The Dublin Airport journey",
        paragraphs: [
          "Most departures from Belfast join the A1 and M1 towards Dublin Airport. The airport guide describes the journey as around two hours from Belfast in normal traffic. The quote maps the time from the address you enter, because a city-centre hotel is not the same start as south Belfast.",
          "Dublin Airport fares include the M1 toll allowance, the same as our other Dublin Airport quotes. Tell us the terminal when you know it if you are booking the return collection.",
        ],
      },
      {
        heading: "Who it suits",
        paragraphs: [
          "Families, colleagues and friends who would otherwise split across two cars. The Vito takes up to seven passengers plus the driver. It is a private door-to-door transfer, not a shared shuttle.",
          LUGGAGE,
        ],
      },
      {
        heading: "Booking the 7-seater",
        paragraphs: [
          "Dublin Airport is already selected on the quote below. Enter the Belfast pickup, then the date and the passenger and luggage counts. The 7 Seater Minibus is selected when it is offered and fits. You can change vehicle if another option suits the party better.",
          AVAILABILITY,
          PAYMENT,
        ],
      },
    ],
    related: [
      { href: "/transfers/belfast-to-dublin-airport/", label: "Belfast to Dublin Airport transfers" },
      { href: "/transfers/dublin-airport-to-belfast/", label: "Dublin Airport to Belfast" },
      { href: "/airports/dublin/", label: "Dublin Airport transfer guide" },
      { href: "/transfers/7-seater-airport-transfers-belfast/", label: "7-seater airport transfers Belfast" },
    ],
    faqs: [
      {
        question: "Is this a different fare from the main Belfast to Dublin Airport page?",
        answer:
          "No. The price comes from the same quote calculator. Choosing the 7-seater uses the existing 7 Seater Minibus fare for that route. It does not add a separate group tariff.",
      },
      {
        question: "Can we be collected from Dublin Airport back to Belfast?",
        answer:
          "Yes. In the quote, choose From an Airport, keep Dublin Airport selected, and enter the Belfast destination. Share the flight number so the collection can follow the arrival.",
      },
      {
        question: "Do we all have to fly from the same terminal?",
        answer:
          "The transfer is one private vehicle to one Dublin Airport drop-off, or one collection point on the way back. Tell us the terminal when you know it.",
      },
    ],
    quoteHeading: "Quote Belfast to Dublin Airport",
    airportCode: "DUB",
    direction: "to-airport",
    areaServed: ["Belfast", "Dublin Airport"],
    serviceType: "Airport Transfer",
    breadcrumbParent: { name: "Dublin Airport", href: "/airports/dublin/" },
  },
  {
    slug: "hen-party-transport-belfast",
    path: "/transfers/hen-party-transport-belfast/",
    h1: "Hen Party Transport Belfast",
    seoTitle: "Hen Party Transport Belfast",
    description:
      "Hen party transport in Belfast for up to seven passengers in a private Mercedes-Benz Vito. Airport, hotel and venue transfers with the fare confirmed before you book.",
    eyebrow: "Hen parties",
    intro:
      "Keep a hen party in one vehicle instead of splitting taxis across Belfast. Hen party transport in a Mercedes-Benz Vito is a private door-to-door transfer for up to seven passengers, from the airport, a hotel or the venue.",
    sections: [
      {
        heading: "Journeys hen parties book",
        paragraphs: [
          "Arrivals into Belfast International, Belfast City Airport or Dublin Airport, then the hotel. Later, the restaurant, bar or venue, and the return when the evening ends. Each journey is quoted on its own, or as a return when the quote offers one.",
          "The driver takes the group to the address you enter. This is not a tour, a party bus, or a vehicle that stays with you for the night unless you book each leg.",
        ],
      },
      {
        heading: "Passengers and luggage",
        paragraphs: [
          SEATS,
          "A hen party with more than seven passengers needs more than one vehicle. Book a second transfer rather than overfilling the Vito.",
          LUGGAGE,
        ],
      },
      {
        heading: "Price and payment",
        paragraphs: [AVAILABILITY, PAYMENT],
      },
    ],
    related: [
      { href: "/transfers/stag-party-transport-belfast/", label: "Stag party transport Belfast" },
      { href: "/transfers/private-group-transfers-belfast/", label: "Private group transfers Belfast" },
      { href: "/transfers/7-seater-airport-transfers-belfast/", label: "7-seater airport transfers Belfast" },
      { href: "/transfers/belfast-to-dublin-airport-7-seater/", label: "Belfast to Dublin Airport 7-seater" },
    ],
    faqs: [
      {
        question: "Can you collect us from the airport and take us out later?",
        answer:
          "Book the airport transfer and the evening journey as the trips you need. A return can cover two times on the same route. A different venue later in the day is a separate quote.",
      },
      {
        question: "Will the Vito wait outside the venue?",
        answer:
          "The booking is for the transfer you quote. Waiting beyond the complimentary time already included on airport pickups is not part of a standard hen party drop-off.",
      },
      {
        question: "Is the vehicle decorated?",
        answer:
          "No. The transfer is a private Mercedes-Benz Vito for the group. We do not supply decorations, drinks or a host.",
      },
    ],
    quoteHeading: "Quote hen party transport",
    airportCode: "",
    direction: "to-airport",
    areaServed: ["Belfast", "Northern Ireland"],
    serviceType: "Private group transfer",
  },
  {
    slug: "stag-party-transport-belfast",
    path: "/transfers/stag-party-transport-belfast/",
    h1: "Stag Party Transport Belfast",
    seoTitle: "Stag Party Transport Belfast",
    description:
      "Stag party transfers in Belfast for up to seven passengers in a private Mercedes-Benz Vito. Airports, hotels and events, with the fixed fare shown before you book.",
    eyebrow: "Stag parties",
    intro:
      "Stag party transfers in Belfast work best when the group leaves together. A Mercedes-Benz Vito takes up to seven passengers from the airport or hotel to the venue, then back, as a private booking with the fare shown first.",
    sections: [
      {
        heading: "Where groups use it",
        paragraphs: [
          "Belfast International and Belfast City Airport arrivals, Dublin Airport when guests fly in there, city hotels, and the door of a booked venue. Sporting events and concerts use the same quote: enter the pickup and the destination address.",
          "It is a private transfer, not a shared shuttle and not a vehicle reserved by the hour. Quote the journey you want driven.",
        ],
      },
      {
        heading: "Group size",
        paragraphs: [
          SEATS,
          "Eight or more passengers do not fit in one Vito. Arrange a second vehicle through another quote.",
          LUGGAGE,
        ],
      },
      {
        heading: "Confirming the transfer",
        paragraphs: [
          "On this page the quote prefers the 7 Seater Minibus when that option is offered and the passenger count fits. Choose another suitable vehicle if you need to.",
          AVAILABILITY,
          PAYMENT,
        ],
      },
    ],
    related: [
      { href: "/transfers/hen-party-transport-belfast/", label: "Hen party transport Belfast" },
      { href: "/transfers/private-group-transfers-belfast/", label: "Private group transfers Belfast" },
      { href: "/transfers/7-seater-airport-transfers-belfast/", label: "7-seater airport transfers Belfast" },
      { href: "/airports/belfast-city/", label: "Belfast City Airport transfers" },
    ],
    faqs: [
      {
        question: "Can the stag fly into Dublin and stay in Belfast?",
        answer:
          "Yes. Choose From an Airport, select Dublin Airport, and enter the Belfast hotel or venue as the destination. The fixed fare includes the usual Dublin toll allowance.",
      },
      {
        question: "Do you provide a party bus?",
        answer:
          "No. Stag transport on this page is a private Mercedes-Benz Vito for up to seven passengers plus the driver.",
      },
      {
        question: "What if kick-off or the flight time changes?",
        answer:
          "Update the booking with the new time as soon as you know it. We do not hold an open-ended pickup, and a vehicle is not guaranteed until the revised journey is confirmed.",
      },
    ],
    quoteHeading: "Quote stag party transport",
    airportCode: "",
    direction: "to-airport",
    areaServed: ["Belfast", "Northern Ireland"],
    serviceType: "Private group transfer",
  },
  {
    slug: "private-group-transfers-belfast",
    path: "/transfers/private-group-transfers-belfast/",
    h1: "Private Group Transfers Belfast",
    seoTitle: "Private Group Transfers Belfast",
    description:
      "Private group transfers in Belfast for up to seven passengers in a Mercedes-Benz Vito. Airports, weddings, concerts and events, with a fixed fare from the online quote.",
    eyebrow: "Private groups",
    intro:
      "Private group transfers in Belfast suit families, wedding guests, colleagues and friends who want one vehicle. The Mercedes-Benz Vito carries up to seven passengers and the driver, door to door, at the fare the quote confirms.",
    sections: [
      {
        heading: "Occasions",
        paragraphs: [
          "Weddings, concerts, sporting events and family airport runs all use the same booking. Enter the collection address and the destination, whether that is Belfast International, Belfast City Airport, Dublin Airport, a venue or a hotel.",
          "The transfer is private to your group. Other passengers are not added along the way.",
        ],
      },
      {
        heading: "What to expect",
        paragraphs: [
          SEATS,
          LUGGAGE,
          "Child seats can be requested in the quote. Availability is not guaranteed, which is the same rule as the rest of the site.",
          AVAILABILITY,
        ],
      },
      {
        heading: "Book on the existing quote",
        paragraphs: [
          "Select the journey type, then passengers and luggage. This page selects 7 Seater Minibus when it is offered and fits. Saloon, Estate and Business Class remain available when they suit a smaller party.",
          PAYMENT,
        ],
      },
    ],
    related: [
      { href: "/transfers/7-seater-airport-transfers-belfast/", label: "7-seater airport transfers Belfast" },
      { href: "/transfers/belfast-to-dublin-airport-7-seater/", label: "Belfast to Dublin Airport 7-seater" },
      { href: "/transfers/hen-party-transport-belfast/", label: "Hen party transport Belfast" },
      { href: "/transfers/stag-party-transport-belfast/", label: "Stag party transport Belfast" },
      { href: "/transfers/belfast-to-dublin-airport/", label: "Belfast to Dublin Airport" },
    ],
    faqs: [
      {
        question: "Is this only for airports?",
        answer:
          "No. Choose Address to Address for a venue, wedding or hotel that is not an airport. Airport journeys use To an Airport or From an Airport.",
      },
      {
        question: "Can a wedding party book more than one car?",
        answer:
          "Each Vito quote covers one vehicle of up to seven passengers. Book another transfer for further guests. We do not combine separate groups into one shared vehicle.",
      },
      {
        question: "Are the fares different for events?",
        answer:
          "Event and wedding transfers use the same fixed-fare quote as airport and address journeys. The price depends on the route, time and vehicle, not on a separate event menu.",
      },
    ],
    quoteHeading: "Quote a private group transfer",
    airportCode: "",
    direction: "to-airport",
    areaServed: ["Belfast", "Northern Ireland"],
    serviceType: "Private group transfer",
  },
];

export function vitoPageBySlug(slug: string): VitoPageContent | undefined {
  return VITO_GROUP_PAGES.find((page) => page.slug === slug);
}

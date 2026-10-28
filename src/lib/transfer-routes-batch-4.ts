import type { TransferRouteContent } from "@/lib/town-transfer-types";

/**
 * Batch 4 routes — Craigavon area (Portadown, Lurgan, Craigavon). Roads named are the
 * usual corridors only; no fares, mileages, or journey-time claims.
 */
const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

export const TRANSFER_ROUTE_BATCH_4: TransferRouteContent[] = [
  {
    slug: "craigavon-to-belfast-international",
    townSlug: "craigavon",
    airportCode: "BFS",
    title: "Craigavon to Belfast International Airport Taxi",
    h1: "Craigavon to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Craigavon, Portadown or Lurgan to Belfast International Airport. Fixed-price M1 and A26 transfer from your door.",
    intro:
      "Craigavon to Belfast International Airport is a straightforward run for holiday and long-haul flights: the M1 east from Portadown or Lurgan, off at Moira, then north on the A26 to Aldergrove. My Airport Taxi NI collects from Portadown, Lurgan, Brownlow, Waringstown, Dollingstown and Magheralin, and quotes a fixed price from your exact street, with Belfast International already selected on this page. Early departures are common from this area, so the booking form takes overnight and first-light pickup times. Travelling from Belfast International Airport back to Craigavon? Book the collection here too and add your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. A Portadown address and a Lurgan address are different journeys, so enter the full street rather than the town name. Add a return if you want both legs on one booking, and message us on WhatsApp if a pickup needs a named door.",
    journeyInfo: `The M1 east to Moira, then the A26 north to the airport, is the usual line. Traffic around Moira and Glenavy is the part to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Portadown, Lurgan or anywhere around Craigavon and drive you to Belfast International. Book so the M1 and the A26 sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Craigavon is booked on this page. Add the flight number so we can monitor the landing time. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Craigavon to Aldergrove is a reserved booking with the fare confirmed before you travel — not a late taxi call before an early flight.",
    localAreasText:
      "Portadown and Lurgan are separate pickups. Waringstown, Dollingstown and Magheralin are near the M1 at Lurgan. Brownlow needs the estate name.",
    faqs: [
      {
        question: "How much is a taxi from Craigavon to Belfast International Airport?",
        answer:
          "Enter your Portadown, Lurgan or Craigavon address in the quote box and you get the fixed price for that street before you book. Fares differ between the towns, so we price your exact pickup rather than one area fare.",
      },
      {
        question: "How long does Craigavon to Belfast International take?",
        answer:
          "The usual route is the M1 to Moira and the A26 north to Aldergrove; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Belfast International Airport back to Portadown or Lurgan?",
        answer: "Yes. Book the return collection on this page with your flight number and your Craigavon-area address.",
      },
      {
        question: "What if my flight into Belfast International is delayed?",
        answer:
          "Add the flight number when you book. We monitor it where possible and adjust the collection, and airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Waringstown and Magheralin?",
        answer: "Yes. Enter the village address and the quote prices that pickup, not Lurgan town centre.",
      },
    ],
  },
  {
    slug: "craigavon-to-belfast-city-airport",
    townSlug: "craigavon",
    airportCode: "BHD",
    title: "Craigavon to Belfast City Airport Taxi",
    h1: "Craigavon to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Craigavon, Portadown or Lurgan to George Best Belfast City Airport. Fixed-price M1 transfer through Belfast.",
    intro:
      "Craigavon to George Best Belfast City Airport suits short business trips and flights to Great Britain: the M1 from Portadown or Lurgan all the way into Belfast, then across the city to the Sydenham side and the harbour. My Airport Taxi NI collects from Portadown, Lurgan, Brownlow, Waringstown, Dollingstown and Magheralin, and quotes a fixed price from your exact street, with Belfast City Airport already selected on this page. Morning business flights mean the M1 and Westlink are at their busiest, so we plan the pickup time around that rather than a clear-road estimate. Returning to Craigavon from Belfast City Airport? Book the collection here and add your flight number; inbound flights are monitored where possible and airport pickups include complimentary waiting. Enter the full street address, because Portadown and Lurgan are different journeys. Add a return to keep both legs on one booking, and use WhatsApp if a hotel or office needs a named entrance.",
    journeyInfo: `The M1 into Belfast, then across to Sydenham, is the usual line. The Westlink at peak times is the part that can add delay. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Portadown, Lurgan or anywhere around Craigavon and take you to Belfast City Airport. Book so the M1 and the cross-city section sit ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Craigavon is booked on this page. Add the flight number so we can monitor the landing time, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Craigavon to Belfast City Airport is booked ahead with a confirmed fare, planned around Belfast's morning traffic.",
    localAreasText:
      "Portadown and Lurgan are separate pickups. Brownlow needs the estate name. Waringstown and Magheralin sit close to the M1.",
    faqs: [
      {
        question: "How much is a taxi from Craigavon to Belfast City Airport?",
        answer:
          "Put your Craigavon, Portadown or Lurgan address into the quote tool for the fixed price to Belfast City Airport. The fare is for your street, with the airport access charge included where it applies.",
      },
      {
        question: "How long does Craigavon to Belfast City Airport take?",
        answer:
          "The M1 into Belfast and across to Sydenham is the usual route, and the Westlink at peak times is what changes it most. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Belfast City Airport back to Craigavon?",
        answer: "Yes. Book the return on this page with your flight number and your Portadown, Lurgan or Craigavon address.",
      },
      {
        question: "Is Belfast City or Belfast International better from Craigavon?",
        answer:
          "Belfast City Airport is usually the pick for short flights to Great Britain; Belfast International has more holiday and long-haul routes. Check the airport code on your ticket — we cover both.",
      },
      {
        question: "Can I book and pay online?",
        answer: "Yes. Belfast City Airport is preselected; pay securely where an instant fixed fare is shown.",
      },
    ],
  },
  {
    slug: "craigavon-to-dublin-airport",
    townSlug: "craigavon",
    airportCode: "DUB",
    title: "Craigavon to Dublin Airport Taxi",
    h1: "Craigavon to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Craigavon, Portadown or Lurgan to Dublin Airport. Fixed-price A1/M1 transfer with applicable tolls included.",
    intro:
      "Craigavon to Dublin Airport is a reserved long transfer south: from Portadown or Lurgan onto the A1 past Banbridge and Newry, across the border and down the M1 to the airport. My Airport Taxi NI quotes it as a Dublin Airport fare with applicable M1 tolls included, and this page already has Dublin Airport selected — you add your pickup street. First-wave Dublin flights mean very early starts from County Armagh, so the booking form accepts overnight pickup times. Tell us your terminal when you know it. Coming home from Dublin Airport to Craigavon? Book the collection here with your flight number; we monitor inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Enter the full address, because Portadown, Lurgan and the villages around them are priced from the exact street. Add a return to keep both directions on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `The A1 south past Banbridge and Newry, then the M1 in the Republic, is the usual line. Border-area and M50 traffic are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Portadown, Lurgan or anywhere around Craigavon and drive you to Dublin Airport. Book so the A1, the border crossing and the M1 sit well ahead of check-in. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Craigavon is booked on this page. Add your flight number so we can monitor the landing time; your driver will meet you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Craigavon to Dublin is a long cross-border trip, so it is booked ahead at a fixed fare with tolls included.",
    localAreasText:
      "Portadown and Lurgan are separate pickups, and the villages around them are priced from the exact address.",
    faqs: [
      {
        question: "How much is a taxi from Craigavon to Dublin Airport?",
        answer:
          "Use the quote box with your Portadown, Lurgan or Craigavon address for the fixed Dublin Airport fare, including applicable M1 tolls. You see the price before you book.",
      },
      {
        question: "How long does Craigavon to Dublin Airport take?",
        answer:
          "The usual route is the A1 south to the border and the M1 to the airport; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Where will I meet my driver at Dublin Airport?",
        answer: "Your driver meets you in Arrivals after you collect your baggage. Add your flight number so we can track the landing time.",
      },
      {
        question: "Are tolls included?",
        answer: "Yes. Applicable M1 tolls are included in the fixed Dublin Airport fare.",
      },
      {
        question: "Can you collect very early for first-wave Dublin flights?",
        answer: "Yes. The booking form accepts overnight pickup times from Craigavon, Portadown and Lurgan.",
      },
    ],
  },
];

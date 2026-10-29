import type { TransferRouteContent } from "@/lib/town-transfer-types";

/**
 * Batch 5 routes — Causeway Coast (Coleraine, Portrush, Portstewart). Roads named are the
 * usual corridors only; no fares, mileages, or journey-time claims.
 */
const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

export const TRANSFER_ROUTE_BATCH_5: TransferRouteContent[] = [
  {
    slug: "coleraine-to-belfast-international",
    townSlug: "coleraine",
    airportCode: "BFS",
    title: "Coleraine to Belfast International Airport Taxi",
    h1: "Coleraine to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Coleraine, Portrush or Portstewart to Belfast International Airport. Fixed-price A26 transfer from your door. Rated 5★ on Google.",
    intro:
      "Coleraine to Belfast International Airport is the main airport run from the Causeway Coast: the A26 south through Ballymoney and Ballymena, then on towards Antrim and Aldergrove. My Airport Taxi NI collects from Coleraine, Portrush, Portstewart, Castlerock, Bushmills and Ballymoney, and quotes a fixed price from your exact street, with Belfast International already selected on this page. Early departures mean very early starts from the north coast, so the booking form takes overnight and first-light pickup times. Travelling from Belfast International Airport back to Coleraine or Portrush? Book the collection here too and add your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. Holiday lets and caravan parks should include the property or park name. Add a return if you want both legs on one booking, and message us on WhatsApp if a pickup needs a named door.",
    journeyInfo: `The A26 south through Ballymoney and Ballymena, then on towards Antrim and Aldergrove, is the usual line. Ballymena and the approach to the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Coleraine, Portrush, Portstewart or anywhere on the Causeway Coast and drive you to Belfast International. Book so the A26 sits comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Coleraine is booked on this page. Add the flight number so we can monitor the landing time. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Coleraine to Aldergrove is a reserved booking with the fare confirmed before you travel — no long early drive and no week of airport parking.",
    localAreasText:
      "Coleraine, Portrush and Portstewart are separate pickups. Castlerock, Bushmills and Ballymoney are priced from the village address. Holiday lets need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Coleraine to Belfast International Airport?",
        answer:
          "Enter your Coleraine, Portrush or Portstewart address in the quote box and you get the fixed price for that street before you book. Fares differ between the towns, so we price your exact pickup rather than one area fare.",
      },
      {
        question: "How long does Coleraine to Belfast International take?",
        answer:
          "The usual route is the A26 south through Ballymoney and Ballymena towards Antrim and Aldergrove; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Belfast International Airport back to Portrush or Portstewart?",
        answer: "Yes. Book the return collection on this page with your flight number and your Causeway Coast address.",
      },
      {
        question: "What if my flight into Belfast International is delayed?",
        answer:
          "Add the flight number when you book. We monitor it where possible and adjust the collection, and airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from holiday lets and caravan parks?",
        answer: "Yes. Enter the address and include the park or property name so the driver finds the right door.",
      },
    ],
  },
  {
    slug: "coleraine-to-belfast-city-airport",
    townSlug: "coleraine",
    airportCode: "BHD",
    title: "Coleraine to Belfast City Airport Taxi",
    h1: "Coleraine to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Coleraine, Portrush or Portstewart to George Best Belfast City Airport. Fixed-price A26 and M2 transfer from your door. 5★ on Google.",
    intro:
      "Coleraine to Belfast City Airport is a reserved run from the Causeway Coast to George Best Belfast City Airport: the A26 south through Ballymoney and Ballymena, the M2 into Belfast, then across to Sydenham. It suits short business trips and flights to Great Britain. My Airport Taxi NI collects from Coleraine, Portrush, Portstewart, Castlerock, Bushmills and Ballymoney, and quotes a fixed price from your exact street, with Belfast City Airport already selected on this page. Early flights mean early starts from the north coast, so the booking form takes overnight pickup times. Flying back into Belfast City Airport? Book the collection here with your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. Enter the full address, including any holiday-let or caravan-park name. Add a return to keep both directions on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `The A26 south, the M2 into Belfast, then across the city to Sydenham is the usual line. The Belfast end of the run is the part to allow for at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Coleraine, Portrush, Portstewart or anywhere on the Causeway Coast and drive you to Belfast City Airport. Book so the A26 and the city section sit comfortably ahead of check-in. Applicable airport access charges are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Coleraine is booked on this page. Add the flight number so we can monitor the landing time. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Coleraine to George Best is a reserved booking with the fare confirmed before you travel — one car from the coast to the terminal.",
    localAreasText:
      "Coleraine, Portrush and Portstewart are separate pickups. Castlerock, Bushmills and Ballymoney are priced from the village address. Holiday lets need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Coleraine to Belfast City Airport?",
        answer:
          "Enter your Coleraine, Portrush or Portstewart address in the quote box and you get the fixed price for that street before you book, with applicable airport access charges included.",
      },
      {
        question: "How long does Coleraine to Belfast City Airport take?",
        answer:
          "The usual line is the A26 south to the M2, then through Belfast to Sydenham; the quote shows the mapped time from your Causeway Coast street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City Airport or Belfast International better from Coleraine?",
        answer:
          "Belfast International is reached first on the A26, so it is usually the shorter run. Belfast City Airport means continuing into Belfast on the M2. Book whichever airport your flight uses — both are quoted from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Portrush or Portstewart?",
        answer: "Yes. Book the return collection on this page with your flight number and your Causeway Coast address.",
      },
      {
        question: "What if my flight into Belfast City Airport is delayed?",
        answer:
          "Add the flight number when you book. We monitor it where possible and adjust the collection, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "coleraine-to-dublin-airport",
    townSlug: "coleraine",
    airportCode: "DUB",
    title: "Coleraine to Dublin Airport Taxi",
    h1: "Coleraine to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Coleraine, Portrush or Portstewart to Dublin Airport. Fixed-price long-distance transfer with applicable M1 tolls included. 5★ on Google.",
    intro:
      "Coleraine to Dublin Airport is a reserved long transfer south from the Causeway Coast: the A26 to the M2, through Belfast onto the M1 and A1, across the border and down the M1 to the airport. My Airport Taxi NI quotes it as a Dublin Airport fare with applicable M1 tolls included, and this page already has Dublin Airport selected — you add your pickup street. First-wave Dublin flights mean very early starts from the north coast, so the booking form accepts overnight pickup times. Tell us your terminal when you know it. Coming home from Dublin Airport to Coleraine or Portrush? Book the collection here with your flight number; we monitor inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Enter the full address, including any holiday-let name. Add a return to keep both directions on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `The A26 and M2 to Belfast, then the M1 and A1 south and the M1 in the Republic, is the usual line. The Belfast section and the run past Newry are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Coleraine, Portrush, Portstewart or anywhere on the Causeway Coast and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Coleraine is booked on this page. Add the flight number so we can monitor the landing time; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Coleraine to Dublin Airport is a long cross-border run, booked ahead with the fare confirmed before you travel.",
    localAreasText:
      "Coleraine, Portrush and Portstewart are separate pickups. Castlerock, Bushmills and Ballymoney are priced from the village address. Holiday lets need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Coleraine to Dublin Airport?",
        answer:
          "Enter your Coleraine, Portrush or Portstewart address in the quote box for the fixed price from your street. Applicable M1 tolls are included. If an instant price is not shown for your address, request a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Coleraine to Dublin Airport take?",
        answer:
          "It is the longest booking from the north coast — the A26 and M2 to Belfast, then the M1 and A1 south — so the quote shows the mapped time from your exact street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "What if my flight into Dublin Airport is delayed?",
        answer:
          "Add the flight number when you book. We monitor it where possible and adjust the collection, and airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Which Dublin Airport terminal do you drop off at?",
        answer: "Terminal 1 or Terminal 2 — check with your airline and tell us when you book.",
      },
      {
        question: "Can I book Dublin Airport back to Coleraine?",
        answer:
          "Yes. Book the collection on this page with your flight number. Your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
];

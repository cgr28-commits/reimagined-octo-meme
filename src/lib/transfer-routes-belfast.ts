import type { TransferRouteContent } from "@/lib/town-transfer-types";

const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

/**
 * Existing Belfast outbound URLs only. Do not add a Belfast location hub,
 * and do not rename these slugs. Dublin keeps the airport canonical.
 */
export const TRANSFER_ROUTE_BELFAST: TransferRouteContent[] = [
  {
    slug: "belfast-to-belfast-international",
    townSlug: "belfast",
    airportCode: "BFS",
    title: "Belfast to Belfast International Airport Taxi",
    h1: "Belfast to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Belfast to Belfast International at Aldergrove. Pre-book the M2/M22 journey, including early flights and a return collection.",
    intro:
      "Belfast to Belfast International Airport is the Aldergrove journey from the city itself: hotels around the city centre, offices, south Belfast and the Titanic Quarter, rather than a suburban pickup further along the motorway. My Airport Taxi NI pre-books that door-to-door run so an early long-haul or holiday departure is not left to a car that still has to reach you through the morning peak. The quote box on this page already has Belfast International selected. Enter the Belfast street or hotel and the calculator returns the fixed price for that pin. Most city departures use the M2 and then the M22 towards Aldergrove. The airport guide already describes this as around 30 minutes from Belfast city centre in normal traffic; the quote tool maps the time from the address you enter, because a Titanic Quarter hotel is not the same start as a south Belfast street. Express Drop-Off and the applicable airport access charge are included in your fixed fare. If you are flying back into Aldergrove, add a return or book the inbound on its own and share the flight number so the collection can be adjusted where we can monitor the arrival.",
    journeyInfo: `Belfast to Belfast International usually leaves the city on the M2 and continues on the M22 towards Aldergrove. The airport guide describes this as around 30 minutes from Belfast city centre in normal traffic. ${TRAFFIC}`,
    goingToAirport:
      "We collect from your Belfast hotel, home or office and drive you to Belfast International. Book ahead of check-in, especially for an early long-haul departure when the M2 is already busy. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International to Belfast is booked as a return or a one-way inbound. Share the flight number so we can monitor the arrival where possible and adjust the planned collection. After you clear arrivals, use the private-hire pickup point confirmed in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "This page is the Belfast city departure to Aldergrove: a reserved car for the M2/M22 run, with the fare confirmed before you pay.",
    localAreasText:
      "City-centre hotels, business districts, south Belfast and the Titanic Quarter are the usual starts. Enter the full street or hotel name. A Titanic Quarter collection joins the M2 later than a city-centre address, so the quote should use that pin.",
    faqs: [
      {
        question: "How much is a taxi from Belfast to Belfast International Airport?",
        answer:
          "The quote box on this page already has Belfast International selected. Enter the Belfast hotel or street. A Titanic Quarter pin is not the same start as south Belfast, so we do not publish one city fare for Aldergrove.",
      },
      {
        question: "How long does Belfast to Belfast International take?",
        answer:
          "The airport guide describes Belfast International as around 30 minutes from Belfast city centre in normal traffic. Most city departures use the M2 and then the M22. The quote tool maps the time from the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book an early-morning taxi from Belfast to Aldergrove?",
        answer:
          "Yes. The quote form accepts overnight and early pickups. A reserved car matters when you still have to join the M2 before a long-haul check-in.",
      },
      {
        question: "Which drop-off do you use at Belfast International?",
        answer:
          "Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
      },
      {
        question: "What if I have several suitcases for a holiday flight?",
        answer:
          "Enter the suitcase count on the quote form so the booking matches the vehicle offered. Saloon and Estate carry up to 4 passengers. Business Class carries 1–3 passengers and up to 2 large suitcases. A 7 Seater Minibus is available when offered in the quote. Enter all passengers and luggage before choosing your vehicle.",
      },
      {
        question: "Can I book a return collection at Belfast International?",
        answer:
          "Yes. Choose Return on the quote form, or book the inbound on its own. Share the flight number so we can monitor the arrival where possible. Airport pickups include up to 60 minutes complimentary waiting. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
    ],
  },
  {
    slug: "belfast-to-belfast-city",
    townSlug: "belfast",
    airportCode: "BHD",
    title: "Belfast to Belfast City Airport Taxi",
    h1: "Belfast to Belfast City Airport Taxi",
    metaDescription:
      "Private taxi from Belfast to George Best Belfast City Airport. A short Sydenham journey for city and business flights, with a return collection.",
    intro:
      "George Best Belfast City Airport sits on the Sydenham side of Belfast, close to the city centre and the Titanic Quarter, rather than out at Aldergrove. This page is only for that shorter City Airport journey. My Airport Taxi NI pre-books it from city-centre hotels, offices, south Belfast and the Titanic Quarter so a morning short-haul or business flight has a car reserved before the city is moving. Belfast City Airport is already selected in the quote box. Enter the hotel or street and you see the fixed price for that pickup. The usual line is the A2 and the Sydenham Bypass, not the M2 towards the International airport. The airport guide describes City Airport as around 15 minutes from Belfast city centre in normal traffic; the quote tool still maps your address, because a Titanic Quarter hotel is a different start from a south Belfast street. Express Drop-Off and the applicable airport access charge are included in your fixed fare. If you are landing back at City Airport, book the return or a one-way collection and give us the flight number so the planned pickup can move where we are able to monitor the arrival.",
    journeyInfo: `Belfast to George Best Belfast City Airport is the short Sydenham run, usually via the A2 and the Sydenham Bypass, not the M2 out to Aldergrove. The airport guide describes it as around 15 minutes from Belfast city centre in normal traffic. ${TRAFFIC}`,
    goingToAirport:
      "Door-to-door from your Belfast address to City Airport, booked so the drop-off sits ahead of a short-haul or business check-in. Morning traffic on the Sydenham Bypass is the reason to leave a buffer even though the airport is close to the city. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport back to a Belfast hotel or home is a return or a one-way inbound. Share the flight number so we can adjust the planned collection where monitoring is possible. Use the private-hire pickup point in your confirmation. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Belfast is a short booked run via Sydenham. It is not the Aldergrove page, and it is not a car taken from the rank outside the terminal.",
    localAreasText:
      "Titanic Quarter hotels are the closest common start, and Cathedral Quarter stays are a frequent City Airport collection. City-centre offices and south Belfast addresses are collected too. Name the hotel or the street.",
    faqs: [
      {
        question: "How much is a taxi from Belfast to Belfast City Airport?",
        answer:
          "The quote box already has George Best Belfast City Airport selected. Enter the city hotel or street. We do not publish one Belfast fare, because a Titanic Quarter collection is a different pin from south Belfast or a city-centre office.",
      },
      {
        question: "How long does Belfast to Belfast City Airport take?",
        answer:
          "The airport guide describes City Airport as around 15 minutes from Belfast city centre in normal traffic, usually via the A2 and Sydenham Bypass. The quote tool maps the time from your address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is this the right page if I am flying from Aldergrove?",
        answer:
          "No. This page is only for George Best Belfast City Airport at Sydenham. Belfast International has its own Belfast transfer page, linked below with the other airports from the city.",
      },
      {
        question: "Can you collect me at City Airport for a Belfast hotel?",
        answer:
          "Yes. Add a return or book the inbound on its own, and name the hotel. Share the flight number so the planned collection can move with the landing where we can monitor the flight. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Should I book ahead for a morning business flight?",
        answer:
          "Yes. A short-haul departure still needs a car reserved before the Sydenham Bypass fills. Complete the quote on this page and pay online where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "belfast-to-dublin-airport",
    legacySlugs: ["belfast-to-dublin"],
    townSlug: "belfast",
    airportCode: "DUB",
    title: "Belfast to Dublin Airport Taxi",
    h1: "Belfast to Dublin Airport Taxi",
    metaDescription:
      "Private taxi from Belfast to Dublin Airport. A cross-border A1/M1 transfer, with M1 tolls included on the fare the quote shows.",
    intro:
      "Belfast to Dublin Airport is a Northern Ireland departure to the Republic: a cross-border transfer on the A1 and M1, not a local run to Aldergrove or City Airport. My Airport Taxi NI pre-books that journey from city-centre hotels, offices, south Belfast and the Titanic Quarter. Applicable M1 tolls are included on the Dublin Airport fare the quote shows. Dublin Airport is already selected. Enter the Belfast address and the calculator confirms the fixed price before you pay. The airport guide describes the journey as around two hours from Belfast in normal traffic. Border timing and the hour you leave still change the day, so use the mapped time on the quote for your street and leave a proper buffer for an early Dublin departure, including an overnight pickup when the flight needs it. Tell us the terminal when you know it so a return collection can be arranged at the right arrivals point. Drop-off on the way south follows the Dublin Airport arrangement used on our other Dublin pages. This page is the outbound from Belfast. Landing at Dublin and continuing north is a separate inbound booking.",
    journeyInfo: `Belfast to Dublin Airport follows the A1/M1 corridor across the border. The airport guide describes it as around two hours from Belfast in normal traffic. Applicable M1 tolls are included on the quoted Dublin fare. ${TRAFFIC}`,
    goingToAirport:
      "We collect at your Belfast door and drive you to Dublin Airport. Book far enough ahead of check-in for a cross-border journey, including overnight pickups for early flights. Applicable M1 tolls are included on Dublin Airport fares. Drop-off follows the Dublin Airport arrangement used on our other Dublin pages. Tell us the terminal when you know it for the way back.",
    fromAirport:
      "Travelling from Dublin Airport to Belfast is a separate inbound page, or the return leg on this quote. Share the flight number and the terminal. We monitor the arrival where possible and adjust the planned Belfast collection. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "This is the outbound Belfast to Dublin Airport booking: a cross-border fare with M1 tolls included, confirmed before you pay.",
    localAreasText:
      "City-centre hotels, offices, south Belfast and the Titanic Quarter. Enter the full address. A south Belfast start is not the same pin as a city-centre hotel when the journey joins the A1.",
    faqs: [
      {
        question: "How much is a taxi from Belfast to Dublin Airport?",
        answer:
          "The quote box on this page already has Dublin Airport selected. Enter the Belfast address. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows. We do not publish one Belfast–Dublin fare, because the pickup pin changes the mapped start.",
      },
      {
        question: "How long does Belfast to Dublin Airport take?",
        answer:
          "The airport guide describes Dublin Airport as around two hours from Belfast in normal traffic, usually via the A1 and M1. Traffic conditions along the A1/M1 corridor can add to that. The quote tool maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are M1 tolls included from Belfast to Dublin Airport?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows for this Belfast departure.",
      },
      {
        question: "Can I book an early Belfast pickup for a Dublin departure?",
        answer:
          "Yes. Overnight and very early Belfast pickups are accepted on the quote form. Leave a buffer for a cross-border run rather than treating Dublin like a Belfast airport.",
      },
      {
        question: "Which Dublin terminal should I name?",
        answer:
          "Tell us the terminal when you know it so a return collection uses the right arrivals point. Drop-off on the way out follows the Dublin Airport arrangement already used on our other Dublin pages.",
      },
      {
        question: "Can I add the journey back from Dublin Airport to Belfast?",
        answer:
          "Yes. Choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare. Landing at Dublin and travelling only northbound is also covered on the separate Dublin Airport to Belfast page.",
      },
    ],
  },
  {
    slug: "belfast-to-city-of-derry",
    townSlug: "belfast",
    airportCode: "LDY",
    title: "Belfast to City of Derry Airport Taxi",
    h1: "Belfast to City of Derry Airport Taxi",
    metaDescription:
      "Private taxi from Belfast to City of Derry Airport at Eglinton. A longer inter-city transfer from Belfast, with a return collection.",
    intro:
      "Belfast to City of Derry Airport is a longer inter-city transfer to Eglinton. It is not a short hop across Belfast, and it is not a local taxi from Derry city centre to the terminal. My Airport Taxi NI runs this route for passengers leaving the greater Belfast area — city-centre hotels, business districts, south Belfast and the Titanic Quarter — when the ticket is from City of Derry Airport rather than Aldergrove or City Airport. The quote box already has City of Derry Airport selected. Enter the Belfast address and the calculator returns the fixed price and the mapped time for that street. We do not publish a single Belfast to Eglinton duration, because the start pin and the time of day change the run. Book it ahead of check-in and treat it as a full journey, especially for an early departure to the north-west. If you are landing at Eglinton and coming back to Belfast, add a return or book the inbound collection and share the flight number so we can monitor the arrival where possible.",
    journeyInfo: `Belfast to City of Derry Airport is a longer inter-city transfer to Eglinton, for passengers leaving the greater Belfast area. We do not publish a single journey time. ${TRAFFIC}`,
    goingToAirport:
      "We collect from your Belfast address and drive you to City of Derry Airport. Book it ahead of check-in as a full journey, particularly for an early departure. The quote tool shows the mapped time once you enter the street.",
    fromAirport:
      "Travelling from City of Derry Airport to Belfast is booked as a return or a one-way inbound. Share the flight number so we can monitor the arrival where possible. After landing, use the private-hire pickup point confirmed in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "This page is the Belfast departure to Eglinton: an inter-city booking, not a local Derry airport hop.",
    localAreasText:
      "Belfast city-centre hotels, business districts, south Belfast and the Titanic Quarter. The pickup on this page should be in the greater Belfast area. Enter the full street so the quote uses that start.",
    faqs: [
      {
        question: "How much is a taxi from Belfast to City of Derry Airport?",
        answer:
          "The quote box already has City of Derry Airport selected. Enter the Belfast hotel or street. This is an inter-city fare to Eglinton, not a local Derry price, and we do not publish one figure for every Belfast start.",
      },
      {
        question: "How long does Belfast to City of Derry Airport take?",
        answer:
          "This is a longer inter-city transfer between Belfast and City of Derry Airport at Eglinton. We do not publish a single duration. The quote tool maps the time from the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is this a local taxi from Derry city to the airport?",
        answer:
          "No. We specialise in transfers between City of Derry Airport and the greater Belfast area, not short local hops inside Derry. The pickup on this page should be a Belfast address.",
      },
      {
        question: "Can I book a return from City of Derry Airport to Belfast?",
        answer:
          "Yes. Choose Return on the quote form or book the inbound on its own. Share the flight number. We monitor it where possible, and airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Should I book this Belfast to Eglinton journey in advance?",
        answer:
          "Yes. Treat it as a full journey, especially for an early departure. Complete the quote on this page and pay online where an instant fare is shown.",
      },
    ],
  },
];

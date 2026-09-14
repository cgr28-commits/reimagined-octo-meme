import type { TransferRouteContent } from "@/lib/town-transfer-types";

const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

const QUOTE_PRICE =
  "Use our instant quote tool to see the current fixed price for your journey. We do not publish a single town-to-airport fare because the price depends on your exact pickup address and the inclusions that apply.";

const QUOTE_TIME =
  "Enter your pickup address in the quote box on this page. The same mapping used for every booking shows the driving distance and a typical time for that street. " +
  TRAFFIC;

export const TRANSFER_ROUTE_CONTENT: TransferRouteContent[] = [
  {
    slug: "newtownabbey-to-belfast-international",
    townSlug: "newtownabbey",
    airportCode: "BFS",
    title: "Newtownabbey to Belfast International Airport Taxi",
    h1: "Newtownabbey to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Newtownabbey to Belfast International Airport. Fixed-price airport transfers, flight monitoring and secure online booking.",
    intro:
      "My Airport Taxi NI provides pre-booked private transfers between Newtownabbey and Belfast International Airport (Aldergrove). This is the holiday and long-haul terminal most Newtownabbey families fly from, and the M2 from Sandyknowes is the corridor we use day in, day out. You enter your Glengormley, Jordanstown, Mallusk or town address in the quote box — the airport is already selected — and the existing calculator returns the fixed price for that street. A driver is reserved for your pickup time, so you are not relying on a local taxi being free before a 06:00 check-in. Share your flight number if we are collecting you on the way back; we monitor arrivals where possible and airport pickups include complimentary waiting. WhatsApp is available if you need to confirm the meeting point or a suitcase count. Returns can be added on the same form when you want both legs booked together.",
    journeyInfo: `Most Newtownabbey departures join the M2 at Sandyknowes and continue onto the M22 towards Aldergrove. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect door to door from your home, hotel or workplace in Newtownabbey and drive you to Belfast International. Book in advance so the pickup time can sit ahead of your check-in, especially on Friday holiday peaks when the M2 is busier. At the airport we use the drop-off option you choose on the quote — Belfast International offers Express or free-area access where that choice is shown. We do not promise a named kerb beyond what the booking form already describes.",
    fromAirport:
      "The reverse journey is a Belfast International → Newtownabbey collection. Add a return on the quote form or book the inbound leg on its own. Give us the flight number so we can monitor landing time. After you clear arrivals, go to the agreed private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting time from the adjusted collection; waiting beyond that may be charged.",
    whyBookIntro:
      "This Newtownabbey–Aldergrove page uses the same booked service as the rest of the site — a confirmed fare, a reserved driver, and flight monitoring when you are being collected at the airport.",
    localAreasText:
      "We collect across Newtownabbey including Glengormley, Carnmoney, Whiteabbey, Jordanstown, Monkstown and Mallusk. Enter the full street so the quote is calculated for that pickup, not a generic town centre pin.",
    faqs: [
      {
        question: "How much is a taxi from Newtownabbey to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Newtownabbey to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return airport transfer?",
        answer:
          "Yes. Choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare. Each leg keeps its own inclusions.",
      },
      {
        question: "What happens if my flight into Belfast International is delayed?",
        answer:
          "Share the flight number when you book. We monitor the flight where possible and adjust the planned Newtownabbey collection. Airport pickups include up to 60 minutes complimentary waiting time.",
      },
      {
        question: "Can I book an early-morning taxi from Newtownabbey to Aldergrove?",
        answer:
          "Yes. The quote form accepts overnight and early pickups. A reserved car matters more at 04:30 than hoping a local taxi is free on the Shore Road.",
      },
      {
        question: "Can I book this Newtownabbey transfer online?",
        answer:
          "Yes. Complete the quote on this page and pay securely online where an instant fare is shown. WhatsApp is available if you need help with the booking.",
      },
    ],
  },
  {
    slug: "newtownabbey-to-belfast-city-airport",
    legacySlugs: ["newtownabbey-to-belfast-city"],
    townSlug: "newtownabbey",
    airportCode: "BHD",
    title: "Newtownabbey to Belfast City Airport Taxi",
    h1: "Newtownabbey to Belfast City Airport Taxi",
    metaDescription:
      "Private taxi from Newtownabbey to George Best Belfast City Airport. Fixed-price transfers, online booking and flight monitoring on airport pickups.",
    intro:
      "George Best Belfast City Airport is the shorter of the two Belfast terminals from much of Newtownabbey, especially Whiteabbey and Jordanstown on the Shore Road. My Airport Taxi NI runs pre-booked private transfers to City Airport so a business or short-haul flight is not left to a last-minute car. The quote box on this page already has Belfast City Airport selected; you add the pickup street and the rest of the booking details. We use the A2 / M3 / Sydenham Bypass corridor rather than sending you across the city without a plan. Meet & greet can be requested during booking where it is offered. If you also fly from Aldergrove or Dublin, those journeys have their own Newtownabbey pages — this one is only for City Airport. Returns, flight monitoring on inbound collections and WhatsApp contact work the same way as our other routes. The mapped distance and time appear after you enter the address, because traffic on the Shore Road changes through the day.",
    journeyInfo: `Newtownabbey to City Airport usually follows the Shore Road or the M3 towards the Sydenham Bypass, depending on the pickup street. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Newtownabbey address, booked in advance so the drop-off sits before your check-in. City Airport security is often quicker than Aldergrove, but we still leave a buffer for the A2. Drop-off uses the Express or free-area option shown on the quote for Belfast City Airport — we do not invent an extra meeting door beyond that choice.",
    fromAirport:
      "Book City Airport → Newtownabbey as a return or a one-way inbound. Flight monitoring adjusts the collection when you give us the flight number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Newtownabbey is a short booked run — still a reserved driver and a fixed price, not a rank taxi at Sydenham.",
    localAreasText:
      "Whiteabbey and Jordanstown are particularly close to this route; Glengormley, Carnmoney, Monkstown and Mallusk are collected via Sandyknowes or the Shore Road depending on the address.",
    faqs: [
      {
        question: "How much is a taxi from Newtownabbey to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long is Newtownabbey to Belfast City Airport?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return from City Airport to Newtownabbey?",
        answer:
          "Yes. Use Return on the quote form. Instant online return prices include a 5% discount on the combined fare where that price is shown.",
      },
      {
        question: "What if my City Airport flight is late?",
        answer:
          "We monitor the flight where possible and hold the Newtownabbey collection to the landing time. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Jordanstown for City Airport?",
        answer:
          "Yes. Enter the campus or street address. Ulster University Jordanstown pickups should include the building name.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. The calculator on this page is the same booking flow as the homepage, with Belfast City Airport already selected.",
      },
    ],
  },
  {
    slug: "newtownabbey-to-dublin-airport",
    legacySlugs: ["newtownabbey-to-dublin"],
    townSlug: "newtownabbey",
    airportCode: "DUB",
    title: "Newtownabbey to Dublin Airport Taxi",
    h1: "Newtownabbey to Dublin Airport Taxi",
    metaDescription:
      "Pre-book a Newtownabbey to Dublin Airport taxi. Fixed-price cross-border transfer with flight monitoring, included tolls and online booking.",
    intro:
      "Dublin Airport is a full cross-border booking from Newtownabbey, not a local hop. My Airport Taxi NI runs private transfers from Glengormley, Mallusk and the rest of the borough down the M2/M1/A1 corridor, with applicable M1 tolls included on Dublin Airport fares as they are on our other Dublin pages. The quote on this page already selects Dublin Airport; you enter the Newtownabbey pickup and see the live fixed price for that address. Early Dublin departures are common from North Belfast suburbs — we accept overnight pickups on the same form. Tell us the terminal when you know it so the inbound meeting point can be confirmed. Flight monitoring applies to Dublin collections, with complimentary waiting on airport pickups. A return can be booked together if you want the same arrangement on the way back to Newtownabbey.",
    journeyInfo: `Newtownabbey to Dublin Airport uses the M2 onto the M1/A1 south. It is a longer reserved diary slot than either Belfast airport. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Newtownabbey door and drive you to Dublin Airport. Book far enough ahead of check-in for a cross-border run; the quote tool shows the mapped time for your street. Drop-off follows the Dublin Airport arrangement already used on our Dublin transfer pages. Applicable tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Newtownabbey is booked as a return or a one-way inbound. We monitor the flight where possible and meet you at the confirmed pickup point after landing. Complimentary waiting on airport pickups is up to 60 minutes. Share the terminal when you know it.",
    whyBookIntro:
      "A Newtownabbey–Dublin booking is a reserved long transfer with the same fixed-price checkout, flight monitoring and WhatsApp contact as our Belfast airport routes.",
    localAreasText:
      "Mallusk and Glengormley have a slightly quicker start onto the M2 than Whiteabbey or Jordanstown. Enter the exact street so the mapped route starts in the right place.",
    faqs: [
      {
        question: "How much is a taxi from Newtownabbey to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Newtownabbey to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return from Dublin Airport to Newtownabbey?",
        answer:
          "Yes. Select Return on the quote form. Instant online returns include a 5% combined-fare discount where that price is shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Give us the flight number. We monitor it where possible and adjust the Newtownabbey collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you do early-morning Dublin pickups from Newtownabbey?",
        answer:
          "Yes. Overnight and very early Newtownabbey pickups for first-wave Dublin flights are booked on this form.",
      },
      {
        question: "Are tolls extra?",
        answer:
          "Applicable road tolls are included on Dublin Airport fares. Ordinary NI address-to-address journeys do not add separate toll charges.",
      },
    ],
  },
  {
    slug: "carrickfergus-to-belfast-international",
    townSlug: "carrickfergus",
    airportCode: "BFS",
    title: "Carrickfergus to Belfast International Airport Taxi",
    h1: "Carrickfergus to Belfast International Airport Taxi",
    metaDescription:
      "Book a Carrickfergus to Belfast International Airport taxi. Fixed-price private transfer with online booking and flight monitoring.",
    intro:
      "Carrickfergus to Belfast International is an inland run once you leave the harbour: most bookings join the A8 or cut to the M2 rather than staying on the coast all the way. My Airport Taxi NI pre-books that journey so an early Aldergrove flight is not left to a town-centre taxi that may already be on a school run. The quote on this page has Belfast International selected; you enter the Marine Highway, Greenisland or estate address and receive the fixed price for that street. We collect door to door from homes and harbour hotels. Share a flight number for the inbound collection and we monitor landing time where possible. Complimentary waiting applies to airport pickups. Add a return if you want Carrickfergus collection arranged for the way back as well.",
    journeyInfo: `Typical Carrickfergus to Aldergrove paths use the A2 then the M2/M22, or the A8 inland depending on traffic. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door pickup from your Carrickfergus address, reserved in advance so you have time for check-in at Belfast International. Drop-off uses the Express or free-area choice shown on the quote. We do not name an extra terminal door beyond that option.",
    fromAirport:
      "Belfast International → Carrickfergus is the inbound. Book it as a return or a one-way. Flight monitoring and up to 60 minutes complimentary waiting apply on the airport collection. After landing, use the private-hire point in your confirmation.",
    whyBookIntro:
      "From the harbour to Aldergrove you want a reserved car and a confirmed fare — the same booking rules as the rest of My Airport Taxi NI.",
    localAreasText:
      "We collect from Carrickfergus town, Greenisland, Woodburn, Eden and Sunnylands. Hotel guests should include the property name along the Marine Highway.",
    faqs: [
      {
        question: "How much is a taxi from Carrickfergus to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Carrickfergus to Aldergrove take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Carrickfergus?",
        answer:
          "Yes. Use Return on the quote form. Instant online combined fares include a 5% discount where that price is shown.",
      },
      {
        question: "What happens if my Aldergrove flight is delayed?",
        answer:
          "We monitor the flight where possible and adjust the Carrickfergus collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book a very early Carrickfergus pickup?",
        answer:
          "Yes. The form accepts overnight and early-morning times. A pre-booked car is the reliable option before the first ferry or flight.",
      },
      {
        question: "Can I book online from a harbour hotel?",
        answer:
          "Yes. Enter the hotel name and address. The airport is already selected on this page.",
      },
    ],
  },
  {
    slug: "carrickfergus-to-belfast-city-airport",
    townSlug: "carrickfergus",
    airportCode: "BHD",
    title: "Carrickfergus to Belfast City Airport Taxi",
    h1: "Carrickfergus to Belfast City Airport Taxi",
    metaDescription:
      "Carrickfergus to Belfast City Airport private taxi. Fixed-price A2 transfer with flight monitoring and secure online booking.",
    intro:
      "Belfast City Airport is the more coastal of the two Belfast terminals from Carrickfergus. The A2 towards Whiteabbey and the Sydenham Bypass is the corridor we plan around, which is why a booked car still matters when that road is slow. My Airport Taxi NI collects from the town, Greenisland and harbour hotels and drops you at City Airport with the fare fixed before you travel. This page preselects Belfast City Airport in the quote box. If you are flying from Aldergrove or Dublin instead, use those Carrickfergus route pages so the calculator starts on the right terminal. Inbound collections use flight monitoring and complimentary airport waiting. WhatsApp is available if the hotel pickup needs a specific entrance. Enter the full street rather than “Carrickfergus” alone so the quote uses the real start, not a town-centre pin.",
    journeyInfo: `Carrickfergus to City Airport is usually an A2 / Sydenham Bypass run. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your door in Carrickfergus or Greenisland and take you to Belfast City Airport. Book ahead of check-in and allow for A2 traffic through Whiteabbey. Drop-off follows the Express or free-area option on the quote — we do not add an unofficial meeting point.",
    fromAirport:
      "City Airport → Carrickfergus can be the return leg or a one-way inbound. After landing, go to the agreed pickup point. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "A short coastal airport run still uses a reserved driver, a confirmed price, and the same online checkout as our longer routes.",
    localAreasText:
      "Greenisland is often closer to this A2 path than Woodburn or Eden. Enter the street so the mapped start is correct.",
    faqs: [
      {
        question: "How much is a taxi from Carrickfergus to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long is the journey to City Airport?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return journey?",
        answer:
          "Yes. Select Return on the quote form. A 5% discount applies to instant online combined fares where shown.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Share the flight number. We adjust the Carrickfergus collection where we can monitor the flight. Complimentary waiting on airport pickups is up to 60 minutes.",
      },
      {
        question: "Do you collect from Greenisland?",
        answer:
          "Yes. Enter the Greenisland street on this form. It is treated as a Carrickfergus-area pickup, not a Belfast city job.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast City Airport is already selected. Complete the quote and pay online where an instant fare appears.",
      },
    ],
  },
  {
    slug: "carrickfergus-to-dublin-airport",
    townSlug: "carrickfergus",
    airportCode: "DUB",
    title: "Carrickfergus to Dublin Airport Taxi",
    h1: "Carrickfergus to Dublin Airport Taxi",
    metaDescription:
      "Carrickfergus to Dublin Airport private transfer. Fixed-price cross-border taxi with flight monitoring, included tolls and online booking.",
    intro:
      "A Carrickfergus to Dublin Airport booking is a reserved long transfer: you leave the A2, cross Belfast’s motorway box, and continue on the M1/A1. My Airport Taxi NI prices that journey as a Dublin Airport fare, with applicable tolls included, rather than as a local Carrick taxi plus a hope that someone will take you south. This page preselects Dublin Airport. Enter the harbour, Greenisland or estate address and the calculator returns the fixed price for that pin. Early first-wave flights are the usual reason Carrickfergus customers book this route — the form accepts overnight pickups. Tell us the Dublin terminal when you know it. Flight monitoring and complimentary waiting apply when we collect you at Dublin for the journey home. The quote tool shows the mapped time for your street; we do not publish a single Carrickfergus–Dublin duration because the A2 and border approaches vary.",
    journeyInfo: `Carrickfergus to Dublin Airport combines the A2/M2 start with the M1/A1 south. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection in Carrickfergus, booked with enough time for a cross-border check-in. Drop-off follows our standard Dublin Airport arrangement. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Carrickfergus is available as a return or a one-way inbound. We monitor the flight where possible, meet you at the confirmed pickup point, and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "This is a pre-booked cross-border private transfer with the same secure checkout and WhatsApp contact as our Belfast airport pages.",
    localAreasText:
      "Harbour hotels and Greenisland add different opening minutes onto the A2. Use the full address so the mapped route is honest.",
    faqs: [
      {
        question: "How much is a taxi from Carrickfergus to Dublin Airport?",
        answer: `${QUOTE_PRICE} Dublin Airport fares include applicable M1 tolls.`,
      },
      {
        question: "How long does Carrickfergus to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return?",
        answer:
          "Yes. Choose Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if the Dublin flight is late?",
        answer:
          "We monitor the flight where possible and adjust the Carrickfergus inbound. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you pick up very early in Carrickfergus for Dublin?",
        answer:
          "Yes. Overnight and early-morning departures are booked on this page.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Dublin Airport is preselected. Pay securely online where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "ballyclare-to-belfast-international",
    townSlug: "ballyclare",
    airportCode: "BFS",
    title: "Ballyclare to Belfast International Airport Taxi",
    h1: "Ballyclare to Belfast International Airport Taxi",
    metaDescription:
      "Ballyclare to Belfast International Airport taxi. Short A57 private transfer with a fixed online price and flight monitoring on collections.",
    intro:
      "Ballyclare is one of the more convenient towns for Belfast International: the A57 through Templepatrick is the road most of our Aldergrove bookings use from here. My Airport Taxi NI still treats it as a reserved private transfer — a confirmed fare and a driver assigned to your time — because a short run is no help if nobody is available at 05:00. This page preselects Belfast International. Enter your Ballyclare, Doagh or Ballynure address and the existing calculator prices that street. Inbound collections use flight monitoring and complimentary airport waiting. If you are flying from City Airport or Dublin instead, use those Ballyclare route pages so the wrong terminal is not selected. Returns can be added on the form. The quote shows the mapped time for your street; school-run traffic in the town can change the first few minutes even when the A57 itself is clear.",
    journeyInfo: `Ballyclare to Belfast International is usually the A57 towards Templepatrick and Aldergrove. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your door in Ballyclare and take you to Belfast International. Book ahead of check-in even on this shorter run. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Belfast International → Ballyclare is booked as a return or inbound one-way. After landing, use the agreed pickup point. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "A short A57 run still uses the same fixed-price checkout, reserved driver and flight monitoring as our longer airport pages.",
    localAreasText:
      "Doagh and Ballynure are collected when you enter those streets. Ballyeaston pickups should use the full address so the mapped start is not the town square.",
    faqs: [
      {
        question: "How much is a taxi from Ballyclare to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Ballyclare to Aldergrove take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Ballyclare?",
        answer:
          "Yes. Select Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Ballyclare collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early-morning Ballyclare pickup?",
        answer:
          "Yes. Early and overnight times are accepted on this form. Pre-booking matters even on a short A57 run.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast International is already selected. Complete the quote on this page.",
      },
    ],
  },
  {
    slug: "ballyclare-to-belfast-city-airport",
    townSlug: "ballyclare",
    airportCode: "BHD",
    title: "Ballyclare to Belfast City Airport Taxi",
    h1: "Ballyclare to Belfast City Airport Taxi",
    metaDescription:
      "Ballyclare to Belfast City Airport private taxi. Fixed-price transfer via the M2 with online booking and flight monitoring.",
    intro:
      "Belfast City Airport from Ballyclare is the longer of the two Belfast runs: you leave the A57 corridor and join the M2 towards the city and the Sydenham Bypass. My Airport Taxi NI books that as a reserved private transfer so a short-haul or business flight is not dependent on a town taxi being free. This page preselects City Airport. Enter the Ballyclare pickup — or Doagh or Ballynure if that is the real start — and the calculator uses the same pricing engine as the homepage. We do not treat this as a local Antrim hop. Inbound flight monitoring, complimentary airport waiting, optional returns and WhatsApp contact match our other City Airport pages. If your ticket is actually from Aldergrove, use the Belfast International Ballyclare page so the wrong terminal is not selected.",
    journeyInfo: `Ballyclare to City Airport typically uses the Ballyclare Road / M2 towards Sydenham rather than the A57 to Aldergrove. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from Ballyclare, booked with enough time for City Airport check-in after the M2. Drop-off uses the Express or free-area choice shown on the quote.",
    fromAirport:
      "City Airport → Ballyclare can be a return or a one-way inbound. We monitor the flight where possible. After landing, go to the private-hire point in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "This is a booked M2 transfer with a fixed price, not a last-minute Ballyclare taxi asked to go to Sydenham.",
    localAreasText:
      "Town-centre, Doagh and Ballynure starts produce different opening minutes onto the M2. Enter the street you want us to use.",
    faqs: [
      {
        question: "How much is a taxi from Ballyclare to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Ballyclare to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return?",
        answer:
          "Yes. Use Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What happens if the flight is delayed?",
        answer:
          "We monitor the flight where possible and adjust the Ballyclare collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Is this the same journey as Aldergrove?",
        answer:
          "No. Belfast International from Ballyclare usually uses the A57. City Airport uses the M2 towards Sydenham. Use the matching route page so the quote starts on the correct airport.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast City Airport is preselected on this page.",
      },
    ],
  },
  {
    slug: "ballyclare-to-dublin-airport",
    townSlug: "ballyclare",
    airportCode: "DUB",
    title: "Ballyclare to Dublin Airport Taxi",
    h1: "Ballyclare to Dublin Airport Taxi",
    metaDescription:
      "Ballyclare to Dublin Airport taxi. Fixed-price cross-border private transfer with flight monitoring, included tolls and online booking.",
    intro:
      "Dublin Airport from Ballyclare is a reserved long booking: the A57/M2 start, then the M1/A1 south. My Airport Taxi NI quotes it as a Dublin Airport fare, including applicable tolls, through the same checkout as our other Dublin pages. This page preselects Dublin Airport so you only add the Ballyclare — or Doagh / Ballynure — pickup and passenger details. First-wave Dublin flights need an early start from the town; the form accepts overnight times. Tell us the terminal when you know it. Flight monitoring and complimentary waiting apply when we collect you at Dublin for the journey home. If you only need Aldergrove or City Airport, use those shorter Ballyclare pages instead. The live quote is the source for distance and time; we do not print a single Ballyclare–Dublin figure that would be wrong for half the streets in the town.",
    journeyInfo: `Ballyclare to Dublin Airport is a cross-border M2/M1/A1 journey, not an A57 local run. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect door to door in Ballyclare and drive to Dublin Airport. Allow a full check-in buffer for a cross-border departure. Applicable M1 tolls are included on Dublin Airport fares. Drop-off follows our standard Dublin Airport arrangement.",
    fromAirport:
      "Dublin Airport → Ballyclare is available as a return or inbound one-way. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "A Ballyclare–Dublin transfer uses the same fixed-price engine, flight monitoring and WhatsApp contact as our other airport routes.",
    localAreasText:
      "Doagh and Ballynure change the opening minutes onto the M2. Enter the real pickup street rather than “Ballyclare” alone.",
    faqs: [
      {
        question: "How much is a taxi from Ballyclare to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Ballyclare to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Ballyclare?",
        answer:
          "Yes. Select Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Ballyclare collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early-morning departure?",
        answer:
          "Yes. Overnight and early Ballyclare pickups for Dublin are booked on this page.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Dublin Airport is already selected. Pay online where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "lisburn-to-belfast-international",
    townSlug: "lisburn",
    airportCode: "BFS",
    title: "Lisburn to Belfast International Airport Taxi",
    h1: "Lisburn to Belfast International Airport Taxi",
    metaDescription:
      "Lisburn to Belfast International Airport taxi. Fixed-price M1/M2 private transfer with flight monitoring and secure online booking.",
    intro:
      "Lisburn to Belfast International usually starts on the M1 and crosses to the M2/M22 for Aldergrove. My Airport Taxi NI pre-books that corridor from homes, hotels and businesses around Lisburn, Sprucefield, Hillsborough, Lambeg and Hilden. The quote on this page already has Belfast International selected; you enter the pickup street and the calculator returns the fixed price for that address. Friday holiday traffic on the M1 is the main reason we do not treat this as a casual local taxi job. Share a flight number for the inbound collection. Complimentary waiting applies to airport pickups. A return can be added if you want the Lisburn drop-off reserved on the way back. WhatsApp is available if a hotel needs a named entrance. Use the mapped distance in the quote rather than assuming every BT27 address is the same run from Sprucefield.",
    journeyInfo: `Lisburn to Aldergrove typically uses the M1 then the M2/M22. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Lisburn-area address, booked ahead of check-in. Drop-off at Belfast International uses the Express or free-area option shown on the quote. We do not promise a named kerb beyond that choice.",
    fromAirport:
      "Belfast International → Lisburn is the inbound. Book it as a return or one-way. We monitor the flight where possible. After landing, use the private-hire point in the confirmation. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "Lisburn–Aldergrove bookings use the same reserved driver, fixed checkout and flight monitoring as our other airport pages.",
    localAreasText:
      "Sprucefield, Hillsborough, Lambeg, Hilden and Dunmurry are collected when you enter those addresses. Hotel guests should include the property name.",
    faqs: [
      {
        question: "How much is a taxi from Lisburn to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Lisburn to Aldergrove take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Lisburn?",
        answer:
          "Yes. Choose Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my flight is delayed?",
        answer:
          "We monitor the flight where possible and adjust the Lisburn collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Hillsborough for Aldergrove?",
        answer:
          "Yes. Enter the Hillsborough address on this form so the mapped start is not Lisburn city centre.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast International is preselected. Use the quote box on this page.",
      },
    ],
  },
  {
    slug: "lisburn-to-belfast-city-airport",
    legacySlugs: ["lisburn-to-belfast-city"],
    townSlug: "lisburn",
    airportCode: "BHD",
    title: "Lisburn to Belfast City Airport Taxi",
    h1: "Lisburn to Belfast City Airport Taxi",
    metaDescription:
      "Lisburn to Belfast City Airport taxi. Fixed-price private transfer via the M1 and Westlink, with flight monitoring on airport pickups.",
    intro:
      "Belfast City Airport from Lisburn is a city-corridor job: M1, Westlink, M3 and the Sydenham Bypass, not the Aldergrove M22. My Airport Taxi NI books it as a reserved private transfer because that box of roads is exactly where peak traffic sits. This page preselects City Airport. Enter your Lisburn, Lambeg, Dunmurry or Hillsborough street and the existing calculator prices the pin. Business and short-haul flights are the usual reason for this route. Inbound collections use flight monitoring and complimentary waiting. If you are flying from Belfast International or Dublin, open those Lisburn pages instead so the quote starts on the correct airport. WhatsApp is available if a hotel or office pickup needs a named entrance rather than a postcode drop on the Lisburn Road.",
    journeyInfo: `Lisburn to City Airport typically uses the M1 / Westlink / M3 rather than the M22. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect door to door and take you to Belfast City Airport. Book with a check-in buffer that allows for Westlink traffic. Drop-off uses the Express or free-area option on the quote.",
    fromAirport:
      "City Airport → Lisburn is available as a return or inbound one-way. After landing, use the agreed pickup point. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "A Lisburn–Sydenham booking is still a confirmed fare and a reserved driver, paid through the same secure checkout.",
    localAreasText:
      "Dunmurry and Lambeg sit closer to the M1 than Hillsborough. Enter the real street so the mapped minutes are not guessed from the city centre.",
    faqs: [
      {
        question: "How much is a taxi from Lisburn to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Lisburn to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return?",
        answer:
          "Yes. Use Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my City Airport flight is late?",
        answer:
          "Share the flight number. We adjust the Lisburn collection where we can monitor the flight. Complimentary waiting on airport pickups is up to 60 minutes.",
      },
      {
        question: "Can I book an early-morning City Airport transfer from Lisburn?",
        answer:
          "Yes. The form accepts early pickups. The Westlink is quieter then, but we still reserve the car to your time.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast City Airport is already selected on this page.",
      },
    ],
  },
  {
    slug: "lisburn-to-dublin-airport",
    legacySlugs: ["lisburn-to-dublin"],
    townSlug: "lisburn",
    airportCode: "DUB",
    title: "Lisburn to Dublin Airport Taxi",
    h1: "Lisburn to Dublin Airport Taxi",
    metaDescription:
      "Lisburn to Dublin Airport taxi. Fixed-price A1 transfer with flight monitoring, included tolls and secure online booking.",
    intro:
      "Lisburn is already on the A1 corridor, which is why Dublin Airport is often the more natural long run from here than it is from the north of the city. My Airport Taxi NI quotes Lisburn to Dublin Airport as a cross-border private transfer with applicable M1 tolls included. This page preselects Dublin Airport. Enter the Lisburn, Sprucefield or Hillsborough pickup and the calculator returns the live fixed price. Early Dublin departures from BT27/BT28 are a regular part of the diary — overnight times are accepted. Tell us the terminal when you know it. Flight monitoring and complimentary waiting apply on the Dublin collection for the journey home. Returns can be booked on the same form. Use the quote box for the mapped time from your street; we do not invent a single Lisburn–Dublin duration for every BT27 and BT28 address.",
    journeyInfo: `Lisburn to Dublin Airport usually joins the A1/M1 south from the M1 junctions around Sprucefield. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection in the Lisburn area, booked with a cross-border check-in buffer. Drop-off follows our standard Dublin Airport arrangement. Applicable tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Lisburn is booked as a return or inbound one-way. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport pickup.",
    whyBookIntro:
      "Lisburn’s place on the A1 makes this a core Dublin Airport route for us — still a reserved car, a fixed price, and the same checkout as the homepage.",
    localAreasText:
      "Sprucefield and Hillsborough are common starts. Lambeg and Hilden add a short M1 approach before the A1. Enter the street you want collected.",
    faqs: [
      {
        question: "How much is a taxi from Lisburn to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Lisburn to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Lisburn?",
        answer:
          "Yes. Select Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if the Dublin flight is delayed?",
        answer:
          "We monitor the flight where possible and adjust the Lisburn collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you pick up early from Lisburn for Dublin?",
        answer:
          "Yes. Overnight and early BT27/BT28 pickups for first-wave Dublin flights are booked on this page.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Dublin Airport is preselected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "bangor-to-belfast-international",
    townSlug: "bangor",
    airportCode: "BFS",
    title: "Bangor to Belfast International Airport Taxi",
    h1: "Bangor to Belfast International Airport Taxi",
    metaDescription:
      "Bangor to Belfast International Airport taxi. Fixed-price North Down transfer with flight monitoring and secure online booking.",
    intro:
      "Bangor to Belfast International is one of our most requested early pickups. The A2 into Belfast and then the M3/M2 to Aldergrove is a longer reserved slot than a City Airport hop, which is why holiday families book the night before. My Airport Taxi NI collects from Bangor town, Ballyholme, Groomsport, Helen’s Bay and Crawfordsburn and takes you to Belfast International with the fare confirmed in advance. This page preselects that airport. Enter the pickup street and the homepage calculator does the rest. We monitor inbound flights where possible and include complimentary waiting on airport collections. Add a return if you want the Bangor drop-off reserved as well. WhatsApp is available if a marina hotel needs a named door. The quote shows distance and time for the address you enter, because an A2 delay at Holywood can change the run from one morning to the next.",
    journeyInfo: `Bangor to Aldergrove typically follows the A2 then the M3/M2. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Bangor-area address, booked ahead of check-in. Allow for A2 traffic, especially through Holywood. Drop-off at Belfast International uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Belfast International → Bangor is the inbound. Book it as a return or one-way. After landing, use the private-hire point in the booking. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport pickup.",
    whyBookIntro:
      "North Down to Aldergrove is a reserved early-morning job for us — fixed price, flight monitoring, and the same online checkout as the rest of the site.",
    localAreasText:
      "Ballyholme, Groomsport, Helen’s Bay, Crawfordsburn and Clandeboye are collected when you enter those streets. Marina hotels should include the property name.",
    faqs: [
      {
        question: "How much is a taxi from Bangor to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Bangor to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Bangor?",
        answer:
          "Yes. Choose Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my Aldergrove flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Bangor collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book a 4am taxi from Bangor to Aldergrove?",
        answer:
          "Yes. Overnight and early pickups are accepted. A reserved car is the reliable option on the A2 before dawn.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast International is already selected on this page.",
      },
    ],
  },
  {
    slug: "bangor-to-belfast-city-airport",
    legacySlugs: ["bangor-to-belfast-city"],
    townSlug: "bangor",
    airportCode: "BHD",
    title: "Bangor to Belfast City Airport Taxi",
    h1: "Bangor to Belfast City Airport Taxi",
    metaDescription:
      "Bangor to Belfast City Airport taxi. Fixed-price A2 private transfer with flight monitoring and online booking.",
    intro:
      "Belfast City Airport is the shorter airport from Bangor: the A2 towards Holywood and the Sydenham Bypass is the usual path. My Airport Taxi NI still pre-books it. A slow A2 or a full local taxi list is a poor start to a business flight. This page selects City Airport in the quote box. Enter your Bangor, Ballyholme or Helen’s Bay address and the calculator returns the fixed price for that street. Meet & greet can be requested during booking where it is offered. If you are flying from Aldergrove or Dublin, use those Bangor pages instead. Inbound collections use flight monitoring and complimentary airport waiting. Returns can be added on the form. Use the mapped time in the quote rather than assuming a clear dual carriageway from the marina to Sydenham.",
    journeyInfo: `Bangor to City Airport is typically an A2 / Sydenham Bypass run. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Bangor-area door and take you to Belfast City Airport. Book ahead of check-in and allow for A2 traffic at Holywood. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "City Airport → Bangor can be a return or a one-way inbound. After landing, go to the agreed pickup point. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport collection.",
    whyBookIntro:
      "The short North Down hop to City Airport still uses a reserved driver and a confirmed fare — the same rules as our longer airport pages.",
    localAreasText:
      "Helen’s Bay and Crawfordsburn sit on the A2 towards the airport; Groomsport and Ballyholme add a few minutes through Bangor town. Enter the real street.",
    faqs: [
      {
        question: "How much is a taxi from Bangor to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Bangor to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return?",
        answer:
          "Yes. Use Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "We monitor the flight where possible and adjust the Bangor collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Helen’s Bay?",
        answer:
          "Yes. Enter the Helen’s Bay address on this City Airport page so the mapped start is not Bangor marina.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Belfast City Airport is preselected.",
      },
    ],
  },
  {
    slug: "bangor-to-dublin-airport",
    legacySlugs: ["bangor-to-dublin"],
    townSlug: "bangor",
    airportCode: "DUB",
    title: "Bangor to Dublin Airport Taxi",
    h1: "Bangor to Dublin Airport Taxi",
    metaDescription:
      "Bangor to Dublin Airport taxi. Fixed-price North Down to Dublin transfer with flight monitoring, included tolls and online booking.",
    intro:
      "Bangor to Dublin Airport is a long reserved transfer: the A2 into Belfast, then the M1/A1 south. My Airport Taxi NI quotes it as a Dublin Airport fare with applicable tolls included. This is one of the earliest pickup types we run from North Down — first-wave Dublin flights need the car booked, not hoped for on the marina. This page preselects Dublin Airport. Enter your Bangor, Ballyholme or Crawfordsburn address and the calculator returns the live fixed price. Tell us the terminal when you know it. Flight monitoring and complimentary waiting apply when we collect you at Dublin for the journey back to Bangor. Returns can be booked together on the form. The quote tool is the source for distance and typical time; we do not print one Bangor–Dublin figure for every North Down street.",
    journeyInfo: `Bangor to Dublin Airport combines the A2 into Belfast with the M1/A1 south. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection in the Bangor area, booked with a full cross-border check-in buffer. Drop-off follows our standard Dublin Airport arrangement. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Bangor is available as a return or inbound one-way. We monitor the flight where possible and include up to 60 minutes complimentary waiting on the airport pickup.",
    whyBookIntro:
      "North Down to Dublin is a core early-morning booking for us — reserved driver, fixed price, flight monitoring, and WhatsApp if you need to reach us.",
    localAreasText:
      "Groomsport and Ballyholme sit further out than Crawfordsburn or Helen’s Bay. Enter the street so the mapped A2 start is correct.",
    faqs: [
      {
        question: "How much is a taxi from Bangor to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Bangor to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book a return to Bangor?",
        answer:
          "Yes. Select Return on the quote form. Instant online combined fares include a 5% discount where shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Bangor collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you do overnight Bangor pickups for Dublin?",
        answer:
          "Yes. First-wave Dublin flights from North Down are a regular overnight booking on this page.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. Dublin Airport is already selected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "holywood-to-belfast-international",
    townSlug: "holywood",
    airportCode: "BFS",
    title: "Holywood to Belfast International Airport Taxi",
    h1: "Holywood to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Holywood to Belfast International Airport. Fixed-price transfer from Cultra, Seahill or the town with online booking.",
    intro:
      "A Holywood to Belfast International Airport taxi is the westbound motorway job from the North Down A2: you leave Cultra, Craigavad, Seahill or the town, pass the Harbour Estate, and join the M3/M2 toward Aldergrove. It is not the short City Airport hop Holywood residents know well — International sits on the far side of the city, so the reserved pickup time matters more than a quiet Sunday guess. My Airport Taxi NI quotes a fixed price from your exact street, not a rank estimate from High Street. Enter the address in the box on this page; Belfast International is already selected. Travelling from Belfast International Airport to Holywood? Book the collection here with your flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Add a return when you want both legs on one booking. WhatsApp is available if the plan changes after you pay.",
    journeyInfo: `Typical routing uses the A2 into Belfast, then the M3 and M2 west toward the airport. An incident at Sydenham or Sandyknowes can add time that is not obvious when you set an alarm in Holywood. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect door to door from Holywood, Cultra, Seahill or Craigavad and drive you to Belfast International. Book ahead of check-in — this is the long Belfast-side of the city, not the City Airport hop. Drop-off uses the Express or free-area option shown on the quote. We do not promise a named kerb beyond what the booking form already describes.",
    fromAirport:
      "Travelling from Belfast International Airport to Holywood is booked on this same page. Add a return or a one-way inbound, and give us the flight number so we can monitor landing time. After you clear arrivals, use the private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting from the adjusted collection.",
    whyBookIntro:
      "Holywood to Aldergrove uses the same booked service as the rest of the site — a confirmed fare, a reserved driver, and flight monitoring when we are collecting you at the airport.",
    localAreasText:
      "Cultra lanes and Seahill houses should include the name or number. Marino and Helen’s Bay are collected on this corridor. Marina-side apartments need the block, not only a BT18 postcode.",
    faqs: [
      {
        question: "How much is a taxi from Holywood to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Holywood to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast International Airport back to Holywood?",
        answer:
          "Yes. This page is the canonical booking for both directions. Enter the Holywood drop-off, choose airport pickup, and add the flight number.",
      },
      {
        question: "What if my flight into Belfast International is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Holywood collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early-morning transfer from Holywood?",
        answer:
          "Yes. First-wave International departures from North Down are a regular booking. Pay online when an instant fare is shown.",
      },
      {
        question: "Can I book and pay online?",
        answer:
          "Yes. Belfast International is preselected. Complete the quote and pay securely where an instant fare is available.",
      },
    ],
  },
  {
    slug: "holywood-to-belfast-city-airport",
    townSlug: "holywood",
    airportCode: "BHD",
    title: "Holywood to Belfast City Airport Taxi",
    h1: "Holywood to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Holywood to George Best Belfast City Airport. Fixed-price A2 / Sydenham transfer with online booking.",
    intro:
      "Holywood to George Best Belfast City Airport is the shortest of the three airport runs from this town: the A2 and Sydenham Bypass put the terminal on the same coastal corridor as Cultra and Marino. That closeness is why people still under-book it — a delayed Shore Road, a cruise-day queue at the Harbour Estate, or a 06:30 BA departure is enough to miss the flight if you leave the pickup to chance. My Airport Taxi NI reserves a private car from your Holywood, Seahill or Helen’s Bay address with a fixed price from the quote box on this page. City Airport is already selected. Travelling from Belfast City Airport to Holywood? Use this same page, add the flight number, and we will collect from the official pickup point. We monitor inbound flights where possible and include complimentary waiting on airport pickups. WhatsApp is available if you need to reach us. Add a return when you want the trip back from the terminal booked with the outbound.",
    journeyInfo: `The usual line is the A2 toward Belfast, then the signed City Airport turn at Sydenham. Roadworks on the Bypass change the last mile more often than the town-centre lights. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Holywood-area address, booked so the drop-off sits before check-in. City Airport security is often quicker than Aldergrove, but the A2 still needs a buffer on weekday mornings. Drop-off uses the Express or free-area option shown on the quote for Belfast City Airport.",
    fromAirport:
      "Book City Airport → Holywood as a return or a one-way inbound on this page. Flight monitoring adjusts the collection when you give us the flight number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Holywood is a short booked run along the same coastal corridor — still a reserved driver and a fixed price, not a last-minute rank at Sydenham.",
    localAreasText:
      "Helen’s Bay and Seahill are North Down coastal pickups — include the house name. Cultra and Marino should give the lane. Town-centre flats need the building, not only “Holywood”.",
    faqs: [
      {
        question: "How much is a taxi from Holywood to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does the Holywood to City Airport journey take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast City Airport back to Holywood?",
        answer:
          "Yes. Airport-to-Holywood is booked on this page. Add the flight number so we can watch the inbound.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Tell us the flight number. We monitor it where possible. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Cultra for City Airport?",
        answer:
          "Yes. Enter the Cultra address in the quote box. The map prices that street, not a generic Holywood pin.",
      },
      {
        question: "Can I pay online?",
        answer:
          "Yes. Where the quote shows an instant fare you can complete booking and payment on this page.",
      },
    ],
  },
  {
    slug: "holywood-to-dublin-airport",
    townSlug: "holywood",
    airportCode: "DUB",
    title: "Holywood to Dublin Airport Taxi",
    h1: "Holywood to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Holywood to Dublin Airport. Fixed-price North Down to Dublin transfer with tolls included and online booking.",
    intro:
      "Holywood to Dublin Airport is the long A1/M1 day from the North Down coast: you leave the A2, cross the city, and settle onto the dual carriageway south. North Down customers book this more than they expect — Ryanair and Aer Lingus banks at Dublin are often cheaper or better timed than the Belfast options, but the start from Seahill or Craigavad is still an early alarm. My Airport Taxi NI quotes a fixed price from your exact Holywood-area address. Applicable M1 tolls are included on Dublin Airport fares; you do not settle them in the car. Dublin Airport is preselected in the quote box. Travelling from Dublin Airport to Holywood? Book the inbound on this page with the flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Add a return when you want both legs together. WhatsApp is available if the plan changes.",
    journeyInfo: `After Belfast the route is the A1 toward Newry and the M1 to the airport. An incident south of Sprucefield is the delay that does not show on a Holywood weather app. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Holywood, Cultra or Seahill door and drive you to Dublin Airport. Book far enough ahead of check-in for a cross-border run; the quote tool shows the mapped time for your street. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Travelling from Dublin Airport to Holywood is booked here. Share the flight number so we can monitor the inbound where possible. After you clear arrivals, go to the agreed private-hire pickup point. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "North Down to Dublin is a reserved diary slot — a fixed price with tolls included, not a rank fare assembled on the M1.",
    localAreasText:
      "Give the full BT18 address. Cultra and Marino lanes need the house name so the driver does not wait on the A2. Helen’s Bay is collected with this Holywood-area booking when that is the street you enter.",
    faqs: [
      {
        question: "How much is a taxi from Holywood to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Holywood to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Dublin Airport back to Holywood?",
        answer:
          "Yes. This page covers both directions. Add the flight number and the Holywood drop-off address.",
      },
      {
        question: "Are tolls included?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Holywood collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an overnight pickup in Holywood?",
        answer:
          "Yes. First-wave Dublin departures from North Down are a regular overnight booking.",
      },
    ],
  },
  {
    slug: "antrim-to-belfast-international",
    townSlug: "antrim",
    airportCode: "BFS",
    title: "Antrim to Belfast International Airport Taxi",
    h1: "Antrim to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Antrim to Belfast International Airport. Fixed-price transfer from Templepatrick, Muckamore or the town with online booking.",
    intro:
      "Antrim to Belfast International Airport is the shortest International run we quote from a full town: the A26 and the airport access roads put Aldergrove next door to Templepatrick, Muckamore and Dunadry, and only a short hop from Antrim town and Crumlin. Closeness is not the same as leaving it late — security queues and a 05:50 departure still need a reserved car, not a hope that a local taxi is free. My Airport Taxi NI gives you a fixed price from the street you enter in the quote box; Belfast International is already selected. Travelling from Belfast International Airport to Antrim? Book the collection on this page with your flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Randalstown and Crumlin addresses are priced from those streets, not from Antrim bus station. WhatsApp is available if you need to reach us. Add a return when you want both legs on one booking.",
    journeyInfo: `From the town the usual line is the A26 toward the airport. Templepatrick and hotel collections near the A57 often use the local airport roads rather than going into Antrim first. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect from Antrim town, Templepatrick, Muckamore or Dunadry and drive you to Belfast International. Book so the pickup sits ahead of your check-in even on this short run. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Travelling from Belfast International Airport to Antrim is booked on this page. Add the flight number so we can monitor landing time. After arrivals, use the private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Antrim to Aldergrove is a short booked hop — still a confirmed fare and a reserved driver, not a last-minute search outside the terminal.",
    localAreasText:
      "Name the hotel or house. Templepatrick and Dunadry properties look similar on a map until the driver has the right lane. Crumlin and Randalstown should include the village so the quote does not pin Antrim town.",
    faqs: [
      {
        question: "How much is a taxi from Antrim to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Antrim to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast International Airport back to Antrim?",
        answer:
          "Yes. Travelling from Belfast International Airport to Antrim is booked on this same page. Add the flight number and your Antrim-area address.",
      },
      {
        question: "What happens if my flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Antrim collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Templepatrick?",
        answer:
          "Yes. Enter the Templepatrick or hotel address. The quote uses that pin, which is often closer to the terminal than Antrim town.",
      },
      {
        question: "Can I book and pay online?",
        answer:
          "Yes. Belfast International is preselected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "antrim-to-belfast-city-airport",
    townSlug: "antrim",
    airportCode: "BHD",
    title: "Antrim to Belfast City Airport Taxi",
    h1: "Antrim to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Antrim to George Best Belfast City Airport. Fixed-price M2 transfer with online booking.",
    intro:
      "Antrim to George Best Belfast City Airport is the motorway job east: you leave the Lough Neagh towns, join the M2, and stay on it until the City Airport / Harbour Estate signs at the other end of Belfast. It is a different shape to the International hop Antrim residents know — more city traffic at the far end, and a terminal that rewards a reserved arrival more than a hopeful extra ten minutes. My Airport Taxi NI quotes from your Antrim, Muckamore, Randalstown or Crumlin address with City Airport already selected in the box on this page. Travelling from Belfast City Airport to Antrim? Use this page, add the flight number, and we collect from the official pickup area. We monitor inbound flights where possible and include complimentary waiting on airport pickups. WhatsApp is available after you book. Add a return when you want the homeward leg reserved with the outbound.",
    journeyInfo: `The M2 is the spine. An incident at Sandyknowes or York Street is the delay that does not appear when you check the time in Antrim town. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Antrim-area address, booked so drop-off sits before City Airport check-in. The far end is the Harbour Estate, not Aldergrove — leave the buffer the quote time implies. Drop-off uses the Express or free-area option shown on the form.",
    fromAirport:
      "Book City Airport → Antrim as a return or inbound on this page. Flight monitoring applies when you share the number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "Antrim to City Airport is an M2 booked run — a fixed price and a reserved driver, not a rank at Sydenham after a late train.",
    localAreasText:
      "Crumlin and Randalstown need the village in the address so the map does not pin Antrim Castle Gardens by default. Muckamore and Dunadry hotels should include the property name.",
    faqs: [
      {
        question: "How much is a taxi from Antrim to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Antrim to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast City Airport back to Antrim?",
        answer:
          "Yes. This page covers both directions. Add the flight number for the inbound collection.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Tell us the flight number. We monitor it where possible. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early City Airport transfer from Antrim?",
        answer:
          "Yes. Weekday morning City Airport runs from Antrim are a regular booking. Pay online when an instant fare is shown.",
      },
      {
        question: "Can I pay online?",
        answer:
          "Yes. Complete the quote on this page and pay securely where an instant fare is available.",
      },
    ],
  },
  {
    slug: "antrim-to-dublin-airport",
    townSlug: "antrim",
    airportCode: "DUB",
    title: "Antrim to Dublin Airport Taxi",
    h1: "Antrim to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Antrim to Dublin Airport. Fixed-price transfer with M1 tolls included and online booking.",
    intro:
      "Antrim to Dublin Airport is the long southbound day from Lough Neagh: you leave town or Templepatrick, join the M2 or A26 toward Belfast, then commit to the A1/M1. Antrim customers book Dublin when the fare or the connection is better than International — but the clock starts in a different county to the terminal, so the pickup time is the part that cannot be guessed. My Airport Taxi NI shows a fixed price from your exact address. Applicable M1 tolls are included on Dublin Airport fares. Dublin Airport is preselected here. Travelling from Dublin Airport to Antrim? Book that inbound on this page with the flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Dunadry and Muckamore hotels should be named in the pickup field. WhatsApp is available if you need to reach us. Add a return when you want both legs together.",
    journeyInfo: `After the M2 the route is the A1 and M1. A closure at Sprucefield or Newry is the delay Antrim weather will not mention. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Antrim, Templepatrick or Crumlin door and drive you to Dublin Airport. Book far enough ahead for a cross-border run; the quote tool shows the mapped time for your street. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Travelling from Dublin Airport to Antrim is booked on this page. Share the flight number so we can monitor the inbound where possible. After arrivals, use the agreed private-hire pickup point. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Antrim to Dublin is a reserved cross-border slot — fixed price, tolls included, and flight monitoring on the way home.",
    localAreasText:
      "Use the full street and townland. Randalstown and Crumlin are not interchangeable with Antrim town on the map. Hotel guests at Dunadry should include the property name.",
    faqs: [
      {
        question: "How much is a taxi from Antrim to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Antrim to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Dublin Airport back to Antrim?",
        answer:
          "Yes. Travelling from Dublin Airport to Antrim is booked on this page. Add the flight number and your drop-off address.",
      },
      {
        question: "Are M1 tolls included?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare shown by the quote tool.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Antrim collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an overnight Antrim pickup?",
        answer:
          "Yes. First-wave Dublin flights from the Antrim area are a regular overnight booking.",
      },
    ],
  },
  {
    slug: "ballymena-to-belfast-international",
    townSlug: "ballymena",
    airportCode: "BFS",
    title: "Ballymena to Belfast International Airport Taxi",
    h1: "Ballymena to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Ballymena to Belfast International Airport. Fixed-price A26 transfer from Galgorm, Broughshane or the town.",
    intro:
      "Ballymena to Belfast International Airport follows the A26 south through mid-Antrim — a dual-carriageway run rather than a city crawl, which is why Galgorm guests and Broughshane, Cullybackey, Ahoghill and Gracehill residents treat International as their local long-haul terminal. “Local” still means a reserved car: the first easyJet wave does not wait because someone in the town centre was running late. My Airport Taxi NI quotes a fixed price from the street or hotel you enter; Belfast International is already selected. Travelling from Belfast International Airport to Ballymena? Book the collection here with your flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Hotel names matter at Galgorm — several properties share similar countryside postcodes. WhatsApp is available if plans change. Add a return when you want the trip back from the airport booked with the outbound.",
    journeyInfo: `The A26 is the usual line from the town toward the airport. Broughshane collections join from the A42; Cullybackey comes in from the west before that dual carriageway. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect from Ballymena, Galgorm, Broughshane or the surrounding villages and drive you to Belfast International. Book so the pickup sits ahead of check-in on the first holiday wave. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Travelling from Belfast International Airport to Ballymena is booked on this page. Add the flight number so we can monitor landing time. After arrivals, use the private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Ballymena to Aldergrove is a mid-Antrim booked run — a confirmed fare and a reserved driver, not a last-minute car on the A26.",
    localAreasText:
      "Name the Galgorm hotel or the Broughshane lane. “Ballymena” alone is not enough for a countryside pin. Ahoghill and Gracehill sit west of the town and should be spelled in the address.",
    faqs: [
      {
        question: "How much is a taxi from Ballymena to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Ballymena to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast International Airport back to Ballymena?",
        answer:
          "Yes. This page is for both directions. Add the flight number and your Ballymena-area address.",
      },
      {
        question: "What if my flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Ballymena collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Galgorm?",
        answer:
          "Yes. Enter the hotel or house name. The quote prices that countryside address, not the town bus station.",
      },
      {
        question: "Can I book and pay online?",
        answer:
          "Yes. Belfast International is preselected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "ballymena-to-belfast-city-airport",
    townSlug: "ballymena",
    airportCode: "BHD",
    title: "Ballymena to Belfast City Airport Taxi",
    h1: "Ballymena to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Ballymena to George Best Belfast City Airport. Fixed-price A26/M2 transfer with online booking.",
    intro:
      "Ballymena to George Best Belfast City Airport continues past International country and onto the M2: you leave mid-Antrim, run the A26, then stay eastbound through Belfast to the Harbour Estate. It is the terminal people book for short-haul banks that suit a day trip better than Aldergrove. My Airport Taxi NI fixes the price from your Ballymena, Galgorm or Broughshane address; City Airport is preselected on this page. Travelling from Belfast City Airport to Ballymena? Use this same booking, add the flight number, and we collect from the official pickup area. We monitor inbound flights where possible and include complimentary waiting on airport pickups. WhatsApp is available if you need to reach us. Add a return when you want both legs reserved together.",
    journeyInfo: `A26 then M2 is the standard line. York Street and the Harbour Estate are where a clear Ballymena run can still lose time at the end. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Ballymena-area address, booked so drop-off sits before City Airport check-in. The last miles are the Harbour Estate, not the A26. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Book City Airport → Ballymena as a return or inbound on this page. Flight monitoring applies when you share the number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "Ballymena to City Airport is a reserved A26/M2 run — a fixed price, not a hope that a town taxi will take the Harbour Estate job.",
    localAreasText:
      "Ahoghill and Gracehill should be spelled in the address. They are west of the town, not a Galgorm hotel turning. Cullybackey collections come in before the A26.",
    faqs: [
      {
        question: "How much is a taxi from Ballymena to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Ballymena to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast City Airport back to Ballymena?",
        answer:
          "Yes. Airport-to-Ballymena is booked on this page. Add the flight number for the inbound.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Tell us the flight number. We monitor it where possible. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early-morning transfer from Ballymena?",
        answer:
          "Yes. Weekday City Airport starts from mid-Antrim are a regular booking. Pay online when an instant fare is shown.",
      },
      {
        question: "Can I pay online?",
        answer:
          "Yes. Complete the quote on this page and pay securely where an instant fare is available.",
      },
    ],
  },
  {
    slug: "ballymena-to-dublin-airport",
    townSlug: "ballymena",
    airportCode: "DUB",
    title: "Ballymena to Dublin Airport Taxi",
    h1: "Ballymena to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Ballymena to Dublin Airport. Fixed-price mid-Antrim to Dublin transfer with tolls included.",
    intro:
      "Ballymena to Dublin Airport is the longest of the three journeys from this hub: A26 south, M2, then the A1/M1 for the rest of the morning. Mid-Antrim customers book it when Dublin’s schedule or fare beats both Belfast airports — and they need a start time that respects the whole corridor, not a guess based on an International run they do every month. My Airport Taxi NI quotes a fixed price from your exact address. Applicable M1 tolls are included on Dublin Airport fares. Dublin Airport is already selected. Travelling from Dublin Airport to Ballymena? Book the inbound here with the flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Cullybackey and Broughshane add lanes before you even reach the A26; include those villages in the pickup field. WhatsApp is available if the plan changes. Add a return when you want both legs on one booking.",
    journeyInfo: `After the A26/M2 the route is the A1 and M1. Newry or Sprucefield trouble is the delay a Ballymena forecast will not show. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Ballymena, Galgorm or Broughshane door and drive you to Dublin Airport. Book far enough ahead for a cross-border run; the quote tool shows the mapped time for your street. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Travelling from Dublin Airport to Ballymena is booked on this page. Share the flight number so we can monitor the inbound where possible. After arrivals, use the agreed private-hire pickup point. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Mid-Antrim to Dublin is a reserved day on the diary — fixed price, tolls included, and a reserved driver for both directions.",
    localAreasText:
      "Galgorm hotels and Gracehill houses need the name. The town-centre pin is the wrong start for those collections. Cullybackey should be written in full.",
    faqs: [
      {
        question: "How much is a taxi from Ballymena to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Ballymena to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Dublin Airport back to Ballymena?",
        answer:
          "Yes. This page covers both directions. Add the flight number and your Ballymena-area drop-off.",
      },
      {
        question: "Are tolls included?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Ballymena collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you do overnight Ballymena pickups for Dublin?",
        answer:
          "Yes. First-wave Dublin flights from mid-Antrim are a regular overnight booking on this page.",
      },
    ],
  },
  {
    slug: "larne-to-belfast-international",
    townSlug: "larne",
    airportCode: "BFS",
    title: "Larne to Belfast International Airport Taxi",
    h1: "Larne to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Larne to Belfast International Airport. Fixed-price A8/M2 transfer from Glynn, Islandmagee or the harbour town.",
    intro:
      "Larne to Belfast International Airport leaves the ferry port and the lough, joins the A8, then turns west on the M2 toward Aldergrove. It is a cross-country shape — harbour town to inland airport — which is why Glynn, Magheramorne, Islandmagee and Ballygally collections need the extra coastal minutes before you even reach the dual carriageway. My Airport Taxi NI quotes a fixed price from the address you enter; Belfast International is already selected. Travelling from Belfast International Airport to Larne? Book the inbound on this page with your flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Harbour hotels and Islandmagee lanes should be named, not listed as “Larne”. WhatsApp is available if a sailing or flight time moves. Add a return when you want both legs reserved together.",
    journeyInfo: `A8 to the M2, then west to the airport, is the usual line. An incident at the A8/M2 join is the delay that does not show on a Larne harbour webcam. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect from Larne, Glynn, Islandmagee or Ballygally and drive you to Belfast International. Book so the coastal lanes are in the diary before the A8. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Travelling from Belfast International Airport to Larne is booked on this page. Add the flight number so we can monitor landing time. After arrivals, use the private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Larne to Aldergrove is a harbour-to-inland booked run — a confirmed fare and a reserved driver, not a last-minute car after a sailing.",
    localAreasText:
      "Islandmagee and Ballygally need the lane or house name. Ferry-terminal pickups should say which building. Whitehead sits toward Carrickfergus and is collected when that is the address you enter.",
    faqs: [
      {
        question: "How much is a taxi from Larne to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Larne to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast International Airport back to Larne?",
        answer:
          "Yes. Travelling from Belfast International Airport to Larne is booked on this page. Add the flight number and your Larne-area address.",
      },
      {
        question: "What if my flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Larne collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Islandmagee?",
        answer:
          "Yes. Enter the Islandmagee address. The quote map prices that peninsula, not Larne Main Street.",
      },
      {
        question: "Can I book and pay online?",
        answer:
          "Yes. Belfast International is preselected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "larne-to-belfast-city-airport",
    townSlug: "larne",
    airportCode: "BHD",
    title: "Larne to Belfast City Airport Taxi",
    h1: "Larne to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Larne to George Best Belfast City Airport. Fixed-price A8 transfer from the harbour town or Whitehead.",
    intro:
      "Larne to George Best Belfast City Airport stays on the eastern side of the county: A8 toward Belfast, then the Harbour Estate and Sydenham rather than the westbound M2 peel for International. Whitehead and Magheramorne sit on that same coastal approach; Ballygally and Islandmagee add the lough-shore lanes first. My Airport Taxi NI reserves a private car from your exact address with City Airport preselected in the quote box. Travelling from Belfast City Airport to Larne? Use this page, add the flight number, and we collect from the official pickup area. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Ferry passengers connecting to a City Airport flight should name the terminal building so the driver does not wait in the town. WhatsApp is available if you need to reach us. Add a return when you want the trip back from the airport booked with the outbound.",
    journeyInfo: `The A8 is the spine into north Belfast, then the signed City Airport roads. A queue at the docks can slow the last miles even when Larne itself is clear. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Larne-area address, booked so drop-off sits before City Airport check-in. Harbour and ferry-terminal pickups need the building name. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Book City Airport → Larne as a return or inbound on this page. Flight monitoring applies when you share the number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "Larne to City Airport stays on the east-Antrim corridor — a reserved driver and a fixed price, not a rank after the A8.",
    localAreasText:
      "Whitehead addresses should include the village. Harbour and seafront hotels need the property name. Magheramorne and Glynn sit on the lough before you reach the A8 proper.",
    faqs: [
      {
        question: "How much is a taxi from Larne to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Larne to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast City Airport back to Larne?",
        answer:
          "Yes. This page covers both directions. Add the flight number for the inbound collection.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Tell us the flight number. We monitor it where possible. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early transfer from Larne?",
        answer:
          "Yes. Morning City Airport runs after an overnight in the harbour town are a regular booking. Pay online when an instant fare is shown.",
      },
      {
        question: "Can I pay online?",
        answer:
          "Yes. Complete the quote on this page and pay securely where an instant fare is available.",
      },
    ],
  },
  {
    slug: "larne-to-dublin-airport",
    townSlug: "larne",
    airportCode: "DUB",
    title: "Larne to Dublin Airport Taxi",
    h1: "Larne to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Larne to Dublin Airport. Fixed-price harbour-town to Dublin transfer with M1 tolls included.",
    intro:
      "Larne to Dublin Airport is the long southbound booking from the ferry port: A8 to the M2, through or around Belfast, then the A1/M1 for the rest of the journey. People here book Dublin when the connection beats both Belfast airports — often after a Cairnryan sailing the evening before — and they need a start time that respects the full corridor, not a City Airport guess. My Airport Taxi NI shows a fixed price from your Larne, Glynn, Islandmagee or Whitehead address. Applicable M1 tolls are included on Dublin Airport fares. Dublin Airport is preselected. Travelling from Dublin Airport to Larne? Book that inbound on this page with the flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. WhatsApp is available if a sailing or flight moves. Add a return when you want both legs together.",
    journeyInfo: `After the A8/M2 the route is the A1 and M1. An incident at Newry is the delay a Larne harbour forecast will not mention. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Larne, Islandmagee or Whitehead door and drive you to Dublin Airport. Book far enough ahead for a cross-border run after a ferry night; the quote tool shows the mapped time for your street. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Travelling from Dublin Airport to Larne is booked on this page. Share the flight number so we can monitor the inbound where possible. After arrivals, use the agreed private-hire pickup point. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Harbour town to Dublin is a reserved day — fixed price, tolls included, and a driver who is not piecing the job together at the port.",
    localAreasText:
      "Give the coastal lane or hotel name. Islandmagee and Ballygally are not the same pin as Larne town centre. Ferry-terminal guests should name the building.",
    faqs: [
      {
        question: "How much is a taxi from Larne to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Larne to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Dublin Airport back to Larne?",
        answer:
          "Yes. Travelling from Dublin Airport to Larne is booked on this page. Add the flight number and your drop-off.",
      },
      {
        question: "Are M1 tolls included?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare shown by the quote tool.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Larne collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an overnight Larne pickup for Dublin?",
        answer:
          "Yes. First-wave Dublin flights after a night in the harbour town are a regular overnight booking.",
      },
    ],
  },
  {
    slug: "newry-to-belfast-international",
    townSlug: "newry",
    airportCode: "BFS",
    title: "Newry to Belfast International Airport Taxi",
    h1: "Newry to Belfast International Airport Taxi",
    metaDescription:
      "Book a private taxi from Newry to Belfast International Airport. Fixed-price A1/M1 transfer from Warrenpoint, Bessbrook or the city.",
    intro:
      "Newry to Belfast International Airport is the northbound A1 job that then swings west: you leave the city, Warrenpoint, Rostrevor, Bessbrook or Camlough, run toward Lisburn, and join the M1/M2 for Aldergrove. Newry customers often think Dublin first; International is the Belfast long-haul alternative when the ticket is out of Aldergrove rather than Terminal 1. My Airport Taxi NI quotes a fixed price from your exact street; Belfast International is already selected. Travelling from Belfast International Airport to Newry? Book the collection on this page with your flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Hilltown and Rostrevor add Mournes lanes before the A1 — include those names. WhatsApp is available if you need to reach us. Add a return when you want both legs on one booking.",
    journeyInfo: `A1 north, then the M1/M2 west to the airport, is the usual line. A queue at Sprucefield can add time after a clear run out of Newry. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect from Newry, Warrenpoint, Bessbrook or Camlough and drive you to Belfast International. Book so the northbound A1 and the westbound M1/M2 sit ahead of check-in. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Travelling from Belfast International Airport to Newry is booked on this page. Add the flight number so we can monitor landing time. After arrivals, use the private-hire pickup point in the booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Newry to Aldergrove is a reserved northbound booking — a confirmed fare and a driver who is not treating it as a Dublin job pointed the wrong way.",
    localAreasText:
      "Warrenpoint and Rostrevor should include the town. Bessbrook and Camlough are A25 collections, not Buttercrane. Hilltown is the Mournes approach and needs that name on the quote.",
    faqs: [
      {
        question: "How much is a taxi from Newry to Belfast International Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Newry to Belfast International take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast International Airport back to Newry?",
        answer:
          "Yes. Travelling from Belfast International Airport to Newry is booked on this page. Add the flight number and your Newry-area address.",
      },
      {
        question: "What if my flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Newry collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Warrenpoint?",
        answer:
          "Yes. Enter the Warrenpoint address. The quote prices the lough shore, not Newry city centre.",
      },
      {
        question: "Can I book and pay online?",
        answer:
          "Yes. Belfast International is preselected. Pay securely where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "newry-to-belfast-city-airport",
    townSlug: "newry",
    airportCode: "BHD",
    title: "Newry to Belfast City Airport Taxi",
    h1: "Newry to Belfast City Airport Taxi",
    metaDescription:
      "Book a private taxi from Newry to George Best Belfast City Airport. Fixed-price A1 transfer with online booking.",
    intro:
      "Newry to George Best Belfast City Airport stays on the A1 into Belfast and then takes the city / Harbour Estate roads to Sydenham instead of peeling west for International. It is the booking for City Airport’s short-haul banks when you live in Newry, Bessbrook or Hilltown and do not want a last-minute hunt at the bus station. My Airport Taxi NI fixes the price from the address you enter; City Airport is preselected. Travelling from Belfast City Airport to Newry? Use this page, add the flight number, and we collect from the official pickup area. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Camlough and Warrenpoint are not interchangeable pins — put the village in the pickup field. WhatsApp is available after you book. Add a return when you want the homeward leg reserved with the outbound.",
    journeyInfo: `The A1 is the spine as far as Belfast, then the signed City Airport route. Westlink or Sydenham trouble is the last-mile delay after a clear Newry start. ${QUOTE_TIME}`,
    goingToAirport:
      "Door-to-door collection from your Newry-area address, booked so drop-off sits before City Airport check-in. The last miles are Sydenham, not Aldergrove. Drop-off uses the Express or free-area option shown on the quote.",
    fromAirport:
      "Book City Airport → Newry as a return or inbound on this page. Flight monitoring applies when you share the number. After landing, use the private-hire pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "Newry to City Airport is a reserved A1 booking — a fixed price and a driver who knows the Harbour Estate end, not only the Dublin corridor.",
    localAreasText:
      "Rostrevor and Hilltown need the townland or hotel. City-centre apartments should give the building, not only “Newry”. Bessbrook collections come off the A25.",
    faqs: [
      {
        question: "How much is a taxi from Newry to Belfast City Airport?",
        answer: QUOTE_PRICE,
      },
      {
        question: "How long does Newry to City Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Belfast City Airport back to Newry?",
        answer:
          "Yes. This page covers both directions. Add the flight number for the inbound collection.",
      },
      {
        question: "What if my City Airport flight is delayed?",
        answer:
          "Tell us the flight number. We monitor it where possible. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an early-morning transfer from Newry?",
        answer:
          "Yes. Weekday City Airport starts from Newry are a regular booking. Pay online when an instant fare is shown.",
      },
      {
        question: "Can I pay online?",
        answer:
          "Yes. Complete the quote on this page and pay securely where an instant fare is available.",
      },
    ],
  },
  {
    slug: "newry-to-dublin-airport",
    townSlug: "newry",
    airportCode: "DUB",
    title: "Newry to Dublin Airport Taxi",
    h1: "Newry to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Newry to Dublin Airport. Fixed-price A1/M1 transfer from Warrenpoint or the city, with tolls included.",
    intro:
      "Newry to Dublin Airport is the natural southbound booking from this city: you are already on the A1, the border is minutes away, and the M1 carries you to the terminals that Newry, Warrenpoint and Rostrevor residents use when Belfast does not fit the ticket. That familiarity is why people still leave the pickup too late — a queue at the border or an incident further south is not the same as “sure it’s only down the road.” My Airport Taxi NI quotes a fixed price from your exact address. Applicable M1 tolls are included on Dublin Airport fares. Dublin Airport is preselected. Travelling from Dublin Airport to Newry? Book the inbound on this page with the flight number. We monitor inbound flights where possible and include complimentary waiting on airport pickups. Bessbrook and Camlough should be named so the driver does not wait at the Buttercrane. WhatsApp is available if the plan changes. Add a return when you want both legs together.",
    journeyInfo: `A1 south then the M1 is the usual line. Border delays are the ones a Newry city-centre clock will not show. ${QUOTE_TIME}`,
    goingToAirport:
      "We collect at your Newry, Warrenpoint or Rostrevor door and drive you to Dublin Airport. Book far enough ahead of check-in even on this familiar corridor; the quote tool shows the mapped time for your street. Applicable M1 tolls are included on Dublin Airport fares.",
    fromAirport:
      "Travelling from Dublin Airport to Newry is booked on this page. Share the flight number so we can monitor the inbound where possible. After arrivals, use the agreed private-hire pickup point. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Newry to Dublin is the corridor residents know — still a reserved car, a fixed price with tolls included, and flight monitoring on the way home.",
    localAreasText:
      "Warrenpoint, Rostrevor and Hilltown need the town in the address. City hotels should include the hotel name. Bessbrook and Camlough are not the Buttercrane pin.",
    faqs: [
      {
        question: "How much is a taxi from Newry to Dublin Airport?",
        answer: `${QUOTE_PRICE} Applicable M1 tolls are included on Dublin Airport fares.`,
      },
      {
        question: "How long does Newry to Dublin Airport take?",
        answer: QUOTE_TIME,
      },
      {
        question: "Can I book Dublin Airport back to Newry?",
        answer:
          "Yes. Travelling from Dublin Airport to Newry is booked on this page. Add the flight number and your drop-off address.",
      },
      {
        question: "Are M1 tolls included?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Newry collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book an overnight Newry pickup?",
        answer:
          "Yes. First-wave Dublin departures from Newry and Warrenpoint are a regular overnight booking.",
      },
    ],
  },
];

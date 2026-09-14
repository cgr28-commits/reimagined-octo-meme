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
];

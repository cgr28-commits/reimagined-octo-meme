import type { TransferRouteContent } from "@/lib/town-transfer-types";
import { TRANSFER_ROUTE_BATCH_3B } from "@/lib/transfer-routes-batch-3b";

const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

const TRANSFER_ROUTE_BATCH_3A: TransferRouteContent[] = [
  {
    slug: "newtownards-to-belfast-international",
    townSlug: "newtownards",
    airportCode: "BFS",
    title: "Newtownards to Belfast International Airport Taxi",
    h1: "Newtownards to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Newtownards to Belfast International Airport. Fixed-price Aldergrove transfer with flight monitoring and online booking today.",
    intro:
      "Belfast International is the inland airport booking from Newtownards, used when the ticket is Aldergrove rather than the nearer City Airport. My Airport Taxi NI reserves a driver for the pickup, so a 06:00 check-in does not depend on a car being free in The Square. The quote box already has Belfast International selected. Add the street in Scrabo, Movilla, Conlig or Donaghadee and the calculator returns the fixed price for that pin. Most town departures leave on the A20 through Dundonald, cross Belfast and join the M2 toward Aldergrove. Donaghadee starts on the coast before that A20, so it is not the same mapped start as a house under Scrabo. Conlig sits on the A21 and should be entered as Conlig. Book ahead of check-in when the M2 is busy. If we collect you on the way home, share the flight number. We monitor arrivals where possible, and airport pickups include complimentary waiting. WhatsApp can confirm luggage. A return can be added on the same form.",
    journeyInfo: `Newtownards to Belfast International usually follows the A20 through Dundonald, then the M2 toward Aldergrove. Donaghadee joins from the coast first. ${TRAFFIC}`,
    goingToAirport:
      "We collect door to door from your Newtownards address and drive you to Belfast International. Book in advance so the pickup sits ahead of check-in. Drop-off uses the Express or free-area option shown on the quote for this airport. We do not promise a named kerb beyond that choice.",
    fromAirport:
      "Belfast International → Newtownards is the return or a one-way inbound. Give us the flight number so we can monitor landing time. After arrivals, use the private-hire pickup point confirmed in the booking. Airport pickups include up to 60 minutes complimentary waiting time.",
    whyBookIntro:
      "This Newtownards–Aldergrove page is a reserved inland transfer, with the same fixed-price checkout and flight monitoring as our other International routes.",
    localAreasText:
      "We collect across Newtownards, including Scrabo, Movilla and The Square, plus Conlig on the A21 and Donaghadee on the coast. Enter the full street so the quote does not start on a generic town-centre pin.",
    faqs: [
      {
        question: "How much is a taxi from Newtownards to Belfast International Airport?",
        answer:
          "The quote box on this page already has Belfast International selected. Enter Scrabo, Movilla, Conlig or Donaghadee — Donaghadee starts on the coast before the A20, so we do not publish one Newtownards–Aldergrove fare.",
      },
      {
        question: "How long does Newtownards to Belfast International take?",
        answer:
          "Most departures use the A20 through Dundonald, then the M2 toward Aldergrove. The quote tool maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from Belfast International to Newtownards?",
        answer:
          "Yes. Choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "What if my flight into Belfast International is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Newtownards collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Donaghadee for Aldergrove?",
        answer:
          "Yes. Enter the Donaghadee street. That coastal start is not the same pin as The Square in Newtownards.",
      },
      {
        question: "Can I book this Newtownards transfer online?",
        answer:
          "Yes. Complete the quote on this page and pay securely online where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "newtownards-to-belfast-city-airport",
    townSlug: "newtownards",
    airportCode: "BHD",
    title: "Newtownards to Belfast City Airport Taxi",
    h1: "Newtownards to Belfast City Airport Taxi",
    metaDescription:
      "Taxi from Newtownards to George Best Belfast City Airport. Fixed-price A20 transfer, online booking and flight monitoring from your Ards street.",
    intro:
      "George Best Belfast City Airport is usually the nearer Belfast terminal from Newtownards, because the A20 already points toward east Belfast and the Sydenham side of the city. This page is only that journey. Aldergrove and Dublin have their own Newtownards routes. The quote box has Belfast City Airport selected; you add the pickup and the rest of the booking. Movilla and Scrabo leave through the town onto the A20. Conlig comes in from the A21 first, so a Conlig address should not be written as Bangor. Donaghadee is the longer Ards start, along the coast before the same A20. We still reserve the car. City Airport can be a short-haul or business flight, and a last-minute rank car is a poor plan when the A20 through Dundonald is busy. Meet & greet can be requested where it is offered. Flight monitoring applies when we collect you at the airport, with complimentary waiting on that pickup. Add a return if you want both legs. The mapped time appears after the address, because the A20 does not behave the same at 07:00 and at midday.",
    journeyInfo: `Newtownards to Belfast City Airport usually follows the A20 through Dundonald toward the Sydenham side of the city. ${TRAFFIC}`,
    goingToAirport:
      "Door-to-door collection from Newtownards, booked so the drop-off sits before check-in. City Airport drop-off uses the Express or free-area option shown on the quote. We do not invent an extra meeting door beyond that choice.",
    fromAirport:
      "Book Belfast City Airport → Newtownards as a return or a one-way inbound. Flight monitoring adjusts the collection when you give us the flight number. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Newtownards is the A20 booking — a reserved driver and a fixed price, not a car hailed at Sydenham.",
    localAreasText:
      "Scrabo, Movilla and The Square leave on the A20. Conlig joins from the A21. Donaghadee adds the coastal road before Dundonald.",
    faqs: [
      {
        question: "How much is a taxi from Newtownards to Belfast City Airport?",
        answer:
          "Use the quote tool on this page. City Airport is already selected. Scrabo leaves on the A20; Donaghadee starts on the coast, so we do not print one Ards fare.",
      },
      {
        question: "How long is Newtownards to Belfast City Airport?",
        answer:
          "The usual path is the A20 through Dundonald toward the Sydenham side of Belfast. The quote box shows the typical time for the street you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City Airport to Newtownards?",
        answer:
          "Yes. Use Return on the quote form. Instant online return prices include a 5% discount on the combined fare where that price is shown.",
      },
      {
        question: "What if my City Airport flight is late?",
        answer:
          "We monitor the flight where possible and hold the Newtownards collection to the landing time. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Is Conlig included on this City Airport page?",
        answer:
          "Yes. Enter the Conlig street. It sits on the A21 between Newtownards and Bangor and is not a Bangor marina pickup.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. The calculator on this page is the same booking flow as the homepage, with Belfast City Airport already selected.",
      },
    ],
  },
  {
    slug: "newtownards-to-dublin-airport",
    townSlug: "newtownards",
    airportCode: "DUB",
    title: "Newtownards to Dublin Airport Taxi",
    h1: "Newtownards to Dublin Airport Taxi",
    metaDescription:
      "Pre-book a Newtownards to Dublin Airport taxi. Fixed-price cross-border transfer with flight monitoring and included tolls. Quote your street online.",
    intro:
      "Dublin Airport from Newtownards is a full cross-border booking, not a local hop along the A20. The Ards start is still real: you leave Newtownards, come through Dundonald and Belfast, then take the A1/M1 south. Applicable M1 tolls are included on Dublin Airport fares, as they are on our other Dublin pages. The quote on this page already selects Dublin Airport. Enter the Newtownards, Conlig or Donaghadee street and you see the live fixed price for that address. Early Dublin departures are a common reason to book the night before. Tell us the terminal when you know it so the inbound meeting point can be confirmed. Flight monitoring applies to Dublin collections, with complimentary waiting on airport pickups. A return can be booked together if you want the same arrangement back to the Ards. Donaghadee and Conlig change the start of the mapped route, which is why this page does not offer a single town-centre fare. WhatsApp is available if luggage or the terminal changes after you have booked.",
    journeyInfo: `Newtownards to Dublin Airport uses the A20 into Belfast, then the A1/M1 south. It is a longer reserved diary slot than either Belfast airport. ${TRAFFIC}`,
    goingToAirport:
      "We collect at your Newtownards door and drive you to Dublin Airport. Book far enough ahead of check-in for a cross-border run. The quote tool shows the mapped time for your street. Applicable tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Newtownards is booked as a return or a one-way inbound. We monitor the flight where possible and meet you at the confirmed pickup point after landing. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "A Newtownards–Dublin booking is a reserved long transfer, with the same checkout, flight monitoring and included Dublin tolls as our other cross-border pages.",
    localAreasText:
      "The Square and Scrabo reach the A20 sooner than Donaghadee. Conlig joins from the A21. Enter the exact street so the mapped route starts in the right place.",
    faqs: [
      {
        question: "How much is a taxi from Newtownards to Dublin Airport?",
        answer:
          "Enter the Newtownards pickup in the quote tool — Dublin Airport is already selected. Applicable M1 tolls are included. Donaghadee and Conlig change the start, so we do not publish one Ards price.",
      },
      {
        question: "How long does Newtownards to Dublin Airport take?",
        answer:
          "This is a longer reserved slot than either Belfast airport: A20 into Belfast, then the A1/M1. The quote box maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from Dublin Airport to Newtownards?",
        answer:
          "Yes. Select Return on the quote form. Instant online returns include a 5% combined-fare discount where that price is shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Give us the flight number. We monitor it where possible and adjust the Newtownards collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Are tolls extra on this Newtownards to Dublin taxi?",
        answer:
          "Applicable road tolls are included on Dublin Airport fares. You do not add a separate toll line on this page.",
      },
      {
        question: "Do you do early Dublin pickups from Newtownards?",
        answer:
          "Yes. Overnight and very early Newtownards pickups for first-wave Dublin flights are booked on this form.",
      },
    ],
  },
  {
    slug: "dundonald-to-belfast-international",
    townSlug: "dundonald",
    airportCode: "BFS",
    title: "Dundonald to Belfast International Airport Taxi",
    h1: "Dundonald to Belfast International Airport Taxi",
    metaDescription:
      "Taxi from Dundonald to Belfast International Airport. Fixed-price transfer from the A20, with flight monitoring and online booking from your street.",
    intro:
      "Dundonald to Belfast International is the westbound booking from the A20, not the shorter City Airport run that this suburb is better known for. You leave the Upper Newtownards Road, cross Belfast and join the M2 toward Aldergrove. My Airport Taxi NI keeps that as a reserved pickup, because a hospital discharge or an early holiday flight should not wait on a passing car. The quote box has Belfast International selected. Ballybeen, Tullycarnet, the Ulster Hospital and Comber Road are different pins, and the fare follows the address you type. A hospital collection should name the building or entrance. Comber Road is still Dundonald — write the street so the map does not start in Comber Square. Knock and Gilnahirk, on the Belfast side, belong on this page when that is the house. Share the flight number for the inbound leg. We monitor arrivals where possible, with complimentary waiting on airport pickups. A return is available on the same form. WhatsApp can sort a suitcase count after you have seen the quote.",
    journeyInfo: `Dundonald to Belfast International leaves the A20, crosses Belfast and joins the M2 toward Aldergrove. ${TRAFFIC}`,
    goingToAirport:
      "We collect from your Dundonald address and drive you to Belfast International. Book ahead of check-in. Drop-off uses the Express or free-area choice shown on the quote for this airport.",
    fromAirport:
      "Belfast International → Dundonald is a return or a one-way inbound. Add the flight number so we can monitor the landing. Airport pickups include up to 60 minutes complimentary waiting time.",
    whyBookIntro:
      "This Dundonald–Aldergrove page is the westbound A20 job, with a confirmed fare and a driver reserved before travel day.",
    localAreasText:
      "Ballybeen, Tullycarnet, the Ulster Hospital, Comber Road, Knock and Gilnahirk are collected when you enter that street. The hospital needs the entrance, not only the postcode.",
    faqs: [
      {
        question: "How much is a taxi from Dundonald to Belfast International Airport?",
        answer:
          "Belfast International is already selected in the quote box. Enter Ballybeen, the Ulster Hospital or Comber Road — those pins are not the same start on the A20, so there is no single Dundonald fare.",
      },
      {
        question: "How long does Dundonald to Belfast International take?",
        answer:
          "The usual path leaves the A20, crosses Belfast and joins the M2. The quote tool maps the time from the street you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Dundonald as a return from Aldergrove?",
        answer:
          "Yes. Choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "What happens if my Aldergrove flight is late?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Dundonald collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can you collect from the Ulster Hospital?",
        answer:
          "Yes. Include the building or entrance with the Dundonald address so the driver is not left on the Upper Newtownards Road.",
      },
      {
        question: "Can I book this Dundonald transfer online?",
        answer:
          "Yes. Pay securely online where an instant fare is shown. WhatsApp is available if the booking needs a check.",
      },
    ],
  },
  {
    slug: "dundonald-to-belfast-city-airport",
    townSlug: "dundonald",
    airportCode: "BHD",
    title: "Dundonald to Belfast City Airport Taxi",
    h1: "Dundonald to Belfast City Airport Taxi",
    metaDescription:
      "Private taxi from Dundonald to Belfast City Airport. Fixed-price transfer along the A20, with online booking and flight monitoring included.",
    intro:
      "From Dundonald, George Best Belfast City Airport is the airport the A20 is already facing. The Upper Newtownards Road runs toward east Belfast and the Sydenham side of the city, which is why this page exists separately from the Aldergrove route. You still book it. A short-haul flight and a busy morning on the dual carriageway are a bad mix if the car is not reserved. The quote box has City Airport selected. Add Ballybeen, Tullycarnet, the hospital or a Knock address and the fixed price is for that street. Comber Road pickups should name Comber Road so they are not treated as Comber town. Gilnahirk is on the Belfast side of Dundonald and is a valid pickup when you enter it. Meet & greet can be requested where booking offers it. If you are being collected at City Airport, flight monitoring and complimentary waiting apply once the flight number is on the booking. A return to Dundonald can be added before you pay. WhatsApp remains the place to confirm a terminal or an extra bag.",
    journeyInfo: `Dundonald to Belfast City Airport follows the A20 toward east Belfast and the Sydenham side of the city. ${TRAFFIC}`,
    goingToAirport:
      "Door-to-door from Dundonald to Belfast City Airport, booked before check-in. Drop-off uses the Express or free-area option the quote shows for City Airport.",
    fromAirport:
      "Belfast City Airport → Dundonald is booked as a return or an inbound one-way. We monitor the flight where possible. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Dundonald is the short A20 booking — still a fixed price and a reserved driver, not a rank taxi at the terminal.",
    localAreasText:
      "The hospital and the Upper Newtownards Road need an entrance. Ballybeen and Tullycarnet are estate pickups. Knock and Gilnahirk sit on the Belfast side.",
    faqs: [
      {
        question: "How much is a taxi from Dundonald to Belfast City Airport?",
        answer:
          "Use the quote tool on this page, where City Airport is already selected. A Ballybeen street and an Ulster Hospital entrance are different pins, so we do not print one suburb fare.",
      },
      {
        question: "How long is Dundonald to Belfast City Airport?",
        answer:
          "The usual line is the A20 toward east Belfast and Sydenham. The quote box shows the time for the address you enter. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City Airport to Dundonald?",
        answer:
          "Yes. Use Return on the quote form. Instant online return prices include a 5% discount on the combined fare where that price is shown.",
      },
      {
        question: "What if my City Airport flight into Belfast is late?",
        answer:
          "We monitor the flight where possible and adjust the Dundonald collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Is Ballybeen covered for City Airport?",
        answer:
          "Yes. Enter the Ballybeen street. It is a Dundonald-area pickup, not a Newtownards town-centre job.",
      },
      {
        question: "Can I book online from Dundonald?",
        answer:
          "Yes. The calculator is the same booking flow as the homepage, with Belfast City Airport already selected.",
      },
    ],
  },
  {
    slug: "dundonald-to-dublin-airport",
    townSlug: "dundonald",
    airportCode: "DUB",
    title: "Dundonald to Dublin Airport Taxi",
    h1: "Dundonald to Dublin Airport Taxi",
    metaDescription:
      "Book a Dundonald to Dublin Airport taxi. Fixed-price cross-border transfer with included tolls, flight monitoring and online booking from Dundonald.",
    intro:
      "Dundonald is already on the Belfast side of Newtownards, but Dublin Airport is still a full cross-border day from this suburb. You leave the A20, cross the city and take the A1/M1 south. Applicable M1 tolls are included on the Dublin fare. The quote box on this page has Dublin Airport selected, so you only add the Dundonald street. Ballybeen and the Ulster Hospital are common early pickups for first-wave Dublin flights, and the hospital entrance should be in the address. Tullycarnet and Comber Road are not the same pin as Knock. Book the night before if the flight is an early departure. Tell us the Dublin terminal when you know it. Flight monitoring covers the collection at Dublin, with complimentary waiting on that airport pickup. A return to Dundonald can be added on the form if both legs should be reserved together. This is not the City Airport page and not the Aldergrove page — those stay on their own Dundonald routes. WhatsApp can confirm luggage before an overnight pickup.",
    journeyInfo: `Dundonald to Dublin Airport leaves the A20, crosses Belfast and continues on the A1/M1. It is a longer reserved slot than either Belfast airport. ${TRAFFIC}`,
    goingToAirport:
      "We collect at your Dundonald door and drive you to Dublin Airport. Allow a cross-border booking ahead of check-in. Applicable tolls are included on Dublin Airport fares. The quote tool shows the mapped time for your street.",
    fromAirport:
      "Dublin Airport → Dundonald is a return or a one-way inbound. We monitor the flight where possible and use the pickup point confirmed in the booking. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "A Dundonald–Dublin transfer is a reserved long journey, with included Dublin tolls and the same online checkout as our Belfast airport routes.",
    localAreasText:
      "Hospital, Ballybeen and Tullycarnet pickups should name the entrance or street. Comber Road stays a Dundonald address. Knock and Gilnahirk are the Belfast side.",
    faqs: [
      {
        question: "How much is a taxi from Dundonald to Dublin Airport?",
        answer:
          "Dublin Airport is already selected. Enter the Dundonald street in the quote tool. Applicable M1 tolls are included. A hospital entrance and a Ballybeen street are not one shared fare.",
      },
      {
        question: "How long does Dundonald to Dublin Airport take?",
        answer:
          "This is the long southbound booking: off the A20, across Belfast, then the A1/M1. The quote tool maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Dublin Airport back to Dundonald?",
        answer:
          "Yes. Select Return on the quote form. Instant online returns include a 5% combined-fare discount where that price is shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Give us the flight number. We monitor it where possible and adjust the Dundonald collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Are Dublin tolls included from Dundonald?",
        answer:
          "Yes. Applicable M1 tolls are included in the Dublin Airport fare the quote tool shows.",
      },
      {
        question: "Can I book an early Dublin pickup in Dundonald?",
        answer:
          "Yes. Overnight pickups from Dundonald, including the Ulster Hospital when that is the address, are booked on this form.",
      },
    ],
  },
  {
    slug: "comber-to-belfast-international",
    townSlug: "comber",
    airportCode: "BFS",
    title: "Comber to Belfast International Airport Taxi",
    h1: "Comber to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Comber to Belfast International Airport. Fixed-price transfer via the A22, with flight monitoring and online booking today.",
    intro:
      "Comber to Belfast International starts by leaving Strangford Lough on the A22 toward Dundonald, then joining the Belfast roads and the M2 for Aldergrove. It is not an A21 trip via Newtownards, and it is not a Bangor coast job. My Airport Taxi NI reserves the pickup from The Square, the Killinchy Road, Moneyreagh or Ballygowan when that is the address you enter. The quote box already shows Belfast International. Moneyreagh and Ballygowan are not Comber Square, so the street has to be in the booking or the pin will be wrong. Killinchy sits south of the town and adds the lough-side lanes before the A22. Book ahead of check-in. Friday holiday traffic on the M2 is a reason to reserve, not a reason to guess a fare on this page. The return from Aldergrove uses flight monitoring when you share the flight number, and airport pickups include complimentary waiting. A return can be added before you pay. WhatsApp is available if the address is a house name on a lane rather than a numbered street.",
    journeyInfo: `Comber to Belfast International uses the A22 toward Dundonald, then the Belfast roads and the M2 toward Aldergrove. ${TRAFFIC}`,
    goingToAirport:
      "We collect door to door in Comber and drive you to Belfast International. Book so the pickup sits ahead of check-in. Drop-off follows the Express or free-area choice shown for this airport.",
    fromAirport:
      "Belfast International → Comber is the return or a one-way inbound. Share the flight number so we can monitor the landing. Airport pickups include up to 60 minutes complimentary waiting time.",
    whyBookIntro:
      "This Comber–Aldergrove page is the A22 then M2 booking, with a fixed price taken from your street rather than from Newtownards.",
    localAreasText:
      "The Square, the Killinchy Road, Moneyreagh and Ballygowan are different Comber-area starts. Enter the street. Dundonald and Newtownards have their own pages if you are starting there.",
    faqs: [
      {
        question: "How much is a taxi from Comber to Belfast International Airport?",
        answer:
          "The quote box already has Belfast International selected. Enter The Square, Killinchy or Moneyreagh — those starts are not one Comber pin, so we do not publish a single fare.",
      },
      {
        question: "How long does Comber to Belfast International take?",
        answer:
          "The usual way out is the A22 toward Dundonald, then the M2 toward Aldergrove. The quote tool maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from Aldergrove to Comber?",
        answer:
          "Yes. Choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare.",
      },
      {
        question: "What if my Belfast International flight is delayed?",
        answer:
          "Share the flight number. We monitor it where possible and adjust the Comber collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Ballygowan for Aldergrove?",
        answer:
          "Yes, when Ballygowan is the address you enter. It is not the same timing as The Square in Comber.",
      },
      {
        question: "Can I book this Comber transfer online?",
        answer:
          "Yes. Complete the quote on this page and pay securely online where an instant fare is shown.",
      },
    ],
  },
  {
    slug: "comber-to-belfast-city-airport",
    townSlug: "comber",
    airportCode: "BHD",
    title: "Comber to Belfast City Airport Taxi",
    h1: "Comber to Belfast City Airport Taxi",
    metaDescription:
      "Taxi from Comber to George Best Belfast City Airport. Fixed-price A22 transfer with online booking and flight monitoring from your Comber street.",
    intro:
      "Comber to Belfast City Airport uses the same A22 start as the Aldergrove run, then stays on the eastern side of Belfast toward Sydenham instead of turning west for the M2. That split is why the two Belfast airports are separate Comber pages. The quote box has City Airport selected. Add The Square, a Killinchy Road address, Moneyreagh or Ballygowan and the fixed price follows that pin. Moneyreagh sits toward Carryduff and should not be entered as a Carryduff roundabout pickup if the house is in Moneyreagh. We reserve the driver before travel day. Short-haul flights from City Airport still need that reservation when the A22 and Dundonald are busy. Meet & greet can be requested where it is offered on the booking. The inbound collection uses flight monitoring and complimentary waiting once the flight number is included. Add a return if both legs should be on one form. WhatsApp can confirm the street if the lane name is easy to misread.",
    journeyInfo: `Comber to Belfast City Airport follows the A22 toward Dundonald, then east Belfast and the Sydenham side rather than the M2. ${TRAFFIC}`,
    goingToAirport:
      "Door-to-door from Comber to Belfast City Airport, booked ahead of check-in. Drop-off uses the Express or free-area option shown on the City Airport quote.",
    fromAirport:
      "Belfast City Airport → Comber is a return or a one-way inbound. We monitor the flight where possible. Complimentary waiting on airport pickups is up to 60 minutes.",
    whyBookIntro:
      "City Airport from Comber is the A22 then Sydenham booking — a reserved car, not a Newtownards fare with the town name swapped.",
    localAreasText:
      "The Square is the town centre. Killinchy is south. Moneyreagh and Ballygowan are collected when that village is the address you type.",
    faqs: [
      {
        question: "How much is a taxi from Comber to Belfast City Airport?",
        answer:
          "Use the quote tool on this page. City Airport is already selected. The Square and Moneyreagh are different starts on the way to Dundonald, so there is no single Comber fare.",
      },
      {
        question: "How long is Comber to Belfast City Airport?",
        answer:
          "The usual path is the A22 toward Dundonald, then east Belfast toward Sydenham. The quote box shows the time for your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from City Airport to Comber?",
        answer:
          "Yes. Use Return on the quote form. Instant online return prices include a 5% discount on the combined fare where that price is shown.",
      },
      {
        question: "What if my City Airport flight is late?",
        answer:
          "We monitor the flight where possible and hold the Comber collection to the landing time. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Is Killinchy included?",
        answer:
          "Yes. Enter the Killinchy address. It sits south of Comber and is not a pickup in The Square.",
      },
      {
        question: "Can I book online?",
        answer:
          "Yes. The calculator on this page is the homepage booking flow, with Belfast City Airport already selected.",
      },
    ],
  },
  {
    slug: "comber-to-dublin-airport",
    townSlug: "comber",
    airportCode: "DUB",
    title: "Comber to Dublin Airport Taxi",
    h1: "Comber to Dublin Airport Taxi",
    metaDescription:
      "Pre-book a Comber to Dublin Airport taxi. Fixed-price cross-border transfer from the A22, with included tolls and flight monitoring. Quote online.",
    intro:
      "Dublin Airport from Comber is the long booking after you have left the lough. The A22 takes you toward Dundonald and Belfast, and the A1/M1 takes you south. Applicable M1 tolls are included on the Dublin fare. This is a reserved diary slot, not a local Comber hop, which is why early flights are booked the night before. The quote box already selects Dublin Airport. You enter The Square, Killinchy, Moneyreagh or Ballygowan and see the fixed price for that street. Killinchy adds the lanes south of town before the A22. Moneyreagh is the Carryduff side and should be spelled as Moneyreagh. Tell us the Dublin terminal when you know it so the inbound meeting point can be confirmed. Flight monitoring applies to the Dublin collection, with complimentary waiting on airport pickups. A return to Comber can be added on the same form. The Belfast airport pages stay separate if your ticket is City Airport or Aldergrove instead. WhatsApp can confirm a house name before an overnight start.",
    journeyInfo: `Comber to Dublin Airport uses the A22 toward Dundonald and Belfast, then the A1/M1 south. It is a longer reserved slot than either Belfast airport. ${TRAFFIC}`,
    goingToAirport:
      "We collect at your Comber door and drive you to Dublin Airport. Book far enough ahead of check-in for a cross-border run. Applicable tolls are included on Dublin Airport fares.",
    fromAirport:
      "Dublin Airport → Comber is booked as a return or a one-way inbound. We monitor the flight where possible. Complimentary waiting on airport pickups is up to 60 minutes. Share the terminal when you know it.",
    whyBookIntro:
      "A Comber–Dublin booking is a reserved A22 then A1 transfer, with included tolls and the same online checkout as our other Dublin pages.",
    localAreasText:
      "The Square reaches the A22 first. Killinchy, Moneyreagh and Ballygowan change the start. Enter the village or street, not only Comber.",
    faqs: [
      {
        question: "How much is a taxi from Comber to Dublin Airport?",
        answer:
          "Enter the Comber pickup in the quote tool — Dublin Airport is already selected. Applicable M1 tolls are included. Killinchy and Moneyreagh are not The Square, so we do not publish one town price.",
      },
      {
        question: "How long does Comber to Dublin Airport take?",
        answer:
          "This is a longer reserved slot than either Belfast airport: A22 toward Dundonald, then the A1/M1. The quote box maps the time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book a return from Dublin Airport to Comber?",
        answer:
          "Yes. Select Return on the quote form. Instant online returns include a 5% combined-fare discount where that price is shown.",
      },
      {
        question: "What if my Dublin flight is delayed?",
        answer:
          "Give us the flight number. We monitor it where possible and adjust the Comber collection. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Are tolls extra from Comber?",
        answer:
          "Applicable road tolls are included on Dublin Airport fares. There is no separate toll charge added on this page.",
      },
      {
        question: "Do you collect early from Comber for Dublin?",
        answer:
          "Yes. Overnight and very early Comber pickups for first-wave Dublin flights are booked on this form.",
      },
    ],
  },
];

export const TRANSFER_ROUTE_BATCH_3: TransferRouteContent[] = [
  ...TRANSFER_ROUTE_BATCH_3A,
  ...TRANSFER_ROUTE_BATCH_3B,
];

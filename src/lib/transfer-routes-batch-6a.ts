import type { TransferRouteContent } from "@/lib/town-transfer-types";

/**
 * Batch 6a routes — County Down south (Banbridge, Downpatrick, Newcastle). Roads named are
 * the usual corridors only; no fares, mileages, or journey-time claims.
 */
const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

export const TRANSFER_ROUTE_BATCH_6A: TransferRouteContent[] = [
  // ───────────────────────────── Banbridge ─────────────────────────────
  {
    slug: "banbridge-to-belfast-international",
    townSlug: "banbridge",
    airportCode: "BFS",
    title: "Banbridge to Belfast International Airport Taxi",
    h1: "Banbridge to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Banbridge, Dromore or Gilford to Belfast International Airport. Fixed fare via the A1 and Sprucefield, Express Drop-Off included. 5★ on Google.",
    intro:
      "Banbridge to Belfast International Airport takes you north up the A1 past Dromore towards Sprucefield, then across country to Aldergrove. My Airport Taxi NI collects from Banbridge, Dromore, Gilford, Rathfriland, Loughbrickland and Scarva, and prices the trip as a fixed fare from your exact address, with Belfast International already selected on this page. Many sun-holiday and low-cost departures leave Aldergrove early in the morning, so the booking form happily takes pre-dawn pickup times from the Banbridge area. Express Drop-Off and the applicable airport access charge are built into the price, so there is nothing extra to pay at the barrier. Flying home into Belfast International? Book the collection here and add your flight number; we monitor flights where possible and airport pickups include up to 60 minutes complimentary waiting. Add a return to keep both legs on one booking, and message us on WhatsApp if your farm lane or estate needs directions.",
    journeyInfo: `The A1 north past Dromore to Sprucefield, then cross-country towards Aldergrove, is the usual line. The Sprucefield junctions and the roads approaching the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Banbridge, Dromore, Gilford or anywhere nearby and drive you to Belfast International. Book a pickup that leaves the A1 run comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Banbridge is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Banbridge to Aldergrove is a reserved booking with the price agreed up front — no early drive up the A1 and no long-stay car park bill.",
    localAreasText:
      "Banbridge, Dromore and Gilford are priced as separate pickups. Rathfriland, Loughbrickland and Scarva are quoted from the village or farm address.",
    faqs: [
      {
        question: "How much is a taxi from Banbridge to Belfast International Airport?",
        answer:
          "Type your Banbridge, Dromore or Gilford address into the quote box and the fixed Aldergrove fare for that pickup appears before you book. Express Drop-Off and the airport access charge are already inside that price.",
      },
      {
        question: "How long does Banbridge to Belfast International take?",
        answer:
          "Most runs go north on the A1 past Dromore to Sprucefield and then cross-country to Aldergrove; your quote shows the mapped time from your own street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you pick up from rural addresses near Rathfriland or Loughbrickland?",
        answer:
          "Yes. Enter the full address and add the farm or house name plus any lane directions in the notes so your driver finds the right gate in the dark.",
      },
      {
        question: "What happens if my flight back into Belfast International lands late?",
        answer:
          "Give us the flight number at booking and we track the arrival where possible, moving the collection to suit. You also get up to 60 minutes complimentary waiting on airport pickups.",
      },
      {
        question: "Can I book Belfast International back to Banbridge on the same booking?",
        answer:
          "Yes. Tick the return option and enter the inbound flight details, and both the outward and homeward legs to Banbridge sit on one reservation.",
      },
    ],
  },
  {
    slug: "banbridge-to-belfast-city-airport",
    townSlug: "banbridge",
    airportCode: "BHD",
    title: "Banbridge to Belfast City Airport Taxi",
    h1: "Banbridge to Belfast City Airport Taxi",
    metaDescription:
      "Book a fixed-price taxi from Banbridge, Dromore or Scarva to George Best Belfast City Airport via the A1, M1 and Westlink. Pre-booked driver, rated 5★ on Google.",
    intro:
      "Banbridge to Belfast City Airport is a straightforward run up the A1 to Sprucefield, onto the M1 into Belfast, then along the Westlink and out to George Best Belfast City Airport at Sydenham. It is a popular choice from Banbridge for business trips and short flights to London, Manchester and other Great Britain airports. My Airport Taxi NI collects from Banbridge, Dromore, Gilford, Rathfriland, Loughbrickland and Scarva, and gives you a fixed price from your door, with Belfast City Airport preselected here. Express Drop-Off and the applicable airport access charge are included in the fare. Early business departures are no problem: choose your pickup time in the booking form, including before first light. Landing back at Belfast City? Book the collection with your flight number; we monitor flights where possible and allow up to 60 minutes complimentary waiting. Add a return trip if you are flying out and back the same week.",
    journeyInfo: `The A1 north to Sprucefield, the M1 into Belfast, then the Westlink and on towards Sydenham is the usual line. The M1 approach and the Westlink are the parts to allow for at rush hour. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Banbridge, Dromore, Scarva or anywhere in the area and drive you to Belfast City Airport. Allow for Belfast rush-hour traffic when choosing a pickup time. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Banbridge is booked on this page. Add the flight number so we can monitor the landing time where possible. Follow the collection instructions in your booking after arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Banbridge to George Best is a reserved car with the fare fixed in advance — ideal for business travellers who want to work rather than drive the M1.",
    localAreasText:
      "Banbridge, Dromore and Gilford are separate pickups. Scarva, Loughbrickland and Rathfriland are priced from the exact village or rural address.",
    faqs: [
      {
        question: "How much does a Banbridge to Belfast City Airport taxi cost?",
        answer:
          "Use the quote box with your Banbridge or Dromore street and you see the fixed George Best fare before paying, with Express Drop-Off and the airport access charge built in. Gilford and Scarva pickups are priced from their own addresses.",
      },
      {
        question: "How long is the drive from Banbridge to Belfast City Airport?",
        answer:
          "The car follows the A1 and M1 into Belfast and the Westlink towards Sydenham, and the quote shows a mapped time for your pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Should I fly from Belfast City or Belfast International from Banbridge?",
        answer:
          "Fly from whichever airport your airline uses. Belfast City is through Belfast on the M1 and suits short business routes to Great Britain, while Aldergrove has more holiday flights. We quote both from your Banbridge door.",
      },
      {
        question: "Do you do early pickups in Banbridge for first flights out of Belfast City?",
        answer:
          "Yes. Pick any time in the booking form, including very early mornings, and your driver arrives at your Banbridge address at the time you chose.",
      },
      {
        question: "Is flight monitoring included for Belfast City Airport collections to Banbridge?",
        answer:
          "Yes. Add your flight number and we watch the landing time where possible. Collections from Belfast City also include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "banbridge-to-dublin-airport",
    townSlug: "banbridge",
    airportCode: "DUB",
    title: "Banbridge to Dublin Airport Taxi",
    h1: "Banbridge to Dublin Airport Taxi",
    metaDescription:
      "Fixed-price taxi from Banbridge, Gilford, Loughbrickland or Rathfriland straight down the A1 to Dublin Airport. M1 tolls included, Arrivals meet on return.",
    intro:
      "Banbridge to Dublin Airport is one of the most direct cross-border transfers we run: straight down the A1 past Loughbrickland and Newry, over the border and onto the M1 to Dublin Airport. Because Banbridge sits on that corridor, plenty of local travellers choose Dublin for long-haul and transatlantic flights. My Airport Taxi NI quotes a fixed Dublin Airport fare from your exact address, with applicable M1 tolls included, and this page already has Dublin Airport selected. We collect from Banbridge, Dromore, Gilford, Rathfriland, Loughbrickland and Scarva, and the booking form takes overnight times for early departures. Let us know whether you are flying from Terminal 1 or Terminal 2. Coming home through Dublin? Book the collection here with your flight number; we monitor flights where possible, your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting. Add a return to keep both directions together.",
    journeyInfo: `The A1 south past Loughbrickland and Newry, across the border and down the M1 to the airport, is the usual line. The Newry stretch and the M1 approach to Dublin are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Banbridge, Gilford, Rathfriland or anywhere nearby and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Banbridge is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Banbridge to Dublin Airport is a long cross-border run, booked ahead with the fare and tolls confirmed before you set off.",
    localAreasText:
      "Banbridge, Dromore and Gilford are priced separately. Loughbrickland, Scarva and Rathfriland are quoted from the village or farm address.",
    faqs: [
      {
        question: "How much is a taxi from Banbridge to Dublin Airport?",
        answer:
          "Put your Banbridge, Gilford or Rathfriland address into the quote box for a fixed Dublin fare that already covers the applicable M1 tolls. If no instant price shows for your address, request a quote and we confirm it before you pay.",
      },
      {
        question: "How long does it take from Banbridge to Dublin Airport?",
        answer:
          "The usual line is the A1 south past Newry and then the M1 in the Republic; the quote shows a mapped time from your Banbridge-area pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are the M1 tolls extra on a Banbridge to Dublin Airport taxi?",
        answer: "No. Applicable M1 tolls are included in the fixed fare you see when you book, so there is nothing to hand over on the day.",
      },
      {
        question: "Where will my driver meet me at Dublin Airport for the trip back to Banbridge?",
        answer:
          "Your driver meets you in Arrivals at Terminal 1 or Terminal 2. Add your flight number so we can track the landing, and you get up to 60 minutes complimentary waiting.",
      },
      {
        question: "Which Dublin Airport terminal should I give for a Banbridge pickup?",
        answer: "Check your airline's terminal — Terminal 1 or Terminal 2 — and add it to the booking so your driver drops you at the correct door.",
      },
    ],
  },

  // ───────────────────────────── Downpatrick ─────────────────────────────
  {
    slug: "downpatrick-to-belfast-international",
    townSlug: "downpatrick",
    airportCode: "BFS",
    title: "Downpatrick to Belfast International Airport Taxi",
    h1: "Downpatrick to Belfast International Airport Taxi",
    metaDescription:
      "Pre-booked taxi from Downpatrick, Ballynahinch or Crossgar to Belfast International Airport. Fixed fare, airport access charge included, 60 minutes waiting on pickups.",
    intro:
      "Downpatrick to Belfast International Airport crosses most of the east of Northern Ireland: north on the A7 through Crossgar and Saintfield, round Belfast and out towards Aldergrove. Doing that drive yourself before an early holiday flight, then paying for a week of airport parking, is exactly what a pre-booked taxi avoids. My Airport Taxi NI collects from Downpatrick, Ballynahinch, Saintfield, Crossgar, Killyleagh and Ardglass, and quotes a fixed price from your exact address, with Belfast International preselected on this page. Express Drop-Off and the applicable airport access charge are included, so the fare you see is the fare you pay. Choose any pickup time, including the small hours. Flying back into Aldergrove? Book the collection here with your flight number; we monitor flights where possible and airport pickups include up to 60 minutes complimentary waiting. Townland addresses around Lecale should include a house name. Add a return to keep both legs together.",
    journeyInfo: `North on the A7 through Crossgar and Saintfield, then round Belfast and out towards Aldergrove, is the usual line. Getting around Belfast is the part to allow for, especially at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Downpatrick, Ballynahinch, Killyleagh or anywhere in Lecale and drive you to Belfast International. Allow for the Belfast section when choosing your pickup. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Downpatrick is booked on this page. Add the flight number so we can monitor the landing time where possible. Follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Downpatrick to Aldergrove is a reserved car with the price agreed in advance — no cross-country drive at dawn and no long-stay parking.",
    localAreasText:
      "Downpatrick, Ballynahinch and Saintfield are priced as separate pickups. Crossgar, Killyleagh and Ardglass are quoted from the village or townland address.",
    faqs: [
      {
        question: "How much is a taxi from Downpatrick to Belfast International Airport?",
        answer:
          "Enter your Downpatrick, Ballynahinch or Crossgar address in the quote tool and the fixed Aldergrove price for that exact pickup is shown before you commit, including Express Drop-Off and the airport access charge.",
      },
      {
        question: "How long does Downpatrick to Belfast International take?",
        answer:
          "Drivers normally take the A7 north and go round Belfast towards Aldergrove, and your quote shows the mapped time from your Lecale pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City Airport closer than Belfast International from Downpatrick?",
        answer:
          "Usually, yes — Belfast City is on the near side of Belfast, while Aldergrove is beyond it. Book the airport your flight actually leaves from; we quote both from Downpatrick.",
      },
      {
        question: "Do you collect from townland addresses around Killyleagh and Ardglass?",
        answer:
          "Yes. Give the full address and add the house name or a landmark in the notes, as rural Lecale addresses can be hard to find by postcode alone.",
      },
      {
        question: "What if my return flight into Belfast International is delayed?",
        answer:
          "Include the flight number and we follow the arrival where possible, shifting your Downpatrick collection to match. Airport pickups come with up to 60 minutes complimentary waiting too.",
      },
    ],
  },
  {
    slug: "downpatrick-to-belfast-city-airport",
    townSlug: "downpatrick",
    airportCode: "BHD",
    title: "Downpatrick to Belfast City Airport Taxi",
    h1: "Downpatrick to Belfast City Airport Taxi",
    metaDescription:
      "Taxi from Downpatrick, Saintfield or Killyleagh to George Best Belfast City Airport up the A7. Fixed price from your door, Express Drop-Off included. 5★ rated.",
    intro:
      "Downpatrick to Belfast City Airport is usually the shortest airport trip from St Patrick's country: up the A7 through Crossgar, Saintfield and Carryduff, then across east Belfast to George Best Belfast City Airport. That makes it a favourite for business flights and quick trips to Great Britain. My Airport Taxi NI collects from Downpatrick, Ballynahinch, Saintfield, Crossgar, Killyleagh and Ardglass, and gives you a fixed fare from your exact address, with Belfast City Airport already selected here. Express Drop-Off and the applicable airport access charge are included, and you can pick any time for the car to arrive, including well before first light. Heading home through Belfast City? Book the collection on this page with your flight number; we monitor flights where possible and airport pickups include up to 60 minutes complimentary waiting. Farms and townlands near Killyleagh should add a house name. Add a return if you are flying out and back.",
    journeyInfo: `The A7 north through Crossgar, Saintfield and Carryduff, then across east Belfast to Sydenham, is the usual line. The Carryduff end and the east Belfast roads are the parts to allow for at rush hour. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Downpatrick, Saintfield, Crossgar or anywhere nearby and drive you to Belfast City Airport. Choose a pickup that leaves the A7 and the city stretch well ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Downpatrick is booked on this page. Add the flight number so we can monitor the landing time where possible. Follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Downpatrick to George Best is a reserved booking with a fixed fare — a simple door-to-terminal run for business and short-haul travellers.",
    localAreasText:
      "Downpatrick, Saintfield and Ballynahinch are separate pickups. Crossgar, Killyleagh and Ardglass are priced from the exact village or rural address.",
    faqs: [
      {
        question: "How much does a taxi from Downpatrick to Belfast City Airport cost?",
        answer:
          "Our instant quote prices George Best from your own Downpatrick, Saintfield or Killyleagh street, so you see one fixed figure with Express Drop-Off and the airport access charge already counted.",
      },
      {
        question: "How long is the journey from Downpatrick to Belfast City Airport?",
        answer:
          "The route is normally the A7 through Crossgar, Saintfield and Carryduff into east Belfast; the quote gives a mapped time from your address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you collect from Ballynahinch for a Belfast City flight?",
        answer:
          "Yes. Ballynahinch is one of our regular pickups — enter your Ballynahinch address and the quote is calculated from there rather than from Downpatrick.",
      },
      {
        question: "Do you track flights landing at Belfast City for the run back to Downpatrick?",
        answer:
          "Yes. With your flight number we monitor the landing where possible, and collections at Belfast City include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book a return to Belfast City Airport from Saintfield?",
        answer:
          "Yes. Choose the return option, enter your homeward flight, and both trips between Saintfield and Belfast City are held on one booking.",
      },
    ],
  },
  {
    slug: "downpatrick-to-dublin-airport",
    townSlug: "downpatrick",
    airportCode: "DUB",
    title: "Downpatrick to Dublin Airport Taxi",
    h1: "Downpatrick to Dublin Airport Taxi",
    metaDescription:
      "Long-distance taxi from Downpatrick, Ardglass or Ballynahinch to Dublin Airport. Fixed fare with applicable M1 tolls included and an Arrivals meet on return.",
    intro:
      "Downpatrick to Dublin Airport is a long cross-border transfer from the Lecale coast. Depending on your pickup, the car heads west towards Newry or across to the A1 via Ballynahinch, then south over the border and down the M1 to Dublin Airport. Travellers from St Patrick's country often pick Dublin for transatlantic flights and wider European choice. My Airport Taxi NI quotes a fixed Dublin Airport fare from your exact address, with applicable M1 tolls included, and this page has Dublin Airport preselected. We collect from Downpatrick, Ballynahinch, Saintfield, Crossgar, Killyleagh and Ardglass, and the booking form accepts overnight pickup times for early departures. Tell us your terminal once your airline confirms it. Returning via Dublin? Book the collection here with your flight number; we monitor flights where possible, your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting. Add a return to keep both directions on one booking.",
    journeyInfo: `West towards Newry, or across to the A1 via Ballynahinch, then south over the border and down the M1, is the usual line. The cross-country roads out of Lecale and the M1 approach to Dublin are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Downpatrick, Ardglass, Ballynahinch or anywhere in the area and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Downpatrick is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Downpatrick to Dublin Airport is a long run best booked ahead, with the fare and tolls settled before you travel.",
    localAreasText:
      "Downpatrick, Ballynahinch and Saintfield are priced separately. Crossgar, Killyleagh and Ardglass are quoted from the village or townland address.",
    faqs: [
      {
        question: "How much is a taxi from Downpatrick to Dublin Airport?",
        answer:
          "Enter your Downpatrick, Ardglass or Ballynahinch address in the quote box to see a fixed cross-border fare with applicable M1 tolls included. Where an instant price is not available, request a fixed quote and we confirm it before payment.",
      },
      {
        question: "How long does Downpatrick to Dublin Airport take?",
        answer:
          "It depends on your pickup — the car heads towards Newry or the A1 and then down the M1 — and the quote shows a mapped time from your Lecale address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are Dublin tolls included on a taxi from Downpatrick?",
        answer: "Yes. Applicable M1 tolls are part of the fixed fare quoted for your Downpatrick pickup, so you pay nothing extra on the road.",
      },
      {
        question: "Where do I meet my driver at Dublin Airport for the journey to Downpatrick?",
        answer:
          "In Arrivals at your terminal. Book with your flight number so we can follow the landing; airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can you pick up from Ardglass or Killyleagh for a Dublin flight?",
        answer:
          "Yes. Enter the village address and any house name, and the Dublin fare is calculated from that pickup rather than from Downpatrick town centre.",
      },
    ],
  },

  // ───────────────────────────── Newcastle ─────────────────────────────
  {
    slug: "newcastle-to-belfast-international",
    townSlug: "newcastle",
    airportCode: "BFS",
    title: "Newcastle to Belfast International Airport Taxi",
    h1: "Newcastle to Belfast International Airport Taxi",
    metaDescription:
      "Taxi from Newcastle, Co Down, Dundrum or Castlewellan to Belfast International Airport. Fixed fare for walkers, golfers and locals; Express Drop-Off included.",
    intro:
      "Newcastle to Belfast International Airport runs from the foot of Slieve Donard right across to Aldergrove: usually north on the A24 through Clough and Ballynahinch, then round Belfast, though the driver may use the A50 and A1 instead depending on traffic. My Airport Taxi NI collects from Newcastle, Dundrum, Castlewellan, Annsborough and Clough, and prices the trip as a fixed fare from your exact address, with Belfast International preselected on this page. Express Drop-Off and the applicable airport access charge are included. Hillwalkers leaving the Mournes and golfers finishing a week at Royal County Down can book a pickup from their hotel, guest house or cottage at any hour. Arriving into Belfast International for a Mourne break? Book the collection here with your flight number; we monitor flights where possible and airport pickups include up to 60 minutes complimentary waiting. Mention golf clubs or bulky walking kit so we send a suitable vehicle.",
    journeyInfo: `The A24 north through Clough and Ballynahinch, then round Belfast towards Aldergrove, is the usual line, with the A50 and A1 as an alternative. The Belfast section and the airport approach are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Newcastle, Dundrum, Castlewellan or anywhere around the Mournes and drive you to Belfast International. Pick a time that leaves the cross-country run well ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Newcastle is booked on this page. Add the flight number so we can monitor the landing time where possible. Follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Newcastle to Aldergrove is a reserved car with the fare fixed in advance — the simplest way between the Mournes and your flight.",
    localAreasText:
      "Newcastle, Dundrum and Castlewellan are priced as separate pickups. Annsborough and Clough are quoted from the village address; hotels and cottages should include the property name.",
    faqs: [
      {
        question: "How much is a taxi from Newcastle, Co Down to Belfast International Airport?",
        answer:
          "Add your Newcastle hotel, cottage or home address to the quote box and the fixed Aldergrove fare appears straight away, with Express Drop-Off and the airport access charge folded in. Dundrum and Castlewellan are priced from their own streets.",
      },
      {
        question: "How long does Newcastle to Belfast International take?",
        answer:
          "Expect the A24 through Clough and Ballynahinch and then round Belfast, or the A50 and A1 at times; the quote shows the mapped time from your Mourne-side pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you fit golf clubs for a trip from Royal County Down to Belfast International?",
        answer:
          "Yes. Tell us how many golfers and sets of clubs are travelling when you book, and we allocate a vehicle with enough boot space for bags and clubs.",
      },
      {
        question: "Do you collect walkers from Mourne accommodation near Castlewellan or Annsborough?",
        answer:
          "Yes. Enter the guest house, hostel or cottage address and add the property name so your driver goes straight to the right door.",
      },
      {
        question: "What if my inbound flight to Belfast International is late?",
        answer:
          "Share the flight number and we monitor the arrival where possible, then adjust your Newcastle transfer. Airport pickups include up to 60 minutes complimentary waiting as standard.",
      },
    ],
  },
  {
    slug: "newcastle-to-belfast-city-airport",
    townSlug: "newcastle",
    airportCode: "BHD",
    title: "Newcastle to Belfast City Airport Taxi",
    h1: "Newcastle to Belfast City Airport Taxi",
    metaDescription:
      "Book a fixed-fare taxi from Newcastle, Co Down or Clough to George Best Belfast City Airport via the A24. Ideal for golfers flying from Great Britain. 5★ Google.",
    intro:
      "Newcastle to Belfast City Airport is the classic golf transfer: George Best Belfast City Airport has frequent flights from London and other Great Britain airports, and the A24 runs north from Newcastle through Clough, Ballynahinch and Carryduff into Belfast and across to Sydenham. My Airport Taxi NI collects from Newcastle, Dundrum, Castlewellan, Annsborough and Clough, and quotes a fixed fare from your exact address, with Belfast City Airport already selected here. Express Drop-Off and the applicable airport access charge are included. Golf parties staying near Royal County Down should mention clubs and bags so we send the right vehicle, and the booking form takes early-morning and late-evening times. Flying into Belfast City for a round or a weekend in the Mournes? Book the collection on this page with your flight number; we monitor flights where possible and airport pickups include up to 60 minutes complimentary waiting. Add a return to cover both legs.",
    journeyInfo: `The A24 north through Clough, Ballynahinch and Carryduff into Belfast, then across to Sydenham, is the usual line. The Carryduff approach and the city roads are the parts to allow for at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Newcastle, Dundrum, Clough or anywhere nearby and drive you to Belfast City Airport. Allow for Belfast traffic when choosing your pickup. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Newcastle is booked on this page. Add the flight number so we can monitor the landing time where possible. Follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Newcastle to George Best is a reserved booking with a fixed fare — no hire car to return and no driving after a long day on the links.",
    localAreasText:
      "Newcastle, Dundrum and Castlewellan are separate pickups. Clough and Annsborough are priced from the village address; golf hotels should be named in the booking.",
    faqs: [
      {
        question: "How much does a Newcastle to Belfast City Airport taxi cost?",
        answer:
          "Our instant quote works from your exact Newcastle, Clough or Dundrum address and shows the fixed George Best fare, airport access charge and Express Drop-Off included, before you pay anything.",
      },
      {
        question: "How long does the A24 run from Newcastle to Belfast City Airport take?",
        answer:
          "Drivers normally follow the A24 through Ballynahinch and Carryduff into Belfast, and your quote shows a mapped time from the Newcastle pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can a golf group be collected at Belfast City Airport and taken to Newcastle?",
        answer:
          "Yes. Book the collection with your flight number, the number of passengers and how many sets of clubs, and we send a vehicle sized for the group.",
      },
      {
        question: "Do you monitor flights into Belfast City for Newcastle transfers?",
        answer:
          "Yes, where possible. Add your flight number at booking; Belfast City collections also come with up to 60 minutes complimentary waiting.",
      },
      {
        question: "Can I book Belfast City Airport to Newcastle and back again?",
        answer:
          "Yes. Select the return option and enter both flights, and your arrival and departure transfers for the Newcastle stay are kept on one booking.",
      },
    ],
  },
  {
    slug: "newcastle-to-dublin-airport",
    townSlug: "newcastle",
    airportCode: "DUB",
    title: "Newcastle to Dublin Airport Taxi",
    h1: "Newcastle to Dublin Airport Taxi",
    metaDescription:
      "Taxi from Newcastle, Co Down or Castlewellan to Dublin Airport via the A50 and A1. Fixed fare with M1 tolls included — popular with US golfers and Mourne visitors.",
    intro:
      "Newcastle to Dublin Airport is a cross-border run many visitors do not expect to be so practical: the A50 through Castlewellan to Banbridge, then down the A1 past Newry and onto the M1 to Dublin Airport. Golfers flying in from North America for Royal County Down often land at Dublin, and Mourne locals use it for long-haul holidays. My Airport Taxi NI quotes a fixed Dublin Airport fare from your exact address, with applicable M1 tolls included, and this page already has Dublin Airport selected. We collect from Newcastle, Dundrum, Castlewellan, Annsborough and Clough, from homes, golf hotels and holiday cottages, and the booking form takes overnight pickup times. Tell us your terminal and how many sets of clubs are travelling. Arriving at Dublin? Book the collection here with your flight number; we monitor flights where possible, your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting.",
    journeyInfo: `The A50 through Castlewellan to Banbridge, then the A1 south past Newry and the M1 in the Republic, is the usual line. The Newry stretch and the M1 approach to Dublin are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Newcastle, Castlewellan, Dundrum or anywhere around the Mournes and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Newcastle is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Newcastle to Dublin Airport is a long cross-border transfer, booked ahead with the fare and tolls confirmed before you go.",
    localAreasText:
      "Newcastle, Dundrum and Castlewellan are priced separately. Annsborough and Clough are quoted from the village address; name your hotel or cottage in the booking.",
    faqs: [
      {
        question: "How much is a taxi from Newcastle, Co Down to Dublin Airport?",
        answer:
          "Enter your Newcastle or Castlewellan address, or the name of your golf hotel, in the quote box for a fixed Dublin fare with applicable M1 tolls included. If an instant figure is not shown, request a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Newcastle to Dublin Airport take?",
        answer:
          "The usual route is the A50 to Banbridge, the A1 past Newry and then the M1 south, and the quote shows a mapped time from your Mourne pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you collect golfers arriving at Dublin Airport for Royal County Down?",
        answer:
          "Yes. Book with your flight number, group size and number of club bags; your driver meets you in Arrivals and takes you straight to your Newcastle accommodation.",
      },
      {
        question: "Are M1 tolls included from Newcastle to Dublin Airport?",
        answer: "Yes. Applicable M1 tolls are already in the fixed Newcastle–Dublin fare, so there is no toll to settle with the driver.",
      },
      {
        question: "What happens if my Dublin flight back to Newcastle is delayed?",
        answer:
          "We monitor the flight number where possible and move the collection to suit. Your driver waits in Arrivals, with up to 60 minutes complimentary waiting on airport pickups.",
      },
    ],
  },
];

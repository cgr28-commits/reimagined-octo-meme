import type { TransferRouteContent } from "@/lib/town-transfer-types";

/**
 * Batch 6b routes — Armagh, Dungannon and Cookstown. Roads named are the usual corridors only;
 * no fares, mileages, or journey-time claims.
 */
const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

export const TRANSFER_ROUTE_BATCH_6B: TransferRouteContent[] = [
  // ---------------------------------------------------------------- Armagh
  {
    slug: "armagh-to-belfast-international",
    townSlug: "armagh",
    airportCode: "BFS",
    title: "Armagh to Belfast International Airport Taxi",
    h1: "Armagh to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Armagh, Richhill, Markethill or Loughgall to Belfast International Airport. Fixed price via the A3 and M1, booked from your door. 5★ Google.",
    intro:
      "Armagh to Belfast International Airport takes you out of the cathedral city on the A3 through Richhill towards Portadown, onto the M1 heading east, and then north across country to Aldergrove. My Airport Taxi NI collects from Armagh city, Markethill, Richhill, Keady, Tandragee and Loughgall, and this page already has Belfast International selected, so you only add your pickup address to see a fixed price. Plenty of Aldergrove flights leave early in the morning, and the booking form takes pickup times through the night so you are not relying on a lift or a week in the long-stay car park. Flying back into Belfast International? Book the collection here with your flight number; we monitor arrivals where possible and airport pickups include complimentary waiting. Orchard-country addresses around Loughgall and Richhill should include the house name or townland. Add a return to keep both legs on one booking, and message us on WhatsApp if the pickup needs directions.",
    journeyInfo: `The A3 through Richhill towards Portadown, the M1 east, then north towards Aldergrove is the usual line. The Portadown end of the A3 and the cross-country stretch to the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Armagh city or any of the surrounding villages and drive you to Belfast International. Book so the A3 and M1 sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Armagh is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Armagh to Aldergrove is a reserved booking with the fare confirmed before you travel — no early drive across the county and no airport parking bill.",
    localAreasText:
      "Armagh city, Richhill and Loughgall are separate pickups. Markethill, Keady and Tandragee are priced from the village address. Rural homes need the house name or townland.",
    faqs: [
      {
        question: "How much is a taxi from Armagh to Belfast International Airport?",
        answer:
          "Put your Armagh, Richhill or Loughgall address into the quote box and the fixed price for that pickup appears before you book. Express Drop-Off and the airport access charge are already in it, so there is nothing extra to pay at the terminal.",
      },
      {
        question: "How long does Armagh to Belfast International take?",
        answer:
          "Most runs go out the A3 past Richhill, along the M1 and north to Aldergrove; the quote shows the mapped time from your own address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you collect me from Belfast International and bring me home to Armagh?",
        answer:
          "Yes. Book the collection on this page with your flight number and Armagh address, and we bring you back to the door.",
      },
      {
        question: "What happens if my flight into Belfast International lands late?",
        answer:
          "Give us the flight number when booking. We track the arrival where possible and move the pickup to suit, and airport collections include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you pick up from farms and rural homes around Loughgall and Keady?",
        answer:
          "Yes. Enter the full address with the house name or townland, and add a note if the lane is hard to find.",
      },
    ],
  },
  {
    slug: "armagh-to-belfast-city-airport",
    townSlug: "armagh",
    airportCode: "BHD",
    title: "Armagh to Belfast City Airport Taxi",
    h1: "Armagh to Belfast City Airport Taxi",
    metaDescription:
      "Book a fixed-price taxi from Armagh, Tandragee or Keady to George Best Belfast City Airport. M1, Westlink and M3 transfer from your door. Rated 5★ on Google.",
    intro:
      "Armagh to Belfast City Airport is a reserved transfer to George Best Belfast City Airport: the A3 out of Armagh to join the M1, the motorway all the way into Belfast, then the Westlink and the M3 across the harbour to Sydenham. It is a popular choice for business trips and short flights to Great Britain. My Airport Taxi NI collects from Armagh city, Markethill, Richhill, Keady, Tandragee and Loughgall, and Belfast City Airport is already selected on this page so you just add your street for a fixed price. Early departures from the city airport mean early starts from County Armagh, and the booking form accepts pickup times before dawn. Returning to Belfast City Airport? Book the collection here with your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. Enter the full address, including any house name. Add a return to keep both directions together, and message us on WhatsApp with any questions.",
    journeyInfo: `The A3 to the M1, the M1 into Belfast, then the Westlink and M3 to Sydenham is the usual line. The Westlink and the city approach are the parts to allow for at rush hour. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Armagh or the surrounding villages and drive you to Belfast City Airport. Book so the M1 and the Westlink sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Armagh is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Armagh to George Best is a reserved booking with the fare confirmed before you travel — one car from the cathedral city to the terminal door.",
    localAreasText:
      "Armagh city and Tandragee are separate pickups. Markethill, Richhill, Keady and Loughgall are priced from the village address. Give a house name for rural homes.",
    faqs: [
      {
        question: "How much is a taxi from Armagh to Belfast City Airport?",
        answer:
          "Type your Armagh, Tandragee or Keady address into the quote box to see the fixed George Best fare for that street. The applicable airport access charge is included, and the price is confirmed before you pay.",
      },
      {
        question: "How long does Armagh to Belfast City Airport take?",
        answer:
          "It runs the length of the M1 into Belfast and then along the Westlink and M3, so the city end matters most; your quote shows the mapped time from your address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Should I fly from Belfast City or Belfast International when leaving Armagh?",
        answer:
          "Both are reached via the M1. Belfast International turns north before the city, while Belfast City Airport means going through Belfast on the Westlink. Book whichever airport your airline uses — both are priced from your door.",
      },
      {
        question: "Can I book a pickup from Belfast City Airport back to Armagh?",
        answer: "Yes. Book the return on this page with your flight number and Armagh address.",
      },
      {
        question: "Is my Belfast City Airport collection affected if the flight is delayed?",
        answer:
          "Add your flight number and we follow its progress where possible, adjusting the pickup if it is late. Airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "armagh-to-dublin-airport",
    townSlug: "armagh",
    airportCode: "DUB",
    title: "Armagh to Dublin Airport Taxi",
    h1: "Armagh to Dublin Airport Taxi",
    metaDescription:
      "Pre-book a taxi from Armagh, Markethill or Keady to Dublin Airport. Fixed-price transfer via the A28 and Newry, applicable M1 tolls included. 5★ on Google.",
    intro:
      "Armagh to Dublin Airport is one of the most natural cross-border runs we do: the A28 south through Markethill to Newry, then the A1 to the border and the M1 through Dundalk and Drogheda to the airport. Many people in County Armagh find Dublin offers more direct flights than either Belfast airport, and a pre-booked car means no long-stay parking bill at the other end. My Airport Taxi NI quotes this as a fixed Dublin Airport fare with applicable M1 tolls included, and Dublin Airport is already selected on this page — you add your pickup address. Early transatlantic and European departures are no problem, as the booking form accepts overnight pickup times. Tell us your terminal once you know it. Flying home into Dublin? Book the collection here with your flight number; we monitor it where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Add a return to keep both legs together.",
    journeyInfo: `The A28 through Markethill to Newry, then the A1 and the M1 in the Republic, is the usual line. Newry and the airport approach on the M1 are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Armagh city, Keady, Markethill or anywhere nearby and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Armagh is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Armagh to Dublin Airport is a cross-border run booked ahead, with the fare and tolls confirmed before you travel.",
    localAreasText:
      "Armagh city, Markethill and Keady are separate pickups. Richhill, Tandragee and Loughgall are priced from the village address. Rural homes need the house name.",
    faqs: [
      {
        question: "How much is a taxi from Armagh to Dublin Airport?",
        answer:
          "Enter your Armagh, Markethill or Keady address in the quote box for a fixed Dublin fare with applicable M1 tolls included. If an instant price is not shown for a rural address, request a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Armagh to Dublin Airport take?",
        answer:
          "The car usually heads down the A28 to Newry and then follows the A1 and M1 south; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are the M1 tolls between Armagh and Dublin Airport extra?",
        answer: "No. Applicable M1 tolls are included in the fixed fare you see before booking.",
      },
      {
        question: "Which Dublin Airport terminal will you drop me at?",
        answer: "Terminal 1 or Terminal 2 — check with your airline and let us know when booking from Armagh.",
      },
      {
        question: "Can I book Dublin Airport back to Armagh after my holiday?",
        answer:
          "Yes. Book the Dublin collection on this page with your flight number and Armagh address. Your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  // ---------------------------------------------------------------- Dungannon
  {
    slug: "dungannon-to-belfast-international",
    townSlug: "dungannon",
    airportCode: "BFS",
    title: "Dungannon to Belfast International Airport Taxi",
    h1: "Dungannon to Belfast International Airport Taxi",
    metaDescription:
      "Taxi from Dungannon, Coalisland or Moy to Belfast International Airport at a fixed price. M1 transfer from your front door, booked ahead. Rated 5★ on Google.",
    intro:
      "Dungannon to Belfast International Airport begins right at the western end of the M1: the motorway east past the Lough Neagh side of County Armagh, then north across country to Aldergrove. My Airport Taxi NI collects from Dungannon, Coalisland, Moy, Donaghmore, Ballygawley and Aughnacloy, and quotes a fixed price from your exact address, with Belfast International already chosen on this page. Early flights from Aldergrove are easier when someone else does the driving, and the booking form takes pickup times through the night. Coming back into Belfast International? Book the collection here and add your flight number; we monitor arrivals where possible and airport pickups include complimentary waiting. Clogher Valley pickups around Ballygawley and Aughnacloy are priced from that village, so type the full address rather than just Dungannon. Rural homes should include a house name or townland. Add a return to put both journeys on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `The M1 east from Dungannon, then north across country towards Aldergrove, is the usual line. Pickups out in the Clogher Valley add the run back to the motorway, and the final approach to the airport is the part to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Dungannon, Coalisland or anywhere in the surrounding district and drive you to Belfast International. Book so the M1 sits comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Dungannon is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Dungannon to Aldergrove is a reserved booking with the fare confirmed before you travel — straight onto the M1 with no airport parking to arrange.",
    localAreasText:
      "Dungannon, Coalisland and Moy are separate pickups. Donaghmore, Ballygawley and Aughnacloy are priced from the village address. Rural homes need a house name.",
    faqs: [
      {
        question: "How much is a taxi from Dungannon to Belfast International Airport?",
        answer:
          "Add your Dungannon, Coalisland or Moy address to the quote box and you see the fixed Aldergrove price for that pickup before booking. Ballygawley and Aughnacloy are priced from their own addresses, so enter yours in full.",
      },
      {
        question: "How long does Dungannon to Belfast International take?",
        answer:
          "The car joins the M1 at Dungannon, heads east, then turns north for Aldergrove; your quote gives the mapped time from your door. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Belfast International back to Coalisland or Dungannon?",
        answer: "Yes. Book the collection on this page with your flight number and home address.",
      },
      {
        question: "Will you wait if my Belfast International flight is delayed?",
        answer:
          "Yes. Add the flight number and we monitor it where possible, moving the pickup if needed. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you cover the Clogher Valley, such as Ballygawley and Aughnacloy?",
        answer:
          "Yes. Enter the village or rural address in full and the quote prices that exact pickup.",
      },
    ],
  },
  {
    slug: "dungannon-to-belfast-city-airport",
    townSlug: "dungannon",
    airportCode: "BHD",
    title: "Dungannon to Belfast City Airport Taxi",
    h1: "Dungannon to Belfast City Airport Taxi",
    metaDescription:
      "Fixed-fare taxi from Dungannon, Donaghmore or Ballygawley to George Best Belfast City Airport. The full M1 into Belfast, booked ahead from your door. 5★ Google.",
    intro:
      "Dungannon to Belfast City Airport is about as simple as a cross-province run gets: join the M1 at its western end, follow it the whole way into Belfast, then take the Westlink and the M3 over to Sydenham and George Best Belfast City Airport. It suits business travellers and anyone on a short flight to London, Manchester or elsewhere in Great Britain. My Airport Taxi NI collects from Dungannon, Coalisland, Moy, Donaghmore, Ballygawley and Aughnacloy, and this page already has Belfast City Airport selected, so you add your address for a fixed price. The booking form accepts early-morning pickups for the first departures. Flying back into Belfast City Airport? Book the collection here with your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. Enter the full address, including any house name or townland. Add a return to keep both directions on one booking, and message us on WhatsApp if you need help.",
    journeyInfo: `The M1 from Dungannon into Belfast, then the Westlink and M3 to Sydenham, is the usual line. The Belfast end of the M1 and the Westlink are the parts to allow for at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Dungannon or the surrounding villages and drive you to Belfast City Airport. Book so the M1 and the city section sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Dungannon is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Dungannon to George Best is a reserved booking with the fare confirmed before you travel — one car along the M1 from your door to the terminal.",
    localAreasText:
      "Dungannon, Donaghmore and Ballygawley are separate pickups. Coalisland, Moy and Aughnacloy are priced from the village address. Give a house name for rural homes.",
    faqs: [
      {
        question: "How much is a taxi from Dungannon to Belfast City Airport?",
        answer:
          "Pop your Dungannon, Donaghmore or Ballygawley address into the quote box and the fixed George Best fare for that street is shown before you pay, with the applicable airport access charge already included.",
      },
      {
        question: "How long does Dungannon to Belfast City Airport take?",
        answer:
          "It is essentially the whole M1 plus the Westlink and M3 through Belfast, so the city traffic makes the biggest difference; the quote shows the mapped time from your address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City or Belfast International the better airport from Dungannon?",
        answer:
          "Belfast International turns off before Belfast, while Belfast City Airport means going through the city on the Westlink. Choose the airport your flight uses — both are quoted from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Dungannon?",
        answer: "Yes. Book the collection on this page with your flight number and your Dungannon-area address.",
      },
      {
        question: "What if my flight into Belfast City Airport is late?",
        answer:
          "Add the flight number when booking and we keep an eye on it where possible, shifting the collection to match. Airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "dungannon-to-dublin-airport",
    townSlug: "dungannon",
    airportCode: "DUB",
    title: "Dungannon to Dublin Airport Taxi",
    h1: "Dungannon to Dublin Airport Taxi",
    metaDescription:
      "Book a taxi from Dungannon, Moy, Coalisland or Aughnacloy to Dublin Airport. Fixed-price cross-border transfer, applicable M1 tolls included. 5★ on Google.",
    intro:
      "Dungannon to Dublin Airport is a reserved cross-border transfer, and from here there is more than one sensible way south. Most runs head towards Newry and then follow the A1 and the M1 through Dundalk and Drogheda, while pickups on the Clogher Valley side around Aughnacloy can cross into County Monaghan and come down through Monaghan instead. Your driver picks the best line on the day. My Airport Taxi NI quotes a fixed Dublin Airport fare with applicable M1 tolls included, and this page already has Dublin Airport selected — you add your address in Dungannon, Coalisland, Moy, Donaghmore, Ballygawley or Aughnacloy. The booking form accepts overnight pickups for first-wave departures. Let us know your terminal once you have it. Coming home through Dublin? Book the collection here with your flight number; we monitor it where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Add a return for both legs.",
    journeyInfo: `Towards Newry and then the A1 and M1 south is the usual line, with the Monaghan road an option from the Aughnacloy side. The Newry area and the M1 approach to the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Dungannon, the Clogher Valley or anywhere nearby and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Dungannon is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Dungannon to Dublin Airport is a long cross-border run, booked ahead with the fare and tolls confirmed before you travel.",
    localAreasText:
      "Dungannon, Moy and Aughnacloy are separate pickups. Coalisland, Donaghmore and Ballygawley are priced from the village address. Rural homes need a house name.",
    faqs: [
      {
        question: "How much is a taxi from Dungannon to Dublin Airport?",
        answer:
          "Use the quote box with your Dungannon, Moy or Aughnacloy address to get a fixed Dublin fare that already includes applicable M1 tolls. If no instant price appears for your address, ask for a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Dungannon to Dublin Airport take?",
        answer:
          "Depending on where you are collected, the car goes south via Newry or via Monaghan before joining the motorway to the airport; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Which way do you drive from Dungannon to Dublin Airport?",
        answer:
          "Usually towards Newry and down the A1 and M1. From Aughnacloy and the Clogher Valley, the route through Monaghan can make more sense. Either way the fixed fare does not change.",
      },
      {
        question: "Which Dublin Airport terminal do you drop off at?",
        answer: "Terminal 1 or Terminal 2 — check with your airline and add it to your Dungannon booking.",
      },
      {
        question: "Can I book Dublin Airport back to Dungannon or Coalisland?",
        answer:
          "Yes. Add your flight number and Dungannon or Coalisland address when booking the collection here. Your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  // ---------------------------------------------------------------- Cookstown
  {
    slug: "cookstown-to-belfast-international",
    townSlug: "cookstown",
    airportCode: "BFS",
    title: "Cookstown to Belfast International Airport Taxi",
    h1: "Cookstown to Belfast International Airport Taxi",
    metaDescription:
      "Fixed-price taxi from Cookstown, Magherafelt or Moneymore to Belfast International Airport, round the top of Lough Neagh via Toome. Book ahead. 5★ Google.",
    intro:
      "Cookstown to Belfast International Airport is the closest airport run from Mid Ulster: across to the A6 at Toome, round the top of Lough Neagh past Randalstown, then on towards Antrim and Aldergrove. My Airport Taxi NI collects from Cookstown, Magherafelt, Moneymore, Maghera, Stewartstown and Pomeroy, and this page already has Belfast International selected, so you add your address for a fixed price. Early departures are common from Aldergrove, and the booking form takes overnight pickup times so nobody has to drive you there in the dark. Landing back at Belfast International? Book the collection here and add your flight number; we monitor arrivals where possible and airport pickups include complimentary waiting. Magherafelt and Maghera are priced separately from Cookstown, so give the full address. Lough-shore and Sperrin-side homes should include the house name or townland. Add a return to keep both legs together, and message us on WhatsApp with any questions.",
    journeyInfo: `Across to the A6 at Toome, past Randalstown, then on towards Antrim and Aldergrove is the usual line. The crossing at Toome and the final approach to the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Cookstown, Magherafelt or anywhere in Mid Ulster and drive you to Belfast International. Book so the A6 sits comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Cookstown is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Cookstown to Aldergrove is a reserved booking with the fare confirmed before you travel — round Lough Neagh without the airport car park.",
    localAreasText:
      "Cookstown, Magherafelt and Moneymore are separate pickups. Maghera, Stewartstown and Pomeroy are priced from the village address. Rural homes need a house name.",
    faqs: [
      {
        question: "How much is a taxi from Cookstown to Belfast International Airport?",
        answer:
          "Enter your Cookstown, Magherafelt or Moneymore address in the quote box and the fixed Aldergrove fare for that pickup shows up before you book. Express Drop-Off and the airport access charge are included.",
      },
      {
        question: "How long does Cookstown to Belfast International take?",
        answer:
          "The car crosses to Toome and follows the A6 past Randalstown towards Aldergrove; the quote shows the mapped time from your own street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can I book Belfast International back to Magherafelt or Cookstown?",
        answer: "Yes. Book the collection on this page with your flight number and Mid Ulster address.",
      },
      {
        question: "What if my inbound flight to Belfast International is delayed?",
        answer:
          "Include the flight number and we watch it where possible, adjusting your collection time. Airport pickups include up to 60 minutes complimentary waiting.",
      },
      {
        question: "Do you collect from Maghera, Pomeroy and Stewartstown too?",
        answer:
          "Yes. Each is priced from its own address, so enter it in full and add a house name for rural pickups.",
      },
    ],
  },
  {
    slug: "cookstown-to-belfast-city-airport",
    townSlug: "cookstown",
    airportCode: "BHD",
    title: "Cookstown to Belfast City Airport Taxi",
    h1: "Cookstown to Belfast City Airport Taxi",
    metaDescription:
      "Taxi from Cookstown, Maghera or Magherafelt to George Best Belfast City Airport. Fixed fare via the A6, M22 and M2, booked from your door. Rated 5★ on Google.",
    intro:
      "Cookstown to Belfast City Airport is a reserved transfer from Mid Ulster to George Best Belfast City Airport: across to the A6 at Toome, onto the M22 at Randalstown, down the M2 into Belfast, then across the city to Sydenham. It works well for business travellers and short flights to Great Britain. My Airport Taxi NI collects from Cookstown, Magherafelt, Moneymore, Maghera, Stewartstown and Pomeroy, and Belfast City Airport is already selected on this page, so you add your street to see a fixed price. First flights out of the city airport mean early starts west of Lough Neagh, and the booking form accepts pre-dawn pickup times. Flying home to Belfast City Airport? Book the collection here with your flight number; we monitor inbound flights where possible and airport pickups include complimentary waiting. Enter the full address, including any house name. Add a return to keep both directions on one booking, and message us on WhatsApp if anything needs explaining.",
    journeyInfo: `The A6 via Toome, the M22 and M2 into Belfast, then across the city to Sydenham is the usual line. The M2 into the city and the cross-town section are the parts to allow for at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Cookstown, Magherafelt or anywhere nearby and drive you to Belfast City Airport. Book so the motorway and the city section sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Cookstown is booked on this page. Add the flight number so we can monitor the landing time where possible. After arrivals, follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Cookstown to George Best is a reserved booking with the fare confirmed before you travel — one car from Mid Ulster to the terminal.",
    localAreasText:
      "Cookstown, Maghera and Magherafelt are separate pickups. Moneymore, Stewartstown and Pomeroy are priced from the village address. Give a house name for rural homes.",
    faqs: [
      {
        question: "How much is a taxi from Cookstown to Belfast City Airport?",
        answer:
          "Key your Cookstown, Maghera or Magherafelt address into the quote box for the fixed George Best fare from that street, with the applicable airport access charge already built in and confirmed before payment.",
      },
      {
        question: "How long does Cookstown to Belfast City Airport take?",
        answer:
          "The route runs round the north of Lough Neagh and then down the M22 and M2 into Belfast, so the city end is the variable part; your quote shows the mapped time from your address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast International nearer than Belfast City Airport from Cookstown?",
        answer:
          "Usually, yes — Belfast International is reached before Belfast, while Belfast City Airport means continuing down the M2 and across the city. Book the airport your flight uses; both are priced from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Cookstown?",
        answer: "Yes. Book the return collection on this page with your flight number and Cookstown-area address.",
      },
      {
        question: "Do you wait if my Belfast City Airport flight is delayed?",
        answer:
          "Yes. Add the flight number so we can follow it where possible and adjust the pickup. Airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "cookstown-to-dublin-airport",
    townSlug: "cookstown",
    airportCode: "DUB",
    title: "Cookstown to Dublin Airport Taxi",
    h1: "Cookstown to Dublin Airport Taxi",
    metaDescription:
      "Book a private taxi from Cookstown, Magherafelt or Pomeroy to Dublin Airport. Fixed-price transfer via Dungannon and the M1, applicable tolls included. 5★ Google.",
    intro:
      "Cookstown to Dublin Airport is a reserved long-distance transfer that heads south rather than round the lough: down the A29 to Dungannon, onto the M1, then across to the A1 and past Newry to the border, finishing on the M1 through Dundalk and Drogheda. For Mid Ulster travellers on long-haul or cheaper Dublin flights it avoids a tiring drive and a week of airport parking. My Airport Taxi NI quotes a fixed Dublin Airport fare with applicable M1 tolls included, and Dublin Airport is already selected on this page — add your address in Cookstown, Magherafelt, Moneymore, Maghera, Stewartstown or Pomeroy. The booking form takes overnight pickup times for early departures. Tell us your terminal when you know it. Flying back into Dublin? Book the collection here with your flight number; we monitor it where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Add a return to keep both legs together.",
    journeyInfo: `The A29 to Dungannon, the M1 east, then the A1 past Newry and the M1 in the Republic, is the usual line. Pickups north of Cookstown add the run down to Dungannon, and the Newry area is the part to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Cookstown, Magherafelt or anywhere in Mid Ulster and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Cookstown is booked on this page. Add the flight number so we can monitor the landing time where possible; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Cookstown to Dublin Airport is a long cross-border run, booked ahead with the fare and tolls confirmed before you travel.",
    localAreasText:
      "Cookstown, Magherafelt and Pomeroy are separate pickups. Moneymore, Maghera and Stewartstown are priced from the village address. Rural homes need a house name.",
    faqs: [
      {
        question: "How much is a taxi from Cookstown to Dublin Airport?",
        answer:
          "Fill in your Cookstown, Magherafelt or Pomeroy address in the quote box for a fixed Dublin Airport price, applicable M1 tolls included. Where an instant price is not available for a rural pickup, request a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Cookstown to Dublin Airport take?",
        answer:
          "The car drops down the A29 to Dungannon and follows the M1 and A1 south past Newry to the airport; the quote shows the mapped time from your street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are tolls extra on a Cookstown to Dublin Airport taxi?",
        answer: "No. Applicable M1 tolls are part of the fixed fare shown before you book from Mid Ulster.",
      },
      {
        question: "Which terminal at Dublin Airport do you use?",
        answer: "Terminal 1 or Terminal 2 — confirm with your airline and add it to your Cookstown booking.",
      },
      {
        question: "Can I book Dublin Airport back to Magherafelt or Cookstown?",
        answer:
          "Yes. Book the return from Dublin on this page with your flight number and Mid Ulster address. Your driver meets you in Arrivals, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
];

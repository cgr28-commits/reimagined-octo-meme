import type { TransferRouteContent } from "@/lib/town-transfer-types";

/**
 * Batch 6c routes — Omagh, Enniskillen, Derry~Londonderry and Ballycastle to BFS, BHD and DUB.
 * Roads named are the usual corridors only; no fares, mileages, or journey-time claims.
 */
const TRAFFIC =
  "Journey times are approximate and can vary depending on traffic and time of day.";

export const TRANSFER_ROUTE_BATCH_6C: TransferRouteContent[] = [
  // ─── Omagh ────────────────────────────────────────────────────────────────
  {
    slug: "omagh-to-belfast-international",
    townSlug: "omagh",
    airportCode: "BFS",
    title: "Omagh to Belfast International Airport Taxi",
    h1: "Omagh to Belfast International Airport Taxi",
    metaDescription:
      "Private taxi from Omagh, Fintona or Gortin to Belfast International Airport. Fixed fare across Tyrone to Aldergrove, Express Drop-Off included. 5★ on Google.",
    intro:
      "Omagh to Belfast International Airport is a cross-country run from the county town of Tyrone to Aldergrove, usually east over the A505 towards Cookstown and on past the top of Lough Neagh, or along the A5 to Ballygawley and the A4 to the M1, depending on your pickup and the time of day. My Airport Taxi NI collects from Omagh, Fintona, Dromore, Sixmilecross, Gortin and Beragh and gives a fixed price from your exact address, with Belfast International already set on this page. Morning departures mean leaving west Tyrone in the small hours, so the booking form accepts overnight pickup times and your driver comes to the door. Flying home into Aldergrove? Book the collection back to Omagh here and add your flight number; we monitor arrivals where possible and airport pickups include up to 60 minutes complimentary waiting. Rural addresses outside the town should include the postcode or a landmark. Add a return to keep both directions on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `East over the A505 towards Cookstown and round the north of Lough Neagh, or the A5 and A4 to the M1 and then north to Aldergrove — the quote maps whichever suits your pickup. Market-day traffic in Omagh and the final approach to the airport are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Omagh town, the surrounding villages or a rural Tyrone address and drive you to Belfast International. Book so the cross-county run sits comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Omagh is booked on this page. Add your flight number so we can track the landing, then follow the collection instructions in your booking after arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Omagh to Aldergrove is a reserved booking with the fare agreed before you travel — no long early drive across Tyrone and no week of airport parking.",
    localAreasText:
      "Omagh, Fintona and Dromore are separate pickups. Sixmilecross, Beragh and Gortin are priced from the village address. Farm and townland addresses need a postcode.",
    faqs: [
      {
        question: "How much is a taxi from Omagh to Belfast International Airport?",
        answer:
          "Type your Omagh or west Tyrone address into the quote box and the fixed fare to Aldergrove appears before you book. A Gortin farm and an Omagh town street are priced separately, so use your real pickup rather than just the town name.",
      },
      {
        question: "How long does Omagh to Belfast International take?",
        answer:
          "It depends on whether the A505 via Cookstown or the A5, A4 and M1 is the better line from your street — the quote shows the mapped time for your exact pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Do you collect from rural addresses around Omagh?",
        answer:
          "Yes. Farms and townland addresses near Gortin, Sixmilecross or Beragh are fine — include the postcode and a landmark so the driver finds your lane in the dark.",
      },
      {
        question: "Can I book Belfast International back to Omagh?",
        answer:
          "Yes. Book the collection on this page with your flight number and your Tyrone address, and add it as a return if you want both legs together.",
      },
      {
        question: "What happens if my flight into Aldergrove lands late?",
        answer:
          "We watch your flight where possible and move the Omagh collection to match, and airport pickups include up to 60 minutes complimentary waiting once you land.",
      },
    ],
  },
  {
    slug: "omagh-to-belfast-city-airport",
    townSlug: "omagh",
    airportCode: "BHD",
    title: "Omagh to Belfast City Airport Taxi",
    h1: "Omagh to Belfast City Airport Taxi",
    metaDescription:
      "Book a fixed-price taxi from Omagh and west Tyrone to George Best Belfast City Airport via the A5, A4 and M1. Door-to-terminal private transfer, 5★ rated.",
    intro:
      "Omagh to Belfast City Airport takes you from west Tyrone to George Best Belfast City Airport at Sydenham, normally down the A5 to Ballygawley, along the A4 dual carriageway past Dungannon, then the length of the M1 into Belfast and across the city to the terminal. It is a popular booking for business trips and short flights to Great Britain. My Airport Taxi NI collects from Omagh, Fintona, Dromore, Sixmilecross, Gortin and Beragh, and quotes a fixed price from your door with Belfast City Airport already chosen on this page. Early flights from Sydenham mean very early starts in Tyrone, so the booking form takes overnight pickup times. Landing back at Belfast City? Book the run home to Omagh here with your flight number; we follow inbound flights where possible and airport pickups include complimentary waiting. Enter the full address, including the postcode for rural properties. You can add a return to the same booking, and we answer questions on WhatsApp.",
    journeyInfo: `The A5 to Ballygawley, the A4 past Dungannon, the M1 into Belfast, then across the city to Sydenham is the usual line. The Westlink and the city crossing to the airport are the parts to allow for at rush hour. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Omagh or anywhere in west Tyrone and drive you to Belfast City Airport. Book so the M1 and the city section sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Omagh is booked on this page. Add the flight number so we can track your landing time, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Omagh to George Best is one car from Tyrone to the terminal, booked ahead with the fare confirmed before you set off.",
    localAreasText:
      "Omagh town, Fintona and Dromore are priced separately. Gortin, Beragh and Sixmilecross are quoted from the village. Give a postcode for farm addresses.",
    faqs: [
      {
        question: "How much is a taxi from Omagh to Belfast City Airport?",
        answer:
          "Put your Omagh, Fintona or Dromore address in the quote box for the fixed fare to Sydenham, with the applicable airport access charge already built in. You see the price before you pay anything.",
      },
      {
        question: "How long does Omagh to Belfast City Airport take?",
        answer:
          "The usual line is the A5 and A4 to the M1 and then right through Belfast, so the city end matters most; the quote gives a mapped time from your own street. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City or Belfast International better from Omagh?",
        answer:
          "Both are long runs from west Tyrone. Belfast City Airport means going right through Belfast, while Aldergrove can be reached without crossing the city. Book the airport your flight uses — both are priced from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Omagh?",
        answer:
          "Yes. Add your inbound flight number and your Omagh-area address on this page and we bring you home to the door.",
      },
      {
        question: "What if my Belfast City flight home to Tyrone is delayed?",
        answer:
          "Give us the flight number when booking. We track it where possible, shift the pickup if it runs late, and airport collections include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "omagh-to-dublin-airport",
    townSlug: "omagh",
    airportCode: "DUB",
    title: "Omagh to Dublin Airport Taxi",
    h1: "Omagh to Dublin Airport Taxi",
    metaDescription:
      "Pre-booked taxi from Omagh to Dublin Airport via the A5, Aughnacloy and the N2. Fixed long-distance fare with applicable tolls included. Rated 5★ on Google.",
    intro:
      "Omagh to Dublin Airport is a reserved cross-border transfer that usually heads straight south on the A5 through Ballygawley and Aughnacloy, crosses into County Monaghan and follows the N2 towards Dublin and the airport. For many people in west Tyrone it is the most practical way to reach long-haul and transatlantic flights. My Airport Taxi NI quotes it as one fixed Dublin Airport fare with any applicable tolls included, and this page already has Dublin Airport selected — you just add your pickup. Early Dublin departures mean setting off from Tyrone in the middle of the night, so the booking form accepts overnight times. Tell us your terminal once you know it. Coming home from Dublin? Book the collection to Omagh here with your flight number; we follow inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. Enter your full address, including the postcode for rural homes, and message us on WhatsApp with anything else.",
    journeyInfo: `The A5 south through Ballygawley and Aughnacloy, then the N2 through Monaghan towards Dublin and the airport, is the usual line. Town sections on the N2 and the approach around Dublin are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Omagh or anywhere in west Tyrone and drive you to Dublin Airport Terminal 1 or Terminal 2. Any applicable tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Omagh is booked on this page. Add your flight number so we can track the landing; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Omagh to Dublin Airport is a long cross-border trip, booked ahead with one fare confirmed before you travel.",
    localAreasText:
      "Omagh, Fintona, Dromore, Sixmilecross, Gortin and Beragh are all covered. Each is priced from your own address; rural homes need a postcode.",
    faqs: [
      {
        question: "How much is a taxi from Omagh to Dublin Airport?",
        answer:
          "Enter your Tyrone pickup in the quote box to see the fixed Dublin Airport fare with any applicable tolls included. If no instant price shows for a remote address, request a fixed quote and we confirm it before you pay.",
      },
      {
        question: "How long does Omagh to Dublin Airport take?",
        answer:
          "The usual line is the A5 to Aughnacloy and then the N2 south; your quote shows the mapped time from your street to the terminal. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Which Dublin Airport terminal do you drop off at from Omagh?",
        answer:
          "Whichever your airline uses — Terminal 1 or Terminal 2. Add it when booking or message us once you know.",
      },
      {
        question: "Can I book Dublin Airport back to Omagh?",
        answer:
          "Yes. Book the homeward collection here with your flight number; the driver meets you in Arrivals and drives you back across the border to your door.",
      },
      {
        question: "Do I need to pay any tolls on the way to Dublin from Omagh?",
        answer:
          "No. Any applicable tolls on the route are included in the fixed fare, so there is nothing extra to pay on the day.",
      },
    ],
  },

  // ─── Enniskillen ──────────────────────────────────────────────────────────
  {
    slug: "enniskillen-to-belfast-international",
    townSlug: "enniskillen",
    airportCode: "BFS",
    title: "Enniskillen to Belfast International Airport Taxi",
    h1: "Enniskillen to Belfast International Airport Taxi",
    metaDescription:
      "Fixed-price taxi from Enniskillen, Lisnaskea, Irvinestown or Kesh to Belfast International Airport along the A4 and M1. Booked ahead, door to terminal.",
    intro:
      "Enniskillen to Belfast International Airport is one of the longest airport runs in Northern Ireland, leaving the Fermanagh lakelands on the A4 through Fivemiletown, Augher and Ballygawley, joining the M1 at Dungannon and then heading north towards Aldergrove. Booking it ahead means one fixed fare, one car and no week of parking at the terminal. My Airport Taxi NI collects from Enniskillen, Irvinestown, Lisnaskea, Belleek, Kesh and Ballinamallard, plus holiday cottages and marinas on Lough Erne, with Belfast International already set on this page. First-wave departures need a very early start from Fermanagh, so the booking form accepts overnight pickups. Flying back into Aldergrove? Book the drive home to Enniskillen here with your flight number; we monitor arrivals where possible and airport pickups include up to 60 minutes complimentary waiting. Give the property or marina name for lakeside pickups. Add a return to keep both legs on one booking, and send us a WhatsApp message if anything needs explaining.",
    journeyInfo: `The A4 east through Fivemiletown and Ballygawley, the M1 from Dungannon, then north to Aldergrove is the usual line. Single-carriageway stretches of the A4 in Fermanagh and the airport approach are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Enniskillen, the lough-shore villages or a holiday let and drive you to Belfast International. Book so the long A4 and M1 run sits well ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Enniskillen is booked on this page. Add the flight number so we can track the landing, and follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Enniskillen to Aldergrove is a long transfer booked with the fare agreed in advance — no tiring early drive and no airport parking bill.",
    localAreasText:
      "Enniskillen, Lisnaskea and Irvinestown are separate pickups. Belleek, Kesh and Ballinamallard are priced from the village. Lakeside lets need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Enniskillen to Belfast International Airport?",
        answer:
          "Use the quote box with your Fermanagh address — Enniskillen, Lisnaskea, Kesh or wherever you are staying — and the fixed fare to Aldergrove is shown before you book. Belleek and Enniskillen are priced differently, so enter the actual pickup.",
      },
      {
        question: "How long does Enniskillen to Belfast International take?",
        answer:
          "This is a long transfer along the A4 and M1, and the quote shows the mapped time from your own door in Fermanagh so you can plan around check-in. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you collect from a holiday let or marina on Lough Erne?",
        answer:
          "Yes. Enter the address and add the property, holiday park or marina name so the driver finds the right entrance on the lough shore.",
      },
      {
        question: "Can I book Belfast International back to Enniskillen?",
        answer:
          "Yes. Book the collection here with your flight number and your Fermanagh address, or add it as the return leg of your outbound booking.",
      },
      {
        question: "What if my flight into Belfast International is late landing?",
        answer:
          "Your driver follows the flight where possible and adjusts the Fermanagh-bound collection, and up to 60 minutes complimentary waiting is included on airport pickups.",
      },
    ],
  },
  {
    slug: "enniskillen-to-belfast-city-airport",
    townSlug: "enniskillen",
    airportCode: "BHD",
    title: "Enniskillen to Belfast City Airport Taxi",
    h1: "Enniskillen to Belfast City Airport Taxi",
    metaDescription:
      "Book a private Enniskillen to George Best Belfast City Airport taxi. Fixed fare from Fermanagh via the A4 and M1, airport access charge included. 5★ Google.",
    intro:
      "Enniskillen to Belfast City Airport crosses almost the whole of Northern Ireland, from Fermanagh to George Best Belfast City Airport on the shores of Belfast Lough: the A4 east past Fivemiletown and Augher, the M1 from Dungannon into Belfast, then through the city to Sydenham. It is a sensible booking for business travellers and anyone on a short flight to Great Britain who would rather not drive and park. My Airport Taxi NI collects from Enniskillen, Irvinestown, Lisnaskea, Belleek, Kesh and Ballinamallard and quotes a fixed price from your address, with Belfast City Airport already chosen on this page. Early flights mean overnight starts from the lakelands, and the booking form accepts those times. Landing back at Belfast City? Book your lift home to Fermanagh here with the flight number; we track inbound flights where possible and airport pickups include complimentary waiting. Include any property or holiday-park name in the address, and add a return if you want both journeys on one booking.",
    journeyInfo: `The A4 through Fivemiletown and Ballygawley, the M1 from Dungannon into Belfast, then across the city to Sydenham is the usual line. The A4 in Fermanagh and the Belfast city section are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Enniskillen or anywhere around Lough Erne and drive you to Belfast City Airport. Book so the A4, the M1 and the city crossing sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Enniskillen is booked on this page. Add your flight number so we can track the landing, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Enniskillen to George Best is a coast-to-lakes transfer with one fare confirmed before you travel and one driver for the whole trip.",
    localAreasText:
      "Enniskillen, Irvinestown and Lisnaskea are priced separately. Kesh, Belleek and Ballinamallard are quoted from the village. Add holiday-park names.",
    faqs: [
      {
        question: "How much is a taxi from Enniskillen to Belfast City Airport?",
        answer:
          "Enter your Enniskillen, Irvinestown or lough-shore address in the quote box for the fixed fare to Sydenham, with the applicable airport access charge already included. There are no surprises on the day.",
      },
      {
        question: "How long does Enniskillen to Belfast City Airport take?",
        answer:
          "It is a long run along the A4 and the full length of the M1 before the Belfast crossing; the quote gives you a mapped time from your Fermanagh address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Should I fly from Belfast City or Belfast International from Enniskillen?",
        answer:
          "Fly from whichever airport your airline uses. From Fermanagh, Belfast City Airport means going through Belfast, while Aldergrove sits north of the M1, so the two are quoted separately from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Enniskillen?",
        answer:
          "Yes. Add your inbound flight and your Fermanagh address on this page and we drive you home to the lakelands.",
      },
      {
        question: "What if my flight into Belfast City is delayed coming home to Fermanagh?",
        answer:
          "Tell us the flight number when you book. We follow it where possible, move the collection if needed, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "enniskillen-to-dublin-airport",
    townSlug: "enniskillen",
    airportCode: "DUB",
    title: "Enniskillen to Dublin Airport Taxi",
    h1: "Enniskillen to Dublin Airport Taxi",
    metaDescription:
      "Fixed-price taxi from Enniskillen and Fermanagh to Dublin Airport, usually via Cavan and the N3/M3. Applicable tolls included, Arrivals meet on return. 5★ rated.",
    intro:
      "Enniskillen to Dublin Airport is a reserved cross-border transfer from the Fermanagh lakelands, usually heading south-east towards Cavan before joining the N3 and M3 into Dublin and round to the airport. For Fermanagh travellers it is often the most direct route to long-haul flights and the widest choice of destinations. My Airport Taxi NI quotes one fixed Dublin Airport fare with any applicable tolls included, and Dublin Airport is already selected on this page — just add your pickup. Early Dublin departures mean setting off from Fermanagh overnight, so the booking form accepts small-hours times. Let us know your terminal when you have it. Coming home from Dublin? Book the collection back to Enniskillen here with your flight number; we monitor inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. We collect from Enniskillen, Irvinestown, Lisnaskea, Belleek, Kesh and Ballinamallard. Include any holiday-let name, and message us on WhatsApp with questions.",
    journeyInfo: `South-east through Fermanagh towards Cavan, then the N3 and M3 into Dublin and round to the airport, is the usual line. Town sections before the motorway and the approach around Dublin are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Enniskillen or anywhere in Fermanagh and drive you to Dublin Airport Terminal 1 or Terminal 2. Any applicable tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Enniskillen is booked on this page. Add the flight number so we can track the landing; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Enniskillen to Dublin Airport is a long cross-border run, booked ahead with the fare confirmed before you leave Fermanagh.",
    localAreasText:
      "Enniskillen, Irvinestown, Lisnaskea, Belleek, Kesh and Ballinamallard are each priced from your own address. Lakeside properties need their name.",
    faqs: [
      {
        question: "How much is a taxi from Enniskillen to Dublin Airport?",
        answer:
          "Put your Fermanagh address into the quote box for a fixed Dublin Airport fare that already covers any applicable tolls. For an outlying lough-shore address without an instant price, request a quote and we confirm it before payment.",
      },
      {
        question: "How long does Enniskillen to Dublin Airport take?",
        answer:
          "The usual line runs through Cavan onto the N3 and M3, and the quote shows the mapped time from your Fermanagh door to Dublin Airport. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Which way do you drive from Enniskillen to Dublin?",
        answer:
          "Usually south-east towards Cavan and then the N3 and M3, though your driver may choose another line on the day for traffic or roadworks.",
      },
      {
        question: "Can I book Dublin Airport back to Enniskillen?",
        answer:
          "Yes. Book the return collection on this page with your flight number. Your driver meets you in Arrivals for the drive home to Fermanagh.",
      },
      {
        question: "Which Dublin terminal will I be dropped at from Fermanagh?",
        answer:
          "Terminal 1 or Terminal 2, depending on your airline. Add it to the booking or send it to us on WhatsApp nearer the time.",
      },
    ],
  },

  // ─── Derry~Londonderry ────────────────────────────────────────────────────
  {
    slug: "derry-to-belfast-international",
    townSlug: "derry",
    airportCode: "BFS",
    title: "Derry to Belfast International Airport Taxi",
    h1: "Derry to Belfast International Airport Taxi",
    metaDescription:
      "Book a fixed-price taxi from Derry~Londonderry, Limavady or Eglinton to Belfast International Airport via the A6 and the Glenshane Pass. 5★ rated, door to door.",
    intro:
      "Derry to Belfast International Airport is the classic north-west airport run: out of the city on the A6, through Dungiven and over the Glenshane Pass, past Castledawson and the Toome bypass, then the M22 to Antrim and on to Aldergrove. It suits flights that are not available from City of Derry Airport, which we also cover. My Airport Taxi NI collects from the Cityside and the Waterside of Derry~Londonderry, as well as Culmore, Strathfoyle, Eglinton and Limavady, and quotes a fixed price from your exact address with Belfast International already set on this page. Early departures mean leaving the Foyle in the small hours, so the booking form accepts overnight pickups. Flying home into Aldergrove? Book the collection back to Derry here with your flight number; we monitor arrivals where possible and airport pickups include up to 60 minutes complimentary waiting. Weather on the Glenshane can be wintry, and our drivers plan for it. Add a return to keep both legs together, and message us on WhatsApp with any questions.",
    journeyInfo: `The A6 through Dungiven and over the Glenshane Pass, past Castledawson and Toome, then the M22 to Antrim and on to Aldergrove is the usual line. Winter conditions on the Glenshane and traffic leaving the city are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from anywhere in Derry~Londonderry, Limavady or Eglinton and drive you to Belfast International. Book so the A6 run sits comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Derry is booked on this page. Add the flight number so we can track the landing, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Derry to Aldergrove is a reserved booking with the fare confirmed in advance — no drive over the Glenshane at dawn and no airport parking.",
    localAreasText:
      "Cityside, Waterside and Culmore are all covered. Eglinton, Strathfoyle and Limavady are priced from your own address rather than the city centre.",
    faqs: [
      {
        question: "How much is a taxi from Derry to Belfast International Airport?",
        answer:
          "Enter your Derry~Londonderry, Limavady or Eglinton address in the quote box and the fixed fare to Aldergrove appears before you commit. Cityside, Waterside and Limavady pickups are priced individually from your street.",
      },
      {
        question: "How long does Derry to Belfast International take?",
        answer:
          "The usual line is the A6 over the Glenshane Pass to the M22 and Antrim, and the quote shows the mapped time from your Derry address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Do you also cover City of Derry Airport?",
        answer:
          "Yes. City of Derry Airport at Eglinton is covered as well — request a quote for it, or book this page if your flight leaves from Belfast International.",
      },
      {
        question: "Can I book Belfast International back to Derry~Londonderry?",
        answer:
          "Yes. Book the collection here with your flight number and your Derry, Culmore or Limavady address, or add it as a return on your outbound booking.",
      },
      {
        question: "What if snow or ice is forecast on the Glenshane Pass?",
        answer:
          "Our drivers check conditions before setting off and allow extra time where needed. If the weather looks bad, message us on WhatsApp and we can discuss an earlier pickup.",
      },
    ],
  },
  {
    slug: "derry-to-belfast-city-airport",
    townSlug: "derry",
    airportCode: "BHD",
    title: "Derry to Belfast City Airport Taxi",
    h1: "Derry to Belfast City Airport Taxi",
    metaDescription:
      "Private taxi from Derry~Londonderry to George Best Belfast City Airport via the A6, M22 and M2. Fixed fare from your door, airport access charge included.",
    intro:
      "Derry to Belfast City Airport links the Maiden City with George Best Belfast City Airport at Sydenham: the A6 through Dungiven and over the Glenshane Pass, the Toome bypass and M22 to Antrim, then the M2 into Belfast and across the city to the terminal. It is a good fit for business trips and short flights to London and other Great Britain airports. My Airport Taxi NI collects from the Cityside and Waterside, Culmore, Strathfoyle, Eglinton and Limavady, and quotes a fixed price from your address with Belfast City Airport already chosen on this page. If your flight goes from City of Derry Airport instead, we cover that too. Early Sydenham departures mean starting out from the Foyle overnight, so the booking form takes small-hours pickups. Landing back at Belfast City? Book the trip home to Derry here with your flight number; we follow inbound flights where possible and airport pickups include complimentary waiting. Add a return to keep both directions on one booking.",
    journeyInfo: `The A6 over the Glenshane Pass, Toome and the M22 to Antrim, then the M2 into Belfast and across to Sydenham is the usual line. The Glenshane in winter and the Belfast end at peak times are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Derry~Londonderry, Limavady or Eglinton and drive you to Belfast City Airport. Book so the A6, M2 and city crossing sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Derry is booked on this page. Add your flight number so we can track the landing, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Derry to George Best is one car from the Foyle to the terminal, with the fare confirmed before you travel.",
    localAreasText:
      "Derry Cityside, Waterside and Culmore are priced from your street. Strathfoyle, Eglinton and Limavady are quoted from their own addresses.",
    faqs: [
      {
        question: "How much is a taxi from Derry to Belfast City Airport?",
        answer:
          "Type your Derry or Limavady address into the quote box for the fixed fare to Sydenham, which already includes the applicable airport access charge. You confirm the price before booking.",
      },
      {
        question: "How long does Derry to Belfast City Airport take?",
        answer:
          "The A6 and M22 bring you to the M2, and then the run continues through Belfast to the airport; the quote shows a mapped time from your pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City or Belfast International nearer from Derry?",
        answer:
          "Aldergrove is reached first, before the M2 runs into Belfast, so Belfast International is usually the shorter of the two. Book the airport your airline flies from — both are quoted from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Derry?",
        answer:
          "Yes. Book your homeward collection here with your flight number and Derry~Londonderry address, and we bring you back over the Glenshane to your door.",
      },
      {
        question: "What if my flight into Belfast City runs late on the way home to Derry?",
        answer:
          "Add the flight number to your booking. We monitor it where possible, adjust the pickup, and airport collections include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "derry-to-dublin-airport",
    townSlug: "derry",
    airportCode: "DUB",
    title: "Derry to Dublin Airport Taxi",
    h1: "Derry to Dublin Airport Taxi",
    metaDescription:
      "Fixed-fare taxi from Derry~Londonderry, Limavady or Culmore to Dublin Airport. Long-distance private transfer with applicable tolls included. 5★ on Google.",
    intro:
      "Derry to Dublin Airport is the longest regular booking from the north-west, a reserved cross-border transfer that often runs south on the A5 through Strabane, Omagh and Aughnacloy, then the N2 through Monaghan towards Dublin. Depending on the time of day and your pickup, the quote may instead map the A6 over the Glenshane Pass to Belfast and the M1 south. My Airport Taxi NI quotes one fixed Dublin Airport fare with any applicable tolls included, and this page already has Dublin Airport selected — you add your Derry~Londonderry address. Early Dublin departures mean leaving the Foyle in the middle of the night, so the booking form accepts overnight times. Tell us your terminal when you know it. Flying home into Dublin? Book the collection to Derry here with your flight number; we track inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. We collect from Cityside, Waterside, Culmore, Strathfoyle, Eglinton and Limavady.",
    journeyInfo: `Often the A5 through Strabane, Omagh and Aughnacloy, then the N2 towards Dublin; sometimes the A6 to Belfast and the M1 south — the quote maps the line from your pickup. Town sections on the A5 and the Dublin approach are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from anywhere in Derry~Londonderry, Limavady or Eglinton and drive you to Dublin Airport Terminal 1 or Terminal 2. Any applicable tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Derry is booked on this page. Add your flight number so we can track the landing; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Derry to Dublin Airport is a long cross-border transfer, booked in advance with one fare confirmed before you go.",
    localAreasText:
      "Cityside, Waterside, Culmore and Strathfoyle are covered, along with Eglinton and Limavady. Each is priced from your exact address.",
    faqs: [
      {
        question: "How much is a taxi from Derry to Dublin Airport?",
        answer:
          "Enter your Derry~Londonderry pickup in the quote box for a fixed Dublin Airport price with any applicable tolls included. If an instant fare is not shown for your street, request a quote and we confirm it before you pay.",
      },
      {
        question: "How long does Derry to Dublin Airport take?",
        answer:
          "It is a long cross-border run, often via the A5 and N2, and the quote shows the mapped time from your Derry or Limavady address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Do you go via the A5 or via Belfast to get to Dublin from Derry?",
        answer:
          "Usually the A5 south through Strabane and Omagh to the N2, but your driver may use the A6 and M1 via Belfast if that is better on the day.",
      },
      {
        question: "Can I book Dublin Airport back to Derry~Londonderry?",
        answer:
          "Yes. Book the return here with your flight number; your driver meets you in Arrivals and takes you straight home to the north-west.",
      },
      {
        question: "Which Dublin terminal do you use for Derry pickups?",
        answer:
          "We drop at Terminal 1 or Terminal 2 depending on your airline — add it to your booking or tell us when you know.",
      },
    ],
  },

  // ─── Ballycastle ──────────────────────────────────────────────────────────
  {
    slug: "ballycastle-to-belfast-international",
    townSlug: "ballycastle",
    airportCode: "BFS",
    title: "Ballycastle to Belfast International Airport Taxi",
    h1: "Ballycastle to Belfast International Airport Taxi",
    metaDescription:
      "Taxi from Ballycastle, Bushmills, Armoy or the Glens of Antrim to Belfast International Airport. Fixed fare via the A44 and A26, Express Drop-Off included.",
    intro:
      "Ballycastle to Belfast International Airport leaves the north Antrim coast on the A44, climbing inland past Armoy to meet the A26, then running south through Ballymena towards Antrim and Aldergrove. It is the usual airport booking for the Glens and the Causeway coast villages. My Airport Taxi NI collects from Ballycastle, Ballymoney, Bushmills, Armoy, Cushendall and Cushendun, including hotels, holiday cottages and visitors stepping off the Rathlin ferry, with Belfast International already set on this page. Early departures mean very early starts from the coast, so the booking form accepts overnight pickup times. Flying back into Aldergrove? Book the drive home to Ballycastle here with your flight number; we monitor arrivals where possible and airport pickups include up to 60 minutes complimentary waiting. If you are staying in Cushendall or Cushendun, enter the village address so the quote prices the Glens pickup correctly. Add a return for both legs on one booking, and message us on WhatsApp with any questions.",
    journeyInfo: `The A44 inland past Armoy, the A26 south through Ballymena, then on towards Antrim and Aldergrove is the usual line from Ballycastle. Ballymena and the airport approach are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Ballycastle, the Glens villages or the Causeway coast and drive you to Belfast International. Book so the A44 and A26 sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast International Airport to Ballycastle is booked on this page. Add the flight number so we can track the landing, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Ballycastle to Aldergrove is a reserved booking with the fare confirmed before you travel — no early drive off the coast and no airport parking.",
    localAreasText:
      "Ballycastle, Ballymoney and Bushmills are separate pickups. Armoy, Cushendall and Cushendun are priced from the village. Cottages need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Ballycastle to Belfast International Airport?",
        answer:
          "Enter your Ballycastle, Bushmills or Glens address in the quote box to see the fixed fare to Aldergrove before you book. A Cushendun cottage and a Ballycastle seafront pickup are priced separately, so give the real address.",
      },
      {
        question: "How long does Ballycastle to Belfast International take?",
        answer:
          "The usual line is the A44 past Armoy and then the A26 south through Ballymena; the quote shows a mapped time from your north-coast address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Can you pick me up off the Rathlin ferry?",
        answer:
          "Yes. Book a pickup at Ballycastle harbour and choose a collection time that leaves room for the sailing; message us on WhatsApp if the ferry times change.",
      },
      {
        question: "Can I book Belfast International back to Ballycastle?",
        answer:
          "Yes. Book the collection here with your flight number and your Ballycastle or Glens address, or add it as the return leg.",
      },
      {
        question: "What if my flight into Aldergrove is delayed on the way home to the coast?",
        answer:
          "We track the flight where possible and move your north Antrim collection to suit, and airport pickups include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "ballycastle-to-belfast-city-airport",
    townSlug: "ballycastle",
    airportCode: "BHD",
    title: "Ballycastle to Belfast City Airport Taxi",
    h1: "Ballycastle to Belfast City Airport Taxi",
    metaDescription:
      "Book a private Ballycastle to George Best Belfast City Airport taxi. Fixed fare from the north Antrim coast via the A26 and M2, access charge included.",
    intro:
      "Ballycastle to Belfast City Airport brings you from the north Antrim coast to George Best Belfast City Airport at Sydenham: inland on the A44 past Armoy, south on the A26 through Ballymena, then the M2 into Belfast and across the city to the terminal. It suits business trips and short flights to Great Britain from the Glens and the Causeway coast. My Airport Taxi NI collects from Ballycastle, Ballymoney, Bushmills, Armoy, Cushendall and Cushendun, and quotes a fixed price from your address with Belfast City Airport already chosen on this page. Glens residents in Cushendall or Cushendun can be collected from home, and the driver picks the best way out of the glens on the day. Early flights mean overnight starts from the coast, so the booking form takes small-hours times. Landing back at Belfast City? Book the run home here with your flight number; we follow inbound flights where possible and airport pickups include complimentary waiting. Add a return to keep both journeys together.",
    journeyInfo: `The A44 past Armoy, the A26 through Ballymena, then the M2 into Belfast and across to Sydenham is the usual line. The Belfast end of the run is the part to allow for at peak times. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Ballycastle, Bushmills or the Glens of Antrim and drive you to Belfast City Airport. Book so the A26, the M2 and the city section sit comfortably ahead of check-in. Express Drop-Off and the applicable airport access charge are included in your fixed fare.",
    fromAirport:
      "Travelling from Belfast City Airport to Ballycastle is booked on this page. Add your flight number so we can track the landing, then follow the collection instructions in your booking. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Ballycastle to George Best is one car from the north coast to the terminal, with the fare agreed before you travel.",
    localAreasText:
      "Ballycastle, Ballymoney and Bushmills are priced separately. Armoy, Cushendall and Cushendun are quoted from the village. Add B&B or cottage names.",
    faqs: [
      {
        question: "How much is a taxi from Ballycastle to Belfast City Airport?",
        answer:
          "Put your Ballycastle, Ballymoney or Glens address in the quote box for the fixed fare to Sydenham, with the applicable airport access charge already included. The price is shown before you book.",
      },
      {
        question: "How long does Ballycastle to Belfast City Airport take?",
        answer:
          "After the A44 and A26 the run continues down the M2 and through Belfast, so the city end matters most; the quote shows a mapped time from your pickup. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Is Belfast City or Belfast International better from Ballycastle?",
        answer:
          "Aldergrove comes first on the A26, so it is usually the shorter trip; Belfast City Airport means continuing into Belfast on the M2. Choose whichever airport your flight uses — both are priced from your door.",
      },
      {
        question: "Can I book Belfast City Airport back to Ballycastle or the Glens?",
        answer:
          "Yes. Add your inbound flight and your north Antrim address on this page and we drive you home to the coast.",
      },
      {
        question: "What if my flight into Belfast City is delayed coming back to Ballycastle?",
        answer:
          "Include the flight number when booking. We follow it where possible, adjust the pickup, and airport collections include up to 60 minutes complimentary waiting.",
      },
    ],
  },
  {
    slug: "ballycastle-to-dublin-airport",
    townSlug: "ballycastle",
    airportCode: "DUB",
    title: "Ballycastle to Dublin Airport Taxi",
    h1: "Ballycastle to Dublin Airport Taxi",
    metaDescription:
      "Long-distance taxi from Ballycastle, Bushmills or Cushendall to Dublin Airport. Fixed fare via Belfast and the M1 with applicable tolls included. Rated 5★.",
    intro:
      "Ballycastle to Dublin Airport is a reserved long transfer from the north Antrim coast right across the border: the A44 and A26 south through Ballymena, the M2 into Belfast, then the M1 and A1 past Newry and on down the M1 in the Republic to the airport. It suits holiday flights and long-haul connections from the Glens and the Causeway coast. My Airport Taxi NI quotes one fixed Dublin Airport fare with applicable M1 tolls included, and this page already has Dublin Airport selected — you add your pickup. Early Dublin departures mean leaving the coast in the middle of the night, so the booking form accepts overnight times. Tell us your terminal once you know it. Coming home from Dublin to Ballycastle? Book the collection here with your flight number; we track inbound flights where possible, your driver meets you in Arrivals, and airport pickups include complimentary waiting. We collect from Ballycastle, Ballymoney, Bushmills, Armoy, Cushendall and Cushendun.",
    journeyInfo: `The A44 and A26 to the M2, through Belfast onto the M1 and A1, then the M1 in the Republic to the airport is the usual line. The Belfast section and the run past Newry are the parts to allow for. ${TRAFFIC}`,
    goingToAirport:
      "We collect from Ballycastle, the Glens or the Causeway coast and drive you to Dublin Airport Terminal 1 or Terminal 2. Applicable M1 tolls are included in your fixed fare.",
    fromAirport:
      "Travelling from Dublin Airport to Ballycastle is booked on this page. Add the flight number so we can track the landing; your driver meets you in Arrivals. Airport pickups include up to 60 minutes complimentary waiting.",
    whyBookIntro:
      "Ballycastle to Dublin Airport is a long coast-to-capital run, booked ahead with one fare confirmed before you travel.",
    localAreasText:
      "Ballycastle, Ballymoney, Bushmills, Armoy, Cushendall and Cushendun are each priced from your own address. Holiday cottages need the property name.",
    faqs: [
      {
        question: "How much is a taxi from Ballycastle to Dublin Airport?",
        answer:
          "Enter your north Antrim pickup in the quote box for a fixed Dublin Airport fare that covers the applicable M1 tolls. If a Glens address does not show an instant price, request a quote and we confirm it before you pay.",
      },
      {
        question: "How long does Ballycastle to Dublin Airport take?",
        answer:
          "It is a long run via the A26, the M2, Belfast and the M1 south, and the quote gives the mapped time from your Ballycastle or Glens address. Journey times are approximate and can vary depending on traffic and time of day.",
      },
      {
        question: "Are the M1 tolls included from Ballycastle to Dublin?",
        answer:
          "Yes. The applicable M1 tolls in the Republic are part of the fixed fare, so there is nothing extra to pay on the journey.",
      },
      {
        question: "Can I book Dublin Airport back to Ballycastle?",
        answer:
          "Yes. Book the homeward collection here with your flight number; your driver meets you in Arrivals and drives you back up to the north coast.",
      },
      {
        question: "Which Dublin terminal do you drop off at from the north coast?",
        answer:
          "Terminal 1 or Terminal 2, whichever your airline flies from — add it when booking or let us know later on WhatsApp.",
      },
    ],
  },
];

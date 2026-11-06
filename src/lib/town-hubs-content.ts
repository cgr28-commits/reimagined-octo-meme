import type { TownHubContent } from "@/lib/town-transfer-types";
import { TOWN_HUB_BATCH_3 } from "@/lib/town-hubs-batch-3";
import { TOWN_HUB_BATCH_4 } from "@/lib/town-hubs-batch-4";
import { TOWN_HUB_BATCH_5 } from "@/lib/town-hubs-batch-5";
import { TOWN_HUB_BATCH_6A } from "@/lib/town-hubs-batch-6a";
import { TOWN_HUB_BATCH_6B } from "@/lib/town-hubs-batch-6b";
import { TOWN_HUB_BATCH_6C } from "@/lib/town-hubs-batch-6c";

/** Town hub landing pages — chooser pages, not copies of the three child routes. */
export const TOWN_HUB_CONTENT: TownHubContent[] = [
  {
    townSlug: "newtownabbey",
    name: "Newtownabbey",
    addressHint: "Newtownabbey",
    hubSlug: "newtownabbey-airport-taxis",
    title: "Newtownabbey Airport Taxi & Airport Transfers",
    seoTitle: "Newtownabbey Taxi to Belfast International & City Airport | 5★",
    h1: "Newtownabbey Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Newtownabbey airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Newtownabbey to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Glengormley, Mallusk, Carnmoney, Monkstown, Whiteabbey and Jordanstown. Belfast International is the usual choice for holidays and long-haul flights, and it is a quick run up the M2 from Sandyknowes. Belfast City Airport is usually the shorter trip from Whiteabbey and Jordanstown, along the Shore Road towards the Sydenham Bypass. Dublin Airport is around two hours away via the M2 and the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. If you are being collected from Ulster University Jordanstown, add the building or halls name. For Mallusk business parks, add the unit or reception entrance so your driver finds you first time.",
    blurb:
      "Newtownabbey and the Shore Road corridor are well placed for Belfast International and Belfast City Airport runs, with straightforward access to the M2.",
    areas: [
      "Glengormley",
      "Carnmoney",
      "Whiteabbey",
      "Jordanstown",
      "Monkstown",
      "Mallusk",
    ],
    localNotes: [
      "Most Belfast International trips join the M2 at Sandyknowes. Weekday mornings can be busy back towards Fortwilliam, so we plan your pickup time with that in mind.",
      "Ulster University Jordanstown pickups work best when you give the building or halls name as well as the postcode.",
      "Mallusk business-park collections are straightforward if you share the unit or reception entrance with the booking.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["glengormley", "whiteabbey"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Holiday and long-haul flights. Most Newtownabbey bookings join the M2 at Sandyknowes from Glengormley, Mallusk, Carnmoney or Monkstown.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the shorter run from Whiteabbey and Jordanstown, along the Shore Road toward the Sydenham Bypass rather than across the city.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Around two hours via the M2 and the A1/M1. M1 tolls are included, and we collect overnight for early flights.",
      },
    ],
  },
  {
    townSlug: "carrickfergus",
    name: "Carrickfergus",
    addressHint: "Carrickfergus",
    hubSlug: "carrickfergus-airport-taxis",
    title: "Carrickfergus Airport Taxi & Airport Transfers",
    seoTitle: "Carrickfergus Taxi to Belfast Airports & Dublin | Fixed Price",
    h1: "Carrickfergus Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Carrickfergus airport taxi to Belfast City, Belfast International or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Carrickfergus to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from the town, Greenisland, Woodburn, Eden, Sunnylands and the harbour hotels. Belfast City Airport is the closer of the two Belfast airports, along the A2 through Whiteabbey towards the Sydenham Bypass. Belfast International is an inland run via the M2 and M22, or the A8, depending on traffic. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare, and we regularly collect overnight for early Dublin flights. The A2 can be slow through Whiteabbey at busy times, so we plan your pickup time around it. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. If you are staying at a harbour or castle-area hotel, include the hotel name.",
    blurb:
      "Carrickfergus and Greenisland sit on the A2 Shore Road — a regular pickup zone for both Belfast airports and for Dublin departures.",
    areas: ["Carrickfergus", "Greenisland", "Woodburn", "Eden", "Sunnylands"],
    localNotes: [
      "The A2 can slow through Whiteabbey and Fortwilliam at the evening peak, so we allow extra time for Carrickfergus pickups.",
      "Harbour and castle-area hotels should be booked with the property name — several share similar postcodes along the waterfront.",
      "Greenisland pickups are priced from your exact street, so type the full address.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["whiteabbey"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Inland once you leave the harbour. Typical paths use the A2 then the M2/M22, or the A8, depending on traffic.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The more coastal Belfast terminal from here — A2 through Whiteabbey toward the Sydenham Bypass. Greenisland often sits closer to this line than Woodburn or Eden.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The longest trip: the A2 into Belfast, then the M1/A1. M1 tolls are included, and we collect overnight for early flights.",
      },
    ],
  },
  {
    townSlug: "ballyclare",
    name: "Ballyclare",
    addressHint: "Ballyclare",
    hubSlug: "ballyclare-airport-taxis",
    title: "Ballyclare Airport Taxi & Airport Transfers",
    seoTitle: "Ballyclare Taxi to Belfast International Airport | Fixed Price",
    h1: "Ballyclare Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Ballyclare airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Ballyclare, Doagh, Ballynure or Ballyeaston to Belfast International, George Best Belfast City or Dublin Airport. Belfast International is usually the closest airport from here, and most journeys take the A57 through Templepatrick to Aldergrove. Belfast City Airport is a longer run, joining the M2 towards Belfast and the Sydenham Bypass. Dublin Airport is around two hours away via the M2 and the A1/M1, with M1 tolls included in the fare. Weekday school-run traffic in Ballyclare can add a few minutes in the morning, so we allow for it when we plan your pickup. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Doagh and Ballynure pickups are priced from your own street, so type the full address rather than just the town name.",
    blurb:
      "Ballyclare sits on the A57 towards Aldergrove, so Belfast International is usually the shorter Belfast airport run from the town.",
    areas: ["Ballyclare", "Doagh", "Ballynure", "Ballyeaston"],
    localNotes: [
      "The A57 through Templepatrick is the usual path to Belfast International; school-run traffic in the town can add a few minutes on weekday mornings.",
      "Doagh and Ballynure pickups are priced from your own street, so type the full address.",
      "Belfast City and Dublin are longer trips from Ballyclare. The quote shows the journey time from your address.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Usually the shorter Belfast run. The A57 through Templepatrick is the corridor most Aldergrove bookings use from Ballyclare.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The longer of the two Belfast airports from here, via the M2 towards Sydenham.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Around two hours via the M2 and the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "lisburn",
    name: "Lisburn",
    addressHint: "Lisburn",
    hubSlug: "lisburn-airport-taxis",
    title: "Lisburn Airport Taxi & Airport Transfers",
    seoTitle: "Lisburn Taxis to Belfast & Dublin Airports | Pre-Book, 5★",
    h1: "Lisburn Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Lisburn airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book an airport taxi from your home or hotel in Lisburn to Belfast International, Belfast City or Dublin Airport. We also collect from Hillsborough, Sprucefield, Lambeg, Hilden and Dunmurry. Enter your exact pickup address, airport, date, passengers and suitcases in the quote form for a fixed price, or choose an airport route below for more journey information. For a hotel collection, enter the property address rather than only the town name so the quote uses your actual pickup point. Returning by air? Select From an Airport to quote your airport collection back to Lisburn. Allow extra time for Westlink traffic on Belfast City Airport journeys and busy shopping periods around Sprucefield. Dublin Airport journeys use the A1/M1 corridor, with applicable M1 tolls included in the fare.",
    blurb:
      "Lisburn and surrounding BT28/BT27 areas are a regular pickup zone for Aldergrove, City Airport, and Dublin Airport transfers.",
    areas: ["Lisburn", "Hillsborough", "Sprucefield", "Lambeg", "Hilden", "Dunmurry"],
    localNotes: [
      "Sprucefield and the M1 junctions are the usual start for Aldergrove and Dublin; Saturday retail traffic can slow the first part of the journey.",
      "Hillsborough pickups are quoted from the address you enter — useful for hotel guests who are not starting in Lisburn city centre.",
      "We allow for Westlink traffic at peak times when we plan Belfast City Airport pickups from Lisburn.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["hillsborough", "moira", "carryduff", "craigavon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Usually the M1, then the M2 and M22. Friday holiday traffic on the M1 can be heavy, so it is worth booking ahead.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The M1, Westlink, M3 and Sydenham Bypass. Dunmurry and Lambeg are closest to the M1.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Often the more natural long run from Lisburn because you are already on the A1 from the Sprucefield junctions. Applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "bangor",
    name: "Bangor",
    addressHint: "Bangor",
    hubSlug: "bangor-airport-taxis",
    title: "Bangor Airport Taxi & Airport Transfers",
    seoTitle: "Bangor Taxi to Belfast City & International Airport | 5★",
    h1: "Bangor Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Bangor airport taxi to Belfast City, Belfast International or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Bangor to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Bangor, Ballyholme, Groomsport, Helen’s Bay, Crawfordsburn and Clandeboye. Belfast City Airport is the shortest trip, along the A2 past Holywood to the Sydenham Bypass. Belfast International is a longer run through Belfast and up the M2, so many holiday families book an early pickup the night before. Dublin Airport is the longest trip, via the A2 and the A1/M1, with M1 tolls included in the fare, and we regularly collect overnight for early Dublin flights. Traffic on the A2 at Holywood can change quickly, so we build in time when we plan your pickup. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. For marina and seafront hotels, include the hotel name, as several share similar BT20 postcodes.",
    blurb:
      "Bangor and North Down are among our most requested pickup areas — especially for early Belfast International flights and Dublin Airport runs.",
    areas: ["Bangor", "Ballyholme", "Groomsport", "Helen’s Bay", "Crawfordsburn", "Clandeboye"],
    localNotes: [
      "Almost every Bangor airport trip uses the A2, and traffic at Holywood can change quickly, so we build in extra time.",
      "Marina and seafront hotels should include the hotel name — several properties share similar BT20 postcodes.",
      "Helen’s Bay and Crawfordsburn pickups are priced from your own address.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownards", "comber"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The longer trip: the A2 into Belfast, then the M3 and M2 to Aldergrove. One of our most requested early pickups from North Down.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the shortest trip, along the A2 past Holywood to the Sydenham Bypass. Helen’s Bay and Crawfordsburn are on the way; Groomsport adds a few minutes.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The A2 into Belfast, then the M1/A1. M1 tolls are included, and we regularly collect overnight for early Dublin flights.",
      },
    ],
  },
  {
    townSlug: "holywood",
    name: "Holywood",
    addressHint: "Holywood",
    hubSlug: "holywood-airport-taxis",
    title: "Holywood Airport Taxi & Airport Transfers",
    seoTitle: "Holywood Taxi to Belfast City & International Airport | 5★",
    h1: "Holywood Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Holywood airport taxi to Belfast City, Belfast International or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Holywood to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Holywood, Cultra, Craigavad, Seahill, Marino and Helen’s Bay. Belfast City Airport is only a short drive along the A2 and the Sydenham Bypass, and a booked taxi still saves you parking and the hassle of finding a cab with luggage. Belfast International is on the far side of Belfast, via the M3 and M2 towards Aldergrove. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Around Cultra and the Ulster Folk Museum, please include your house name or number, as several lanes share similar BT18 postcodes. Seahill and Craigavad pickups are priced from your own street.",
    blurb:
      "Holywood and the Cultra–Seahill stretch of the A2 are a regular North Down collection area for all three airports.",
    areas: ["Holywood", "Cultra", "Craigavad", "Seahill", "Helen’s Bay", "Marino"],
    localNotes: [
      "Cultra and the Ulster Folk & Transport Museum area need the house name or number — several lanes share similar BT18 postcodes.",
      "Seahill and Craigavad pickups are priced from your own address, so type the full street.",
      "Belfast City Airport is close by. Belfast International and Dublin are longer trips, and the quote shows the journey time from your address.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["dundonald"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A2 into Belfast, then the M3 and M2 towards Aldergrove. A longer trip than Belfast City Airport.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The shortest of the three from this town — A2 and the Sydenham Bypass on the same coastal corridor as Cultra and Marino.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Across Belfast, then the A1/M1. M1 tolls are included, and we collect overnight for early Dublin flights.",
      },
    ],
  },
  {
    townSlug: "antrim",
    name: "Antrim",
    addressHint: "Antrim",
    hubSlug: "antrim-airport-taxis",
    title: "Antrim Airport Taxi & Airport Transfers",
    seoTitle: "Antrim Taxi to Belfast International Airport | Fixed Price, 5★",
    h1: "Antrim Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Antrim airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Antrim to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Antrim town, Templepatrick, Muckamore, Randalstown, Crumlin and Dunadry. Belfast International is right on your doorstep, a short run on the A26 and the airport roads, though it is still worth booking ahead for early flights. Belfast City Airport is a motorway trip down the M2 into Belfast and out to the Harbour Estate and Sydenham. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. If you are staying at a hotel in Templepatrick or near the A57, include the hotel name. Randalstown and Crumlin pickups are priced from your own address, so type the full street rather than just Antrim.",
    blurb:
      "Antrim, Templepatrick and the A26 corridor are among the closest towns we collect for Belfast International Airport.",
    areas: ["Antrim", "Templepatrick", "Muckamore", "Randalstown", "Crumlin", "Dunadry"],
    localNotes: [
      "Templepatrick and the hotels around the A57 should include the property name — several sit within a short run of the International terminal.",
      "Randalstown pickups are priced from your own address, so type the full street rather than just Antrim.",
      "Crumlin is close to Belfast International. Type your full Crumlin address so the quote starts from the right place.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "A short run on the A26 and the airport roads. Templepatrick and Dunadry are even closer. Still worth booking ahead for early flights.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Down the M2 to the Harbour Estate. There is more city traffic at the Belfast end, so we allow time for it.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The M2 towards Belfast, then the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "ballymena",
    name: "Ballymena",
    addressHint: "Ballymena",
    hubSlug: "ballymena-airport-taxis",
    title: "Ballymena Airport Taxi & Airport Transfers",
    seoTitle: "Ballymena Taxi to Belfast International Airport | Fixed Price",
    h1: "Ballymena Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Ballymena airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Ballymena to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Ballymena, Broughshane, Cullybackey, Galgorm, Ahoghill and Gracehill. Belfast International is the nearest airport, straight down the A26 dual carriageway, which is why most customers here fly from Aldergrove. Belfast City Airport carries on down the M2 into Belfast and out to the Harbour Estate. Dublin Airport is the longest of the three, via the A26, the M2 and the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. If you are staying at Galgorm or another spa hotel, include the hotel name so your driver goes straight to the right entrance. Cullybackey, Gracehill and Broughshane pickups are priced from your own address.",
    blurb:
      "Ballymena and the Galgorm–Broughshane hinterland are a core mid-Antrim collection area, especially for Belfast International.",
    areas: ["Ballymena", "Broughshane", "Cullybackey", "Galgorm", "Ahoghill", "Gracehill"],
    localNotes: [
      "If you are at Galgorm or another spa hotel, include the hotel name so your driver goes straight to the right entrance.",
      "Cullybackey and Gracehill are west of the town and priced from your own address.",
      "Broughshane collections come in from the A42, not down the A26 from the town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["antrim", "coleraine"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Nearest terminal from mid-Antrim. A26 south — a dual-carriageway run rather than a city crawl. Broughshane joins from the A42.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A26, then the M2 to the Harbour Estate. We allow for city traffic at the Belfast end.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The longest trip of the three: the A26, the M2, then the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "larne",
    name: "Larne",
    addressHint: "Larne",
    hubSlug: "larne-airport-taxis",
    title: "Larne Airport Taxi & Airport Transfers",
    seoTitle: "Larne Taxi to Belfast International & City Airport | 5★",
    h1: "Larne Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Larne airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Larne to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Larne, Glynn, Magheramorne, Ballygally, Islandmagee and Whitehead, as well as the ferry terminal and harbour hotels. Belfast International is reached on the A8 and then west on the M2 towards Aldergrove. Belfast City Airport stays on the east side, down the A8 towards Belfast and out to Sydenham. Dublin Airport is the longest trip, via the M2 and the A1/M1, with M1 tolls included in the fare, and it is a popular booking the morning after a ferry crossing from Cairnryan. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. In Islandmagee and Ballygally, include your lane or house name, as sat navs can stop a road short. At a harbour hotel, include the hotel name.",
    blurb:
      "Larne, Islandmagee and the A8 corridor are a regular pickup area for all three airports.",
    areas: ["Larne", "Glynn", "Ballygally", "Islandmagee", "Whitehead", "Magheramorne"],
    localNotes: [
      "In Islandmagee and Ballygally, include your lane or house name, as sat navs can stop a road short.",
      "Whitehead sits toward Carrickfergus; we still collect it on Larne-area bookings when that is the address you enter.",
      "For the ferry terminal or a harbour hotel, include the name in the pickup address so your driver meets you in the right place.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Harbour to inland: A8, then west on the M2. Glynn, Islandmagee and Ballygally add coastal minutes before the dual carriageway.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A8 towards Belfast, then out to Sydenham. Traffic around the docks can slow the last few miles.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A8 to the M2, then the A1/M1. Applicable M1 tolls are included. Often booked after a night in the harbour town following a sailing.",
      },
    ],
  },
  {
    townSlug: "newry",
    name: "Newry",
    addressHint: "Newry",
    hubSlug: "newry-airport-taxis",
    title: "Newry Airport Taxi & Airport Transfers",
    seoTitle: "Newry Taxi to Dublin & Belfast Airports | Fixed Price, 5★",
    h1: "Newry Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked Newry airport taxi to Dublin Airport, Belfast International or Belfast City. Fixed price, flight tracking, 60 mins free waiting. 5★ on Google.",
    intro:
      "Pre-book a fixed-price airport taxi from Newry to Dublin Airport, Belfast International or George Best Belfast City. We collect door to door from Newry, Warrenpoint, Rostrevor, Bessbrook, Camlough and Hilltown. Dublin Airport is often the first choice from here, because you are already on the A1 and the M1 takes you straight south, with M1 tolls included in the fare. Belfast International is north up the A1, then the M1 and M2 to Aldergrove, and it is the usual choice when your flight leaves from Belfast. Belfast City Airport is up the A1 into Belfast and out to Sydenham. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Warrenpoint and Rostrevor pickups should include the townland or hotel name, not just Newry. Bessbrook, Camlough and Hilltown are priced from your own address, so type the full street.",
    blurb:
      "Newry and the Warrenpoint–Rostrevor coast are on the A1/M1 corridor — well placed for Dublin Airport and still a regular origin for both Belfast airports.",
    areas: ["Newry", "Warrenpoint", "Rostrevor", "Bessbrook", "Camlough", "Hilltown"],
    localNotes: [
      "Warrenpoint and Rostrevor are lough-shore collections — include the townland or hotel name, not only “Newry”.",
      "Bessbrook and Camlough are off the A25 and priced from your own address.",
      "Hilltown pickups are priced from your own address, so type the full street.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["craigavon", "lisburn"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "North on the A1, then the M1 and M2 to Aldergrove. Traffic at Sprucefield can add time, so we allow for it.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "North on the A1 into Belfast, then out to Sydenham. We allow for Westlink traffic at the Belfast end.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The natural choice from Newry: south on the A1, then the M1. M1 tolls are included in the fare.",
      },
    ],
  },
  ...TOWN_HUB_BATCH_3,
  ...TOWN_HUB_BATCH_4,
  ...TOWN_HUB_BATCH_5,
  ...TOWN_HUB_BATCH_6A,
  ...TOWN_HUB_BATCH_6B,
  ...TOWN_HUB_BATCH_6C,
];

import type { TownHubContent } from "@/lib/town-transfer-types";

/** Town hub landing pages — Batch 1 (5) plus Batch 2 (5). */
export const TOWN_HUB_CONTENT: TownHubContent[] = [
  {
    townSlug: "newtownabbey",
    name: "Newtownabbey",
    addressHint: "Newtownabbey",
    hubSlug: "newtownabbey-airport-taxis",
    title: "Newtownabbey Airport Taxi & Airport Transfers",
    h1: "Newtownabbey Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Newtownabbey to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers with online booking and flight monitoring.",
    intro:
      "My Airport Taxi NI provides pre-booked private airport transfers from homes, hotels and businesses in Newtownabbey. You reserve a driver for your pickup time, see a fixed price before you pay, and travel door to door rather than leaving the morning of a flight to a last-minute taxi search. We cover the three airports customers here book most often: Belfast International, George Best Belfast City Airport, and Dublin Airport. Newtownabbey sits north of Belfast with a direct run to the M2 at Sandyknowes, so collections from Glengormley, Jordanstown, Carnmoney, Whiteabbey, Monkstown and Mallusk are a regular part of the diary. Enter your street address in the quote box on this page — the same calculator used on the homepage — and choose the airport that matches your ticket. We monitor inbound flights where possible, include complimentary waiting on airport pickups, and you can add a return journey when you want both legs booked together. WhatsApp is available if you need to reach us about the booking.",
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
      "Sandyknowes and the M2 slip roads are the usual outbound path for Aldergrove; weekday mornings can stack back from Fortwilliam, so we plan pickup time around that corridor rather than assuming a clear run.",
      "Ulster University Jordanstown pickups work best when you give the building or halls name as well as the postcode.",
      "Mallusk business-park collections are straightforward if you share the unit or reception entrance with the booking.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "carrickfergus",
    name: "Carrickfergus",
    addressHint: "Carrickfergus",
    hubSlug: "carrickfergus-airport-taxis",
    title: "Carrickfergus Airport Taxi & Airport Transfers",
    h1: "Carrickfergus Airport Taxi & Airport Transfers",
    metaDescription:
      "Private airport transfers from Carrickfergus to Belfast International, Belfast City and Dublin Airport. Pre-book a fixed price and travel door to door.",
    intro:
      "Carrickfergus is far enough from both Belfast airports that a pre-booked private transfer is usually calmer than hoping a local car is free before an early flight. My Airport Taxi NI collects from homes, harbour hotels and businesses in the town and takes you to Belfast International, Belfast City Airport or Dublin Airport with the fare confirmed before you travel. The A2 Shore Road is the coastal spine of most journeys; Greenisland and the streets around the castle and Marine Highway are collected as Carrickfergus-area pickups when you enter the full address. Use the airport cards below to open the route that matches your ticket, then complete the same quote and booking flow used on the rest of the site. Flight numbers help us monitor arrivals, airport pickups include complimentary waiting, and a return can be added on the form if you want the inbound journey reserved as well. Message us on WhatsApp if you need help with the booking details.",
    blurb:
      "Carrickfergus and Greenisland sit on the A2 Shore Road — a regular pickup zone for both Belfast airports and for Dublin departures.",
    areas: ["Carrickfergus", "Greenisland", "Woodburn", "Eden", "Sunnylands"],
    localNotes: [
      "The A2 can slow through Whiteabbey and Fortwilliam in the evening peak; Carrickfergus departures are timed around that pinch point.",
      "Harbour and castle-area hotels should be booked with the property name — several share similar postcodes along the waterfront.",
      "Greenisland is collected with Carrickfergus-area timing, not as a Belfast city job, so the quote uses your exact street.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "ballyclare",
    name: "Ballyclare",
    addressHint: "Ballyclare",
    hubSlug: "ballyclare-airport-taxis",
    title: "Ballyclare Airport Taxi & Airport Transfers",
    h1: "Ballyclare Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Ballyclare airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price private transfers with flight monitoring and online booking.",
    intro:
      "Ballyclare is one of the closest inland towns to Belfast International, with the A57 running through Templepatrick towards Aldergrove. That makes a holiday departure shorter than the same flight from the North Down coast — provided the car is booked, not left to a last-minute call. My Airport Taxi NI provides pre-booked private transfers from homes, guest houses and businesses in Ballyclare to Belfast International, Belfast City Airport and Dublin Airport. We also collect from nearby Doagh and Ballynure when you enter those streets on the quote form. Belfast International is usually the more direct of the two Belfast airports from here; City Airport and Dublin need a longer reserved slot. Choose the route card that matches your ticket, enter your pickup address, and use the existing calculator for the live fixed price. Returns, flight monitoring on airport collections, complimentary airport waiting and WhatsApp support are the same as on our other booking pages.",
    blurb:
      "Ballyclare sits on the A57 towards Aldergrove, so Belfast International is usually the shorter Belfast airport run from the town.",
    areas: ["Ballyclare", "Doagh", "Ballynure", "Ballyeaston"],
    localNotes: [
      "The A57 through Templepatrick is the usual path to Belfast International; school-run traffic in the town can add a few minutes on weekday mornings.",
      "Doagh and Ballynure should be entered as full streets so the quote is not treated as a generic Antrim-town job.",
      "City Airport and Dublin from Ballyclare are longer reserved journeys, not local hops — the quote tool shows distance and time for your address.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "lisburn",
    name: "Lisburn",
    addressHint: "Lisburn",
    hubSlug: "lisburn-airport-taxis",
    title: "Lisburn Airport Taxi & Airport Transfers",
    h1: "Lisburn Airport Taxi & Airport Transfers",
    metaDescription:
      "Lisburn airport transfers to Belfast International, Belfast City and Dublin Airport. Pre-book a private taxi with a fixed price and secure online booking.",
    intro:
      "Lisburn is the south-west corner of our regular Greater Belfast pickup zone. My Airport Taxi NI collects from homes, hotels and businesses around the city — including streets towards Sprucefield, Hillsborough, Lambeg and Hilden — and runs pre-booked private transfers to Belfast International, Belfast City Airport and Dublin Airport. The M1 is the usual start for both Aldergrove and the A1 corridor towards Dublin; City Airport typically means continuing through to the M3 after the Westlink. You get a confirmed fare before travel, a reserved pickup time, and the same online booking flow used on the homepage. Open the airport route that matches your ticket so the calculator already knows the terminal, then enter your street address. We monitor flights where possible for airport collections, include complimentary waiting on those pickups, and you can book a return on the same form. WhatsApp is available if you need to talk through pickup details.",
    blurb:
      "Lisburn and surrounding BT28/BT27 areas are a regular pickup zone for Aldergrove, City Airport, and Dublin Airport transfers.",
    areas: ["Lisburn", "Hillsborough", "Sprucefield", "Lambeg", "Hilden", "Dunmurry"],
    localNotes: [
      "Sprucefield and the M1 junctions are the usual start for Aldergrove and Dublin; Saturday retail traffic can slow the first part of the journey.",
      "Hillsborough pickups are quoted from the address you enter — useful for hotel guests who are not starting in Lisburn city centre.",
      "City Airport from Lisburn is timed around the Westlink peak rather than treated as a short local run.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "bangor",
    name: "Bangor",
    addressHint: "Bangor",
    hubSlug: "bangor-airport-taxis",
    title: "Bangor Airport Taxi & Airport Transfers",
    h1: "Bangor Airport Taxi & Airport Transfers",
    metaDescription:
      "Bangor airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price North Down transfers with flight monitoring and online booking.",
    intro:
      "Bangor and the North Down coast generate some of our earliest pickup times. Holiday flights from Belfast International and first-wave Dublin departures both need a car reserved the night before, not a hope that a local taxi is free on the marina. My Airport Taxi NI provides pre-booked private airport transfers from homes, hotels and businesses in Bangor to Belfast International, Belfast City Airport and Dublin Airport. We also collect from Ballyholme, Groomsport, Helen’s Bay and Crawfordsburn when those streets are entered on the quote. Belfast City Airport is the shorter coastal hop along the A2; Aldergrove and Dublin need a realistic buffer for the dual carriageway into Belfast. Use the route cards below so the airport is already selected, then enter your pickup address in the existing calculator. Flight monitoring, complimentary waiting on airport pickups, optional returns and WhatsApp contact work the same way as on our other pages.",
    blurb:
      "Bangor and North Down are among our most requested pickup areas — especially for early Belfast International flights and Dublin Airport runs.",
    areas: ["Bangor", "Ballyholme", "Groomsport", "Helen’s Bay", "Crawfordsburn", "Clandeboye"],
    localNotes: [
      "The A2 is the spine of almost every Bangor airport run; an incident at Holywood can add time that is not visible the night before.",
      "Marina and seafront hotels should include the hotel name — several properties share similar BT20 postcodes.",
      "Helen’s Bay and Crawfordsburn are collected with North Down timing, not as Belfast city jobs.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "holywood",
    name: "Holywood",
    addressHint: "Holywood",
    hubSlug: "holywood-airport-taxis",
    title: "Holywood Airport Taxi & Airport Transfers",
    h1: "Holywood Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Holywood to Belfast International, Belfast City or Dublin Airport. Fixed-price North Down transfers with online booking.",
    intro:
      "Holywood sits on the A2 between Belfast and Bangor, close enough to George Best Belfast City Airport that many residents treat it as their local terminal — and far enough that a pre-booked car still matters when you have bags, a flight time, and no wish to hunt a rank. My Airport Taxi NI runs private airport transfers from Holywood, Cultra, Craigavad, Seahill, Marino and Helen’s Bay to Belfast International, Belfast City and Dublin Airport. You enter the pickup street in the quote box on this page, see a fixed price, and pay online when an instant fare is shown. Belfast City Airport is the short hop along the Sydenham Bypass. Belfast International is the westbound motorway journey via the city or the M3/M2. Dublin Airport is the longer A1/M1 run that North Down customers book for Ryanair and Aer Lingus connections. We monitor inbound flights where possible, include complimentary waiting on airport collections, and WhatsApp is available if plans change after you book.",
    blurb:
      "Holywood and the Cultra–Seahill stretch of the A2 are a regular North Down collection area for all three airports.",
    areas: ["Holywood", "Cultra", "Craigavad", "Seahill", "Helen’s Bay", "Marino"],
    localNotes: [
      "Cultra and the Ulster Folk & Transport Museum area need the house name or number — several lanes share similar BT18 postcodes.",
      "Seahill and Craigavad are collected as Holywood-corridor jobs, not as Bangor marina pickups.",
      "City Airport is close, but International and Dublin still need the full motorway allowance you see in the quote tool.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "antrim",
    name: "Antrim",
    addressHint: "Antrim",
    hubSlug: "antrim-airport-taxis",
    title: "Antrim Airport Taxi & Airport Transfers",
    h1: "Antrim Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Antrim to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Templepatrick, Muckamore and the town.",
    intro:
      "Antrim town sits beside Lough Neagh with Belfast International Airport only a short hop along the A26 — closer than almost any other large town we serve. That proximity is why so many Antrim, Templepatrick, Muckamore, Dunadry, Randalstown and Crumlin bookings are early-morning International departures: you still want a reserved car, a fixed price, and a driver who is not taking a last-minute street hail. My Airport Taxi NI also covers the longer runs from Antrim to George Best Belfast City Airport and Dublin Airport. City Airport means the M2 into east Belfast. Dublin Airport means the A26 or M2 toward the A1/M1. Use the quote box on this page with your exact street — the same calculator as the homepage. We monitor inbound flights where possible, include complimentary waiting on airport pickups, and you can add a return so both legs sit on one booking. WhatsApp is available if you need to reach us after you pay.",
    blurb:
      "Antrim, Templepatrick and the A26 corridor are among the closest towns we collect for Belfast International Airport.",
    areas: ["Antrim", "Templepatrick", "Muckamore", "Randalstown", "Crumlin", "Dunadry"],
    localNotes: [
      "Templepatrick and the hotels around the A57 should include the property name — several sit within a short run of the International terminal.",
      "Randalstown collections use the Toome / A6 approach, not the same timing as an Antrim town-centre pickup.",
      "Crumlin is on the International side of the lough; say so in the address so the quote uses the correct street, not Antrim town.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "ballymena",
    name: "Ballymena",
    addressHint: "Ballymena",
    hubSlug: "ballymena-airport-taxis",
    title: "Ballymena Airport Taxi & Airport Transfers",
    h1: "Ballymena Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Ballymena to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Galgorm, Broughshane and the town.",
    intro:
      "Ballymena is the largest town in mid-Antrim and a regular origin for airport cars heading south on the A26. Belfast International is the nearest of the three terminals — a rural dual-carriageway run rather than a city-centre crawl — which is why Galgorm hotel guests and Broughshane, Cullybackey, Ahoghill and Gracehill residents often book International first. George Best Belfast City Airport and Dublin Airport are the other two journeys we quote from this hub. City Airport adds the M2 into Sydenham. Dublin Airport is the long A26/M2 then A1/M1 day that needs an honest start time. My Airport Taxi NI gives you a fixed price from your street address, online payment when an instant fare is shown, and a reserved pickup instead of a rank. We monitor inbound flights where possible, include complimentary waiting on airport collections, and WhatsApp is there if the plan changes. Add a return when you want the homeward leg booked with the outbound.",
    blurb:
      "Ballymena and the Galgorm–Broughshane hinterland are a core mid-Antrim collection area, especially for Belfast International.",
    areas: ["Ballymena", "Broughshane", "Cullybackey", "Galgorm", "Ahoghill", "Gracehill"],
    localNotes: [
      "Galgorm and the spa hotels should include the hotel name — drivers treat them as countryside pickups, not Ballymena bus-station jobs.",
      "Cullybackey and Gracehill sit west of the town; allow the extra lanes the quote map will show.",
      "Broughshane collections come in from the A42, not down the A26 from the town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "larne",
    name: "Larne",
    addressHint: "Larne",
    hubSlug: "larne-airport-taxis",
    title: "Larne Airport Taxi & Airport Transfers",
    h1: "Larne Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Larne to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Glynn, Islandmagee and the harbour town.",
    intro:
      "Larne is the ferry port at the mouth of Larne Lough, and airport transfers from here have a different shape to a Belfast suburb job. You leave the harbour town, Glynn, Magheramorne, Ballygally, Islandmagee or Whitehead and join the A8 toward the M2 — then either peel west for Belfast International or continue toward George Best Belfast City Airport on the harbour side of the city. Dublin Airport is the long southbound day after that motorway join. My Airport Taxi NI books private cars for all three, with a fixed price from your exact address and online payment when an instant fare is shown. Harbour and seafront postcodes need the property name; Islandmagee and Ballygally are coastal lanes, not Larne Main Street. We monitor inbound flights where possible, include complimentary waiting on airport pickups, and you can add a return so the trip back from the terminal is reserved. WhatsApp is available if a sailing or flight time moves after you book.",
    blurb:
      "Larne, Islandmagee and the A8 corridor are collected as east-Antrim harbour jobs — not as Carrickfergus Shore Road pickups.",
    areas: ["Larne", "Glynn", "Ballygally", "Islandmagee", "Whitehead", "Magheramorne"],
    localNotes: [
      "Islandmagee and Ballygally need the lane or house name — coastal sats often stop one road short.",
      "Whitehead sits toward Carrickfergus; we still collect it on Larne-area bookings when that is the address you enter.",
      "Ferry-terminal and harbour hotels should be named in the pickup field so the driver does not wait on the town-centre rank.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
  {
    townSlug: "newry",
    name: "Newry",
    addressHint: "Newry",
    hubSlug: "newry-airport-taxis",
    title: "Newry Airport Taxi & Airport Transfers",
    h1: "Newry Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a private airport taxi from Newry to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Warrenpoint, Rostrevor and the city.",
    intro:
      "Newry sits on the A1 between Belfast and Dublin, which is why Dublin Airport is often the first terminal people here ask about — and why Belfast International and George Best Belfast City Airport still need a proper northbound plan rather than a last-minute cab. My Airport Taxi NI runs private transfers from Newry city, Warrenpoint, Rostrevor, Bessbrook, Camlough and Hilltown to all three airports. Dublin Airport is the southbound M1 after the border. The two Belfast airports are the northbound A1 toward Lisburn and then either the M1/M2 west to International or the city route to Sydenham. Enter your street in the quote box on this page for a fixed price; pay online when an instant fare is shown. We monitor inbound flights where possible, include complimentary waiting on airport collections, and WhatsApp is available if you need to reach us. Add a return when you want the journey back from the terminal booked with the outbound.",
    blurb:
      "Newry and the Warrenpoint–Rostrevor coast are on the A1/M1 corridor — well placed for Dublin Airport and still a regular origin for both Belfast airports.",
    areas: ["Newry", "Warrenpoint", "Rostrevor", "Bessbrook", "Camlough", "Hilltown"],
    localNotes: [
      "Warrenpoint and Rostrevor are lough-shore collections — include the townland or hotel name, not only “Newry”.",
      "Bessbrook and Camlough sit off the A25; they are not the same timing as a Newry Buttercrane pickup.",
      "Hilltown is the Mournes approach; the quote map will show the extra lanes from the city.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
  },
];

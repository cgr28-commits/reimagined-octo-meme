import type { TownHubContent } from "@/lib/town-transfer-types";

/** First SEO batch — five town hubs only. */
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
    heroBase: "antrim-coast",
    heroAlt: "Coastal Northern Ireland near Newtownabbey airport transfer routes",
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
    heroBase: "antrim-coast",
    heroAlt: "Antrim coast roads used for Carrickfergus airport transfers",
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
    heroBase: "antrim-coast",
    heroAlt: "Countryside roads near Ballyclare used for airport collections",
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
    heroBase: "antrim-coast",
    heroAlt: "Road approaches used for Lisburn airport taxi transfers",
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
    heroBase: "antrim-coast",
    heroAlt: "North Down coast near Bangor airport taxi collections",
  },
];

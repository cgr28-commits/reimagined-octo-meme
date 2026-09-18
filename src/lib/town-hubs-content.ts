import type { TownHubContent } from "@/lib/town-transfer-types";

/** Town hub landing pages — chooser pages, not copies of the three child routes. */
export const TOWN_HUB_CONTENT: TownHubContent[] = [
  {
    townSlug: "newtownabbey",
    name: "Newtownabbey",
    addressHint: "Newtownabbey",
    hubSlug: "newtownabbey-airport-taxis",
    title: "Newtownabbey Airport Taxi & Airport Transfers",
    h1: "Newtownabbey Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Newtownabbey airport taxi for Belfast International, Belfast City or Dublin Airport. Each route page has the live quote for that terminal.",
    intro:
      "Use this page to pick which airport you are flying from Newtownabbey, then open that route. Belfast International is the holiday and long-haul terminal most families here use — collections join the M2 at Sandyknowes from Glengormley, Mallusk, Carnmoney and Monkstown. George Best Belfast City Airport is usually the shorter run from Whiteabbey and Jordanstown along the Shore Road toward the Sydenham Bypass. Dublin Airport is the cross-border booking: M2 onto the M1/A1, with applicable tolls included on those fares as on our other Dublin pages. Each card below opens a page with that airport already selected. Enter the full street so the quote is for that pickup, not a generic town-centre pin. Ulster University Jordanstown pickups should include the building or halls name. Mallusk business-park collections need the unit or reception entrance.",
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
        text: "The reserved cross-border slot: M2 onto the M1/A1. Applicable M1 tolls are included on Dublin Airport fares. Overnight pickups are booked on that route page.",
      },
    ],
  },
  {
    townSlug: "carrickfergus",
    name: "Carrickfergus",
    addressHint: "Carrickfergus",
    hubSlug: "carrickfergus-airport-taxis",
    title: "Carrickfergus Airport Taxi & Airport Transfers",
    h1: "Carrickfergus Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Carrickfergus airport taxi for Belfast International, Belfast City or Dublin Airport. Open the route that matches your ticket.",
    intro:
      "Choose the airport that matches your ticket, then open that Carrickfergus route. Belfast International is the inland run once you leave the harbour — A2 then the M2/M22, or the A8 depending on traffic. Belfast City Airport is the more coastal of the two Belfast terminals, along the A2 through Whiteabbey toward the Sydenham Bypass. Dublin Airport is the long reserved transfer: leave the A2, cross Belfast’s motorway box, and continue on the M1/A1. We collect from the town, Greenisland, Woodburn, Eden, Sunnylands and harbour hotels when you enter the full address. Greenisland is treated as a Carrickfergus-area pickup, not a Belfast city job. The A2 can slow through Whiteabbey and Fortwilliam in the evening peak — that pinch point sits on the City Airport and Dublin pages, not on this chooser. Harbour and castle-area hotels should include the property name.",
    blurb:
      "Carrickfergus and Greenisland sit on the A2 Shore Road — a regular pickup zone for both Belfast airports and for Dublin departures.",
    areas: ["Carrickfergus", "Greenisland", "Woodburn", "Eden", "Sunnylands"],
    localNotes: [
      "The A2 can slow through Whiteabbey and Fortwilliam in the evening peak; Carrickfergus departures are timed around that pinch point.",
      "Harbour and castle-area hotels should be booked with the property name — several share similar postcodes along the waterfront.",
      "Greenisland is collected with Carrickfergus-area timing, not as a Belfast city job, so the quote uses your exact street.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
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
        text: "A reserved long transfer: A2, Belfast’s motorway box, then the M1/A1. Applicable M1 tolls are included. First-wave flights are the usual reason this route is booked overnight.",
      },
    ],
  },
  {
    townSlug: "ballyclare",
    name: "Ballyclare",
    addressHint: "Ballyclare",
    hubSlug: "ballyclare-airport-taxis",
    title: "Ballyclare Airport Taxi & Airport Transfers",
    h1: "Ballyclare Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Ballyclare airport taxi for Belfast International, Belfast City or Dublin Airport. International is usually the shorter Belfast run.",
    intro:
      "Start here if you are choosing which airport to book from Ballyclare, Doagh, Ballynure or Ballyeaston. Belfast International is usually the more direct of the two Belfast airports — the A57 through Templepatrick is the road most Aldergrove bookings use from this town. Belfast City Airport is the longer reserved slot: you leave the A57 corridor and join the M2 toward Sydenham. Dublin Airport is the cross-border day, A57/M2 then the M1/A1, with applicable tolls included on those fares. Open the card that matches your ticket so the calculator starts on the correct terminal. Enter the full street; Doagh and Ballynure should not be treated as a generic Antrim-town pin. School-run traffic in Ballyclare can add a few minutes on weekday mornings even when the A57 itself is clear. City Airport and Dublin are not local hops from here — those route pages show the mapped time for your address.",
    blurb:
      "Ballyclare sits on the A57 towards Aldergrove, so Belfast International is usually the shorter Belfast airport run from the town.",
    areas: ["Ballyclare", "Doagh", "Ballynure", "Ballyeaston"],
    localNotes: [
      "The A57 through Templepatrick is the usual path to Belfast International; school-run traffic in the town can add a few minutes on weekday mornings.",
      "Doagh and Ballynure should be entered as full streets so the quote is not treated as a generic Antrim-town job.",
      "City Airport and Dublin from Ballyclare are longer reserved journeys, not local hops — the quote tool shows distance and time for your address.",
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
        text: "The longer Belfast slot: off the A57 corridor and onto the M2 toward Sydenham. Not the same journey as the International page.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A reserved M2/M1/A1 booking, not an A57 local run. Applicable M1 tolls are included on Dublin Airport fares.",
      },
    ],
  },
  {
    townSlug: "lisburn",
    name: "Lisburn",
    addressHint: "Lisburn",
    hubSlug: "lisburn-airport-taxis",
    title: "Lisburn Airport Taxi & Airport Transfers",
    h1: "Lisburn Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Lisburn airport taxi for Belfast International, Belfast City or Dublin Airport. The M1 is the usual start — the route page picks the terminal.",
    intro:
      "Lisburn sits at the south-west of our regular Greater Belfast pickup zone. Use this hub to choose the terminal, then open that route. Belfast International usually starts on the M1 and crosses to the M2/M22 for Aldergrove. Belfast City Airport is the city-corridor job: M1, Westlink, M3 and the Sydenham Bypass — timed around the Westlink peak rather than treated as a short local run. Dublin Airport is often the more natural long run from here than from the north of the city, because Lisburn is already on the A1 corridor from the Sprucefield junctions. We collect from Lisburn, Hillsborough, Sprucefield, Lambeg, Hilden and Dunmurry when those streets are entered. Saturday retail traffic around Sprucefield can slow the first part of an Aldergrove or Dublin start. Hillsborough hotel guests should enter the property address, not only “Lisburn”.",
    blurb:
      "Lisburn and surrounding BT28/BT27 areas are a regular pickup zone for Aldergrove, City Airport, and Dublin Airport transfers.",
    areas: ["Lisburn", "Hillsborough", "Sprucefield", "Lambeg", "Hilden", "Dunmurry"],
    localNotes: [
      "Sprucefield and the M1 junctions are the usual start for Aldergrove and Dublin; Saturday retail traffic can slow the first part of the journey.",
      "Hillsborough pickups are quoted from the address you enter — useful for hotel guests who are not starting in Lisburn city centre.",
      "City Airport from Lisburn is timed around the Westlink peak rather than treated as a short local run.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Usually the M1 then the M2/M22. Friday holiday traffic on the M1 is why this is reserved, not a casual local taxi job.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "M1, Westlink, M3 and the Sydenham Bypass — not the Aldergrove M22. Dunmurry and Lambeg sit closer to the M1 than Hillsborough.",
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
    h1: "Bangor Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Bangor airport taxi for Belfast International, Belfast City or Dublin Airport. City Airport is the shorter coastal hop.",
    intro:
      "Bangor and the North Down coast generate some of our earliest pickup times — choose the airport first, then open that route. Belfast City Airport is the shorter coastal hop along the A2 toward Holywood and the Sydenham Bypass. Belfast International is the longer reserved slot: A2 into Belfast, then the M3/M2 to Aldergrove, which is why holiday families book the night before. Dublin Airport is the long North Down booking, A2 then the M1/A1, with applicable tolls included; first-wave Dublin flights are a regular overnight pickup from this coast. We also collect from Ballyholme, Groomsport, Helen’s Bay, Crawfordsburn and Clandeboye when those streets are entered. An incident at Holywood can add time that is not visible the night before. Marina and seafront hotels should include the hotel name — several properties share similar BT20 postcodes.",
    blurb:
      "Bangor and North Down are among our most requested pickup areas — especially for early Belfast International flights and Dublin Airport runs.",
    areas: ["Bangor", "Ballyholme", "Groomsport", "Helen’s Bay", "Crawfordsburn", "Clandeboye"],
    localNotes: [
      "The A2 is the spine of almost every Bangor airport run; an incident at Holywood can add time that is not visible the night before.",
      "Marina and seafront hotels should include the hotel name — several properties share similar BT20 postcodes.",
      "Helen’s Bay and Crawfordsburn are collected with North Down timing, not as Belfast city jobs.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The longer North Down slot: A2 into Belfast, then the M3/M2 to Aldergrove. One of our most requested early pickups from this coast.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the shorter hop — A2 toward Holywood and the Sydenham Bypass. Helen’s Bay and Crawfordsburn sit on that line; Groomsport adds minutes through town.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A2 into Belfast, then the M1/A1. Applicable M1 tolls are included. First-wave Dublin flights from North Down are a regular overnight booking.",
      },
    ],
  },
  {
    townSlug: "holywood",
    name: "Holywood",
    addressHint: "Holywood",
    hubSlug: "holywood-airport-taxis",
    title: "Holywood Airport Taxi & Airport Transfers",
    h1: "Holywood Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Holywood airport taxi for Belfast International, Belfast City or Dublin Airport. City Airport is the short A2 hop; the others are motorway jobs.",
    intro:
      "Holywood sits on the A2 between Belfast and Bangor. Use this page to choose the terminal, then open that Holywood route. Belfast City Airport is the short hop along the Sydenham Bypass — close enough that residents treat it as their local terminal, still worth reserving when you have bags and a flight time. Belfast International is the westbound motorway journey via the M3/M2, the far side of the city from Cultra and Seahill. Dublin Airport is the longer A1/M1 run that North Down customers book for connections that Belfast does not fit. We collect from Holywood, Cultra, Craigavad, Seahill, Marino and Helen’s Bay. Cultra and the Ulster Folk & Transport Museum area need the house name or number — several lanes share similar BT18 postcodes. Seahill and Craigavad are Holywood-corridor jobs, not Bangor marina pickups. City Airport is close; International and Dublin still need the full motorway allowance the quote tool shows.",
    blurb:
      "Holywood and the Cultra–Seahill stretch of the A2 are a regular North Down collection area for all three airports.",
    areas: ["Holywood", "Cultra", "Craigavad", "Seahill", "Helen’s Bay", "Marino"],
    localNotes: [
      "Cultra and the Ulster Folk & Transport Museum area need the house name or number — several lanes share similar BT18 postcodes.",
      "Seahill and Craigavad are collected as Holywood-corridor jobs, not as Bangor marina pickups.",
      "City Airport is close, but International and Dublin still need the full motorway allowance you see in the quote tool.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The westbound motorway job: A2 into Belfast, then the M3/M2 toward Aldergrove. Not the short City Airport hop Holywood residents know.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The shortest of the three from this town — A2 and the Sydenham Bypass on the same coastal corridor as Cultra and Marino.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Leave the A2, cross the city, then the A1/M1. Applicable M1 tolls are included. First-wave Dublin departures from North Down are a regular overnight booking.",
      },
    ],
  },
  {
    townSlug: "antrim",
    name: "Antrim",
    addressHint: "Antrim",
    hubSlug: "antrim-airport-taxis",
    title: "Antrim Airport Taxi & Airport Transfers",
    h1: "Antrim Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose an Antrim airport taxi for Belfast International, Belfast City or Dublin Airport. International is the short A26 hop.",
    intro:
      "Antrim town sits beside Lough Neagh. Start here to choose the airport, then open that route. Belfast International is the shortest International run we quote from a full town — the A26 and airport access roads put Aldergrove next door to Templepatrick, Muckamore and Dunadry, and only a short hop from Antrim town and Crumlin. Belfast City Airport is the motorway job east: M2 until the Harbour Estate signs, a different shape from the International hop Antrim residents know. Dublin Airport is the long southbound day, M2 or A26 toward Belfast then the A1/M1, with applicable tolls included. Templepatrick and the hotels around the A57 should include the property name — several sit within a short run of the International terminal. Randalstown collections use the Toome / A6 approach, not the same timing as Antrim town centre. Crumlin is on the International side of the lough; say so in the address so the quote uses that street.",
    blurb:
      "Antrim, Templepatrick and the A26 corridor are among the closest towns we collect for Belfast International Airport.",
    areas: ["Antrim", "Templepatrick", "Muckamore", "Randalstown", "Crumlin", "Dunadry"],
    localNotes: [
      "Templepatrick and the hotels around the A57 should include the property name — several sit within a short run of the International terminal.",
      "Randalstown collections use the Toome / A6 approach, not the same timing as an Antrim town-centre pickup.",
      "Crumlin is on the International side of the lough; say so in the address so the quote uses the correct street, not Antrim town.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The short A26 / airport-road hop. Templepatrick and Dunadry are often closer to the terminal than Antrim town. Closeness is not the same as leaving it late.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "M2 east to the Harbour Estate — more city traffic at the far end than the International hop. An incident at Sandyknowes or York Street is the usual delay.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "M2 or A26 toward Belfast, then the A1/M1. Applicable M1 tolls are included. A closure at Sprucefield or Newry is the delay Antrim weather will not mention.",
      },
    ],
  },
  {
    townSlug: "ballymena",
    name: "Ballymena",
    addressHint: "Ballymena",
    hubSlug: "ballymena-airport-taxis",
    title: "Ballymena Airport Taxi & Airport Transfers",
    h1: "Ballymena Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Ballymena airport taxi for Belfast International, Belfast City or Dublin Airport. International is the nearest terminal on the A26.",
    intro:
      "Ballymena is the largest town in mid-Antrim. Use this hub to choose the airport, then open that route. Belfast International is the nearest of the three terminals — a rural A26 dual-carriageway run rather than a city-centre crawl — which is why Galgorm hotel guests and Broughshane, Cullybackey, Ahoghill and Gracehill residents often book International first. Belfast City Airport continues past International country onto the M2 and the Harbour Estate. Dublin Airport is the longest of the three: A26 south, M2, then the A1/M1, with applicable tolls included. Galgorm and the spa hotels should include the hotel name — drivers treat them as countryside pickups, not Ballymena bus-station jobs. Broughshane collections come in from the A42, not down the A26 from the town centre. Cullybackey and Gracehill sit west of the town and should be spelled in the address.",
    blurb:
      "Ballymena and the Galgorm–Broughshane hinterland are a core mid-Antrim collection area, especially for Belfast International.",
    areas: ["Ballymena", "Broughshane", "Cullybackey", "Galgorm", "Ahoghill", "Gracehill"],
    localNotes: [
      "Galgorm and the spa hotels should include the hotel name — drivers treat them as countryside pickups, not Ballymena bus-station jobs.",
      "Cullybackey and Gracehill sit west of the town; allow the extra lanes the quote map will show.",
      "Broughshane collections come in from the A42, not down the A26 from the town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Nearest terminal from mid-Antrim. A26 south — a dual-carriageway run rather than a city crawl. Broughshane joins from the A42.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "A26 then M2 to the Harbour Estate. York Street is where a clear Ballymena run can still lose time at the end.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The longest booking from this hub: A26, M2, then A1/M1. Applicable M1 tolls are included. Newry or Sprucefield trouble will not show on a Ballymena forecast.",
      },
    ],
  },
  {
    townSlug: "larne",
    name: "Larne",
    addressHint: "Larne",
    hubSlug: "larne-airport-taxis",
    title: "Larne Airport Taxi & Airport Transfers",
    h1: "Larne Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Larne airport taxi for Belfast International, Belfast City or Dublin Airport. All three start on the A8 from the harbour town.",
    intro:
      "Larne is the ferry port at the mouth of Larne Lough. Airport transfers from here have a different shape to a Belfast suburb job — choose the airport first. Belfast International leaves the harbour, joins the A8, then turns west on the M2 toward Aldergrove. Belfast City Airport stays on the eastern side: A8 toward Belfast, then the Harbour Estate and Sydenham rather than the westbound peel. Dublin Airport is the long southbound booking after that motorway join, with applicable tolls included — often after a Cairnryan sailing the evening before. We collect from Larne, Glynn, Magheramorne, Ballygally, Islandmagee and Whitehead. Islandmagee and Ballygally need the lane or house name — coastal sats often stop one road short. Whitehead sits toward Carrickfergus and is still collected on Larne-area bookings when that is the address you enter. Ferry-terminal and harbour hotels should be named so the driver does not wait on the town-centre rank.",
    blurb:
      "Larne, Islandmagee and the A8 corridor are collected as east-Antrim harbour jobs — not as Carrickfergus Shore Road pickups.",
    areas: ["Larne", "Glynn", "Ballygally", "Islandmagee", "Whitehead", "Magheramorne"],
    localNotes: [
      "Islandmagee and Ballygally need the lane or house name — coastal sats often stop one road short.",
      "Whitehead sits toward Carrickfergus; we still collect it on Larne-area bookings when that is the address you enter.",
      "Ferry-terminal and harbour hotels should be named in the pickup field so the driver does not wait on the town-centre rank.",
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
        text: "Stays on the east-Antrim corridor — A8, then Sydenham rather than the westbound M2 peel. A queue at the docks can slow the last miles.",
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
    h1: "Newry Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Newry airport taxi for Belfast International, Belfast City or Dublin Airport. Dublin is often the first terminal people here ask about.",
    intro:
      "Newry sits on the A1 between Belfast and Dublin. Start here to choose the terminal, then open that route. Dublin Airport is often the first airport people here ask about — you are already on the A1, the border is minutes away, and the M1 carries you south, with applicable tolls included. Belfast International is the northbound A1 job that then swings west onto the M1/M2 for Aldergrove — the long-haul alternative when the ticket is out of Aldergrove rather than Dublin. Belfast City Airport stays on the A1 into Belfast and takes the Harbour Estate roads to Sydenham instead of peeling west. We collect from Newry, Warrenpoint, Rostrevor, Bessbrook, Camlough and Hilltown. Warrenpoint and Rostrevor are lough-shore collections — include the townland or hotel name, not only “Newry”. Bessbrook and Camlough sit off the A25; they are not the same timing as a Buttercrane pickup. Hilltown is the Mournes approach.",
    blurb:
      "Newry and the Warrenpoint–Rostrevor coast are on the A1/M1 corridor — well placed for Dublin Airport and still a regular origin for both Belfast airports.",
    areas: ["Newry", "Warrenpoint", "Rostrevor", "Bessbrook", "Camlough", "Hilltown"],
    localNotes: [
      "Warrenpoint and Rostrevor are lough-shore collections — include the townland or hotel name, not only “Newry”.",
      "Bessbrook and Camlough sit off the A25; they are not the same timing as a Newry Buttercrane pickup.",
      "Hilltown is the Mournes approach; the quote map will show the extra lanes from the city.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Northbound A1, then west on the M1/M2. A queue at Sprucefield can add time after a clear run out of Newry. Not a Dublin job pointed the wrong way.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "A1 into Belfast, then Sydenham rather than the westbound peel. Westlink or Harbour Estate trouble is the last-mile delay.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The natural southbound booking from this city. A1 then the M1. Applicable M1 tolls are included. Border delays are the ones a city-centre clock will not show.",
      },
    ],
  },
];

import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 3 town hubs. Chooser pages only — the airport essays live on the child routes.
 * Geography is limited to roads and neighbouring settlements that are already part of
 * the local pickup area. No fares, mileages, or journey-time claims.
 */
export const TOWN_HUB_BATCH_3: TownHubContent[] = [
  {
    townSlug: "newtownards",
    name: "Newtownards",
    addressHint: "Newtownards",
    hubSlug: "newtownards-airport-taxis",
    title: "Newtownards Airport Taxi & Airport Transfers",
    seoTitle: "Newtownards Taxi to Belfast City & International Airport | 5★",
    h1: "Newtownards Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Newtownards airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from the Ards. Quote your street.",
    intro:
      "Pre-book a fixed-price airport taxi from Newtownards to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Newtownards, Scrabo, Movilla, Conlig, Donaghadee and Comber. Most journeys leave on the A20 through Dundonald. Belfast City Airport is usually the closer of the two Belfast airports, as the A20 takes you into east Belfast near Sydenham. Belfast International is a longer run through Belfast and up the M2 to Aldergrove. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Conlig and Donaghadee are priced from your own street, so type the full address rather than just the town. For homes near Scrabo or The Square, include the house or hotel name, as several properties share similar BT23 postcodes.",
    blurb:
      "Newtownards and the A20 toward Dundonald are an Ards pickup zone for both Belfast airports and for Dublin departures.",
    areas: ["Newtownards", "Scrabo", "Movilla", "Conlig", "Donaghadee", "Comber"],
    localNotes: [
      "Most Newtownards airport trips start on the A20 through Dundonald.",
      "Conlig pickups are priced from your own address, so type Conlig rather than Bangor.",
      "Donaghadee collections use the A48 before joining the A20, so the street matters more than the town name alone.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["dundonald", "comber", "bangor"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A20 through Dundonald and Belfast, then the M2 towards Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the nearer Belfast terminal from Newtownards. The A20 points toward east Belfast and the Sydenham side, not toward Aldergrove.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The A20 into Belfast, then the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "dundonald",
    name: "Dundonald",
    addressHint: "Dundonald",
    hubSlug: "dundonald-airport-taxis",
    title: "Dundonald Airport Taxi & Airport Transfers",
    seoTitle: "Dundonald Taxi to Belfast City & International Airport | 5★",
    h1: "Dundonald Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Dundonald airport taxi for Belfast City, Belfast International or Dublin Airport. Fixed-price A20 transfers, quoted from your street.",
    intro:
      "Pre-book a fixed-price airport taxi from Dundonald to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Dundonald, Ballybeen, Tullycarnet, the Comber Road, Knock and Gilnahirk. Belfast City Airport is the closest, a short trip along the A20 into east Belfast and over to Sydenham. Belfast International means crossing the city and taking the M2 to Aldergrove. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. If you are being collected from the Ulster Hospital, include the building or entrance, as the Upper Newtownards Road has several similar postcodes. Comber Road addresses should say Comber Road so the quote starts in Dundonald, not Comber.",
    blurb:
      "Dundonald sits on the A20 between east Belfast and Newtownards, a regular start for City Airport and for longer International and Dublin runs.",
    areas: ["Dundonald", "Ballybeen", "Tullycarnet", "Comber Road", "Knock", "Gilnahirk"],
    localNotes: [
      "Ulster Hospital pickups should include the building or entrance. The Upper Newtownards Road has several similar postcodes.",
      "Ballybeen and Tullycarnet pickups are priced from your own street.",
      "Comber Road is still Dundonald. Enter the street so the quote does not start in Comber Square.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownards", "comber", "holywood"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Across Belfast from the A20, then up the M2 to Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The shorter Belfast airport from this suburb. The A20 already faces east Belfast and the Sydenham side of the city.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Across Belfast, then south on the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "comber",
    name: "Comber",
    addressHint: "Comber",
    hubSlug: "comber-airport-taxis",
    title: "Comber Airport Taxi & Airport Transfers",
    seoTitle: "Comber Taxi to Belfast City & International Airport | 5★",
    h1: "Comber Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Comber airport taxi for Belfast International, Belfast City or Dublin Airport. A22 routes toward Dundonald, with a fixed quote online.",
    intro:
      "Pre-book a fixed-price airport taxi from Comber to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Comber, The Square, Killinchy, Moneyreagh and Ballygowan. Most journeys leave on the A22 towards Dundonald. Belfast City Airport is usually the closest, staying on the east side of Belfast towards Sydenham. Belfast International means crossing the city and taking the M2 to Aldergrove. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. A pickup in The Square, on the Killinchy Road or out in Moneyreagh or Ballygowan is priced from that exact address, so type the full street rather than just Comber. Dundonald and Newtownards have their own airport taxi pages if you are starting there.",
    blurb:
      "Comber and the north-west corner of Strangford Lough are a regular pickup area, usually via the A22 to Dundonald.",
    areas: ["Comber", "The Square", "Killinchy", "Moneyreagh", "Ballygowan"],
    localNotes: [
      "The Square and the Killinchy Road are different Comber starts. Enter the street, not only the town.",
      "Moneyreagh and Ballygowan pickups are priced from your own address.",
      "The A22 to Dundonald is the usual way out toward both Belfast airports. The A21 to Newtownards is the other exit.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownards", "dundonald", "carryduff"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A22 to Dundonald, across Belfast, then the M2 towards Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Same A22 start as the International run, then east Belfast and Sydenham rather than the westbound M2.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The A22 into Belfast, then the A1/M1. M1 tolls are included. The longest of the three trips.",
      },
    ],
  },
  {
    townSlug: "carryduff",
    name: "Carryduff",
    addressHint: "Carryduff",
    hubSlug: "carryduff-airport-taxis",
    title: "Carryduff Airport Taxi & Airport Transfers",
    seoTitle: "Carryduff Taxi to Belfast City & International Airport | 5★",
    h1: "Carryduff Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Carryduff airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from the A24 Saintfield Road.",
    intro:
      "Pre-book a fixed-price airport taxi from Carryduff to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Carryduff, Cairnshill, Knockbracken, Four Winds, Newtownbreda and Saintfield. Most journeys start on the A24 Saintfield Road. Belfast City Airport is a run across east Belfast to Sydenham. Belfast International means heading through south Belfast and up the M1 and M2 to Aldergrove. Dublin Airport is a straightforward trip south on the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Cairnshill, Knockbracken, Four Winds and Newtownbreda pickups are priced from your own street. If you are in Saintfield or Moneyreagh, type that address in full so the quote starts from the right place.",
    blurb:
      "Carryduff and the Saintfield Road are a south-Belfast pickup zone for Aldergrove, City Airport and Dublin.",
    areas: ["Carryduff", "Cairnshill", "Knockbracken", "Four Winds", "Newtownbreda", "Saintfield"],
    localNotes: [
      "Most trips start at the Carryduff roundabout on the Saintfield Road. Cairnshill and Knockbracken are priced from your own street.",
      "Saintfield is further down the A24. Enter the town if that is the pickup, rather than a Carryduff shopping address.",
      "Moneyreagh sits toward Comber. Say so in the address so the route does not assume the roundabout.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["lisburn", "comber"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The Saintfield Road into south Belfast, then the motorway towards Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "An eastbound run across the city to Sydenham. Four Winds and Newtownbreda sit closer to that line than Saintfield does.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "From south Belfast onto the A1/M1. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "hillsborough",
    name: "Hillsborough",
    addressHint: "Hillsborough",
    hubSlug: "hillsborough-airport-taxis",
    title: "Hillsborough Airport Taxi & Airport Transfers",
    seoTitle: "Hillsborough Taxi to Belfast International & Dublin Airport | 5★",
    h1: "Hillsborough Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Hillsborough airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price A1 transfers, quoted from the village.",
    intro:
      "Pre-book a fixed-price airport taxi from Hillsborough to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Hillsborough village, Culcavy, Annahilt and Dromore. Belfast International is reached up the A1 to Sprucefield, then the M1 and M2 to Aldergrove. Belfast City Airport is via the M1 and the Westlink into Belfast and out to Sydenham. Dublin Airport is often the easiest long trip from here, because the A1 already heads south, and M1 tolls are included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. For homes or hotels in the village, near the fort or the castle, include the house or hotel name. Culcavy and Annahilt are priced from your own address, so type the full street rather than just Hillsborough. Moira and Lisburn have their own airport taxi pages.",
    blurb:
      "Hillsborough village and the A1 bypass are priced from the address you enter.",
    areas: ["Hillsborough", "Culcavy", "Annahilt", "Dromore"],
    localNotes: [
      "Village streets and the bypass are different starts. Include the house or hotel name if you are staying off the A1.",
      "Culcavy sits toward Lisburn. Annahilt sits south of the village. Enter the hamlet, not only Hillsborough.",
      "Moira is the next village west on the M1 and is booked on its own airport pages when that is the pickup.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["lisburn", "moira", "craigavon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "North on the A1 to Sprucefield, then the M1 and the M2/M22 to Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The M1 and Westlink into Belfast, then out to Sydenham.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The southbound A1/M1 from a village that is already on that road. Applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "moira",
    name: "Moira",
    addressHint: "Moira",
    hubSlug: "moira-airport-taxis",
    title: "Moira Airport Taxi & Airport Transfers",
    seoTitle: "Moira Taxi to Belfast International & Dublin Airport | 5★",
    h1: "Moira Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Moira airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price M1 transfers, quoted from your street online.",
    intro:
      "Pre-book a fixed-price airport taxi from Moira to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Moira village, Main Street, Maghaberry and Aghalee. Being right beside the M1 makes every airport easy to reach. Belfast International is east on the M1, then the M2 and M22 to Aldergrove. Belfast City Airport stays on the M1 into the Westlink and out to Sydenham. Dublin Airport goes east on the M1 to Sprucefield, then south on the A1 without going into Belfast, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. Maghaberry and Aghalee pickups are priced from your own address, so type the full street rather than just Moira. Hillsborough and Lisburn have their own airport taxi pages if you are starting there.",
    blurb:
      "Moira and the M1 junction are a regular pickup for Dublin Airport and for both Belfast airports.",
    areas: ["Moira", "Maghaberry", "Aghalee", "Main Street"],
    localNotes: [
      "Main Street and the M1 junction are different Moira starts. Enter the street if you are in the village.",
      "Maghaberry is north of the motorway. Aghalee is toward Lough Neagh. Neither is a Hillsborough address.",
      "Hillsborough has its own airport pages. Use those if the pickup is in that village rather than Moira.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["hillsborough", "lisburn", "craigavon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "East on the M1 from the Moira junction, then the M2/M22. Maghaberry joins from the north of the motorway.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Stay on the M1 into the Westlink, then on to Sydenham.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "East on the M1 to Sprucefield, then south on the A1, without entering Belfast. Applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "glengormley",
    name: "Glengormley",
    addressHint: "Glengormley",
    hubSlug: "glengormley-airport-taxis",
    title: "Glengormley Airport Taxi & Airport Transfers",
    seoTitle: "Glengormley Taxi to Belfast International & City Airport | 5★",
    h1: "Glengormley Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Glengormley airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Sandyknowes, quoted live.",
    intro:
      "Pre-book a fixed-price airport taxi from Glengormley to Belfast International, George Best Belfast City or Dublin Airport. We collect door to door from Glengormley, Sandyknowes, Hightown, Carnmoney, Mallusk and Rathcoole. Belfast International is a direct motorway run up the M2 from Sandyknowes, so it is the usual choice for holidays and long-haul flights. Belfast City Airport is a short trip down the M2 into Belfast and out to Sydenham. Dublin Airport is around two hours away via the M2 and the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. On the Hightown Road, include your house number. For Mallusk industrial estates, add the unit or reception name so your driver finds you first time. Whiteabbey has its own airport taxi page if you are on the Shore Road.",
    blurb:
      "Glengormley and Sandyknowes are the M2 start for Aldergrove, with City Airport and Dublin booked as separate routes.",
    areas: ["Glengormley", "Sandyknowes", "Hightown", "Carnmoney", "Mallusk", "Rathcoole"],
    localNotes: [
      "On the Hightown Road, include your house number.",
      "For Mallusk industrial estates, add the unit or reception name so your driver finds you first time.",
      "Whiteabbey is the Shore Road, not this junction. Use the Whiteabbey airport pages if that is the pickup.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownabbey", "whiteabbey"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Straight onto the M2 at Sandyknowes and out to Aldergrove. The usual choice for holidays.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Down the M2 into Belfast, then out to Sydenham.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The M2, then the M1/A1 south. M1 tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "whiteabbey",
    name: "Whiteabbey",
    addressHint: "Whiteabbey",
    hubSlug: "whiteabbey-airport-taxis",
    title: "Whiteabbey Airport Taxi & Airport Transfers",
    seoTitle: "Whiteabbey Taxi to Belfast International & City Airport | 5★",
    h1: "Whiteabbey Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Whiteabbey airport taxi to Belfast City, Belfast International or Dublin Airport. Fixed-price Shore Road transfers, quoted live online.",
    intro:
      "Pre-book a fixed-price airport taxi from Whiteabbey to George Best Belfast City, Belfast International or Dublin Airport. We collect door to door from Whiteabbey, Hazelbank, Jordanstown, Greenisland and Rathcoole. Belfast City Airport is usually the closer of the two Belfast airports, along the Shore Road beside the lough towards Sydenham. Belfast International means leaving the Shore Road and taking the M2 to Aldergrove. Dublin Airport is the longest trip, through Belfast and down the A1/M1, with M1 tolls included in the fare. Enter your full address in the quote box above to see your fixed price, then book and pay securely online. On the Shore Road and at Hazelbank, include your house or building name, as several properties share similar postcodes. For Ulster University Jordanstown, add the building name. Greenisland and Rathcoole pickups are priced from your own address.",
    blurb:
      "Whiteabbey and the A2 Shore Road are a lough-side pickup zone, separate from Glengormley and Sandyknowes.",
    areas: ["Whiteabbey", "Hazelbank", "Jordanstown", "Greenisland", "Rathcoole"],
    localNotes: [
      "Shore Road and Hazelbank addresses should include the house or building. Several properties share similar postcodes along the A2.",
      "Jordanstown campus pickups need the building name. Greenisland is further toward Carrickfergus and should say so.",
      "Rathcoole is inland from the lough. Glengormley and Sandyknowes are a different start and have their own pages.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownabbey", "glengormley", "carrickfergus"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Off the Shore Road and up the M2 to Aldergrove.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the nearer Belfast terminal. The A2 runs along the lough toward Sydenham. Jordanstown and Hazelbank sit on that line.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A2 into Belfast, then the A1/M1. Applicable M1 tolls are included. Greenisland is further along the A2 before Belfast.",
      },
    ],
  },
];

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
    h1: "Newtownards Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Newtownards airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from the Ards. Quote your street.",
    intro:
      "Newtownards sits at the head of Strangford Lough, and airport transfers from the town almost always leave on the A20 toward Dundonald rather than up the Bangor coast. Use this page to choose the terminal, then open that route so the quote starts on the right airport. Belfast City Airport is usually the nearer of the two Belfast terminals: the A20 runs into east Belfast and toward the Sydenham side of the city. Movilla, Scrabo and the west of Newtownards are Ards pickups, not Bangor marina jobs. Belfast International is the longer inland booking, once the A20 has brought you through Belfast and onto the M2 toward Aldergrove. Dublin Airport continues south on the A1/M1 after that city crossing, and applicable tolls are included on those fares. We also collect from Comber, Dundonald, Conlig and Donaghadee when you enter the full street. Conlig is on the A21 toward Bangor and should be spelled as Conlig, not as a Bangor seafront address. Donaghadee adds the coastal road before you reach the A20. Streets under Scrabo and around The Square need the house or hotel name, because several properties share similar BT23 postcodes.",
    blurb:
      "Newtownards and the A20 toward Dundonald are an Ards pickup zone for both Belfast airports and for Dublin departures.",
    areas: ["Newtownards", "Scrabo", "Movilla", "Conlig", "Donaghadee", "Comber"],
    localNotes: [
      "The A20 through Dundonald is the usual start for every Newtownards airport run; the A21 to Bangor is a different road and a different pickup.",
      "Conlig should be entered as Conlig. It sits between Newtownards and Bangor and is not a Bangor marina address.",
      "Donaghadee collections use the coastal road before joining the A20, so the street matters more than the town name alone.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["dundonald", "comber", "bangor"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The inland Ards booking. A20 through Dundonald and Belfast, then the M2 toward Aldergrove. Scrabo and Movilla start in town; Donaghadee starts on the coast.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the nearer Belfast terminal from Newtownards. The A20 points toward east Belfast and the Sydenham side, not toward Aldergrove.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A reserved cross-border run after the A20: through Belfast, then the A1/M1. Applicable M1 tolls are included on Dublin Airport fares.",
      },
    ],
  },
  {
    townSlug: "dundonald",
    name: "Dundonald",
    addressHint: "Dundonald",
    hubSlug: "dundonald-airport-taxis",
    title: "Dundonald Airport Taxi & Airport Transfers",
    h1: "Dundonald Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Dundonald airport taxi for Belfast City, Belfast International or Dublin Airport. Fixed-price A20 transfers, quoted from your street.",
    intro:
      "Dundonald is the suburb on the A20 between east Belfast and Newtownards, and that dual carriageway is the start of almost every airport booking from here. Choose the terminal on this page, then open the route that matches the ticket. Belfast City Airport is the shorter of the two Belfast airports for most Dundonald streets, because the A20 already points toward the Sydenham side of the city. Belfast International is the westbound job: leave the A20, cross the city and join the M2 toward Aldergrove. Dublin Airport is the long southbound booking after that, on the A1/M1, with applicable tolls included. Ballybeen and Tullycarnet are Dundonald-area collections, not Newtownards town-centre pins. The Ulster Hospital and the Upper Newtownards Road need the building or ward entrance as well as the postcode. Comber Road pickups should say Comber Road, so they are not treated as a Comber Square job. Knock and Gilnahirk sit on the Belfast side of Dundonald and still belong on this page when that is the address you enter.",
    blurb:
      "Dundonald sits on the A20 between east Belfast and Newtownards, a regular start for City Airport and for longer International and Dublin runs.",
    areas: ["Dundonald", "Ballybeen", "Tullycarnet", "Comber Road", "Knock", "Gilnahirk"],
    localNotes: [
      "Ulster Hospital pickups should include the building or entrance. The Upper Newtownards Road has several similar postcodes.",
      "Ballybeen and Tullycarnet are collected as Dundonald addresses, not as Newtownards town-centre jobs.",
      "Comber Road is still Dundonald. Enter the street so the quote does not start in Comber Square.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownards", "comber", "holywood"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Westbound from the A20. You leave the Newtownards Road, cross Belfast and join the M2. Ballybeen and the hospital are not the same pin.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The shorter Belfast airport from this suburb. The A20 already faces east Belfast and the Sydenham side of the city.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A full cross-border diary slot even though Dundonald is already on the Belfast side of Newtownards. A1/M1 south. Applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "comber",
    name: "Comber",
    addressHint: "Comber",
    hubSlug: "comber-airport-taxis",
    title: "Comber Airport Taxi & Airport Transfers",
    h1: "Comber Airport Taxi & Airport Transfers",
    metaDescription:
      "Choose a Comber airport taxi for Belfast International, Belfast City or Dublin Airport. A22 routes toward Dundonald, with a live quote online.",
    intro:
      "Comber is the town at the north-west corner of Strangford Lough, and airport transfers from here begin by leaving the lough on the A22 toward Dundonald. This page is the chooser: open the airport that matches your ticket so the quote is not a generic Ards pin. Belfast City Airport and Belfast International share that A22 start, then split once you reach the Belfast road network. City Airport stays on the eastern side of the city, toward Sydenham. International turns west onto the M2 for Aldergrove. Dublin Airport is the reserved long run after that, down the A1/M1, with applicable tolls included. The Square is the town centre; Killinchy Road and the A21 toward Newtownards are different starts and should be written in full. Moneyreagh and Ballygowan sit off the Comber side of south-east Belfast and are collected when that street is the address you enter. They are not the same timing as a pickup in The Square. Dundonald is the next town on the A22, and Newtownards is the next town on the A21 — each has its own airport page if that is where you are actually starting.",
    blurb:
      "Comber and the north-west corner of Strangford Lough are collected via the A22 to Dundonald, not as Newtownards or Bangor jobs.",
    areas: ["Comber", "The Square", "Killinchy", "Moneyreagh", "Ballygowan"],
    localNotes: [
      "The Square and the Killinchy Road are different Comber starts. Enter the street, not only the town.",
      "Moneyreagh and Ballygowan are collected on Comber-area bookings when that is the address, not as Carryduff roundabout jobs.",
      "The A22 to Dundonald is the usual way out toward both Belfast airports. The A21 to Newtownards is the other exit.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownards", "dundonald", "carryduff"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Leave the lough on the A22 to Dundonald, then the Belfast roads and the M2 toward Aldergrove. Not an A21 Newtownards start.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Same A22 start as the International run, then east Belfast and Sydenham rather than the westbound M2.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A22 into the Belfast network, then the A1/M1. Applicable M1 tolls are included. A longer reserved slot than either Belfast airport.",
      },
    ],
  },
  {
    townSlug: "carryduff",
    name: "Carryduff",
    addressHint: "Carryduff",
    hubSlug: "carryduff-airport-taxis",
    title: "Carryduff Airport Taxi & Airport Transfers",
    h1: "Carryduff Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Carryduff airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from the A24 Saintfield Road.",
    intro:
      "Carryduff sits on the A24 Saintfield Road at the south edge of Belfast, and the roundabout there is the usual start for an airport taxi from this suburb. Choose the terminal first. None of the three airports is a Shore Road job from here: you leave on the Saintfield Road or the outer ring before you reach a motorway. Belfast International is the westbound booking, through south Belfast and onto the M1/M2 corridor for Aldergrove. Belfast City Airport is the eastbound city run, toward Sydenham, and it is a different shape from the Holywood A2 hop. Dublin Airport is the southbound A1/M1 booking once you are out of the suburb, with applicable tolls included. Cairnshill, Knockbracken, Four Winds and Newtownbreda are the Belfast side of Carryduff and should be entered as those streets. Saintfield is the town further down the A24 and is not a Carryduff roundabout pin. Moneyreagh sits toward Comber; include it in the address when that is the pickup, so the quote does not start on the Saintfield Road by default.",
    blurb:
      "Carryduff and the Saintfield Road are a south-Belfast pickup zone for Aldergrove, City Airport and Dublin.",
    areas: ["Carryduff", "Cairnshill", "Knockbracken", "Four Winds", "Newtownbreda", "Saintfield"],
    localNotes: [
      "The Carryduff roundabout and the Saintfield Road are the usual start. Cairnshill and Knockbracken are not the same pin.",
      "Saintfield is further down the A24. Enter the town if that is the pickup, rather than a Carryduff shopping address.",
      "Moneyreagh sits toward Comber. Say so in the address so the route does not assume the roundabout.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["lisburn", "comber"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Saintfield Road into south Belfast, then the motorway west toward Aldergrove. Not a Shore Road or Newtownabbey start.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "An eastbound run across the city to Sydenham. Four Winds and Newtownbreda sit closer to that line than Saintfield does.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South Belfast onto the A1/M1. Applicable M1 tolls are included. Moneyreagh is the Comber side of this suburb, not the roundabout.",
      },
    ],
  },
  {
    townSlug: "hillsborough",
    name: "Hillsborough",
    addressHint: "Hillsborough",
    hubSlug: "hillsborough-airport-taxis",
    title: "Hillsborough Airport Taxi & Airport Transfers",
    h1: "Hillsborough Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Hillsborough airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price A1 transfers, quoted from the village.",
    intro:
      "Hillsborough is the village beside the A1, between Lisburn and Dromore, and an airport taxi from here is not the same booking as a Lisburn city-centre pickup. Use this page to choose the terminal, then open that route. The bypass carries through-traffic; the village itself, including the streets around the fort and the castle grounds, sits off that road and needs the house or hotel name. Belfast International usually joins the M1 near Sprucefield and then the M2/M22 toward Aldergrove. Belfast City Airport stays with the city corridor — M1, Westlink and the Sydenham side — rather than peeling off for the International terminal. Dublin Airport is often the more natural long run from Hillsborough, because the A1 is already the road south, and applicable tolls are included on those fares. Culcavy is the hamlet on the Lisburn side of the village. Annahilt is the next settlement south. Both should be written in the address. Moira is a separate village on the M1 and has its own airport pages if that is where you are starting.",
    blurb:
      "Hillsborough village and the A1 bypass are quoted from the address you enter, not as a generic Lisburn job.",
    areas: ["Hillsborough", "Culcavy", "Annahilt", "Dromore"],
    localNotes: [
      "Village streets and the bypass are different starts. Include the house or hotel name if you are staying off the A1.",
      "Culcavy sits toward Lisburn. Annahilt sits south of the village. Enter the hamlet, not only Hillsborough.",
      "Moira is the next village west on the M1 and is booked on its own airport pages when that is the pickup.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["lisburn", "moira"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "A1 north toward Sprucefield, then the M1 and M2/M22. A village address is not the same start as the bypass.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "M1, Westlink and the Sydenham side of Belfast. This is the city-corridor job, not the Aldergrove peel.",
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
    h1: "Moira Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Moira airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price M1 transfers, quoted from your street online.",
    intro:
      "Moira is the village on the M1 between Lisburn and Lurgan, and the motorway junction is why airport bookings from here feel different from a Hillsborough or Lisburn start. Choose the airport on this page before you open the quote. Belfast International is the eastbound M1 run that then crosses to the M2/M22 for Aldergrove. Belfast City Airport continues on the M1 into the Westlink and toward Sydenham, which is a city-corridor job rather than an Aldergrove one. Dublin Airport is the southbound M1/A1 booking, and it is often the long transfer people in this village ask about first, with applicable tolls included. Main Street and the A3 through the village are not the same pin as the motorway junction. Maghaberry sits north of the M1 and should be entered as Maghaberry. Aghalee is the Lough Neagh side, toward the lough rather than toward Hillsborough. Hillsborough itself is the neighbouring village to the south-east and has its own airport pages when that is the address.",
    blurb:
      "Moira and the M1 junction are a regular pickup for Dublin Airport and for both Belfast airports.",
    areas: ["Moira", "Maghaberry", "Aghalee", "Main Street"],
    localNotes: [
      "Main Street and the M1 junction are different Moira starts. Enter the street if you are in the village.",
      "Maghaberry is north of the motorway. Aghalee is toward Lough Neagh. Neither is a Hillsborough address.",
      "Hillsborough has its own airport pages. Use those if the pickup is in that village rather than Moira.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["hillsborough", "lisburn"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "East on the M1 from the Moira junction, then the M2/M22. Maghaberry joins from the north of the motorway.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "M1 into the Westlink and on toward Sydenham. Not the westbound peel that Aldergrove uses.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Southbound on the M1/A1 from a village that is already on the motorway. Applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "glengormley",
    name: "Glengormley",
    addressHint: "Glengormley",
    hubSlug: "glengormley-airport-taxis",
    title: "Glengormley Airport Taxi & Airport Transfers",
    h1: "Glengormley Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Glengormley airport taxi to Belfast International, Belfast City or Dublin Airport. Fixed-price transfers from Sandyknowes, quoted live.",
    intro:
      "Glengormley sits at Sandyknowes, where the A6 meets the M2, and that junction is the reason airport taxis from here are booked on their own page rather than as a generic Newtownabbey pin. Choose the terminal, then open the route. Belfast International is the direct motorway run: onto the M2 and out toward Aldergrove, which is why Hightown, Carnmoney and Mallusk residents often start with this airport. Belfast City Airport leaves that junction toward the city and the Sydenham side, and it is not the same journey as a Whiteabbey Shore Road pickup. Dublin Airport continues from the M2 onto the M1/A1, with applicable tolls included. Hightown Road climbs toward Cave Hill and should include the house number. Mallusk industrial streets need the unit or reception, not only “Glengormley”. Carnmoney is the neighbouring district on the way toward the lough. Rathcoole sits nearby and is collected when that is the address you enter. Whiteabbey is the shore, a different start, and it has its own airport pages.",
    blurb:
      "Glengormley and Sandyknowes are the M2 start for Aldergrove, with City Airport and Dublin booked as separate routes.",
    areas: ["Glengormley", "Sandyknowes", "Hightown", "Carnmoney", "Mallusk", "Rathcoole"],
    localNotes: [
      "Sandyknowes and Hightown Road are different Glengormley starts. Include the house number on Hightown.",
      "Mallusk units should name the reception or unit. A town-centre Glengormley pin is not the industrial estate.",
      "Whiteabbey is the Shore Road, not this junction. Use the Whiteabbey airport pages if that is the pickup.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newtownabbey", "whiteabbey"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The Sandyknowes start. Onto the M2 and out toward Aldergrove. Hightown and Mallusk are not the same side of the junction.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Leave the M2 junction toward the city and Sydenham. This is not the Whiteabbey Shore Road run.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "M2 then the M1/A1. Applicable M1 tolls are included. A reserved long transfer, not a local Sandyknowes hop.",
      },
    ],
  },
  {
    townSlug: "whiteabbey",
    name: "Whiteabbey",
    addressHint: "Whiteabbey",
    hubSlug: "whiteabbey-airport-taxis",
    title: "Whiteabbey Airport Taxi & Airport Transfers",
    h1: "Whiteabbey Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a Whiteabbey airport taxi to Belfast City, Belfast International or Dublin Airport. Fixed-price Shore Road transfers, quoted live online.",
    intro:
      "Whiteabbey is the Shore Road district between Belfast and Greenisland, and an airport taxi from here starts on the A2, not at Sandyknowes. Use this page to pick the terminal before you quote. Belfast City Airport is usually the nearer Belfast airport, along the lough toward Sydenham, which is why Hazelbank, the hospital area and Jordanstown are booked as shore pickups. Belfast International leaves that shore road and joins the M2 toward Aldergrove — the inland run, and a different page from Glengormley. Dublin Airport is the long southbound booking after you have come into Belfast, on the A1/M1, with applicable tolls included. Jordanstown is the next stretch of the A2 toward the university and should include the building if you are being collected from the campus. Greenisland is further toward Carrickfergus and is still collected when that is the address, with Carrickfergus timing rather than a Whiteabbey village pin. Rathcoole sits inland from the shore. Enter it as Rathcoole so the quote does not assume the A2. Glengormley has its own airport pages if you are starting at Sandyknowes.",
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
        text: "Leave the A2 and join the M2 toward Aldergrove. A shore-road start, not the Sandyknowes junction used from Glengormley.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Usually the nearer Belfast terminal. The A2 runs along the lough toward Sydenham. Jordanstown and Hazelbank sit on that line.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A2 into Belfast, then the A1/M1. Applicable M1 tolls are included. Greenisland adds minutes before you leave the shore.",
      },
    ],
  },
];

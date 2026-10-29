import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 6a town hubs — County Down south (Banbridge, Downpatrick, Newcastle), added Oct 2026.
 * Chooser pages only; the airport essays live on the child routes. No fares, mileages,
 * or journey-time claims.
 */
export const TOWN_HUB_BATCH_6A: TownHubContent[] = [
  {
    townSlug: "banbridge",
    name: "Banbridge",
    addressHint: "Banbridge",
    hubSlug: "banbridge-airport-taxis",
    title: "Banbridge Airport Taxi & Airport Transfers",
    seoTitle: "Banbridge & Dromore Airport Taxi | Fixed Price, 5★ Rated",
    h1: "Banbridge Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book an airport taxi from Banbridge, Dromore, Gilford or Rathfriland to Belfast International, Belfast City or Dublin Airport. Fixed fare from your door.",
    intro:
      "Banbridge sits on the A1 between Belfast and Newry, which makes it one of the few towns in Northern Ireland where all three airports are realistic choices. Use this page to pick the airport, then open that route for a fixed price from your own street. Belfast International means heading north on the A1 towards Sprucefield and then across country to Aldergrove. Belfast City Airport follows the A1 and M1 into Belfast and round to Sydenham, handy for short hops to Great Britain. Dublin Airport is straight down the A1 past Newry and onto the M1 in the Republic, with applicable tolls included in the fare. We collect from Banbridge itself and from Dromore, Gilford, Rathfriland, Loughbrickland and Scarva, including farm lanes and new estates off the bypass. Put in the full address rather than just the town, because a Rathfriland hillside pickup and a Banbridge town-centre pickup are priced as different journeys.",
    blurb:
      "Banbridge is on the A1 corridor — north to Belfast International and Belfast City, or south past Newry to Dublin Airport.",
    areas: ["Banbridge", "Dromore", "Gilford", "Rathfriland", "Loughbrickland", "Scarva"],
    localNotes: [
      "Rural addresses around Rathfriland and Loughbrickland: add the farm or house name and any lane directions so the driver finds the right gate.",
      "Dromore and Gilford are separate towns — enter that address so the quote prices the actual pickup, not Banbridge centre.",
      "Banbridge is one of the closer County Down towns to the Dublin road, so many customers compare Dublin Airport fares with the Belfast airports before booking.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newry", "lisburn", "hillsborough", "craigavon", "newcastle"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "North on the A1 towards Sprucefield, then across country to Aldergrove. Wide choice of holiday and low-cost flights.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A1 and M1 into Belfast, then round to Sydenham. Suits short flights to Great Britain; allow for the city section at peak times.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Straight down the A1 past Newry and onto the M1 south of the border. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
  {
    townSlug: "downpatrick",
    name: "Downpatrick",
    addressHint: "Downpatrick",
    hubSlug: "downpatrick-airport-taxis",
    title: "Downpatrick Airport Taxi & Airport Transfers",
    seoTitle: "Downpatrick & Ballynahinch Airport Taxi | Pre-Booked",
    h1: "Downpatrick Airport Taxi & Airport Transfers",
    metaDescription:
      "Airport taxis from Downpatrick, Ballynahinch, Saintfield and Killyleagh to Belfast City, Belfast International or Dublin Airport. Fixed price, booked ahead.",
    intro:
      "Downpatrick is the heart of St Patrick's country, and from Lecale or the Ballynahinch area every airport trip means getting through or around Belfast first, or heading west for Newry and the Dublin road. A pre-booked taxi takes that drive off your hands and saves paying for a week of airport parking. Choose your airport here, then open the route for a fixed price from your street. Belfast City Airport is usually the nearest, reached up the A7 through Crossgar and Saintfield and across the east of the city. Belfast International is further on, out past Belfast towards Aldergrove. Dublin Airport is the long southbound transfer towards Newry and then down the M1, with applicable tolls included in the fare. We collect from Downpatrick, Ballynahinch, Saintfield, Crossgar, Killyleagh and Ardglass, as well as the farms and townlands between them. Enter your full address so the quote reflects your exact pickup point.",
    blurb:
      "Downpatrick and the Lecale area — up the A7 to Belfast City and Belfast International, or west towards Newry for Dublin Airport.",
    areas: ["Downpatrick", "Ballynahinch", "Saintfield", "Crossgar", "Killyleagh", "Ardglass"],
    localNotes: [
      "Townland and farm addresses around Crossgar and Killyleagh: include the house name and any directions in the booking notes.",
      "Ardglass and the Lecale coast are priced from the village address, not from Downpatrick town centre.",
      "Ballynahinch and Saintfield customers sometimes find Belfast City Airport the easiest of the three — compare quotes before you book.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["newcastle", "carryduff", "comber", "newtownards", "banbridge"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "North on the A7, round Belfast and out towards Aldergrove. The longer of the two Belfast options, with the widest range of holiday routes.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Up the A7 through Crossgar, Saintfield and Carryduff, then across east Belfast to Sydenham. Often the handiest airport from Downpatrick.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "West towards Newry, then the A1 and M1 south. A long cross-border run; applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
  {
    townSlug: "newcastle",
    name: "Newcastle",
    addressHint: "Newcastle, County Down",
    hubSlug: "newcastle-airport-taxis",
    title: "Newcastle Airport Taxi & Airport Transfers",
    seoTitle: "Newcastle Co Down Airport Taxi | Mournes & Golf Transfers",
    h1: "Newcastle Airport Taxi & Airport Transfers",
    metaDescription:
      "Newcastle, Co Down airport taxis for Mourne walkers, golfers and locals. Fixed fares to Belfast International, Belfast City and Dublin Airport from your door.",
    intro:
      "Newcastle sits where the Mourne Mountains come down to the sea, under Slieve Donard and beside Royal County Down, so we drive locals, hillwalkers and visiting golfers to and from all three airports. This page helps you choose the airport; then open the route for a fixed price from your hotel, holiday let or home. Belfast City Airport is reached up the A24 through Clough and Ballynahinch into Belfast. Belfast International is the same road north, then out past the city towards Aldergrove, or via the A1 depending on traffic. Dublin Airport often surprises visitors: the A50 through Castlewellan to Banbridge, then the A1 and M1 south, with applicable tolls included in the fare. Golf groups with clubs and bags should mention them when booking so we send the right vehicle. We collect from Newcastle, Dundrum, Castlewellan, Annsborough and Clough. Enter the full address, including the hotel or cottage name, for an accurate quote.",
    blurb:
      "Newcastle, Co Down at the foot of the Mournes — the A24 north to the Belfast airports, or the A50 and A1 south to Dublin Airport.",
    areas: ["Newcastle", "Dundrum", "Castlewellan", "Annsborough", "Clough"],
    localNotes: [
      "Visiting golfers heading for Royal County Down: tell us how many sets of clubs and bags are travelling so the vehicle has room.",
      "Holiday cottages and caravan parks around Dundrum and the Mournes should include the property or park name.",
      "Castlewellan, Annsborough and Clough are separate pickups — enter that address so the quote matches your door.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["downpatrick", "banbridge", "newry", "carryduff"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "North on the A24 through Ballynahinch, then round Belfast towards Aldergrove. The longest of the Belfast runs from the Mournes.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "Up the A24 via Clough, Ballynahinch and Carryduff into Belfast, then across to Sydenham. Popular with golfers on short trips from Great Britain.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The A50 through Castlewellan to Banbridge, then the A1 and M1 south. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
];

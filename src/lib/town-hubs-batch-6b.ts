import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 6b town hubs — Armagh, Dungannon and Cookstown (Mid Ulster / Orchard County), added
 * Oct 2026. Chooser page only; the airport essays live on the child routes. No fares,
 * mileages, or journey-time claims.
 */
export const TOWN_HUB_BATCH_6B: TownHubContent[] = [
  {
    townSlug: "armagh",
    name: "Armagh",
    addressHint: "Armagh",
    hubSlug: "armagh-airport-taxis",
    title: "Armagh Airport Taxi & Airport Transfers",
    seoTitle: "Armagh City Airport Taxi to Belfast & Dublin | 5★",
    h1: "Armagh Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book an airport taxi from Armagh, Markethill, Richhill or Keady to Belfast International, Belfast City or Dublin Airport. Fixed price from your door. 5★ Google.",
    intro:
      "Armagh is the cathedral city of the Orchard County, and it sits almost halfway between the Belfast airports and Dublin, so it is one of the few places in Northern Ireland where all three airports are genuinely worth comparing. Use this page to pick the airport, then open that route for a fixed price from your own street. Belfast International means the A3 out through Richhill towards Portadown, the M1 east, then north across country to Aldergrove. Belfast City Airport follows the M1 the whole way into Belfast, then the Westlink and the M3 out to Sydenham. Dublin Airport is often the natural pick from Armagh: the A28 through Markethill to Newry, then south on the A1 and the M1, with applicable tolls included in the fare. We collect across Armagh city, Markethill, Richhill, Keady, Tandragee and Loughgall, including farms and rural roads. Enter the full address with the townland or house name so the quote prices your exact pickup.",
    blurb:
      "Armagh sits between the Belfast airports and Dublin — the A3 and M1 lead to Belfast International and Belfast City, and the A28 to Newry leads south to Dublin Airport.",
    areas: ["Armagh", "Markethill", "Richhill", "Keady", "Tandragee", "Loughgall"],
    localNotes: [
      "Rural pickups around Loughgall, Keady and Markethill: include the house name or townland so the driver finds the right lane.",
      "Richhill and Tandragee are priced from the village address, not from Armagh city centre.",
      "Staying near the cathedrals or the Mall? Give the street or hotel name so the pickup point is clear.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["craigavon", "newry", "dungannon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A3 through Richhill towards Portadown, the M1 east, then north to Aldergrove. Wide choice of holiday and low-cost flights.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The M1 all the way into Belfast, then the Westlink and M3 to Sydenham. Handy for short hops to Great Britain.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South on the A28 through Markethill to Newry, then the A1 and M1. Often a strong option from Armagh; applicable M1 tolls are included.",
      },
    ],
  },
  {
    townSlug: "dungannon",
    name: "Dungannon",
    addressHint: "Dungannon",
    hubSlug: "dungannon-airport-taxis",
    title: "Dungannon Airport Taxi & Airport Transfers",
    seoTitle: "Dungannon & Coalisland Airport Taxi | Fixed Price",
    h1: "Dungannon Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked airport taxis from Dungannon, Coalisland, Moy and Ballygawley to Belfast International, Belfast City and Dublin Airport. Fixed fare quoted from your street.",
    intro:
      "Dungannon sits at the western end of the M1, which makes it an easy place to start an airport run: the motorway leads straight towards Belfast, and the roads south lead towards Armagh and the border. Choose your airport on this page, then open the route to get a fixed price from your address. Belfast International is reached by heading east on the M1 and then north towards Aldergrove. Belfast City Airport means staying on the M1 right into Belfast, then taking the Westlink and the M3 to Sydenham. Dublin Airport is a longer reserved transfer south through Newry or, from the Clogher Valley side, through Monaghan, with any applicable M1 tolls included in the fare. We pick up in Dungannon, Coalisland, Moy, Donaghmore, Ballygawley and Aughnacloy, as well as the country roads between them. Type the full address, not just the town, because a Coalisland pickup and an Aughnacloy pickup are priced as different journeys.",
    blurb:
      "Dungannon is at the western end of the M1 — east to Belfast International and Belfast City, and south via Newry or Monaghan to Dublin Airport.",
    areas: ["Dungannon", "Coalisland", "Moy", "Donaghmore", "Ballygawley", "Aughnacloy"],
    localNotes: [
      "Ballygawley and Aughnacloy pickups are priced from the village address — enter it in full rather than Dungannon.",
      "Rural addresses around Donaghmore and Coalisland: add the house name or townland for the driver.",
      "Moy is a separate village on the road towards Armagh; quote from the Moy address itself.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["cookstown", "armagh", "craigavon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "East along the M1, then north to Aldergrove. The usual Belfast choice from Dungannon and the Clogher Valley.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The full length of the M1 into Belfast, then the Westlink and M3 to Sydenham. Allow for the city section at peak times.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South via Newry and the M1, or via Monaghan from the Aughnacloy side. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
  {
    townSlug: "cookstown",
    name: "Cookstown",
    addressHint: "Cookstown",
    hubSlug: "cookstown-airport-taxis",
    title: "Cookstown Airport Taxi & Airport Transfers",
    seoTitle: "Cookstown & Magherafelt Airport Taxi | Mid Ulster",
    h1: "Cookstown Airport Taxi & Airport Transfers",
    metaDescription:
      "Book an airport taxi from Cookstown, Magherafelt, Moneymore or Maghera to Belfast International, Belfast City or Dublin Airport. Mid Ulster door-to-door, fixed price.",
    intro:
      "Cookstown and Magherafelt are the heart of Mid Ulster, on the west side of Lough Neagh, so the airport you choose changes which way round the lough your driver goes. Start here to compare the three airports, then open the right route for a fixed price from your door. Belfast International is usually the closest: across to the A6 around the top of Lough Neagh via Toome, then on past Randalstown towards Antrim and Aldergrove. Belfast City Airport carries on into Belfast on the M22 and M2, then out to Sydenham, which suits short business trips. Dublin Airport means heading south instead, down the A29 to Dungannon and onto the M1, then the A1 past Newry, with applicable tolls included in the fare. We collect from Cookstown, Magherafelt, Moneymore, Maghera, Stewartstown and Pomeroy, plus the lough-shore townlands and farms. Enter your full address, including any house name, so the quote prices the right pickup.",
    blurb:
      "Cookstown and Magherafelt sit west of Lough Neagh — the A6 via Toome leads to Belfast International and Belfast City, and the A29 and M1 lead south to Dublin Airport.",
    areas: ["Cookstown", "Magherafelt", "Moneymore", "Maghera", "Stewartstown", "Pomeroy"],
    localNotes: [
      "Magherafelt and Maghera are separate towns with separate prices — check the address before you quote.",
      "Lough-shore and Sperrin-side pickups near Pomeroy or Stewartstown: include the house name or townland.",
      "Moneymore pickups are priced from the village address rather than Cookstown town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["dungannon", "antrim", "ballymena"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Over to the A6 at Toome, round the north of Lough Neagh past Randalstown, then on to Aldergrove. Usually the nearest airport.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A6, then the M22 and M2 into Belfast and across to Sydenham. A good fit for business flights to Great Britain.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South on the A29 to Dungannon, then the M1 and A1 past Newry. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
];

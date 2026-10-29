import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 6c town hubs — west and north (Omagh, Enniskillen, Derry, Ballycastle), added Oct 2026
 * for long-distance airport transfer searches. Chooser page only; the airport essays live on the
 * child routes. No fares, mileages, or journey-time claims.
 */
export const TOWN_HUB_BATCH_6C: TownHubContent[] = [
  {
    townSlug: "omagh",
    name: "Omagh",
    addressHint: "Omagh",
    hubSlug: "omagh-airport-taxis",
    title: "Omagh Airport Taxi & Airport Transfers",
    seoTitle: "Omagh & West Tyrone Airport Taxi | Fixed Price",
    h1: "Omagh Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-booked airport taxi from Omagh, Fintona, Dromore or Gortin to Belfast International, Belfast City or Dublin Airport. Fixed fare from your door across Tyrone.",
    intro:
      "Omagh is the county town of Tyrone and a long way west of the Belfast airports, so a pre-booked airport taxi takes the strain out of an early start and saves leaving a car at the terminal for a week. Pick your airport below, then open that route for a fixed price from your own street. Belfast International is reached by heading east across Tyrone, either over the A505 towards Cookstown or along the A5 and A4 to the M1. Belfast City Airport carries on along the M1 into Belfast and out to Sydenham, which suits short hops to Great Britain. Dublin Airport is the southbound run down the A5 through Ballygawley and Aughnacloy, then the N2 in the Republic, with any applicable tolls included in the fare. We collect from Omagh, Fintona, Dromore, Sixmilecross, Gortin and Beragh, including farms and rural addresses towards the Sperrins. Enter the full address with its postcode so the quote prices your exact door rather than the town centre.",
    blurb:
      "Omagh and west Tyrone sit on the A5 — east over the A505 or A4 to Belfast International and Belfast City, or south via Aughnacloy and the N2 to Dublin Airport.",
    areas: ["Omagh", "Fintona", "Dromore", "Sixmilecross", "Gortin", "Beragh"],
    localNotes: [
      "Rural pickups around Gortin and the Sperrin foothills should include the postcode and a landmark, as many lanes share a townland name.",
      "Dromore here is the County Tyrone village, not Dromore in County Down — enter the full Tyrone address so the quote prices the right place.",
      "Fintona, Sixmilecross and Beragh are priced from the village address rather than from Omagh town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["enniskillen", "derry", "craigavon"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "East across Tyrone over the A505 towards Cookstown, or the A5 and A4 to the M1, then on to Aldergrove. The quote maps the better line from your street.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A5 and A4 to Dungannon, the M1 into Belfast, then out to Sydenham. Good for business trips to Great Britain; allow for the city section.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South on the A5 through Ballygawley and Aughnacloy, then the N2 towards Dublin. Any applicable tolls are included in the fixed fare.",
      },
    ],
  },
  {
    townSlug: "enniskillen",
    name: "Enniskillen",
    addressHint: "Enniskillen",
    hubSlug: "enniskillen-airport-taxis",
    title: "Enniskillen Airport Taxi & Airport Transfers",
    seoTitle: "Enniskillen & Fermanagh Airport Taxi | Pre-Booked",
    h1: "Enniskillen Airport Taxi & Airport Transfers",
    metaDescription:
      "Book a Fermanagh airport taxi from Enniskillen, Irvinestown, Lisnaskea or Kesh to Belfast International, Belfast City or Dublin Airport. Fixed price, door to terminal.",
    intro:
      "Enniskillen sits between Upper and Lower Lough Erne at the western edge of Northern Ireland, so every airport from Fermanagh is a long transfer and booking a private car ahead is the easiest way to make a flight without a dawn drive or a week of parking. Choose the airport here, then open that route for a fixed price from your address. Belfast International and Belfast City Airport are both reached along the A4 through Fivemiletown, Augher and Ballygawley to Dungannon and the M1, with Belfast City carrying on through the city to Sydenham. Dublin Airport usually means heading south-east towards Cavan and taking the N3 and M3 into Dublin, with any applicable tolls included in the price. We collect from Enniskillen, Irvinestown, Lisnaskea, Belleek, Kesh and Ballinamallard, plus lakeside cottages, marinas and holiday parks around the loughs. Give the full address or property name, because a Belleek pickup and an Enniskillen town pickup are very different journeys.",
    blurb:
      "Enniskillen and the Fermanagh lakelands are long transfers — the A4 east to Belfast International and Belfast City, or south through Cavan on the N3 and M3 to Dublin Airport.",
    areas: ["Enniskillen", "Irvinestown", "Lisnaskea", "Belleek", "Kesh", "Ballinamallard"],
    localNotes: [
      "Lakeside cottages, marinas and holiday parks on Lough Erne should include the property or park name so the driver finds the right entrance.",
      "Belleek and Kesh are at the far end of Lower Lough Erne — enter the village address so the quote reflects that pickup.",
      "Lisnaskea and the Upper Lough Erne side are priced from your own address, not from Enniskillen town centre.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["omagh", "craigavon", "derry"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A4 east through Fivemiletown and Ballygawley to Dungannon, the M1 towards Belfast, then north to Aldergrove. A long but straightforward run.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The same A4 and M1 corridor, continuing through Belfast to Sydenham. Useful for short flights to Great Britain; allow for city traffic.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "Usually south-east towards Cavan, then the N3 and M3 into Dublin. Any applicable motorway tolls are included in the fixed fare.",
      },
    ],
  },
  {
    townSlug: "derry",
    name: "Derry",
    addressHint: "Derry~Londonderry",
    hubSlug: "derry-airport-taxis",
    title: "Derry Airport Taxi & Airport Transfers",
    seoTitle: "Derry~Londonderry Airport Taxi | Belfast & Dublin",
    h1: "Derry Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book a taxi from Derry~Londonderry, Limavady or Eglinton to Belfast International, Belfast City or Dublin Airport. Fixed long-distance fares from your door.",
    intro:
      "Derry, also known as Londonderry, is the main city of the north-west, and while City of Derry Airport at Eglinton is on the doorstep — we cover that too — many flights leave from Belfast or Dublin. A pre-booked airport taxi turns that long trip into one fixed fare from your door, without a bus change or a week of parking. Choose the airport below, then open that route for an exact price. Belfast International is reached on the A6 through Dungiven and over the Glenshane Pass, past Castledawson and Toome to the M22 and Antrim. Belfast City Airport follows the same road and continues down the M2 into Belfast and across to Sydenham. Dublin Airport is the long run south, often on the A5 through Strabane, Omagh and Aughnacloy to the N2, with any applicable tolls included. We collect from both sides of the Foyle, including the Cityside, the Waterside, Culmore, Strathfoyle, Eglinton and Limavady. Enter the full address so the quote prices your street.",
    blurb:
      "Derry~Londonderry and Limavady are long transfers — the A6 over the Glenshane Pass to Belfast International and Belfast City, or the A5 and N2 south to Dublin Airport. City of Derry Airport is covered too.",
    areas: ["Derry", "Londonderry", "Culmore", "Eglinton", "Limavady", "Strathfoyle"],
    localNotes: [
      "Cityside and Waterside pickups are both covered — give the full street address so the driver uses the right bridge.",
      "Limavady and Eglinton are priced from the village or town address rather than from Derry city centre.",
      "Flying from City of Derry Airport instead? Ask on WhatsApp or request a quote — we cover Eglinton as well as the Belfast and Dublin airports.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["coleraine", "omagh", "ballycastle"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "The A6 through Dungiven and over the Glenshane Pass, then Toome, the M22 and Antrim before Aldergrove. Usually the nearer Belfast airport from Derry.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A6 and M22, then the M2 into Belfast and across to Sydenham. Suits short business flights; the Belfast end needs allowing for at peak times.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "A long southbound run, often the A5 via Strabane and Omagh to the N2, or via Belfast and the M1. Any applicable tolls are included in the fare.",
      },
    ],
  },
  {
    townSlug: "ballycastle",
    name: "Ballycastle",
    addressHint: "Ballycastle",
    hubSlug: "ballycastle-airport-taxis",
    title: "Ballycastle Airport Taxi & Airport Transfers",
    seoTitle: "Ballycastle & Glens of Antrim Airport Taxi",
    h1: "Ballycastle Airport Taxi & Airport Transfers",
    metaDescription:
      "Airport taxi from Ballycastle, Bushmills, Ballymoney or the Glens of Antrim to Belfast International, Belfast City or Dublin Airport. Fixed price, booked ahead.",
    intro:
      "Ballycastle is on the north Antrim coast, where the Glens of Antrim meet the sea and the Rathlin ferry leaves the harbour, so reaching any airport means a long drive inland first. A pre-booked airport taxi gives you one fixed fare from your door and spares you a week of airport parking. Choose the airport here, then open that route for a price from your exact address. Belfast International is usually reached on the A44 past Armoy to the A26, then south through Ballymena towards Antrim and Aldergrove. Belfast City Airport follows the A26 and then the M2 into Belfast and across to Sydenham. Dublin Airport is the long cross-border trip via Belfast, the M1 and the A1, with applicable M1 tolls included in the fare. We collect from Ballycastle, Ballymoney, Bushmills, Armoy, Cushendall and Cushendun, including holiday cottages, hotels and Rathlin visitors coming off the ferry. Enter the full address, as a Glens pickup is priced differently from Ballycastle.",
    blurb:
      "Ballycastle, Bushmills and the Glens of Antrim are on the north coast — the A44 and A26 to Belfast International, the M2 to Belfast City, and the M1 south to Dublin Airport.",
    areas: ["Ballycastle", "Ballymoney", "Bushmills", "Armoy", "Cushendall", "Cushendun"],
    localNotes: [
      "Coming off the Rathlin Island ferry? Book a pickup at Ballycastle harbour and allow for the sailing time when you choose the collection time.",
      "Cushendall and Cushendun are Glens villages on the coast road — enter the village address so the quote prices that pickup.",
      "Holiday cottages and B&Bs around Bushmills and the Causeway coast should include the property name.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["coleraine", "ballymena", "larne"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "Inland on the A44 past Armoy, then the A26 through Ballymena towards Antrim and Aldergrove. The usual choice from the north Antrim coast.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A44 and A26 south, then the M2 into Belfast and over to Sydenham. Handy for short flights to Great Britain; allow for the city end.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The longest booking from the Glens: south through Belfast, then the M1 and A1 across the border. Applicable M1 tolls are included in the fare.",
      },
    ],
  },
];

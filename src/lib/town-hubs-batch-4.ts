import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 4 town hubs — Craigavon area (Portadown, Lurgan, Craigavon), added Oct 2026
 * for "airport transfers in Craigavon" searches. Chooser page only; the airport
 * essays live on the child routes. No fares, mileages, or journey-time claims.
 */
export const TOWN_HUB_BATCH_4: TownHubContent[] = [
  {
    townSlug: "craigavon",
    name: "Craigavon",
    addressHint: "Craigavon",
    hubSlug: "craigavon-airport-taxis",
    title: "Craigavon Airport Taxi & Airport Transfers",
    seoTitle: "Craigavon Airport Transfers & Taxi | Portadown, Lurgan | 5★",
    h1: "Craigavon Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book an airport taxi from Craigavon, Portadown or Lurgan to Belfast International, Belfast City or Dublin Airport. Fixed price from your door. 5★ on Google.",
    intro:
      "Craigavon, Portadown and Lurgan sit on the M1 corridor in County Armagh, which puts all three main airports within reach without a change of car. Start here to choose the airport, then open that route for the fixed price from your street. Belfast International is usually reached by leaving the M1 at Moira and heading north on the A26 towards Aldergrove, so it suits holiday and long-haul tickets out of Belfast. Belfast City Airport means staying on the M1 into Belfast and crossing to the Sydenham side, which works well for short business trips to Great Britain. Dublin Airport is the southbound option on the A1 and then the M1 in the Republic, with applicable tolls included in the fare. We collect from Portadown, Lurgan, Brownlow, Waringstown, Dollingstown and Magheralin. Enter the full address rather than only the town name, because a Portadown pickup and a Lurgan pickup are different journeys.",
    blurb:
      "Craigavon, Portadown and Lurgan are on the M1 corridor — handy for Belfast International via Moira, Belfast City through Belfast, and Dublin Airport via the A1.",
    areas: ["Craigavon", "Portadown", "Lurgan", "Brownlow", "Waringstown", "Dollingstown", "Magheralin"],
    localNotes: [
      "Portadown and Lurgan are separate pickups — enter the full street address so the quote uses the right one.",
      "Waringstown, Dollingstown and Magheralin are close to the M1 at Lurgan and Moira.",
      "Brownlow and the Craigavon lakes area are between the two towns; include the estate name.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["moira", "lisburn", "newry"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "East on the M1 to Moira, then north on the A26 to Aldergrove. The usual choice for holiday and long-haul flights from Belfast.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The M1 all the way into Belfast, then across to Sydenham. A good fit for short business flights; the Westlink is the part to allow time for.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "South on the A1 past Banbridge and Newry, then the M1 in the Republic. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
];

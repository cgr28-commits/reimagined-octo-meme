import type { TownHubContent } from "@/lib/town-transfer-types";

/**
 * Batch 5 town hubs — Causeway Coast (Coleraine, Portrush, Portstewart), added Oct 2026
 * for "taxi Coleraine to Belfast City Airport" searches. Chooser page only; the airport
 * essays live on the child routes. No fares, mileages, or journey-time claims.
 */
export const TOWN_HUB_BATCH_5: TownHubContent[] = [
  {
    townSlug: "coleraine",
    name: "Coleraine",
    addressHint: "Coleraine",
    hubSlug: "coleraine-airport-taxis",
    title: "Coleraine Airport Taxi & Airport Transfers",
    seoTitle: "Coleraine, Portrush & Portstewart Airport Taxi | 5★ Rated",
    h1: "Coleraine Airport Taxi & Airport Transfers",
    metaDescription:
      "Pre-book an airport taxi from Coleraine, Portrush or Portstewart to Belfast International, Belfast City or Dublin Airport. Fixed price from your door. 5★ Google.",
    intro:
      "Coleraine, Portrush and Portstewart sit on the Causeway Coast, the far end of the A26 from Belfast, so a pre-booked airport taxi saves a long early drive and a week of airport parking. Start here to choose the airport, then open that route for a fixed price from your street. Belfast International is the usual choice: the A26 south through Ballymoney and Ballymena towards Antrim and Aldergrove. Belfast City Airport means carrying on down the M2 into Belfast and across to Sydenham, which suits short business trips to Great Britain. Dublin Airport is the long southbound transfer via the M2, the M1 and the A1, with applicable tolls included in the fare. We collect from Coleraine, Portrush, Portstewart, Castlerock, Bushmills and Ballymoney, including holiday lets, caravan parks and the university campus. Enter the full address rather than only the town name, because a Portrush seafront pickup and a Coleraine town pickup are different journeys.",
    blurb:
      "Coleraine, Portrush and Portstewart are on the Causeway Coast — the A26 runs south to Belfast International, on to Belfast City via the M2, and to Dublin Airport via the M1 and A1.",
    areas: ["Coleraine", "Portrush", "Portstewart", "Castlerock", "Bushmills", "Ballymoney"],
    localNotes: [
      "Holiday lets and caravan parks in Portrush and Portstewart should include the park or property name so the driver finds the right door.",
      "Ulster University Coleraine students and staff: give the campus building or hall, not just the university.",
      "Bushmills and Castlerock are separate villages — enter the village address so the quote prices that pickup.",
    ],
    airportCodes: ["BFS", "BHD", "DUB"],
    relatedTownSlugs: ["ballymena", "antrim"],
    whichAirport: [
      {
        code: "BFS",
        label: "Belfast International",
        text: "South on the A26 through Ballymoney and Ballymena, then on towards Antrim and Aldergrove. The usual choice from the Causeway Coast.",
      },
      {
        code: "BHD",
        label: "Belfast City Airport",
        text: "The A26 then the M2 into Belfast and across to Sydenham. A good fit for short business flights; allow time for the city end of the run.",
      },
      {
        code: "DUB",
        label: "Dublin Airport",
        text: "The longest booking from this hub: A26, M2, then the M1 and A1 south. Applicable M1 tolls are included in the fixed fare.",
      },
    ],
  },
];

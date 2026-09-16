/** Shared locations page copy — used by the page and the quote bot. */

export const LOCATIONS_HUB_H1 = "Airport Taxi Locations Across Northern Ireland";

export const LOCATIONS_HUB_INTRO =
  "My Airport Taxi NI provides pre-booked airport transfers connecting towns across Northern Ireland with Belfast International Airport, George Best Belfast City Airport, Dublin Airport and City of Derry Airport. Choose a town below for local airport taxi pages, or keep scrolling for other destinations we cover.";

export const LOCATIONS_PAGE_INTRO =
  "Standard long-distance pickups are from Greater Belfast (plus Belfast International, Belfast City, City of Derry, and Dublin Airport). Destinations can be anywhere in Northern Ireland or the Republic of Ireland. Lists below are examples only — enter exact addresses on the quote form.";

export const LOCATIONS_ROI_EXAMPLES = [
  "Dublin city centre",
  "Dublin Airport (DUB)",
  "Cork",
  "Galway",
  "Limerick",
  "Donegal",
  "Sligo",
] as const;

export const LOCATIONS_AIRPORT_LINKS = [
  { label: "Belfast International (BFS)", href: "/airports/belfast-international/" },
  { label: "George Best Belfast City (BHD)", href: "/airports/belfast-city/" },
  { label: "Dublin Airport (DUB)", href: "/airports/dublin/" },
  { label: "City of Derry (LDY)", href: "/airports/city-of-derry/" },
] as const;

export const LOCATIONS_AIRPORT_EXAMPLES = LOCATIONS_AIRPORT_LINKS.map((item) => item.label);

export const LOCATIONS_LONG_DISTANCE_EXAMPLES = [
  "Belfast to Dublin city",
  "Bangor to Cork",
  "Lisburn to Galway",
  "Newtownabbey to Donegal",
] as const;

export const LOCATIONS_ROUTE_NOTE =
  "Example journeys from Greater Belfast pickups — not an exhaustive list, and not an offer of standalone pickups from the destination cities.";

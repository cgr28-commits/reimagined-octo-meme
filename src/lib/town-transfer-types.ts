export type LandingAirportCode = "BFS" | "BHD" | "DUB" | "LDY";

export type LandingFaq = {
  question: string;
  answer: string;
};

export type TownHubContent = {
  townSlug: string;
  name: string;
  addressHint: string;
  hubSlug: string;
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  blurb: string;
  areas: string[];
  localNotes: string[];
  airportCodes: LandingAirportCode[];
  /** Short chooser copy — hub purpose is “which airport?”, not the child route essay. */
  whichAirport: Array<{
    code: LandingAirportCode;
    label: string;
    text: string;
  }>;
};

export type TransferRouteContent = {
  slug: string;
  legacySlugs?: string[];
  townSlug: string;
  airportCode: LandingAirportCode;
  /** Quote prefill. Defaults to town → airport. */
  direction?: "to-airport" | "from-airport";
  title: string;
  h1: string;
  metaDescription: string;
  intro: string;
  journeyInfo: string;
  goingToAirport: string;
  fromAirport: string;
  whyBookIntro: string;
  localAreasText: string;
  faqs: LandingFaq[];
};

/**
 * Quote-tool journey intent — first question for progressive disclosure.
 */

export type QuoteJourneyIntent = "to-airport" | "from-airport" | "address-to-address";

export const QUOTE_JOURNEY_INTENT_OPTIONS: Array<{
  id: QuoteJourneyIntent;
  title: string;
  description: string;
}> = [
  {
    id: "to-airport",
    title: "To an Airport",
    description: "We’ll collect you and take you to the airport",
  },
  {
    id: "from-airport",
    title: "From an Airport",
    description: "We’ll meet you after landing and take you to your destination",
  },
  {
    id: "address-to-address",
    title: "Address to Address",
    description: "Door-to-door between two addresses",
  },
];

export const CUSTOMER_AIRPORTS = [
  { code: "BFS" as const, title: "Belfast International Airport", short: "Belfast International" },
  { code: "BHD" as const, title: "Belfast City Airport", short: "Belfast City" },
  { code: "LDY" as const, title: "City of Derry Airport", short: "City of Derry" },
  { code: "DUB" as const, title: "Dublin Airport", short: "Dublin Airport" },
];

export type CustomerAirportCode = (typeof CUSTOMER_AIRPORTS)[number]["code"];

export function isCustomerAirportCode(code: string | null | undefined): code is CustomerAirportCode {
  return CUSTOMER_AIRPORTS.some((airport) => airport.code === code);
}

export function intentFromDirection(direction: "to-airport" | "from-airport"): QuoteJourneyIntent {
  return direction;
}

export function isAirportIntent(intent: QuoteJourneyIntent | null | undefined): boolean {
  return intent === "to-airport" || intent === "from-airport";
}

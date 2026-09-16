/** Shared Belfast cruise-terminal service page copy — used by the page and the quote bot. */

export const CRUISE_TERMINAL_PATH = "/belfast-cruise-terminal-transfers/";

export const CRUISE_TERMINAL_H1 = "Belfast Cruise Terminal Transfers";

export const CRUISE_TERMINAL_SEO_TITLE = "Belfast Cruise Terminal Transfers | Cruise Port Taxi";

export const CRUISE_TERMINAL_SEO_DESCRIPTION =
  "Pre-book a private Belfast cruise transfer between Belfast Cruise Terminal, airports, hotels and onward destinations. Saloon or Estate for up to 4 passengers.";

export const CRUISE_TERMINAL_INTRO =
  "My Airport Taxi NI provides pre-booked private transfers for passengers arriving at or departing from Belfast Cruise Terminal. If you need a Belfast cruise port taxi after you leave the ship, or a morning collection from a hotel to the cruise port, we reserve a Saloon or Estate for your party rather than leaving you to find a car at the harbour.";

export const CRUISE_TERMINAL_WHATSAPP_MESSAGE =
  "Hi, I'd like a Belfast Cruise Terminal transfer. Ship name: , date: , passengers: , destination: ";

export const CRUISE_TERMINAL_JOURNEYS = [
  {
    title: "Belfast Cruise Terminal to Belfast International Airport",
    description:
      "A reserved private transfer from the cruise port to Aldergrove when you have an onward flight. Share the flight details when you enquire so we can plan a realistic departure from the terminal.",
    href: "/airports/belfast-international/",
    linkLabel: "Belfast International Airport guide",
  },
  {
    title: "Belfast Cruise Terminal to Belfast City Airport",
    description:
      "The shorter city-side airport run from the harbour to George Best Belfast City Airport. Useful for UK and short-haul connections after a cruise call.",
    href: "/airports/belfast-city/",
    linkLabel: "Belfast City Airport guide",
  },
  {
    title: "Belfast Cruise Terminal to Dublin Airport",
    description:
      "A longer reserved transfer south when your next flight is from Dublin Airport rather than Belfast. Tell us the Dublin terminal when you know it.",
    href: "/airports/dublin/",
    linkLabel: "Dublin Airport guide",
  },
  {
    title: "Cruise terminal to Belfast hotels",
    description:
      "A Belfast cruise ship transfer from the terminal to your hotel or other accommodation in the city, so you are not relying on a last-minute taxi after a long sailing.",
  },
  {
    title: "Hotels to Belfast Cruise Terminal",
    description:
      "Morning collections from Belfast hotels and guest accommodation to the cruise port, timed around your ship’s published departure rather than a guessed harbour rank.",
  },
  {
    title: "Other onward destinations",
    description:
      "Homes, towns and longer drop-offs across Northern Ireland can be arranged by enquiry when they are not an airport or city-hotel run.",
    href: "/long-distance-transfers/",
    linkLabel: "Long-distance transfers",
  },
] as const;

export const CRUISE_TERMINAL_BOOKING_DETAILS = [
  "Cruise ship name",
  "Cruise arrival or departure date",
  "Expected arrival or departure time",
  "Number of passengers",
  "Luggage requirements",
  "Onward flight details where you have a connecting airport transfer",
] as const;

export const CRUISE_TERMINAL_NOTES = [
  {
    title: "Meeting point",
    body: "We do not guarantee pickup immediately beside the ship. Cruise berth and pedestrian access arrangements can change with each call, so the precise meeting point is confirmed where necessary before travel.",
  },
  {
    title: "Time to an onward flight",
    body: "If you are flying after you disembark, allow a generous gap between the scheduled ship arrival and check-in. Disembarkation can run later than the published time, and we cannot guarantee how quickly passengers will be cleared to leave the terminal.",
  },
  {
    title: "Vehicle and passengers",
    body: "The online service is for up to 4 passengers, in a Saloon or Estate, subject to luggage capacity. Suitcases from a week at sea often decide the car before the passenger count does.",
  },
  {
    title: "How to book",
    body: "Cruise-terminal collections are arranged by enquiry so we can confirm the meeting point and timing. WhatsApp or the contact page is the most reliable start. The homepage quote tool remains available for standard airport transfers once you have an address and flight time.",
  },
] as const;

export const CRUISE_TERMINAL_FAQS = [
  {
    question: "Do you meet passengers beside the ship?",
    answer:
      "Not as a guaranteed meeting point. Belfast Cruise Terminal berth and access arrangements can vary, so we confirm the precise pickup location with you before travel.",
  },
  {
    question: "What information do you need for a Belfast cruise transfer?",
    answer:
      "Please send the ship name, arrival or departure date and expected time, passenger numbers, luggage, and any onward flight details. That lets us plan the meeting point and a realistic departure.",
  },
  {
    question: "How many passengers can travel?",
    answer:
      "The online service is for up to 4 passengers, subject to luggage, in a Saloon or Estate. We do not operate a people carrier, minibus or coach for this service.",
  },
  {
    question: "Can I book a Belfast Cruise Terminal transfer to the airport?",
    answer:
      "Yes. We arrange private transfers from Belfast Cruise Terminal to Belfast International Airport, George Best Belfast City Airport and Dublin Airport. Message us with the ship and flight details so the timing can be planned around disembarkation.",
  },
  {
    question: "Do you offer shore excursions or sightseeing from the cruise port?",
    answer:
      "No. This page is for pre-booked private transfers only — airport, hotel and onward destination journeys. We do not sell shore excursions or sightseeing tours.",
  },
] as const;

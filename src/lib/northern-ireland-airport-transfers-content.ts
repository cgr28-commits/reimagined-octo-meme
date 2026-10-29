/**
 * /airport-transfers-northern-ireland/ — the "airport transfers Northern Ireland" page.
 * Chooser for all four airports and every town hub. No fares, mileages or journey times.
 */
export const NI_TRANSFERS_PATH = "/airport-transfers-northern-ireland/";
export const NI_TRANSFERS_SEO_TITLE = "Airport Transfers Northern Ireland | Fixed-Price Airport Taxi";
export const NI_TRANSFERS_H1 = "Airport Transfers Across Northern Ireland";
export const NI_TRANSFERS_DESCRIPTION =
  "Pre-booked airport transfers from anywhere in Northern Ireland to Belfast International, Belfast City, Dublin and City of Derry airports. Fixed price, flight monitoring, free cancellation up to 24 hours.";

export const NI_TRANSFERS_INTRO =
  "My Airport Taxi NI is a pre-booked, private airport transfer service covering all six counties — from Belfast and the Causeway Coast to Fermanagh, Tyrone, Armagh and Down. Choose your airport or your town below, or put your exact pickup into the quote box for a fixed price before you book. Every journey is a private car or 7-seater for your party only, with the price agreed up front, not a meter.";

export const NI_TRANSFERS_INCLUDED: Array<{ title: string; text: string }> = [
  { title: "Fixed price", text: "The price you book is the price you pay — it won't change with traffic or delays." },
  { title: "Pre-booked driver", text: "Your driver is arranged in advance, in a modern, high-spec saloon, estate or 7-seater." },
  { title: "Flight monitoring", text: "Add your flight number and we track your landing. Airport pickups include up to 60 minutes' waiting." },
  { title: "Free cancellation", text: "Cancel at least 24 hours before pickup for a full refund, so you can book with confidence." },
];

export const NI_TRANSFERS_AIRPORT_NOTES: Record<"BFS" | "BHD" | "DUB" | "LDY", string> = {
  BFS: "Northern Ireland's main airport at Aldergrove — holiday, long-haul and most low-cost routes.",
  BHD: "George Best Belfast City by the harbour — short business and Great Britain flights.",
  DUB: "Ireland's largest airport, with the widest choice of long-haul and European flights. Applicable tolls are included.",
  LDY: "City of Derry Airport at Eglinton — handy for the north-west, Derry and the Causeway Coast.",
};

export const NI_TRANSFERS_FAQS: Array<{ question: string; answer: string }> = [
  {
    question: "Do you cover the whole of Northern Ireland?",
    answer:
      "Yes. We collect from towns and villages across all six counties — Antrim, Down, Armagh, Tyrone, Fermanagh and Londonderry — and take you to Belfast International, Belfast City, Dublin or City of Derry Airport. Use the quote box with your full address for a fixed price.",
  },
  {
    question: "How much is an airport transfer in Northern Ireland?",
    answer:
      "It depends on your exact pickup address, the airport and the vehicle, so we don't publish one price for everywhere. Enter your street or postcode in the quote box and you'll see the fixed price before you book, with applicable airport charges and tolls included.",
  },
  {
    question: "Which airport is best from my town?",
    answer:
      "Belfast International suits most holiday and long-haul flights, Belfast City suits short trips to Great Britain, Dublin has the widest choice of flights, and City of Derry suits the north-west. Open your town's page below for a short guide to each airport from there.",
  },
  {
    question: "Can you collect me from the airport when I land?",
    answer:
      "Yes. Book the collection with your flight number and we monitor your landing time where possible. Airport pickups include up to 60 minutes' complimentary waiting, and at Dublin Airport your driver meets you in Arrivals.",
  },
  {
    question: "Do you have larger vehicles for families and groups?",
    answer:
      "Yes — saloons for up to 4 passengers, estates for extra luggage, and 7-seaters for larger families and groups. Choose the vehicle on the quote form and the fixed price updates to match.",
  },
  {
    question: "Can I cancel if my plans change?",
    answer:
      "Cancel at least 24 hours before your pickup for a full refund of the amount paid. Cancellations inside 24 hours are non-refundable.",
  },
];

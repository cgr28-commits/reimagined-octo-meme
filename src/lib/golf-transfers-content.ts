/**
 * Golf transfers landing page (Royal Portrush, Portstewart, Castlerock, Royal County Down).
 * Copy only describes existing services: fixed-price private transfers, Business Class
 * (Mercedes, BMW, Lexus or similar, 1–3 passengers) and the 7-seater for groups.
 * It does not add a fare, vehicle or luggage rule.
 */

export const GOLF_TRANSFERS_PATH = "/golf-transfers-northern-ireland/";

export const GOLF_TRANSFERS_H1 = "Golf Transfers in Northern Ireland";

export const GOLF_TRANSFERS_SEO_TITLE = "Golf Transfers to Royal Portrush & Royal County Down | Business Class";

export const GOLF_TRANSFERS_SEO_DESCRIPTION =
  "Private golf transfers from Belfast, Derry and Dublin airports to Royal Portrush, Portstewart, Castlerock and Royal County Down. Business Class executive cars and 7-seaters, fixed fares.";

export const GOLF_TRANSFERS_WHATSAPP =
  "Hi, I'd like a quote for a golf transfer. Course: , dates: , number of golfers and golf bags: ";

export const GOLF_HERO_CREDIT = {
  text: "Royal Portrush and Whiterocks beach — photo by Adam Montgomery on Unsplash",
  sourceUrl: "https://unsplash.com/photos/VkUgPt4AVWs",
} as const;

export const GOLF_COURSES = [
  {
    name: "Royal Portrush",
    area: "Portrush, Causeway Coast",
    note: "Dunluce Links and Valley Links. Host of The Open in 1951, 2019 and 2025.",
  },
  {
    name: "Portstewart Golf Club",
    area: "Portstewart, Causeway Coast",
    note: "Links golf just along the coast from Portrush.",
  },
  {
    name: "Castlerock Golf Club",
    area: "Castlerock, Causeway Coast",
    note: "Often played on the same trip as Royal Portrush and Portstewart.",
  },
  {
    name: "Royal County Down",
    area: "Newcastle, County Down",
    note: "Links golf beneath the Mourne Mountains, south of Belfast.",
  },
] as const;

export const GOLF_BUSINESS_CLASS_POINTS = [
  "Premium executive car — Mercedes, BMW, Lexus or similar",
  "Carries 1–3 passengers",
  "Luggage assistance and complimentary bottled water",
  "Fixed fare confirmed before you book",
  "Flight monitoring on airport pickups",
] as const;

export const GOLF_GROUP_POINTS = [
  "7-seater for larger groups travelling together",
  "One vehicle for the whole group and their luggage",
  "Same fixed-price booking and flight monitoring",
] as const;

export const GOLF_FAQS = [
  {
    question: "Can you collect us from the airport and take us straight to the course or hotel?",
    answer:
      "Yes. We collect from Belfast International, George Best Belfast City, City of Derry and Dublin Airport and take you directly to your hotel or the course. Your fare is fixed when you book and we monitor your flight.",
  },
  {
    question: "Will our golf bags fit?",
    answer:
      "Golf bags take more room than suitcases. Tell us how many golf bags you have in your booking notes or on WhatsApp and we will confirm the right vehicle before your trip. Groups with several bags usually travel best in the 7-seater.",
  },
  {
    question: "What is Business Class?",
    answer:
      "A premium executive car — a Mercedes, BMW, Lexus or similar — for 1–3 passengers, with luggage assistance and complimentary bottled water. You choose it under Vehicle options when you get a quote.",
  },
  {
    question: "Can you drive us to a different course each day?",
    answer:
      "Yes. For several days of golf or a round trip to the course, message us with your plans and we will give you a fixed price for the whole trip.",
  },
  {
    question: "Can we cancel if our plans change?",
    answer: "Yes. You can cancel up to 24 hours before pickup for a full refund.",
  },
] as const;

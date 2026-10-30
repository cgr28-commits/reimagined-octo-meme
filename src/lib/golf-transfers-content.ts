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
  "Private golf transfers to Royal Portrush, Royal County Down, Portstewart and Ireland's top courses, from Belfast, Derry and Dublin airports. Business Class cars and 7-seaters, fixed fares.";

export const GOLF_TRANSFERS_WHATSAPP =
  "Hi, I'd like a quote for a golf transfer. Course: , dates: , number of golfers and golf bags: ";

export const GOLF_HERO_CREDIT = {
  text: "Royal Portrush and Whiterocks beach — photo by Adam Montgomery on Unsplash",
  sourceUrl: "https://unsplash.com/photos/VkUgPt4AVWs",
} as const;

export type GolfCourse = { name: string; area: string; note: string };

/** Northern Ireland — the courses visiting golfers ask for most. */
export const GOLF_COURSES_NI: readonly GolfCourse[] = [
  { name: "Royal Portrush", area: "Portrush, Co Antrim", note: "Dunluce Links and Valley Links. Host of The Open in 1951, 2019 and 2025." },
  { name: "Royal County Down", area: "Newcastle, Co Down", note: "Championship links beneath the Mourne Mountains." },
  { name: "Portstewart Golf Club", area: "Portstewart, Co Londonderry", note: "Strand course through towering dunes, just along the coast from Portrush." },
  { name: "Castlerock Golf Club", area: "Castlerock, Co Londonderry", note: "Mussenden links, often played on the same trip as Portrush and Portstewart." },
  { name: "Ardglass Golf Club", area: "Ardglass, Co Down", note: "Clifftop holes right on the Irish Sea." },
  { name: "Royal Belfast", area: "Holywood, Co Down", note: "Ireland's oldest golf club, on the shores of Belfast Lough." },
  { name: "Malone Golf Club", area: "Belfast", note: "Parkland golf a short drive from the city centre." },
  { name: "Galgorm Castle", area: "Ballymena, Co Antrim", note: "Parkland championship course on the Galgorm estate." },
  { name: "Lough Erne Resort", area: "Enniskillen, Co Fermanagh", note: "Faldo-designed course between two lakes." },
  { name: "Clandeboye Golf Club", area: "Bangor, Co Down", note: "Two courses on the Clandeboye estate in North Down." },
];

/** Republic of Ireland — long-distance golf transfers from Belfast and the airports. */
export const GOLF_COURSES_ROI: readonly GolfCourse[] = [
  { name: "Portmarnock", area: "Co Dublin", note: "Classic links on a peninsula north of Dublin." },
  { name: "Royal Dublin", area: "Bull Island, Dublin", note: "Links golf minutes from Dublin city." },
  { name: "The European Club", area: "Brittas Bay, Co Wicklow", note: "Rugged modern links on the Wicklow coast." },
  { name: "The K Club", area: "Straffan, Co Kildare", note: "Host of the 2006 Ryder Cup." },
  { name: "Adare Manor", area: "Adare, Co Limerick", note: "Host venue for the 2027 Ryder Cup." },
  { name: "Ballyliffin", area: "Inishowen, Co Donegal", note: "Two links courses on Ireland's most northerly peninsula." },
  { name: "Rosapenna", area: "Downings, Co Donegal", note: "Several links courses in the dunes of Sheephaven Bay." },
  { name: "County Sligo (Rosses Point)", area: "Co Sligo", note: "Links beneath Benbulben on the west coast." },
  { name: "Lahinch", area: "Co Clare", note: "Famous links on the Atlantic coast." },
  { name: "Ballybunion", area: "Co Kerry", note: "Old Course links above the Atlantic." },
  { name: "Waterville", area: "Co Kerry", note: "Links on the Ring of Kerry." },
  { name: "Old Head of Kinsale", area: "Co Cork", note: "Clifftop golf on a headland surrounded by the sea." },
];

/** Kept for the Courses section heading count / older imports. */
export const GOLF_COURSES = GOLF_COURSES_NI;

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

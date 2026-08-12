import { withBasePath } from "./paths";

export const SITE = {
  name: "My Airport Taxi NI",
  tagline: "Airport and long-distance private transfers across Northern Ireland",
  landline: "+442896022952",
  landlineDisplay: "028 9602 2952",
  whatsapp: "447549815538",
  whatsappUsername: "belfasttaxi",
  whatsappDefaultMessage: "Hi, I'd like some help.",
  email: "bookings@myairporttaxini.co.uk",
  url: "https://www.myairporttaxini.co.uk",
} as const;

/**
 * Soft-disable public services without deleting code.
 * Set a flag back to true to restore nav, homepage sections, and routes.
 */
export const SERVICE_FLAGS = {
  dayTrips: false,
  chauffeur: false,
  /** Address-to-address quoting UI — code retained in QuoteCard. */
  addressToAddress: true,
  /** George Best Belfast City Airport (BHD). */
  belfastCityAirport: true,
  /** Public tracking demo hub + owner/driver demo links. */
  trackingDemo: false,
  /**
   * Customer SumUp “Pay now” on the website for instant-price vehicles
   * (Standard Saloon / Estate) when pickup is at least 12 hours ahead.
   * Nearer trips and enquiry/request-quote vehicles still use Request to book.
   */
  customerSumUpPay: true,
  /** Live driver tracking marketing + customer track links — soft-hidden until more testing. */
  liveDriverTracking: false,
  /** Public driver dashboard — soft-hidden; drivers confirm jobs by email instead. */
  driverDashboard: false,
} as const;

export type ServiceFlagKey = keyof typeof SERVICE_FLAGS;

export const ALL_NAV_LINKS = [
  { label: "Airports", href: "/#airports", service: null },
  { label: "Long-Distance Transfers", href: "/long-distance-transfers/", service: "addressToAddress" as const },
  { label: "Locations", href: "/locations/", service: "addressToAddress" as const },
  { label: "Day Trips", href: "/tours/", service: "dayTrips" as const },
  { label: "Vehicles", href: "/#vehicles", service: null },
  { label: "Chauffeur", href: "/#chauffeur", service: "chauffeur" as const },
  { label: "Check Flights", href: "/#flight-status", service: null },
  { label: "Driver Tracking", href: "/#driver-tracking", service: "liveDriverTracking" as const },
  { label: "Areas We Cover", href: "/#areas", service: null },
  { label: "Why Us", href: "/#why-us", service: null },
  { label: "FAQ", href: "/#faq", service: null },
] as const;

function isServiceEnabled(service: ServiceFlagKey | null): boolean {
  if (!service) {
    return true;
  }
  return SERVICE_FLAGS[service];
}

/** Public nav — filtered by SERVICE_FLAGS (code for hidden services is retained). */
export const NAV_LINKS = ALL_NAV_LINKS.filter((link) => isServiceEnabled(link.service)).map(
  ({ label, href }) => ({ label, href }),
);

/** Always visible on mobile — key services beyond airport transfers. */
export const ALL_MOBILE_QUICK_LINKS = [
  { label: "Day Trips", href: "/tours/", service: "dayTrips" as const },
  { label: "Chauffeur Hire", href: "/#chauffeur", service: "chauffeur" as const },
  { label: "Airports", href: "/#airports", service: null },
  { label: "Get a Quote", href: "/#quote", highlight: true, service: null },
] as const;

export const MOBILE_QUICK_LINKS = ALL_MOBILE_QUICK_LINKS.filter((link) =>
  isServiceEnabled(link.service),
).map(({ label, href, ...rest }) => ({
  label,
  href,
  ...("highlight" in rest ? { highlight: rest.highlight } : {}),
}));

export const ALL_FLIGHT_AIRPORTS = [
  {
    code: "BFS",
    name: "Belfast International",
    subtitle: "Aldergrove",
    officialUrl: "https://www.belfastairport.com/flights/live-flight-information/",
    arrivalsUrl: "https://www.belfastairport.com/flights/arrivals",
    departuresUrl: "https://www.belfastairport.com/flights/departures",
  },
  {
    code: "BHD",
    name: "George Best Belfast City",
    subtitle: "The Heart of Belfast",
    officialUrl: "https://www.belfastcityairport.com/Flight-Info",
    arrivalsUrl: "https://www.belfastcityairport.com/Flight-Info/Arrivals",
    departuresUrl: "https://www.belfastcityairport.com/Flight-Info/Departures",
  },
  {
    code: "DUB",
    name: "Dublin Airport",
    subtitle: "Cross-border transfers",
    officialUrl: "https://www.dublinairport.com/flight-information",
    arrivalsUrl: "https://www.dublinairport.com/flight-information/live-arrivals",
    departuresUrl: "https://www.dublinairport.com/flight-information/live-departures",
  },
  {
    code: "LDY",
    name: "City of Derry",
    subtitle: "Derry~Londonderry",
    officialUrl: "https://www.cityofderryairport.com/flight-information/live-flight-information/",
    arrivalsUrl: "https://www.cityofderryairport.com/flight-information/live-flight-information/",
    departuresUrl: "https://www.cityofderryairport.com/flight-information/live-flight-information/",
  },
] as const;

/** Public flight-status airports — BHD soft-hidden via SERVICE_FLAGS.belfastCityAirport. */
export const FLIGHT_AIRPORTS = ALL_FLIGHT_AIRPORTS.filter(
  (airport) => SERVICE_FLAGS.belfastCityAirport || airport.code !== "BHD",
);

export const ALL_HERO_SLIDES = [
  {
    airportCode: "BFS",
    title: "Belfast International Airport Transfers",
    subtitle:
      "Reliable transfers to and from Aldergrove (BFS) with flight tracking, meet & greet, and 60 minutes complimentary waiting time.",
    image: withBasePath("/images/hero/antrim-coast.jpg"),
    alt: "Giant's Causeway and the Antrim Coast under blue skies",
    imageClass:
      "hero-photo max-md:scale-[0.88] max-md:origin-center max-md:[object-position:center_40%] md:[object-position:center_center]",
  },
  {
    airportCode: "BFS",
    title: "Belfast International Airport Transfers",
    subtitle:
      "Reliable transfers to and from Aldergrove (BFS) with flight tracking, meet & greet, and 60 minutes complimentary waiting time.",
    image: withBasePath("/images/hero/giants-causeway.jpg"),
    alt: "Basalt columns at the Giant's Causeway, County Antrim",
    imageClass:
      "hero-photo max-md:scale-[0.9] max-md:origin-center max-md:[object-position:center_35%] md:[object-position:center_45%]",
  },
  {
    airportCode: "BHD",
    title: "Belfast City Airport Transfers",
    subtitle:
      "Quick transfers to George Best Belfast City Airport (BHD) — ideal for business trips and short-haul flights.",
    image: withBasePath("/images/hero/titanic-belfast.jpg"),
    alt: "Titanic Belfast museum in the Titanic Quarter",
    imageClass:
      "hero-photo max-md:scale-[0.88] max-md:origin-center max-md:[object-position:center_35%] md:[object-position:center_center]",
  },
  {
    airportCode: "BHD",
    title: "Belfast City Airport Transfers",
    subtitle:
      "Quick transfers to George Best Belfast City Airport (BHD) — ideal for business trips and short-haul flights.",
    image: withBasePath("/images/hero/harland-wolff-cranes.jpg"),
    alt: "Harland and Wolff Samson and Goliath cranes, Belfast",
    imageClass:
      "hero-photo max-md:scale-[0.9] max-md:origin-center max-md:[object-position:center_45%] md:[object-position:center_center]",
  },
  {
    airportCode: "DUB",
    title: "Dublin Airport Transfers",
    subtitle:
      "Comfortable cross-border transfers to Dublin Airport (DUB) with experienced drivers from Northern Ireland.",
    image: withBasePath("/images/hero/dublin-beckett-bridge.jpg"),
    alt: "Samuel Beckett Bridge over the River Liffey, Dublin",
    imageClass:
      "hero-photo max-md:scale-[0.88] max-md:origin-center max-md:[object-position:center_30%] md:[object-position:center_35%]",
  },
  {
    airportCode: "DUB",
    title: "Dublin Airport Transfers",
    subtitle:
      "Comfortable cross-border transfers to Dublin Airport (DUB) with experienced drivers from Northern Ireland.",
    image: withBasePath("/images/hero/dublin-custom-house.jpg"),
    alt: "The Custom House on the River Liffey, Dublin",
    imageClass:
      "hero-photo max-md:scale-[0.9] max-md:origin-center max-md:[object-position:center_40%] md:[object-position:center_center]",
  },
  {
    airportCode: "LDY",
    title: "City of Derry Airport Transfers",
    subtitle:
      "Transfers between City of Derry Airport (LDY) and the greater Belfast area — departures from Bangor and Belfast, or meet & greet at LDY arrivals.",
    image: withBasePath("/images/hero/derry-guildhall.jpg"),
    alt: "Derry Guildhall in Guildhall Square",
    imageClass:
      "hero-photo max-md:scale-[0.88] max-md:origin-center max-md:[object-position:center_22%] md:[object-position:center_30%]",
  },
  {
    airportCode: "LDY",
    title: "City of Derry Airport Transfers",
    subtitle:
      "Transfers between City of Derry Airport (LDY) and the greater Belfast area — departures from Bangor and Belfast, or meet & greet at LDY arrivals.",
    image: withBasePath("/images/hero/derry-st-columbs.jpg"),
    alt: "St Columb's Cathedral above the Derry city walls",
    imageClass:
      "hero-photo max-md:scale-[0.9] max-md:origin-center max-md:[object-position:center_35%] md:[object-position:center_40%]",
  },
] as const;

/** Public hero slides — BHD soft-hidden via SERVICE_FLAGS.belfastCityAirport. */
export const HERO_SLIDES = ALL_HERO_SLIDES.filter(
  (slide) => SERVICE_FLAGS.belfastCityAirport || slide.airportCode !== "BHD",
);

/**
 * Single hero image for the homepage (faster load; H1 stays permanent).
 * Prefer the Antrim Coast landmark — strong Northern Ireland atmosphere.
 */
export const HERO_IMAGE = {
  image: withBasePath("/images/hero/antrim-coast.jpg"),
  alt: "Giant's Causeway and the Antrim Coast under blue skies",
  imageClass:
    "hero-photo max-md:scale-[0.88] max-md:origin-center max-md:[object-position:center_40%] md:[object-position:center_center]",
} as const;

/** Full airport catalogue (includes BHD for restore / pricing engine). */
export const ALL_AIRPORTS = [
  {
    code: "BFS",
    name: "Belfast International",
    basePrice: 45,
    distance: "From £45",
    duration: "~30 min from Belfast",
    mapLabel: "Belfast International Airport, Aldergrove, UK",
    mapLocation: { lat: 54.6575, lng: -6.2158 },
    description:
      "Direct transfers to and from Aldergrove with live flight monitoring and complimentary waiting time.",
  },
  {
    code: "BHD",
    name: "George Best Belfast City",
    basePrice: 35,
    distance: "From £35",
    duration: "~15 min from city centre",
    mapLabel: "George Best Belfast City Airport, Belfast, UK",
    mapLocation: { lat: 54.6181, lng: -5.8724 },
    description:
      "Quick, convenient transfers to the heart of Belfast — ideal for business and short-haul flights.",
  },
  {
    code: "DUB",
    name: "Dublin Airport",
    basePrice: 180,
    distance: "From £180",
    duration: "~2 hrs from Belfast",
    mapLabel: "Dublin Airport, Ireland",
    mapLocation: { lat: 53.4213, lng: -6.2701 },
    description:
      "Comfortable cross-border transfers with experienced drivers who know every route and checkpoint.",
  },
  {
    code: "LDY",
    name: "City of Derry",
    basePrice: 35,
    distance: "From £140",
    duration: "Belfast area ↔ Derry Airport",
    mapLabel: "City of Derry Airport, Airport Road, Eglinton, UK",
    mapLocation: { lat: 55.0428, lng: -7.1611 },
    description:
      "Transfers between City of Derry Airport and the greater Belfast area — departures from Bangor, Belfast, Lisburn and surrounds, or meet & greet at LDY arrivals heading east.",
  },
] as const;

/** Public airports — BHD soft-hidden via SERVICE_FLAGS.belfastCityAirport. */
export const AIRPORTS = ALL_AIRPORTS.filter(
  (airport) => SERVICE_FLAGS.belfastCityAirport || airport.code !== "BHD",
);

/** Lowest public “From £X” marketing price (keeps footer / meta aligned with the quote tool). */
export function getLowestAirportFromPrice(): number {
  const prices = AIRPORTS.map((airport) => {
    const match = /£(\d+)/.exec(airport.distance);
    return match ? Number(match[1]) : airport.basePrice;
  });
  return Math.min(...prices);
}

export const LOWEST_AIRPORT_FROM_PRICE = getLowestAirportFromPrice();

export const AREAS = [
  "Belfast City Centre",
  "Lisburn",
  "Bangor",
  "Newtownabbey",
  "Holywood",
  "Carrickfergus",
  "Antrim",
  "Ballyclare",
  "Ballymena",
  "Coleraine",
  "Derry / Londonderry",
  "Newry",
  "Armagh",
  "Portadown",
  "Lurgan",
  "Downpatrick",
  "Newcastle",
  "Larne",
  "Banbridge",
  "Enniskillen",
  "Omagh",
  "Cookstown",
  "Newtownards",
  "Comber",
  "Dundonald",
  "Hillsborough",
] as const;

export const WHY_CHOOSE_US = [
  {
    title: "Live flight tracking",
    description:
      "We monitor your flight in real time and adjust pickup times for delays or early arrivals at no extra cost.",
  },
  {
    title: "Live driver tracking",
    description:
      "Pay online and receive a tracking link with your invoice. On travel day, follow your driver's live location when they're on the way to you.",
  },
  {
    title: "Meet & greet included",
    description:
      "Your driver meets you at arrivals with a name board — no searching for a taxi rank after a long flight.",
  },
  {
    title: "60 minutes free waiting",
    description:
      "Complimentary waiting time after landing is included, along with airport parking charges.",
  },
  {
    title: "Clear upfront quotes",
    description:
      "Get a personalised quote via WhatsApp before you travel. All quotes include fuel, tolls, and your driver.",
  },
  {
    title: "24/7, 365 days a year",
    description:
      "Early morning and late-night transfers are our speciality — including bank holidays and Christmas.",
  },
  {
    title: "Licensed & insured transport",
    description:
      "Licensed and insured private hire in saloon and estate cars for up to four passengers — with an executive saloon option available on enquiry.",
  },
] as const;

export const DRIVER_TRACKING_HIGHLIGHTS = [
  {
    title: "Included with online payment",
    description:
      "When you pay by card through our website, your invoice email includes a personal tracking link — at no extra charge.",
  },
  {
    title: "Active on travel day",
    description:
      "The link is ready when you book, but live tracking opens on the day of your transfer, from about two hours before pickup.",
  },
  {
    title: "See your driver en route",
    description:
      "Once your driver starts sharing their location, you can follow them on a map — ideal for airport pickups and early-morning transfers.",
  },
] as const;

export const CHAUFFEUR_SERVICES = [
  {
    title: "Business travel",
    description:
      "Discreet, punctual transport for meetings, conferences, and corporate clients across Belfast and Northern Ireland.",
  },
  {
    title: "Airport & executive runs",
    description:
      "Premium airport transfers and executive journeys with flight monitoring, meet & greet, and complimentary waiting time.",
  },
  {
    title: "Events & special occasions",
    description:
      "Weddings, celebrations, and nights out — your driver on hand for pickups and drop-offs when you need them.",
  },
  {
    title: "As-directed hire",
    description:
      "Hourly or full-day private hire with multiple stops. Tell us your plans and we will quote for the journey.",
  },
] as const;

export const FAQS = [
  {
    question: "How do I book an airport transfer?",
    answer:
      "Use Get a Live Quote on this page for your fixed price. For a standard or estate car with pickup at least 12 hours ahead, you can pay securely online with SumUp to confirm. For nearer pickups or executive cars, Request to book / enquire — once we confirm the job, we email a SumUp payment link. Your booking is confirmed after payment.",
  },
  {
    question: "Do you track my flight?",
    answer:
      "Yes. We monitor your flight in real time and adjust pickup times for delays or early arrivals at no extra cost. Just provide your flight number when booking.",
  },
  {
    question: "Can I track my driver on the day of travel?",
    answer:
      "Yes — when you pay online by card, your invoice includes a live tracking link. On the day of your transfer, the page opens about two hours before your scheduled pickup. When your driver is on the way, you can follow their location on a map. There is no extra charge for this service.",
  },
  {
    question: "What is included in the price?",
    answer:
      "All quotes include the vehicle, professional driver, fuel, tolls, and up to 60 minutes complimentary waiting time after landing. Parking charges at the airport are also covered.",
  },
  {
    question: "Can I pay by card?",
    answer:
      "Yes. Standard and estate car transfers with at least 12 hours’ notice can be paid online by card via SumUp at the end of the quote. For nearer pickups or other vehicles, Request to book and we’ll email a SumUp payment link after we confirm the job. Cash and bank transfer can be arranged where agreed.",
  },
  {
    question: "What is your cancellation and refund policy?",
    answer:
      "Cancel more than 24 hours before pickup for a full refund of the fare paid. Cancellations with less than 24 hours’ notice and no-shows are non-refundable. There is no separate cancellation administration charge. Full details are in our Terms & Conditions.",
  },
  {
    question: "When is my booking confirmed?",
    answer:
      "If you pay online at quote time, your booking is confirmed once SumUp payment completes and you receive your confirmation email. If you Request to book, submitting the request does not confirm the journey — once we confirm the job and you pay via the SumUp link we email, your booking is confirmed.",
  },
  {
    question: "What vehicle types do you offer?",
    answer:
      "Online bookings are for up to four passengers in a standard or estate car with an instant online price where shown. Executive saloons are enquire-to-book. We do not offer minibuses or people carriers through this website.",
  },
  {
    question: "Do you offer chauffeur and executive private hire?",
    answer:
      "Yes. We provide chauffeur and executive private hire across Northern Ireland for business travel, events, and as-directed journeys — as well as our airport transfer service. Contact us via WhatsApp for a personalised quote.",
  },
  {
    question: "Do you operate 24 hours a day?",
    answer:
      "Absolutely. We operate 24/7, 365 days a year — including bank holidays and Christmas. Early morning and late-night transfers are our speciality.",
  },
  {
    question: "Do you offer meet and greet?",
    answer:
      "Yes. For arrivals we can meet you in the arrivals hall with a name board when requested. Tell us when you book if you want meet and greet, and share your flight number so we can track delays.",
  },
  {
    question: "What if my flight is delayed?",
    answer:
      "We track your flight and adjust the pickup time for delays or early landings at no extra charge. Airport pickups include up to 60 minutes complimentary waiting after landing.",
  },
  {
    question: "Do you provide child seats or booster seats?",
    answer:
      "Booster seats and child seats can be requested when you book, but they are not guaranteed. Please ask in advance so we can check availability. If a legally required child seat cannot be provided, we may be unable to carry the journey.",
  },
  {
    question: "Is parking included at the airport?",
    answer:
      "Yes — parking charges at the airport are included in the quoted price for airport transfers, along with the vehicle, driver, fuel, tolls, and waiting time where applicable.",
  },
  {
    question: "Can I pay with cash?",
    answer:
      "Yes — cash to the driver or bank transfer can be arranged where agreed. Many customers pay by card via SumUp (online at quote time when pickup is 12+ hours ahead, or via the payment link we email after confirming a booking request). Corporate accounts are available for regular travellers.",
  },
  {
    question: "Where do you pick up at the airport?",
    answer:
      "For arrivals we collect from the designated pickup point for your airport (and can meet in arrivals with a name board if you request meet and greet). Share your flight number when booking so we know when you land.",
  },
  {
    question: "How early should I book?",
    answer:
      "As early as you can — especially for early-morning departures, bank holidays, and busy travel days. Same-day transfers are often possible subject to availability; use Get a Live Quote or WhatsApp us to check.",
  },
  {
    question: "Do you cover journeys in the Republic of Ireland?",
    answer:
      "Yes. Standard pickups are from Greater Belfast (or Belfast International, Belfast City, or Dublin Airport). Destinations can be throughout Northern Ireland and the Republic of Ireland. Dublin Airport keeps a live online quote and book-online flow where eligible. Other Republic of Ireland city destinations, and any out-of-area pickup, use Request Fixed Quote for manual approval — no automatic price or immediate payment until confirmed.",
  },
  {
    question: "What currency are prices quoted in?",
    answer:
      "All prices on this website are quoted in pounds sterling (GBP). Cross-border journeys are still billed in GBP unless we agree otherwise in writing before you travel.",
  },
  {
    question: "Are tolls included in the price?",
    answer:
      "Yes — quoted fares include applicable road tolls for your route (including cross-border tolls where relevant), along with the vehicle, professional driver, and fuel.",
  },
  {
    question: "How much waiting time is included?",
    answer:
      "Airport collections include 60 minutes complimentary waiting from when your flight lands (with flight tracking when you provide a flight number). All other pickups include 10 minutes complimentary waiting at the agreed collection point.",
  },
  {
    question: "Can I book a return journey?",
    answer:
      "Yes — choose Return on the quote form for a 5% discount on the combined fare where an instant online price is shown. For Republic of Ireland or bespoke long-distance routes, tell us your return date and we’ll include it in your fixed quote.",
  },
  {
    question: "What is your cancellation policy for long-distance transfers?",
    answer:
      "Long-distance and cross-border transfers follow the same rule: cancel more than 24 hours before pickup for a full refund of the fare paid. Less than 24 hours’ notice is non-refundable. Full details are in our Terms & Conditions.",
  },
] as const;

export const VEHICLE_FLEET = [
  {
    name: "Estate Car",
    capacity: "1–4 passengers",
    description:
      "1–4 passengers — spacious estate with a large boot for family holidays and airport luggage. Instant online price.",
    enquiryOnly: false,
    requestQuote: false,
    partnerOperated: false,
  },
  {
    name: "Standard Saloon",
    capacity: "1–4 passengers",
    description: "1–4 passengers — ideal for solo travellers and couples with light luggage. Instant online price.",
    enquiryOnly: false,
    requestQuote: false,
    partnerOperated: false,
  },
  {
    name: "Executive Saloon",
    capacity: "1–4 passengers",
    description: "Premium comfort for business travel — enquire to book and we’ll confirm availability and price.",
    enquiryOnly: true,
    requestQuote: false,
    partnerOperated: false,
  },
] as const;

export const VEHICLE_TYPES = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  "Executive Saloon (1–4 passengers)",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Maximum passengers accepted on the online quote and booking form. */
export const MAX_ONLINE_PASSENGERS = 4;

/** Vehicles that cannot be instantly confirmed — enquiry flow. */
export const ENQUIRY_ONLY_VEHICLE_TYPES: readonly VehicleType[] = [
  "Executive Saloon (1–4 passengers)",
];

/**
 * Vehicles that show a guide price but require “Request a quote”.
 * Kept for type compatibility — currently empty (no minibus online).
 */
export const REQUEST_QUOTE_VEHICLE_TYPES: readonly VehicleType[] = [];

/** Saloon/estate can pay online at quote time when far enough ahead. */
export const INSTANT_PAY_VEHICLE_TYPES: readonly VehicleType[] = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
];

/** Minimum notice (hours) before pickup for customer SumUp “Pay now”. */
export const PAY_NOW_MIN_HOURS_AHEAD = 12;

/** Short guidance shown in the quote tool above vehicle selection. */
export const VEHICLE_BOOKING_GUIDANCE = [
  "Up to 4 passengers: Standard or estate car — instant online price where shown. Pay online when pickup is at least 12 hours ahead.",
  "Executive saloon: enquire to book — we’ll confirm availability and price.",
] as const;

/** @deprecated Online bookings are capped at four passengers; always false. */
export function needsLuggageCapacityConfirmation(
  passengers: number,
  suitcases: number,
): boolean {
  void passengers;
  void suitcases;
  return false;
}

export function isVehicleEnquiryOnly(vehicleType: string): boolean {
  return (ENQUIRY_ONLY_VEHICLE_TYPES as readonly string[]).includes(vehicleType);
}

export function isVehicleRequestQuote(vehicleType: string): boolean {
  return (REQUEST_QUOTE_VEHICLE_TYPES as readonly string[]).includes(vehicleType);
}

export function isInstantPayVehicle(vehicleType: string): boolean {
  return (INSTANT_PAY_VEHICLE_TYPES as readonly string[]).includes(vehicleType);
}

/** Request-quote vehicles may show an indicative online price; Executive does not. */
export function showsOnlineGuidePrice(vehicleType: string): boolean {
  return isVehicleRequestQuote(vehicleType);
}

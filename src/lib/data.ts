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
 * Temporary public holding page. When enabled and before `until`, the site shows
 * a branded offline page (ops routes stay available). After `until`, the full
 * site returns automatically — set enabled back to false when you tidy up.
 */
export const SITE_OFFLINE = {
  enabled: false,
  /** ISO UTC — used when enabled for the expected-return label. */
  until: "2026-08-14T16:00:00.000Z",
  message:
    "We're temporarily offline for a short break and will be back within 48 hours.",
} as const;

/** Paths that stay live while SITE_OFFLINE is active (bookings ops / legal). */
export const SITE_OFFLINE_ALLOWLIST = [
  "/driver-accept",
  "/driver",
  "/owner",
  "/admin",
  "/track",
  "/unsubscribe",
  "/booking-confirmed",
  "/pay",
] as const;

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
   * (Standard Saloon / Estate / Minibus). Enquiry-only vehicles still use Request to book.
   */
  customerSumUpPay: true,
  /** Live driver tracking marketing + customer track links + dashboard journey controls. */
  liveDriverTracking: true,
  /** Public driver dashboard — enabled for journey tracking on phone. */
  driverDashboard: true,
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
    /** Short customer-facing CTA shown on airport cards (not a marketing fare). */
    distance: "Get a fixed quote",
    duration: "~30 min from Belfast",
    mapLabel: "Belfast International Airport, Aldergrove, UK",
    mapLocation: { lat: 54.6575, lng: -6.2158 },
    description:
      "Direct transfers to and from Aldergrove with live flight monitoring and complimentary waiting time.",
  },
  {
    code: "BHD",
    name: "George Best Belfast City",
    basePrice: 34,
    distance: "Get a fixed quote",
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
    distance: "Get a fixed quote",
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
    distance: "Get a fixed quote",
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
    title: "Live flight monitoring",
    description:
      "We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include 60 minutes complimentary waiting time.",
  },
  {
    title: "Live driver tracking",
    description:
      "Pay online and receive a tracking link with your invoice. On travel day, follow your driver's live location when they're on the way to you.",
  },
  {
    title: "Meet & greet available",
    description:
      "Meet & greet can be requested during booking where available — we can meet you in the arrivals hall with a name board. Share your flight number when you book.",
  },
  {
    title: "60 minutes airport waiting",
    description:
      "Airport pickups include up to 60 minutes complimentary waiting time, giving you time to clear passport control, collect your luggage and make your way to the agreed pickup point.",
  },
  {
    title: "Clear fixed quotes",
    description:
      "See only the inclusions that apply to your journey — express airport fees where relevant, Dublin tolls where they apply, and simple fixed prices for address-to-address trips.",
  },
  {
    title: "24/7, 365 days a year",
    description:
      "Early morning and late-night transfers are our speciality — including bank holidays and Christmas.",
  },
  {
    title: "1–4 or 5–7 made simple",
    description:
      "1–4 passengers get an instant Saloon or Estate quote online where eligible. 5–7 passengers get a fixed Minibus fare online using our existing minibus pricing. We do not offer journeys for more than 7 passengers.",
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
      "The link is ready when you book, but live tracking opens on the day of your transfer, from about one hour before pickup.",
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
    question: "Are airport fees included?",
    answer:
      "Yes where they apply to your journey. Airport pickups include the applicable express pickup fee in the fixed fare. Airport drop-offs include the applicable express drop-off fee. You only see the fees that match the direction of travel.",
  },
  {
    question: "How much airport waiting time is included?",
    answer:
      "Airport pickups include up to 60 minutes complimentary waiting time, giving you time to clear passport control, collect your luggage and make your way to the agreed pickup point. Pickups from non-airport locations include up to 10 minutes complimentary waiting time from the agreed pickup time. Waiting beyond the complimentary period may be charged.",
  },
  {
    question: "Do you monitor flights?",
    answer:
      "We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include up to 60 minutes complimentary waiting time. Waiting beyond that may be charged.",
  },
  {
    question: "Is meet & greet available?",
    answer:
      "Yes. Meet & greet can be requested during booking where available — we can meet you in the arrivals hall with a name board. Share your flight number when you book so we can plan the collection.",
  },
  {
    question: "How many passengers can I book for?",
    answer:
      "Our online service accommodates up to 7 passengers. Journeys for 1–4 passengers can receive an instant Saloon or Estate quote where eligible. For 5–7 passengers, we show a fixed Minibus fare online (Minibus — 5–7 passengers) using our existing minibus pricing.",
  },
  {
    question: "Are tolls included?",
    answer:
      "Dublin Airport fares include applicable road tolls where they form part of that route. Ordinary Northern Ireland address-to-address journeys do not add separate toll charges. Toll wording only appears when it applies to your quote.",
  },
  {
    question: "Can I book a return journey?",
    answer:
      "Yes — choose Return on the quote form. Where an instant online price is shown, a 5% discount applies to the combined fare. Each leg shows its own inclusions (for example drop-off fee outbound and pickup fee plus airport waiting on the return).",
  },
  {
    question: "How do I pay?",
    answer:
      "Get your fixed price online. Eligible Saloon, Estate, and Minibus bookings can be confirmed securely by card via SumUp. Short-notice pickups may need Owner availability confirmation before payment. Cash or bank transfer can be arranged where agreed.",
  },
  {
    question: "Can I cancel my booking?",
    answer:
      "Cancel more than 24 hours before pickup for a full refund of the fare paid. Cancellations with less than 24 hours’ notice and no-shows are non-refundable. Full details are in our Terms & Conditions.",
  },
  {
    question: "What is included in the price?",
    answer:
      "Your fixed price depends on the journey. Airport pickups: express pickup fee and 60 minutes complimentary waiting. Airport drop-offs: express drop-off fee. Dublin Airport: applicable tolls where they apply. Address-to-address: fixed price for your journey with 10 minutes complimentary waiting at non-airport pickups.",
  },
  {
    question: "Do you cover City of Derry Airport?",
    answer:
      "Yes. City of Derry Airport (LDY) transfers are between LDY and the greater Belfast area (for example Belfast, Bangor, Lisburn and surrounds). Select City of Derry Airport in the quote tool — the same express pickup/drop-off wording applies; Dublin toll wording does not.",
  },
  {
    question: "Do you cover journeys in the Republic of Ireland?",
    answer:
      "Yes. Dublin Airport keeps a live online quote where eligible. Other Republic of Ireland city destinations, and some out-of-area pickups, use a tailored fixed-quote request — no automatic price or immediate payment until confirmed.",
  },
  {
    question: "Do you provide child seats or booster seats?",
    answer:
      "Child seats and boosters can be requested when you book, but availability is not guaranteed. Ask in advance so we can check. If a legally required child seat cannot be provided, we may be unable to carry the journey.",
  },
  {
    question: "Can I track my driver on the day of travel?",
    answer:
      "When you pay online by card, your invoice includes a live tracking link. On travel day, the page opens about one hour before your scheduled pickup so you can follow your driver on a map.",
  },
  {
    question: "What currency are prices quoted in?",
    answer:
      "All prices on this website are quoted in pounds sterling (GBP), including cross-border journeys unless we agree otherwise in writing before you travel.",
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
  {
    name: "Minibus — 5–7 passengers",
    capacity: "5–7 passengers",
    description:
      "For groups of 5–7 passengers, get a fixed Minibus fare online using our existing minibus pricing. Pay securely to confirm. We do not offer journeys for more than 7 passengers.",
    enquiryOnly: false,
    requestQuote: false,
    partnerOperated: false,
  },
] as const;

export const VEHICLE_TYPES = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  "Executive Saloon (1–4 passengers)",
  "Minibus (5–7 passengers)",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const MINIBUS_VEHICLE_TYPE: VehicleType = "Minibus (5–7 passengers)";

/** Maximum passengers accepted on the online quote and booking form / APIs. */
export const MAX_ONLINE_PASSENGERS = 7;

/** Vehicles that cannot be instantly confirmed — enquiry / request-a-quote flow. */
export const ENQUIRY_ONLY_VEHICLE_TYPES: readonly VehicleType[] = [
  "Executive Saloon (1–4 passengers)",
];

/** @deprecated Minibus is instant-pay again — kept empty for callers. */
export const REQUEST_QUOTE_VEHICLE_TYPES: readonly VehicleType[] = [];

/** Saloon, estate, and minibus can pay online at quote time when an instant fare is shown. */
export const INSTANT_PAY_VEHICLE_TYPES: readonly VehicleType[] = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  MINIBUS_VEHICLE_TYPE,
];

export const MINIBUS_PARTNER_NOTE =
  "Minibus (5–7 passengers): fixed online fare using our existing minibus pricing. Pay securely online to confirm. Maximum 7 passengers.";

/** Short guidance kept for ops/docs — not shown in the public quote UI. */
export const VEHICLE_BOOKING_GUIDANCE = [
  "1–4 passengers: Saloon or Estate instant quote where eligible. Pay online by card to confirm.",
  "5–7 passengers: Minibus instant quote where eligible. Pay online by card to confirm. Maximum 7 passengers.",
] as const;

/** Legacy hook retained for quote form — capacity above 7 is blocked elsewhere. */
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

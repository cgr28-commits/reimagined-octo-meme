import { withBasePath } from "./paths";

export const SITE = {
  name: "My Airport Taxi NI",
  tagline: "Premium Airport Transfers Across Northern Ireland",
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
  addressToAddress: false,
  /** George Best Belfast City Airport (BHD) — data retained for restore. */
  belfastCityAirport: false,
  /** Public tracking demo hub + owner/driver demo links. */
  trackingDemo: false,
  /**
   * Customer SumUp “Pay now” on the website.
   * Off: customers request/enquire; owner sends SumUp link after confirming, then marks paid.
   */
  customerSumUpPay: false,
  /** Live driver tracking marketing + customer track links — soft-hidden until more testing. */
  liveDriverTracking: false,
  /** Public driver dashboard — soft-hidden; drivers confirm jobs by email instead. */
  driverDashboard: false,
} as const;

export type ServiceFlagKey = keyof typeof SERVICE_FLAGS;

export const ALL_NAV_LINKS = [
  { label: "Airports", href: "/#airports", service: null },
  { label: "Day Trips", href: "/tours/", service: "dayTrips" as const },
  { label: "Our Fleet", href: "/#vehicles", service: null },
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
    title: "Licensed & insured fleet",
    description:
      "Saloon, estate, executive, and minibus options — all fully licensed and insured for airport transfers.",
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
      "You can book via our WhatsApp button or fill in the quote form on this page. We confirm your booking within minutes via WhatsApp with your personalised quote.",
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
      "Yes — you can pay securely online by card when you book through our quote form (SumUp checkout). We also accept cash, bank transfer, and payment links sent by text or WhatsApp. Corporate accounts are available for regular business travellers.",
  },
  {
    question: "What is your cancellation and refund policy?",
    answer:
      "With at least 24 hours’ notice we accept the cancellation and refund the fare, minus an administration/transaction charge of £5 or 10% of the booking price, whichever is higher. Cancellations with less than 24 hours’ notice and no-shows are not eligible for a refund. Full details are in our Terms & Conditions.",
  },
  {
    question: "When is my booking confirmed?",
    answer:
      "For online card payments, your booking is confirmed once payment is completed and you receive your invoice email. For WhatsApp or email bookings, your booking is not confirmed until full payment has been received and we have acknowledged your reservation.",
  },
  {
    question: "What vehicle types do you offer?",
    answer:
      "Our fleet includes estate cars and saloons (up to 4 passengers), executive saloons, and 8-seater minibuses for larger groups. All vehicles are fully licensed and insured.",
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
      "Yes. You can pay by cash to the driver, by bank transfer, by payment link (text or WhatsApp), or securely online by card through SumUp when you book on the website. Corporate accounts are available for regular travellers.",
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
] as const;

export const VEHICLE_FLEET = [
  {
    name: "Estate Car",
    capacity: "1–4 passengers",
    description: "Our most popular option — a spacious estate with a large boot for family holidays and airport luggage.",
    enquiryOnly: false,
  },
  {
    name: "Standard Saloon",
    capacity: "1–4 passengers",
    description: "Ideal for solo travellers and couples with light luggage.",
    enquiryOnly: false,
  },
  {
    name: "Executive Saloon",
    capacity: "1–4 passengers",
    description: "Premium comfort for business travel — enquire to book and we’ll confirm availability and price.",
    enquiryOnly: true,
  },
  {
    name: "Minibus",
    capacity: "7–8 passengers",
    description: "For larger groups travelling together — enquire to book and we’ll confirm availability and price.",
    enquiryOnly: true,
  },
] as const;

export const VEHICLE_TYPES = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  "Executive Saloon (1–4 passengers)",
  "Minibus (7–8 passengers)",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Executive and Minibus: enquiry to book — no online price, pay, or instant booking. */
export const ENQUIRY_ONLY_VEHICLE_TYPES: readonly VehicleType[] = [
  "Executive Saloon (1–4 passengers)",
  "Minibus (7–8 passengers)",
];

export function isVehicleEnquiryOnly(vehicleType: string): boolean {
  return (ENQUIRY_ONLY_VEHICLE_TYPES as readonly string[]).includes(vehicleType);
}

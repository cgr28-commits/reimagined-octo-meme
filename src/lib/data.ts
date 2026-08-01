import { withBasePath } from "./paths";

export const SITE = {
  name: "My Airport Taxi NI",
  tagline: "Premium Airport Transfers Across Northern Ireland",
  whatsapp: "447549815538",
  whatsappDefaultMessage: "Hi, I'd like some help.",
  email: "bookings@myairporttaxini.co.uk",
  url: "https://www.myairporttaxini.co.uk",
} as const;

export const NAV_LINKS = [
  { label: "Airports", href: "/#airports" },
  { label: "Day Trips", href: "/tours/" },
  { label: "Our Fleet", href: "/#vehicles" },
  { label: "Chauffeur", href: "/#chauffeur" },
  { label: "Check Flights", href: "/#flight-status" },
  { label: "Areas We Cover", href: "/#areas" },
  { label: "Why Us", href: "/#why-us" },
  { label: "FAQ", href: "/#faq" },
] as const;

/** Always visible on mobile — key services beyond airport transfers. */
export const MOBILE_QUICK_LINKS = [
  { label: "Day Trips", href: "/tours/" },
  { label: "Chauffeur Hire", href: "/#chauffeur" },
  { label: "Airports", href: "/#airports" },
  { label: "Get a Quote", href: "/#quote", highlight: true },
] as const;

export const FLIGHT_AIRPORTS = [
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

export const HERO_SLIDES = [
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

export const AIRPORTS = [
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
    question: "What is included in the price?",
    answer:
      "All quotes include the vehicle, professional driver, fuel, tolls, and up to 60 minutes complimentary waiting time after landing. Parking charges at the airport are also covered.",
  },
  {
    question: "Can I pay by card?",
    answer:
      "We accept cash, card, and bank transfer. Corporate accounts are available for regular business travellers — contact us to set up invoicing.",
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
] as const;

export const VEHICLE_FLEET = [
  {
    name: "Estate Car",
    capacity: "1–4 passengers",
    description: "Our most popular option — a spacious estate with a large boot for family holidays and airport luggage.",
  },
  {
    name: "Standard Saloon",
    capacity: "1–4 passengers",
    description: "Ideal for solo travellers and couples with light luggage.",
  },
  {
    name: "Executive Saloon",
    capacity: "1–4 passengers",
    description: "Premium comfort for business travel and airport runs.",
  },
  {
    name: "Minibus",
    capacity: "7–8 passengers",
    description: "Available for larger groups heading to the airport together.",
  },
] as const;

export const VEHICLE_TYPES = [
  "Standard Saloon (1–4 passengers)",
  "Estate Car (1–4 passengers)",
  "Executive Saloon (1–4 passengers)",
  "Minibus (7–8 passengers)",
] as const;

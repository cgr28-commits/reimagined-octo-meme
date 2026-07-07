import { withBasePath } from "./paths";

export const SITE = {
  name: "My Airport Taxi NI",
  tagline: "Premium Airport Transfers Across Northern Ireland",
  whatsapp: "447549815538",
  email: "bookings@myairporttaxini.co.uk",
  url: "https://www.myairporttaxini.co.uk",
} as const;

export const NAV_LINKS = [
  { label: "Airports", href: "/#airports" },
  { label: "Day Trips", href: "/tours/" },
  { label: "Flight Status", href: "/#flight-status" },
  { label: "Areas We Cover", href: "/#areas" },
  { label: "Why Us", href: "/#why-us" },
  { label: "FAQ", href: "/#faq" },
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
] as const;

export const HERO_SLIDES = [
  {
    title: "Belfast International Airport Transfers",
    subtitle:
      "Reliable transfers to and from Aldergrove (BFS) with flight tracking, meet & greet, and 60 minutes complimentary waiting time.",
    image: withBasePath("/images/hero/belfast-international-arrivals-2025.jpg"),
    alt: "Belfast International Airport new Arrivals terminal exterior",
  },
  {
    title: "Belfast City Airport Transfers",
    subtitle:
      "Quick transfers to George Best Belfast City Airport (BHD) — ideal for business trips and short-haul flights.",
    image: withBasePath("/images/hero/belfast-city.jpg"),
    alt: "Entrance to George Best Belfast City Airport terminal",
  },
  {
    title: "Dublin Airport Transfers",
    subtitle:
      "Comfortable cross-border transfers to Dublin Airport (DUB) with experienced drivers from Northern Ireland.",
    image: withBasePath("/images/hero/dublin.jpg"),
    alt: "Dublin Airport Terminal 2 building",
  },
] as const;

export const AIRPORTS = [
  {
    code: "BFS",
    name: "Belfast International",
    basePrice: 45,
    distance: "From £45",
    duration: "~30 min from Belfast",
    description:
      "Direct transfers to and from Aldergrove with live flight monitoring and complimentary waiting time.",
  },
  {
    code: "BHD",
    name: "George Best Belfast City",
    basePrice: 35,
    distance: "From £35",
    duration: "~15 min from city centre",
    description:
      "Quick, convenient transfers to the heart of Belfast — ideal for business and short-haul flights.",
  },
  {
    code: "DUB",
    name: "Dublin Airport",
    basePrice: 180,
    distance: "From £180",
    duration: "~2 hrs from Belfast",
    description:
      "Comfortable cross-border transfers with experienced drivers who know every route and checkpoint.",
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
      "Saloon, executive, MPV, and minibus options — all fully licensed and insured for airport transfers.",
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
      "Our fleet includes standard saloons (up to 4 passengers), executive saloons, MPVs (up to 6 passengers), and 8-seater minibuses for larger groups. All vehicles are fully licensed and insured.",
  },
  {
    question: "Do you operate 24 hours a day?",
    answer:
      "Absolutely. We operate 24/7, 365 days a year — including bank holidays and Christmas. Early morning and late-night transfers are our speciality.",
  },
] as const;

export const VEHICLE_TYPES = [
  "Standard Saloon (1–4 passengers)",
  "Executive Saloon (1–3 passengers)",
  "MPV (4–6 passengers)",
  "Minibus (7–8 passengers)",
] as const;

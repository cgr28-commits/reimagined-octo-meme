import { withBasePath } from "./paths";

export const SITE = {
  name: "My Airport Taxi NI",
  tagline: "Premium Airport Transfers Across Northern Ireland",
  whatsapp: "447549815538",
  email: "bookings@myairporttaxini.co.uk",
  url: "https://www.myairporttaxini.co.uk",
} as const;

export const NAV_LINKS = [
  { label: "Airports", href: "#airports" },
  { label: "Areas We Cover", href: "#areas" },
  { label: "Reviews", href: "#reviews" },
  { label: "FAQ", href: "#faq" },
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

export const REVIEWS = [
  {
    name: "Sarah M.",
    rating: 5,
    date: "2 weeks ago",
    text: "Absolutely brilliant service! Driver was waiting at arrivals with a name board, car was spotless, and the journey to Belfast was smooth and comfortable. Will definitely use again.",
  },
  {
    name: "James O'Neill",
    rating: 5,
    date: "1 month ago",
    text: "Used My Airport Taxi NI for a Dublin Airport run. Clear quote upfront, no surprises. Driver was professional and even helped with luggage. Top class.",
  },
  {
    name: "Emma & David",
    rating: 5,
    date: "3 weeks ago",
    text: "Booked via WhatsApp — super easy. They tracked our delayed flight and adjusted pickup time automatically. Can't recommend enough for airport transfers.",
  },
  {
    name: "Michael T.",
    rating: 5,
    date: "2 months ago",
    text: "Regular business traveller — these guys are my go-to. Always on time, always professional. The executive car option is worth every penny.",
  },
  {
    name: "Claire R.",
    rating: 5,
    date: "1 week ago",
    text: "Family of five with lots of luggage — they sent a spacious MPV that fit everything perfectly. Friendly driver, fair price. Five stars from us!",
  },
  {
    name: "Patrick K.",
    rating: 5,
    date: "3 months ago",
    text: "Early morning pickup to Belfast International — driver arrived 10 minutes early. Coffee stop on the way was no problem. Excellent communication throughout.",
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

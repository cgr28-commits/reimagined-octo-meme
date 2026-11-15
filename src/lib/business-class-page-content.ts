/**
 * Copy, SEO and photography for the Business Class & Executive Transfers page
 * (/business-class/). Kept in one place so wording can be reviewed without
 * touching layout code.
 *
 * Rules (owner, Nov 2026): no named vehicle makes or models, no fleet claims, no
 * 7-seater as standard, no invented reviews, no automatic Business Class fare on
 * this page — enquiries are priced by hand.
 */

export const BUSINESS_CLASS_PAGE_PATH = "/business-class/";
export const BUSINESS_CLASS_ENQUIRY_ANCHOR = "executive-quote";

export const BUSINESS_CLASS_PAGE_SEO_TITLE = "Business Class & Executive Transfers Belfast | My Airport Taxi NI";
export const BUSINESS_CLASS_PAGE_SEO_DESCRIPTION =
  "Discover premium executive airport transfers, corporate travel and private executive journeys in Belfast and Northern Ireland. Request your personalised Business Class quote.";

export const BC_HERO = {
  eyebrow: "My Airport Taxi NI | Executive Travel",
  headlineLines: ["Business Class.", "Beyond the Ordinary."],
  copy:
    "Executive airport transfers, corporate journeys and premium private travel across Belfast, Northern Ireland and beyond. Professional service, thoughtful attention to detail and a more refined way to travel.",
  primaryCta: "Request an Executive Quote",
  secondaryCta: "Explore Our Services",
} as const;

export const BC_INTRO = {
  eyebrow: "Business Class",
  headline: "A Higher Standard of Travel.",
  paragraphs: [
    "Business Class is for travellers who value reliability, comfort and discretion as much as the journey itself. Every booking is pre-arranged, every detail is agreed in advance, and you deal directly with the people who will look after your travel.",
    "Whether you are catching an early flight, collecting a visiting colleague or travelling to an important occasion, we plan around your timings and your requirements, then confirm everything clearly before you travel.",
  ],
  facts: [
    { value: "1–3", label: "passengers per journey" },
    { value: "60", label: "minutes’ waiting on airport collections" },
    { value: "24h", label: "notice to cancel for a full refund" },
  ],
} as const;

export type BcService = {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  lead: string;
  points: readonly string[];
  note?: string;
  photoKey: BcPhotoKey;
};

export const BC_SERVICES: readonly BcService[] = [
  {
    id: "executive-airport-transfers",
    number: "01",
    eyebrow: "Airport",
    title: "Executive Airport Transfers",
    lead:
      "Premium airport travel for business travellers and private clients, arranged around your flight rather than the other way round.",
    points: [
      "Belfast City Airport",
      "Belfast International Airport",
      "Dublin Airport",
    ],
    note:
      "Share your flight number and we monitor arrivals, with up to 60 minutes’ waiting included on airport collections. Departures are timed to your check-in, agreed with you in advance.",
    photoKey: "airport",
  },
  {
    id: "corporate-business-travel",
    number: "02",
    eyebrow: "Corporate",
    title: "Corporate & Business Travel",
    lead:
      "Professional, punctual transport that reflects well on you and your organisation — from a single meeting to a full programme of guest travel.",
    points: [
      "Business meetings",
      "Visiting executives",
      "Conferences",
      "Corporate events",
      "Business guests",
    ],
    note: "One point of contact, clear itineraries and quotations prepared for each journey.",
    photoKey: "corporate",
  },
  {
    id: "private-executive-travel",
    number: "03",
    eyebrow: "Private",
    title: "Private Executive Travel",
    lead:
      "Personalised journeys for the occasions that matter, handled with care, courtesy and complete discretion.",
    points: [
      "Premium private journeys",
      "Special occasions",
      "Hotel transfers",
      "Hospitality arrangements",
      "Discreet private travel",
    ],
    note: "Tell us what the day involves and we will arrange the journey around it.",
    photoKey: "private",
  },
];

export const BC_WHY = {
  eyebrow: "Why Business Class",
  headline: "Why Choose Our Business Class Service?",
  items: [
    {
      title: "Professional and courteous",
      body: "A punctual, well-presented service from first message to final drop-off.",
      icon: "handshake",
    },
    {
      title: "Pre-arranged journeys",
      body: "Every journey is booked and planned in advance — never hailed, never left to chance.",
      icon: "calendar",
    },
    {
      title: "Personal attention",
      body: "Flight times, meeting points, luggage and timings are agreed with you individually.",
      icon: "attention",
    },
    {
      title: "Clear, individual quotations",
      body: "A personal quotation prepared for your journey, confirmed before you pay anything.",
      icon: "quote",
    },
    {
      title: "Comfortable, considered travel",
      body: "A premium saloon for up to three passengers, with the space to work, rest or prepare.",
      icon: "seat",
    },
    {
      title: "Discreet communication",
      body: "Your plans stay between us. We keep messages clear, brief and professional.",
      icon: "discreet",
    },
  ],
} as const;

export const BC_ENQUIRY = {
  eyebrow: "Request an Executive Quote",
  headline: "Your Journey. Exceptionally Considered.",
  copy:
    "Tell us about your journey and we’ll prepare a personalised quotation based on your travel requirements.",
  steps: [
    "Send your journey details — it takes about two minutes.",
    "We check availability and prepare your personal quotation.",
    "Your booking is confirmed only when you accept and pay.",
  ],
} as const;

/**
 * Photography. `licensed` photographs are the owner's own (supplied 15 Nov 2026 or already
 * on the homepage) or Creative Commons photographs credited at /photo-credits/.
 * `placeholder` entries render a clearly labelled panel (none in use at the moment).
 * Vehicles shown are representative: the alt text says so and no make is named in copy.
 */
export type BcPhotoKey = "hero" | "intro" | "airport" | "corporate" | "private";

export type BcPhoto =
  | {
      kind: "licensed";
      baseName: string;
      /** Folder under /public. Defaults to /images/business-class. */
      dir?: string;
      widths: readonly number[];
      width: number;
      height: number;
      alt: string;
      /** Shown under the photograph when the licence asks for a credit. */
      credit?: string;
      source: string;
    }
  | {
      kind: "placeholder";
      label: string;
      brief: string;
    };

export const BC_HERO_PORTRAIT = {
  baseName: "business-class-airport-arrival-twilight-portrait",
  widths: [640, 752],
} as const;

export const BC_PHOTOS: Record<BcPhotoKey, BcPhoto> = {
  hero: {
    kind: "licensed",
    baseName: "business-class-airport-arrival-twilight",
    widths: [960, 1280, 1672],
    width: 1672,
    height: 941,
    alt: "Representative image: a black executive saloon waiting outside a glass airport terminal at twilight",
    source: "Supplied by the owner, 15 Nov 2026",
  },
  intro: {
    kind: "licensed",
    baseName: "business-class-executive-interior",
    widths: [800, 1122],
    width: 1122,
    height: 1402,
    alt: "Representative image: the rear cabin of an executive saloon with black leather seats and soft amber lighting",
    source: "Supplied by the owner, 15 Nov 2026",
  },
  airport: {
    kind: "licensed",
    baseName: "business-class-executive-dublin",
    dir: "/images/hero/optimized",
    widths: [960, 1920],
    width: 1920,
    height: 1280,
    alt: "Representative image: a driver holding the rear door of a black executive saloon for passengers at Dublin Airport Terminal 2",
    source: "Owner's homepage Business Class photograph",
  },
  corporate: {
    kind: "licensed",
    baseName: "business-class-belfast-titanic-quarter-hero",
    widths: [1280, 1920, 2560],
    width: 2560,
    height: 1440,
    alt: "The faceted glass and metal facade of Titanic Belfast in Belfast’s Titanic Quarter",
    credit: "Titanic Belfast — Juan Antonio Segal, CC BY 2.0",
    source: "Wikimedia Commons, CC BY 2.0",
  },
  private: {
    kind: "licensed",
    baseName: "business-class-hotel-arrival-evening",
    widths: [640, 752],
    width: 752,
    height: 941,
    alt: "Representative image: a black executive saloon at a softly lit hotel entrance in the evening",
    source: "Supplied by the owner, 15 Nov 2026",
  },
};

export const BC_PAGE_FAQS = [
  {
    question: "How is a Business Class journey priced?",
    answer:
      "Business Class journeys requested on this page are priced individually. Tell us about your journey and we email a personal quotation; nothing is charged until you accept it and pay.",
  },
  {
    question: "How many passengers can travel in Business Class?",
    answer:
      "Business Class carries up to three passengers. For larger groups, call us and we will suggest the best option.",
  },
  {
    question: "Which airports do you cover?",
    answer:
      "Belfast City Airport, Belfast International Airport and Dublin Airport. Add your flight number and we monitor arrivals, with up to 60 minutes’ waiting included on airport collections.",
  },
] as const;

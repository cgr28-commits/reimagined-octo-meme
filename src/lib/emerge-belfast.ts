import { SITE } from "@/lib/data";
import { todayLondonDate } from "@/lib/format-datetime";
import emergeConfig from "@/lib/emerge-belfast-config.json";

/**
 * Shared campaign config (also read by scripts/generate-sitemap.mjs).
 * Inclusive expiry: active through end of `expiresOn` in Europe/London;
 * from the next calendar day the public campaign is treated as ended.
 */
export const EMERGE_BELFAST_CONFIG = emergeConfig;

/** Public path for the EMERGE Belfast taxi landing page (reused each year). */
export const EMERGE_BELFAST_PATH = EMERGE_BELFAST_CONFIG.path;

export const EMERGE_BELFAST_DESTINATION = EMERGE_BELFAST_CONFIG.destinationPrefill;

/** Last UK calendar day the 2026 campaign stays active (inclusive). */
export const EMERGE_BELFAST_EXPIRES_ON = EMERGE_BELFAST_CONFIG.expiresOn;

/**
 * True while the live EMERGE campaign should promote, index and accept
 * festival-specific discovery. Uses Europe/London civil dates.
 */
export function isEmergeBelfastCampaignActive(now: Date = new Date()): boolean {
  return todayLondonDate(now) <= EMERGE_BELFAST_EXPIRES_ON;
}

export const EMERGE_BELFAST_META = {
  title: `EMERGE Belfast Taxi Transfers | ${SITE.name}`,
  description:
    "Pre-book a fixed-price taxi to EMERGE Belfast 2026 at Boucher Playing Fields. Airport, hotel and return transfers for up to 4 passengers.",
  canonicalPath: EMERGE_BELFAST_PATH,
  ogTitle: `EMERGE Belfast Taxi Transfers | ${SITE.name}`,
  ogDescription:
    "Pre-book a fixed-price taxi to EMERGE Belfast 2026 at Boucher Playing Fields. Airport, hotel and return transfers for up to 4 passengers.",
} as const;

export const EMERGE_BELFAST_ENDED_META = {
  title: `EMERGE Belfast ${EMERGE_BELFAST_CONFIG.campaignYear} transfers ended | ${SITE.name}`,
  description: `Pre-booked taxi transfers for EMERGE Belfast ${EMERGE_BELFAST_CONFIG.campaignYear} have ended. Request a fixed quote for other airport, hotel and local journeys with ${SITE.name}.`,
  canonicalPath: EMERGE_BELFAST_PATH,
} as const;

export const EMERGE_WHATSAPP_MESSAGE =
  "Hi, I would like a fixed quote for an EMERGE Belfast transfer. My pickup location is: ____. The date is: ____. Number of passengers: ____. I need a one-way/return journey.";

export function emergeWhatsAppHref(): string {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(EMERGE_WHATSAPP_MESSAGE)}`;
}

export const EMERGE_OFFICIAL_INFO_URL = "https://www.emergebelfast.com/information.php";

export const EMERGE_FAQS = [
  {
    question: "Can I book a return journey after EMERGE?",
    answer:
      "Yes, return journeys can be requested in advance, subject to availability. Your collection time and safe meeting location will be agreed before travel.",
  },
  {
    question: "Can you collect me from an airport?",
    answer:
      "Yes. Transfers can be requested from Belfast International Airport, Belfast City Airport, City of Derry Airport and Dublin Airport.",
  },
  {
    question: "How many passengers can I book for?",
    answer:
      "The online service accepts bookings for up to 4 passengers. Please provide accurate passenger and luggage information when requesting your quote.",
  },
  {
    question: "Will I be collected directly at the festival entrance?",
    answer:
      "Not necessarily. Road closures, traffic controls and safe-stopping restrictions may affect the exact location. A suitable legal meeting point near the event will be agreed where required.",
  },
  {
    question: "Is My Airport Taxi NI part of EMERGE Belfast?",
    answer:
      "No. My Airport Taxi NI is an independent taxi and airport-transfer service and is not connected with, endorsed by or affiliated with the festival organiser.",
  },
  {
    question: "Can I pay online?",
    answer:
      "Yes. Confirmed bookings can be paid securely through the website’s existing SumUp payment process.",
  },
] as const;

export const EMERGE_TRANSFER_CARDS = [
  {
    title: "Belfast International Airport",
    body: "Arriving at Belfast International Airport for the festival? Pre-book your transfer to your Belfast accommodation or onward to the EMERGE area. Airport pickups include flight monitoring.",
    href: "/airports/belfast-international/",
  },
  {
    title: "Belfast City Airport",
    body: "Book a direct transfer from Belfast City Airport to your hotel, accommodation or an agreed safe drop-off point near Boucher Playing Fields.",
    href: "/airports/belfast-city/",
  },
  {
    title: "Dublin Airport",
    body: "Travelling through Dublin Airport? Arrange a private, pre-booked transfer between Dublin Airport and Belfast for up to 4 passengers.",
    href: "/airports/dublin/",
  },
  {
    title: "Hotels and Home Pickups",
    body: "Pre-book a journey from your Belfast hotel or home address and arrange your return collection after the festival.",
    href: "#quote",
  },
] as const;

export const EMERGE_BOOKING_STEPS = [
  {
    title: "Enter your journey details",
    body: "Tell us your pickup location, date, time, passenger numbers and whether you need a return journey.",
  },
  {
    title: "Receive your fixed quote",
    body: "See or request the price before confirming the booking.",
  },
  {
    title: "Confirm and pay securely",
    body: "Complete your booking through the existing secure SumUp payment process.",
  },
  {
    title: "Receive your pickup details",
    body: "Your agreed pickup information and meeting arrangements will be confirmed before travel.",
  },
] as const;

export const EMERGE_TRUST_POINTS = [
  "Local Northern Ireland driver",
  "Fixed quote before confirmation",
  "Flight monitoring for airport collections",
  "Secure online card payment",
  "WhatsApp booking support",
  "Bookings for up to 4 passengers",
] as const;

export const EMERGE_HERO_TRUST = [
  "Fixed quote before booking",
  "Secure payment powered by SumUp",
  "Up to 4 passengers",
  "Pre-booked pickup arrangements",
] as const;

export const EMERGE_DISCLAIMER =
  "My Airport Taxi NI is an independent transport provider and is not affiliated with, endorsed by or connected to EMERGE Belfast or its organisers. Event times, access arrangements and traffic restrictions may change.";

/** Service-only structured data (not Event organiser / not duplicate LocalBusiness). */
export function getEmergeServiceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "EMERGE Belfast taxi and airport transfers",
    description: EMERGE_BELFAST_META.description,
    url: `${SITE.url}${EMERGE_BELFAST_PATH}`,
    serviceType: "Airport and private transfer",
    areaServed: [
      "Boucher Playing Fields, Belfast",
      "Belfast International Airport",
      "Belfast City Airport",
      "Dublin Airport",
      "Belfast",
    ],
    provider: {
      "@id": `${SITE.url}/#business`,
    },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      url: `${SITE.url}${EMERGE_BELFAST_PATH}#quote`,
    },
  };
}

/**
 * Business Class Dublin Airport landing page.
 * Copy matches the quote inclusions. It does not add a vehicle, fare, or booking rule.
 */

export const BUSINESS_CLASS_DUBLIN_PATH = "/transfers/business-class-dublin-airport/";

export const BUSINESS_CLASS_DUBLIN_H1 = "Business Class Dublin Airport Transfers";

export const BUSINESS_CLASS_DUBLIN_SEO_TITLE = "Business Class Dublin Airport Transfers";

export const BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION =
  "Upgrade your Dublin Airport transfer with Business Class. Enjoy extra comfort, luggage assistance, bottled water and fixed fares. Book online.";

export const BUSINESS_CLASS_DUBLIN_WHATSAPP =
  "Hi, I'd like a quote for a Business Class Dublin Airport transfer.";

export const BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS = [
  "Meet & Greet inside arrivals",
  "Personalised name board",
  "Luggage assistance",
  "Complimentary bottled water",
  "Phone charging",
  "Terminal access included in the fixed fare",
] as const;

export const BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS = [
  "Luggage assistance",
  "Complimentary bottled water",
  "Phone charging",
  "Terminal access included in the fixed fare",
] as const;

export const BUSINESS_CLASS_DUBLIN_FAQS = [
  {
    question: "Is Business Class a separate chauffeur service?",
    answer:
      "No. Business Class is a vehicle you select in the normal airport transfer quote. The same booking flow confirms the fixed fare.",
  },
  {
    question: "How many passengers and suitcases can Business Class take?",
    answer:
      "Business Class carries 1–4 passengers and up to 2 standard suitcases (23kg). If you have 3 or 4 standard suitcases (23kg), select Estate instead.",
  },
  {
    question: "What is included on a Business Class pickup at Dublin Airport?",
    answer:
      "A Dublin Airport pickup includes Meet & Greet inside arrivals, a personalised name board, luggage assistance, complimentary bottled water, phone charging, and terminal access in the fixed fare.",
  },
  {
    question: "Does a drop-off at Dublin Airport include Meet & Greet?",
    answer:
      "No. A drop-off includes luggage assistance, complimentary bottled water, phone charging, and terminal access in the fixed fare. Meet & Greet is for airport pickups.",
  },
  {
    question: "Are Dublin tolls included?",
    answer:
      "Yes. Dublin tolls and terminal access are included in the fixed fare, as they are for the other vehicle options.",
  },
] as const;

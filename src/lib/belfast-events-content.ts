/**
 * Copy for the Belfast Events hub and the two request pages. Our own words only.
 * Never promise a 7-seater, never mention vehicles we do not run, and keep the
 * instant airport quote (and its automatically priced Business Class) separate.
 */
import { EVENT_REQUEST_MAX_PASSENGERS, GROUP_VEHICLE_FROM_PASSENGERS } from "@/lib/bespoke-public";
import { BUSINESS_CLASS_MAX_PASSENGERS } from "../../shared/passenger-limits";

export const EVENTS_HUB_SEO_TITLE = "Belfast Event Transfers: Concerts, Sport & Theatre";
export const EVENTS_HUB_SEO_DESCRIPTION =
  "Private transfers to Belfast concerts, sport, theatre, comedy, festivals and exhibitions. Tell us your plans and we send a personal fixed quotation. Groups up to 7 on request.";
export const EVENTS_HUB_H1 = "Belfast Event Transfers";
export const EVENTS_HUB_INTRO =
  "Going to a concert at The O2, a match at Windsor Park or a show at the Grand Opera House? We'll take you there and bring you home afterwards. Tell us your plans and we'll send a personal fixed quotation.";

export const EVENT_REQUEST_SEO_TITLE = "Request an Event Transfer in Belfast";
export const EVENT_REQUEST_SEO_DESCRIPTION =
  "Request a private transfer to and from a Belfast event. Tell us the event, pickup and group size, and we'll reply with a personal fixed quotation.";

export const BUSINESS_CLASS_REQUEST_SEO_TITLE = "Bespoke Business Class Transfer Request";
export const BUSINESS_CLASS_REQUEST_SEO_DESCRIPTION = `Request a bespoke Business Class journey in Northern Ireland: corporate travel, VIP transfers and special occasions, for up to ${BUSINESS_CLASS_MAX_PASSENGERS} passengers. Personal quotation by email.`;

export const EVENT_STEPS = [
  {
    title: "Tell us your plans",
    body: "Choose a listed event or tell us about any Belfast event, with your pickup, times and group size.",
  },
  {
    title: "Get a personal quotation",
    body: "We check availability and email you a fixed price with a secure link. No payment until you accept.",
  },
  {
    title: "Accept and pay online",
    body: "Pay securely by card. Your booking is confirmed straight away, with the details by email.",
  },
] as const;

export const EVENT_GROUP_NOTE = {
  title: "Travelling as a group?",
  body: `Our cars carry up to 4 passengers. For ${GROUP_VEHICLE_FROM_PASSENGERS}–${EVENT_REQUEST_MAX_PASSENGERS} people you can request our 7-seater. It is subject to availability, and we confirm the vehicle in your quotation before you pay. For larger groups, please call us to talk it through.`,
} as const;

export const EVENT_FAQS = [
  {
    question: "Can you collect us after the event?",
    answer:
      "Yes. Add a return journey and give us your best guess for the finish time. We agree a meeting point close to the venue with you before the day.",
  },
  {
    question: "How much does an event transfer cost?",
    answer:
      "Event journeys are priced individually because finish times, waiting and traffic vary. We email a fixed quotation after checking availability. The price you accept is the price you pay.",
  },
  {
    question: "Can we book the 7-seater?",
    answer: `You can request it for groups of ${GROUP_VEHICLE_FROM_PASSENGERS}–${EVENT_REQUEST_MAX_PASSENGERS}. It is subject to availability, and your quotation confirms the vehicle before you pay.`,
  },
  {
    question: "My event isn't listed. Can I still book?",
    answer:
      "Yes. We list events by hand, so not every Belfast event appears. Use the request form and type in the event, venue and date.",
  },
  {
    question: "Do you sell event tickets?",
    answer:
      "No. We only provide transport. Please buy tickets from the official seller; each listing has a link to official information where available.",
  },
  {
    question: "Is this the same as an airport transfer quote?",
    answer:
      "No. Airport transfers have instant fixed prices on our homepage. Event journeys are quoted personally, so use the request form instead.",
  },
] as const;

export const BUSINESS_CLASS_REQUEST_POINTS = [
  `Up to ${BUSINESS_CLASS_MAX_PASSENGERS} passengers in our Business Class car`,
  "Corporate travel, VIP transfers, special occasions and private journeys",
  "A personal fixed quotation by email, no payment until you accept",
] as const;

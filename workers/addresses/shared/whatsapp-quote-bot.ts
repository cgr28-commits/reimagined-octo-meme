/**
 * WhatsApp quote assistant — conversation logic (no network, no storage).
 *
 * Collects journey details over one or more customer messages, asks the customer
 * to confirm a summary, then hands off to the Worker which prices the journey
 * with the website pricing engine and replies with a Quick Quote booking link.
 * Never invents a fare: prices only come from the Worker's authoritative quote.
 */

import {
  airportLabel,
  parseAirportCode,
  parseNaturalDate,
  parseQuickQuoteMessage,
  parseRelativeDateWord,
  parseUkTime,
  stripWhatsAppMarkdown,
  type QuickQuoteAirportCode,
} from "./quick-quote-parse";
import { QUICK_QUOTE_SALOON_MAX_PASSENGERS } from "./quick-quote";
import { findKnownPlaces, normaliseForKnownPlaces } from "./belfast-landmarks";
import { todayLondonDate } from "./uk-time";

export type WhatsAppQuoteDraft = {
  pickupAddress?: string;
  dropoffAddress?: string;
  airportCode?: QuickQuoteAirportCode | null;
  fromAirport?: boolean;
  returnJourney?: boolean;
  outboundDate?: string;
  outboundTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  flightNumber?: string;
};

export type WhatsAppQuoteField =
  | "pickupAddress"
  | "dropoffAddress"
  | "outboundDate"
  | "outboundTime"
  | "returnJourney"
  | "returnDate"
  | "returnTime"
  | "passengers"
  | "suitcases";

export type WhatsAppConversation = {
  stage: "collecting" | "confirming" | "quoted";
  draft: WhatsAppQuoteDraft;
  /** The single field the last question asked for — bare replies fill it. */
  awaiting?: WhatsAppQuoteField;
  lastQuoteUrl?: string;
  lastQuoteAmountLabel?: string;
  updatedAt: string;
};

/** answer: a question the journey flow can't use — the Worker answers it with AI (reply is the fallback). */
export type WhatsAppBotAction = "none" | "quote" | "handoff" | "answer";

/** Tap-to-reply button; ids starting "txt:" are read back as if the customer typed them. */
export type WhatsAppBotButton = { id: string; title: string };

export const WHATSAPP_BUTTONS = {
  yes: { id: "txt:yes", title: "✅ Yes, get price" },
  newQuote: { id: "txt:new", title: "🆕 New quote" },
  oneWay: { id: "txt:one way", title: "➡️ One way" },
  return: { id: "txt:return", title: "🔁 Return" },
} as const satisfies Record<string, WhatsAppBotButton>;

export type WhatsAppBotDecision = {
  conversation: WhatsAppConversation;
  reply: string;
  action: WhatsAppBotAction;
  /** Optional reply buttons (max 3); the reply text still works without them. */
  buttons?: WhatsAppBotButton[];
};

const CONFIRM_BUTTONS = [WHATSAPP_BUTTONS.yes, WHATSAPP_BUTTONS.newQuote];
export const WHATSAPP_QUOTED_BUTTONS = [WHATSAPP_BUTTONS.newQuote];

const BUSINESS_NAME = "My Airport Taxi NI";

export const WHATSAPP_BOT_KEYWORDS = {
  reset: ["new", "new quote", "start again", "start over", "restart", "reset", "cancel"],
  agent: ["agent", "human", "person", "staff", "speak to someone", "talk to someone", "operator"],
  confirm: ["yes", "y", "yes please", "yep", "yeah", "correct", "confirm", "ok", "okay", "that's right", "thats right", "go ahead"],
} as const;

export function newWhatsAppConversation(now = new Date()): WhatsAppConversation {
  return { stage: "collecting", draft: {}, updatedAt: now.toISOString() };
}

function keywordText(text: string): string {
  return stripWhatsAppMarkdown(text)
    .toLowerCase()
    .replace(/[!.?,👍🙏]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectWhatsAppIntent(text: string): "reset" | "agent" | "confirm" | null {
  const k = keywordText(text);
  if (!k) return null;
  if ((WHATSAPP_BOT_KEYWORDS.reset as readonly string[]).includes(k)) return "reset";
  if ((WHATSAPP_BOT_KEYWORDS.agent as readonly string[]).includes(k)) return "agent";
  if (/\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(human|person|someone|agent|staff)\b/.test(k)) {
    return "agent";
  }
  // The website's "Need help completing your booking?" button: a person should help.
  if (/\btrouble completing my (online )?booking\b/.test(k)) return "agent";
  if ((WHATSAPP_BOT_KEYWORDS.confirm as readonly string[]).includes(k)) return "confirm";
  return null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** "Friday", "on fri", "next Tuesday" → next such day (1–7 days ahead, London date). */
export function parseWeekdayDate(text: string, now = new Date()): string | null {
  const match = text
    .toLowerCase()
    .match(/\b(next\s+)?(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday)?\b/);
  if (!match) return null;
  const index = WEEKDAYS.findIndex((day) => day.startsWith(match[2].slice(0, 3)));
  if (index < 0) return null;
  const today = todayLondonDate(now);
  const todayIndex = new Date(`${today}T12:00:00Z`).getUTCDay();
  const ahead = ((index - todayIndex + 7) % 7) || 7;
  return addDays(today, ahead);
}

/**
 * Clock times written unambiguously: "5am", "5.30 pm", "17:30", "05:00".
 * Bare 4-digit numbers are ignored so years like 2026 are never read as times.
 */
export function extractClockTimes(text: string): string[] {
  const found: Array<{ index: number; value: string }> = [];
  const meridiem = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi;
  for (const m of text.matchAll(meridiem)) {
    const value = parseUkTime(`${m[1]}${m[2] ? `:${m[2]}` : ""}${m[3].replace(/\./g, "").toLowerCase()}`);
    if (value) found.push({ index: m.index ?? 0, value });
  }
  const colon = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\s*(?:am|pm|a\.m|p\.m))/gi;
  for (const m of text.matchAll(colon)) {
    // Skip dotted dates like 14.11.2026.
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1);
    if (after === "." || after === "/") continue;
    const value = parseUkTime(`${m[1]}:${m[2]}`);
    if (value) found.push({ index: m.index ?? 0, value });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.value);
}

function bareCount(text: string): number | null {
  const k = keywordText(text);
  if (/^(none|no|zero|nothing|no bags|no luggage|no suitcases|hand luggage only)$/.test(k)) return 0;
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  // The whole reply must be the count ("3", "3 people", "two bags") — not "12 Main Street".
  const m = k.match(
    /^(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:passengers?|people|persons?|pax|adults?|of us|bags?|suitcases?|cases?|please))?$/,
  );
  if (!m) return null;
  return /^\d/.test(m[1]) ? Number(m[1]) : words[m[1]];
}

function parseJourneyType(text: string): boolean | null {
  const k = keywordText(text);
  if (/\b(return|both ways|there and back|coming back|round trip)\b/.test(k)) return true;
  if (/\b(one[\s-]?way|single|just one way|no return)\b/.test(k)) return false;
  return null;
}

function looksLikeAddress(text: string): boolean {
  const k = stripWhatsAppMarkdown(text).trim();
  return k.length >= 3 && k.length <= 200 && /[a-z]/i.test(k);
}

function setAirportSide(draft: WhatsAppQuoteDraft, field: "pickupAddress" | "dropoffAddress", value: string) {
  const code = parseAirportCode(value);
  if (code) {
    draft.airportCode = code;
    draft.fromAirport = field === "pickupAddress";
    draft[field] = airportLabel(code);
  } else {
    draft[field] = value;
  }
}

type RoutePlace = { index: number; length: number; label?: string; airportCode?: QuickQuoteAirportCode };

const AIRPORT_MENTIONS: Array<{ code: QuickQuoteAirportCode; pattern: RegExp }> = [
  { code: "BFS", pattern: /\b(?:belfast international(?: airport)?|aldergrove(?: airport)?|bfs)\b/g },
  {
    code: "BHD",
    pattern:
      /\b(?:george best(?: belfast city)?(?: airport)?|belfast city airport|belfast city(?! (?:hospital|centre|center|hall|council|cemetery|library))|city airport|bhd)\b/g,
  },
  { code: "DUB", pattern: /\b(?:dublin airport|dub)\b/g },
];

/** Known places and airports named in the text, in order (no overlaps). */
function findRoutePlaces(text: string): RoutePlace[] {
  const normalised = normaliseForKnownPlaces(text);
  const places: RoutePlace[] = findKnownPlaces(text).map((p) => ({ ...p }));
  for (const { code, pattern } of AIRPORT_MENTIONS) {
    for (const m of normalised.matchAll(pattern)) {
      const index = m.index ?? 0;
      const clash = places.some((p) => index < p.index + p.length && p.index < index + m[0].length);
      if (!clash) places.push({ index, length: m[0].length, airportCode: code });
    }
  }
  return places.sort((a, b) => a.index - b.index);
}

function applyRoutePlace(
  draft: WhatsAppQuoteDraft,
  field: "pickupAddress" | "dropoffAddress",
  place: RoutePlace,
) {
  if (place.airportCode) {
    draft.airportCode = place.airportCode;
    draft.fromAirport = field === "pickupAddress";
    draft[field] = airportLabel(place.airportCode);
  } else if (place.label) {
    draft[field] = place.label;
  }
}

/**
 * "Grand Central to Belfast City airport", "from the Europa to BFS",
 * "Belfast Grand Central Station transfer to the City Airport": work out the
 * pickup and drop-off from well-known places and airports, with or without
 * "from". Returns which fields it filled.
 */
function applyKnownPlaceRoute(
  draft: WhatsAppQuoteDraft,
  text: string,
  awaiting: WhatsAppQuoteField | undefined,
): { pickup: boolean; dropoff: boolean } {
  const places = findRoutePlaces(text);
  const result = { pickup: false, dropoff: false };
  if (places.length === 0) return result;
  const normalised = normaliseForKnownPlaces(text);
  const before = (place: RoutePlace) => normalised.slice(Math.max(0, place.index - 14), place.index);
  const saysTo = (place: RoutePlace) => /\b(?:to|into|towards|for|drop(?: off)? at|going to)\s+(?:the\s+)?$/.test(before(place));
  const saysFrom = (place: RoutePlace) => /\b(?:from|pick(?: me)?(?: up)? (?:at|from)|collect(?: me)? (?:at|from))\s+(?:the\s+)?$/.test(before(place));

  if (places.length >= 2) {
    const [first, second] = places;
    // "to X from Y" reverses the order; otherwise the first named place is the pickup.
    const reversed = saysTo(first) && saysFrom(second);
    const pickup = reversed ? second : first;
    const dropoff = reversed ? first : second;
    applyRoutePlace(draft, "pickupAddress", pickup);
    applyRoutePlace(draft, "dropoffAddress", dropoff);
    return { pickup: true, dropoff: true };
  }

  const [only] = places;
  // "change the pickup to the Europa" / "destination is Grand Central": the field named wins.
  const lead = normalised.slice(0, only.index);
  const namesPickup = /\b(?:pick\s*-?up|pickup|collect(?:ion)?)\b(?!.*\b(?:drop\s*-?off|dropoff|destination)\b)/.test(lead);
  const namesDropoff = /\b(?:drop\s*-?off|dropoff|destination)\b(?!.*\b(?:pick\s*-?up|pickup|collect(?:ion)?)\b)/.test(lead);
  const field: "pickupAddress" | "dropoffAddress" | null = namesPickup && !namesDropoff
    ? "pickupAddress"
    : namesDropoff && !namesPickup
      ? "dropoffAddress"
      : saysTo(only)
    ? "dropoffAddress"
    : saysFrom(only)
      ? "pickupAddress"
      : awaiting === "pickupAddress" || awaiting === "dropoffAddress"
        ? awaiting
        : only.label
          ? // A landmark alone with no direction: fill whichever end is still missing.
            !draft.pickupAddress
            ? "pickupAddress"
            : !draft.dropoffAddress
              ? "dropoffAddress"
              : null
          : null;
  if (!field) return result;
  applyRoutePlace(draft, field, only);
  if (field === "pickupAddress") result.pickup = true;
  else result.dropoff = true;
  return result;
}

/**
 * Reply to "where should we pick you up?" that also carries other details
 * ("12 Main St, Lisburn at 15:25 tomorrow"): drop the time/date words and keep
 * the address part. Returns null when nothing address-like is left.
 */
function addressPartOf(text: string, now: Date): string | null {
  let rest = text
    .replace(/\b(?:at|for|around|about|approx\.?|@)?\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/gi, " ")
    .replace(/\b(?:at|for|around|about|@)?\s*(?:[01]?\d|2[0-3])[:.][0-5]\d\b/gi, " ")
    .replace(/\b(?:on\s+)?(?:today|tomorrow|tmrw|tonight|this (?:morning|afternoon|evening))\b/gi, " ")
    .replace(/\b(?:on\s+)?(?:next\s+)?(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/gi, " ")
    .replace(/\b(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\b(?:on\s+)?\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .replace(/\s+(?:at|on|for|please)$/i, "")
    .trim();
  if (!rest || rest === text.trim()) return null;
  if (bareCount(rest) != null || parseJourneyType(rest) != null) return null;
  if (parseNaturalDate(rest, now) || parseRelativeDateWord(rest, now).value) return null;
  rest = rest.replace(/^(?:from|pick(?:\s*-?up)?(?:\s+(?:at|from))?)\s+/i, "");
  return looksLikeAddress(rest) && rest.length >= 4 ? rest : null;
}

/** Fill airport-side address when only the airport (and direction) is known. */
function completeAirportLegs(draft: WhatsAppQuoteDraft) {
  if (!draft.airportCode || typeof draft.fromAirport !== "boolean") return;
  const label = airportLabel(draft.airportCode);
  if (draft.fromAirport && !draft.pickupAddress) draft.pickupAddress = label;
  if (!draft.fromAirport && !draft.dropoffAddress) draft.dropoffAddress = label;
}

/**
 * Merge one customer message into the draft. Returns true when anything changed.
 */
export function applyCustomerMessage(
  conversation: WhatsAppConversation,
  rawText: string,
  now = new Date(),
): boolean {
  const text = stripWhatsAppMarkdown(rawText).trim();
  if (!text) return false;
  const before = JSON.stringify(conversation.draft);
  const draft: WhatsAppQuoteDraft = { ...conversation.draft };
  const parsed = parseQuickQuoteMessage(text, now);
  const awaiting = conversation.awaiting;
  const hasRouteWords = /\b(from|to|pick\s*-?up|drop\s*-?off|destination)\b/i.test(text);

  // Addresses — a bare reply to "what's your pickup address?" is the whole address.
  if ((awaiting === "pickupAddress" || awaiting === "dropoffAddress") && !hasRouteWords) {
    const otherDetail =
      bareCount(text) != null ||
      extractClockTimes(text).length > 0 ||
      parseJourneyType(text) != null ||
      Boolean(parsed.outboundDate.value || parseRelativeDateWord(text, now).value || parseWeekdayDate(text, now));
    if (looksLikeAddress(text) && !otherDetail) {
      setAirportSide(draft, awaiting, text);
    } else if (otherDetail) {
      // "Belfast grand central at 15:25": keep the address, the time is read below.
      const address = addressPartOf(text, now);
      if (address) setAirportSide(draft, awaiting, address);
    }
  } else {
    if (parsed.pickupAddress.value) draft.pickupAddress = parsed.pickupAddress.value;
    if (parsed.dropoffAddress.value) draft.dropoffAddress = parsed.dropoffAddress.value;
    if (parsed.airportCode.value) draft.airportCode = parsed.airportCode.value;
    if (typeof parsed.fromAirport.value === "boolean") draft.fromAirport = parsed.fromAirport.value;
  }

  // Well-known places ("Grand Central", "the Europa") and "X to Y" without "from".
  applyKnownPlaceRoute(draft, text, awaiting);
  for (const field of ["pickupAddress", "dropoffAddress"] as const) {
    // A typed reply that names a known place ("belfast grand central") uses its full address.
    const value = draft[field];
    if (value && value !== conversation.draft[field]) {
      const places = findKnownPlaces(value);
      if (places.length === 1 && !parseAirportCode(value)) draft[field] = places[0].label;
    }
  }

  // Journey type — the parser defaults to one-way; only take what the customer said.
  const journeyType = parseJourneyType(text);
  if (journeyType != null) draft.returnJourney = journeyType;
  if (draft.returnJourney === false) {
    delete draft.returnDate;
    delete draft.returnTime;
  }

  // "Make it a return on 2/11 at 9pm" — once the outward leg is known, a message that
  // switches to a return with a single date/time is about the return leg.
  const returnLegOnly =
    awaiting === "returnDate" ||
    awaiting === "returnTime" ||
    (journeyType === true && Boolean(conversation.draft.outboundDate) && !parsed.returnDate.value);

  // Dates.
  const explicitDate =
    parsed.outboundDate.value ??
    parseNaturalDate(text, now) ??
    parseRelativeDateWord(text, now).value ??
    parseWeekdayDate(text, now);
  if (returnLegOnly) {
    if (explicitDate) draft.returnDate = explicitDate;
  } else {
    if (explicitDate) draft.outboundDate = explicitDate;
    if (parsed.returnDate.value) draft.returnDate = parsed.returnDate.value;
  }

  // Times — first clock time is the pickup, a second one on a return is the return pickup.
  const times = extractClockTimes(text).filter((t) => t !== parsed.flightTime.value);
  const bareTime = times.length === 0 && awaiting ? parseUkTime(text) : null;
  if (returnLegOnly) {
    const value = times[0] ?? (awaiting === "returnTime" ? bareTime : null);
    if (value) draft.returnTime = value;
  } else if (times.length > 0) {
    draft.outboundTime = times[0];
    if (times[1] && (draft.returnJourney || journeyType)) draft.returnTime = times[1];
  } else if (bareTime && awaiting === "outboundTime") {
    draft.outboundTime = bareTime;
  }

  // Counts.
  if (parsed.passengers.value != null) draft.passengers = parsed.passengers.value;
  if (parsed.suitcases.value != null) draft.suitcases = parsed.suitcases.value;
  if (awaiting === "passengers" && parsed.passengers.value == null) {
    const n = bareCount(text);
    if (n != null && n > 0) draft.passengers = n;
  }
  if (awaiting === "suitcases" && parsed.suitcases.value == null) {
    const n = bareCount(text);
    if (n != null) draft.suitcases = n;
  }

  if (parsed.flightNumber.value) draft.flightNumber = parsed.flightNumber.value;

  completeAirportLegs(draft);
  conversation.draft = draft;
  return JSON.stringify(draft) !== before;
}

export function nextMissingField(draft: WhatsAppQuoteDraft): WhatsAppQuoteField | null {
  if (!draft.pickupAddress) return "pickupAddress";
  if (!draft.dropoffAddress) return "dropoffAddress";
  if (!draft.outboundDate) return "outboundDate";
  if (!draft.outboundTime) return "outboundTime";
  if (draft.passengers == null) return "passengers";
  if (draft.suitcases == null) return "suitcases";
  if (draft.returnJourney == null) return "returnJourney";
  if (draft.returnJourney && !draft.returnDate) return "returnDate";
  if (draft.returnJourney && !draft.returnTime) return "returnTime";
  return null;
}

const QUESTIONS: Record<WhatsAppQuoteField, string> = {
  pickupAddress: "Where should we pick you up? Please send the full address with postcode, or the airport name.",
  dropoffAddress: "And where are you going? Please send the full address with postcode, or the airport name.",
  outboundDate: "What date do you need the taxi? (e.g. 14/11 or Friday)",
  outboundTime: "What time should we pick you up? (e.g. 5am or 17:30)",
  passengers: "How many passengers?",
  suitcases: "How many suitcases? (reply 0 if none)",
  returnJourney: "Is this one way, or do you need a return journey too?",
  returnDate: "What date is your return journey?",
  returnTime: "What time should we pick you up for the return?",
};

export function buildWhatsAppQuestion(field: WhatsAppQuoteField): string {
  return QUESTIONS[field];
}

/** First name for the greeting, skipping business-style profile names ("My Airport Taxi NI"). */
function greetingName(name?: string): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (/\b(taxis?|cabs?|ltd|limited|services?|airport|transfers?|travel|tours?|company|co)\b/i.test(trimmed)) {
    return null;
  }
  const first = trimmed.split(/\s+/)[0];
  return /^\p{L}[\p{L}'-]{1,}$/u.test(first) ? first : null;
}

export function buildWhatsAppWelcome(name?: string): string {
  const first = greetingName(name);
  const greeting = first ? `Hi ${first}` : "Hi";
  return (
    `${greeting}, thanks for messaging ${BUSINESS_NAME} 🚕\n\n` +
    `I can give you a fixed price and a secure booking link right here. Just tell me about your journey, for example:\n\n` +
    `_From BT9 6AA to Belfast International, 14/11 at 5am, 2 passengers, 2 suitcases, one way_`
  );
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-30" → "Fri 30 Oct 2026" (no locale/ICU dependence). */
function displayDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildWhatsAppSummary(draft: WhatsAppQuoteDraft): string {
  const lines = [
    `📍 *From:* ${draft.pickupAddress}`,
    `🏁 *To:* ${draft.dropoffAddress}`,
    `📅 *Pickup:* ${draft.outboundDate ? displayDate(draft.outboundDate) : "—"} at ${draft.outboundTime ?? "—"}`,
  ];
  if (draft.returnJourney) {
    lines.push(
      `🔁 *Return:* ${draft.returnDate ? displayDate(draft.returnDate) : "—"} at ${draft.returnTime ?? "—"}`,
    );
  } else {
    lines.push("➡️ *One way*");
  }
  lines.push(`👥 *Passengers:* ${draft.passengers}   🧳 *Suitcases:* ${draft.suitcases}`);
  if (draft.flightNumber) lines.push(`✈️ *Flight:* ${draft.flightNumber}`);
  return lines.join("\n");
}

/** Problems that stop us quoting automatically. `handoff` means pass to the team. */
export function validateWhatsAppDraft(
  draft: WhatsAppQuoteDraft,
  now = new Date(),
): { message: string; handoff?: boolean; clear?: WhatsAppQuoteField[] } | null {
  const today = todayLondonDate(now);
  if (draft.outboundDate && draft.outboundDate < today) {
    return {
      message: "That date looks like it's in the past. What date do you need the taxi?",
      clear: ["outboundDate"],
    };
  }
  if (draft.returnJourney && draft.returnDate && draft.outboundDate && draft.returnDate < draft.outboundDate) {
    return {
      message: "The return date is before the outward date. What date is your return journey?",
      clear: ["returnDate"],
    };
  }
  if (draft.passengers != null && draft.passengers > QUICK_QUOTE_SALOON_MAX_PASSENGERS) {
    return {
      message:
        `For groups of more than ${QUICK_QUOTE_SALOON_MAX_PASSENGERS} we'll arrange a larger vehicle for you. ` +
        `A member of our team will reply here with a price shortly.`,
      handoff: true,
    };
  }
  return null;
}

/** Body for createPricedQuickQuote — website pricing engine, no discount. */
export function whatsAppDraftToQuoteBody(draft: WhatsAppQuoteDraft): Record<string, unknown> {
  return {
    pickupAddress: draft.pickupAddress,
    dropoffAddress: draft.dropoffAddress,
    airportCode: draft.airportCode ?? null,
    fromAirport: draft.fromAirport ?? null,
    journeyMode: draft.returnJourney ? "return" : "one-way",
    outboundDate: draft.outboundDate,
    outboundTime: draft.outboundTime,
    returnDate: draft.returnJourney ? draft.returnDate : "",
    returnTime: draft.returnJourney ? draft.returnTime : "",
    passengers: draft.passengers,
    suitcases: draft.suitcases,
    flightNumber: draft.flightNumber ?? "",
    vehicleChoice: "Saloon",
    // Quote the fare without the optional Express terminal (barrier) fee; the
    // customer can add it on the booking page.
    expressDropOffSelected: false,
    priceSource: "website-pricing-engine",
    validityMode: "24h",
  };
}

/** Matches whatsAppSendQuoteHref's first line (src/lib/whatsapp-journey-context.ts). */
export function isWhatsAppSendQuoteMessage(text: string): boolean {
  return /^\s*hi,?\s+please send me this quote\b/i.test(text);
}

export function buildWhatsAppQuoteReply(input: {
  amountLabel: string;
  bookingUrl: string;
  /** e.g. "£5" — optional Express terminal fee not included in amountLabel. */
  optionalExpressFeeLabel?: string | null;
  /** Short notice or a request-only period: the link sends a request we confirm first. */
  requestOnly?: boolean;
}): string {
  if (input.requestOnly) {
    return (
      `Your fixed price is *${input.amountLabel}*\n\n` +
      `⚠️ This date and time is *request only*, so we need to confirm we can do it before you pay.\n\n` +
      `Send your booking request here (link valid for 24 hours):\n${input.bookingUrl}\n\n` +
      `We'll get back to you as soon as possible. Reply *NEW* for a new quote.`
    );
  }
  const expressNote = input.optionalExpressFeeLabel
    ? `This price doesn't include Express terminal access at the airport. You can add it for ${input.optionalExpressFeeLabel} when you book.\n\n`
    : "";
  return (
    `Your fixed price is *${input.amountLabel}* ✅\n\n` +
    expressNote +
    `To book, check your details and pay securely here (link valid for 24 hours):\n${input.bookingUrl}\n\n` +
    `Need to change something? Just tell me (e.g. "3 passengers" or "make it a return"). Reply *NEW* for a new quote.`
  );
}

export function buildWhatsAppQuoteFailedReply(reason?: string): string {
  return (
    `Sorry, I couldn't price that journey automatically${reason ? ` (${reason.replace(/\.$/, "")})` : ""}.\n\n` +
    `Please check both addresses include a town or postcode and send me the corrected address.`
  );
}

export type WhatsAppJourneyLeg = "outbound" | "return";

const ALT_CHOICE = /^alt (out|ret) (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

function parseAlternativeTimeChoice(
  text: string,
): { leg: WhatsAppJourneyLeg; tripDate: string; tripTime: string } | null {
  const m = text.trim().toLowerCase().match(ALT_CHOICE);
  if (!m) return null;
  return { leg: m[1] === "ret" ? "return" : "outbound", tripDate: m[2], tripTime: m[3] };
}

/** "Fri 05:45" buttons for the nearest free times (max 3). */
export function buildWhatsAppAlternativeTimeButtons(
  leg: WhatsAppJourneyLeg,
  times: Array<{ tripDate: string; tripTime: string }>,
): WhatsAppBotButton[] {
  return times.slice(0, 3).map(({ tripDate, tripTime }) => ({
    id: `txt:alt ${leg === "return" ? "ret" : "out"} ${tripDate} ${tripTime}`,
    title: `🕐 ${displayDate(tripDate).split(" ").slice(0, 3).join(" ")} ${tripTime}`.slice(0, 20),
  }));
}

/** Reply when the requested time can't be booked. */
export function buildWhatsAppUnavailableReply(input: {
  leg: WhatsAppJourneyLeg;
  draft: WhatsAppQuoteDraft;
  reason: "booked" | "closed" | "notice";
  message?: string | null;
  noticeHours?: number;
  hasAlternatives: boolean;
}): string {
  const date = input.leg === "return" ? input.draft.returnDate : input.draft.outboundDate;
  const time = input.leg === "return" ? input.draft.returnTime : input.draft.outboundTime;
  const when = `${time ?? ""}${date ? ` on ${displayDate(date)}` : ""}`.trim();
  const legLabel = input.leg === "return" ? "return pickup" : "pickup";
  if (input.reason === "notice") {
    return (
      `Sorry, we need at least ${input.noticeHours ?? 24} hours' notice to book online, so we can't confirm a ${legLabel} at ${when}.\n\n` +
      `Please send me a later date or time.`
    );
  }
  const opener =
    input.reason === "closed"
      ? input.message?.trim() || `Sorry, we're not available for a ${legLabel} at ${when}.`
      : `Sorry, we're already booked for a ${legLabel} at ${when}.`;
  return input.hasAlternatives
    ? `${opener}\n\nThe nearest times we can do are below. Tap one to get your price, or send me another time.`
    : `${opener}\n\nPlease send me another date or time and I'll check it for you.`;
}

const HANDOFF_REPLY = `No problem, a member of our team will reply here shortly. 👍`;

/**
 * Handoff reply when the assistant runs on its own number and the team answers
 * from a different WhatsApp number (e.g. a 360dialog virtual number + the owner's app).
 * The link pre-fills the journey so the customer doesn't have to repeat it.
 */
export function buildWhatsAppTeamHandoffReply(teamNumber: string, draft: WhatsAppQuoteDraft): string {
  const digits = String(teamNumber).replace(/\D/g, "");
  const largeGroup = draft.passengers != null && draft.passengers > QUICK_QUOTE_SALOON_MAX_PASSENGERS;
  const details = [
    draft.pickupAddress && `From: ${draft.pickupAddress}`,
    draft.dropoffAddress && `To: ${draft.dropoffAddress}`,
    draft.outboundDate &&
      `Date: ${displayDate(draft.outboundDate)}${draft.outboundTime ? ` at ${draft.outboundTime}` : ""}`,
    draft.returnJourney &&
      `Return: ${draft.returnDate ? displayDate(draft.returnDate) : "yes"}${draft.returnTime ? ` at ${draft.returnTime}` : ""}`,
    draft.passengers != null && `Passengers: ${draft.passengers}`,
    draft.suitcases != null && `Suitcases: ${draft.suitcases}`,
    draft.flightNumber && `Flight: ${draft.flightNumber}`,
  ].filter(Boolean);
  const prefill = details.length
    ? `Hi, I'd like a quote please:\n${details.join("\n")}`
    : "Hi, I'd like some help with a booking please.";
  const link = `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`;
  const intro = largeGroup
    ? `For groups of more than ${QUICK_QUOTE_SALOON_MAX_PASSENGERS} we'll arrange a larger vehicle for you.`
    : "No problem! 👍";
  return `${intro}\n\nTap here to chat with our team directly:\n${link}`;
}

/**
 * Decide the reply to one inbound customer message.
 * `action: "quote"` means the Worker should now price `conversation.draft`.
 */
const QUESTION_START =
  /^(what|whats|what's|how|do|does|did|can|could|is|are|was|will|would|where|when|why|which|who|should|any|have you|are there|is there)\b/i;

/** A question rather than journey details (journey changes are handled first). */
export function isWhatsAppQuestion(text: string): boolean {
  const t = stripWhatsAppMarkdown(text).trim();
  return t.includes("?") || QUESTION_START.test(t);
}

export function decideWhatsAppReply(
  existing: WhatsAppConversation | null,
  text: string,
  options: { now?: Date; profileName?: string } = {},
): WhatsAppBotDecision {
  const decision = decideJourneyReply(existing, text, options);
  // A question that changed nothing in the journey: answer it instead of repeating the
  // last prompt (e.g. "Do you have child seats?" after a quote). decision.reply stays
  // as the fallback when AI answers are unavailable.
  const draftUnchanged = JSON.stringify(existing?.draft ?? {}) === JSON.stringify(decision.conversation.draft);
  if (decision.action !== "none" || !isWhatsAppQuestion(text)) return decision;
  // "Do you go to Dublin airport?" also fills in part of the journey: answer it and keep
  // the details (the Worker re-asks the next journey question after the answer). A full
  // journey phrased as a question still goes to the summary.
  const partlyFilled = text.includes("?") && decision.conversation.stage === "collecting";
  return draftUnchanged || partlyFilled ? { ...decision, action: "answer" } : decision;
}

function decideJourneyReply(
  existing: WhatsAppConversation | null,
  text: string,
  options: { now?: Date; profileName?: string } = {},
): WhatsAppBotDecision {
  const now = options.now ?? new Date();
  const conversation: WhatsAppConversation = existing
    ? { ...existing, draft: { ...existing.draft } }
    : newWhatsAppConversation(now);
  conversation.updatedAt = now.toISOString();
  const intent = detectWhatsAppIntent(text);

  if (intent === "agent") {
    return { conversation, reply: HANDOFF_REPLY, action: "handoff" };
  }
  if (intent === "reset") {
    const fresh = newWhatsAppConversation(now);
    return { conversation: fresh, reply: buildWhatsAppWelcome(options.profileName), action: "none" };
  }
  if (intent === "confirm" && conversation.stage === "confirming") {
    return { conversation, reply: "", action: "quote" };
  }

  // Tapped one of the "nearest free times" buttons: move that leg and price straight away.
  const alt = parseAlternativeTimeChoice(text);
  if (alt) {
    if (alt.leg === "return") {
      conversation.draft.returnDate = alt.tripDate;
      conversation.draft.returnTime = alt.tripTime;
    } else {
      conversation.draft.outboundDate = alt.tripDate;
      conversation.draft.outboundTime = alt.tripTime;
    }
    if (!nextMissingField(conversation.draft)) {
      conversation.stage = "confirming";
      delete conversation.awaiting;
      return { conversation, reply: "", action: "quote" };
    }
  }

  const isNew = !existing || Object.keys(existing.draft).length === 0;
  const changed = applyCustomerMessage(conversation, text, now);

  if (!changed) {
    if (isNew) {
      return { conversation, reply: buildWhatsAppWelcome(options.profileName), action: "none" };
    }
    if (conversation.stage === "quoted") {
      return {
        conversation,
        reply:
          `Thanks! Your booking link is above${conversation.lastQuoteUrl ? `:\n${conversation.lastQuoteUrl}` : ""}.\n\n` +
          `Tell me anything you'd like to change, or reply *NEW* for a new quote.`,
        action: "none",
        buttons: WHATSAPP_QUOTED_BUTTONS,
      };
    }
    if (conversation.stage === "confirming") {
      return {
        conversation,
        reply: `Reply *YES* if these details are right, or tell me what to change.\n\n${buildWhatsAppSummary(conversation.draft)}`,
        action: "none",
        buttons: CONFIRM_BUTTONS,
      };
    }
  }

  const problem = validateWhatsAppDraft(conversation.draft, now);
  if (problem?.handoff) {
    return { conversation, reply: problem.message, action: "handoff" };
  }
  if (problem) {
    for (const field of problem.clear ?? []) delete conversation.draft[field as keyof WhatsAppQuoteDraft];
    conversation.stage = "collecting";
    conversation.awaiting = problem.clear?.[0];
    return { conversation, reply: problem.message, action: "none" };
  }

  const missing = nextMissingField(conversation.draft);
  if (missing) {
    conversation.stage = "collecting";
    const repeat = !changed && conversation.awaiting === missing;
    conversation.awaiting = missing;
    const question = buildWhatsAppQuestion(missing);
    return {
      conversation,
      reply: repeat ? `Sorry, I didn't catch that. ${question}` : question,
      action: "none",
      ...(missing === "returnJourney" ? { buttons: [WHATSAPP_BUTTONS.oneWay, WHATSAPP_BUTTONS.return] } : {}),
    };
  }

  conversation.stage = "confirming";
  delete conversation.awaiting;
  // Sent from the website quote card: the customer already saw the price, so skip the YES step.
  if (isWhatsAppSendQuoteMessage(text)) {
    return { conversation, reply: "", action: "quote" };
  }
  return {
    conversation,
    reply:
      `Thanks! Here's your journey:\n\n${buildWhatsAppSummary(conversation.draft)}\n\n` +
      `Reply *YES* to get your fixed price, or tell me what to change.`,
    action: "none",
    buttons: CONFIRM_BUTTONS,
  };
}

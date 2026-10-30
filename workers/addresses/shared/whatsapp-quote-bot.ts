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
  /** The one-time 5% "book now" offer was made for this journey (only after "too expensive"). */
  discountOffered?: boolean;
  updatedAt: string;
};

/**
 * answer: the Worker writes the reply with AI (Claude-led chat); `reply` is the fallback
 * when AI is unavailable. Journey details are still parsed here and prices only ever
 * come from the quote engine.
 */
export type WhatsAppBotAction = "none" | "quote" | "handoff" | "answer" | "discount";

/** Tap-to-reply button; ids starting "txt:" are read back as if the customer typed them. */
export type WhatsAppBotButton = { id: string; title: string };

export const WHATSAPP_BUTTONS = {
  yes: { id: "txt:yes", title: "✅ Yes, get price" },
  newQuote: { id: "txt:new", title: "🆕 New quote" },
  oneWay: { id: "txt:one way", title: "➡️ One way" },
  return: { id: "txt:return", title: "🔁 Return" },
  menuQuote: { id: "txt:menu quote", title: "🚕 Get a quote" },
  menuQuestion: { id: "txt:menu question", title: "💬 Ask a question" },
  menuBooking: { id: "txt:menu booking", title: "📋 My booking" },
} as const satisfies Record<string, WhatsAppBotButton>;

export type WhatsAppBotDecision = {
  conversation: WhatsAppConversation;
  reply: string;
  action: WhatsAppBotAction;
  /** Optional reply buttons (max 3); the reply text still works without them. */
  buttons?: WhatsAppBotButton[];
  /** With action "answer": what the AI reply should do besides responding naturally. */
  ai?: WhatsAppAiTask;
};

export type WhatsAppAiTask = {
  /** The one journey detail to ask for next (bare replies fill it). */
  askFor?: WhatsAppQuoteField;
  /** The customer's message just added journey details (acknowledge, then ask). */
  justUpdated?: boolean;
  /** The customer said the quoted price is too high. */
  priceObjection?: boolean;
};

/** First-message menu: quote, question, or an existing booking. */
export const WHATSAPP_MENU_BUTTONS = [
  WHATSAPP_BUTTONS.menuQuote,
  WHATSAPP_BUTTONS.menuQuestion,
  WHATSAPP_BUTTONS.menuBooking,
];

export type WhatsAppMenuChoice = "quote" | "question" | "booking";

/** A tapped menu button (also typed "menu quote" etc.). */
export function parseWhatsAppMenuChoice(text: string): WhatsAppMenuChoice | null {
  const m = stripWhatsAppMarkdown(text).trim().toLowerCase().match(/^menu (quote|question|booking)$/);
  return m ? (m[1] as WhatsAppMenuChoice) : null;
}

const GREETING =
  /^(hi+|hello+|hey+|hiya|howdy|yo|hallo|helo|morning|afternoon|evening|good (morning|afternoon|evening|day)|hi there|hello there|hey there|start|menu)$/;

/** Just a hello — answered with the welcome menu rather than AI. */
export function isWhatsAppGreeting(text: string): boolean {
  const t = keywordText(text).replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "").trim();
  return t === "" || GREETING.test(t);
}

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

/**
 * "14/11" or "5-11" with no year (UK day/month): this year, or next year once the
 * date has passed. Dotted forms are skipped because "4.30" is usually a time.
 */
export function parseShortDayMonth(text: string, now = new Date()): string | null {
  const m = text.match(/(?<![\d/-])(\d{1,2})[/-](\d{1,2})(?![\d/-])(?!\s*(?:am|pm)\b)/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = todayLondonDate(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (year: number) => {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T12:00:00Z`);
    return d.getUTCMonth() + 1 === month && d.getUTCDate() === day ? iso : null;
  };
  const year = Number(today.slice(0, 4));
  const thisYear = build(year);
  if (!thisYear) return null;
  return thisYear >= today ? thisYear : build(year + 1);
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

type RouteSide = { airportCode?: QuickQuoteAirportCode; label?: string; address?: string };

const ROUTE_SEPARATOR = /\s+(?:going\s+to|heading\s+to|over\s+to|to|->|→|–|—|-)\s+/i;
const ROUTE_LEAD =
  /^(?:.*?\b)?(?:from|pick(?:ed|ing)?\s*-?\s*up(?:\s+(?:at|from))?|collect(?:ed|ion)?(?:\s+(?:at|from))?)\s+(?:the\s+)?/i;
const NOT_AN_ADDRESS =
  /\b(?:need|want|looking|taxi|cab|quote|price|book(?:ing)?|lift|transfer|hi|hello|how much|can i|could i|please|going|heading|travelling|traveling|getting|get|go|taken|picked)\b/i;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const ADDRESS_TAIL = new RegExp(
  String.raw`\s*(?:,\s*)?\b(?:on|at|for|by|around|about|tomorrow|today|tonight|this|next|mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*$` +
    String.raw`|\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b.*$` +
    String.raw`|\s+\d{1,2}[/.-]\d{1,2}\b.*$` +
    String.raw`|\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+${MONTH}\b.*$` +
    String.raw`|[\s,.!]+$`,
  "i",
);

/** An airport, a well-known place, or a plain address on one side of "X to Y". */
function readRouteSide(raw: string, isPickupSide: boolean): RouteSide | null {
  const side = isPickupSide ? raw.replace(ROUTE_LEAD, "") : raw;
  const places = findRoutePlaces(side);
  if (places.length === 1) {
    const p = places[0];
    return p.airportCode ? { airportCode: p.airportCode } : { label: p.label };
  }
  if (places.length > 1) return null;
  const code = parseAirportCode(side);
  if (code) return { airportCode: code };
  const address = side.replace(ADDRESS_TAIL, "").replace(/^(?:the\s+)/i, "").trim();
  if (!looksLikeAddress(address) || address.length < 3 || NOT_AN_ADDRESS.test(address)) return null;
  // A time or date on its own ("5am", "8th November") is not a place.
  if (/^\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?$/i.test(address) || new RegExp(String.raw`^\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+${MONTH}$`, "i").test(address)) {
    return null;
  }
  if (bareCount(address) != null || parseJourneyType(address) != null) return null;
  return { address };
}

/**
 * "Dublin airport to Belfast", "Dublin to Grand Central", "Grand Central going to BT36 7FU",
 * "Dublin airport T2 to Lisburn": when one side of "X to Y" is an airport or a well-known
 * place, the first side is the pickup and the second the drop-off.
 */
function applySimpleRoute(draft: WhatsAppQuoteDraft, text: string) {
  const sep = text.match(ROUTE_SEPARATOR);
  if (!sep || sep.index == null) return;
  const left = text.slice(0, sep.index);
  const right = text.slice(sep.index + sep[0].length);
  if (/\bfrom\b/i.test(right) && !/\bfrom\b/i.test(left)) return; // "to X from Y" is handled elsewhere
  // "Change the pickup to the Europa": a correction, handled by the field-change logic.
  if (/\b(?:change|changing|instead|actually|switch|swap|make it|move)\b/i.test(left)) return;
  if (/\b(?:pick\s*-?\s*up|pickup|drop\s*-?\s*off|dropoff|destination|address)[\s,.]*$/i.test(left)) return;
  const from = readRouteSide(left, true);
  const to = readRouteSide(right, false);
  if (!from && !to) return;
  if (!(from?.airportCode || from?.label || to?.airportCode || to?.label)) {
    // Two plain addresses: only a clear postcode/house-number pickup, as before.
    if (from?.address && /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b|^\d+[a-z]?,?\s+\p{L}/iu.test(from.address)) {
      if (!draft.pickupAddress || from.address.toLowerCase().startsWith(draft.pickupAddress.toLowerCase())) {
        draft.pickupAddress = from.address;
      }
    }
    return;
  }
  const apply = (field: "pickupAddress" | "dropoffAddress", side: RouteSide | null) => {
    if (!side) return;
    if (side.airportCode) {
      draft.airportCode = side.airportCode;
      draft.fromAirport = field === "pickupAddress";
      draft[field] = airportLabel(side.airportCode);
    } else if (side.label) {
      draft[field] = side.label;
    } else if (side.address) {
      draft[field] = side.address;
    }
  };
  // The other field may hold an airport set the wrong way round by the general parser.
  if (from && !to && draft.dropoffAddress && draft.dropoffAddress === airportLabel(from.airportCode ?? "BFS") && from.airportCode) {
    delete draft.dropoffAddress;
  }
  if (to && !from && draft.pickupAddress && to.airportCode && draft.pickupAddress === airportLabel(to.airportCode)) {
    delete draft.pickupAddress;
  }
  apply("pickupAddress", from);
  apply("dropoffAddress", to);
}

const STREET_WORDS =
  /\b(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|way|crescent|cres|close|gardens|gdns|grove|hill|place|pl|terrace|court|ct|view|square|sq|manor|park|row|walk|mews|green|brae|heights|meadows|rise|vale|glen|wood|lodge|parade|boulevard|quay|wharf|estate|cottages|farm|town ?land)\b/i;
const BUSINESS_WORDS =
  /\b(?:hotel|inn|lodge|hospital|clinic|station|airport|port|terminal|harbour|ferry|university|college|school|campus|centre|center|arena|stadium|golf|club|church|chapel|bar|pub|restaurant|cafe|shop|store|tesco|asda|sainsbury'?s?|lidl|aldi|ltd|limited|house|hall|castle|museum|zoo|theatre|cinema|office|offices|depot|works|factory|marina|cathedral|abbey|leisure|spa|resort|retail|outlet|mall|plaza|exchange|barracks|prison|council|court ?house)\b/i;
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b|\b[AC-FHKNPRTV-Y]\d{2}\s?[0-9AC-FHKNPRTV-Y]{4}\b/i;

/**
 * Just a town or city ("Lisburn", "Belfast", "Newry") — not precise enough to price a
 * pickup. Postcodes, house numbers, streets, airports, well-known places and businesses
 * (hotel, hospital, station…) are fine.
 */
export function isWhatsAppTownOnlyAddress(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v || parseAirportCode(v) || findKnownPlaces(v).length) return false;
  if (/\d/.test(v) || POSTCODE.test(v) || STREET_WORDS.test(v) || BUSINESS_WORDS.test(v)) return false;
  const words = v.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  return words.length <= 3;
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

  // We asked for the full address after just a town: keep the town with the street.
  if (awaiting === "pickupAddress" || awaiting === "dropoffAddress") {
    const before = conversation.draft[awaiting];
    const after = draft[awaiting];
    if (before && after && after !== before && isWhatsAppTownOnlyAddress(before) &&
        !after.toLowerCase().includes(before.toLowerCase()) && !parseAirportCode(after) && !findKnownPlaces(after).length &&
        !POSTCODE.test(after)) {
      draft[awaiting] = `${after.replace(/[\s,]+$/, "")}, ${before}`;
    }
  }

  // Well-known places ("Grand Central", "the Europa") and "X to Y" without "from".
  applyKnownPlaceRoute(draft, text, awaiting);
  applySimpleRoute(draft, text);
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
    parseQuickQuoteMessage(text.replace(/(\d)(st|nd|rd|th)?\s+of\s+/gi, "$1$2 "), now).outboundDate.value ??
    parseRelativeDateWord(text, now).value ??
    parseWeekdayDate(text, now) ??
    parseShortDayMonth(text, now);
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
  else if (/\b(?:no|zero|0)\s+(?:luggage|bags?|suitcases?|cases)\b|\bhand luggage only\b/i.test(text)) draft.suitcases = 0;
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

const FIELD_LABELS: Record<WhatsAppQuoteField, string> = {
  pickupAddress: "the pickup address or postcode",
  dropoffAddress: "where they are going (address, postcode or airport)",
  outboundDate: "the date of the journey",
  outboundTime: "the pickup time",
  passengers: "how many passengers",
  suitcases: "how many suitcases (0 is fine)",
  returnJourney: "whether it is one way or a return",
  returnDate: "the date of the return journey",
  returnTime: "the pickup time for the return journey",
};

/** Plain description of a journey detail, for the AI prompt. */
export function describeWhatsAppField(field: WhatsAppQuoteField): string {
  return FIELD_LABELS[field];
}

/** Only the details collected so far (no placeholders), for the AI prompt. */
export function describeWhatsAppDraft(draft: WhatsAppQuoteDraft): string {
  const lines = [
    draft.pickupAddress && `From: ${draft.pickupAddress}`,
    draft.dropoffAddress && `To: ${draft.dropoffAddress}`,
    draft.outboundDate && `Date: ${displayDate(draft.outboundDate)}`,
    draft.outboundTime && `Pickup time: ${draft.outboundTime}`,
    draft.passengers != null && `Passengers: ${draft.passengers}`,
    draft.suitcases != null && `Suitcases: ${draft.suitcases}`,
    draft.returnJourney === false && "One way",
    draft.returnJourney === true &&
      `Return: ${draft.returnDate ? displayDate(draft.returnDate) : "date to confirm"}${draft.returnTime ? ` at ${draft.returnTime}` : ""}`,
    draft.flightNumber && `Flight: ${draft.flightNumber}`,
  ].filter(Boolean);
  return lines.join("\n");
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
    `How can I help today? Tap an option below, or just type your message — ask me anything, ` +
    `tell me about a journey for a fixed price, or send your booking reference.`
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
): { message: string; handoff?: boolean; clear?: WhatsAppQuoteField[]; keep?: boolean; ask?: WhatsAppQuoteField } | null {
  const today = todayLondonDate(now);
  // "From Belfast International to Belfast International": ask for the other address.
  const samePlace =
    draft.pickupAddress &&
    draft.dropoffAddress &&
    (draft.pickupAddress.trim().toLowerCase() === draft.dropoffAddress.trim().toLowerCase() ||
      (parseAirportCode(draft.pickupAddress) != null &&
        parseAirportCode(draft.pickupAddress) === parseAirportCode(draft.dropoffAddress)));
  if (samePlace) {
    const place = draft.pickupAddress!;
    return {
      message:
        `Your pickup and drop-off are both ${place}. If we're collecting you there, where are you going? ` +
        `If you're going there, where should we pick you up? A postcode or full address is perfect.`,
      clear: draft.fromAirport === false ? ["pickupAddress"] : ["dropoffAddress"],
    };
  }
  for (const field of ["pickupAddress", "dropoffAddress"] as const) {
    const town = draft[field];
    if (town && isWhatsAppTownOnlyAddress(town)) {
      return {
        message:
          field === "pickupAddress"
            ? `Thanks! What's the full pickup address in ${town}? A house number and street, or a postcode, is perfect.`
            : `Thanks! What's the full address you're going to in ${town}? A house number and street, or a postcode — or the name of the hotel or business.`,
        keep: true,
        ask: field,
      };
    }
  }
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

/** What every booking includes — shown with the price and when a customer says it's too much. */
export const WHATSAPP_BOOKING_BENEFITS =
  `*What's included:*\n` +
  `✅ Fixed price — it won't change with traffic or delays\n` +
  `🚘 Pre-booked driver\n` +
  `✈️ We monitor your flight, with up to 60 minutes' waiting included on airport pickups\n` +
  `⏱️ 10 minutes' complimentary waiting on non-airport pickups\n` +
  `↩️ Cancel up to 24 hours before pickup for a full refund`;

export function buildWhatsAppQuoteReply(input: {
  amountLabel: string;
  bookingUrl: string;
  /** Kept for callers; the optional Express fee is shown on the booking page, not in the chat. */
  optionalExpressFeeLabel?: string | null;
  /** Short notice or a request-only period: the link sends a request we confirm first. */
  requestOnly?: boolean;
}): string {
  if (input.requestOnly) {
    return (
      `Your fixed price is *${input.amountLabel}*\n\n` +
      `${WHATSAPP_BOOKING_BENEFITS}\n\n` +
      `⚠️ This date and time is *request only*, so we need to confirm we can do it before you pay.\n\n` +
      `Send your booking request here (link valid for 24 hours):\n${input.bookingUrl}\n\n` +
      `We'll get back to you as soon as possible. Reply *NEW* for a new quote.`
    );
  }
  return (
    `Your fixed price is *${input.amountLabel}* ✅\n\n` +
    `${WHATSAPP_BOOKING_BENEFITS}\n\n` +
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
const PRICE_OBJECTION =
  /\b(?:too\s+(?:expensive|dear|much|pricey|high)|(?:very|bit|quite|really|so)\s+(?:expensive|dear|pricey)|expensive|pricey|overpriced|rip\s*-?\s*off|cheaper|(?:can|could)\s+you\s+do\s+(?:it\s+)?(?:for\s+)?less|any\s+discount|best\s+price|lower\s+(?:the\s+)?price|(?:got|get|found)\s+(?:it\s+)?(?:for\s+)?less)\b/i;

/** "That's too expensive", "can you do it cheaper?" */
export function isWhatsAppPriceObjection(text: string): boolean {
  return PRICE_OBJECTION.test(stripWhatsAppMarkdown(text));
}

const TOO_EXPENSIVE =
  /\b(?:too\s+(?:expensive|dear|much|pricey|high|steep)|(?:very|bit|quite|really|so|abit)\s+(?:expensive|dear|pricey|steep)|expensive|pricey|overpriced|rip\s*-?\s*off|daylight\s+robbery)\b/i;

/** Says the price is too expensive — the only trigger for the 5% offer (not "any discount?"). */
export function isWhatsAppTooExpensive(text: string): boolean {
  const t = stripWhatsAppMarkdown(text);
  return TOO_EXPENSIVE.test(t) && !/\bnot\s+(?:too\s+)?(?:expensive|dear|pricey)\b/i.test(t);
}

/** Percent off the 5% "book now" offer. */
export const WHATSAPP_BOOK_NOW_DISCOUNT_PERCENT = 5;

/** Reply with the discounted booking link after "too expensive". */
export function buildWhatsAppDiscountOfferReply(input: {
  previousAmountLabel?: string;
  amountLabel: string;
  bookingUrl: string;
  optionalExpressFeeLabel?: string | null;
}): string {
  const was = input.previousAmountLabel ? ` (was ${input.previousAmountLabel})` : "";
  return (
    `I understand. Just so you know, your price includes:\n` +
    `✅ A fixed price — it won't change with traffic or delays\n` +
    `🚘 A pre-booked driver\n` +
    `✈️ Flight monitoring, with up to 60 minutes' waiting included on airport pickups\n` +
    `⏱️ 10 minutes' complimentary waiting on non-airport pickups\n` +
    `↩️ Free cancellation up to 24 hours before pickup for a full refund\n\n` +
    `If you book now, I can give you *${WHATSAPP_BOOK_NOW_DISCOUNT_PERCENT}% off* — your new price is *${input.amountLabel}*${was} 🎉\n\n` +
    `Book here (link valid for 24 hours):\n${input.bookingUrl}`
  );
}

/** Fixed reply to a price objection (the AI writes its own version when available). */
export function buildWhatsAppPriceValueReply(draft: WhatsAppQuoteDraft): string {
  const airportPickup = Boolean(draft.airportCode && draft.fromAirport);
  return (
    `I understand. Just so you know what's included: it's a *fixed price*, so it won't change with traffic or delays, ` +
    `and you have a *pre-booked driver* waiting for you. ` +
    (airportPickup
      ? `We monitor your flight, and up to *60 minutes' waiting time* from landing is included. `
      : `On airport pickups we monitor your flight with up to *60 minutes' waiting time* included, and other pickups include *10 minutes'* complimentary waiting. `) +
    `You can cancel up to 24 hours before pickup for a full refund, so you can book with confidence.\n\n` +
    `If you'd like to go ahead, your booking link is above.`
  );
}

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
  if (decision.action !== "none" || !decision.kind) return stripKind(decision);
  // Claude-led chat: the AI writes every conversational reply. Fixed replies stay for
  // a plain hello (menu), resets, validation problems and the confirm summary, so
  // prices and booking steps never depend on the model.
  switch (decision.kind) {
    case "welcome":
      return isWhatsAppGreeting(text) ? stripKind(decision) : { ...stripKind(decision), action: "answer", buttons: undefined, ai: {} };
    case "ask":
      return { ...stripKind(decision), action: "answer", ai: { askFor: decision.conversation.awaiting, justUpdated: true } };
    case "askRepeat":
      return { ...stripKind(decision), action: "answer", ai: { askFor: decision.conversation.awaiting, justUpdated: false } };
    case "quotedNoChange":
      if (isWhatsAppTooExpensive(text) && !decision.conversation.discountOffered) {
        return { ...stripKind(decision), action: "discount", buttons: undefined };
      }
      return isWhatsAppPriceObjection(text)
        ? { ...stripKind(decision), action: "answer", reply: buildWhatsAppPriceValueReply(decision.conversation.draft), ai: { priceObjection: true } }
        : { ...stripKind(decision), action: "answer", ai: {} };
    case "confirmNoChange":
      return { ...stripKind(decision), action: "answer", ai: {} };
    default:
      return stripKind(decision);
  }
}

type ReplyKind = "welcome" | "ask" | "askRepeat" | "quotedNoChange" | "confirmNoChange";
type KindedDecision = WhatsAppBotDecision & { kind?: ReplyKind };

function stripKind(decision: KindedDecision): WhatsAppBotDecision {
  const { kind: _kind, ...rest } = decision;
  return rest;
}

function decideJourneyReply(
  existing: WhatsAppConversation | null,
  text: string,
  options: { now?: Date; profileName?: string } = {},
): KindedDecision {
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
    return {
      conversation: fresh,
      reply: buildWhatsAppWelcome(options.profileName),
      action: "none",
      buttons: WHATSAPP_MENU_BUTTONS,
    };
  }

  const menu = parseWhatsAppMenuChoice(text);
  if (menu === "quote") {
    const fresh = newWhatsAppConversation(now);
    fresh.awaiting = "pickupAddress";
    return {
      conversation: fresh,
      reply:
        "Lovely 🙂 Where would you like picking up from, and where are you heading? " +
        "A postcode or full address is perfect — you can send the date, time and number of passengers too if you have them.",
      action: "none",
    };
  }
  if (menu === "question") {
    return { conversation, reply: "Of course — what would you like to know?", action: "none" };
  }
  if (menu === "booking") {
    return {
      conversation,
      reply: "Please send your booking reference (it starts with MAT-, e.g. MAT-1234) and I'll look it up for you.",
      action: "none",
    };
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
      return {
        conversation,
        reply: buildWhatsAppWelcome(options.profileName),
        action: "none",
        buttons: WHATSAPP_MENU_BUTTONS,
        kind: "welcome",
      };
    }
    if (conversation.stage === "quoted") {
      return {
        conversation,
        reply:
          `Thanks! Your booking link is above${conversation.lastQuoteUrl ? `:\n${conversation.lastQuoteUrl}` : ""}.\n\n` +
          `Tell me anything you'd like to change, or reply *NEW* for a new quote.`,
        action: "none",
        buttons: WHATSAPP_QUOTED_BUTTONS,
        kind: "quotedNoChange",
      };
    }
    if (conversation.stage === "confirming") {
      return {
        conversation,
        reply: `Reply *YES* if these details are right, or tell me what to change.\n\n${buildWhatsAppSummary(conversation.draft)}`,
        action: "none",
        buttons: CONFIRM_BUTTONS,
        kind: "confirmNoChange",
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
    conversation.awaiting = problem.ask ?? problem.clear?.[0];
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
      kind: changed ? "ask" : "askRepeat",
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

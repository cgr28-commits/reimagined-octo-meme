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

export type WhatsAppBotAction = "none" | "quote" | "handoff";

export type WhatsAppBotDecision = {
  conversation: WhatsAppConversation;
  reply: string;
  action: WhatsAppBotAction;
};

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
    if (looksLikeAddress(text) && !otherDetail) setAirportSide(draft, awaiting, text);
  } else {
    if (parsed.pickupAddress.value) draft.pickupAddress = parsed.pickupAddress.value;
    if (parsed.dropoffAddress.value) draft.dropoffAddress = parsed.dropoffAddress.value;
    if (parsed.airportCode.value) draft.airportCode = parsed.airportCode.value;
    if (typeof parsed.fromAirport.value === "boolean") draft.fromAirport = parsed.fromAirport.value;
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

export function buildWhatsAppWelcome(name?: string): string {
  const greeting = name ? `Hi ${name.split(/\s+/)[0]}` : "Hi";
  return (
    `${greeting}, thanks for messaging ${BUSINESS_NAME} 🚕\n\n` +
    `I can give you a fixed price and a secure booking link right here. Just tell me about your journey, for example:\n\n` +
    `_From BT9 6AA to Belfast International, 14/11 at 5am, 2 passengers, 2 suitcases, one way_\n\n` +
    `Reply *AGENT* at any time to speak to our team.`
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
    priceSource: "website-pricing-engine",
    validityMode: "24h",
  };
}

export function buildWhatsAppQuoteReply(input: { amountLabel: string; bookingUrl: string }): string {
  return (
    `Your fixed price is *${input.amountLabel}* ✅\n\n` +
    `To book, check your details and pay securely here (link valid for 24 hours):\n${input.bookingUrl}\n\n` +
    `Need to change something? Just tell me (e.g. "3 passengers" or "make it a return"). Reply *NEW* for a new quote or *AGENT* to speak to our team.`
  );
}

export function buildWhatsAppQuoteFailedReply(reason?: string): string {
  return (
    `Sorry, I couldn't price that journey automatically${reason ? ` (${reason.replace(/\.$/, "")})` : ""}.\n\n` +
    `Please check both addresses include a town or postcode and send any corrections, or reply *AGENT* and our team will help.`
  );
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
export function decideWhatsAppReply(
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
          `Tell me anything you'd like to change, reply *NEW* for a new quote, or *AGENT* to speak to our team.`,
        action: "none",
      };
    }
    if (conversation.stage === "confirming") {
      return {
        conversation,
        reply: `Reply *YES* if these details are right, or tell me what to change.\n\n${buildWhatsAppSummary(conversation.draft)}`,
        action: "none",
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
    };
  }

  conversation.stage = "confirming";
  delete conversation.awaiting;
  return {
    conversation,
    reply:
      `Thanks! Here's your journey:\n\n${buildWhatsAppSummary(conversation.draft)}\n\n` +
      `Reply *YES* to get your fixed price, or tell me what to change.`,
    action: "none",
  };
}

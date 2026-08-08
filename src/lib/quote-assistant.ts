import {
  AIRPORTS,
  AREAS,
  DRIVER_TRACKING_HIGHLIGHTS,
  FAQS,
  SITE,
  VEHICLE_FLEET,
  VEHICLE_TYPES,
  WHY_CHOOSE_US,
  isVehicleEnquiryOnly,
} from "@/lib/data";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import { TERMS_SECTIONS } from "@/lib/terms";
import { calculateQuote, formatQuote, matchAreaFromAddress } from "@/lib/quote";

export type AssistantMessage = {
  role: "bot" | "user";
  text: string;
  quoteCard?: QuoteCardSummary;
};

export type QuoteCardSummary = {
  amount: number;
  amountLabel: string;
  directionLabel: string;
  airportName: string;
  vehicle: string;
  passengers: number;
  suitcases: number;
  returnJourney: boolean;
  address: string;
  area: string | null;
  waitingNote: string;
};

export type QuoteDraft = {
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  address?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: (typeof VEHICLE_TYPES)[number];
  returnJourney?: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
};

export type AssistantResponse = {
  reply: string;
  draft: QuoteDraft;
  quickReplies?: string[];
  resetDraft?: boolean;
  showContactOffer?: boolean;
  /** Open the live quote tool with this draft for booking */
  openQuoteForm?: boolean;
  quoteCard?: QuoteCardSummary;
  /** Consecutive unanswered / misunderstood turns — UI should pass this back in. */
  consecutiveMisses?: number;
  /** Open WhatsApp to a human (site WhatsApp number). */
  openWhatsAppHandoff?: boolean;
};

export type AssistantContext = {
  consecutiveMisses?: number;
};

type MissingField =
  | "direction"
  | "returnJourney"
  | "airport"
  | "address"
  | "tripDate"
  | "tripTime"
  | "returnDate"
  | "returnTime"
  | "passengers"
  | "suitcases";

const AIRPORT_ALIASES: Record<string, string> = {
  bfs: "BFS",
  aldergrove: "BFS",
  "belfast international airport": "BFS",
  "belfast international": "BFS",
  "belfast airport": "BFS",
  "international airport": "BFS",
  international: "BFS",
  "the international": "BFS",
  dub: "DUB",
  "dublin airport ireland": "DUB",
  "dublin airport": "DUB",
  dublin: "DUB",
  ldy: "LDY",
  "city of derry airport": "LDY",
  "city of derry": "LDY",
  "derry airport": "LDY",
  "londonderry airport": "LDY",
  londonderry: "LDY",
  derry: "LDY",
};

function sectionText(section: {
  title: string;
  content?: readonly string[];
  list?: readonly string[];
  footer?: string;
  subsections?: ReadonlyArray<{ subtitle: string; content: readonly string[] }>;
}): string {
  const parts: string[] = [];
  if (section.content) parts.push(...section.content);
  if (section.list) parts.push(...section.list);
  if (section.footer) parts.push(section.footer);
  if (section.subsections) {
    for (const sub of section.subsections) {
      parts.push(sub.subtitle, ...sub.content);
    }
  }
  return parts.join(" ");
}

function knowledgeChunks(): Array<{ title: string; body: string }> {
  const chunks: Array<{ title: string; body: string }> = FAQS.map((faq) => ({
    title: faq.question,
    body: faq.answer,
  }));

  for (const section of TERMS_SECTIONS) {
    chunks.push({ title: section.title, body: sectionText(section) });
  }
  for (const section of PRIVACY_SECTIONS) {
    chunks.push({ title: `Privacy — ${section.title}`, body: sectionText(section) });
  }
  for (const item of WHY_CHOOSE_US) {
    chunks.push({ title: item.title, body: item.description });
  }
  for (const item of DRIVER_TRACKING_HIGHLIGHTS) {
    chunks.push({ title: item.title, body: item.description });
  }

  chunks.push(
    {
      title: "How booking works",
      body:
        "Use Get a Live Quote on the website (or this chat) to get your fixed journey price with the same pricing as the quote tool. Then Request to book / Enquire to book. Enter your name, mobile, email and flight number(s), accept the terms, and send. Once we confirm your job, we email a SumUp payment link. Your booking is confirmed after payment. Executive Saloon and Minibus are enquiry-only.",
    },
    {
      title: "Quote tool flow",
      body:
        "The quote tool asks: trip type (to or from airport), one way or return, airport, full pickup or drop-off address, passengers, and suitcases, then shows the fixed journey price and vehicle. Pickup date and time are collected when you choose to book. Booking continues on the quote form with date/time, contact details, flight numbers and terms.",
    },
    {
      title: "Airports we cover",
      body: `We cover ${AIRPORTS.map((a) => a.name).join(", ")}. Prices include express drop-off and up to 60 minutes complimentary waiting time after landing for airport pickups.`,
    },
    {
      title: "Areas we cover",
      body: `We cover towns and areas across Northern Ireland including ${AREAS.join(", ")}.`,
    },
    {
      title: "Fleet and vehicles",
      body: VEHICLE_FLEET.map((v) => `${v.name} (${v.capacity}): ${v.description}`).join(" "),
    },
    {
      title: "Contact details",
      body: `Call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, email ${SITE.email}, or save our contact card from this chat or ${SITE.url}/contact/.`,
    },
    {
      title: "Booster seats and child seats",
      body:
        "Booster seats and child seats can be requested during booking, but they are not guaranteed. Please request them in advance so we can check availability. If a legally required child seat cannot be provided, we may be unable to carry the journey.",
    },
    {
      title: "Meet and greet",
      body:
        "For arrivals we can meet you in the arrivals hall with a name board when requested. Ask for meet and greet when you book and share your flight number so we can track delays.",
    },
    {
      title: "Flight delays and waiting time",
      body:
        "We track your flight and adjust pickup for delays or early landings at no extra charge. Airport pickups include up to 60 minutes complimentary waiting after landing. Parking at the airport is included in the price.",
    },
    {
      title: "Cash and payment options",
      body:
        "You can pay by cash to the driver, bank transfer, payment link (text or WhatsApp), or securely online by card through SumUp. Corporate accounts are available for regular travellers.",
    },
  );

  return chunks;
}

function matchKnowledge(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords = lower
    .split(/[^a-z0-9£%]+/i)
    .filter((word) => word.length > 2);

  let best: { score: number; body: string } | null = null;

  for (const chunk of knowledgeChunks()) {
    const haystack = `${chunk.title} ${chunk.body}`.toLowerCase();
    let score = 0;
    for (const word of keywords) {
      if (haystack.includes(word)) {
        score += word.length > 5 ? 2 : 1;
      }
    }

    if (/cancel|refund|money back|admin/.test(lower) && /cancel|refund/.test(haystack)) score += 5;
    if (/wait|flight delay|delayed|late landing/.test(lower) && /wait|flight|delay/.test(haystack)) score += 5;
    if (/meet.?and.?greet|name board|arrivals hall/.test(lower) && /meet|greet|arrivals|name board/.test(haystack)) score += 6;
    if (/child.?seat|booster|baby seat|car seat/.test(lower) && /child|booster|seat/.test(haystack)) score += 5;
    if (/parking|park at (the )?airport/.test(lower) && /parking|airport/.test(haystack)) score += 5;
    if (/cash|pay (by |with )?cash|card or cash/.test(lower) && /cash|pay|card|sumup|payment/.test(haystack)) score += 5;
    if (/vehicle|minibus|estate|saloon|executive|fleet/.test(lower) && /vehicle|fleet|saloon|estate|minibus/.test(haystack)) score += 3;
    if (/book|confirm|payment|sumup|pay/.test(lower) && /book|confirm|payment|sumup|pay/.test(haystack)) score += 3;
    if (/privacy|data|gdpr|marketing email/.test(lower) && /privacy|data|marketing|personal/.test(haystack)) score += 5;
    if (/track|driver location|live track/.test(lower) && /track|driver|location/.test(haystack)) score += 4;
    if (/hour|24\/7|christmas|bank holiday|night|early morning/.test(lower) && /24|365|christmas|bank|early/.test(haystack)) score += 4;
    if (/contact|phone|email|whatsapp|number|landline/.test(lower) && /contact|whatsapp|email|call|landline/.test(haystack)) score += 3;
    if (/airport|cover|areas?|pickup point|where do you pick/.test(lower) && /airport|cover|belfast|dublin|derry|areas|pickup|arrivals/.test(haystack)) score += 2;

    if (score > 0 && (!best || score > best.score)) {
      best = { score, body: chunk.body };
    }
  }

  if (!best || best.score < 3) return null;
  return best.body;
}

function matchAirport(text: string): string | undefined {
  const lower = text.toLowerCase();
  const aliases = Object.entries(AIRPORT_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, code] of aliases) {
    if (lower.includes(alias)) return code;
  }
  return undefined;
}

function matchAreaMention(text: string): string | undefined {
  const matched = matchAreaFromAddress(text);
  if (matched) return matched;

  const lower = text.toLowerCase();
  for (const area of [...AREAS].sort((a, b) => b.length - a.length)) {
    if (lower.includes(area.toLowerCase())) return area;
  }
  return undefined;
}

/** Full street address with door / house number AND town or BT postcode — required before pricing. */
export function isCompleteStreetAddress(address: string): boolean {
  const trimmed = address.trim().replace(/[?.!]+$/, "");
  if (trimmed.length < 10) return false;

  const lower = trimmed.toLowerCase();
  if (AREAS.some((area) => area.toLowerCase() === lower)) return false;
  // Postcode alone is not enough.
  if (/^bt\d{1,2}\s*\d[a-z]{2}$/i.test(trimmed)) return false;

  // Must include a Northern Ireland town or BT district so the fare area is known.
  const hasTown =
    AREAS.some((area) => lower.includes(area.toLowerCase())) || /\bbelfast\b/i.test(lower);
  const hasPostcodeDistrict = /\bbt\d{1,2}\b/i.test(trimmed);
  if (!hasTown && !hasPostcodeDistrict) return false;

  // Door / house / flat number — ignore digits that only appear in the postcode.
  const withoutPostcode = trimmed
    .replace(/\bbt\d{1,2}\s*\d[a-z]{2}\b/gi, " ")
    .replace(/\bbt\d{1,2}\b/gi, " ");
  if (/\b(?:flat|apt|apartment|unit|suite)\s*\d+[a-z]?\b/i.test(withoutPostcode)) return true;
  if (/\b\d+[a-z]?\b/i.test(withoutPostcode)) return true;

  return false;
}

/** Address is complete and matches a priced area (avoids default “unknown area” fares). */
export function isPricableStreetAddress(address: string, airportCode?: string): boolean {
  if (!isCompleteStreetAddress(address)) return false;
  if (airportCode === "LDY") {
    // LDY uses its own Belfast-area gate inside calculateQuote.
    return Boolean(matchAreaFromAddress(address));
  }
  return matchAreaFromAddress(address) !== null;
}

function incompleteAddressPrompt(draft: QuoteDraft): AssistantResponse {
  const airportName =
    AIRPORTS.find((item) => item.code === draft.airportCode)?.name ?? draft.airportCode;
  const place =
    draft.direction === "from-airport"
      ? "drop-off"
      : "pickup";

  return {
    reply:
      `I need your full ${place} address before I can quote a price` +
      `${airportName ? ` for ${airportName}` : ""}.\n\n` +
      `Include:\n` +
      `• door / house number\n` +
      `• street\n` +
      `• town (or BT postcode)\n\n` +
      `Example: 12 High Street, Bangor, BT20.\n` +
      `Pick a suggestion from the list so the address is complete — a street name alone is not enough.`,
    draft,
    quickReplies: [],
    consecutiveMisses: 0,
  };
}

function unpricedAreaPrompt(draft: QuoteDraft, address: string): AssistantResponse {
  const airportName =
    AIRPORTS.find((item) => item.code === draft.airportCode)?.name ?? "that airport";

  if (draft.airportCode === "LDY") {
    return {
      reply:
        `I can see “${address}”, but City of Derry Airport transfers are priced for the greater Belfast area only.\n\n` +
        `Please enter a full Belfast-area address (for example Bangor, Lisburn, or BT20), or speak to us for a custom quote.`,
      draft: { ...draft, address: undefined },
      quickReplies: ["Speak to someone", "Get a quote", "Save to contacts"],
      consecutiveMisses: 0,
    };
  }

  return {
    reply:
      `I can see “${address}”, but it isn’t in an area I can auto-price for ${airportName} yet.\n\n` +
      `Try a full street address with town or BT postcode from our usual coverage (for example Bangor, Lisburn, Newtownabbey), or speak to us and we’ll quote you manually.`,
    draft: { ...draft, address: undefined },
    quickReplies: ["Speak to someone", "Get a quote", "Save to contacts"],
    consecutiveMisses: 0,
  };
}

function humanHandoffReply(draft: QuoteDraft): AssistantResponse {
  return {
    reply:
      `No problem — you can talk to us directly.\n\n` +
      `Call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, or email ${SITE.email}.\n\n` +
      `Tap below to open WhatsApp with a short message ready, or save our contact card.`,
    draft,
    quickReplies: ["Open WhatsApp", "Save to contacts", "Get a quote"],
    openWhatsAppHandoff: true,
    consecutiveMisses: 0,
  };
}

function stripQuoteNoise(text: string): string {
  return text
    .replace(/\b(today|tomorrow)\b/gi, " ")
    .replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, " ")
    .replace(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/g, " ")
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, " ")
    .replace(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi, " ")
    .replace(
      /\b(\d+)\s*(passengers?|people|adults?|pax|suitcases?|cases?|bags?|luggage)\b/gi,
      " ",
    )
    .replace(/\b(no|zero)\s+(suitcases?|cases?|bags?|luggage)\b/gi, " ")
    .replace(/\b(minibus|executive|estate|saloon)\b/gi, " ")
    .replace(/\b(one[- ]?way|return(?: journey)?)\b/gi, " ")
    .replace(
      /\b(belfast international(?: airport)?|aldergrove|dublin(?: airport)?|city of derry(?: airport)?|derry(?: airport)?|londonderry(?: airport)?|bfs|dub|ldy)\b/gi,
      " ",
    )
    .replace(
      /\b(to|from|at|the)\s+(airport)\b/gi,
      " ",
    )
    .replace(/\b(get a quote|quote|price|how much|fare|cost)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a likely full street address out of a messy one-line quote request. */
function extractAddressCandidate(text: string): string | undefined {
  const fromToAirport =
    text.match(
      /\bfrom\s+(.+?)\s+to\s+(?:the\s+)?(?:airport|belfast international|dublin|derry|aldergrove|bfs|dub|ldy)\b/i,
    ) ||
    text.match(
      /\bto\s+(?:the\s+)?(?:airport|belfast international|dublin|derry|aldergrove|bfs|dub|ldy)\s+from\s+(.+)$/i,
    ) ||
    text.match(
      /\b(?:airport|belfast international|dublin|derry|aldergrove)\s+to\s+(.+)$/i,
    );

  if (fromToAirport?.[1]) {
    const candidate = fromToAirport[1].replace(/[?.!,]+$/g, "").trim();
    if (candidate.length >= 8) return candidate;
  }

  const cleaned = stripQuoteNoise(text).replace(/^[\s,.-]+|[\s,.-]+$/g, "");
  if (cleaned.length < 10) return undefined;

  // Prefer chunks that look like "12 High Street, Bangor"
  const withNumber = cleaned.match(
    /\b(\d+[a-z]?\s+[a-z][a-z0-9'’.\-\s]+(?:,\s*[a-z][a-z0-9'’.\-\s]+)*(?:\s+bt\d{1,2}(?:\s*\d[a-z]{2})?)?)\b/i,
  );
  if (withNumber?.[1]) {
    return withNumber[1].replace(/\s+/g, " ").trim();
  }

  if (/\bbt\d{1,2}\b/i.test(cleaned) && /\d/.test(cleaned)) {
    return cleaned;
  }

  return undefined;
}

function vehicleSuggestionNote(
  vehicle: (typeof VEHICLE_TYPES)[number],
  passengers: number,
  suitcases: number,
  explicit: boolean,
): string {
  const short = vehicle.split(" (")[0];
  if (explicit) {
    return `Vehicle: ${short}.`;
  }
  if (vehicle.startsWith("Minibus")) {
    return `I’ve suggested a ${short} for ${passengers} passengers / ${suitcases} cases.`;
  }
  if (vehicle.startsWith("Estate")) {
    return `I’ve suggested an ${short} — better boot space for ${suitcases} cases.`;
  }
  return `I’ve suggested a ${short} for ${passengers} passenger${passengers === 1 ? "" : "s"}.`;
}

function extractNumber(text: string, kind: "passenger" | "suitcase"): number | undefined {
  if (kind === "suitcase" && /\b(no|zero)\s+(suitcases?|cases?|bags?|luggage)\b/i.test(text)) {
    return 0;
  }

  const patterns =
    kind === "passenger"
      ? [
          /(\d+)\s*(passengers?|people|adults?|pax)/i,
          /passengers?\s*[:=]?\s*(\d+)/i,
          /\b(?:for|with)\s+(\d+)\s*(?:passengers?|people|adults?|pax)\b/i,
        ]
      : [
          /(\d+)\s*(suitcases?|cases?|bags?|luggage)/i,
          /suitcases?\s*[:=]?\s*(\d+)/i,
          /\b(?:with|and|had|have|got)\s+(\d+)\s*(suitcases?|cases?|bags?|luggage)\b/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      const min = kind === "suitcase" ? 0 : 1;
      if (Number.isFinite(value) && value >= min && value <= 16) return value;
    }
  }
  return undefined;
}

function extractBareCount(text: string): number | undefined {
  const match = text.trim().match(/^(\d+)$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 16) return undefined;
  return value;
}

function pickVehicle(passengers: number, suitcases: number): (typeof VEHICLE_TYPES)[number] {
  if (passengers >= 8 || suitcases >= 5) return "Minibus (7–8 passengers)";
  if (suitcases >= 3) return "Estate Car (1–4 passengers)";
  return "Standard Saloon (1–4 passengers)";
}

function matchExplicitVehicle(text: string): (typeof VEHICLE_TYPES)[number] | undefined {
  const lower = text.toLowerCase();
  if (/\bminibus\b/.test(lower)) return "Minibus (7–8 passengers)";
  if (/\bexecutive\b/.test(lower)) return "Executive Saloon (1–4 passengers)";
  if (/\bestate\b/.test(lower)) return "Estate Car (1–4 passengers)";
  if (/\bsaloon\b/.test(lower)) return "Standard Saloon (1–4 passengers)";
  return undefined;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function todayLondonParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysYmd(days: number): string {
  const { year, month, day } = todayLondonParts();
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function extractDate(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return addDaysYmd(0);
  if (/\btomorrow\b/.test(lower)) return addDaysYmd(1);

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const uk = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
  if (uk) return `${uk[3]}-${pad2(Number(uk[2]))}-${pad2(Number(uk[1]))}`;

  const months: Record<string, number> = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
    december: 12, dec: 12,
  };
  const named = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+(20\d{2}))?\b/i,
  );
  if (named) {
    const day = Number(named[1]);
    const month = months[named[2].toLowerCase()];
    const year = named[3] ? Number(named[3]) : todayLondonParts().year;
    if (month && day >= 1 && day <= 31) return formatYmd(year, month, day);
  }

  return undefined;
}

function extractTime(text: string): string | undefined {
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) return `${pad2(Number(twentyFour[1]))}:${twentyFour[2]}`;

  const ampm = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = ampm[2] ?? "00";
    const meridiem = ampm[3].toLowerCase();
    if (hours < 1 || hours > 12) return undefined;
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return `${pad2(hours)}:${minutes}`;
  }

  return undefined;
}

function nextMissingField(draft: QuoteDraft): MissingField | null {
  if (!draft.direction) return "direction";
  if (draft.returnJourney === undefined) return "returnJourney";
  if (!draft.airportCode) return "airport";
  if (!draft.address) return "address";
  // Date/time are collected on the booking form after the customer chooses to book.
  if (draft.passengers === undefined) return "passengers";
  if (draft.suitcases === undefined) return "suitcases";
  return null;
}

/** Exported so the chat UI can show calendar/clock pickers for date/time steps. */
export function getNextQuoteField(draft: QuoteDraft): MissingField | null {
  return nextMissingField(draft);
}

export type QuoteMissingField = MissingField;

function promptForField(field: MissingField, draft: QuoteDraft): AssistantResponse {
  const airportName =
    AIRPORTS.find((item) => item.code === draft.airportCode)?.name ?? draft.airportCode;

  switch (field) {
    case "direction":
      return {
        reply: "Are you going to the airport or being collected from the airport?",
        draft,
        quickReplies: ["To the airport", "From the airport"],
      };
    case "returnJourney":
      return {
        reply: "Is this a one-way trip or a return journey? (Return includes 5% off.)",
        draft,
        quickReplies: ["One way", "Return"],
      };
    case "airport":
      return {
        reply: "Which airport is the transfer for?",
        draft,
        quickReplies: ["Belfast International", "Dublin", "City of Derry"],
      };
    case "address":
      return {
        reply:
          draft.direction === "from-airport"
            ? `Got it — collection from ${airportName}. Type your full drop-off address below — door / house number, street, and town or BT postcode. I’ll only quote once the address is complete.`
            : `Got it — drop-off at ${airportName}. Type your full pickup address below — door / house number, street, and town or BT postcode. I’ll only quote once the address is complete.`,
        draft,
        quickReplies: [],
      };
    case "tripDate":
      return {
        reply: "What date is the outbound journey?",
        draft,
        quickReplies: ["Today", "Tomorrow"],
      };
    case "tripTime":
      return {
        reply: "What pickup time do you need?",
        draft,
        quickReplies: ["06:00", "09:00", "12:00", "18:00"],
      };
    case "returnDate":
      return {
        reply: "What date is the return journey?",
        draft,
        quickReplies: ["Tomorrow"],
      };
    case "returnTime":
      return {
        reply: "What pickup time for the return journey?",
        draft,
        quickReplies: ["09:00", "12:00", "18:00"],
      };
    case "passengers":
      return {
        reply: "How many passengers?",
        draft,
        quickReplies: ["1 passenger", "2 passengers", "3 passengers", "4 passengers"],
      };
    case "suitcases":
      return {
        reply: "How many suitcases / cases? (3 or more usually needs an Estate Car.)",
        draft,
        quickReplies: ["1 suitcase", "2 suitcases", "3 suitcases", "4 suitcases"],
      };
  }
}

function tryBuildQuote(
  draft: QuoteDraft,
): { text: string; enquiryOnly: boolean; quoteCard?: QuoteCardSummary } | null {
  if (
    !draft.airportCode ||
    !draft.address ||
    !draft.direction ||
    draft.returnJourney === undefined ||
    draft.passengers === undefined ||
    draft.suitcases === undefined
  ) {
    return null;
  }

  // Never price a partial address — incomplete locality falls back to a default
  // surcharge and shows the wrong (usually higher) fare until the town is added.
  if (!isPricableStreetAddress(draft.address, draft.airportCode)) {
    return null;
  }

  const passengers = draft.passengers;
  const suitcases = draft.suitcases;
  const vehicle = draft.vehicle ?? pickVehicle(passengers, suitcases);
  const enquiryOnly = isVehicleEnquiryOnly(vehicle);
  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;

  if (enquiryOnly) {
    return {
      enquiryOnly: true,
      text:
        `${vehicle.split(" (")[0]} is enquiry only for ${airportName}. ` +
        `Would you like to book? I’ll open the quote form so you can add date, time, and your details — then we’ll confirm availability and price. ` +
        `Or call ${SITE.landlineDisplay}.`,
    };
  }

  const schedule = {
    outboundDate: draft.tripDate,
    outboundTime: draft.tripTime,
    returnDate: draft.returnDate,
    returnTime: draft.returnTime,
    returnJourney: draft.returnJourney,
  };

  const quote = calculateQuote(
    draft.address,
    draft.airportCode,
    vehicle,
    draft.returnJourney,
    schedule,
  );

  if (!quote) {
    if (draft.airportCode === "LDY") {
      return {
        enquiryOnly: false,
        text:
          "City of Derry Airport transfers are between LDY and the greater Belfast area only. " +
          "Please enter a full Belfast-area address (for example a street in Bangor, Lisburn, or BT20).",
      };
    }
    return {
      enquiryOnly: false,
      text:
        "I couldn’t price that address yet. Please pick a full Northern Ireland address from the suggestions, including town or postcode.",
    };
  }

  // Still refuse if the engine fell back to an unmatched area.
  if (!quote.area) {
    return null;
  }

  const directionLabel =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;
  const vehicleLabel = vehicle.split(" (")[0];
  const waitingNote =
    draft.direction === "from-airport" || draft.returnJourney
      ? "Prices include express drop-off and up to 60 minutes complimentary waiting time after landing for airport pickups."
      : "Prices include express drop-off.";

  const quoteCard: QuoteCardSummary = {
    amount: quote.amount,
    amountLabel: formatQuote(quote.amount),
    directionLabel,
    airportName,
    vehicle: vehicleLabel,
    passengers,
    suitcases,
    returnJourney: Boolean(draft.returnJourney),
    address: draft.address,
    area: quote.area,
    waitingNote,
  };

  const autoVehicle = pickVehicle(passengers, suitcases);
  const vehicleNote = vehicleSuggestionNote(
    vehicle,
    passengers,
    suitcases,
    vehicle !== autoVehicle,
  );

  return {
    enquiryOnly: false,
    quoteCard,
    text:
      `Here’s your fixed journey price ${directionLabel}.\n` +
      `${vehicleNote}\n\n` +
      `What would you like to do next?`,
  };
}

export function createWelcomeMessages(): AssistantMessage[] {
  return [
    {
      role: "bot",
      text:
        `Hi — I’m the ${SITE.name} assistant. I answer questions from our website and can price airport transfers using the same steps and pricing as the live quote tool.\n\n` +
        "Ask anything, or say “Get a quote” to start.",
    },
  ];
}

export function emptyQuoteDraft(): QuoteDraft {
  return {};
}

export function respondToAssistantMessage(
  userText: string,
  draft: QuoteDraft,
  context: AssistantContext = {},
): AssistantResponse {
  const text = userText.trim();
  const lower = text.toLowerCase();
  const nextDraft: QuoteDraft = { ...draft };
  const previousMisses = Math.max(0, context.consecutiveMisses ?? 0);

  const understood = (response: AssistantResponse): AssistantResponse => ({
    ...response,
    consecutiveMisses: 0,
  });

  const missed = (response: AssistantResponse): AssistantResponse => {
    const consecutiveMisses = previousMisses + 1;
    if (consecutiveMisses >= 2) {
      return humanHandoffReply(nextDraft);
    }
    return {
      ...response,
      consecutiveMisses,
      reply:
        `${response.reply}\n\n` +
        `If you’d rather talk to us, say “Speak to someone” or WhatsApp @${SITE.whatsappUsername}.`,
      quickReplies: [
        ...(response.quickReplies ?? ["Get a quote"]),
        "Speak to someone",
      ].filter((item, index, all) => all.indexOf(item) === index),
    };
  };

  if (!text) {
    return understood({
      reply: "Type a question, or say “Get a quote” to follow the same steps as the quote tool.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save to contacts"],
    });
  }

  if (
    /speak to (a )?someone|talk to (a )?human|talk to (colin|you|someone)|real person|open whatsapp|whatsapp (me|us|colin)/.test(
      lower,
    )
  ) {
    return humanHandoffReply(nextDraft);
  }

  if (
    /change (the )?details|change (my )?trip|edit (the )?quote|wrong (address|airport|details)/.test(
      lower,
    )
  ) {
    return understood({
      reply:
        "No problem — what do you want to change? You can start a fresh quote, or tell me the new airport, address, passengers, or cases.",
      draft: nextDraft,
      quickReplies: ["Another quote", "To the airport", "From the airport", "Speak to someone"],
    });
  }

  if (/another quote|new quote|start again|reset quote|different quote/.test(lower)) {
    return understood({
      reply: "No problem — let’s start again. Are you going to the airport or being collected from the airport?",
      draft: {},
      resetDraft: true,
      quickReplies: ["To the airport", "From the airport"],
    });
  }

  if (
    /save (to )?contact|add contact|contact details|contact card|qr code|save (your|our) (number|details)/.test(
      lower,
    )
  ) {
    return understood({
      reply:
        "Opening our contact card so you can save our details with the logo. On desktop you can also scan the QR code.",
      draft: nextDraft,
      showContactOffer: true,
      quickReplies: ["Get a quote"],
    });
  }

  if (
    /^(no thanks|no thank you|not now|no book|maybe later)\b/.test(lower)
  ) {
    return understood({
      reply:
        "No problem — your quote is ready whenever you are. Say “Get a quote” for another trip, or ask me anything else.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save to contacts", "Speak to someone"],
    });
  }

  if (
    /^(request to book|enquire to book|book now|book this|yes,? book|yes book|yes,? please|yes$|i('?| would )?like to book)\b/.test(
      lower,
    ) ||
    /^book\b/.test(lower)
  ) {
    const missing = nextMissingField(nextDraft);
    if (missing) {
      const prompt = promptForField(missing, nextDraft);
      return understood({
        reply: `Let’s finish the quote details first — then I’ll open the booking form.\n\n${prompt.reply}`,
        draft: nextDraft,
        quickReplies: prompt.quickReplies,
      });
    }
    return understood({
      reply:
        "Opening the live quote tool with your trip details. Add your pickup date & time, name, mobile, email, flight number(s) and accept the terms to send your booking request — we’ll email a SumUp payment link once we confirm the job.",
      draft: nextDraft,
      openQuoteForm: true,
      quickReplies: ["Another quote", "Save to contacts"],
    });
  }

  if (/^(hi|hello|hey)\b/.test(lower)) {
    return understood({
      reply: "Hello! Ask me anything about our service, or say “Get a quote” and I’ll follow the same quote-tool steps for an accurate price.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save to contacts"],
    });
  }

  if (/whatsapp|call|phone|email|contact you|landline/.test(lower) && !/quote|price|how much/.test(lower)) {
    return understood({
      reply: `You can call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, or email ${SITE.email}. Tap “Save to contacts” to open our contact card, or “Open WhatsApp” to message us now.`,
      draft: nextDraft,
      quickReplies: ["Open WhatsApp", "Save to contacts", "Get a quote"],
      openWhatsAppHandoff: /whatsapp|open whatsapp/.test(lower),
    });
  }

  // --- Parse trip fields (quote-tool order) ---
  if (
    /\bfrom (the )?airport\b|\barriving\b|\bpick.?up from (the )?airport\b|\bcollection from\b|\bfrom the airport\b|\bfrom\s+(bfs|dub|ldy|aldergrove|dublin|derry|belfast international)\b/.test(
      lower,
    )
  ) {
    nextDraft.direction = "from-airport";
  } else if (
    /\bto (the )?airport\b|\bgoing to\b|\bdeparting\b|\bdrop.?off at\b|\bto the airport\b|\bflying out\b/.test(
      lower,
    )
  ) {
    nextDraft.direction = "to-airport";
  } else if (
    // "BFS from 12 High Street..." / "Dublin airport from Bangor..." → to airport
    /\b(bfs|dub|ldy|aldergrove|dublin(?: airport)?|belfast international(?: airport)?|city of derry(?: airport)?)\b.+\bfrom\b/.test(
      lower,
    )
  ) {
    nextDraft.direction = "to-airport";
  }

  if (/\breturn\b/.test(lower) && !/\bone[- ]?way\b/.test(lower)) {
    nextDraft.returnJourney = true;
  } else if (/\bone[- ]?way\b/.test(lower)) {
    nextDraft.returnJourney = false;
  }

  const airport = matchAirport(text);
  if (airport) nextDraft.airportCode = airport;

  // Avoid treating “Belfast International” etc. as a town/address.
  const isAirportOnlyReply =
    Boolean(airport) &&
    /^(belfast international|belfast airport|aldergrove|dublin(?: airport)?|city of derry|derry(?: airport)?|londonderry|bfs|dub|ldy)$/i.test(
      text.trim(),
    );

  const date = extractDate(text);
  const time = extractTime(text);
  const awaiting = nextMissingField(nextDraft);

  // Assign date/time to the field currently needed when ambiguous.
  if (date) {
    if (!nextDraft.tripDate || awaiting === "tripDate") {
      nextDraft.tripDate = date;
    } else if (nextDraft.returnJourney && (!nextDraft.returnDate || awaiting === "returnDate")) {
      nextDraft.returnDate = date;
    } else if (!nextDraft.returnJourney) {
      nextDraft.tripDate = date;
    }
  }
  if (time) {
    if (!nextDraft.tripTime || awaiting === "tripTime") {
      nextDraft.tripTime = time;
    } else if (nextDraft.returnJourney && (!nextDraft.returnTime || awaiting === "returnTime")) {
      nextDraft.returnTime = time;
    } else if (!nextDraft.returnJourney) {
      nextDraft.tripTime = time;
    }
  }

  // If both date and time in one message while awaiting tripDate, also set time.
  if (date && time && awaiting === "tripDate") {
    nextDraft.tripDate = date;
    nextDraft.tripTime = time;
  }
  if (date && time && awaiting === "returnDate") {
    nextDraft.returnDate = date;
    nextDraft.returnTime = time;
  }

  let passengers = extractNumber(text, "passenger");
  let suitcases = extractNumber(text, "suitcase");
  const bareCount = extractBareCount(text);
  const nextField = nextMissingField(nextDraft);

  if (bareCount !== undefined) {
    if (nextField === "passengers" && passengers === undefined && bareCount >= 1) {
      passengers = bareCount;
    } else if (nextField === "suitcases" && suitcases === undefined) {
      suitcases = bareCount;
    }
  }

  if (passengers !== undefined) nextDraft.passengers = passengers;
  if (suitcases !== undefined) nextDraft.suitcases = suitcases;

  const explicitVehicle = matchExplicitVehicle(text);
  if (explicitVehicle) {
    nextDraft.vehicle = explicitVehicle;
  } else if (nextDraft.passengers !== undefined || nextDraft.suitcases !== undefined) {
    nextDraft.vehicle = pickVehicle(nextDraft.passengers ?? 1, nextDraft.suitcases ?? 0);
  }

  if (!isAirportOnlyReply) {
    const looksLikeAddressReply =
      nextField === "address" &&
      text.length >= 3 &&
      text.length <= 200 &&
      !airport &&
      !extractTime(text) &&
      !/^(get a quote|quote|price|book|yes|no thanks)$/i.test(text) &&
      !/passenger|suitcase|case|bag/i.test(text);

    if (looksLikeAddressReply) {
      const candidate = text.replace(/[?.!]+$/, "").trim();
      if (isPricableStreetAddress(candidate, nextDraft.airportCode)) {
        nextDraft.address = candidate;
      } else if (isCompleteStreetAddress(candidate)) {
        return unpricedAreaPrompt(nextDraft, candidate);
      } else {
        return incompleteAddressPrompt(nextDraft);
      }
    } else {
      const candidate = extractAddressCandidate(text);
      if (
        candidate &&
        !matchAirport(candidate) &&
        !/^(a quote|quote|airport|belfast international|dublin|city of derry|the airport)$/i.test(
          candidate,
        )
      ) {
        if (isPricableStreetAddress(candidate, nextDraft.airportCode)) {
          nextDraft.address = candidate;
        } else if (isCompleteStreetAddress(candidate) && (nextField === "address" || wantsOneShotQuote(lower))) {
          return unpricedAreaPrompt(nextDraft, candidate);
        }
      }
    }
  }

  // Never keep a partial address on the draft (wrong default fare until completed).
  if (nextDraft.address && !isPricableStreetAddress(nextDraft.address, nextDraft.airportCode)) {
    const badAddress = nextDraft.address;
    delete nextDraft.address;
    if (isCompleteStreetAddress(badAddress)) {
      return unpricedAreaPrompt(nextDraft, badAddress);
    }
    if (nextField === "address" || getNextQuoteField(nextDraft) === "address") {
      return incompleteAddressPrompt(nextDraft);
    }
  }

  // Infer direction when airport + address present but direction missing.
  if (!nextDraft.direction && nextDraft.airportCode && nextDraft.address) {
    if (/\bfrom\b.+\b(to\b.+\b)?airport|\barriving\b|\blanding\b/.test(lower)) {
      nextDraft.direction = "from-airport";
    } else if (/\bto\b.+\bairport|\bgoing to\b|\bdeparting\b|\bflying out\b/.test(lower)) {
      nextDraft.direction = "to-airport";
    }
  }

  // Default one-way when a packed quote request didn't say return.
  if (
    nextDraft.returnJourney === undefined &&
    nextDraft.airportCode &&
    nextDraft.address &&
    wantsOneShotQuote(lower)
  ) {
    nextDraft.returnJourney = false;
  }

  const wantsQuote = /get a quote|quote|price|how much|fare|cost|estimate/.test(lower);
  const quoteInProgress = Boolean(
    nextDraft.direction ||
      nextDraft.airportCode ||
      nextDraft.address ||
      nextDraft.tripDate ||
      nextDraft.passengers !== undefined ||
      wantsQuote ||
      wantsOneShotQuote(lower),
  );

  // Knowledge answers when not mid-quote (or when clearly a FAQ question).
  const clearlyQuestion =
    /^(what|when|where|who|how|do you|can you|is there|are there)\b/.test(lower) ||
    /\?$/.test(text);
  if (clearlyQuestion && !wantsQuote && !quoteInProgress) {
    const knowledge = matchKnowledge(text);
    if (knowledge) {
      return understood({
        reply: knowledge,
        draft: nextDraft,
        quickReplies: ["Get a quote", "Save to contacts", "Speak to someone"],
      });
    }
  }

  if (quoteInProgress) {
    const missing = nextMissingField(nextDraft);
    if (missing) {
      const prompt = promptForField(missing, nextDraft);
      return understood({
        ...prompt,
        consecutiveMisses: 0,
      });
    }

    if (!explicitVehicle) {
      nextDraft.vehicle = pickVehicle(nextDraft.passengers ?? 1, nextDraft.suitcases ?? 0);
    }

    const built = tryBuildQuote(nextDraft);
    if (built) {
      return understood({
        reply: built.text,
        draft: nextDraft,
        quickReplies: ["Yes, book", "Change details", "Speak to someone", "Another quote"],
        quoteCard: built.quoteCard,
      });
    }

    // All fields present but address still not pricable (or LDY out of area handled above).
    if (nextDraft.address && !isPricableStreetAddress(nextDraft.address, nextDraft.airportCode)) {
      const badAddress = nextDraft.address;
      delete nextDraft.address;
      if (isCompleteStreetAddress(badAddress)) {
        return unpricedAreaPrompt(nextDraft, badAddress);
      }
      return incompleteAddressPrompt(nextDraft);
    }
  }

  const knowledge = matchKnowledge(text);
  if (knowledge) {
    return understood({
      reply: knowledge,
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save to contacts", "Speak to someone"],
    });
  }

  return missed({
    reply:
      "I can answer questions from our website (booking, waiting time, vehicles, privacy, airports) and price transfers using the same quote-tool steps.\n\n" +
      "Try something like “BFS tomorrow 6am from 12 High Street, Bangor BT20, 2 people” or say “Get a quote”.",
    draft: nextDraft,
    quickReplies: ["Get a quote", "Save to contacts", "Speak to someone"],
  });
}

function wantsOneShotQuote(lower: string): boolean {
  const hasAirport = Boolean(matchAirport(lower));
  const hasPeopleOrBags = /\b\d+\s*(passengers?|people|adults?|pax|suitcases?|cases?|bags?)\b/.test(
    lower,
  );
  const hasAddressHint = /\b\d+[a-z]?\s+[a-z]/.test(lower) || /\bbt\d{1,2}\b/.test(lower);
  return hasAirport && (hasPeopleOrBags || hasAddressHint);
}

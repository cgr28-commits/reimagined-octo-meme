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
  "belfast international": "BFS",
  "belfast airport": "BFS",
  international: "BFS",
  dub: "DUB",
  dublin: "DUB",
  "dublin airport": "DUB",
  ldy: "LDY",
  derry: "LDY",
  "city of derry": "LDY",
  londonderry: "LDY",
  "derry airport": "LDY",
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
        "The quote tool asks: trip type (to or from airport), one way or return, airport, address, date and time (plus return date/time if return), passengers, suitcases, then shows the fixed journey price and vehicle. Booking continues on the quote form with contact details, flight numbers and terms.",
    },
    {
      title: "Airports we cover",
      body: `We cover ${AIRPORTS.map((a) => a.name).join(", ")}. Prices include vehicle, driver, fuel, tolls, and up to 60 minutes complimentary waiting time after landing for airport pickups.`,
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
    if (/wait|flight delay|meet.?greet/.test(lower) && /wait|flight|meet/.test(haystack)) score += 4;
    if (/child.?seat|booster|baby seat/.test(lower) && /child|booster/.test(haystack)) score += 5;
    if (/vehicle|minibus|estate|saloon|executive|fleet/.test(lower) && /vehicle|fleet|saloon|estate|minibus/.test(haystack)) score += 3;
    if (/book|confirm|payment|sumup|pay/.test(lower) && /book|confirm|payment|sumup|pay/.test(haystack)) score += 3;
    if (/privacy|data|gdpr|marketing email/.test(lower) && /privacy|data|marketing|personal/.test(haystack)) score += 5;
    if (/track|driver location|live track/.test(lower) && /track|driver|location/.test(haystack)) score += 4;
    if (/hour|24\/7|christmas|bank holiday|night/.test(lower) && /24|365|christmas|bank/.test(haystack)) score += 4;
    if (/contact|phone|email|whatsapp|number/.test(lower) && /contact|whatsapp|email|call/.test(haystack)) score += 3;
    if (/airport|cover|areas?/.test(lower) && /airport|cover|belfast|dublin|derry|areas/.test(haystack)) score += 2;

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
  if (!draft.tripDate) return "tripDate";
  if (!draft.tripTime) return "tripTime";
  if (draft.returnJourney) {
    if (!draft.returnDate) return "returnDate";
    if (!draft.returnTime) return "returnTime";
  }
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
            ? `Got it — collection from ${airportName}. What’s the drop-off town / address?`
            : `Got it — drop-off at ${airportName}. What’s the pickup town / address?`,
        draft,
        quickReplies: ["Bangor", "Lisburn", "Holywood", "Belfast City Centre"],
      };
    case "tripDate":
      return {
        reply: "What date is the outbound journey? Use the calendar below to choose a date.",
        draft,
        quickReplies: ["Today", "Tomorrow"],
      };
    case "tripTime":
      return {
        reply: "What pickup time do you need? Use the clock below to choose a time.",
        draft,
        quickReplies: ["06:00", "09:00", "12:00", "18:00"],
      };
    case "returnDate":
      return {
        reply: "What date is the return journey? Use the calendar below to choose a date.",
        draft,
        quickReplies: ["Tomorrow"],
      };
    case "returnTime":
      return {
        reply: "What pickup time for the return journey? Use the clock below to choose a time.",
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

function formatDisplayDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function tryBuildQuote(draft: QuoteDraft): { text: string; enquiryOnly: boolean } | null {
  if (
    !draft.airportCode ||
    !draft.address ||
    !draft.direction ||
    draft.returnJourney === undefined ||
    !draft.tripDate ||
    !draft.tripTime ||
    draft.passengers === undefined ||
    draft.suitcases === undefined ||
    (draft.returnJourney && (!draft.returnDate || !draft.returnTime))
  ) {
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
        `Tap Request to book to open the quote form with your trip details and we’ll confirm availability and price. ` +
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
          "Please give a Belfast-area town or postcode (for example Bangor, Lisburn, or BT20).",
      };
    }
    return {
      enquiryOnly: false,
      text:
        "I couldn’t price that address yet. Try a Northern Ireland town we cover (Bangor, Lisburn, Holywood…) or use the quote form with your full address.",
    };
  }

  const directionLabel =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;
  const areaNote = quote.area ? ` (priced via ${quote.area})` : "";
  const waitingNote =
    draft.direction === "from-airport" || draft.returnJourney
      ? "Includes vehicle, driver, fuel, tolls, and up to 60 minutes waiting after landing for airport pickups."
      : "Includes vehicle, driver, fuel and tolls.";

  return {
    enquiryOnly: false,
    text:
      `Your fixed journey price ${directionLabel} is ${formatQuote(quote.amount)}${areaNote}.\n` +
      `${vehicle.split(" (")[0]} · ${passengers} passengers · ${suitcases} suitcases` +
      `${draft.returnJourney ? " · return (5% off)" : " · one way"}.\n` +
      `Outbound: ${formatDisplayDate(draft.tripDate)} at ${draft.tripTime}` +
      `${
        draft.returnJourney && draft.returnDate && draft.returnTime
          ? `\nReturn: ${formatDisplayDate(draft.returnDate)} at ${draft.returnTime}`
          : ""
      }.\n\n` +
      `${waitingNote}\n\n` +
      `To book, tap Request to book — I’ll open the quote tool with these details so you can add your name, mobile, email, flight number(s) and accept the terms (same booking flow as the website).`,
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
): AssistantResponse {
  const text = userText.trim();
  const lower = text.toLowerCase();
  const nextDraft: QuoteDraft = { ...draft };

  if (!text) {
    return {
      reply: "Type a question, or say “Get a quote” to follow the same steps as the quote tool.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
    };
  }

  if (/another quote|new quote|start again|reset quote|different quote/.test(lower)) {
    return {
      reply: "No problem — let’s start again. Are you going to the airport or being collected from the airport?",
      draft: {},
      resetDraft: true,
      quickReplies: ["To the airport", "From the airport"],
    };
  }

  if (/save contact|add contact|contact details|contact card|qr code|save (your|our) (number|details)/.test(lower)) {
    return {
      reply:
        "Opening our contact card so you can save our details with the logo. On desktop you can also scan the QR code.",
      draft: nextDraft,
      showContactOffer: true,
      quickReplies: ["Get a quote"],
    };
  }

  if (
    /^(request to book|enquire to book|book now|book this|yes book|i('?| would )?like to book)\b/.test(
      lower,
    ) ||
    /^book\b/.test(lower)
  ) {
    const missing = nextMissingField(nextDraft);
    if (missing) {
      const prompt = promptForField(missing, nextDraft);
      return {
        reply: `Let’s finish the quote details first — same steps as the quote tool — then I’ll open the booking form.\n\n${prompt.reply}`,
        draft: nextDraft,
        quickReplies: prompt.quickReplies,
      };
    }
    return {
      reply:
        "Opening the live quote tool with your trip details. Complete your name, mobile, email, flight number(s) and accept the terms to send your booking request — we’ll email a SumUp payment link once we confirm the job.",
      draft: nextDraft,
      openQuoteForm: true,
      quickReplies: ["Another quote", "Save contact details"],
    };
  }

  if (/^(hi|hello|hey)\b/.test(lower)) {
    return {
      reply: "Hello! Ask me anything about our service, or say “Get a quote” and I’ll follow the same quote-tool steps for an accurate price.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
    };
  }

  if (/whatsapp|call|phone|email|contact you/.test(lower) && !/quote|price|how much/.test(lower)) {
    return {
      reply: `You can call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, or email ${SITE.email}. Tap “Save contact details” to open our contact card.`,
      draft: nextDraft,
      quickReplies: ["Save contact details", "Get a quote"],
    };
  }

  // --- Parse trip fields (quote-tool order) ---
  if (
    /\bfrom (the )?airport\b|\barriving\b|\bpick.?up from (the )?airport\b|\bcollection from\b|\bfrom the airport\b/.test(
      lower,
    )
  ) {
    nextDraft.direction = "from-airport";
  } else if (
    /\bto (the )?airport\b|\bgoing to\b|\bdeparting\b|\bdrop.?off at\b|\bto the airport\b/.test(lower)
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
    const areaMention = matchAreaMention(text);
    if (areaMention && !matchAirport(areaMention)) {
      nextDraft.address = areaMention;
    }

    if (!nextDraft.address) {
      const addressMatch =
        text.match(/\bfrom\s+(.+?)(?:\s+to\s+(?:the\s+)?(?:airport|belfast|dublin|derry)|\s+for\s+\d|\s*$)/i) ||
        text.match(/\bto\s+(.+?)(?:\s+from\s+(?:the\s+)?(?:airport|belfast|dublin|derry)|\s+for\s+\d|\s*$)/i);
      if (addressMatch?.[1] && !matchAirport(addressMatch[1])) {
        const candidate = addressMatch[1].replace(/[?.!]+$/, "").trim();
        if (
          candidate.length >= 3 &&
          !/^(a quote|quote|airport|belfast international|dublin|city of derry|the airport)$/i.test(
            candidate,
          )
        ) {
          nextDraft.address = candidate;
        }
      }
    }

    // Plain town reply while waiting for address.
    if (
      !nextDraft.address &&
      nextField === "address" &&
      text.length >= 3 &&
      text.length <= 60 &&
      !airport &&
      !extractTime(text) &&
      !/quote|price|book|passenger|suitcase|case|bag/i.test(text)
    ) {
      nextDraft.address = text.replace(/[?.!]+$/, "").trim();
    }
  }

  const wantsQuote = /get a quote|quote|price|how much|fare|cost|estimate/.test(lower);
  const quoteInProgress = Boolean(
    nextDraft.direction ||
      nextDraft.airportCode ||
      nextDraft.address ||
      nextDraft.tripDate ||
      wantsQuote,
  );

  // Knowledge answers when not mid-quote (or when clearly a FAQ question).
  const clearlyQuestion =
    /^(what|when|where|who|how|do you|can you|is there|are there)\b/.test(lower) ||
    /\?$/.test(text);
  if (clearlyQuestion && !wantsQuote) {
    const knowledge = matchKnowledge(text);
    if (knowledge) {
      return {
        reply: knowledge,
        draft: nextDraft,
        quickReplies: ["Get a quote", "Save contact details"],
      };
    }
  }

  if (quoteInProgress) {
    const missing = nextMissingField(nextDraft);
    if (missing) {
      return promptForField(missing, nextDraft);
    }

    if (!explicitVehicle) {
      nextDraft.vehicle = pickVehicle(nextDraft.passengers ?? 1, nextDraft.suitcases ?? 0);
    }

    const built = tryBuildQuote(nextDraft);
    if (built) {
      return {
        reply: built.text,
        draft: nextDraft,
        quickReplies: ["Request to book", "Another quote", "Save contact details"],
      };
    }
  }

  const knowledge = matchKnowledge(text);
  if (knowledge) {
    return {
      reply: knowledge,
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
    };
  }

  return {
    reply:
      "I can answer questions from our website (booking, waiting time, vehicles, privacy, airports) and price transfers using the same quote-tool steps.\n\n" +
      "Say “Get a quote” to start, or ask something like “Do you track my flight?”",
    draft: nextDraft,
    quickReplies: ["Get a quote", "Save contact details"],
  };
}

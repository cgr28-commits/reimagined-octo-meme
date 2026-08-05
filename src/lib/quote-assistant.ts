import { AIRPORTS, FAQS, SITE, VEHICLE_TYPES } from "@/lib/data";
import { calculateQuote, formatQuote } from "@/lib/quote";

export type AssistantMessage = {
  role: "bot" | "user";
  text: string;
};

type QuoteDraft = {
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  address?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: (typeof VEHICLE_TYPES)[number];
};

const AIRPORT_ALIASES: Record<string, string> = {
  bfs: "BFS",
  aldergrove: "BFS",
  "belfast international": "BFS",
  international: "BFS",
  dub: "DUB",
  dublin: "DUB",
  ldy: "LDY",
  derry: "LDY",
  "city of derry": "LDY",
  londonderry: "LDY",
};

function matchAirport(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, code] of Object.entries(AIRPORT_ALIASES)) {
    if (lower.includes(alias)) {
      return code;
    }
  }
  return undefined;
}

function matchFaq(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords = lower
    .split(/[^a-z0-9£]+/)
    .filter((word) => word.length > 3);

  let best: { score: number; answer: string } | null = null;
  for (const faq of FAQS) {
    const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
    let score = 0;
    for (const word of keywords) {
      if (haystack.includes(word)) {
        score += 1;
      }
    }
    if (/cancel|refund|money back/.test(lower) && /cancel|refund/.test(haystack)) {
      score += 3;
    }
    if (/price|cost|how much|quote|fare/.test(lower) && /price|cost|quote|fare/.test(haystack)) {
      score += 2;
    }
    if (/wait|flight delay|meet/.test(lower) && /wait|flight|meet/.test(haystack)) {
      score += 2;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { score, answer: faq.answer };
    }
  }

  return best && best.score >= 2 ? best.answer : null;
}

function extractNumber(text: string, kind: "passenger" | "suitcase"): number | undefined {
  const patterns =
    kind === "passenger"
      ? [/(\d+)\s*(passengers?|people|adults?|pax)/i, /passengers?\s*[:=]?\s*(\d+)/i]
      : [/(\d+)\s*(suitcases?|cases?|bags?|luggage)/i, /suitcases?\s*[:=]?\s*(\d+)/i];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value <= 16) {
        return value;
      }
    }
  }
  return undefined;
}

function pickVehicle(passengers: number, suitcases: number): (typeof VEHICLE_TYPES)[number] {
  if (passengers >= 8 || suitcases >= 5) {
    return "Minibus (7–8 passengers)";
  }
  if (suitcases >= 3) {
    return "Estate Car (1–4 passengers)";
  }
  return "Standard Saloon (1–4 passengers)";
}

function tryBuildQuote(draft: QuoteDraft): string | null {
  if (!draft.airportCode || !draft.address) {
    return null;
  }

  const passengers = draft.passengers ?? 2;
  const suitcases = draft.suitcases ?? 2;
  const vehicle = draft.vehicle ?? pickVehicle(passengers, suitcases);
  const quote = calculateQuote(draft.address, draft.airportCode, vehicle, false);

  if (!quote) {
    return null;
  }

  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
  const directionLabel =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;

  return (
    `Your fixed journey price for ${directionLabel} is ${formatQuote(quote.amount)} ` +
    `(${vehicle.split(" (")[0]}, ${passengers} passengers, ${suitcases} suitcases).\n\n` +
    `Get an instant price online or through WhatsApp. Complete your booking securely online and receive confirmation after payment.\n\n` +
    `Continue on the quote form, or WhatsApp us on ${SITE.landlineDisplay}.`
  );
}

export function createWelcomeMessages(): AssistantMessage[] {
  return [
    {
      role: "bot",
      text:
        `Hi — I’m the ${SITE.name} assistant. I can answer common questions and work out an airport transfer quote.\n\n` +
        "Ask anything, or say something like: “Quote to Belfast International from Bangor for 2 passengers and 3 cases”.",
    },
  ];
}

export function respondToAssistantMessage(
  userText: string,
  draft: QuoteDraft,
): { reply: string; draft: QuoteDraft; quickReplies?: string[] } {
  const text = userText.trim();
  const lower = text.toLowerCase();
  const nextDraft: QuoteDraft = { ...draft };

  if (!text) {
    return {
      reply: "Type a question, or ask for a quote with your airport and address.",
      draft: nextDraft,
    };
  }

  if (/^(hi|hello|hey)\b/.test(lower)) {
    return {
      reply: "Hello! Ask a question, or tell me which airport and address you need a quote for.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Cancellation policy", "WhatsApp"],
    };
  }

  if (/whatsapp|chat with (a )?human|speak to/.test(lower)) {
    return {
      reply: `You can message us on WhatsApp at @${SITE.whatsappUsername} or call ${SITE.landlineDisplay}.`,
      draft: nextDraft,
    };
  }

  if (/book online|quote form|#quote/.test(lower)) {
    return {
      reply: "Open the quote form on this page (Get a Quote) to complete your booking securely online.",
      draft: nextDraft,
    };
  }

  const airport = matchAirport(text);
  if (airport) {
    nextDraft.airportCode = airport;
  }

  if (/\bfrom airport\b|\barriving\b|\bpick.?up from\b/.test(lower)) {
    nextDraft.direction = "from-airport";
  } else if (/\bto airport\b|\bgoing to\b|\bdeparting\b/.test(lower)) {
    nextDraft.direction = "to-airport";
  }

  const passengers = extractNumber(text, "passenger");
  if (passengers) {
    nextDraft.passengers = passengers;
  }
  const suitcases = extractNumber(text, "suitcase");
  if (suitcases) {
    nextDraft.suitcases = suitcases;
  }
  if (passengers || suitcases) {
    nextDraft.vehicle = pickVehicle(nextDraft.passengers ?? 2, nextDraft.suitcases ?? 2);
  }

  // Capture a likely NI address/area after "from" / "to" when not an airport phrase.
  const addressMatch =
    text.match(/\bfrom\s+(.+?)(?:\s+to\s+(?:the\s+)?airport|\s+for\s+\d|\s*$)/i) ||
    text.match(/\bto\s+(.+?)(?:\s+from\s+(?:the\s+)?airport|\s+for\s+\d|\s*$)/i) ||
    text.match(/\b(?:in|at)\s+([A-Za-z][A-Za-z\s,'-]{2,60})/i);
  if (addressMatch?.[1] && !matchAirport(addressMatch[1])) {
    const candidate = addressMatch[1].replace(/[?.!]+$/, "").trim();
    if (candidate.length >= 3 && !/^(a quote|quote|airport)$/i.test(candidate)) {
      nextDraft.address = candidate;
    }
  }

  if (/get a quote|price|how much|fare|cost/.test(lower) && !nextDraft.airportCode) {
    return {
      reply: "Which airport is your transfer for — Belfast International, Dublin, or City of Derry?",
      draft: nextDraft,
      quickReplies: ["Belfast International", "Dublin", "City of Derry"],
    };
  }

  if (nextDraft.airportCode && !nextDraft.address) {
    const airportName =
      AIRPORTS.find((item) => item.code === nextDraft.airportCode)?.name ?? nextDraft.airportCode;
    return {
      reply: `Got it — ${airportName}. What’s the pickup or drop-off address / town (for example Bangor or BT20 3AA)?`,
      draft: nextDraft,
    };
  }

  const built = tryBuildQuote(nextDraft);
  if (built && (/quote|price|how much|fare|cost/.test(lower) || (airport && nextDraft.address))) {
    return { reply: built, draft: nextDraft, quickReplies: ["Book online", "WhatsApp"] };
  }

  const faqAnswer = matchFaq(text);
  if (faqAnswer) {
    return { reply: faqAnswer, draft: nextDraft };
  }

  if (nextDraft.airportCode && nextDraft.address) {
    const retry = tryBuildQuote(nextDraft);
    if (retry) {
      return { reply: retry, draft: nextDraft, quickReplies: ["Book online", "WhatsApp"] };
    }
  }

  return {
    reply:
      "I can help with airport transfer quotes and common questions. Try: “Quote from Lisburn to Belfast International for 3 passengers and 3 cases”, or ask about waiting time, cancellations, or vehicle options.",
    draft: nextDraft,
    quickReplies: ["Get a quote", "Cancellation policy", "WhatsApp"],
  };
}

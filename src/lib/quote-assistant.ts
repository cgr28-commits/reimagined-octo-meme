import {
  AIRPORTS,
  AREAS,
  FAQS,
  SITE,
  VEHICLE_FLEET,
  VEHICLE_TYPES,
  isVehicleEnquiryOnly,
} from "@/lib/data";
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
};

export type AssistantResponse = {
  reply: string;
  draft: QuoteDraft;
  quickReplies?: string[];
  /** Clear draft after this reply (e.g. finished quote) so another quote can start cleanly */
  resetDraft?: boolean;
  showContactOffer?: boolean;
};

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

function matchAirport(text: string): string | undefined {
  const lower = text.toLowerCase();
  // Prefer longer aliases first
  const aliases = Object.entries(AIRPORT_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, code] of aliases) {
    if (lower.includes(alias)) {
      return code;
    }
  }
  return undefined;
}

function matchAreaMention(text: string): string | undefined {
  const matched = matchAreaFromAddress(text);
  if (matched) {
    return matched;
  }

  const lower = text.toLowerCase();
  const sorted = [...AREAS].sort((a, b) => b.length - a.length);
  for (const area of sorted) {
    if (lower.includes(area.toLowerCase())) {
      return area;
    }
  }
  return undefined;
}

function knowledgeChunks(): Array<{ title: string; body: string }> {
  const chunks: Array<{ title: string; body: string }> = FAQS.map((faq) => ({
    title: faq.question,
    body: faq.answer,
  }));

  for (const section of TERMS_SECTIONS) {
    const parts: string[] = [];
    if ("content" in section && Array.isArray(section.content)) {
      parts.push(...section.content);
    }
    if ("list" in section && Array.isArray(section.list)) {
      parts.push(...section.list);
    }
    if ("footer" in section && typeof section.footer === "string") {
      parts.push(section.footer);
    }
    if ("subsections" in section && Array.isArray(section.subsections)) {
      for (const sub of section.subsections) {
        parts.push(sub.subtitle, ...sub.content);
      }
    }
    chunks.push({ title: section.title, body: parts.join(" ") });
  }

  chunks.push(
    {
      title: "How booking works now",
      body:
        "Get your fixed journey price on the website or in this chat. Send an enquiry to book. Once we confirm your job, we email a SumUp payment link. Your booking is confirmed after payment. Executive Saloon and Minibus are enquiry-only — we quote you personally.",
    },
    {
      title: "Airports we cover",
      body: `We cover ${AIRPORTS.map((a) => a.name).join(", ")}. Prices include vehicle, driver, fuel, tolls, and up to 60 minutes complimentary waiting time after landing for airport pickups.`,
    },
    {
      title: "Fleet and vehicles",
      body: VEHICLE_FLEET.map(
        (v) => `${v.name} (${v.capacity}): ${v.description}`,
      ).join(" "),
    },
    {
      title: "Contact details",
      body: `Call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, email ${SITE.email}, or save our contact card from this chat or ${SITE.url}/contact/.`,
    },
  );

  return chunks;
}

function matchKnowledge(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords = lower
    .split(/[^a-z0-9£%]+/i)
    .filter((word) => word.length > 2);

  let best: { score: number; body: string; title: string } | null = null;

  for (const chunk of knowledgeChunks()) {
    const haystack = `${chunk.title} ${chunk.body}`.toLowerCase();
    let score = 0;
    for (const word of keywords) {
      if (haystack.includes(word)) {
        score += word.length > 5 ? 2 : 1;
      }
    }

    if (/cancel|refund|money back|admin/.test(lower) && /cancel|refund/.test(haystack)) {
      score += 5;
    }
    if (/wait|flight delay|meet.?greet/.test(lower) && /wait|flight|meet/.test(haystack)) {
      score += 4;
    }
    if (/child.?seat|booster|baby seat/.test(lower) && /child/.test(haystack)) {
      score += 5;
    }
    if (/vehicle|minibus|estate|saloon|executive|fleet/.test(lower) && /vehicle|fleet|saloon|estate|minibus/.test(haystack)) {
      score += 3;
    }
    if (/book|confirm|payment|sumup|pay/.test(lower) && /book|confirm|payment|sumup|pay/.test(haystack)) {
      score += 3;
    }
    if (/hour|24\/7|christmas|bank holiday|night/.test(lower) && /24|365|christmas|bank/.test(haystack)) {
      score += 4;
    }
    if (/contact|phone|email|whatsapp|number/.test(lower) && /contact|whatsapp|email|call/.test(haystack)) {
      score += 3;
    }
    if (/airport|cover|areas?/.test(lower) && /airport|cover|belfast|dublin|derry/.test(haystack)) {
      score += 2;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { score, body: chunk.body, title: chunk.title };
    }
  }

  if (!best || best.score < 3) {
    return null;
  }

  return best.body;
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

function tryBuildQuote(draft: QuoteDraft): { text: string; enquiryOnly: boolean } | null {
  if (!draft.airportCode || !draft.address) {
    return null;
  }

  const passengers = draft.passengers ?? 2;
  const suitcases = draft.suitcases ?? 2;
  const vehicle = draft.vehicle ?? pickVehicle(passengers, suitcases);
  const enquiryOnly = isVehicleEnquiryOnly(vehicle);

  if (enquiryOnly) {
    const airportName =
      AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
    return {
      enquiryOnly: true,
      text:
        `${vehicle.split(" (")[0]} is enquiry only for ${airportName}. ` +
        `Send an enquiry on the quote form with your trip details and we’ll confirm availability and price. ` +
        `Or call ${SITE.landlineDisplay}.`,
    };
  }

  const quote = calculateQuote(
    draft.address,
    draft.airportCode,
    vehicle,
    draft.returnJourney === true,
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

  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
  const directionLabel =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;
  const areaNote = quote.area ? ` (priced via ${quote.area})` : "";

  return {
    enquiryOnly: false,
    text:
      `Your fixed journey price ${directionLabel} is ${formatQuote(quote.amount)}${areaNote}.\n` +
      `${vehicle.split(" (")[0]} · ${passengers} passengers · ${suitcases} suitcases` +
      `${draft.returnJourney ? " · return journey" : ""}.\n\n` +
      `Includes vehicle, driver, fuel, tolls, and up to 60 minutes waiting after landing for airport pickups.\n\n` +
      `To book: use Request to book on the quote form. Once we confirm, we’ll email a SumUp payment link — your booking is confirmed after payment.`,
  };
}

export function createWelcomeMessages(): AssistantMessage[] {
  return [
    {
      role: "bot",
      text:
        `Hi — I’m the ${SITE.name} assistant. Ask me anything about airport transfers, waiting time, vehicles, or get a fixed journey price.\n\n` +
        "Example: “Quote from Bangor to Belfast International for 2 passengers and 3 cases”.",
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
  let nextDraft: QuoteDraft = { ...draft };

  if (!text) {
    return {
      reply: "Type a question, or ask for a quote with your airport and town/address.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
    };
  }

  if (/another quote|new quote|start again|reset quote|different quote/.test(lower)) {
    nextDraft = {};
    return {
      reply: "No problem — which airport is the transfer for?",
      draft: nextDraft,
      resetDraft: true,
      quickReplies: ["Belfast International", "Dublin", "City of Derry"],
    };
  }

  if (/save contact|add contact|contact details|contact card|qr code|save (your|our) (number|details)/.test(lower)) {
    return {
      reply:
        "Would you like to add our contact details? Scan and save with the QR code above — it opens our contact card with our logo.",
      draft: nextDraft,
      showContactOffer: true,
      quickReplies: ["Get a quote"],
    };
  }

  if (/^(hi|hello|hey)\b/.test(lower)) {
    return {
      reply: "Hello! I can answer questions about our service or work out a fixed airport transfer price.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
      showContactOffer: true,
    };
  }

  if (/book online|quote form|#quote|request to book/.test(lower)) {
    return {
      reply:
        "Open Get a Live Quote on this page, enter your trip, then Request to book / Enquire to book. We’ll confirm and email a SumUp payment link.",
      draft: nextDraft,
      quickReplies: ["Get a quote", "Save contact details"],
    };
  }

  if (/whatsapp|call|phone|email|contact you/.test(lower) && !/quote|price|how much/.test(lower)) {
    return {
      reply: `You can call ${SITE.landlineDisplay}, WhatsApp @${SITE.whatsappUsername}, or email ${SITE.email}. Or scan and save our contact QR code in this chat.`,
      draft: nextDraft,
      showContactOffer: true,
      quickReplies: ["Save contact details", "Get a quote"],
    };
  }

  const airport = matchAirport(text);
  if (airport) {
    nextDraft.airportCode = airport;
  }

  if (/\bfrom airport\b|\barriving\b|\bpick.?up from (the )?airport\b|\bcollection from\b/.test(lower)) {
    nextDraft.direction = "from-airport";
  } else if (/\bto airport\b|\bgoing to\b|\bdeparting\b|\bdrop.?off at\b/.test(lower)) {
    nextDraft.direction = "to-airport";
  }

  if (/\breturn\b/.test(lower)) {
    nextDraft.returnJourney = true;
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

  const areaMention = matchAreaMention(text);
  if (areaMention && !matchAirport(areaMention)) {
    nextDraft.address = areaMention;
  }

  // Capture address phrases when area matcher missed
  if (!nextDraft.address) {
    const addressMatch =
      text.match(/\bfrom\s+(.+?)(?:\s+to\s+(?:the\s+)?(?:airport|belfast|dublin|derry)|\s+for\s+\d|\s*$)/i) ||
      text.match(/\bto\s+(.+?)(?:\s+from\s+(?:the\s+)?(?:airport|belfast|dublin|derry)|\s+for\s+\d|\s*$)/i);
    if (addressMatch?.[1] && !matchAirport(addressMatch[1])) {
      const candidate = addressMatch[1].replace(/[?.!]+$/, "").trim();
      if (candidate.length >= 3 && !/^(a quote|quote|airport|belfast international|dublin|city of derry)$/i.test(candidate)) {
        nextDraft.address = candidate;
      }
    }
  }

  const wantsQuote = /get a quote|quote|price|how much|fare|cost|estimate/.test(lower);

  if (wantsQuote && !nextDraft.airportCode) {
    return {
      reply: "Which airport is your transfer for?",
      draft: nextDraft,
      quickReplies: ["Belfast International", "Dublin", "City of Derry"],
    };
  }

  if (nextDraft.airportCode && !nextDraft.address && (wantsQuote || Boolean(airport))) {
    const airportName =
      AIRPORTS.find((item) => item.code === nextDraft.airportCode)?.name ?? nextDraft.airportCode;
    return {
      reply: `Got it — ${airportName}. What’s the pickup or drop-off town / address? (e.g. Bangor, Lisburn, Holywood, or a BT postcode)`,
      draft: nextDraft,
      quickReplies: ["Bangor", "Lisburn", "Holywood", "Belfast City Centre"],
    };
  }

  if (nextDraft.airportCode && nextDraft.address && (wantsQuote || Boolean(airport) || Boolean(areaMention))) {
    const built = tryBuildQuote(nextDraft);
    if (built) {
      return {
        reply: built.text,
        draft: {},
        resetDraft: true,
        quickReplies: ["Another quote", "Request to book", "Save contact details"],
        showContactOffer: true,
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

  if (nextDraft.airportCode && nextDraft.address) {
    const built = tryBuildQuote(nextDraft);
    if (built) {
      return {
        reply: built.text,
        draft: {},
        resetDraft: true,
        quickReplies: ["Another quote", "Request to book", "Save contact details"],
      };
    }
  }

  return {
    reply:
      "I can answer questions from our site (booking, waiting time, vehicles, airports) and work out a fixed journey price with the same pricing as the quote tool.\n\n" +
      "Try: “Quote from Bangor to Belfast International for 2 passengers and 3 cases”.",
    draft: nextDraft,
    quickReplies: ["Get a quote", "Save contact details"],
  };
}

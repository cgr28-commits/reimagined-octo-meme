import {
  AIRPORTS,
  ALL_AIRPORTS,
  AREAS,
  CHAUFFEUR_SERVICES,
  DRIVER_TRACKING_HIGHLIGHTS,
  FAQS,
  MAX_ONLINE_PASSENGERS,
  SERVICE_FLAGS,
  SITE,
  VEHICLE_BOOKING_GUIDANCE,
  VEHICLE_FLEET,
  VEHICLE_TYPES,
  WHY_CHOOSE_US,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  showsOnlineGuidePrice,
} from "@/lib/data";
import { selectVehicleForParty } from "@/lib/vehicle-selection";
import { isValidPassengerCount, PASSENGER_LIMIT_ERROR } from "../../shared/passenger-limits";
import { resolveJourneyInclusions } from "@/lib/journey-inclusions";
import { BUSINESS_LEGAL } from "@/lib/business-legal";
import {
  LONG_DISTANCE_EXAMPLE_ROUTES,
  LONG_DISTANCE_HIGHLIGHTS,
  LONG_DISTANCE_INTRO,
  LONG_DISTANCE_PAGE_TITLE,
  LONG_DISTANCE_SERVICE_NOTES,
} from "@/lib/long-distance-content";
import {
  LOCATIONS_AIRPORT_EXAMPLES,
  LOCATIONS_LONG_DISTANCE_EXAMPLES,
  LOCATIONS_PAGE_INTRO,
  LOCATIONS_ROI_EXAMPLES,
  LOCATIONS_ROUTE_NOTE,
} from "@/lib/locations-content";
import {
  AIRPORT_PAGES,
  TOWN_AREAS,
  TRANSFER_ROUTE_PAGES,
} from "@/lib/location-pages";
import { TOUR_BENEFITS, TOURS } from "@/lib/tours";
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from "@/lib/terms";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import { isValidEmailAddress, isValidMobileNumber } from "@/lib/booking-message";
import {
  isSoftFlightLookupFailure,
  isValidFlightNumberFormat,
  lookupFlightForBooking,
  normalizeFlightNumber,
} from "@/lib/flight-lookup";
import { formatUkDate, formatUkDateTime } from "@/lib/format-datetime";
import { parseLondonLocalDateTime } from "@/lib/london-time";
import { calculateQuote, formatQuote, matchAreaFromAddress, arePublicLivePricesEnabled, getPublicUnapprovedPriceLabel } from "@/lib/quote";

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
  /** In-chat booking started after a quote (do not open the quote tool). */
  bookingStarted?: boolean;
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  termsAccepted?: boolean;
  quotedAmountLabel?: string;
  flightValidated?: boolean;
  returnFlightValidated?: boolean;
  marketingOptIn?: boolean;
  /** After a quote, ask whether to email it before booking. */
  awaitingQuoteEmailDecision?: boolean;
  /** Collecting the address to email the quote to. */
  awaitingQuoteEmailAddress?: boolean;
  quoteEmailSent?: boolean;
};

export type AssistantResponse = {
  reply: string;
  draft: QuoteDraft;
  quickReplies?: string[];
  resetDraft?: boolean;
  showContactOffer?: boolean;
  /** @deprecated Prefer in-chat booking; kept for rare fallbacks */
  openQuoteForm?: boolean;
  quoteCard?: QuoteCardSummary;
  /** Consecutive unanswered / misunderstood turns — UI should pass this back in. */
  consecutiveMisses?: number;
  /** Hint for the chat input control (date/time pickers). */
  inputMode?: "text" | "date" | "time";
  /** UI should submit the completed booking draft. */
  submitBooking?: boolean;
  /** UI should email the current quote to draft.customerEmail. */
  emailQuote?: boolean;
};

export type AssistantContext = {
  consecutiveMisses?: number;
};

type MissingField =
  | "direction"
  | "returnJourney"
  | "airport"
  | "address"
  | "passengers"
  | "suitcases"
  | "tripDate"
  | "tripTime"
  | "returnDate"
  | "returnTime"
  | "customerName"
  | "mobileNumber"
  | "customerEmail"
  | "flightNumber"
  | "returnFlightNumber"
  | "termsAccepted"
  | "marketingOptIn"
  | "confirmBooking";

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
  contentAfterList?: readonly string[];
  footer?: string;
  subsections?: ReadonlyArray<{ subtitle: string; content: readonly string[] }>;
}): string {
  const parts: string[] = [];
  if (section.content) parts.push(...section.content);
  if (section.list) parts.push(...section.list);
  if (section.contentAfterList) parts.push(...section.contentAfterList);
  if (section.footer) parts.push(section.footer);
  if (section.subsections) {
    for (const sub of section.subsections) {
      parts.push(sub.subtitle, ...sub.content);
    }
  }
  return parts.join(" ");
}

let cachedKnowledgeChunks: Array<{ title: string; body: string }> | null = null;

/** Full site knowledge corpus for the quote bot (memoised). Exported for coverage tests. */
export function getAssistantKnowledgeChunks(): Array<{ title: string; body: string }> {
  if (cachedKnowledgeChunks) {
    return cachedKnowledgeChunks;
  }
  cachedKnowledgeChunks = knowledgeChunks();
  return cachedKnowledgeChunks;
}

function knowledgeChunks(): Array<{ title: string; body: string }> {
  const chunks: Array<{ title: string; body: string }> = FAQS.map((faq) => ({
    title: faq.question,
    body: faq.answer,
  }));

  for (const section of TERMS_SECTIONS) {
    chunks.push({ title: `Terms — ${section.title}`, body: sectionText(section) });
  }
  for (const section of PRIVACY_SECTIONS) {
    chunks.push({ title: `Privacy — ${section.title}`, body: sectionText(section) });
  }
  for (const item of WHY_CHOOSE_US) {
    chunks.push({ title: item.title, body: item.description });
  }

  if (SERVICE_FLAGS.liveDriverTracking) {
    for (const item of DRIVER_TRACKING_HIGHLIGHTS) {
      chunks.push({ title: item.title, body: item.description });
    }
  }

  chunks.push(
    {
      title: "How booking works",
      body:
        "Standard process: (1) Get a Live Quote on the website or in this chat for your fixed journey price. (2) When an instant fare is shown, you can pay online with SumUp to confirm. Otherwise Request to book / enquire with your date, time, and contact details — we confirm the job and email a SumUp payment link; booking is confirmed after payment. Online quotes cover 1–4 passengers only (Saloon or Estate). My Airport Taxi NI provides private airport transfers for up to 4 passengers.",
    },
    {
      title: "Quote tool flow",
      body:
        "The quote tool asks for pickup and drop-off addresses (selected from Google Places suggestions), passengers, and suitcases, then shows the fixed journey price and vehicle where available. Pickup date and time are required before you can Request to book — return trips must be after the outbound journey. You can finish booking in this chat with date/time, contact details, flight numbers and terms — flight numbers are checked before we send the request. Typed addresses that are not selected from suggestions are not accepted.",
    },
    {
      title: "Airports we cover",
      body: `We cover ${AIRPORTS.map((a) => `${a.name} (${a.code}): ${a.description} ${a.distance}, ${a.duration}`).join(" ")} Airport pickups include the applicable airport pickup fee (or Dublin parking and M1 tolls) and 60 minutes complimentary waiting after landing. Airport drop-offs include the applicable airport drop-off fee where charged, or M1 tolls for Dublin. City of Derry Airport has no airport fee. Address-to-address journeys are a fixed price for your route.`,
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
      title: "Vehicle booking guidance",
      body: VEHICLE_BOOKING_GUIDANCE.join(" "),
    },
    {
      title: "Passenger capacity",
      body:
        "My Airport Taxi NI provides private airport transfers for up to 4 passengers. Online quotes and bookings are for 1–4 passengers in a Saloon or Estate car. We do not offer public online quotes for larger groups.",
    },
    {
      title: "Operator and business details",
      body: `${BUSINESS_LEGAL.tradingName} — ${BUSINESS_LEGAL.operatorNote}. Service area: ${BUSINESS_LEGAL.serviceArea}. Jurisdiction: ${BUSINESS_LEGAL.jurisdiction}. Email ${BUSINESS_LEGAL.email}, telephone ${BUSINESS_LEGAL.phoneDisplay}. ${BUSINESS_LEGAL.addressOnRequestNote} Website ${BUSINESS_LEGAL.website}.`,
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
        "Meet & greet can be requested during booking where available — we can meet you in the arrivals hall with a name board. Ask for meet and greet when you book and share your flight number so we can plan the collection.",
    },
    {
      title: "Flight delays and waiting time",
      body:
        "We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include up to 60 minutes complimentary waiting time. Airport drop-offs include the applicable airport drop-off fee where charged. Non-airport pickups include 10 minutes complimentary waiting. Dublin Airport fares include M1 tolls (and parking on pickups).",
    },
    {
      title: "Cash and payment options",
      body:
        "Transfers with an instant fare can pay by card online via SumUp at the end of the website quote. Otherwise, after you Request to book and we confirm the job, we email a SumUp payment link. Cash to the driver or bank transfer can be arranged where agreed.",
    },
    {
      title: "Terms last updated",
      body: `Our Terms & Conditions were last updated ${TERMS_LAST_UPDATED}. Full details are on ${SITE.url}/terms/.`,
    },
  );

  // Long-distance transfers page
  if (SERVICE_FLAGS.addressToAddress) {
    chunks.push({
      title: LONG_DISTANCE_PAGE_TITLE,
      body: [LONG_DISTANCE_INTRO, ...LONG_DISTANCE_SERVICE_NOTES].join(" "),
    });
    for (const item of LONG_DISTANCE_HIGHLIGHTS) {
      chunks.push({ title: `Long-distance — ${item.title}`, body: item.description });
    }
    chunks.push({
      title: "Long-distance example routes",
      body: `Example long-distance routes from Greater Belfast: ${LONG_DISTANCE_EXAMPLE_ROUTES.join("; ")}.`,
    });
    chunks.push({
      title: "Locations we cover",
      body: [
        LOCATIONS_PAGE_INTRO,
        `Republic of Ireland example destinations: ${LOCATIONS_ROI_EXAMPLES.join(", ")}.`,
        `Airports: ${LOCATIONS_AIRPORT_EXAMPLES.join(", ")}.`,
        LOCATIONS_ROUTE_NOTE,
        `Popular routes: ${LOCATIONS_LONG_DISTANCE_EXAMPLES.join("; ")}.`,
      ].join(" "),
    });
  }

  // Airport guide pages
  for (const airport of AIRPORT_PAGES) {
    chunks.push({
      title: airport.title,
      body: [
        airport.intro,
        ...airport.highlights,
        ...airport.localTips,
        airport.fromPriceLabel,
        airport.durationNote,
        `Areas often served: ${airport.areaServed.join(", ")}.`,
      ].join(" "),
    });
  }

  // Catalogue airport descriptions (including soft-hidden ones still in pricing)
  for (const airport of ALL_AIRPORTS) {
    chunks.push({
      title: `${airport.name} airport summary`,
      body: `${airport.name} (${airport.code}): ${airport.description} ${airport.distance}. Typical timing: ${airport.duration}.`,
    });
  }

  // Town pickup areas
  for (const town of TOWN_AREAS) {
    chunks.push({
      title: `${town.name} airport transfers`,
      body: `${town.blurb} Quote address hint: ${town.addressHint}.`,
    });
  }

  // Popular town ↔ airport route notes
  for (const route of TRANSFER_ROUTE_PAGES) {
    chunks.push({
      title: route.title,
      body: [route.intro, ...route.journeyNotes].join(" "),
    });
  }

  if (SERVICE_FLAGS.chauffeur) {
    for (const item of CHAUFFEUR_SERVICES) {
      chunks.push({ title: `Chauffeur — ${item.title}`, body: item.description });
    }
  } else {
    chunks.push({
      title: "Chauffeur and executive private hire",
      body: "We provide chauffeur and executive private hire across Northern Ireland for business travel, events, and as-directed journeys — as well as our airport transfer service. Contact us via WhatsApp for a personalised quote.",
    });
  }

  if (SERVICE_FLAGS.dayTrips) {
    for (const tour of TOURS) {
      chunks.push({
        title: tour.title,
        body: [
          tour.shortDescription,
          tour.description,
          `Duration: ${tour.duration}.`,
          `Price: ${tour.price}. ${tour.priceNote}`,
          `Highlights: ${tour.highlights.join("; ")}.`,
        ].join(" "),
      });
    }
    chunks.push({
      title: "Day trip benefits",
      body: TOUR_BENEFITS.map((item) => `${item.title}: ${item.description}`).join(" "),
    });
  }

  return chunks;
}

function matchKnowledge(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords = lower
    .split(/[^a-z0-9£%]+/i)
    .filter((word) => word.length > 2);

  let best: { score: number; body: string; title: string } | null = null;

  for (const chunk of getAssistantKnowledgeChunks()) {
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
    if (/vehicle|estate|saloon|executive|fleet/.test(lower) && /vehicle|fleet|saloon|estate/.test(haystack)) score += 3;
    if (/book|confirm|payment|sumup|pay/.test(lower) && /book|confirm|payment|sumup|pay/.test(haystack)) score += 3;
    if (/privacy|data|gdpr|marketing email|cookie|google places|google ads/.test(lower) && /privacy|data|marketing|personal|cookie|places|ads/.test(haystack)) score += 5;
    if (/track|driver location|live track/.test(lower) && /track|driver|location/.test(haystack)) score += 4;
    if (/hour|24\/7|christmas|bank holiday|night|early morning/.test(lower) && /24|365|christmas|bank|early/.test(haystack)) score += 4;
    if (/contact|phone|email|whatsapp|number|landline|business address/.test(lower) && /contact|whatsapp|email|call|landline|address/.test(haystack)) score += 3;
    if (/airport|cover|areas?|pickup point|where do you pick/.test(lower) && /airport|cover|belfast|dublin|derry|areas|pickup|arrivals/.test(haystack)) score += 2;
    if (
      /long.?distance|cross.?border|republic|roi|eircode|cork|galway|limerick|donegal|out.?of.?area|greater belfast/.test(
        lower,
      ) &&
      /long|distance|cross|border|ireland|cork|galway|out-of-area|greater belfast|roi|republic/.test(haystack)
    ) {
      score += 6;
    }
    if (
      /belfast city|bhd|aldergrove|belfast international|bfs|city of derry|ldy|dublin airport|dub/.test(lower) &&
      /belfast|aldergrove|derry|dublin|bfs|bhd|ldy|dub/.test(haystack)
    ) {
      score += 4;
    }
    if (/capacity|passengers?|how many|up to 4|1.?4/.test(lower) && /passenger|capacity|1–4|up to 4|saloon|estate/.test(haystack)) {
      score += 4;
    }
    if (
      SERVICE_FLAGS.dayTrips &&
      /tour|day trip|causeway|game of thrones/.test(lower) &&
      /tour|day|causeway|thrones/.test(haystack)
    ) {
      score += 5;
    }
    if (/toll|gbp|currency|sterling|pound/.test(lower) && /toll|gbp|sterling|pound|currency/.test(haystack)) {
      score += 4;
    }
    if (/terms|condition|policy|liability|no.?show/.test(lower) && /terms|condition|liability|no show|cancel/.test(haystack)) {
      score += 3;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { score, body: chunk.body, title: chunk.title };
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
      quickReplies: ["Get a quote", "Save to contacts"],
      consecutiveMisses: 0,
    };
  }

  return {
    reply:
      `I can see “${address}”, but it isn’t in an area I can auto-price for ${airportName} yet.\n\n` +
      `Try a full street address with town or BT postcode from our usual coverage (for example Bangor, Lisburn, Newtownabbey), or speak to us and we’ll quote you manually.`,
    draft: { ...draft, address: undefined },
    quickReplies: ["Get a quote", "Save to contacts"],
    consecutiveMisses: 0,
  };
}

function humanHandoffReply(draft: QuoteDraft): AssistantResponse {
  return {
    reply:
      `No problem — you can reach us directly.\n\n` +
      `Call ${SITE.landlineDisplay} or email ${SITE.email}.\n\n` +
      `Or save our contact card below — for quotes and bookings, this chat is the fastest way.`,
    draft,
    quickReplies: ["Save to contacts", "Get a quote"],
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
      const max = kind === "passenger" ? MAX_ONLINE_PASSENGERS : 16;
      if (Number.isFinite(value) && value >= min && value <= max) return value;
    }
  }
  return undefined;
}

function extractBareCount(text: string): number | undefined {
  const match = text.trim().match(/^(\d+)$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  // Bare numbers may be passengers (1–4) or suitcases (0–16). Cap at 16 for suitcases;
  // passenger extraction elsewhere uses MAX_ONLINE_PASSENGERS.
  if (!Number.isFinite(value) || value < 0 || value > 16) return undefined;
  return value;
}

function pickVehicle(passengers: number, suitcases: number): (typeof VEHICLE_TYPES)[number] {
  return selectVehicleForParty(passengers, suitcases);
}

function matchExplicitVehicle(text: string): (typeof VEHICLE_TYPES)[number] | undefined {
  const lower = text.toLowerCase();
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

function nextQuoteField(draft: QuoteDraft): MissingField | null {
  if (!draft.direction) return "direction";
  if (draft.returnJourney === undefined) return "returnJourney";
  if (!draft.airportCode) return "airport";
  if (!draft.address) return "address";
  if (draft.passengers === undefined) return "passengers";
  if (draft.suitcases === undefined) return "suitcases";
  return null;
}

function nextBookingField(draft: QuoteDraft): MissingField | null {
  if (!draft.tripDate) return "tripDate";
  if (!draft.tripTime) return "tripTime";
  if (draft.returnJourney) {
    if (!draft.returnDate) return "returnDate";
    if (!draft.returnTime) return "returnTime";
  }
  if (!draft.customerName?.trim()) return "customerName";
  if (!draft.mobileNumber?.trim()) return "mobileNumber";
  if (!draft.customerEmail?.trim()) return "customerEmail";
  if (!draft.flightNumber?.trim()) return "flightNumber";
  if (draft.returnJourney && !draft.returnFlightNumber?.trim()) return "returnFlightNumber";
  if (!draft.termsAccepted) return "termsAccepted";
  if (!draft.marketingOptIn) return "marketingOptIn";
  return "confirmBooking";
}

function nextMissingField(draft: QuoteDraft): MissingField | null {
  if (draft.bookingStarted) {
    return nextBookingField(draft);
  }
  return nextQuoteField(draft);
}

/** Exported so the chat UI can show calendar/clock pickers for date/time steps. */
export function getNextQuoteField(draft: QuoteDraft): MissingField | null {
  return nextMissingField(draft);
}

export type QuoteMissingField = MissingField;

function inputModeForField(field: MissingField): "text" | "date" | "time" | undefined {
  if (field === "tripDate" || field === "returnDate") return "date";
  if (field === "tripTime" || field === "returnTime") return "time";
  return undefined;
}

function parseDateTimeValue(date: string, time: string): number {
  return parseLondonLocalDateTime(date, time)?.getTime() ?? Number.NaN;
}

function isReturnAfterOutbound(
  outboundDate: string,
  outboundTime: string,
  returnDate: string,
  returnTime: string,
): boolean {
  return parseDateTimeValue(returnDate, returnTime) > parseDateTimeValue(outboundDate, outboundTime);
}

function extractPersonName(text: string): string | undefined {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const labeled = cleaned.match(
    /^(?:my name is|i'?m|i am|name(?:\s*is)?)\s+([a-z][a-z'’.\-]+(?:\s+[a-z][a-z'’.\-]+){0,3})$/i,
  );
  if (labeled?.[1]) {
    return labeled[1].replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (
    /^[a-z][a-z'’.\-]+(?:\s+[a-z][a-z'’.\-]+){0,3}$/i.test(cleaned) &&
    cleaned.split(/\s+/).length <= 4 &&
    !/\b(yes|no|book|quote|airport|saloon|estate|minibus|today|tomorrow|accept|confirm|skip)\b/i.test(
      cleaned,
    )
  ) {
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return undefined;
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0]?.toLowerCase();
}

function extractMobile(text: string): string | undefined {
  const match = text.match(/(?:\+?44|0)\s*\d(?:[\s-]?\d){8,13}/);
  if (!match) return undefined;
  return match[0].replace(/[^\d+]/g, "");
}

function extractFlightNumberToken(text: string): string | undefined {
  const cleaned = text.trim();
  if (!cleaned) return undefined;
  const labeled = cleaned.match(
    /\b(?:flight(?:\s*number)?|flt)\s*[:=]?\s*([a-z0-9]{2,3}\s*\d{1,4}[a-z]?)\b/i,
  );
  if (labeled?.[1]) return normalizeFlightNumber(labeled[1]);
  const bare = cleaned.match(/^([a-z0-9]{2,3}\s*\d{1,4}[a-z]?)$/i);
  if (bare?.[1]) return normalizeFlightNumber(bare[1]);
  const embedded = cleaned.match(/\b([a-z]{2,3}\s*\d{1,4}[a-z]?)\b/i);
  if (embedded?.[1]) return normalizeFlightNumber(embedded[1]);
  return undefined;
}

function acceptsTerms(text: string): boolean {
  return /\b(i accept|accept( the)? terms|yes,? i accept|yes)\b/i.test(text) ||
    /^(accept|ok|okay|sure)$/i.test(text.trim());
}

function acceptsMarketing(text: string): boolean {
  return /\b(i agree|i accept|agree|yes,? i agree|yes|opt in|subscribe)\b/i.test(text) ||
    /^(agree|accept|ok|okay|sure)$/i.test(text.trim());
}

function confirmsBooking(text: string): boolean {
  return /\b(confirm|yes|book it|place (the )?booking|go ahead|submit|that'?s correct|looks good|ok|okay|send)\b/i.test(
    text,
  );
}

function bookingSummary(draft: QuoteDraft): string {
  const airportName =
    AIRPORTS.find((item) => item.code === draft.airportCode)?.name ?? draft.airportCode;
  const direction =
    draft.direction === "from-airport" ? `from ${airportName}` : `to ${airportName}`;
  const lines = [
    `Trip: ${direction}${draft.returnJourney ? " (return)" : " (one way)"}`,
    `Address: ${draft.address}`,
    `Outbound: ${formatUkDateTime(draft.tripDate ?? "", draft.tripTime ?? "")}`,
  ];
  if (draft.returnJourney) {
    lines.push(
      `Return: ${formatUkDateTime(draft.returnDate ?? "", draft.returnTime ?? "")}`,
    );
  }
  lines.push(`Name: ${draft.customerName}`);
  lines.push(`Mobile: ${draft.mobileNumber}`);
  lines.push(`Email: ${draft.customerEmail}`);
  lines.push(`Flight: ${draft.flightNumber}`);
  if (draft.returnJourney && draft.returnFlightNumber) {
    lines.push(`Return flight: ${draft.returnFlightNumber}`);
  }
  if (draft.quotedAmountLabel) {
    lines.push(`Quoted price: ${draft.quotedAmountLabel}`);
  }
  lines.push(`Terms accepted: ${draft.termsAccepted ? "Yes" : "No"}`);
  lines.push(`Marketing emails: ${draft.marketingOptIn ? "Opted in" : "Not opted in"}`);
  return lines.join("\n");
}

async function verifyFlightForDraft(
  flightNumber: string,
  tripDate: string,
  airportCode: string,
  direction: "to-airport" | "from-airport",
): Promise<{ accept: boolean; hardFail: boolean; message: string }> {
  if (!isValidFlightNumberFormat(flightNumber)) {
    return {
      accept: false,
      hardFail: true,
      message: `“${flightNumber}” doesn’t look like a valid flight number. Please use a format like BA1234 or EI335.`,
    };
  }

  const result = await lookupFlightForBooking({
    flightNumber,
    tripDate,
    airportCode,
    direction,
  });

  if (result.ok) {
    const flight = result.flight;
    const route =
      flight.departureAirport && flight.arrivalAirport
        ? `${flight.departureAirport} → ${flight.arrivalAirport}`
        : "";
    const when = flight.scheduledTimeLabel ? ` · ${flight.scheduledTimeLabel}` : "";
    return {
      accept: true,
      hardFail: false,
      message: `Flight ${flight.flightNumber || flightNumber} verified${route ? ` (${route}${when})` : ""}.`,
    };
  }

  if (!result.configured || isSoftFlightLookupFailure(result.code)) {
    return {
      accept: true,
      hardFail: false,
      message:
        result.error ||
        `I couldn’t reach live flight data just now, so I’ll take ${flightNumber} as entered.`,
    };
  }

  return {
    accept: false,
    hardFail: true,
    message:
      result.error ||
      `I couldn’t verify flight ${flightNumber} for that date and airport. Please check the number and try again.`,
  };
}

function promptForField(field: MissingField, draft: QuoteDraft): AssistantResponse {
  const airportName =
    AIRPORTS.find((item) => item.code === draft.airportCode)?.name ?? draft.airportCode;
  const mode = inputModeForField(field);

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
        quickReplies: ["Choose date"],
        inputMode: mode,
      };
    case "tripTime":
      return {
        reply: "What pickup time do you need?",
        draft,
        quickReplies: ["Choose time"],
        inputMode: mode,
      };
    case "returnDate":
      return {
        reply: "What date is the return journey?",
        draft,
        quickReplies: ["Choose date"],
        inputMode: mode,
      };
    case "returnTime":
      return {
        reply: "What pickup time for the return journey?",
        draft,
        quickReplies: ["Choose time"],
        inputMode: mode,
      };
    case "passengers":
      return {
        reply: "How many passengers? (Up to 4.)",
        draft,
        quickReplies: [
          "1 passenger",
          "2 passengers",
          "3 passengers",
          "4 passengers",
        ],
      };
    case "suitcases":
      return {
        reply: "How many suitcases / cases?",
        draft,
        quickReplies: ["1 suitcase", "2 suitcases", "3 suitcases", "4 suitcases"],
      };
    case "customerName":
      return {
        reply: "What’s your full name for the booking?",
        draft,
        quickReplies: [],
      };
    case "mobileNumber":
      return {
        reply: "What’s the best mobile number for the driver to reach you?",
        draft,
        quickReplies: [],
      };
    case "customerEmail":
      return {
        reply: "And your email address for the booking confirmation?",
        draft,
        quickReplies: [],
      };
    case "flightNumber":
      return {
        reply:
          draft.direction === "from-airport"
            ? "What’s your flight number for arrival? I’ll check it’s correct for that date."
            : "What’s your flight number for going? I’ll check it’s correct for that date.",
        draft,
        quickReplies: [],
      };
    case "returnFlightNumber":
      return {
        reply:
          "What’s your return / collection flight number? I’ll check it’s correct for the return date.",
        draft,
        quickReplies: [],
      };
    case "termsAccepted":
      return {
        reply:
          `Please confirm you accept our terms and conditions (${SITE.name} terms, last updated ${TERMS_LAST_UPDATED}). Reply “I accept” to continue — you can also read them at /terms/.`,
        draft,
        quickReplies: ["I accept", "Open terms"],
      };
    case "marketingOptIn":
      return {
        reply:
          `Please confirm you’re happy to receive occasional offers, travel tips and news by email from ${SITE.name}. You can unsubscribe any time. Reply “I agree” to continue — or read our privacy policy at /privacy/.`,
        draft,
        quickReplies: ["I agree", "Open privacy"],
      };
    case "confirmBooking":
      return {
        reply:
          `Please confirm these booking details:\n\n${bookingSummary(draft)}\n\nReply “Confirm booking” to send your request.`,
        draft,
        quickReplies: ["Confirm booking", "Change details"],
      };
  }
}

async function continueBookingPrompt(
  draft: QuoteDraft,
  prefix = "",
): Promise<AssistantResponse> {
  const field = nextBookingField(draft);
  if (!field) {
    return {
      reply: prefix || "Your booking details look complete.",
      draft,
      quickReplies: ["Confirm booking"],
    };
  }
  const prompt = promptForField(field, draft);
  return {
    ...prompt,
    reply: prefix ? `${prefix}\n\n${prompt.reply}` : prompt.reply,
  };
}

function resetBookingFields(draft: QuoteDraft): QuoteDraft {
  return {
    airportCode: draft.airportCode,
    direction: draft.direction,
    address: draft.address,
    passengers: draft.passengers,
    suitcases: draft.suitcases,
    vehicle: draft.vehicle,
    returnJourney: draft.returnJourney,
    quotedAmountLabel: draft.quotedAmountLabel,
    customerEmail: draft.customerEmail,
    bookingStarted: true,
  };
}

function wantsQuoteEmailed(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    /^(yes,? email( quote)?|email (me )?(this )?quote|email it|send (me )?(the )?quote|yes$|yes please|yeah|yep)\b/.test(
      lower,
    ) || /\bemail (me )?(this )?quote\b/.test(lower)
  );
}

function declinesQuoteEmail(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return /^(no|no thanks|no thank you|not now|no email|skip|maybe later)\b/.test(lower);
}

function hasQuotedTrip(draft: QuoteDraft): boolean {
  return Boolean(
    draft.quotedAmountLabel &&
      draft.airportCode &&
      draft.address &&
      draft.direction &&
      draft.passengers !== undefined,
  );
}

function handleQuoteEmailTurn(text: string, draft: QuoteDraft): AssistantResponse | null {
  const nextDraft: QuoteDraft = { ...draft };
  const lower = text.toLowerCase().trim();

  if (nextDraft.awaitingQuoteEmailAddress) {
    if (declinesQuoteEmail(text)) {
      nextDraft.awaitingQuoteEmailAddress = false;
      nextDraft.awaitingQuoteEmailDecision = false;
      return {
        reply: "No problem. Would you like to book this trip, or change any details?",
        draft: nextDraft,
        quickReplies: ["Yes, book", "Change details", "Another quote"],
      };
    }

    if (/^(yes,? book|book now|book this)\b/.test(lower) || /^book\b/.test(lower)) {
      nextDraft.awaitingQuoteEmailAddress = false;
      return null;
    }

    if (
      /^(try again|resend|send again)\b/.test(lower) &&
      nextDraft.customerEmail &&
      isValidEmailAddress(nextDraft.customerEmail)
    ) {
      return {
        reply: `Sending your quote to ${nextDraft.customerEmail}…`,
        draft: nextDraft,
        emailQuote: true,
        quickReplies: [],
      };
    }

    const email = extractEmail(text) ?? text.trim();
    if (!isValidEmailAddress(email)) {
      return {
        reply: "Please enter a valid email address so I can send your quote.",
        draft: nextDraft,
        quickReplies: ["No thanks", "Yes, book"],
      };
    }

    nextDraft.customerEmail = email;
    nextDraft.awaitingQuoteEmailAddress = false;
    nextDraft.awaitingQuoteEmailDecision = false;
    return {
      reply: `Sending your quote to ${email}…`,
      draft: nextDraft,
      emailQuote: true,
      quickReplies: [],
    };
  }

  if (!nextDraft.awaitingQuoteEmailDecision && !wantsQuoteEmailed(text)) {
    return null;
  }

  if (declinesQuoteEmail(text)) {
    nextDraft.awaitingQuoteEmailDecision = false;
    nextDraft.awaitingQuoteEmailAddress = false;
    return {
      reply: "No problem. Would you like to book this trip, or change any details?",
      draft: nextDraft,
      quickReplies: ["Yes, book", "Change details", "Another quote"],
    };
  }

  // Prefer booking if they clearly chose book over email.
  if (
    /^(yes,? book|book now|book this|request to book|enquire to book)\b/.test(lower) ||
    /^book\b/.test(lower)
  ) {
    nextDraft.awaitingQuoteEmailDecision = false;
    return null;
  }

  if (!wantsQuoteEmailed(text)) {
    // Still waiting on the email offer — leave other intents (change details, etc.) alone.
    return null;
  }

  if (!hasQuotedTrip(nextDraft)) {
    return {
      reply: "Let’s get your quote first — say “Get a quote”, then I can email it to you.",
      draft: nextDraft,
      quickReplies: ["Get a quote"],
    };
  }

  nextDraft.awaitingQuoteEmailDecision = false;
  nextDraft.awaitingQuoteEmailAddress = true;
  if (nextDraft.customerEmail && isValidEmailAddress(nextDraft.customerEmail)) {
    return {
      reply: `Shall I send it to ${nextDraft.customerEmail}? Reply with that address, or type a different email.`,
      draft: nextDraft,
      quickReplies: [nextDraft.customerEmail, "No thanks", "Yes, book"],
    };
  }

  return {
    reply: "What email address should I send the quote to?",
    draft: nextDraft,
    quickReplies: ["No thanks", "Yes, book"],
  };
}

async function handleBookingTurn(
  text: string,
  draft: QuoteDraft,
): Promise<AssistantResponse | null> {
  if (!draft.bookingStarted) return null;

  const lower = text.toLowerCase().trim();
  const nextDraft: QuoteDraft = { ...draft };
  const awaiting = nextBookingField(nextDraft);

  if (/change (the )?details|change (my )?trip|edit (the )?booking|wrong (date|time|name|mobile|email|flight|details)/.test(lower)) {
    const cleared = resetBookingFields(nextDraft);
    return continueBookingPrompt(
      cleared,
      "No problem — let’s re-enter the booking details. We’ll keep your quote.",
    );
  }

  if (/open terms|read terms|terms and conditions|\/terms/.test(lower)) {
    return {
      reply:
        "Our terms are at /terms/ on the website. When you’re ready, reply “I accept” to continue the booking here in chat.",
      draft: nextDraft,
      quickReplies: ["I accept"],
      inputMode: "text",
    };
  }

  if (/open privacy|read privacy|privacy policy|\/privacy/.test(lower)) {
    return {
      reply:
        "Our privacy policy is at /privacy/ on the website. When you’re ready, reply “I agree” to opt in to marketing emails and continue.",
      draft: nextDraft,
      quickReplies: awaiting === "marketingOptIn" ? ["I agree"] : ["I accept", "I agree"],
      inputMode: "text",
    };
  }

  if (awaiting === "tripDate" || awaiting === "returnDate") {
    if (/^choose date$/i.test(text.trim())) {
      return {
        reply: "Use the date picker below to choose your travel date, then tap Send.",
        draft: nextDraft,
        quickReplies: ["Choose date"],
        inputMode: "date",
      };
    }
    const date = extractDate(text);
    if (!date) {
      return {
        reply: "Please choose a date with the picker below, or type it as DD-MM-YYYY.",
        draft: nextDraft,
        quickReplies: ["Choose date"],
        inputMode: "date",
      };
    }
    if (awaiting === "tripDate") nextDraft.tripDate = date;
    else nextDraft.returnDate = date;
    const time = extractTime(text);
    if (time) {
      if (awaiting === "tripDate") nextDraft.tripTime = time;
      else nextDraft.returnTime = time;
    }
    return continueBookingPrompt(nextDraft, `Got it — ${formatUkDate(date)}.`);
  }

  if (awaiting === "tripTime" || awaiting === "returnTime") {
    if (/^choose time$/i.test(text.trim())) {
      return {
        reply: "Use the time picker below to choose your pickup time, then tap Send.",
        draft: nextDraft,
        quickReplies: ["Choose time"],
        inputMode: "time",
      };
    }
    const time = extractTime(text);
    if (!time) {
      return {
        reply: "Please choose a time with the picker below, or type it as HH:MM (24-hour).",
        draft: nextDraft,
        quickReplies: ["Choose time"],
        inputMode: "time",
      };
    }
    if (awaiting === "tripTime") {
      nextDraft.tripTime = time;
    } else {
      nextDraft.returnTime = time;
      if (
        nextDraft.tripDate &&
        nextDraft.tripTime &&
        nextDraft.returnDate &&
        !isReturnAfterOutbound(
          nextDraft.tripDate,
          nextDraft.tripTime,
          nextDraft.returnDate,
          time,
        )
      ) {
        delete nextDraft.returnTime;
        return {
          reply: "The return pickup needs to be after the outbound pickup. Please enter a later return time or date.",
          draft: nextDraft,
          quickReplies: ["Choose time"],
          inputMode: "time",
        };
      }
    }
    return continueBookingPrompt(nextDraft, `Pickup time set to ${time}.`);
  }

  if (awaiting === "customerName") {
    const name = extractPersonName(text) ?? (text.trim().length >= 2 && text.trim().length <= 60 ? text.trim() : undefined);
    if (!name || /\d/.test(name)) {
      return {
        reply: "Please type your full name (for example Jane Smith).",
        draft: nextDraft,
        quickReplies: [],
      };
    }
    nextDraft.customerName = name.replace(/\b\w/g, (c) => c.toUpperCase());
    return continueBookingPrompt(nextDraft, `Thanks, ${nextDraft.customerName}.`);
  }

  if (awaiting === "mobileNumber") {
    const mobile = extractMobile(text) ?? text.trim();
    if (!isValidMobileNumber(mobile)) {
      return {
        reply: "Please enter a valid UK mobile number (for example 07… or +44…).",
        draft: nextDraft,
        quickReplies: [],
      };
    }
    nextDraft.mobileNumber = mobile;
    return continueBookingPrompt(nextDraft, "Mobile saved.");
  }

  if (awaiting === "customerEmail") {
    const email = extractEmail(text) ?? text.trim();
    if (!isValidEmailAddress(email)) {
      return {
        reply: "Please enter a valid email address.",
        draft: nextDraft,
        quickReplies: [],
      };
    }
    nextDraft.customerEmail = email;
    return continueBookingPrompt(nextDraft, "Email saved.");
  }

  if (awaiting === "flightNumber" || awaiting === "returnFlightNumber") {
    const flight = extractFlightNumberToken(text);
    if (!flight) {
      return {
        reply: "Please enter the flight number (for example BA1234 or EI335).",
        draft: nextDraft,
        quickReplies: [],
      };
    }

    const isReturn = awaiting === "returnFlightNumber";
    const tripDate = isReturn ? nextDraft.returnDate! : nextDraft.tripDate!;
    const direction = isReturn
      ? nextDraft.direction === "from-airport"
        ? "to-airport"
        : "from-airport"
      : nextDraft.direction!;

    const verification = await verifyFlightForDraft(
      flight,
      tripDate,
      nextDraft.airportCode!,
      direction,
    );

    if (!verification.accept) {
      return {
        reply: verification.message,
        draft: nextDraft,
        quickReplies: [],
      };
    }

    if (isReturn) {
      nextDraft.returnFlightNumber = flight;
      nextDraft.returnFlightValidated = !verification.hardFail;
    } else {
      nextDraft.flightNumber = flight;
      nextDraft.flightValidated = !verification.hardFail;
    }

    return continueBookingPrompt(nextDraft, verification.message);
  }

  if (awaiting === "termsAccepted") {
    if (!acceptsTerms(text)) {
      return {
        reply: 'Please reply “I accept” to accept the terms and conditions and continue, or say “Open terms” to read them.',
        draft: nextDraft,
        quickReplies: ["I accept", "Open terms"],
      };
    }
    nextDraft.termsAccepted = true;
    return continueBookingPrompt(nextDraft, "Terms and conditions accepted.");
  }

  if (awaiting === "marketingOptIn") {
    if (!acceptsMarketing(text)) {
      return {
        reply:
          'To complete a booking in this chat, please reply “I agree” to receive occasional marketing emails (you can unsubscribe any time), or say “Open privacy” to read our privacy policy.',
        draft: nextDraft,
        quickReplies: ["I agree", "Open privacy"],
      };
    }
    nextDraft.marketingOptIn = true;
    return continueBookingPrompt(nextDraft, "Thanks — you’re opted in to marketing emails.");
  }

  if (awaiting === "confirmBooking") {
    if (/\bchange (the )?details\b/.test(lower)) {
      return {
        reply:
          "No problem — tell me what to change (date, time, name, mobile, email, or flight), or say “Another quote” to start over.",
        draft: nextDraft,
        quickReplies: ["Another quote", "Change details"],
      };
    }
    if (!confirmsBooking(text)) {
      return {
        reply: 'Reply “Confirm booking” to send your request, or “Change details” to edit something.',
        draft: nextDraft,
        quickReplies: ["Confirm booking", "Change details"],
      };
    }
    return {
      reply: "Sending your booking request now…",
      draft: nextDraft,
      submitBooking: true,
      quickReplies: [],
    };
  }

  return continueBookingPrompt(nextDraft);
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
  const requestQuote = isVehicleRequestQuote(vehicle);
  const guidePrice = showsOnlineGuidePrice(vehicle);
  const airportName =
    AIRPORTS.find((airport) => airport.code === draft.airportCode)?.name ?? draft.airportCode;
  const capacityNote = "";

  if (enquiryOnly && !guidePrice) {
    return {
      enquiryOnly: true,
      text:
        `This journey is enquiry only for ${airportName}. ` +
        `Would you like to book? I can take the date, time, and your details here in chat — then we’ll confirm availability and price. ` +
        `Or call ${SITE.landlineDisplay}.`,
    };
  }

  if (!arePublicLivePricesEnabled()) {
    return {
      enquiryOnly: true,
      text:
        `${getPublicUnapprovedPriceLabel()} for ${airportName}. ` +
        `I can take your trip details here and we’ll confirm the fare before any payment. ` +
        `Or call ${SITE.landlineDisplay}.${capacityNote}`,
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
    null,
    draft.direction === "from-airport",
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
  const waitingNote = resolveJourneyInclusions({
    isAirportTrip: true,
    isFromAirport: draft.direction === "from-airport",
    returnJourney: Boolean(draft.returnJourney),
    airportCode: draft.airportCode,
  }).summary;

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

  if (requestQuote) {
    return {
      enquiryOnly: true,
      quoteCard,
      text:
        `${vehicleNote} Guide price ${formatQuote(quote.amount)} for ${airportName}. ` +
        `This is not an instant confirmation. Would you like to request this quote (I can take date, time and your details here)?`,
    };
  }

  return {
    enquiryOnly: false,
    quoteCard,
    text: `${vehicleNote}\n\nWould you like this quote emailed to you?`,
  };
}

export function createWelcomeMessages(): AssistantMessage[] {
  return [
    {
      role: "bot",
      text:
        `Hi — I’m the ${SITE.name} assistant. I answer questions using the information on our website (airports, long-distance transfers, vehicles, terms, privacy, and more) and can price airport transfers using the same steps and pricing as the live quote tool.\n\n` +
        "Ask anything, or say “Get a quote” to start.",
    },
  ];
}

export function emptyQuoteDraft(): QuoteDraft {
  return {};
}

export async function respondToAssistantMessage(
  userText: string,
  draft: QuoteDraft,
  context: AssistantContext = {},
): Promise<AssistantResponse> {
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
        `You can also call ${SITE.landlineDisplay} or email ${SITE.email}, or say “Get a quote” to price a trip here.`,
      quickReplies: (response.quickReplies ?? ["Get a quote", "Save to contacts"]).filter(
        (item, index, all) => all.indexOf(item) === index,
      ),
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

  if (/another quote|new quote|start again|reset quote|different quote/.test(lower)) {
    return understood({
      reply: "No problem — let’s start again. Are you going to the airport or being collected from the airport?",
      draft: {},
      resetDraft: true,
      quickReplies: ["To the airport", "From the airport"],
    });
  }

  // Offer / send quote by email before booking starts.
  if (
    nextDraft.awaitingQuoteEmailDecision ||
    nextDraft.awaitingQuoteEmailAddress ||
    /^(yes,? email( quote)?|email (me )?(this )?quote|email it|send (me )?(the )?quote)\b/.test(
      lower,
    )
  ) {
    const emailReply = handleQuoteEmailTurn(text, nextDraft);
    if (emailReply) {
      return understood(emailReply);
    }
  }

  // In-chat booking collects date/time/contact/flights here (not the quote tool).
  if (nextDraft.bookingStarted) {
    const bookingReply = await handleBookingTurn(text, nextDraft);
    if (bookingReply) {
      return understood(bookingReply);
    }
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
      quickReplies: ["Another quote", "To the airport", "From the airport"],
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
      quickReplies: ["Get a quote", "Save to contacts"],
    });
  }

  if (
    /^(request to book|enquire to book|book now|book this|yes,? book|yes book|yes,? please|yes$|i('?| would )?like to book)\b/.test(
      lower,
    ) ||
    /^book\b/.test(lower)
  ) {
    const missingQuote = nextQuoteField(nextDraft);
    if (missingQuote) {
      const prompt = promptForField(missingQuote, nextDraft);
      return understood({
        reply: `Let’s finish the quote details first — then I’ll take the booking details here in chat.\n\n${prompt.reply}`,
        draft: nextDraft,
        quickReplies: prompt.quickReplies,
      });
    }

    const built = tryBuildQuote(nextDraft);
    nextDraft.bookingStarted = true;
    nextDraft.awaitingQuoteEmailDecision = false;
    nextDraft.awaitingQuoteEmailAddress = false;
    if (built?.quoteCard?.amountLabel) {
      nextDraft.quotedAmountLabel = built.quoteCard.amountLabel;
    }

    const bookingPrompt = await continueBookingPrompt(
      nextDraft,
      "Great — I’ll take the booking details here in chat (no need to open the quote tool). First, the travel date and time, then your contact details and flight number(s). I’ll check flight numbers are correct.",
    );
    return understood(bookingPrompt);
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
      reply: `You can call ${SITE.landlineDisplay} or email ${SITE.email}. Tap “Save to contacts” to open our contact card. For quotes and bookings, continue here in chat — it’s the fastest way.`,
      draft: nextDraft,
      quickReplies: ["Save to contacts", "Get a quote"],
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

  if (passengers !== undefined && !isValidPassengerCount(passengers)) {
    return {
      reply: PASSENGER_LIMIT_ERROR,
      draft: nextDraft,
      quickReplies: [
        "1 passenger",
        "2 passengers",
        "3 passengers",
        "4 passengers",
      ],
    };
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
  // Only treat as mid-quote when the *incoming* draft already has trip fields,
  // or the user clearly asked for a price / packed one-shot quote. Parsing an
  // airport name from an info question must not steal the turn into quote flow.
  const incomingQuoteInProgress = Boolean(
    draft.direction ||
      draft.airportCode ||
      draft.address ||
      draft.tripDate ||
      draft.passengers !== undefined ||
      draft.suitcases !== undefined ||
      draft.bookingStarted ||
      wantsQuote ||
      wantsOneShotQuote(lower),
  );
  const quoteInProgress = Boolean(
    nextDraft.direction ||
      nextDraft.airportCode ||
      nextDraft.address ||
      nextDraft.tripDate ||
      nextDraft.passengers !== undefined ||
      wantsQuote ||
      wantsOneShotQuote(lower),
  );

  // Knowledge answers for FAQ / “tell me about…” questions from the full site corpus.
  const clearlyQuestion =
    /^(what|when|where|who|how|do you|can you|is there|are there|tell me|explain|describe)\b/.test(
      lower,
    ) ||
    /\b(tell me about|information about|more about|what about|info on|details on|learn about)\b/.test(
      lower,
    ) ||
    /\?$/.test(text);
  if (clearlyQuestion && !wantsQuote && !incomingQuoteInProgress) {
    const knowledge = matchKnowledge(text);
    if (knowledge) {
      return understood({
        reply: knowledge,
        // Keep the prior draft — do not stick airport/direction from an info Q.
        draft: { ...draft },
        quickReplies: ["Get a quote", "Save to contacts"],
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
      if (built.quoteCard?.amountLabel) {
        nextDraft.quotedAmountLabel = built.quoteCard.amountLabel;
      }
      nextDraft.awaitingQuoteEmailDecision = !built.enquiryOnly;
      nextDraft.awaitingQuoteEmailAddress = false;
      return understood({
        reply: built.text,
        draft: nextDraft,
        quickReplies: built.enquiryOnly
          ? ["Yes, book", "Change details", "Another quote"]
          : ["Yes, email quote", "No thanks", "Yes, book", "Change details"],
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
      quickReplies: ["Get a quote", "Save to contacts"],
    });
  }

  return missed({
    reply:
      "I can answer questions from our website (booking, waiting time, vehicles, privacy, airports) and price transfers using the same quote-tool steps.\n\n" +
      "Try something like “BFS tomorrow 6am from 12 High Street, Bangor BT20, 2 people” or say “Get a quote”.",
    draft: nextDraft,
    quickReplies: ["Get a quote", "Save to contacts"],
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

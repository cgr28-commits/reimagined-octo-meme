/**
 * WhatsApp booking conversation — state machine + copy.
 * Pricing is never taken from the chat; fare always comes from quote-service.
 */

export const WHATSAPP_ONLINE_MAX_PASSENGERS = 4;

export const WHATSAPP_CONTROLS = {
  book: ["book", "book now", "pay", "pay now", "yes", "confirm"],
  change: ["change", "change details", "edit", "amend"],
  restart: ["start again", "restart", "reset", "start over"],
  handoff: [
    "speak to colin",
    "speak to a human",
    "human",
    "agent",
    "call me",
    "help",
    "operator",
  ],
} as const;

export type WhatsAppConversationStep =
  | "welcome"
  | "journey_type"
  | "airport"
  | "direction"
  | "pickup_address"
  | "destination_address"
  | "pickup_date"
  | "pickup_time"
  | "passengers"
  | "suitcases"
  | "child_seat"
  | "flight_number"
  | "customer_name"
  | "customer_email"
  | "quote_ready"
  | "awaiting_payment"
  | "confirmed"
  | "handoff";

export type WhatsAppAirportCode = "BFS" | "BHD" | "DUB";

export type WhatsAppBookingDraft = {
  returnJourney?: boolean;
  airportCode?: WhatsAppAirportCode;
  fromAirport?: boolean;
  pickupAddress?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress?: string;
  dropoffPlaceId?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  outboundDate?: string;
  outboundTime?: string;
  passengers?: number;
  suitcases?: number;
  childSeatRequired?: boolean;
  flightNumber?: string;
  customerName?: string;
  customerEmail?: string;
  /** Server-authoritative fare after quote-service run — never from the user. */
  quotedAmount?: number;
  quotedAmountLabel?: string;
  quoteFingerprint?: string;
  /** Vehicle chosen by the shared website engine (audit / booking record). */
  quotedVehicleType?: string;
};

export type WhatsAppSessionRecord = {
  waId: string;
  phoneE164: string;
  step: WhatsAppConversationStep;
  draft: WhatsAppBookingDraft;
  updatedAt: string;
  createdAt: string;
  /** Last inbound Meta message id (dedupe). */
  lastInboundMessageId?: string;
  /** SumUp / booking audit */
  checkoutId?: string;
  paymentUrl?: string;
  paymentReference?: string;
  bookingReference?: string;
  handoffReason?: string;
  processedMessageIds?: string[];
};

export type WhatsAppControl =
  | "book"
  | "change"
  | "restart"
  | "handoff"
  | null;

export function normaliseWhatsAppText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectWhatsAppControl(text: string): WhatsAppControl {
  const normalised = normaliseWhatsAppText(text);
  if (!normalised) return null;
  if (WHATSAPP_CONTROLS.handoff.some((c) => normalised === c || normalised.includes(c))) {
    return "handoff";
  }
  if (WHATSAPP_CONTROLS.restart.some((c) => normalised === c)) {
    return "restart";
  }
  if (WHATSAPP_CONTROLS.change.some((c) => normalised === c)) {
    return "change";
  }
  if (WHATSAPP_CONTROLS.book.some((c) => normalised === c)) {
    return "book";
  }
  return null;
}

export function parseJourneyType(text: string): boolean | null {
  const n = normaliseWhatsAppText(text);
  if (/\breturn\b/.test(n) || /\bround\s*trip\b/.test(n) || n === "2") return true;
  if (/\bone[\s-]*way\b/.test(n) || n === "1" || n === "oneway") return false;
  return null;
}

export function parseAirportCode(text: string): WhatsAppAirportCode | null {
  const n = normaliseWhatsAppText(text);
  if (/\bbelfast international\b/.test(n) || /\baldergrove\b/.test(n) || /\bbfs\b/.test(n) || n === "1") {
    return "BFS";
  }
  if (
    /\bbelfast city\b/.test(n) ||
    /\bgeorge best\b/.test(n) ||
    /\bbhd\b/.test(n) ||
    n === "2"
  ) {
    return "BHD";
  }
  if (/\bdublin\b/.test(n) || /\bdub\b/.test(n) || n === "3") {
    return "DUB";
  }
  return null;
}

export function parseDirectionFromAirport(text: string): boolean | null {
  const n = normaliseWhatsAppText(text);
  if (/\bfrom\s+airport\b/.test(n) || /\bpickup\s+at\s+airport\b/.test(n) || n === "1") {
    return true;
  }
  if (/\bto\s+airport\b/.test(n) || /\bdrop\s*off\s+at\s+airport\b/.test(n) || n === "2") {
    return false;
  }
  return null;
}

export function parseYesNo(text: string): boolean | null {
  const n = normaliseWhatsAppText(text);
  if (/^(y|yes|yeah|yep|true|1)\b/.test(n)) return true;
  if (/^(n|no|nope|false|0)\b/.test(n)) return false;
  return null;
}

export function parsePassengerCount(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function parseUkDate(text: string): string | null {
  const trimmed = text.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!uk) return null;
  const day = Number(uk[1]);
  const month = Number(uk[2]);
  let year = Number(uk[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2024) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseUkTime(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function emptyWhatsAppSession(waId: string, phoneE164: string): WhatsAppSessionRecord {
  const now = new Date().toISOString();
  return {
    waId,
    phoneE164,
    step: "welcome",
    draft: {},
    createdAt: now,
    updatedAt: now,
    processedMessageIds: [],
  };
}

export function promptForStep(step: WhatsAppConversationStep): string {
  switch (step) {
    case "welcome":
      return (
        "Welcome to My Airport Taxi NI WhatsApp booking.\n\n" +
        "I can give a fixed online quote for up to 4 passengers.\n\n" +
        "Reply with:\n• Book — start a quote\n• Speak to Colin — human help\n• Start again — reset"
      );
    case "journey_type":
      return "Is this a *one-way* or *return* journey?";
    case "airport":
      return (
        "Which airport?\n" +
        "1) Belfast International (BFS)\n" +
        "2) Belfast City (BHD)\n" +
        "3) Dublin Airport (DUB)"
      );
    case "direction":
      return "Are you travelling *from the airport* or *to the airport*?";
    case "pickup_address":
      return "What is the *pickup address*? Please include street, town and postcode if you can (e.g. BT postcode).";
    case "destination_address":
      return "What is the *destination address*? Include street, town and postcode if you can.";
    case "pickup_date":
      return "What is the *pickup date*? (YYYY-MM-DD or DD/MM/YYYY)";
    case "pickup_time":
      return "What is the *pickup time*? (e.g. 14:30 or 2:30pm)";
    case "passengers":
      return `How many *passengers*? (1–${WHATSAPP_ONLINE_MAX_PASSENGERS} for an online quote)`;
    case "suitcases":
      return "How many *large suitcases / bags*?";
    case "child_seat":
      return "Do you need a *child seat*? (yes / no)";
    case "flight_number":
      return "What is the *flight number*? (or reply skip if not needed yet)";
    case "customer_name":
      return "What is your *full name*?";
    case "customer_email":
      return "What *email address* should we send the booking confirmation to?";
    case "quote_ready":
      return (
        "Reply:\n• *Book* — pay securely\n• *Change details*\n• *Start again*\n• *Speak to Colin*"
      );
    case "awaiting_payment":
      return "When you have paid, we will confirm your booking automatically. Reply *Speak to Colin* if you need help.";
    case "confirmed":
      return "Your booking is confirmed. Reply *Start again* for another journey or *Speak to Colin* for help.";
    case "handoff":
      return (
        "I have passed this to Colin. He will continue on WhatsApp shortly.\n" +
        "You can also call 028 9602 2952."
      );
    default:
      return "How can I help? Reply *Book* or *Speak to Colin*.";
  }
}

export function formatQuoteSummary(draft: WhatsAppBookingDraft): string {
  const journey = draft.returnJourney ? "Return" : "One-way";
  const airport =
    draft.airportCode === "BFS"
      ? "Belfast International"
      : draft.airportCode === "BHD"
        ? "Belfast City"
        : draft.airportCode === "DUB"
          ? "Dublin Airport"
          : "Airport";
  const direction = draft.fromAirport ? `From ${airport}` : `To ${airport}`;
  const lines = [
    `*Your fixed quote: ${draft.quotedAmountLabel ?? ""}*`,
    "",
    `${journey} · ${direction}`,
    `Pickup: ${draft.pickupAddress ?? "—"}`,
    `Destination: ${draft.dropoffAddress ?? "—"}`,
    `When: ${draft.outboundDate ?? "—"} at ${draft.outboundTime ?? "—"}`,
    `Passengers: ${draft.passengers ?? "—"} · Bags: ${draft.suitcases ?? "—"}`,
    draft.childSeatRequired ? "Child seat: yes" : "Child seat: no",
    draft.flightNumber ? `Flight: ${draft.flightNumber}` : null,
    "",
    promptForStep("quote_ready"),
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export function nextStepAfterWelcome(): WhatsAppConversationStep {
  return "journey_type";
}

export function buildQuoteFingerprint(draft: WhatsAppBookingDraft): string {
  return [
    draft.returnJourney ? "R" : "O",
    draft.airportCode ?? "",
    draft.fromAirport ? "F" : "T",
    draft.pickupAddress ?? "",
    draft.dropoffAddress ?? "",
    draft.outboundDate ?? "",
    draft.outboundTime ?? "",
    String(draft.passengers ?? ""),
    String(draft.suitcases ?? ""),
  ].join("|");
}

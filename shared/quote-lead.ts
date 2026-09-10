import { formatUkDateTime, formatUkSubmissionTime } from "./uk-time";
import { QUOTE_SESSION_TTL_SECONDS } from "./quote-session";

export const QUOTE_LEAD_DEDUPE_TTL_SECONDS = QUOTE_SESSION_TTL_SECONDS;
export const NO_QUOTE_CONTACT_YET =
  "No customer contact details provided yet.";

export type QuoteLeadSource = "website" | "bot";
export type QuoteLeadKind = "quote" | "contact";

export type QuoteLeadDetails = {
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  /** Optional — quote tools can show a price before the customer picks a time. */
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  estimatedPrice: string;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
  /**
   * Client quote transaction id — one session across luggage / vehicle / access
   * recalculations. Used to upsert the daily quote record and to dedupe emails.
   */
  quoteTransactionId?: string;
  airportCode?: string;
  journeyFareGbp?: number;
  airportAccessOption?: string;
  airportAccessFeeGbp?: number;
  totalGbp?: number;
  source?: QuoteLeadSource;
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
};

export type QuoteLeadContact = {
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
};

function scheduleLabel(date?: string, time?: string): string {
  const d = date?.trim() ?? "";
  const t = time?.trim() ?? "";
  if (!d || !t) {
    return "Not set";
  }
  return formatUkDateTime(d, t);
}

export function quoteLeadSourceLabel(source?: QuoteLeadSource): string {
  return source === "bot" ? "Chat assistant" : "Website form";
}

export function isValidQuoteLeadEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidQuoteLeadPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  if (digits.startsWith("44")) {
    return digits.length >= 12;
  }
  if (digits.startsWith("0")) {
    return digits.length >= 10;
  }
  return digits.length >= 10;
}

export function sanitizeQuoteLeadPhone(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim().slice(0, 32);
  if (!isValidQuoteLeadPhone(trimmed)) {
    return "";
  }
  return trimmed.replace(/[^\d+\s()-]/g, "").replace(/\s+/g, " ").trim();
}

export function sanitizeQuoteLeadContact(input: {
  customerName?: unknown;
  customerEmail?: unknown;
  mobileNumber?: unknown;
}): QuoteLeadContact {
  const customerName =
    typeof input.customerName === "string" ? input.customerName.trim().slice(0, 120) : "";
  const emailRaw =
    typeof input.customerEmail === "string" ? input.customerEmail.trim().slice(0, 160) : "";
  const customerEmail = isValidQuoteLeadEmail(emailRaw) ? emailRaw : "";
  const mobileNumber = sanitizeQuoteLeadPhone(input.mobileNumber);
  return {
    ...(customerName ? { customerName } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(mobileNumber ? { mobileNumber } : {}),
  };
}

export function hasQuoteLeadContact(contact: QuoteLeadContact): boolean {
  return Boolean(contact.customerName || contact.customerEmail || contact.mobileNumber);
}

export function isCompleteFixedPriceQuote(details: Pick<
  QuoteLeadDetails,
  "tripLabel" | "pickupLabel" | "dropoffLabel" | "vehicle" | "estimatedPrice" | "passengers" | "suitcases"
>): boolean {
  const passengers = Number(details.passengers);
  const suitcases = Number(details.suitcases);
  return Boolean(
    details.tripLabel?.trim() &&
      details.pickupLabel?.trim() &&
      details.dropoffLabel?.trim() &&
      details.vehicle?.trim() &&
      details.estimatedPrice?.trim() &&
      Number.isFinite(passengers) &&
      passengers >= 1 &&
      Number.isFinite(suitcases) &&
      suitcases >= 0,
  );
}

export function buildQuoteLeadFingerprint(details: QuoteLeadDetails): string {
  const txn = details.quoteTransactionId?.trim();
  if (txn) {
    return `txn:${txn.toLowerCase()}`;
  }

  // Legacy fallback when no transaction id is available (e.g. older callers).
  return [
    details.tripLabel,
    details.pickupLabel,
    details.dropoffLabel,
    details.returnJourney ? "1" : "0",
    details.tripDate ?? "",
    details.tripTime ?? "",
    details.returnDate ?? "",
    details.returnTime ?? "",
    details.estimatedPrice,
    details.vehicle,
    String(details.passengers),
    String(details.suitcases),
  ]
    .join("|")
    .toLowerCase();
}

export function buildQuoteContactFingerprint(details: QuoteLeadDetails): string {
  const txn = details.quoteTransactionId?.trim();
  if (txn) {
    return `txn-contact:${txn.toLowerCase()}`;
  }
  return `contact:${buildQuoteLeadFingerprint(details)}`;
}

export function quoteLeadMarkerKey(fingerprint: string): string {
  return `quote_lead_fp:${fingerprint}`;
}

function routeLabel(details: Pick<QuoteLeadDetails, "pickupLabel" | "dropoffLabel">): string {
  const route = `${details.pickupLabel} → ${details.dropoffLabel}`;
  return route.length > 72 ? `${route.slice(0, 69)}…` : route;
}

export function buildQuoteLeadSubject(details: QuoteLeadDetails): string {
  return `Quote viewed — ${details.estimatedPrice} — ${routeLabel(details)}`;
}

export function buildQuoteContactSubject(details: QuoteLeadDetails): string {
  return `Contact details added to quote — ${details.estimatedPrice} — ${routeLabel(details)}`;
}

function buildQuoteTripLines(details: QuoteLeadDetails): string[] {
  const lines = [
    `Quote source: ${quoteLeadSourceLabel(details.source)}`,
    `Journey direction: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Destination: ${details.dropoffLabel}`,
    `One-way or return: ${details.returnJourney ? "Return" : "One-way"}`,
    `${details.returnJourney ? "Outbound date & time" : "Travel date & time"}: ${scheduleLabel(details.tripDate, details.tripTime)}`,
  ];

  if (details.returnJourney) {
    lines.push(`Return date & time: ${scheduleLabel(details.returnDate, details.returnTime)}`);
  }

  lines.push(
    `Passengers: ${details.passengers}`,
    `Luggage: ${details.suitcases} large suitcase${details.suitcases === 1 ? "" : "s"}`,
    `Vehicle: ${details.vehicle}`,
    `Quoted price: ${details.estimatedPrice}`,
    `Airport access: ${details.airportAccessOption?.trim() || "Not selected"}`,
  );

  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} · ${details.journeyDuration}`);
  }

  return lines;
}

export function buildQuoteLeadMessage(details: QuoteLeadDetails): string {
  return [
    "Someone generated a live fixed-price quote on the My Airport Taxi NI website.",
    "",
    "TRIP",
    "=".repeat(40),
    ...buildQuoteTripLines(details),
    "",
    NO_QUOTE_CONTACT_YET,
    "",
    `Quoted at: ${formatUkSubmissionTime()}`,
  ].join("\n");
}

export function buildQuoteContactMessage(details: QuoteLeadDetails): string {
  const contact = sanitizeQuoteLeadContact(details);
  const contactLines = [
    contact.customerName ? `Name: ${contact.customerName}` : "",
    contact.mobileNumber ? `Mobile: ${contact.mobileNumber}` : "",
    contact.customerEmail ? `Email: ${contact.customerEmail}` : "",
  ].filter(Boolean);

  return [
    "A customer added contact details to an existing website quote.",
    "",
    "TRIP",
    "=".repeat(40),
    ...buildQuoteTripLines(details),
    "",
    "CONTACT",
    "=".repeat(40),
    ...(contactLines.length > 0 ? contactLines : [NO_QUOTE_CONTACT_YET]),
    "",
    `Updated at: ${formatUkSubmissionTime()}`,
  ].join("\n");
}

export type QuoteLeadEmailDecision = {
  sendQuoteEmail: boolean;
  sendContactEmail: boolean;
  claimQuote: boolean;
  claimContact: boolean;
};

export function decideQuoteLeadEmails(input: {
  kind: QuoteLeadKind;
  completeQuote: boolean;
  quoteAlreadyClaimed: boolean;
  contactAlreadyClaimed: boolean;
  hasValidContact: boolean;
}): QuoteLeadEmailDecision {
  if (!input.completeQuote) {
    return {
      sendQuoteEmail: false,
      sendContactEmail: false,
      claimQuote: false,
      claimContact: false,
    };
  }

  if (input.kind === "quote") {
    if (input.quoteAlreadyClaimed) {
      return {
        sendQuoteEmail: false,
        sendContactEmail: false,
        claimQuote: false,
        claimContact: false,
      };
    }
    return {
      sendQuoteEmail: true,
      sendContactEmail: false,
      claimQuote: true,
      claimContact: false,
    };
  }

  const sendQuoteEmail = !input.quoteAlreadyClaimed;
  const sendContactEmail = input.hasValidContact && !input.contactAlreadyClaimed;
  return {
    sendQuoteEmail,
    sendContactEmail,
    claimQuote: sendQuoteEmail,
    claimContact: sendContactEmail,
  };
}

export type QuoteLeadMarkerStore = {
  peek(fingerprint: string): Promise<boolean>;
  claim(fingerprint: string): Promise<boolean>;
  release(fingerprint: string): Promise<void>;
};

export type QuoteLeadNotificationResult = {
  emailed: boolean;
  quoteEmailed: boolean;
  contactEmailed: boolean;
  quoteRetried: boolean;
};

export async function runQuoteLeadNotification(input: {
  details: QuoteLeadDetails;
  kind: QuoteLeadKind;
  skipEmail?: boolean;
  store: QuoteLeadMarkerStore;
  sendEmail: (subject: string, body: string) => Promise<boolean>;
}): Promise<QuoteLeadNotificationResult> {
  const empty: QuoteLeadNotificationResult = {
    emailed: false,
    quoteEmailed: false,
    contactEmailed: false,
    quoteRetried: false,
  };

  if (!isCompleteFixedPriceQuote(input.details) || input.skipEmail) {
    return empty;
  }

  const contact = sanitizeQuoteLeadContact(input.details);
  const quoteFingerprint = buildQuoteLeadFingerprint(input.details);
  const contactFingerprint = buildQuoteContactFingerprint(input.details);
  const quoteAlreadyClaimed = await input.store.peek(quoteFingerprint);
  const contactAlreadyClaimed = await input.store.peek(contactFingerprint);
  const decision = decideQuoteLeadEmails({
    kind: input.kind,
    completeQuote: true,
    quoteAlreadyClaimed,
    contactAlreadyClaimed,
    hasValidContact: hasQuoteLeadContact(contact),
  });

  const result = { ...empty };

  if (decision.claimQuote) {
    const claimed = await input.store.claim(quoteFingerprint);
    if (claimed) {
      const sent = await input.sendEmail(
        buildQuoteLeadSubject(input.details),
        buildQuoteLeadMessage(input.details),
      );
      if (!sent) {
        await input.store.release(quoteFingerprint);
      } else {
        result.quoteEmailed = true;
        result.quoteRetried = input.kind === "contact";
      }
    }
  }

  if (decision.claimContact) {
    const claimed = await input.store.claim(contactFingerprint);
    if (claimed) {
      const sent = await input.sendEmail(
        buildQuoteContactSubject({ ...input.details, ...contact }),
        buildQuoteContactMessage({ ...input.details, ...contact }),
      );
      if (!sent) {
        await input.store.release(contactFingerprint);
      } else {
        result.contactEmailed = true;
      }
    }
  }

  result.emailed = result.quoteEmailed || result.contactEmailed;
  return result;
}

/**
 * Deterministic WhatsApp/message → journey field extraction for Quick Quote.
 * Never invents a fare. Uncertain fields are flagged for owner review.
 * No paid AI dependency.
 */

import { todayLondonDate } from "./uk-time";

export type QuickQuoteAirportCode = "BFS" | "BHD" | "DUB";

export type ParsedQuickQuoteField<T> = {
  value: T | null;
  confidence: "high" | "low" | "missing";
  raw?: string;
};

export type QuickQuoteParseResult = {
  pickupAddress: ParsedQuickQuoteField<string>;
  dropoffAddress: ParsedQuickQuoteField<string>;
  airportCode: ParsedQuickQuoteField<QuickQuoteAirportCode>;
  fromAirport: ParsedQuickQuoteField<boolean>;
  returnJourney: ParsedQuickQuoteField<boolean>;
  outboundDate: ParsedQuickQuoteField<string>;
  outboundTime: ParsedQuickQuoteField<string>;
  returnDate: ParsedQuickQuoteField<string>;
  returnTime: ParsedQuickQuoteField<string>;
  passengers: ParsedQuickQuoteField<number>;
  suitcases: ParsedQuickQuoteField<number>;
  childSeatRequired: ParsedQuickQuoteField<boolean>;
  flightNumber: ParsedQuickQuoteField<string>;
  /** Departure/landing clock time mentioned as “flight is at …”, not the taxi pickup. */
  flightTime: ParsedQuickQuoteField<string>;
  /** Fields the owner must verify before quoting. */
  uncertainFields: string[];
  missingMandatoryForQuote: string[];
};

function field<T>(
  value: T | null,
  confidence: "high" | "low" | "missing",
  raw?: string,
): ParsedQuickQuoteField<T> {
  return { value, confidence, raw };
}

function missing<T>(raw?: string): ParsedQuickQuoteField<T> {
  return { value: null, confidence: "missing", raw };
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Add calendar days to a YYYY-MM-DD civil date (London date string). */
export function addCalendarDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function titleCaseAddress(value: string): string {
  return cleanExtractedText(value)
    .replace(/\b([a-z])/gi, (ch) => ch.toUpperCase())
    .replace(/\bBt(\d)/gi, "BT$1");
}

/** Remove WhatsApp markdown (*bold*, _italic_, ~strike~, ```) without changing meaning. */
export function stripWhatsAppMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/~([^~\n]+)~/g, "$1")
    // Orphan bold markers left on labelled lines (*Pickup Address: value)
    .replace(/(^|\n)\s*\*+\s*/g, "$1")
    .replace(/\*+\s*(?=\n|$)/g, "")
    .replace(/^\s*[>*]+\s?/gm, "")
    .replace(/\u00a0/g, " ");
}

/** Strip residual markdown / bullets from a single extracted field value. */
export function cleanExtractedText(value: string): string {
  return value
    .replace(/[\u00a0]/g, " ")
    .replace(/\*+/g, " ")
    .replace(/^[\s_\-~`>•]+/, "")
    .replace(/[\s_\-~`]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** If no year was given, bump to next year when the civil date is already past (London). */
function resolveNaturalYear(day: number, month: number, yearRaw: string | undefined, now: Date): number {
  if (yearRaw) return Number(yearRaw);
  const today = todayLondonDate(now);
  let year = Number(today.slice(0, 4));
  const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
  if (candidate < today) year += 1;
  return year;
}

/** Parse “29th August”, “29 August 2026”, “Aug 29”, plus ISO/UK numeric. */
export function parseNaturalDate(text: string, now = new Date()): string | null {
  const trimmed = text.trim();
  const numeric = parseUkDate(trimmed);
  if (numeric) return numeric;

  const ordinal = trimmed.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/i,
  );
  if (ordinal) {
    const day = Number(ordinal[1]);
    const month = MONTH_INDEX[ordinal[2].toLowerCase()];
    if (!month || day < 1 || day > 31) return null;
    const year = resolveNaturalYear(day, month, ordinal[3], now);
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const usStyle = trimmed.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i,
  );
  if (usStyle) {
    const month = MONTH_INDEX[usStyle[1].toLowerCase()];
    const day = Number(usStyle[2]);
    if (!month || day < 1 || day > 31) return null;
    const year = resolveNaturalYear(day, month, usStyle[3], now);
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

type LabelledFields = {
  pickupAddress?: string;
  dropoffAddress?: string;
  date?: string;
  time?: string;
  passengers?: number;
  suitcases?: number;
  flightNumber?: string;
  returnDate?: string;
  returnTime?: string;
};

function readLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:\\-–]\\s*(.+?)\\s*(?=\\n|$)`,
      "i",
    );
    const match = text.match(re);
    if (match?.[1]) {
      const value = cleanExtractedText(match[1]);
      if (value) return value;
    }
  }
  return null;
}

/** Structured WhatsApp / bot messages with labelled lines. */
export function extractLabelledFields(text: string, now = new Date()): LabelledFields {
  const pickup =
    readLabel(text, [
      "pickup\\s*address",
      "pick\\s*-?\\s*up\\s*address",
      "pickup",
      "pick\\s*-?\\s*up",
      "collection\\s*address",
      "from",
    ]) ?? undefined;
  const dropoff =
    readLabel(text, [
      "drop\\s*-?\\s*off\\s*address",
      "dropoff\\s*address",
      "destination\\s*address",
      "drop\\s*-?\\s*off",
      "dropoff",
      "destination",
      "to",
    ]) ?? undefined;
  const dateRaw =
    readLabel(text, ["date", "pickup\\s*date", "travel\\s*date", "outbound\\s*date"]) ?? null;
  const timeRaw =
    readLabel(text, ["time", "pickup\\s*time", "collection\\s*time", "outbound\\s*time"]) ?? null;
  const returnDateRaw =
    readLabel(text, ["return\\s*date"]) ?? null;
  const returnTimeRaw =
    readLabel(text, ["return\\s*time"]) ?? null;
  const paxRaw =
    readLabel(text, ["passengers?", "pax", "people", "persons?", "adults?"]) ?? null;
  const bagsRaw =
    readLabel(text, ["suitcases?", "bags?", "baggage", "luggage", "cases?"]) ?? null;
  const flightRaw =
    readLabel(text, ["flight\\s*number", "flight\\s*no\\.?", "flight"]) ?? null;

  const passengers = parseLeadingCount(paxRaw);
  const suitcases = parseLeadingCount(bagsRaw);
  const flightNumber = flightRaw ? normalizeFlightCode(flightRaw) : null;

  return {
    ...(pickup ? { pickupAddress: titleCaseAddress(pickup) } : {}),
    ...(dropoff ? { dropoffAddress: titleCaseAddress(dropoff) } : {}),
    ...(dateRaw && parseNaturalDate(dateRaw, now)
      ? { date: parseNaturalDate(dateRaw, now)! }
      : {}),
    ...(timeRaw && parseUkTime(timeRaw) ? { time: parseUkTime(timeRaw)! } : {}),
    ...(returnDateRaw && parseNaturalDate(returnDateRaw, now)
      ? { returnDate: parseNaturalDate(returnDateRaw, now)! }
      : {}),
    ...(returnTimeRaw && parseUkTime(returnTimeRaw)
      ? { returnTime: parseUkTime(returnTimeRaw)! }
      : {}),
    ...(passengers != null ? { passengers } : {}),
    ...(suitcases != null ? { suitcases } : {}),
    ...(flightNumber ? { flightNumber } : {}),
  };
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

/** Accept HH:MM, H:MM, HHMM, H.MM, optional am/pm. */
export function parseUkTime(text: string): string | null {
  const trimmed = text.trim().toLowerCase().replace(/\./g, ":");
  const compact = trimmed.match(/^(\d{3,4})\s*(am|pm)?$/);
  if (compact) {
    const digits = compact[1];
    const meridiem = compact[2];
    const hour = digits.length === 3 ? Number(digits.slice(0, 1)) : Number(digits.slice(0, 2));
    const minute = Number(digits.slice(-2));
    return finaliseTime(hour, minute, meridiem);
  }
  const match = trimmed.match(/^(\d{1,2})(?::)?(\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  return finaliseTime(Number(match[1]), Number(match[2] ?? "0"), match[3]);
}

function finaliseTime(hour: number, minute: number, meridiem?: string | null): string | null {
  let h = hour;
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23 || minute > 59) return null;
  return `${pad2(h)}:${pad2(minute)}`;
}

export function parseAirportCode(text: string): QuickQuoteAirportCode | null {
  const n = normalise(text);
  if (/\bbelfast international\b/.test(n) || /\baldergrove\b/.test(n) || /\bbfs\b/.test(n)) {
    return "BFS";
  }
  if (/\bbelfast city\b/.test(n) || /\bgeorge best\b/.test(n) || /\bbhd\b/.test(n)) {
    return "BHD";
  }
  if (/\bdublin(?:\s+airport)?\b/.test(n) || /\bdub\b/.test(n)) {
    return "DUB";
  }
  return null;
}

export function airportLabel(code: QuickQuoteAirportCode): string {
  if (code === "BFS") return "Belfast International Airport";
  if (code === "BHD") return "Belfast City Airport";
  return "Dublin Airport";
}

const AIRPORT_NAME_PATTERN =
  "(?:belfast\\s+international(?:\\s+airport)?|aldergrove(?:\\s+airport)?|belfast\\s+city(?:\\s+airport)?|george\\s+best(?:\\s+belfast\\s+city)?(?:\\s+airport)?|dublin(?:\\s+airport)?|(?:the\\s+)?airport)";

function extractAirport(text: string): {
  code: QuickQuoteAirportCode | null;
  confidence: "high" | "low" | "missing";
  raw?: string;
} {
  const n = normalise(text);
  const code = parseAirportCode(n);
  if (code) return { code, confidence: "high", raw: code };
  if (/\bairport\b/.test(n)) return { code: null, confidence: "low", raw: "airport" };
  return { code: null, confidence: "missing" };
}

/**
 * Default one-way when the customer does not mention a return.
 * Only mark return when return/round-trip language is present.
 */
function extractReturnJourney(text: string): ParsedQuickQuoteField<boolean> {
  const n = normalise(text);
  const tripType = readLabel(text, ["trip\\s*type", "journey\\s*type", "type"]);
  if (tripType) {
    const t = tripType.toLowerCase();
    if (/\bone[\s-]*way\b/.test(t) || /\bsingle\b/.test(t)) {
      return field(false, "high", "labelled-trip-type-one-way");
    }
    if (/\breturn\b/.test(t) || /\bround\s*trip\b/.test(t)) {
      return field(true, "high", "labelled-trip-type-return");
    }
  }
  if (/\breturn\b/.test(n) || /\bround\s*trip\b/.test(n) || /\bcoming\s+back\b/.test(n)) {
    return field(true, "high");
  }
  if (/\bone[\s-]*way\b/.test(n) || /\bsingle\b/.test(n)) {
    return field(false, "high");
  }
  // Sensible Quick Quote default — one journey mentioned ⇒ one-way.
  return field(false, "high", "default-one-way");
}

function extractFromAirport(
  text: string,
  airportCode: QuickQuoteAirportCode | null,
): ParsedQuickQuoteField<boolean> {
  const n = normalise(text);

  // "from 55 ormeau road to Belfast international airport"
  const fromAddrToAirport = new RegExp(
    `\\bfrom\\s+(?!${AIRPORT_NAME_PATTERN}\\b).{3,80}?\\s+to\\s+${AIRPORT_NAME_PATTERN}\\b`,
    "i",
  );
  if (fromAddrToAirport.test(n)) {
    return field(false, "high", "from-address-to-airport");
  }

  // "from Belfast international to …"
  const fromAirportToAddr = new RegExp(
    `\\bfrom\\s+${AIRPORT_NAME_PATTERN}\\b`,
    "i",
  );
  if (fromAirportToAddr.test(n) && !fromAddrToAirport.test(n)) {
    return field(true, "high", "from-airport");
  }

  if (
    /\bfrom\s+(the\s+)?airport\b/.test(n) ||
    /\bpick\s*up\s+(at|from)\s+(the\s+)?airport\b/.test(n) ||
    /\barriving\b/.test(n) ||
    /\blanding\b/.test(n)
  ) {
    return field(true, "high");
  }
  if (
    /\bto\s+(the\s+)?airport\b/.test(n) ||
    /\bto\s+belfast\s+international\b/.test(n) ||
    /\bto\s+belfast\s+city\b/.test(n) ||
    /\bto\s+dublin\b/.test(n) ||
    /\bdrop\s*off\s+(at\s+)?(the\s+)?airport\b/.test(n) ||
    /\bflying\s+out\b/.test(n) ||
    /\bdeparting\b/.test(n) ||
    /\bairport\s+transfer\b/.test(n)
  ) {
    // "airport transfer from X to airport" is to-airport when from-address matched above;
    // bare "airport transfer" alone is weak — only use with airport code.
    if (/\bairport\s+transfer\b/.test(n) && !/\bto\s+/.test(n) && !airportCode) {
      return missing<boolean>();
    }
    return field(false, "high");
  }
  if (airportCode) {
    return missing<boolean>();
  }
  return missing<boolean>();
}

/** Relative words: tomorrow / tomm / tom / tmrw / today (Europe/London). */
export function parseRelativeDateWord(
  text: string,
  now = new Date(),
): ParsedQuickQuoteField<string> {
  const n = normalise(text);
  const today = todayLondonDate(now);
  if (/\b(day\s+after\s+tomorrow|overmorrow)\b/.test(n)) {
    return field(addCalendarDays(today, 2), "high", "day after tomorrow");
  }
  if (/\b(tomorrow|tomm+|tomor+ow|tmrw|tmw|tom)\b/.test(n)) {
    const raw = n.match(/\b(tomorrow|tomm+|tomor+ow|tmrw|tmw|tom)\b/)?.[1] ?? "tomorrow";
    return field(addCalendarDays(today, 1), "high", raw);
  }
  if (/\b(today|tonight)\b/.test(n)) {
    return field(today, "high", "today");
  }
  return missing<string>();
}

function extractDates(
  text: string,
  now = new Date(),
): {
  outbound: ParsedQuickQuoteField<string>;
  returnDate: ParsedQuickQuoteField<string>;
} {
  const relative = parseRelativeDateWord(text, now);
  const matches = [
    ...text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/g),
  ];
  const parsed = matches
    .map((m) => ({ raw: m[1], value: parseUkDate(m[1]) }))
    .filter((x): x is { raw: string; value: string } => Boolean(x.value));

  // Natural language dates anywhere in the message (e.g. 29th August).
  const naturalMatches = [
    ...text.matchAll(
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)\b/gi,
    ),
  ]
    .map((m) => ({ raw: m[1], value: parseNaturalDate(m[1], now) }))
    .filter((x): x is { raw: string; value: string } => Boolean(x.value));

  if (relative.value) {
    return {
      outbound: relative,
      returnDate:
        parsed[0] || naturalMatches[0]
          ? field(
              (parsed[0] ?? naturalMatches[0]).value,
              "high",
              (parsed[0] ?? naturalMatches[0]).raw,
            )
          : missing<string>(),
    };
  }

  const outboundCandidate = parsed[0] ?? naturalMatches[0];
  const returnCandidate =
    parsed.length > 1 ? parsed[1] : naturalMatches.length > 1 ? naturalMatches[1] : null;

  if (!outboundCandidate) {
    return { outbound: missing<string>(), returnDate: missing<string>() };
  }
  return {
    outbound: field(outboundCandidate.value, "high", outboundCandidate.raw),
    returnDate: returnCandidate
      ? field(returnCandidate.value, "high", returnCandidate.raw)
      : missing<string>(),
  };
}

function extractFlightClockTime(text: string): ParsedQuickQuoteField<string> {
  const match = text.match(
    /\bflight\s*(?:is\s*)?(?:at|@|:)?\s*((?:[01]?\d|2[0-3])(?::|\.)?[0-5]\d|\d{3,4})\b/i,
  );
  if (!match?.[1]) return missing<string>();
  const value = parseUkTime(match[1]);
  if (!value) return missing<string>(match[1]);
  return field(value, "high", match[0]);
}

function extractPickupTime(text: string, flightTime: string | null): ParsedQuickQuoteField<string> {
  const n = text;
  // Prefer explicit pickup / at / for time near relative date.
  const preferred = [
    ...n.matchAll(
      /\b(?:pickup|pick\s*up|collect(?:ion)?|leave|leaving|depart(?:ure)?|at|@)\s+(?:sat|say|on)?\s*((?:[01]?\d|2[0-3])(?::|\.)?[0-5]\d|\d{3,4})(?:\s*[ap]m)?\b/gi,
    ),
  ];
  for (const match of preferred) {
    const value = parseUkTime(match[1]);
    if (!value || value === flightTime) continue;
    // Skip if this match is inside a "flight is at …" clause.
    const idx = match.index ?? 0;
    const window = n.slice(Math.max(0, idx - 24), idx).toLowerCase();
    if (/\bflight\b/.test(window)) continue;
    return field(value, "high", match[0]);
  }

  // Compact times not labelled as flight.
  const all = [...n.matchAll(/\b((?:[01]?\d|2[0-3])(?::|\.)?[0-5]\d|\d{3,4})\b/g)];
  const times: string[] = [];
  for (const match of all) {
    const value = parseUkTime(match[1]);
    if (!value || value === flightTime) continue;
    const idx = match.index ?? 0;
    const window = n.slice(Math.max(0, idx - 24), idx + match[0].length + 8).toLowerCase();
    if (/\bflight\b/.test(window)) continue;
    if (!times.includes(value)) times.push(value);
  }
  if (times.length === 0) return missing<string>();
  return field(times[0], "high", times[0]);
}

function extractReturnTimeOnly(
  text: string,
  outboundTime: string | null,
  flightTime: string | null,
  isReturn: boolean,
): ParsedQuickQuoteField<string> {
  if (!isReturn) return missing<string>();
  const all = [...text.matchAll(/\b((?:[01]?\d|2[0-3])(?::|\.)?[0-5]\d|\d{3,4})\b/g)];
  const times: string[] = [];
  for (const match of all) {
    const value = parseUkTime(match[1]);
    if (!value || value === outboundTime || value === flightTime) continue;
    times.push(value);
  }
  if (times.length === 0) return missing<string>();
  return field(times[0], "high", times[0]);
}

/** Leading integer from labelled values like "4", "4 people", "4x". */
function parseLeadingCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 0 && n <= 20 ? n : null;
}

function extractCount(text: string, patterns: RegExp[]): ParsedQuickQuoteField<number> {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 0 && n <= 20) {
      return field(n, "high", match[0]);
    }
  }
  return missing<number>();
}

/** String values for controlled Quick Quote form inputs (never leave null as blank silently). */
export function countFieldValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.trunc(value));
}

function extractYesNo(text: string, patterns: RegExp[]): ParsedQuickQuoteField<boolean> {
  const n = normalise(text);
  for (const pattern of patterns) {
    const match = n.match(pattern);
    if (!match) continue;
    if (/no\b/.test(match[0])) return field(false, "high", match[0]);
    return field(true, "high", match[0]);
  }
  return missing<boolean>();
}

/** NI / UK postcode fragments must never be treated as flight numbers (e.g. BT30). */
function isUkPostcodeFlightFalsePositive(code: string): boolean {
  const c = code.replace(/\s+/g, "").toUpperCase();
  if (/^BT\d/i.test(c)) return true; // all NI postcodes
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(c)) return true; // full postcode jammed
  return false;
}

function normalizeFlightCode(raw: string): string | null {
  const cleaned = cleanExtractedText(raw).replace(/\s+/g, "").toUpperCase();
  // BA1418 / FR123 / EI605 — or EasyJet-style U2801
  if (!/^(?:[A-Z]{2}\d{1,4}[A-Z]?|[A-Z]\d\d{1,4}[A-Z]?)$/.test(cleaned)) return null;
  if (cleaned.length < 3) return null;
  if (/^(MON|TUE|WED|THU|FRI|SAT|SUN)/.test(cleaned)) return null;
  if (isUkPostcodeFlightFalsePositive(cleaned)) return null;
  return cleaned;
}

function extractFlightNumber(text: string): ParsedQuickQuoteField<string> {
  // Prefer explicit labels only — never invent from address/postcode text.
  const labelled = [
    ...text.matchAll(
      /\bflight\s*(?:number|no\.?|#)?\s*[:\-–]\s*([A-Z]{1,2}\s?\d{1,4}[A-Z]?)\b/gi,
    ),
  ];
  for (const match of labelled) {
    const code = normalizeFlightCode(match[1] ?? "");
    if (code) return field(code, "high", match[0]);
  }

  // Unlabelled: only when a flight keyword is nearby (not bare BT30 in an address).
  for (const match of text.matchAll(/\b((?:[A-Z]{2}|[A-Z]\d)\s?\d{1,4}[A-Z]?)\b/gi)) {
    const code = normalizeFlightCode(match[1] ?? "");
    if (!code) continue;
    const idx = match.index ?? 0;
    const window = text.slice(Math.max(0, idx - 28), idx + match[0].length + 8).toLowerCase();
    if (!/\b(flight|fly(?:ing)?|airline|depart(?:ure|ing)?|landing|arrival)\b/.test(window)) {
      continue;
    }
    // Skip if this token sits inside a full UK postcode like BT30 6PA.
    const postcodeWindow = text.slice(Math.max(0, idx - 1), idx + match[0].length + 5);
    if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(postcodeWindow)) continue;
    return field(code, "high", match[0]);
  }

  return missing<string>();
}

function extractFromToAddresses(text: string): {
  pickup: string | null;
  dropoff: string | null;
  raw?: string;
} {
  const fromToAirport = text.match(
    new RegExp(
      `\\bfrom\\s+(.+?)\\s+to\\s+(${AIRPORT_NAME_PATTERN})\\b`,
      "i",
    ),
  );
  if (fromToAirport) {
    return {
      pickup: titleCaseAddress(fromToAirport[1]),
      dropoff: fromToAirport[2],
      raw: fromToAirport[0],
    };
  }

  const fromAirportTo = text.match(
    new RegExp(
      `\\bfrom\\s+(${AIRPORT_NAME_PATTERN})\\s+to\\s+(.+?)(?=\\s+(?:tomm+|tomorrow|tmrw|today|at|on|return|\\d{3,4}|\\d{1,2}:\\d{2})\\b|[.(]|$)`,
      "i",
    ),
  );
  if (fromAirportTo) {
    return {
      pickup: fromAirportTo[1],
      dropoff: titleCaseAddress(fromAirportTo[2]),
      raw: fromAirportTo[0],
    };
  }

  const generic = text.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:tomm+|tomorrow|tmrw|today|at|on|return|\d{3,4}|\d{1,2}:\d{2})\b|[.(]|$)/i,
  );
  if (generic) {
    return {
      pickup: titleCaseAddress(generic[1]),
      dropoff: titleCaseAddress(generic[2]),
      raw: generic[0],
    };
  }
  return { pickup: null, dropoff: null };
}

function extractAddresses(
  text: string,
  airportCode: QuickQuoteAirportCode | null,
  fromAirport: boolean | null,
): {
  pickup: ParsedQuickQuoteField<string>;
  dropoff: ParsedQuickQuoteField<string>;
} {
  const fromTo = extractFromToAddresses(text);
  const airport = airportCode ? airportLabel(airportCode) : null;

  if (fromTo.pickup || fromTo.dropoff) {
    let pickup = fromTo.pickup;
    let dropoff = fromTo.dropoff;
    if (airport && fromAirport === false) {
      dropoff = airport;
    }
    if (airport && fromAirport === true) {
      pickup = airport;
    }
    // Resolve airport-name dropoff/pickup via code when possible.
    if (dropoff && parseAirportCode(dropoff) && airport) dropoff = airport;
    if (pickup && parseAirportCode(pickup) && airport) pickup = airport;

    return {
      pickup: pickup ? field(pickup, "high", fromTo.raw) : missing<string>(),
      dropoff: dropoff ? field(dropoff, "high", fromTo.raw) : missing<string>(),
    };
  }

  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const addressLike = lines
    .map((line) => {
      const street = line.match(
        /\b(\d{1,4}\s+[A-Za-z][A-Za-z0-9'’\-]*(?:\s+[A-Za-z][A-Za-z0-9'’\-]*)*\s+(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|close|park|way|crescent|court|place))\b/i,
      );
      if (street) return titleCaseAddress(street[1]);
      return null;
    })
    .filter((v): v is string => Boolean(v));

  if (airport && fromAirport === true) {
    return {
      pickup: field(airport, "high"),
      dropoff: addressLike[0] ? field(addressLike[0], "high", addressLike[0]) : missing<string>(),
    };
  }
  if (airport && fromAirport === false) {
    return {
      pickup: addressLike[0] ? field(addressLike[0], "high", addressLike[0]) : missing<string>(),
      dropoff: field(airport, "high"),
    };
  }

  if (addressLike.length >= 2) {
    return {
      pickup: field(addressLike[0], "low", addressLike[0]),
      dropoff: field(addressLike[1], "low", addressLike[1]),
    };
  }
  if (addressLike.length === 1) {
    return {
      pickup: field(addressLike[0], "low", addressLike[0]),
      dropoff: missing<string>(),
    };
  }
  return { pickup: missing<string>(), dropoff: missing<string>() };
}

/**
 * Parse free-text customer WhatsApp message into editable journey fields.
 * Supports conversational copy and structured labelled lines (*Pickup Address:* …).
 * Flags uncertain/missing values — does not invent fares.
 */
export function parseQuickQuoteMessage(
  rawMessage: string,
  now = new Date(),
): QuickQuoteParseResult {
  const text = stripWhatsAppMarkdown(rawMessage).trim();
  const labelled = extractLabelledFields(text, now);

  const airport = extractAirport(
    [labelled.pickupAddress, labelled.dropoffAddress, text].filter(Boolean).join("\n"),
  );

  let fromAirport = extractFromAirport(text, airport.code);
  if (labelled.pickupAddress && parseAirportCode(labelled.pickupAddress)) {
    fromAirport = field(true, "high", "labelled-pickup-airport");
  } else if (labelled.dropoffAddress && parseAirportCode(labelled.dropoffAddress)) {
    fromAirport = field(false, "high", "labelled-dropoff-airport");
  }

  const returnJourney = extractReturnJourney(text);
  let dates = extractDates(text, now);
  if (labelled.date) {
    dates = {
      outbound: field(labelled.date, "high", "labelled-date"),
      returnDate: labelled.returnDate
        ? field(labelled.returnDate, "high", "labelled-return-date")
        : dates.returnDate,
    };
  } else if (labelled.returnDate) {
    dates = {
      ...dates,
      returnDate: field(labelled.returnDate, "high", "labelled-return-date"),
    };
  }

  const flightTime = extractFlightClockTime(text);
  let outboundTime = extractPickupTime(text, flightTime.value);
  if (labelled.time) {
    outboundTime = field(labelled.time, "high", "labelled-time");
  }

  let returnTime = extractReturnTimeOnly(
    text,
    outboundTime.value,
    flightTime.value,
    returnJourney.value === true,
  );
  if (labelled.returnTime) {
    returnTime = field(labelled.returnTime, "high", "labelled-return-time");
  }

  let passengers = extractCount(text, [
    /(\d{1,2})\s*(?:passengers?|pax|people|persons?|adults?)\b/i,
    /\b(?:passengers?|pax|people|persons?|adults?)\s*[:=]?\s*(\d{1,2})\b/i,
    /\bparty\s+of\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+of\s+us\b/i,
    /\bfor\s+(\d{1,2})(?:\s*(?:passengers?|people|persons?|pax))?\b/i,
  ]);
  if (typeof labelled.passengers === "number") {
    passengers = field(labelled.passengers, "high", "labelled-passengers");
  }

  let suitcases = extractCount(text, [
    /(\d{1,2})\s*(?:x\s*)?(?:cabin\s*)?(?:suitcases?|bags?|baggage|luggage|cases?)\b/i,
    /\b(?:suitcases?|bags?|baggage|luggage|cases?)\s*[:=]?\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*x\s*(?:bags?|suitcases?|cases?)\b/i,
  ]);
  if (typeof labelled.suitcases === "number") {
    suitcases = field(labelled.suitcases, "high", "labelled-suitcases");
  }

  const childSeat = extractYesNo(text, [
    /\b(no\s+)?child\s*seats?\b/,
    /\b(no\s+)?car\s*seats?\b/,
    /\b(with|need|needs)\s+a?\s*child\s*seat\b/,
  ]);
  let flightNumber = extractFlightNumber(text);
  if (labelled.flightNumber) {
    flightNumber = field(labelled.flightNumber, "high", "labelled-flight");
  }

  let addresses = extractAddresses(text, airport.code, fromAirport.value);
  if (labelled.pickupAddress || labelled.dropoffAddress) {
    const pickupValue =
      labelled.pickupAddress ??
      (fromAirport.value === true && airport.code ? airportLabel(airport.code) : addresses.pickup.value);
    let dropoffValue =
      labelled.dropoffAddress ??
      (fromAirport.value === false && airport.code
        ? airportLabel(airport.code)
        : addresses.dropoff.value);
    if (pickupValue && parseAirportCode(pickupValue) && airport.code) {
      // Normalise airport pickup label.
    }
    if (dropoffValue && parseAirportCode(dropoffValue) && airport.code) {
      dropoffValue = airportLabel(airport.code);
    }
    const pickupNorm =
      pickupValue && parseAirportCode(pickupValue) && airport.code
        ? airportLabel(airport.code)
        : pickupValue;
    addresses = {
      pickup: pickupNorm ? field(pickupNorm, "high", "labelled-pickup") : missing<string>(),
      dropoff: dropoffValue ? field(dropoffValue, "high", "labelled-dropoff") : missing<string>(),
    };
  }

  const airportCode = field(airport.code, airport.confidence, airport.raw);

  const uncertainFields: string[] = [];
  const pushUncertain = (name: string, f: ParsedQuickQuoteField<unknown>) => {
    if (f.confidence === "low") uncertainFields.push(name);
  };
  pushUncertain("pickupAddress", addresses.pickup);
  pushUncertain("dropoffAddress", addresses.dropoff);
  pushUncertain("airportCode", airportCode);
  pushUncertain("fromAirport", fromAirport);
  pushUncertain("outboundDate", dates.outbound);
  pushUncertain("outboundTime", outboundTime);
  pushUncertain("returnDate", dates.returnDate);
  pushUncertain("returnTime", returnTime);
  pushUncertain("passengers", passengers);
  pushUncertain("suitcases", suitcases);
  pushUncertain("flightNumber", flightNumber);
  pushUncertain("flightTime", flightTime);

  if (returnJourney.value === true) {
    if (dates.returnDate.confidence === "missing") uncertainFields.push("returnDate");
    if (returnTime.confidence === "missing") uncertainFields.push("returnTime");
  }

  const missingMandatoryForQuote: string[] = [];
  if (!addresses.pickup.value) missingMandatoryForQuote.push("pickupAddress");
  if (!addresses.dropoff.value && !airport.code) missingMandatoryForQuote.push("dropoffAddress");
  if (!dates.outbound.value) missingMandatoryForQuote.push("outboundDate");
  if (!outboundTime.value) missingMandatoryForQuote.push("outboundTime");
  if (passengers.value == null) missingMandatoryForQuote.push("passengers");
  if (suitcases.value == null) missingMandatoryForQuote.push("suitcases");
  if (returnJourney.value === true) {
    if (!dates.returnDate.value) missingMandatoryForQuote.push("returnDate");
    if (!returnTime.value) missingMandatoryForQuote.push("returnTime");
  }

  const cleanAddr = (f: ParsedQuickQuoteField<string>): ParsedQuickQuoteField<string> => {
    if (f.value == null) return f;
    const cleaned = cleanExtractedText(f.value);
    if (!cleaned) return missing<string>(f.raw);
    if (cleaned === f.value) return f;
    return field(cleaned, f.confidence, f.raw);
  };

  return {
    pickupAddress: cleanAddr(addresses.pickup),
    dropoffAddress: cleanAddr(addresses.dropoff),
    airportCode,
    fromAirport,
    returnJourney,
    outboundDate: dates.outbound,
    outboundTime,
    returnDate: dates.returnDate,
    returnTime,
    passengers,
    suitcases,
    childSeatRequired: childSeat,
    flightNumber,
    flightTime,
    uncertainFields: [...new Set(uncertainFields)],
    missingMandatoryForQuote: [...new Set(missingMandatoryForQuote)],
  };
}

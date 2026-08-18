/**
 * Deterministic WhatsApp/message → journey field extraction for Quick Quote.
 * Never invents a fare. Uncertain fields are flagged for owner review.
 * No paid AI dependency.
 */

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

export function parseAirportCode(text: string): QuickQuoteAirportCode | null {
  const n = normalise(text);
  if (/\bbelfast international\b/.test(n) || /\baldergrove\b/.test(n) || /\bbfs\b/.test(n)) {
    return "BFS";
  }
  if (/\bbelfast city\b/.test(n) || /\bgeorge best\b/.test(n) || /\bbhd\b/.test(n)) {
    return "BHD";
  }
  if (/\bdublin\b/.test(n) || /\bdub\b/.test(n)) {
    return "DUB";
  }
  return null;
}

export function airportLabel(code: QuickQuoteAirportCode): string {
  if (code === "BFS") return "Belfast International Airport";
  if (code === "BHD") return "Belfast City Airport";
  return "Dublin Airport";
}

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

function extractReturnJourney(text: string): ParsedQuickQuoteField<boolean> {
  const n = normalise(text);
  if (/\breturn\b/.test(n) || /\bround\s*trip\b/.test(n) || /\bcoming\s+back\b/.test(n)) {
    return field(true, "high");
  }
  if (/\bone[\s-]*way\b/.test(n) || /\bsingle\b/.test(n)) {
    return field(false, "high");
  }
  return missing<boolean>();
}

function extractFromAirport(text: string, airportCode: QuickQuoteAirportCode | null): ParsedQuickQuoteField<boolean> {
  const n = normalise(text);
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
    /\bdrop\s*off\s+(at\s+)?(the\s+)?airport\b/.test(n) ||
    /\bflying\s+out\b/.test(n) ||
    /\bdeparting\b/.test(n)
  ) {
    return field(false, "high");
  }
  if (airportCode) {
    // Presence of airport alone is not enough to decide direction.
    return missing<boolean>();
  }
  return missing<boolean>();
}

function extractDates(text: string): {
  outbound: ParsedQuickQuoteField<string>;
  returnDate: ParsedQuickQuoteField<string>;
} {
  const matches = [
    ...text.matchAll(
      /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/g,
    ),
  ];
  const parsed = matches
    .map((m) => ({ raw: m[1], value: parseUkDate(m[1]) }))
    .filter((x) => x.value);

  if (parsed.length === 0) {
    return {
      outbound: missing<string>(),
      returnDate: missing<string>(),
    };
  }
  if (parsed.length === 1) {
    return {
      outbound: field(parsed[0].value, "high", parsed[0].raw),
      returnDate: missing<string>(),
    };
  }
  return {
    outbound: field(parsed[0].value, "high", parsed[0].raw),
    returnDate: field(parsed[1].value, "high", parsed[1].raw),
  };
}

function extractTimes(text: string): {
  outbound: ParsedQuickQuoteField<string>;
  returnTime: ParsedQuickQuoteField<string>;
} {
  const matches = [
    ...text.matchAll(/\b((?:[01]?\d|2[0-3])(?::|\.)?[0-5]\d(?:\s*[ap]m)?|\d{1,2}\s*[ap]m)\b/gi),
  ];
  const parsed = matches
    .map((m) => ({ raw: m[1], value: parseUkTime(m[1]) }))
    .filter((x) => x.value);

  if (parsed.length === 0) {
    return {
      outbound: missing<string>(),
      returnTime: missing<string>(),
    };
  }
  if (parsed.length === 1) {
    return {
      outbound: field(parsed[0].value, "high", parsed[0].raw),
      returnTime: missing<string>(),
    };
  }
  return {
    outbound: field(parsed[0].value, "high", parsed[0].raw),
    returnTime: field(parsed[1].value, "high", parsed[1].raw),
  };
}

function extractCount(
  text: string,
  patterns: RegExp[],
): ParsedQuickQuoteField<number> {
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

function extractFlightNumber(text: string): ParsedQuickQuoteField<string> {
  const match = text.match(/\b([A-Z]{1,3}\s?\d{1,4})\b/i);
  if (!match?.[1]) return missing<string>();
  // Avoid matching dates like 18/08 or times.
  if (/^\d/.test(match[1])) return missing<string>();
  const code = match[1].replace(/\s+/g, "").toUpperCase();
  if (code.length < 3) return field<string>(null, "low", match[1]);
  return field(code, "high", match[1]);
}

function extractAddresses(
  text: string,
  airportCode: QuickQuoteAirportCode | null,
  fromAirport: boolean | null,
): {
  pickup: ParsedQuickQuoteField<string>;
  dropoff: ParsedQuickQuoteField<string>;
} {
  const lines = text
    .split(/\n|,(?=\s*[A-Za-z])/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const addressLike = lines.filter((line) => {
    const n = normalise(line);
    if (parseAirportCode(n)) return false;
    if (/^(hi|hello|thanks|please|can you|looking for|need)\b/.test(n)) return false;
    return (
      /\bbt\d/i.test(line) ||
      /\bstreet\b|\broad\b|\bavenue\b|\bdrive\b|\blane\b|\bclose\b|\bpark\b|\bhotel\b|\bhouse\b/i.test(
        line,
      ) ||
      /\d+\s+[A-Za-z]/.test(line)
    );
  });

  const airport = airportCode ? airportLabel(airportCode) : null;

  if (airport && fromAirport === true) {
    return {
      pickup: field(airport, "high"),
      dropoff:
        addressLike[0]
          ? field(addressLike[0], addressLike.length === 1 ? "high" : "low", addressLike[0])
          : missing<string>(),
    };
  }
  if (airport && fromAirport === false) {
    return {
      pickup:
        addressLike[0]
          ? field(addressLike[0], addressLike.length === 1 ? "high" : "low", addressLike[0])
          : missing<string>(),
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
  return {
    pickup: missing<string>(),
    dropoff: missing<string>(),
  };
}

/**
 * Parse free-text customer WhatsApp message into editable journey fields.
 * Flags uncertain/missing values — does not invent fares or silent defaults for key fields.
 */
export function parseQuickQuoteMessage(rawMessage: string): QuickQuoteParseResult {
  const text = rawMessage.trim();
  const airport = extractAirport(text);
  const returnJourney = extractReturnJourney(text);
  const fromAirport = extractFromAirport(text, airport.code);
  const dates = extractDates(text);
  const times = extractTimes(text);
  const passengers = extractCount(text, [
    /(\d{1,2})\s*(?:passengers?|pax|people|adults?)\b/i,
    /\b(?:passengers?|pax|people|adults?)\s*[:=]?\s*(\d{1,2})\b/i,
  ]);
  const suitcases = extractCount(text, [
    /(\d{1,2})\s*(?:suitcases?|bags?|luggage|cases?)\b/i,
    /\b(?:suitcases?|bags?|luggage|cases?)\s*[:=]?\s*(\d{1,2})\b/i,
  ]);
  const childSeat = extractYesNo(text, [
    /\b(no\s+)?child\s*seats?\b/,
    /\b(no\s+)?car\s*seats?\b/,
    /\b(with|need|needs)\s+a?\s*child\s*seat\b/,
  ]);
  const flightNumber = extractFlightNumber(text);
  const addresses = extractAddresses(text, airport.code, fromAirport.value);

  const airportCode = field(airport.code, airport.confidence, airport.raw);

  const uncertainFields: string[] = [];
  const pushUncertain = (name: string, f: ParsedQuickQuoteField<unknown>) => {
    if (f.confidence === "low") uncertainFields.push(name);
  };
  pushUncertain("pickupAddress", addresses.pickup);
  pushUncertain("dropoffAddress", addresses.dropoff);
  pushUncertain("airportCode", airportCode);
  pushUncertain("fromAirport", fromAirport);
  pushUncertain("returnJourney", returnJourney);
  pushUncertain("outboundDate", dates.outbound);
  pushUncertain("outboundTime", times.outbound);
  pushUncertain("returnDate", dates.returnDate);
  pushUncertain("returnTime", times.returnTime);
  pushUncertain("passengers", passengers);
  pushUncertain("suitcases", suitcases);
  pushUncertain("flightNumber", flightNumber);

  if (returnJourney.value === true) {
    if (dates.returnDate.confidence === "missing") uncertainFields.push("returnDate");
    if (times.returnTime.confidence === "missing") uncertainFields.push("returnTime");
  }

  const missingMandatoryForQuote: string[] = [];
  if (!addresses.pickup.value) missingMandatoryForQuote.push("pickupAddress");
  if (!addresses.dropoff.value && !airport.code) missingMandatoryForQuote.push("dropoffAddress");
  if (!dates.outbound.value) missingMandatoryForQuote.push("outboundDate");
  if (!times.outbound.value) missingMandatoryForQuote.push("outboundTime");
  if (passengers.value == null) missingMandatoryForQuote.push("passengers");
  if (suitcases.value == null) missingMandatoryForQuote.push("suitcases");
  if (returnJourney.value === true) {
    if (!dates.returnDate.value) missingMandatoryForQuote.push("returnDate");
    if (!times.returnTime.value) missingMandatoryForQuote.push("returnTime");
  }

  return {
    pickupAddress: addresses.pickup,
    dropoffAddress: addresses.dropoff,
    airportCode,
    fromAirport,
    returnJourney,
    outboundDate: dates.outbound,
    outboundTime: times.outbound,
    returnDate: dates.returnDate,
    returnTime: times.returnTime,
    passengers,
    suitcases,
    childSeatRequired: childSeat,
    flightNumber,
    uncertainFields: [...new Set(uncertainFields)],
    missingMandatoryForQuote: [...new Set(missingMandatoryForQuote)],
  };
}

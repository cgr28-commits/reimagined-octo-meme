/**
 * Phone assistant (fonio "API Request" tool) → journey details for the website pricing engine.
 *
 * The voice assistant collects the journey in conversation and sends the fields here. Prices
 * always come from the same engine as the website and WhatsApp quotes — never from the model.
 * Spoken replies are short, company voice (“we”), never invent fares or surcharges, and ask
 * only one clarifying question at a time.
 */
import { parseAirportCode, parseQuickQuoteMessage } from "./quick-quote-parse";
import { todayLondonDate } from "./uk-time";
import { extractClockTimes, type WhatsAppQuoteDraft } from "./whatsapp-quote-bot";

export type VoiceQuoteInput = {
  pickup?: unknown;
  dropoff?: unknown;
  /** Google Place ID from /voice/address-search (preferred over free-text geocode). */
  pickupPlaceId?: unknown;
  dropoffPlaceId?: unknown;
  date?: unknown;
  time?: unknown;
  passengers?: unknown;
  suitcases?: unknown;
  returnJourney?: unknown;
  returnDate?: unknown;
  returnTime?: unknown;
  flightNumber?: unknown;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

function count(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n) : undefined;
}

function yes(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return /^(y|yes|true|return|1)$/i.test(String(value ?? "").trim());
}

/** "2026-11-14", "14/11/2026", "14 November", "Friday", "tomorrow" → YYYY-MM-DD (London). */
export function voiceDate(value: unknown, now = new Date()): string | undefined {
  const raw = text(value, 60);
  if (!raw) return undefined;
  if (ISO_DATE.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const iso = `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? undefined : iso;
  }
  const lower = raw.toLowerCase();
  const today = todayLondonDate(now);
  const plusDays = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (/\btoday\b|\btonight\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return plusDays(1);
  return parseQuickQuoteMessage(`on ${raw}`, now).outboundDate.value ?? undefined;
}

/** "17:30", "5.30pm", "half five in the morning" (best effort) → HH:MM. */
export function voiceTime(value: unknown, now = new Date()): string | undefined {
  const raw = text(value, 40).toLowerCase().replace(/\s+/g, " ");
  if (!raw) return undefined;
  const clock = raw.match(CLOCK);
  if (clock) return `${clock[1].padStart(2, "0")}:${clock[2]}`;
  const written = extractClockTimes(raw)[0];
  if (written) return written;
  return parseQuickQuoteMessage(`pickup at ${raw}`, now).outboundTime.value ?? undefined;
}

/** One spoken question per missing field — keeps phone turns short. */
export const VOICE_QUOTE_QUESTIONS: Record<string, string> = {
  pickup: "Where would you like us to pick you up from?",
  dropoff: "And where's the destination?",
  date: "What date do you need the car?",
  time: "What time would you like the pickup?",
  passengers: "How many passengers will there be?",
  returnDate: "What date is the return journey?",
  returnTime: "And what time for the return pickup?",
  suitcases: "How many suitcases are you bringing?",
};

const FIELD_LABEL: Record<string, string> = {
  pickup: "the pickup address",
  dropoff: "the destination",
  date: "the date",
  time: "the pickup time",
  passengers: "how many passengers",
  returnDate: "the return date",
  returnTime: "the return pickup time",
  suitcases: "how many suitcases",
};

export type VoiceDraftResult =
  | { ok: true; draft: WhatsAppQuoteDraft }
  | { ok: false; missing: string[]; askNext?: string; say: string };

function askNextMissing(fields: string[]): VoiceDraftResult {
  const askNext = fields[0]!;
  return {
    ok: false,
    missing: fields.map((f) => FIELD_LABEL[f] ?? f),
    askNext,
    say: VOICE_QUOTE_QUESTIONS[askNext] ?? `Could I just check ${FIELD_LABEL[askNext] ?? askNext}?`,
  };
}

/** Build and check the journey. Missing or unclear details come back as one short question. */
export function voiceQuoteDraft(input: VoiceQuoteInput, now = new Date()): VoiceDraftResult {
  const pickup = text(input.pickup);
  const dropoff = text(input.dropoff);
  const returnJourney = yes(input.returnJourney);
  const outboundDate = voiceDate(input.date, now);
  const outboundTime = voiceTime(input.time, now);
  const returnDate = returnJourney ? voiceDate(input.returnDate, now) : undefined;
  const returnTime = returnJourney ? voiceTime(input.returnTime, now) : undefined;
  const passengers = count(input.passengers);
  const suitcasesRaw = input.suitcases;
  const suitcasesProvided = suitcasesRaw != null && String(suitcasesRaw).trim() !== "";
  const suitcases = suitcasesProvided ? count(suitcasesRaw) : undefined;

  const missingFields: string[] = [];
  if (!pickup) missingFields.push("pickup");
  if (!dropoff) missingFields.push("dropoff");
  if (!outboundDate) missingFields.push("date");
  if (!outboundTime) missingFields.push("time");
  if (passengers == null || passengers < 1) missingFields.push("passengers");
  if (!suitcasesProvided) missingFields.push("suitcases");
  if (returnJourney && !returnDate) missingFields.push("returnDate");
  if (returnJourney && !returnTime) missingFields.push("returnTime");
  if (missingFields.length) return askNextMissing(missingFields);

  const today = todayLondonDate(now);
  if (outboundDate! < today) {
    return { ok: false, missing: ["the date"], askNext: "date", say: "That date looks like it's already passed. What date do you need the car?" };
  }
  if (returnJourney && returnDate! < outboundDate!) {
    return {
      ok: false,
      missing: ["the return date"],
      askNext: "returnDate",
      say: "The return looks earlier than the outward trip. What date is the return?",
    };
  }
  if ((suitcases ?? 0) > 4) {
    return {
      ok: false,
      missing: [],
      say: "With more than four suitcases we arrange a larger vehicle, so the team will confirm that price for you. Can I take your name and mobile number?",
    };
  }
  if (passengers! > 4) {
    return {
      ok: false,
      missing: [],
      say: "For more than four passengers we arrange a larger vehicle, so the team will confirm that price for you. Can I take your name and mobile number?",
    };
  }

  const pickupAirport = parseAirportCode(pickup);
  const dropoffAirport = parseAirportCode(dropoff);
  if (pickupAirport && pickupAirport === dropoffAirport) {
    return {
      ok: false,
      missing: ["the destination"],
      askNext: "dropoff",
      say: "Both places sound like the same airport. Where are you travelling to or from?",
    };
  }
  const airportCode = pickupAirport ?? dropoffAirport ?? null;
  const flightNumber = text(input.flightNumber, 12).toUpperCase().replace(/\s+/g, "");

  return {
    ok: true,
    draft: {
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      airportCode,
      fromAirport: Boolean(pickupAirport),
      returnJourney,
      outboundDate,
      outboundTime,
      ...(returnJourney ? { returnDate, returnTime } : {}),
      passengers,
      suitcases: suitcases ?? 0,
      ...(flightNumber ? { flightNumber } : {}),
    },
  };
}

/** Speakable price: "£65" → "65 pounds", "£64.50" → "64 pounds 50". */
export function spokenGbp(amount: number): string {
  const pounds = Math.floor(amount);
  const pence = Math.round((amount - pounds) * 100);
  return pence ? `${pounds} pounds ${pence}` : `${pounds} pounds`;
}

/** Which car the price is for, in caller terms (Estate when the luggage needs the bigger boot). */
export function voiceVehicleSentence(vehicleLabel: string | undefined, suitcases: number): string {
  const label = String(vehicleLabel ?? "");
  if (/business|executive/i.test(label)) return "That's for our Business Class car.";
  if (/estate/i.test(label)) {
    return suitcases >= 3
      ? `With ${suitcases} suitcases that's for an Estate car, so there's room for the extra luggage.`
      : "That's for an Estate car, with extra room for luggage.";
  }
  if (/minibus|7.?seat/i.test(label)) return "That's for our 7-seater.";
  return "That's for a Saloon car, which takes up to 2 suitcases and 2 small bags.";
}

export function voiceQuoteSay(input: {
  amount: number;
  draft: WhatsAppQuoteDraft;
  /** Vehicle the price is for, from the pricing engine. */
  vehicle?: string;
  requestOnly: boolean;
  shortNotice: boolean;
}): string {
  const { draft } = input;
  const trip = draft.returnJourney ? "for the return journey" : "one way";
  const waiting =
    draft.airportCode && draft.fromAirport && !draft.returnJourney
      ? "We track your flight and up to 60 minutes' waiting is included."
      : draft.airportCode && draft.returnJourney
        ? "Airport pickups include up to 60 minutes' waiting, and address pickups 10 minutes."
        : "That includes 10 minutes' free waiting at pickup.";
  const parts = [
    `The fixed price is ${spokenGbp(input.amount)} ${trip}, and that's everything included.`,
    voiceVehicleSentence(input.vehicle, draft.suitcases ?? 0),
    waiting,
  ];
  if (input.requestOnly) {
    parts.push("For that date and time we need to confirm we can do it before you pay, so the team will confirm with you.");
  } else if (input.shortNotice) {
    parts.push("Because it's less than 24 hours away, that price is held for 2 hours.");
  } else {
    parts.push(
      "That's a quotation until you pay on the secure link — shall I send the booking link by text, WhatsApp, or email?",
    );
  }
  return parts.join(" ");
}

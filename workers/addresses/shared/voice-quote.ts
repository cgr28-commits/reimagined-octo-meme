/**
 * Phone assistant (fonio "API Request" tool) → journey details for the website pricing engine.
 *
 * The voice assistant collects the journey in conversation and sends the fields here. Prices
 * always come from the same engine as the website and WhatsApp quotes — never from the model.
 * Spoken replies are short, never mention surcharges or how the price is made up, and only
 * mention the waiting time that applies to the caller's pickup.
 */
import { parseAirportCode, parseQuickQuoteMessage } from "./quick-quote-parse";
import { todayLondonDate } from "./uk-time";
import { extractClockTimes, type WhatsAppQuoteDraft } from "./whatsapp-quote-bot";

export type VoiceQuoteInput = {
  pickup?: unknown;
  dropoff?: unknown;
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

export type VoiceDraftResult =
  | { ok: true; draft: WhatsAppQuoteDraft }
  | { ok: false; missing: string[]; say: string };

/** Build and check the journey. Missing or unclear details come back as a short question. */
export function voiceQuoteDraft(input: VoiceQuoteInput, now = new Date()): VoiceDraftResult {
  const pickup = text(input.pickup);
  const dropoff = text(input.dropoff);
  const returnJourney = yes(input.returnJourney);
  const outboundDate = voiceDate(input.date, now);
  const outboundTime = voiceTime(input.time, now);
  const returnDate = returnJourney ? voiceDate(input.returnDate, now) : undefined;
  const returnTime = returnJourney ? voiceTime(input.returnTime, now) : undefined;
  const passengers = count(input.passengers);
  const suitcases = count(input.suitcases) ?? 0;

  const missing: string[] = [];
  if (!pickup) missing.push("the pickup address");
  if (!dropoff) missing.push("the destination");
  if (!outboundDate) missing.push("the date");
  if (!outboundTime) missing.push("the pickup time");
  if (passengers == null || passengers < 1) missing.push("how many passengers");
  if (returnJourney && !returnDate) missing.push("the return date");
  if (returnJourney && !returnTime) missing.push("the return pickup time");
  if (missing.length) {
    return { ok: false, missing, say: `I just need ${missing.join(", ")} to get the price.` };
  }

  const today = todayLondonDate(now);
  if (outboundDate! < today) {
    return { ok: false, missing: ["date"], say: "That date looks like it's already passed. What date do you need the car?" };
  }
  if (returnJourney && returnDate! < outboundDate!) {
    return { ok: false, missing: ["returnDate"], say: "The return date is before the outward date. What date is the return?" };
  }
  if (passengers! > 4) {
    return {
      ok: false,
      missing: [],
      say: "For more than four passengers we arrange a larger vehicle, so the team will confirm that price for you. Can I take your name and number?",
    };
  }

  const pickupAirport = parseAirportCode(pickup);
  const dropoffAirport = parseAirportCode(dropoff);
  if (pickupAirport && pickupAirport === dropoffAirport) {
    return { ok: false, missing: ["dropoff"], say: "Both places are the same airport. Where are you travelling to or from?" };
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
      suitcases,
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

export function voiceQuoteSay(input: {
  amount: number;
  draft: WhatsAppQuoteDraft;
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
    waiting,
    "You can cancel up to 24 hours before for a full refund.",
  ];
  if (input.requestOnly) {
    parts.push("For that date and time we need to confirm we can do it before you pay, so the team will confirm with you.");
  } else if (input.shortNotice) {
    parts.push("Because it's less than 24 hours away, that price is held for 2 hours.");
  }
  return parts.join(" ");
}

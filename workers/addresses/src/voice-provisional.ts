/**
 * POST /voice/provisional-booking — create an unpaid (provisional) booking request
 * from a price this phone line already obtained via /voice/quote.
 *
 * Never invents a fare, never marks paid, never creates a SumUp checkout.
 * Payment happens only when the customer opens the existing Quick Quote booking
 * link and SumUp reports PAID through the normal /payments path.
 *
 * Duplicate calls with the same quoteId reuse the same MATNI reference.
 */
import { formatBookingReference, STARTING_BOOKING_REF } from "../shared/booking-reference";
import { buildQuickQuoteCustomerUrl, isQuickQuoteExpired } from "../shared/quick-quote";
import { voiceMobile } from "../shared/voice-booking";
import { createBookingJobFromSubmission } from "./booking-job-handlers";
import { consumeQuickQuoteCreateQuota, getQuickQuote } from "./quick-quote-store";

type Env = {
  TRACKING_STORE?: KVNamespace;
  BOOKING_COUNTER?: KVNamespace;
  SITE_ORIGIN?: string;
};

type VoiceQuoteMemo = {
  amountLabel: string;
  journeyLabel: string;
  whenLabel: string;
  heldFor: string;
  bookingUrl?: string;
};

const MEMO_TTL_SECONDS = 3 * 60 * 60;
const PROVISIONAL_PER_HOUR = 20;
const DEDUP_TTL_SECONDS = 60 * 60 * 24 * 90;
const memoKey = (id: string) => `voice:quote:${id}`;
const provisionalKey = (quoteId: string) => `voice:provisional:${quoteId}`;

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function flatten(body: unknown): Record<string, unknown> {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let out: Record<string, unknown> = { ...root };
  for (const key of ["parameters", "args", "arguments", "data", "input"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...(inner as object) };
    }
  }
  return out;
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function mapVehicle(label: string | undefined): string {
  const raw = String(label ?? "");
  if (/business|executive/i.test(raw)) return "Executive Saloon (1–4 passengers)";
  if (/estate/i.test(raw)) return "Estate Car (1–4 passengers)";
  if (/minibus|7.?seat/i.test(raw)) return "Minibus (5–7 passengers)";
  return "Standard Saloon (1–4 passengers)";
}

async function allocateMatni(env: Env): Promise<string | null> {
  if (!env.BOOKING_COUNTER) return null;
  const counterKey = "next_booking_ref";
  const stored = await env.BOOKING_COUNTER.get(counterKey);
  let refNumber = stored ? Number(stored) : STARTING_BOOKING_REF;
  if (!Number.isFinite(refNumber) || refNumber < STARTING_BOOKING_REF) refNumber = STARTING_BOOKING_REF;
  await env.BOOKING_COUNTER.put(counterKey, String(refNumber + 1));
  return formatBookingReference(refNumber);
}

export async function handleVoiceProvisionalBooking(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) {
    return reply({ ok: false, say: "I can't save that booking just now. Can I take your details so the team can call you back?" }, 503);
  }

  const input = flatten(await request.json().catch(() => null));
  const quoteId = text(input.quoteId, 64).toLowerCase().replace(/[^a-f0-9]/g, "");
  const customerName = text(input.name ?? input.customerName, 80);
  const customerEmail = text(input.email ?? input.customerEmail, 120).toLowerCase();
  const rawMobile = text(input.mobile ?? input.phone, 40);
  const mobile = voiceMobile(rawMobile);
  const termsAccepted = /^(y|yes|true|1|agreed|ok|okay)$/i.test(text(input.termsAccepted ?? input.terms, 20));

  if (!/^[a-f0-9]{16,64}$/.test(quoteId)) {
    return reply({ ok: false, missing: ["quoteId"], say: "I need to get the fixed price first, then we can hold the booking for you." });
  }
  if (!customerName) {
    return reply({ ok: false, missing: ["name"], say: "What's the name we should put on the booking?" });
  }
  if (!isEmail(customerEmail)) {
    return reply({ ok: false, missing: ["email"], say: "What's the best email address for the booking confirmation?" });
  }
  if (!mobile) {
    return reply({
      ok: false,
      missing: ["mobile"],
      say: rawMobile
        ? "Sorry, I didn't catch that as a mobile number. What's the best mobile number for the booking?"
        : "What's the best mobile number for the booking?",
    });
  }
  if (!termsAccepted) {
    return reply({
      ok: false,
      missing: ["termsAccepted"],
      say: "Before we hold it, can you confirm you're happy with our terms? You can cancel up to 24 hours before for a full refund.",
    });
  }

  if ((await consumeQuickQuoteCreateQuota(store, "voice:provisional", PROVISIONAL_PER_HOUR)) === "limited") {
    return reply({ ok: false, say: "I can't save another booking just now. Can I take your details so the team can get back to you?" });
  }

  const existingRef = await store.get(provisionalKey(quoteId));
  const memo = await store.get<VoiceQuoteMemo>(memoKey(quoteId), "json");
  const quote = await getQuickQuote(store, quoteId);
  if (!quote || isQuickQuoteExpired(quote) || quote.status === "paid" || quote.status === "cancelled") {
    return reply({ ok: false, say: "That price has expired, so let me get a fresh fixed price before we hold the booking." });
  }
  if (!memo) {
    return reply({ ok: false, say: "I need to get the fixed price on this call first, then we can hold the booking for you." });
  }

  const origin = (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
  const bookingUrl = memo.bookingUrl || `${origin}${buildQuickQuoteCustomerUrl(quote.id)}`;

  if (existingRef && /^MATNI-\d+$/.test(existingRef)) {
    return reply({
      ok: true,
      deduplicated: true,
      bookingReference: existingRef,
      bookingLink: bookingUrl,
      paymentStatus: "awaiting_payment",
      smsText: `My Airport Taxi NI: we've held your provisional booking ${existingRef} for ${memo.journeyLabel} on ${memo.whenLabel} at ${memo.amountLabel}. It is not paid yet. Check details and pay securely here: ${bookingUrl}`,
      say: `We've already held provisional booking ${existingRef} for you at ${memo.amountLabel}. That's not a confirmed booking until you pay — shall I text you the secure link? Your driver is confirmed after payment.`,
    });
  }

  const bookingReference = await allocateMatni(env);
  if (!bookingReference) {
    return reply({ ok: false, say: "I can't save that booking just now. Can I take your details so the team can call you back?" }, 503);
  }

  const journey = quote.journey;
  const job = await createBookingJobFromSubmission(store, {
    bookingReference,
    kind: "booking-request",
    message: `Phone provisional booking (fonio). Quote ${quote.id}. Awaiting secure payment via Quick Quote link.`,
    booking: {
      customerName,
      customerEmail,
      mobileNumber: mobile,
      tripLabel: journey.returnJourney ? "Airport transfer (return)" : "Airport transfer",
      pickupLabel: journey.pickupAddress,
      dropoffLabel: journey.dropoffAddress,
      returnJourney: Boolean(journey.returnJourney),
      tripDate: journey.outboundDate,
      tripTime: journey.outboundTime,
      returnDate: journey.returnDate,
      returnTime: journey.returnTime,
      flightNumber: journey.flightNumber,
      returnFlightNumber: journey.returnFlightNumber,
      passengers: journey.passengers,
      suitcases: journey.suitcases,
      vehicle: mapVehicle(journey.vehicleType),
      estimatedPrice: quote.quotedAmountLabel,
      isAirportTrip: Boolean(journey.airportCode),
      airportCode: journey.airportCode ?? undefined,
      isFromAirport: journey.fromAirport === true,
      termsAcceptedAt: new Date().toISOString(),
      quoteTransactionId: `voice_${quote.id.slice(0, 40)}`,
    },
  });

  if (!job) {
    return reply({ ok: false, say: "I couldn't save that booking. Can I take your details so the team can call you back?" }, 502);
  }

  await store.put(provisionalKey(quoteId), bookingReference, { expirationTtl: DEDUP_TTL_SECONDS });
  // Refresh memo TTL so send-link still works after provisional hold.
  await store.put(memoKey(quoteId), JSON.stringify(memo), { expirationTtl: MEMO_TTL_SECONDS });

  console.log(
    JSON.stringify({
      event: "voice_provisional_booking",
      bookingReference,
      quoteIdSuffix: quoteId.slice(-6),
      phoneSuffix: mobile.replace(/\D/g, "").slice(-4),
      amountLabel: quote.quotedAmountLabel,
      status: "awaiting_payment",
    }),
  );

  return reply({
    ok: true,
    deduplicated: false,
    bookingReference,
    bookingLink: bookingUrl,
    paymentStatus: "awaiting_payment",
    price: quote.quotedAmountLabel,
    smsText: `My Airport Taxi NI: we've held your provisional booking ${bookingReference} for ${memo.journeyLabel} on ${memo.whenLabel} at ${memo.amountLabel}. It is not paid yet. Check details and pay securely here: ${bookingUrl}`,
    say: `We've held provisional booking ${bookingReference} for ${memo.amountLabel}. That's a hold only — not confirmed until you pay on the secure link. Shall I text you that link? Your driver is confirmed after payment.`,
  });
}

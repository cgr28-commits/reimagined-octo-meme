/**
 * Meta WhatsApp Cloud API webhook + conversation driver.
 * Fares always come from calculateAuthoritativeWebsiteQuote (never from chat text).
 */

import { corsHeaders } from "../shared/google-places";
import { type PaidBookingDetails } from "../shared/booking-notifications";
import {
  buildQuoteFingerprint,
  detectWhatsAppControl,
  emptyWhatsAppSession,
  formatQuoteSummary,
  nextStepAfterWelcome,
  parseAirportCode,
  parseDirectionFromAirport,
  parseJourneyType,
  parsePassengerCount,
  parseUkDate,
  parseUkTime,
  parseYesNo,
  promptForStep,
  WHATSAPP_ONLINE_MAX_PASSENGERS,
  type WhatsAppSessionRecord,
} from "../shared/whatsapp-booking";
import {
  parseMetaWhatsAppWebhook,
  sendWhatsAppTextMessage,
  verifyMetaWhatsAppSignature,
} from "../shared/whatsapp-meta";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import { fetchTripRouteMetrics } from "../../../src/lib/trip-route";
import { searchGooglePlaces, resolveGooglePlaceDetails } from "../shared/google-places";
import {
  claimWhatsAppMessageId,
  getOrCreateWhatsAppSession,
  getWhatsAppSession,
  getWhatsAppWaIdForCheckout,
  linkWhatsAppCheckout,
  saveWhatsAppSession,
} from "./whatsapp-session-store";
import {
  createSumUpHostedCheckout,
  buildCheckoutReference,
} from "../shared/sumup-checkout";
import {
  pendingCheckoutStoreConfigured,
  savePendingCheckout,
} from "./pending-checkout-store";

export type WhatsAppEnv = {
  TRACKING_STORE?: KVNamespace;
  WHATSAPP_BOOKING_ENABLED?: string;
  META_WHATSAPP_VERIFY_TOKEN?: string;
  META_WHATSAPP_APP_SECRET?: string;
  META_WHATSAPP_ACCESS_TOKEN?: string;
  META_WHATSAPP_PHONE_NUMBER_ID?: string;
  GOOGLE_PLACES_API_KEY?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  SITE_ORIGIN?: string;
};

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function isWhatsAppEnabled(env: WhatsAppEnv): boolean {
  return String(env.WHATSAPP_BOOKING_ENABLED ?? "").trim().toLowerCase() === "true";
}

function siteOrigin(env: WhatsAppEnv): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
}

async function reply(
  env: WhatsAppEnv,
  toWaId: string,
  body: string,
): Promise<void> {
  const token = env.META_WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  if (!token || !phoneNumberId) {
    console.log(JSON.stringify({ event: "whatsapp_reply_skipped", reason: "not_configured" }));
    return;
  }
  const result = await sendWhatsAppTextMessage({
    accessToken: token,
    phoneNumberId,
    toWaId,
    body,
  });
  if (!result.ok) {
    console.log(
      JSON.stringify({ event: "whatsapp_send_failed", error: result.error }),
    );
  }
}

async function resolveAddressSuggestion(
  apiKey: string,
  query: string,
): Promise<{
  ok: true;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
} | { ok: false; reason: "ambiguous" | "not_found" }> {
  const suggestions = await searchGooglePlaces(apiKey, query, "BFS");
  if (suggestions.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  if (suggestions.length > 3) {
    // Too many weak matches — ask human rather than guess.
    return { ok: false, reason: "ambiguous" };
  }
  const top = suggestions[0];
  const details = await resolveGooglePlaceDetails(apiKey, top.id, "BFS", undefined, query);
  if (
    !details ||
    typeof details.lat !== "number" ||
    typeof details.lng !== "number" ||
    !Number.isFinite(details.lat) ||
    !Number.isFinite(details.lng)
  ) {
    return { ok: false, reason: "not_found" };
  }
  return {
    ok: true,
    address: details.displayAddress || details.formattedAddress || top.label,
    placeId: details.placeId,
    lat: details.lat,
    lng: details.lng,
  };
}

function airportLabel(code: string | undefined): string {
  if (code === "BFS") return "Belfast International Airport";
  if (code === "BHD") return "Belfast City Airport";
  if (code === "DUB") return "Dublin Airport";
  return "Airport";
}

function applyAirportEnds(session: WhatsAppSessionRecord): void {
  const draft = session.draft;
  if (!draft.airportCode) return;
  const label = airportLabel(draft.airportCode);
  if (draft.fromAirport) {
    draft.pickupAddress = label;
    draft.dropoffAddress = draft.dropoffAddress;
  } else {
    draft.dropoffAddress = label;
  }
}

async function runServerQuote(
  session: WhatsAppSessionRecord,
): Promise<{ ok: true; message: string } | { ok: false; message: string; handoff?: boolean }> {
  const draft = session.draft;
  applyAirportEnds(session);

  let routeMetrics = null;
  if (
    typeof draft.pickupLat === "number" &&
    typeof draft.pickupLng === "number" &&
    typeof draft.dropoffLat === "number" &&
    typeof draft.dropoffLng === "number"
  ) {
    routeMetrics = await fetchTripRouteMetrics(
      draft.pickupLat,
      draft.pickupLng,
      draft.dropoffLat,
      draft.dropoffLng,
    );
  }

  const quote = calculateAuthoritativeWebsiteQuote({
    airportCode: draft.airportCode ?? null,
    fromAirport: Boolean(draft.fromAirport),
    pickupAddress: draft.pickupAddress ?? "",
    dropoffAddress: draft.dropoffAddress ?? "",
    returnJourney: Boolean(draft.returnJourney),
    outboundDate: draft.outboundDate ?? "",
    outboundTime: draft.outboundTime ?? "",
    passengers: draft.passengers ?? 0,
    suitcases: draft.suitcases ?? 0,
    routeMetrics,
  });

  if (!quote.ok) {
    return {
      ok: false,
      handoff: quote.reason === "no_fare" || quote.reason === "passenger_limit",
      message: quote.message,
    };
  }

  draft.quotedAmount = quote.amount;
  draft.quotedAmountLabel = quote.amountLabel;
  draft.quotedVehicleType = quote.vehicleType;
  draft.quoteFingerprint = buildQuoteFingerprint(draft);
  session.step = "quote_ready";
  return { ok: true, message: formatQuoteSummary(draft) };
}

function mobileFromWaId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits ? `+${digits}` : waId;
}

function buildWhatsAppBookingDetails(session: WhatsAppSessionRecord): PaidBookingDetails | null {
  const draft = session.draft;
  const email = draft.customerEmail?.trim() ?? "";
  const name = draft.customerName?.trim() ?? "";
  if (!email || !name || !draft.pickupAddress || !draft.dropoffAddress) {
    return null;
  }
  if (!draft.outboundDate || !draft.outboundTime || !draft.passengers) {
    return null;
  }

  const childNote = draft.childSeatRequired ? " · Child seat required" : "";
  return {
    customerName: name,
    customerEmail: email,
    mobileNumber: mobileFromWaId(session.phoneE164 || session.waId),
    tripLabel: `WhatsApp airport transfer (${draft.airportCode ?? "NI"})${childNote}`,
    pickupLabel: draft.pickupAddress,
    dropoffLabel: draft.dropoffAddress,
    returnJourney: Boolean(draft.returnJourney),
    tripDate: draft.outboundDate,
    tripTime: draft.outboundTime,
    returnDate: "",
    returnTime: "",
    flightNumber: draft.flightNumber?.trim() ?? "",
    passengers: draft.passengers,
    suitcases: draft.suitcases ?? 0,
    vehicle: draft.quotedVehicleType || "Saloon",
    isAirportTrip: true,
    airportCode: draft.airportCode,
    isFromAirport: Boolean(draft.fromAirport),
  };
}

async function createWhatsAppPayment(
  env: WhatsAppEnv,
  session: WhatsAppSessionRecord,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return {
      ok: false,
      message: "Secure payment is not configured yet. Please Speak to Colin to finish booking.",
    };
  }
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return {
      ok: false,
      message: "Booking store is not configured. Please Speak to Colin.",
    };
  }
  if (!session.draft.customerEmail?.trim()) {
    session.step = "customer_email";
    return {
      ok: false,
      message: `An email is required for payment confirmation.\n\n${promptForStep("customer_email")}`,
    };
  }

  // Re-validate fare before charging — never trust the stored amount alone.
  const requote = await runServerQuote(session);
  if (!requote.ok || !session.draft.quotedAmount || session.draft.quotedAmount < 1) {
    return {
      ok: false,
      message: requote.ok
        ? "Could not re-validate the fare."
        : requote.message,
    };
  }

  const booking = buildWhatsAppBookingDetails(session);
  if (!booking) {
    return {
      ok: false,
      message: "Booking details are incomplete. Please Start again or Speak to Colin.",
    };
  }

  const amount = Math.round(session.draft.quotedAmount * 100) / 100;
  const checkoutReference = buildCheckoutReference();
  const origin = siteOrigin(env);
  const redirectUrl = `${origin}/booking-confirmed/`;
  const workerWebhook = `https://reimagined-octo-meme.cgr28.workers.dev/payments/webhook`;

  try {
    const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount,
      description: `WhatsApp booking ${session.draft.airportCode ?? ""}`.trim(),
      checkoutReference,
      redirectUrl,
      returnUrl: workerWebhook,
    });

    await savePendingCheckout(env.TRACKING_STORE, {
      checkoutId: checkout.checkoutId,
      checkoutReference: checkout.checkoutReference,
      amount,
      booking,
      createdAt: new Date().toISOString(),
      whatsappWaId: session.waId,
      standardWebsiteAmount: amount,
    });
    await linkWhatsAppCheckout(env.TRACKING_STORE, checkout.checkoutId, session.waId);

    session.checkoutId = checkout.checkoutId;
    session.paymentUrl = checkout.paymentUrl;
    session.paymentReference = checkout.checkoutReference;
    session.step = "awaiting_payment";

    console.log(
      JSON.stringify({
        event: "whatsapp_checkout_created",
        checkoutId: checkout.checkoutId,
        amount,
        waIdSuffix: session.waId.slice(-4),
      }),
    );

    return {
      ok: true,
      message:
        `Your secure payment link (fixed fare ${session.draft.quotedAmountLabel}):\n${checkout.paymentUrl}\n\n` +
        `After payment we will confirm your booking. ${promptForStep("awaiting_payment")}`,
    };
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "whatsapp_sumup_failed",
        error: err instanceof Error ? err.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: "We could not start payment just now. Please Speak to Colin.",
    };
  }
}

/**
 * After SumUp PAID finalize — update WhatsApp session and send booking confirmation.
 * Idempotent: skips re-send when the same payment reference was already confirmed.
 */
export async function notifyWhatsAppPaymentFinalized(input: {
  env: WhatsAppEnv;
  checkoutId: string;
  paymentReference: string;
  amountPaid: string;
  alreadyFinalized?: boolean;
}): Promise<void> {
  const { env, checkoutId, paymentReference, amountPaid } = input;
  if (!env.TRACKING_STORE) return;

  const waId =
    (await getWhatsAppWaIdForCheckout(env.TRACKING_STORE, checkoutId)) ??
    null;
  if (!waId) return;

  const session = await getWhatsAppSession(env.TRACKING_STORE, waId);
  if (!session) return;

  if (
    session.step === "confirmed" &&
    session.bookingReference === paymentReference
  ) {
    return;
  }

  session.step = "confirmed";
  session.bookingReference = paymentReference;
  session.paymentReference = paymentReference;
  session.checkoutId = checkoutId;
  await saveWhatsAppSession(env.TRACKING_STORE, session);

  const draft = session.draft;
  const summary = [
    `Payment received — thank you.`,
    `Booking reference: *${paymentReference}*`,
    `Fare paid: ${amountPaid || draft.quotedAmountLabel || ""}`,
    `Pickup: ${draft.pickupAddress ?? ""}`,
    `Drop-off: ${draft.dropoffAddress ?? ""}`,
    `Date/time: ${draft.outboundDate ?? ""} ${draft.outboundTime ?? ""}`,
    draft.flightNumber ? `Flight: ${draft.flightNumber}` : "",
    `Passengers: ${draft.passengers ?? ""} · Bags: ${draft.suitcases ?? 0}`,
    "",
    "We look forward to driving you. Reply *Speak to Colin* if you need anything.",
  ]
    .filter(Boolean)
    .join("\n");

  await reply(env, waId, summary);
  console.log(
    JSON.stringify({
      event: "whatsapp_booking_confirmed",
      checkoutId,
      paymentReference,
      waIdSuffix: waId.slice(-4),
      alreadyFinalized: Boolean(input.alreadyFinalized),
    }),
  );
}

async function handleStepInput(
  env: WhatsAppEnv,
  session: WhatsAppSessionRecord,
  text: string,
): Promise<string> {
  const draft = session.draft;
  const control = detectWhatsAppControl(text);

  if (control === "handoff") {
    session.step = "handoff";
    session.handoffReason = "customer_requested";
    return promptForStep("handoff");
  }
  if (control === "restart") {
    const fresh = emptyWhatsAppSession(session.waId, session.phoneE164);
    Object.assign(session, fresh);
    session.step = "journey_type";
    return `Starting again.\n\n${promptForStep("journey_type")}`;
  }
  if (control === "change" && (session.step === "quote_ready" || session.step === "awaiting_payment")) {
    session.step = "journey_type";
    session.draft = {};
    session.checkoutId = undefined;
    session.paymentUrl = undefined;
    return `OK — let's update the details.\n\n${promptForStep("journey_type")}`;
  }
  if (control === "book" && session.step === "quote_ready") {
    const payment = await createWhatsAppPayment(env, session);
    return payment.message;
  }

  if (session.step === "welcome") {
    if (control === "book" || /book|quote|price|fare/i.test(text)) {
      session.step = nextStepAfterWelcome();
      return promptForStep(session.step);
    }
    return promptForStep("welcome");
  }

  switch (session.step) {
    case "journey_type": {
      const value = parseJourneyType(text);
      if (value === null) return "Please reply *one-way* or *return*.";
      draft.returnJourney = value;
      session.step = "airport";
      return promptForStep("airport");
    }
    case "airport": {
      const code = parseAirportCode(text);
      if (!code) return "Please choose 1) Belfast International, 2) Belfast City, or 3) Dublin Airport.";
      draft.airportCode = code;
      session.step = "direction";
      return promptForStep("direction");
    }
    case "direction": {
      const fromAirport = parseDirectionFromAirport(text);
      if (fromAirport === null) {
        return "Please reply *from the airport* or *to the airport*.";
      }
      draft.fromAirport = fromAirport;
      session.step = "pickup_address";
      return fromAirport
        ? "What is your *destination address* (after leaving the airport)?"
        : "What is your *pickup address* (before going to the airport)?";
    }
    case "pickup_address": {
      const apiKey = env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
      if (!apiKey) {
        session.step = "handoff";
        session.handoffReason = "places_not_configured";
        return promptForStep("handoff");
      }
      const resolved = await resolveAddressSuggestion(apiKey, text);
      if (!resolved.ok) {
        session.step = "handoff";
        session.handoffReason =
          resolved.reason === "ambiguous" ? "ambiguous_address" : "address_not_found";
        return (
          "I could not confidently match that address, so I will not invent a price.\n\n" +
          promptForStep("handoff")
        );
      }
      if (draft.fromAirport) {
        draft.dropoffAddress = resolved.address;
        draft.dropoffPlaceId = resolved.placeId;
        draft.dropoffLat = resolved.lat;
        draft.dropoffLng = resolved.lng;
        draft.pickupAddress = airportLabel(draft.airportCode);
      } else {
        draft.pickupAddress = resolved.address;
        draft.pickupPlaceId = resolved.placeId;
        draft.pickupLat = resolved.lat;
        draft.pickupLng = resolved.lng;
        draft.dropoffAddress = airportLabel(draft.airportCode);
      }
      session.step = "pickup_date";
      return `Thanks — using: ${resolved.address}\n\n${promptForStep("pickup_date")}`;
    }
    case "pickup_date": {
      const date = parseUkDate(text);
      if (!date) return "Please send the date as YYYY-MM-DD or DD/MM/YYYY.";
      draft.outboundDate = date;
      session.step = "pickup_time";
      return promptForStep("pickup_time");
    }
    case "pickup_time": {
      const time = parseUkTime(text);
      if (!time) return "Please send the time as HH:MM (e.g. 14:30).";
      draft.outboundTime = time;
      session.step = "passengers";
      return promptForStep("passengers");
    }
    case "passengers": {
      const n = parsePassengerCount(text);
      if (n === null) return `Please send a number from 1 to ${WHATSAPP_ONLINE_MAX_PASSENGERS}.`;
      if (n > WHATSAPP_ONLINE_MAX_PASSENGERS) {
        session.step = "handoff";
        session.handoffReason = "passenger_limit";
        return (
          `Online WhatsApp quotes are limited to ${WHATSAPP_ONLINE_MAX_PASSENGERS} passengers.\n\n` +
          promptForStep("handoff")
        );
      }
      draft.passengers = n;
      session.step = "suitcases";
      return promptForStep("suitcases");
    }
    case "suitcases": {
      const n = parsePassengerCount(text);
      if (n === null || n > 20) return "Please send the number of large bags (0 or more).";
      draft.suitcases = n;
      session.step = "child_seat";
      return promptForStep("child_seat");
    }
    case "child_seat": {
      const value = parseYesNo(text);
      if (value === null) return "Please reply yes or no for a child seat.";
      draft.childSeatRequired = value;
      session.step = draft.fromAirport ? "flight_number" : "customer_name";
      return promptForStep(session.step);
    }
    case "flight_number": {
      const trimmed = text.trim();
      if (!/^skip$/i.test(trimmed) && trimmed.length >= 2) {
        draft.flightNumber = trimmed.toUpperCase();
      }
      session.step = "customer_name";
      return promptForStep("customer_name");
    }
    case "customer_name": {
      const name = text.trim();
      if (name.length < 2) return "Please send your full name.";
      draft.customerName = name;
      session.step = "customer_email";
      return promptForStep("customer_email");
    }
    case "customer_email": {
      const trimmed = text.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return "Please send a valid email for your booking confirmation.";
      }
      draft.customerEmail = trimmed;
      const quoted = await runServerQuote(session);
      if (!quoted.ok) {
        if (quoted.handoff) {
          session.step = "handoff";
          session.handoffReason = "no_fare";
          return `${quoted.message}\n\n${promptForStep("handoff")}`;
        }
        return quoted.message;
      }
      return quoted.message;
    }
    case "quote_ready":
      return promptForStep("quote_ready");
    case "awaiting_payment":
      return session.paymentUrl
        ? `Your payment link: ${session.paymentUrl}\n\n${promptForStep("awaiting_payment")}`
        : promptForStep("awaiting_payment");
    case "handoff":
      return promptForStep("handoff");
    case "confirmed":
      return (
        `Booking ${session.bookingReference ?? ""} is confirmed.\n` +
        promptForStep("confirmed")
      );
    default:
      session.step = "welcome";
      return promptForStep("welcome");
  }
}

/** GET — Meta webhook verification challenge. */
export async function handleWhatsAppWebhookGet(
  request: Request,
  env: WhatsAppEnv,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = env.META_WHATSAPP_VERIFY_TOKEN?.trim() ?? "";

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return json({ error: "Forbidden" }, 403, origin);
}

/** POST — inbound WhatsApp messages. */
export async function handleWhatsAppWebhookPost(
  request: Request,
  env: WhatsAppEnv,
  origin: string | null,
): Promise<Response> {
  if (!isWhatsAppEnabled(env)) {
    return json({ error: "WhatsApp booking is not enabled" }, 503, origin);
  }
  if (!env.TRACKING_STORE) {
    return json({ error: "KV store is not configured" }, 503, origin);
  }

  const rawBody = await request.text();
  const appSecret = env.META_WHATSAPP_APP_SECRET?.trim() ?? "";
  const signature = request.headers.get("x-hub-signature-256");

  if (appSecret) {
    const valid = await verifyMetaWhatsAppSignature(rawBody, signature, appSecret);
    if (!valid) {
      console.log(JSON.stringify({ event: "whatsapp_bad_signature" }));
      return json({ error: "Invalid signature" }, 401, origin);
    }
  } else {
    console.log(
      JSON.stringify({
        event: "whatsapp_signature_skipped",
        reason: "META_WHATSAPP_APP_SECRET not set",
      }),
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const parsed = parseMetaWhatsAppWebhook(payload);
  if (!parsed.ok) {
    return json({ ok: true, ignored: parsed.reason }, 200, origin);
  }

  for (const message of parsed.messages) {
    const claim = await claimWhatsAppMessageId(env.TRACKING_STORE, message.messageId);
    if (claim === "duplicate") {
      console.log(
        JSON.stringify({
          event: "whatsapp_duplicate_message",
          messageId: message.messageId,
        }),
      );
      continue;
    }

    const session = await getOrCreateWhatsAppSession(env.TRACKING_STORE, message.fromWaId);
    session.lastInboundMessageId = message.messageId;
    session.phoneE164 = message.fromWaId;

    const replyText = await handleStepInput(env, session, message.text);
    await saveWhatsAppSession(env.TRACKING_STORE, session);
    await reply(env, message.fromWaId, replyText);

    console.log(
      JSON.stringify({
        event: "whatsapp_handled",
        waIdSuffix: message.fromWaId.slice(-4),
        step: session.step,
        messageId: message.messageId,
      }),
    );
  }

  // Meta expects 200 quickly.
  return json({ ok: true }, 200, origin);
}

export function isWhatsAppWebhookPath(pathname: string): boolean {
  return (
    pathname === "/whatsapp/webhook" ||
    pathname === "/api/whatsapp/webhook"
  );
}

import {
  corsHeaders,
  extractLeadingStreetNumber,
  isStreetOnlyQuery,
  resolveGooglePlace,
  reverseGeocodeGoogle,
  searchGoogleEstablishments,
  searchGooglePlaces,
  searchGoogleStreetAddresses,
} from "../shared/google-places";
import { isNorthernIrelandPostcodeQuery, sortSuggestionsByStreetNumber } from "../shared/address-validation";
import {
  resolveGetAddress,
  searchGetAddress,
} from "../shared/getaddress";
import {
  formatBookingReference,
  prependBookingReference,
  STARTING_BOOKING_REF,
} from "../shared/booking-reference";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import {
  lookupFlight,
  type TripDirection,
} from "../shared/flight-lookup";
import {
  getSumUpCheckout,
  getSuccessfulTransactionCode,
  isSumUpCheckoutPaid,
  buildCheckoutReference,
  createSumUpHostedCheckout,
} from "../shared/sumup-checkout";
import {
  logBookingsToGoogleCalendar,
  type TourBookingEvent,
  type TransferBookingEvent,
} from "./google-calendar";
import {
  buildQuoteLeadMessage,
  buildQuoteLeadSubject,
  type QuoteLeadDetails,
} from "../shared/quote-lead";

type EmailBinding = {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    replyTo?: string | { email: string; name?: string };
  }): Promise<{ messageId?: string }>;
};

type Env = {
  GOOGLE_PLACES_API_KEY: string;
  GETADDRESS_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  BOOKING_COUNTER?: KVNamespace;
  EMAIL?: EmailBinding;
  AERODATABOX_RAPIDAPI_KEY?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

type QuoteLeadRequestBody = QuoteLeadDetails & {
  fingerprint?: string;
};

type BookingRequestBody = {
  customerName?: string;
  message?: string;
  /** When false, skip owner notification email (e.g. WhatsApp-only path). */
  sendEmail?: boolean;
  booking?: TransferBookingEvent;
  tour?: TourBookingEvent;
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
const BUSINESS_NAME = "My Airport Taxi NI";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function routePath(
  pathname: string,
): "addresses" | "geocode" | "bookings" | "quote-leads" | "payments" | "payments-confirm" | "flights" | null {
  if (pathname === "/addresses" || pathname === "/api/addresses") {
    return "addresses";
  }

  if (pathname === "/geocode" || pathname === "/api/geocode") {
    return "geocode";
  }

  if (pathname === "/bookings" || pathname === "/api/bookings") {
    return "bookings";
  }

  if (pathname === "/quote-leads" || pathname === "/api/quote-leads") {
    return "quote-leads";
  }

  if (pathname === "/payments/confirm" || pathname === "/api/payments/confirm") {
    return "payments-confirm";
  }

  if (pathname === "/payments" || pathname === "/api/payments") {
    return "payments";
  }

  if (pathname === "/flights" || pathname === "/api/flights") {
    return "flights";
  }

  return null;
}

type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  toName?: string;
};

async function sendViaCloudflareEmail(env: Env, options: EmailPayload): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }

  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

  await env.EMAIL.send({
    to: options.to,
    from: { email: fromEmail, name: BUSINESS_NAME },
    replyTo: { email: fromEmail, name: BUSINESS_NAME },
    subject: options.subject,
    text: options.body,
    ...(options.htmlBody ? { html: options.htmlBody } : {}),
  });
}

async function sendViaWeb3Forms(env: Env, options: EmailPayload): Promise<void> {
  const accessKey = env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) {
    throw new Error("Web3Forms is not configured");
  }

  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: accessKey,
      subject: options.subject,
      from_name: options.toName ?? BUSINESS_NAME,
      message: options.body,
    }),
  });

  const payload = (await response.json().catch(() => null)) as { success?: unknown } | null;
  if (!response.ok || payload?.success !== true) {
    throw new Error("Web3Forms request failed");
  }
}

async function sendViaMailChannels(env: Env, options: EmailPayload): Promise<void> {
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: options.to, name: options.toName ?? options.to }],
        },
      ],
      from: {
        email: fromEmail,
        name: BUSINESS_NAME,
      },
      reply_to: {
        email: fromEmail,
        name: BUSINESS_NAME,
      },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.body },
        ...(options.htmlBody ? [{ type: "text/html", value: options.htmlBody }] : []),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("MailChannels request failed");
  }
}

async function sendEmail(env: Env, options: EmailPayload): Promise<void> {
  const providers: Array<{ label: string; run: () => Promise<void> }> = [];

  if (env.EMAIL) {
    providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
  }

  if (env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
  }

  providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });

  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      await provider.run();
      return;
    } catch (error) {
      lastError = error;
      console.error(`Email via ${provider.label} failed`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All email providers failed");
}

async function sendBookingEmail(
  env: Env,
  customerName: string,
  message: string,
  bookingReference: string | null,
): Promise<void> {
  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const body = bookingReference
    ? prependBookingReference(message, bookingReference)
    : message;
  const subject = bookingReference
    ? `New booking ${bookingReference} — ${customerName}`
    : `New booking — ${customerName}`;

  await sendEmail(env, {
    to: toEmail,
    subject,
    body,
  });
}

async function allocateBookingReference(env: Env): Promise<string | null> {
  if (!env.BOOKING_COUNTER) {
    return null;
  }

  const counterKey = "next_booking_ref";
  const stored = await env.BOOKING_COUNTER.get(counterKey);
  let refNumber = stored ? Number(stored) : STARTING_BOOKING_REF;

  if (!Number.isFinite(refNumber) || refNumber < STARTING_BOOKING_REF) {
    refNumber = STARTING_BOOKING_REF;
  }

  await env.BOOKING_COUNTER.put(counterKey, String(refNumber + 1));
  return formatBookingReference(refNumber);
}

function calendarConfigured(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() &&
      env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

async function logBookingCalendar(
  env: Env,
  body: BookingRequestBody,
  customerName: string,
  message: string,
): Promise<{ logged: boolean; events?: number; error?: string }> {
  if (!calendarConfigured(env)) {
    return { logged: false };
  }

  try {
    const events = await logBookingsToGoogleCalendar({
      serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
      calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
      customerName,
      message,
      booking: body.booking ?? null,
      tour: body.tour ?? null,
    });
    return { logged: true, events };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    console.error("Google Calendar booking log failed", detail);
    return { logged: false, error: detail };
  }
}

function parsePaidBookingDetails(body: Record<string, unknown>): PaidBookingDetails | null {
  const booking = body.booking;
  if (!booking || typeof booking !== "object") {
    return null;
  }

  const details = booking as Record<string, unknown>;
  const customerName = String(details.customerName ?? "").trim();
  const customerEmail = String(details.customerEmail ?? "").trim();

  if (!customerName || !customerEmail) {
    return null;
  }

  return {
    customerName,
    customerEmail,
    mobileNumber: String(details.mobileNumber ?? "").trim(),
    tripLabel: String(details.tripLabel ?? "").trim(),
    pickupLabel: String(details.pickupLabel ?? "").trim(),
    dropoffLabel: String(details.dropoffLabel ?? "").trim(),
    returnJourney: Boolean(details.returnJourney),
    tripDate: String(details.tripDate ?? "").trim(),
    tripTime: String(details.tripTime ?? "").trim(),
    returnDate: String(details.returnDate ?? "").trim(),
    returnTime: String(details.returnTime ?? "").trim(),
    flightNumber: String(details.flightNumber ?? "").trim(),
    returnFlightNumber: String(details.returnFlightNumber ?? "").trim() || undefined,
    passengers: Number(details.passengers) || 0,
    suitcases: Number(details.suitcases) || 0,
    vehicle: String(details.vehicle ?? "").trim(),
    journeyDistance: String(details.journeyDistance ?? "").trim() || undefined,
    journeyDuration: String(details.journeyDuration ?? "").trim() || undefined,
    isAirportTrip: Boolean(details.isAirportTrip),
  };
}

async function isDuplicateQuoteLead(fingerprint: string): Promise<boolean> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://quote-lead-dedup.internal/${encodeURIComponent(fingerprint)}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return true;
  }

  await cache.put(
    cacheKey,
    new Response("1", {
      headers: { "Cache-Control": "private, max-age=3600" },
    }),
  );

  return false;
}

function parseQuoteLeadBody(body: QuoteLeadRequestBody): QuoteLeadDetails | null {
  const tripLabel = body.tripLabel?.trim() ?? "";
  const pickupLabel = body.pickupLabel?.trim() ?? "";
  const dropoffLabel = body.dropoffLabel?.trim() ?? "";
  const tripDate = body.tripDate?.trim() ?? "";
  const tripTime = body.tripTime?.trim() ?? "";
  const vehicle = body.vehicle?.trim() ?? "";
  const estimatedPrice = body.estimatedPrice?.trim() ?? "";

  if (!tripLabel || !pickupLabel || !dropoffLabel || !tripDate || !tripTime || !vehicle || !estimatedPrice) {
    return null;
  }

  const passengers = Number(body.passengers);
  const suitcases = Number(body.suitcases);

  if (!Number.isFinite(passengers) || passengers < 1 || !Number.isFinite(suitcases) || suitcases < 0) {
    return null;
  }

  return {
    tripLabel,
    pickupLabel,
    dropoffLabel,
    returnJourney: Boolean(body.returnJourney),
    tripDate,
    tripTime,
    returnDate: body.returnDate?.trim() || undefined,
    returnTime: body.returnTime?.trim() || undefined,
    passengers,
    suitcases,
    vehicle,
    estimatedPrice,
    journeyDistance: body.journeyDistance?.trim() || undefined,
    journeyDuration: body.journeyDuration?.trim() || undefined,
    isAirportTrip: Boolean(body.isAirportTrip),
  };
}

async function handleQuoteLeadRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: QuoteLeadRequestBody;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const details = parseQuoteLeadBody(body);
  if (!details) {
    return json({ error: "Missing required fields" }, 400, origin);
  }

  const fingerprint = body.fingerprint?.trim() ?? "";
  if (!fingerprint || fingerprint.length > 512) {
    return json({ error: "Missing quote fingerprint" }, 400, origin);
  }

  if (await isDuplicateQuoteLead(fingerprint)) {
    return json({ ok: true, emailed: false, deduplicated: true }, 200, origin);
  }

  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

  try {
    await sendEmail(env, {
      to: toEmail,
      subject: buildQuoteLeadSubject(details),
      body: buildQuoteLeadMessage(details),
    });
  } catch (error) {
    console.error("Quote lead email failed", error);
    return json({ error: "Failed to send quote alert email" }, 502, origin);
  }

  return json({ ok: true, emailed: true }, 200, origin);
}

async function handleBookingRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: BookingRequestBody;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const customerName = body.customerName?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  const shouldSendEmail = body.sendEmail !== false;

  if (!customerName || !message) {
    return json({ error: "Missing required fields" }, 400, origin);
  }

  let bookingReference: string | null = null;
  try {
    bookingReference = await allocateBookingReference(env);
  } catch (error) {
    console.error("Booking reference allocation failed", error);
  }

  let emailSent = false;

  if (shouldSendEmail) {
    try {
      await sendBookingEmail(env, customerName, message, bookingReference);
      emailSent = true;
    } catch (error) {
      console.error("Booking email failed", error);
      const calendar = await logBookingCalendar(env, body, customerName, message);
      if (calendar.logged) {
        return json(
          {
            ok: true,
            bookingReference: bookingReference ?? undefined,
            emailSent: false,
            calendarLogged: true,
            calendarEvents: calendar.events,
            warning: "Booking email failed but the trip was logged to Google Calendar",
          },
          200,
          origin,
        );
      }

      return json({ error: "Failed to send booking email" }, 502, origin);
    }
  }

  const calendar = await logBookingCalendar(env, body, customerName, message);

  if (!shouldSendEmail && !calendar.logged && calendarConfigured(env) && calendar.error) {
    return json(
      { error: "Failed to log booking to Google Calendar", detail: calendar.error },
      502,
      origin,
    );
  }

  return json(
    {
      ok: true,
      bookingReference: bookingReference ?? undefined,
      emailSent,
      calendarLogged: calendar.logged,
      calendarEvents: calendar.events ?? 0,
    },
    200,
    origin,
  );
}

async function handlePaymentRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";

  if (!apiKey || !merchantCode) {
    return json({ error: "SumUp payment is not configured" }, 503, origin);
  }

  let body: {
    amount?: number;
    description?: string;
    checkoutReference?: string;
    redirectUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const amount = Number(body.amount);
  const description = body.description?.trim() ?? "";
  const redirectUrl = body.redirectUrl?.trim() ?? "";

  if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
    return json({ error: "Invalid payment amount" }, 400, origin);
  }

  if (!description) {
    return json({ error: "Missing payment description" }, 400, origin);
  }

  if (!redirectUrl) {
    return json({ error: "Missing redirect URL" }, 400, origin);
  }

  try {
    const checkoutReference = body.checkoutReference?.trim() || buildCheckoutReference();
    const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: Math.round(amount * 100) / 100,
      description,
      checkoutReference,
      redirectUrl,
    });

    return json(
      {
        ok: true,
        paymentUrl: checkout.paymentUrl,
        checkoutId: checkout.checkoutId,
        checkoutReference: checkout.checkoutReference,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("SumUp checkout failed", error);
    return json({ error: "Could not create SumUp payment link" }, 502, origin);
  }
}

async function handlePaymentConfirmRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";

  if (!apiKey) {
    return json({ error: "SumUp payment is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const checkoutId = String(body.checkoutId ?? "").trim();
  const booking = parsePaidBookingDetails(body);

  if (!checkoutId || !booking) {
    return json({ error: "Missing checkout or booking details" }, 400, origin);
  }

  try {
    const checkout = await getSumUpCheckout(apiKey, checkoutId);

    if (!isSumUpCheckoutPaid(checkout)) {
      return json({ error: "Payment has not been completed yet" }, 402, origin);
    }

    const amountPaid = formatPaidAmount(checkout.amount ?? 0, checkout.currency ?? "GBP");
    const transactionCode = getSuccessfulTransactionCode(checkout);
    const paymentReference = transactionCode ?? checkout.checkout_reference ?? checkout.id;

    const receipt = {
      ...booking,
      amountPaid,
      paymentReference,
      transactionCode,
      checkoutReference: checkout.checkout_reference,
    };

    const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME);
    const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME);

    await sendEmail(env, {
      to: booking.customerEmail,
      toName: booking.customerName,
      subject: customerEmail.subject,
      body: customerEmail.text,
      htmlBody: customerEmail.html,
    });

    await sendEmail(env, {
      to: env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL,
      subject: ownerEmail.subject,
      body: ownerEmail.body,
    });

    return json(
      {
        ok: true,
        paid: true,
        amountPaid,
        paymentReference,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Payment confirmation failed", error);
    return json({ error: "Could not confirm payment and send booking emails" }, 502, origin);
  }
}

async function handleFlightLookupRequest(
  url: URL,
  env: Env,
  origin: string | null,
): Promise<Response> {
  try {
    const flightNumber = url.searchParams.get("flight")?.trim() ?? "";
    const tripDate = url.searchParams.get("date")?.trim() ?? "";
    const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
    const directionParam = url.searchParams.get("direction")?.trim() ?? "from-airport";
    const direction: TripDirection =
      directionParam === "to-airport" ? "to-airport" : "from-airport";

    const airportNames: Record<string, string> = {
      BFS: "Belfast International",
      BHD: "George Best Belfast City",
      DUB: "Dublin Airport",
      LDY: "City of Derry",
    };

    const configured = Boolean(env.AERODATABOX_RAPIDAPI_KEY?.trim());
    const flightCache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await flightCache.match(cacheKey);
    if (cached) {
      const cachedBody = (await cached.json()) as { code?: string; ok?: boolean };
      if (cachedBody.code !== "rate_limited") {
        return json(cachedBody, cached.status, origin);
      }
    }

    const result = await lookupFlight(env.AERODATABOX_RAPIDAPI_KEY, {
      flightNumber,
      tripDate,
      airportCode,
      airportName: airportNames[airportCode] ?? airportCode,
      direction,
    });

    if (!result.ok) {
      const status =
        result.code === "api_unavailable" || result.code === "rate_limited" ? 503 : 404;
      const responseBody = {
        ok: false,
        error: result.error,
        code: result.code,
        configured: result.code === "rate_limited" ? false : configured,
      };

      if (result.code !== "rate_limited") {
        const response = json(responseBody, status, origin);
        await flightCache.put(
          cacheKey,
          new Response(JSON.stringify(responseBody), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
          }),
        );
        return response;
      }

      return json(responseBody, status, origin);
    }

    const responseBody = {
      ok: true,
      flight: result.flight,
      configured,
    };
    const response = json(responseBody, 200, origin);
    await flightCache.put(
      cacheKey,
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
      }),
    );
    return response;
  } catch (error) {
    console.error("Flight lookup failed", error);
    return json(
      {
        ok: false,
        error:
          "Flight verification hit a temporary error. You can still enter your flight number and continue.",
        code: "upstream_error",
        configured: false,
      },
      503,
      origin,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const route = routePath(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (!route) {
      return json({ error: "Not found" }, 404, origin);
    }

    if (route === "bookings") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleBookingRequest(request, env, origin);
    }

    if (route === "quote-leads") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleQuoteLeadRequest(request, env, origin);
    }

    if (route === "payments") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handlePaymentRequest(request, env, origin);
    }

    if (route === "payments-confirm") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handlePaymentConfirmRequest(request, env, origin);
    }

    if (route === "flights") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleFlightLookupRequest(url, env, origin);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    if (!env.GOOGLE_PLACES_API_KEY && !env.GETADDRESS_API_KEY) {
      return json({ error: "Address lookup is not configured" }, 503, origin);
    }

    if (route === "geocode") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";

      if (!lat || !lon) {
        return json({ error: "Missing coordinates" }, 400, origin);
      }

      const latitude = Number(lat);
      const longitude = Number(lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return json({ error: "Invalid coordinates" }, 400, origin);
      }

      try {
        const address = await reverseGeocodeGoogle(
          env.GOOGLE_PLACES_API_KEY,
          latitude,
          longitude,
          airportCode,
        );

        if (!address) {
          return json({ error: "Location is outside the service area" }, 404, origin);
        }

        return json({ address, provider: "google" }, 200, origin);
      } catch {
        return json({ error: "Geocoding failed" }, 502, origin);
      }
    }

    const id = url.searchParams.get("id")?.trim();
    const query = url.searchParams.get("q")?.trim() ?? "";
    const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
    const sessionToken = url.searchParams.get("session")?.trim() ?? undefined;

    if (id) {
      try {
        if (id.startsWith("ga:") && env.GETADDRESS_API_KEY) {
          const address = await resolveGetAddress(env.GETADDRESS_API_KEY, id, airportCode);
          if (!address) {
            return json({ error: "Address not found" }, 404, origin);
          }
          return json({ address, provider: "getaddress" }, 200, origin);
        }

        if (!env.GOOGLE_PLACES_API_KEY) {
          return json({ error: "Address lookup is not configured" }, 503, origin);
        }

        const address = await resolveGooglePlace(
          env.GOOGLE_PLACES_API_KEY,
          id,
          airportCode,
          sessionToken,
        );

        if (!address) {
          return json({ error: "Address not found" }, 404, origin);
        }

        return json({ address, provider: "google" }, 200, origin);
      } catch {
        return json({ error: "Address lookup failed" }, 502, origin);
      }
    }

    if (query.length < 3) {
      return json({ suggestions: [] }, 200, origin);
    }

    try {
      const tasks: Promise<Awaited<ReturnType<typeof searchGooglePlaces>>>[] = [];

      if (
        env.GETADDRESS_API_KEY &&
        airportCode !== "DUB" &&
        (airportCode !== "LDY" || isNorthernIrelandPostcodeQuery(query))
      ) {
        tasks.push(searchGetAddress(env.GETADDRESS_API_KEY, query, airportCode));
      }

      if (env.GOOGLE_PLACES_API_KEY) {
        tasks.push(
          searchGooglePlaces(env.GOOGLE_PLACES_API_KEY, query, airportCode, sessionToken),
        );

        if (!extractLeadingStreetNumber(query)) {
          tasks.push(
            searchGoogleEstablishments(
              env.GOOGLE_PLACES_API_KEY,
              query,
              airportCode,
              sessionToken,
            ),
          );
        }

        if (isStreetOnlyQuery(query)) {
          tasks.push(
            searchGoogleStreetAddresses(env.GOOGLE_PLACES_API_KEY, query, airportCode),
          );
        }
      }

      const results = await Promise.all(tasks.map((task) => task.catch(() => [])));
      const suggestions = results.flat();

      const seen = new Set<string>();
      const merged = sortSuggestionsByStreetNumber(
        suggestions.filter((item) => {
          const key = item.label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        }),
      );

      return json(
        {
          suggestions: merged.slice(0, 8),
          provider: env.GETADDRESS_API_KEY ? "getaddress+google" : "google",
        },
        200,
        origin,
      );
    } catch {
      return json({ error: "Address lookup failed" }, 502, origin);
    }
  },
};

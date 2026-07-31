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
import { sortSuggestionsByStreetNumber } from "../shared/address-validation";
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
  getSumUpCheckout,
  getSuccessfulTransactionCode,
  isSumUpCheckoutPaid,
  buildCheckoutReference,
  createSumUpHostedCheckout,
} from "../shared/sumup-checkout";

type Env = {
  GOOGLE_PLACES_API_KEY: string;
  GETADDRESS_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  BOOKING_COUNTER?: KVNamespace;
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
): "addresses" | "geocode" | "bookings" | "payments" | "payments-confirm" | null {
  if (pathname === "/addresses" || pathname === "/api/addresses") {
    return "addresses";
  }

  if (pathname === "/geocode" || pathname === "/api/geocode") {
    return "geocode";
  }

  if (pathname === "/bookings" || pathname === "/api/bookings") {
    return "bookings";
  }

  if (pathname === "/payments/confirm" || pathname === "/api/payments/confirm") {
    return "payments-confirm";
  }

  if (pathname === "/payments" || pathname === "/api/payments") {
    return "payments";
  }

  return null;
}

async function sendEmail(
  env: Env,
  options: {
    to: string;
    subject: string;
    body: string;
    toName?: string;
  },
): Promise<void> {
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
      content: [{ type: "text/plain", value: options.body }],
    }),
  });

  if (!response.ok) {
    throw new Error("Mailchannels request failed");
  }
}

async function sendBookingEmail(
  env: Env,
  customerName: string,
  message: string,
  bookingReference: string,
): Promise<void> {
  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

  await sendEmail(env, {
    to: toEmail,
    subject: `New booking ${bookingReference} — ${customerName}`,
    body: prependBookingReference(message, bookingReference),
  });
}

async function allocateBookingReference(env: Env): Promise<string> {
  if (!env.BOOKING_COUNTER) {
    throw new Error("Booking counter is not configured");
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
    passengers: Number(details.passengers) || 0,
    suitcases: Number(details.suitcases) || 0,
    vehicle: String(details.vehicle ?? "").trim(),
    journeyDistance: String(details.journeyDistance ?? "").trim() || undefined,
    journeyDuration: String(details.journeyDuration ?? "").trim() || undefined,
    isAirportTrip: Boolean(details.isAirportTrip),
  };
}

async function handleBookingRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: { customerName?: string; message?: string };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const customerName = body.customerName?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!customerName || !message) {
    return json({ error: "Missing required fields" }, 400, origin);
  }

  try {
    const bookingReference = await allocateBookingReference(env);
    await sendBookingEmail(env, customerName, message, bookingReference);
    return json({ ok: true, bookingReference }, 200, origin);
  } catch (error) {
    console.error("Booking submission failed", error);
    return json({ error: "Failed to send booking email" }, 502, origin);
  }
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
      body: customerEmail.body,
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

      if (env.GETADDRESS_API_KEY && airportCode !== "DUB") {
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

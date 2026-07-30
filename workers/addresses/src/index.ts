import {
  corsHeaders,
  resolveGooglePlace,
  reverseGeocodeGoogle,
  searchGooglePlaces,
  searchGoogleStreetAddresses,
  isStreetOnlyQuery,
} from "../../../shared/google-places";
import {
  resolveGetAddress,
  searchGetAddress,
} from "../../../shared/getaddress";
import {
  logBookingsToGoogleCalendar,
  type TourBookingEvent,
  type TransferBookingEvent,
} from "./google-calendar";

type Env = {
  GOOGLE_PLACES_API_KEY: string;
  GETADDRESS_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  /** Full Google service account JSON (Calendar API enabled). */
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  /** Calendar ID to write into (usually your Gmail address). */
  GOOGLE_CALENDAR_ID?: string;
};

type BookingRequestBody = {
  customerName?: string;
  message?: string;
  /** When false, skip MailChannels email (used by WhatsApp booking path). */
  sendEmail?: boolean;
  booking?: TransferBookingEvent;
  tour?: TourBookingEvent;
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function routePath(pathname: string): "addresses" | "geocode" | "bookings" | null {
  if (pathname === "/addresses" || pathname === "/api/addresses") {
    return "addresses";
  }

  if (pathname === "/geocode" || pathname === "/api/geocode") {
    return "geocode";
  }

  if (pathname === "/bookings" || pathname === "/api/bookings") {
    return "bookings";
  }

  return null;
}

async function sendBookingEmail(
  env: Env,
  customerName: string,
  message: string,
): Promise<void> {
  const toEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: {
        email: fromEmail,
        name: "My Airport Taxi NI Website",
      },
      subject: `New booking — ${customerName}`,
      content: [{ type: "text/plain", value: message }],
    }),
  });

  if (!response.ok) {
    throw new Error("Mailchannels request failed");
  }
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
  const sendEmail = body.sendEmail !== false;

  if (!customerName || !message) {
    return json({ error: "Missing required fields" }, 400, origin);
  }

  let emailSent = false;

  if (sendEmail) {
    try {
      await sendBookingEmail(env, customerName, message);
      emailSent = true;
    } catch {
      // Calendar-only requests can still succeed; email failures are fatal when required.
      const calendar = await logBookingCalendar(env, body, customerName, message);
      if (calendar.logged) {
        return json(
          {
            ok: true,
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

  if (!sendEmail && !calendar.logged && calendarConfigured(env) && calendar.error) {
    return json(
      { error: "Failed to log booking to Google Calendar", detail: calendar.error },
      502,
      origin,
    );
  }

  return json(
    {
      ok: true,
      emailSent,
      calendarLogged: calendar.logged,
      calendarEvents: calendar.events ?? 0,
    },
    200,
    origin,
  );
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

        if (isStreetOnlyQuery(query)) {
          tasks.push(
            searchGoogleStreetAddresses(env.GOOGLE_PLACES_API_KEY, query, airportCode),
          );
        }
      }

      const results = await Promise.all(tasks.map((task) => task.catch(() => [])));
      const suggestions = results.flat();

      const seen = new Set<string>();
      const merged = suggestions.filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

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

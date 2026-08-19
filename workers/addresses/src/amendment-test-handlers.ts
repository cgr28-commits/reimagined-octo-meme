/**
 * Owner-only same-fare Manage Booking amendment fixtures.
 *
 * Creates a fully-paid PaidBookingRecord with the real website quote amount
 * for Five Corners Guest Inn → Belfast International — WITHOUT any SumUp
 * checkout or fabricated live transaction.
 *
 * Isolated via isAmendmentTestFixture (excluded from Upcoming Jobs / recent
 * customer lists; cannot create live SumUp top-ups or refunds).
 */

import { formatPaidAmount } from "../shared/booking-notifications";
import { corsHeaders } from "../shared/google-places";
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { calculateAuthoritativeWebsiteQuote } from "../../../src/lib/quote-service";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  claimUniqueCustomerBookingReference,
  ensureManageBookingToken,
  listAmendmentTestPaidBookings,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";

export const AMENDMENT_TEST_PICKUP =
  "Five Corners Guest Inn, 249 Rashee Road, Ballyclare BT39 9JN";
export const AMENDMENT_TEST_DROPOFF =
  "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK";
export const AMENDMENT_TEST_TIME = "10:00";
export const AMENDMENT_TEST_EMAIL = "cgr28@hotmail.co.uk";

type AmendmentTestEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
};

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export function isAmendmentTestSeedPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amendment-test/seed" ||
    pathname === "/api/paid-bookings/amendment-test/seed"
  );
}

export function isAmendmentTestListPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/amendment-test/list" ||
    pathname === "/api/paid-bookings/amendment-test/list"
  );
}

function londonDatePlusWeekdayDays(minDaysAhead: number): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    weekday: "short",
  });

  for (let offset = Math.max(3, minDaysAhead); offset < 21; offset += 1) {
    const probe = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    const day = weekdayFmt.format(probe);
    if (day === "Sat" || day === "Sun") continue;
    return formatter.format(probe);
  }
  return formatter.format(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
}

function publicFixtureSummary(
  record: PaidBookingRecord,
  siteOrigin: string,
): Record<string, unknown> {
  const token = record.manageBookingToken?.trim() || "";
  return {
    isAmendmentTestFixture: true,
    customerReference: record.customerReference,
    paymentReference: record.paymentReference,
    customerEmail: record.customerEmail,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    amount: record.amount,
    amountPaidLabel: record.amountPaidLabel,
    paymentStatus: record.paymentStatus,
    status: record.status,
    freeAmendmentAvailable: (record.dateTimeAmendmentCount ?? 0) < 1,
    dateTimeAmendmentCount: record.dateTimeAmendmentCount ?? 0,
    manageBookingUrl: token ? buildManageBookingUrl(siteOrigin, token) : null,
    manageBookingTokenPresent: Boolean(token),
    warning:
      "PREVIEW/TEST FIXTURE — no live SumUp charge. Will not charge a card. Not a customer booking.",
  };
}

/**
 * Seed (or reset) a same-fare amendment fixture using the live pricing engine
 * for amount — paid amount is set equal to that fare (no SumUp).
 */
export async function handleAmendmentTestSeedRequest(
  request: Request,
  env: AmendmentTestEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Amendment Test requires OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const siteOrigin =
    String(body.manageBookingBaseUrl ?? body.siteOrigin ?? "").trim().replace(/\/$/, "") ||
    "https://www.myairporttaxini.co.uk";
  const customerEmail =
    String(body.customerEmail ?? "").trim().toLowerCase() || AMENDMENT_TEST_EMAIL;
  const tripDate =
    String(body.tripDate ?? "").trim() || londonDatePlusWeekdayDays(3);
  const tripTime = String(body.tripTime ?? "").trim() || AMENDMENT_TEST_TIME;
  const pickupLabel = String(body.pickupLabel ?? "").trim() || AMENDMENT_TEST_PICKUP;
  const dropoffLabel = String(body.dropoffLabel ?? "").trim() || AMENDMENT_TEST_DROPOFF;

  const quote = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: pickupLabel,
    dropoffAddress: dropoffLabel,
    returnJourney: false,
    outboundDate: tripDate,
    outboundTime: tripTime,
    passengers: 2,
    suitcases: 2,
  });

  if (!quote.ok) {
    return jsonResponse(
      {
        error:
          quote.message ||
          "Could not price the amendment test journey with the live pricing engine.",
      },
      422,
      origin,
    );
  }

  const amount = Math.round(Number(quote.amount) * 100) / 100;
  const paymentReference =
    `AMEND-TEST-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
  const checkoutId = `fixture-${paymentReference.toLowerCase()}`;
  const createdAt = new Date().toISOString();

  const customerReference = await claimUniqueCustomerBookingReference(
    env.TRACKING_STORE,
    paymentReference,
  );

  let record: PaidBookingRecord = {
    paymentReference,
    customerReference,
    checkoutId,
    // Intentionally no transactionId / transactionCode — not a SumUp payment.
    amount,
    currency: "GBP",
    amountPaidLabel: formatPaidAmount(amount, "GBP"),
    originalAmount: amount,
    amountRefunded: 0,
    customerName: "Amendment Test (Preview)",
    customerEmail,
    mobileNumber: "07700900123",
    tripLabel: `[AMENDMENT TEST] Five Corners Guest Inn → Belfast International`,
    pickupLabel,
    dropoffLabel,
    returnJourney: false,
    tripDate,
    tripTime,
    flightNumber: "EZY8901",
    passengers: 2,
    suitcases: 2,
    childSeats: 0,
    vehicle: quote.vehicleType || "Standard Saloon (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    isFromAirport: false,
    dateTimeAmendmentCount: 0,
    dateTimeAmendmentHistory: [],
    amendmentHistory: [],
    pendingAmendment: null,
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt,
    isAmendmentTestFixture: true,
  };

  await savePaidBookingRecord(env.TRACKING_STORE, record);
  record = await ensureManageBookingToken(env.TRACKING_STORE, record);

  return jsonResponse(
    {
      ok: true,
      fixture: publicFixtureSummary(record, siteOrigin),
      quote: {
        amount,
        amountLabel: quote.amountLabel,
        source: quote.source,
        premiumApplied: quote.premiumApplied,
      },
    },
    200,
    origin,
  );
}

export async function handleAmendmentTestListRequest(
  request: Request,
  env: AmendmentTestEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — Amendment Test requires OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }
  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const siteOrigin =
    new URL(request.url).searchParams.get("siteOrigin")?.trim().replace(/\/$/, "") ||
    "https://www.myairporttaxini.co.uk";

  const bookings = await listAmendmentTestPaidBookings(env.TRACKING_STORE, { limit: 20 });
  const withTokens = [];
  for (const booking of bookings) {
    const ensured = await ensureManageBookingToken(env.TRACKING_STORE, booking);
    withTokens.push(publicFixtureSummary(ensured, siteOrigin));
  }

  return jsonResponse(
    {
      ok: true,
      warning:
        "PREVIEW/TEST FIXTURES — no live SumUp charges. Not customer bookings.",
      fixtures: withTokens,
    },
    200,
    origin,
  );
}

import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  type PaidBookingDetails,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  getPaidBookingRecord,
  listRecentPaidBookings,
  paidBookingStoreConfigured,
} from "./paid-booking-store";
import { getPendingCheckout, pendingCheckoutStoreConfigured } from "./pending-checkout-store";
import {
  trySendBrandedCustomerEmail,
  trySendOwnerOperationalEmail,
  type WorkerEmailEnv,
} from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
  };

const BUSINESS_NAME = "My Airport Taxi NI";

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function recordToDetails(record: PaidBookingRecord, booking?: PaidBookingDetails): PaidBookingDetails {
  if (booking?.customerEmail) {
    return booking;
  }

  return {
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber,
    tripLabel: record.tripLabel,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    returnJourney: record.returnJourney,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    returnDate: record.returnDate ?? "",
    returnTime: record.returnTime ?? "",
    flightNumber: record.flightNumber ?? "",
    returnFlightNumber: record.returnFlightNumber ?? "",
    passengers: record.passengers ?? 1,
    suitcases: record.suitcases ?? 0,
    vehicle: record.vehicle ?? "Saloon",
    journeyDistance: record.journeyDistance,
    journeyDuration: record.journeyDuration,
    isAirportTrip:
      record.isAirportTrip ??
      /airport/i.test(`${record.tripLabel} ${record.pickupLabel} ${record.dropoffLabel}`),
    airportCode: record.airportCode,
    isFromAirport: record.isFromAirport,
    termsAcceptedAt: record.termsAcceptedAt,
    termsVersion: record.termsVersion,
  };
}

function recordToReceipt(
  record: PaidBookingRecord,
  booking?: PaidBookingDetails,
): PaidBookingReceipt {
  return {
    ...recordToDetails(record, booking),
    amountPaid: record.amountPaidLabel,
    paymentReference: record.paymentReference,
    transactionCode: record.transactionCode,
  };
}

async function loadBookingDetails(
  env: Env,
  record: PaidBookingRecord,
): Promise<PaidBookingDetails | undefined> {
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE) || !record.checkoutId?.trim()) {
    return undefined;
  }
  const pending = await getPendingCheckout(env.TRACKING_STORE, record.checkoutId);
  return pending?.booking;
}

export async function handlePaidBookingsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to list paid bookings." },
      401,
      origin,
    );
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Booking store is not configured." }, 503, origin);
  }

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "14");
  const limit = Number(url.searchParams.get("limit") || "50");
  const bookings = await listRecentPaidBookings(env.TRACKING_STORE, { days, limit });

  return jsonResponse(
    {
      ok: true,
      count: bookings.length,
      bookings: bookings.map((booking) => ({
        paymentReference: booking.paymentReference,
        checkoutId: booking.checkoutId,
        createdAt: booking.createdAt,
        status: booking.status,
        amountPaid: booking.amountPaidLabel,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        mobileNumber: booking.mobileNumber,
        tripLabel: booking.tripLabel,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnJourney: booking.returnJourney,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
      })),
    },
    200,
    origin,
  );
}

export async function handlePaidBookingResendRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(
      { error: "Unauthorized — use OWNER_ACCESS_KEY to resend confirmations." },
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

  const paymentReference = String(body.paymentReference ?? "").trim();
  const latest = Boolean(body.latest);

  let record: PaidBookingRecord | null = null;
  if (paymentReference) {
    record = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  } else if (latest) {
    const recent = await listRecentPaidBookings(env.TRACKING_STORE, { days: 14, limit: 1 });
    record = recent[0] ?? null;
  }

  if (!record) {
    return jsonResponse(
      {
        error: paymentReference
          ? `No paid booking found for ${paymentReference}`
          : "No recent paid booking found to resend.",
      },
      404,
      origin,
    );
  }

  if (record.status === "refunded") {
    return jsonResponse({ error: "That booking was refunded — confirmation not resent." }, 400, origin);
  }

  const bookingDetails = await loadBookingDetails(env, record);
  const receipt = recordToReceipt(record, bookingDetails);
  const customerEmail = buildCustomerConfirmationEmail(receipt, BUSINESS_NAME);
  const ownerEmail = buildOwnerPaidBookingEmail(receipt, BUSINESS_NAME);

  const customerEmailResult = await trySendBrandedCustomerEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const bookingsInbox =
    env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk";

  const ownerCopyResult = await trySendBrandedCustomerEmail(env, {
    to: bookingsInbox,
    toName: "Bookings",
    subject: `[Bookings copy] ${customerEmail.subject}`,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const ownerEmailResult = await trySendOwnerOperationalEmail(env, {
    to: bookingsInbox,
    subject: `[Resent] ${ownerEmail.subject}`,
    body: `${ownerEmail.body}\n\n(This is a manual resend of the paid booking confirmation.)`,
  });
  const ownerNotifySent = ownerCopyResult.sent || ownerEmailResult.sent;

  return jsonResponse(
    {
      ok: customerEmailResult.sent,
      paymentReference: record.paymentReference,
      customerEmail: record.customerEmail,
      customerEmailSent: customerEmailResult.sent,
      customerEmailProvider: customerEmailResult.provider,
      customerEmailError: customerEmailResult.error,
      ownerEmailSent: ownerNotifySent,
      ownerEmailProvider: ownerCopyResult.provider || ownerEmailResult.provider,
      ownerEmailError: ownerNotifySent
        ? undefined
        : ownerCopyResult.error || ownerEmailResult.error,
      bookingsCopySent: ownerCopyResult.sent,
      tripLabel: record.tripLabel,
      amountPaid: record.amountPaidLabel,
      createdAt: record.createdAt,
    },
    customerEmailResult.sent ? 200 : 502,
    origin,
  );
}

export function isPaidBookingsListPath(pathname: string): boolean {
  return pathname === "/paid-bookings" || pathname === "/api/paid-bookings";
}

export function isPaidBookingResendPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/resend-confirmation" ||
    pathname === "/api/paid-bookings/resend-confirmation"
  );
}

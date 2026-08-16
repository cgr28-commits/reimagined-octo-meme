import {
  isValidPassengerCount,
  PASSENGER_LIMIT_ERROR,
} from "../shared/passenger-limits";
import {
  buildQuoteLeadMessage,
  buildQuoteLeadSubject,
  type QuoteLeadDetails,
} from "../shared/quote-lead";
import {
  corsHeaders,
  extractLeadingStreetNumber,
  geocodeAddress,
  isNumberedAddressQuery,
  isStreetOnlyQuery,
  resolveGooglePlaceDetails,
  reverseGeocodeGoogle,
  searchGoogleEstablishments,
  searchGooglePlaces,
  searchGooglePostcodeAddresses,
  searchGooglePostcodePremises,
  searchGoogleStreetAddresses,
} from "../shared/google-places";
import {
  extractNorthernIrelandPostcode,
  extractPremisePrefixFromPostcodeQuery,
  isAllowedAutocompleteLabel,
  isFullNorthernIrelandPostcode,
  isPureFullNorthernIrelandPostcodeQuery,
  sortSuggestionsByStreetNumber,
} from "../shared/address-validation";
import {
  resolveGetAddressDetails,
  searchGetAddress,
  shouldUseGetAddress,
} from "../shared/getaddress";
import {
  isIdealPostcodesPlaceId,
  resolveIdealPostcodesDetails,
  searchIdealPostcodes,
  shouldUseIdealPostcodes,
} from "../shared/ideal-postcodes";
import {
  formatBookingReference,
  prependBookingReference,
  STARTING_BOOKING_REF,
} from "../shared/booking-reference";
import {
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import {
  lookupFlight,
  type TripDirection,
} from "../shared/flight-lookup";
import {
  buildCheckoutReference,
  createSumUpHostedCheckout,
} from "../shared/sumup-checkout";
import {
  getGoogleAccessToken,
  logBookingsToGoogleCalendar,
  parseServiceAccountJson,
  type TourBookingEvent,
  type TransferBookingEvent,
} from "./google-calendar";
import {
  createBookingJobFromSubmission,
  handleBookingJobAssignDriverRequest,
  handleBookingJobMarkPaidRequest,
  handleBookingJobsListRequest,
  handleDriverAcceptConfirmRequest,
  handleDriverAcceptLookupRequest,
} from "./booking-job-handlers";
import { bookingJobStoreConfigured } from "./booking-job-store";
import {
  handleCustomerLocationRequest,
  handleCustomerSharingRequest,
  handleDriverJobsRequest,
  handleDriverLocationRequest,
  handleDriverLocationHistoryRequest,
  handleDriverSharingRequest,
  handleDriverStatusRequest,
  handlePublicTrackRequest,
  parseTrackSubRoute,
  parseTrackTokenFromPath,
} from "./tracking-handlers";
import { processDueReviewRequests } from "./review-request-handlers";
import { handleDriverUpdateBookingRequest } from "./driver-booking-handlers";
import {
  handleDriverAssignRequest,
  handleDriverDeassignRequest,
  handleDriverAssignmentResponseRequest,
  handleDriverRosterRequest,
} from "./driver-assignment-handlers";
import {
  handleDriverVehicleGetRequest,
  handleDriverVehicleProfilesRequest,
  handleDriverVehicleSaveRequest,
} from "./driver-vehicle-handlers";
import {
  handleRefundRequest,
} from "./refund-handlers";
import {
  extractCheckoutIdFromWebhookPayload,
  finalizePaidCheckout,
  resolveBookingForCheckout,
} from "./finalize-paid-checkout";
import {
  pendingCheckoutStoreConfigured,
  savePendingCheckout,
} from "./pending-checkout-store";
import {
  sendEmail,
  trySendEmail,
  type EmailPayload,
} from "./worker-email";
import {
  handleMarketingOptInRequest,
  handleMarketingUnsubscribeRequest,
  maybeRecordMarketingFromPayload,
} from "./marketing-handlers";
import {
  handleTestDriverDetailEmails,
  isTestDriverDetailEmailsPath,
} from "./test-email-handlers";
import { CONTACT_VCARD } from "../shared/contact-vcard";
import {
  handleQuoteStatsRequest,
  recordQuoteLeadDeduped,
  recordQuoteLeadSent,
} from "./quote-stats";

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
  IDEAL_POSTCODES_API_KEY?: string;
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
  TRACKING_STORE?: KVNamespace;
  DRIVER_ACCESS_KEY?: string;
  GOOGLE_REVIEW_URL?: string;
  OWNER_ACCESS_KEY?: string;
};

type QuoteLeadRequestBody = QuoteLeadDetails & {
  fingerprint?: string;
  /** When true, only record stats/dedupe — email already sent from the browser. */
  skipEmail?: boolean;
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
function ownerInbox(_env?: { BOOKING_TO_EMAIL?: string }): string {
  return DEFAULT_BOOKING_EMAIL;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function parseDriverRoute(
  pathname: string,
): "jobs" | "sharing" | "location" | "location-history" | "bookings-update" | "status" | "assign" | "deassign" | "assignment-response" | "roster" | "vehicle" | "vehicle-profiles" | null {
  if (pathname === "/driver/jobs" || pathname === "/api/driver/jobs") {
    return "jobs";
  }

  if (pathname === "/driver/status" || pathname === "/api/driver/status") {
    return "status";
  }

  if (pathname === "/driver/roster" || pathname === "/api/driver/roster") {
    return "roster";
  }

  if (pathname === "/driver/vehicle/profiles" || pathname === "/api/driver/vehicle/profiles") {
    return "vehicle-profiles";
  }

  if (pathname === "/driver/vehicle" || pathname === "/api/driver/vehicle") {
    return "vehicle";
  }

  if (pathname === "/driver/bookings/update" || pathname === "/api/driver/bookings/update") {
    return "bookings-update";
  }

  if (pathname === "/driver/assign" || pathname === "/api/driver/assign") {
    return "assign";
  }

  if (pathname === "/driver/deassign" || pathname === "/api/driver/deassign") {
    return "deassign";
  }

  if (pathname === "/driver/assignment" || pathname === "/api/driver/assignment") {
    return "assignment-response";
  }

  if (pathname === "/driver/sharing" || pathname === "/api/driver/sharing") {
    return "sharing";
  }

  if (pathname === "/driver/location" || pathname === "/api/driver/location") {
    return "location";
  }

  if (pathname === "/driver/location-history" || pathname === "/api/driver/location-history") {
    return "location-history";
  }

  return null;
}

function handleContactVCardRequest(request: Request, origin: string | null): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const forceDownload =
    url.searchParams.get("download") === "1" || url.searchParams.get("dl") === "1";
  const ua = request.headers.get("User-Agent") || "";
  // Chrome (CriOS) + Google Search app (GSA) prefer / also accept text/x-vcard.
  const preferXVcard =
    url.searchParams.get("mime") === "x-vcard" ||
    /CriOS|GSA\//i.test(ua);

  const headers = new Headers(corsHeaders(origin));
  // iPhone Safari: text/vcard (no Content-Disposition) opens Create New Contact.
  // Chrome for iPhone also accepts text/vcard; text/x-vcard helps older CriOS builds.
  // Forcing a file download (octet-stream + attachment) keeps the logo from Files.
  // Do not send Content-Disposition for the inline case — even "inline; filename="
  // makes many phones show a file preview / download instead of Create New Contact.
  if (forceDownload) {
    headers.set("Content-Type", "application/octet-stream");
    headers.set(
      "Content-Disposition",
      'attachment; filename="My-Airport-Taxi-NI.vcf"',
    );
  } else if (preferXVcard) {
    headers.set("Content-Type", "text/x-vcard; charset=utf-8");
  } else {
    headers.set("Content-Type", "text/vcard; charset=utf-8");
  }
  headers.set("Cache-Control", "public, max-age=60");
  headers.set("Content-Length", String(new TextEncoder().encode(CONTACT_VCARD).length));

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(CONTACT_VCARD, { status: 200, headers });
}

function routePath(
  pathname: string,
):
  | "addresses"
  | "geocode"
  | "bookings"
  | "quote-leads"
  | "quote-stats"
  | "payments"
  | "payments-confirm"
  | "payments-webhook"
  | "bookings-refund"
  | "booking-jobs"
  | "booking-jobs-mark-paid"
  | "booking-jobs-assign-driver"
  | "driver-accept"
  | "driver-accept-confirm"
  | "flights"
  | "calendar-status"
  | "marketing-opt-in"
  | "marketing-unsubscribe"
  | null {
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

  if (pathname === "/quote-stats" || pathname === "/api/quote-stats") {
    return "quote-stats";
  }

  if (pathname === "/payments/confirm" || pathname === "/api/payments/confirm") {
    return "payments-confirm";
  }

  if (pathname === "/payments/webhook" || pathname === "/api/payments/webhook") {
    return "payments-webhook";
  }

  if (pathname === "/payments" || pathname === "/api/payments") {
    return "payments";
  }

  if (pathname === "/bookings/refund" || pathname === "/api/bookings/refund") {
    return "bookings-refund";
  }

  if (pathname === "/booking-jobs/mark-paid" || pathname === "/api/booking-jobs/mark-paid") {
    return "booking-jobs-mark-paid";
  }

  if (
    pathname === "/booking-jobs/assign-driver" ||
    pathname === "/api/booking-jobs/assign-driver"
  ) {
    return "booking-jobs-assign-driver";
  }

  if (pathname === "/booking-jobs" || pathname === "/api/booking-jobs") {
    return "booking-jobs";
  }

  if (pathname === "/driver-accept/confirm" || pathname === "/api/driver-accept/confirm") {
    return "driver-accept-confirm";
  }

  if (pathname === "/driver-accept" || pathname === "/api/driver-accept") {
    return "driver-accept";
  }

  if (pathname === "/flights" || pathname === "/api/flights") {
    return "flights";
  }

  if (pathname === "/calendar-status" || pathname === "/api/calendar-status") {
    return "calendar-status";
  }

  if (pathname === "/marketing/opt-in" || pathname === "/api/marketing/opt-in") {
    return "marketing-opt-in";
  }

  if (pathname === "/marketing/unsubscribe" || pathname === "/api/marketing/unsubscribe") {
    return "marketing-unsubscribe";
  }

  return null;
}

async function sendBookingEmail(
  env: Env,
  customerName: string,
  message: string,
  bookingReference: string | null,
): Promise<void> {
  const toEmail = ownerInbox(env);
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
): Promise<{ logged: boolean; events?: number; eventIds?: string[]; error?: string }> {
  if (!calendarConfigured(env)) {
    return { logged: false };
  }

  try {
    const eventIds = await logBookingsToGoogleCalendar({
      serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
      calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
      customerName,
      message,
      booking: body.booking ?? null,
      tour: body.tour ?? null,
    });
    return { logged: true, events: eventIds.length, eventIds };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    console.error("Google Calendar booking log failed", detail);
    return { logged: false, error: detail };
  }
}

async function logPaidBookingCalendar(
  env: Env,
  booking: PaidBookingDetails,
  amountPaid: string,
  paymentReference: string,
): Promise<{ logged: boolean; events?: number; eventIds?: string[]; error?: string }> {
  if (!calendarConfigured(env)) {
    return { logged: false, eventIds: [] };
  }

  try {
    const eventIds = await logBookingsToGoogleCalendar({
      serviceAccountJson: env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
      calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
      customerName: booking.customerName,
      message: "",
      booking: {
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        mobileNumber: booking.mobileNumber,
        tripLabel: booking.tripLabel,
        pickupLabel: booking.pickupLabel,
        dropoffLabel: booking.dropoffLabel,
        returnJourney: booking.returnJourney,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        flightNumber: booking.flightNumber,
        returnFlightNumber: booking.returnFlightNumber,
        passengers: booking.passengers,
        suitcases: booking.suitcases,
        vehicle: booking.vehicle,
        estimatedPrice: amountPaid,
        isAirportTrip: booking.isAirportTrip,
        amountPaid,
        paymentReference,
        paid: true,
      },
    });
    return { logged: true, events: eventIds.length, eventIds };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    console.error("Google Calendar paid booking log failed", detail);
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
  const mobileNumber = String(details.mobileNumber ?? "").trim();

  if (!customerName || !customerEmail || !mobileNumber) {
    return null;
  }

  const passengers = Number(details.passengers);
  if (!isValidPassengerCount(passengers)) {
    return null;
  }

  return {
    customerName,
    customerEmail,
    mobileNumber,
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
    passengers,
    suitcases: Number(details.suitcases) || 0,
    vehicle: String(details.vehicle ?? "").trim(),
    journeyDistance: String(details.journeyDistance ?? "").trim() || undefined,
    journeyDuration: String(details.journeyDuration ?? "").trim() || undefined,
    isAirportTrip: Boolean(details.isAirportTrip),
    airportCode: String(details.airportCode ?? "").trim().toUpperCase() || undefined,
    isFromAirport: details.isFromAirport === undefined ? undefined : Boolean(details.isFromAirport),
    termsAcceptedAt: String(details.termsAcceptedAt ?? "").trim() || undefined,
    termsVersion: String(details.termsVersion ?? "").trim() || undefined,
    marketingOptIn: details.marketingOptIn === true ? true : undefined,
    marketingOptInAt: String(details.marketingOptInAt ?? "").trim() || undefined,
    marketingConsentVersion: String(details.marketingConsentVersion ?? "").trim() || undefined,
  };
}

/** Keep name + email + mobile visible on the SumUp payment itself (140 char limit). */
function buildSumUpCheckoutDescription(
  baseDescription: string,
  booking: PaidBookingDetails,
): string {
  const contact = `${booking.customerName} · ${booking.mobileNumber} · ${booking.customerEmail}`;
  const combined = `${baseDescription} — ${contact}`.replace(/\s+/g, " ").trim();
  return combined.slice(0, 140);
}

async function isDuplicateQuoteLead(
  fingerprint: string,
  env: Env,
): Promise<boolean> {
  // Prefer KV so dedupe works across colo edges (Cache API often missed).
  if (env.BOOKING_COUNTER) {
    const key = `quote_lead_fp:${fingerprint}`;
    const existing = await env.BOOKING_COUNTER.get(key);
    if (existing) {
      return true;
    }
    await env.BOOKING_COUNTER.put(key, "1", { expirationTtl: 60 * 60 });
    return false;
  }

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

  if (!tripLabel || !pickupLabel || !dropoffLabel || !vehicle || !estimatedPrice) {
    return null;
  }

  const passengers = Number(body.passengers);
  const suitcases = Number(body.suitcases);

  if (!Number.isFinite(passengers) || passengers < 1 || !Number.isFinite(suitcases) || suitcases < 0) {
    return null;
  }
  if (!isValidPassengerCount(passengers)) {
    return null;
  }

  return {
    tripLabel,
    pickupLabel,
    dropoffLabel,
    returnJourney: Boolean(body.returnJourney),
    tripDate: tripDate || undefined,
    tripTime: tripTime || undefined,
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

  if (await isDuplicateQuoteLead(fingerprint, env)) {
    try {
      await recordQuoteLeadDeduped(env);
    } catch (error) {
      console.error("Quote lead dedupe counter failed", error);
    }
    return json({ ok: true, emailed: false, deduplicated: true }, 200, origin);
  }

  const skipEmail = body.skipEmail === true;

  if (!skipEmail) {
    const toEmail = ownerInbox(env);

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
  }

  let quoteLeadsTotal: number | null = null;
  try {
    quoteLeadsTotal = await recordQuoteLeadSent(env);
  } catch (error) {
    console.error("Quote lead counter failed", error);
  }

  return json(
    {
      ok: true,
      emailed: !skipEmail,
      recorded: true,
      ...(quoteLeadsTotal !== null ? { quoteLeadsTotal } : {}),
    },
    200,
    origin,
  );
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

  if (body.booking) {
    const passengers = Number((body.booking as { passengers?: unknown }).passengers);
    if (!isValidPassengerCount(passengers)) {
      return json({ error: PASSENGER_LIMIT_ERROR }, 400, origin);
    }
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
      // Keep 502 so the live site falls through to browser FormSubmit/Web3Forms
      // (customer IP), which is how email kept working when the worker path failed.
      console.error("Booking email failed", error);
      const detail = error instanceof Error ? error.message : "Unknown email error";
      return json(
        {
          error: "Failed to send booking email",
          detail,
          web3formsConfigured: Boolean(env.WEB3FORMS_ACCESS_KEY?.trim()),
        },
        502,
        origin,
      );
    }
  }

  // Calendar is created only after the owner marks the booking as paid.
  let bookingJobId: string | undefined;
  if (
    bookingReference &&
    body.booking &&
    bookingJobStoreConfigured(env.TRACKING_STORE)
  ) {
    try {
      const kind =
        typeof body.booking.estimatedPrice === "string" && body.booking.estimatedPrice.trim()
          ? "booking-request"
          : "vehicle-enquiry";
      // Prefer vehicle-enquiry when executive/minibus style messages are used
      const enquiryKind =
        /enquire about booking|enquiry only|Please send me a quote/i.test(message)
          ? "vehicle-enquiry"
          : kind;
      const job = await createBookingJobFromSubmission(env.TRACKING_STORE, {
        bookingReference,
        kind: enquiryKind,
        booking: body.booking as unknown as Record<string, unknown>,
        message,
      });
      bookingJobId = job?.id;
    } catch (error) {
      console.error("Failed to create booking job", error);
    }
  }

  await maybeRecordMarketingFromPayload(env.TRACKING_STORE, {
    email: body.booking?.customerEmail ?? body.tour?.customerEmail,
    name: customerName,
    source: body.tour ? "tour-enquiry" : "booking-request",
    marketingOptIn:
      body.booking?.marketingOptIn === true || body.tour?.marketingOptIn === true,
    marketingOptInAt: body.booking?.marketingOptInAt ?? body.tour?.marketingOptInAt,
    marketingConsentVersion:
      body.booking?.marketingConsentVersion ?? body.tour?.marketingConsentVersion,
  });

  return json(
    {
      ok: true,
      bookingReference: bookingReference ?? undefined,
      bookingJobId,
      emailSent,
      calendarLogged: false,
      calendarEvents: 0,
    },
    200,
    origin,
  );
}

async function handleCalendarStatusRequest(
  env: Env,
  origin: string | null,
): Promise<Response> {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim() ?? "";
  const serviceAccountJson = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() ?? "";

  if (!calendarId || !serviceAccountJson) {
    return json(
      {
        connected: false,
        configured: false,
        calendarId: calendarId || null,
        reason: "missing_secrets",
        message:
          "Google Calendar secrets are not set on the worker. Add GOOGLE_CALENDAR_ID and GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON.",
      },
      200,
      origin,
    );
  }

  try {
    const serviceAccount = parseServiceAccountJson(serviceAccountJson);
    await getGoogleAccessToken(serviceAccount);

    return json(
      {
        connected: true,
        configured: true,
        calendarId,
        serviceAccountEmail: serviceAccount.client_email,
        message: `Calendar API authentication succeeded for ${calendarId}.`,
      },
      200,
      origin,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown calendar error";
    const trimmed = serviceAccountJson.trim();
    return json(
      {
        connected: false,
        configured: true,
        calendarId,
        reason: "auth_failed",
        detail,
        secretLength: trimmed.length,
        secretStartsWithBrace: trimmed.startsWith("{"),
        secretContainsClientEmail: trimmed.includes("client_email"),
        secretContainsPrivateKey: trimmed.includes("private_key"),
        message:
          "Calendar secrets are set but authentication failed. Check the service account JSON key.",
      },
      200,
      origin,
    );
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

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const amount = Number(body.amount);
  const description = String(body.description ?? "").trim();
  const redirectUrl = String(body.redirectUrl ?? "").trim();
  const booking = parsePaidBookingDetails(body);

  if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
    return json({ error: "Invalid payment amount" }, 400, origin);
  }

  if (!description) {
    return json({ error: "Missing payment description" }, 400, origin);
  }

  if (!redirectUrl) {
    return json({ error: "Missing redirect URL" }, 400, origin);
  }

  if (!booking) {
    return json(
      {
        error:
          "Missing customer booking details. Email and mobile are required before starting SumUp payment.",
      },
      400,
      origin,
    );
  }

  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return json(
      { error: "Booking store is not configured — cannot start a paid checkout safely" },
      503,
      origin,
    );
  }

  try {
    const checkoutReference =
      String(body.checkoutReference ?? "").trim() || buildCheckoutReference();
    const returnUrl = new URL("/payments/webhook", request.url).toString();
    const sumUpDescription = buildSumUpCheckoutDescription(description, booking);
    const checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: Math.round(amount * 100) / 100,
      description: sumUpDescription,
      checkoutReference,
      redirectUrl,
      returnUrl,
    });

    await savePendingCheckout(env.TRACKING_STORE, {
      checkoutId: checkout.checkoutId,
      checkoutReference: checkout.checkoutReference,
      amount: Math.round(amount * 100) / 100,
      booking,
      createdAt: new Date().toISOString(),
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

/**
 * SumUp server-to-server callback (return_url).
 * Finalises using server-stored customer email/mobile so the owner is notified
 * even if the customer never returns to /booking-confirmed/.
 */
async function handlePaymentWebhookRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let payload: unknown = null;
  try {
    payload = await request.json().catch(() => null);
    console.log("SumUp payment webhook", payload);
  } catch {
    // Ignore malformed bodies — still acknowledge so SumUp does not retry/timeout.
  }

  const checkoutId = extractCheckoutIdFromWebhookPayload(payload);
  if (checkoutId && pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    try {
      const booking = await resolveBookingForCheckout(env, checkoutId, null);
      if (booking) {
        const result = await finalizePaidCheckout({
          env,
          checkoutId,
          booking,
          logPaidBookingCalendar,
        });
        if (!result.ok && result.error && !result.error.includes("not been completed")) {
          console.error("SumUp webhook finalize failed", result.error);
        }
      }
    } catch (error) {
      console.error("SumUp webhook finalize threw", error);
    }
  }

  return json({ ok: true }, 200, origin);
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
  const clientBooking = parsePaidBookingDetails(body);
  const booking = checkoutId
    ? await resolveBookingForCheckout(env, checkoutId, clientBooking)
    : clientBooking;

  if (!checkoutId || !booking) {
    return json(
      {
        error:
          "Missing checkout or booking details (customer email and mobile are required).",
      },
      400,
      origin,
    );
  }

  try {
    const result = await finalizePaidCheckout({
      env,
      checkoutId,
      booking,
      logPaidBookingCalendar,
    });

    if (!result.ok) {
      const status = result.error?.includes("not been completed") ? 402 : 502;
      return json(
        {
          error: result.error || "Could not confirm payment",
        },
        status,
        origin,
      );
    }

    return json(
      {
        ok: true,
        paid: true,
        amountPaid: result.amountPaid,
        paymentReference: result.paymentReference,
        emailSent: result.emailSent,
        customerEmailSent: result.customerEmailSent,
        ownerEmailSent: result.ownerEmailSent,
        ...(result.emailWarning ? { emailWarning: result.emailWarning } : {}),
        calendarLogged: result.calendarLogged,
        calendarEvents: result.calendarEvents,
        ...(result.calendarWarning ? { calendarWarning: result.calendarWarning } : {}),
        trackingCreated: result.trackingCreated,
        ...(result.trackUrl ? { trackUrl: result.trackUrl } : {}),
        ...(result.alreadyFinalized ? { alreadyFinalized: true } : {}),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Payment confirmation failed", error);
    const detail = error instanceof Error ? error.message : "Unknown payment confirmation error";
    return json(
      {
        error: "Could not confirm payment",
        detail,
      },
      502,
      origin,
    );
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

    if (
      (url.pathname === "/contact.vcf" || url.pathname === "/api/contact.vcf") &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return handleContactVCardRequest(request, origin);
    }

    const trackSubRoute = parseTrackSubRoute(url.pathname);
    if (trackSubRoute === "sharing" && request.method === "POST") {
      return handleCustomerSharingRequest(request, env, origin);
    }

    if (trackSubRoute === "location" && request.method === "POST") {
      return handleCustomerLocationRequest(request, env, origin);
    }

    if (isTestDriverDetailEmailsPath(url.pathname) && request.method === "POST") {
      return handleTestDriverDetailEmails(request, env, origin);
    }

    const trackToken = parseTrackTokenFromPath(url.pathname);
    if (trackToken && request.method === "GET") {
      return handlePublicTrackRequest(trackToken, env, origin);
    }

    const driverRoute = parseDriverRoute(url.pathname);
    if (driverRoute === "jobs" && request.method === "GET") {
      return handleDriverJobsRequest(request, env, origin);
    }

    if (driverRoute === "status" && request.method === "GET") {
      return handleDriverStatusRequest(request, env, origin);
    }

    if (driverRoute === "bookings-update" && request.method === "POST") {
      return handleDriverUpdateBookingRequest(request, env, origin);
    }

    if (driverRoute === "assign" && request.method === "POST") {
      return handleDriverAssignRequest(request, env, origin);
    }

    if (driverRoute === "deassign" && request.method === "POST") {
      return handleDriverDeassignRequest(request, env, origin);
    }

    if (driverRoute === "assignment-response" && request.method === "POST") {
      return handleDriverAssignmentResponseRequest(request, env, origin);
    }

    if (driverRoute === "roster" && request.method === "GET") {
      return handleDriverRosterRequest(request, env, origin);
    }

    if (driverRoute === "vehicle-profiles" && request.method === "GET") {
      return handleDriverVehicleProfilesRequest(request, env, origin);
    }

    if (driverRoute === "vehicle" && request.method === "GET") {
      return handleDriverVehicleGetRequest(request, env, origin);
    }

    if (driverRoute === "vehicle" && request.method === "POST") {
      return handleDriverVehicleSaveRequest(request, env, origin);
    }

    if (driverRoute === "sharing" && request.method === "POST") {
      return handleDriverSharingRequest(request, env, origin);
    }

    if (driverRoute === "location" && request.method === "POST") {
      return handleDriverLocationRequest(request, env, origin);
    }

    if (driverRoute === "location-history" && request.method === "GET") {
      return handleDriverLocationHistoryRequest(request, env, origin);
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

    if (route === "bookings-refund") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleRefundRequest(request, env, origin);
    }

    if (route === "booking-jobs") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }
      return handleBookingJobsListRequest(request, env, origin);
    }

    if (route === "booking-jobs-mark-paid") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }
      return handleBookingJobMarkPaidRequest(request, env, origin);
    }

    if (route === "booking-jobs-assign-driver") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }
      return handleBookingJobAssignDriverRequest(request, env, origin);
    }

    if (route === "driver-accept") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }
      return handleDriverAcceptLookupRequest(request, env, origin);
    }

    if (route === "driver-accept-confirm") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }
      return handleDriverAcceptConfirmRequest(request, env, origin);
    }

    if (route === "quote-leads") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleQuoteLeadRequest(request, env, origin);
    }

    if (route === "quote-stats") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleQuoteStatsRequest(request, env, origin);
    }

    if (route === "payments") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handlePaymentRequest(request, env, origin);
    }

    if (route === "payments-webhook") {
      if (request.method !== "POST" && request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handlePaymentWebhookRequest(request, env, origin);
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

    if (route === "calendar-status") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleCalendarStatusRequest(env, origin);
    }

    if (route === "marketing-opt-in") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleMarketingOptInRequest(request, env, origin);
    }

    if (route === "marketing-unsubscribe") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, origin);
      }

      return handleMarketingUnsubscribeRequest(request, env, origin);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    if (!env.GOOGLE_PLACES_API_KEY && !env.GETADDRESS_API_KEY && !env.IDEAL_POSTCODES_API_KEY) {
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
        const userInput = url.searchParams.get("userInput")?.trim() || undefined;

        if (isIdealPostcodesPlaceId(id)) {
          const details = await resolveIdealPostcodesDetails(id, airportCode);
          if (!details) {
            return json({ error: "Address not found" }, 404, origin);
          }

          let lat = details.lat;
          let lng = details.lng;
          if ((lat == null || lng == null) && env.GOOGLE_PLACES_API_KEY) {
            const coords = await geocodeAddress(env.GOOGLE_PLACES_API_KEY, details.formattedAddress);
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
            }
          }

          return json(
            {
              address: details.formattedAddress,
              placeId: details.placeId,
              lat,
              lng,
              countryCode: details.countryCode,
              postalCode: details.postalCode,
              streetNumber: details.streetNumber,
              route: details.route,
              locality: details.locality,
              provider: "ideal-postcodes",
            },
            200,
            origin,
          );
        }

        if (id.startsWith("ga:") && env.GETADDRESS_API_KEY) {
          const details = await resolveGetAddressDetails(
            env.GETADDRESS_API_KEY,
            id,
            airportCode,
          );
          if (!details) {
            return json({ error: "Address not found" }, 404, origin);
          }

          let lat = details.lat;
          let lng = details.lng;
          if ((lat == null || lng == null) && env.GOOGLE_PLACES_API_KEY) {
            const coords = await geocodeAddress(env.GOOGLE_PLACES_API_KEY, details.formattedAddress);
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
            }
          }

          return json(
            {
              address: details.formattedAddress,
              placeId: details.placeId,
              lat,
              lng,
              countryCode: details.countryCode,
              postalCode: details.postalCode,
              streetNumber: details.streetNumber,
              route: details.route,
              locality: details.locality,
              provider: "getaddress",
            },
            200,
            origin,
          );
        }

        if (!env.GOOGLE_PLACES_API_KEY) {
          return json({ error: "Address lookup is not configured" }, 503, origin);
        }

        const suggestionName = url.searchParams.get("suggestionName")?.trim() || undefined;

        const details = await resolveGooglePlaceDetails(
          env.GOOGLE_PLACES_API_KEY,
          id,
          airportCode,
          sessionToken,
          userInput,
          suggestionName,
        );

        if (!details) {
          return json({ error: "Address not found" }, 404, origin);
        }

        return json(
          {
            address: details.displayAddress,
            formattedAddress: details.formattedAddress,
            displayAddress: details.displayAddress,
            placeName: details.placeName,
            placeId: details.placeId,
            lat: details.lat,
            lng: details.lng,
            countryCode: details.countryCode,
            postalCode: details.postalCode,
            streetNumber: details.streetNumber,
            route: details.route,
            locality: details.locality,
            provider: "google",
          },
          200,
          origin,
        );
      } catch {
        return json({ error: "Address lookup failed" }, 502, origin);
      }
    }

    if (query.length < 3) {
      return json({ suggestions: [] }, 200, origin);
    }

    try {
      const postcode = extractNorthernIrelandPostcode(query);
      const isPureNiPostcode = isPureFullNorthernIrelandPostcodeQuery(query);
      const premisePrefix = extractPremisePrefixFromPostcodeQuery(query);

      // Optional paid Ideal Postcodes — only when a key is configured.
      if (
        isPureNiPostcode &&
        env.IDEAL_POSTCODES_API_KEY &&
        shouldUseIdealPostcodes(airportCode, query)
      ) {
        const premises = await searchIdealPostcodes(
          env.IDEAL_POSTCODES_API_KEY,
          query,
          airportCode,
        );
        if (premises.length > 0) {
          return json(
            {
              suggestions: premises.slice(0, 100),
              provider: "ideal-postcodes",
              configured: {
                idealPostcodes: true,
                getaddress: Boolean(env.GETADDRESS_API_KEY?.trim()),
                google: Boolean(env.GOOGLE_PLACES_API_KEY?.trim()),
              },
            },
            200,
            origin,
          );
        }
      }

      // Free path: full postcode alone cannot list every property without PAF data.
      // Ask the customer for a house number / building name (handled in AddressInput).
      if (isPureNiPostcode) {
        return json(
          {
            suggestions: [],
            needsHouseNumber: true,
            postcode: postcode ?? undefined,
            provider: "google",
            hint: "Enter your house number or building name to find your exact address.",
            configured: {
              idealPostcodes: Boolean(env.IDEAL_POSTCODES_API_KEY?.trim()),
              getaddress: Boolean(env.GETADDRESS_API_KEY?.trim()),
              google: Boolean(env.GOOGLE_PLACES_API_KEY?.trim()),
            },
          },
          200,
          origin,
        );
      }

      const tasks: Promise<Awaited<ReturnType<typeof searchGooglePlaces>>>[] = [];

      if (env.IDEAL_POSTCODES_API_KEY && shouldUseIdealPostcodes(airportCode, query)) {
        tasks.push(searchIdealPostcodes(env.IDEAL_POSTCODES_API_KEY, query, airportCode));
      }

      if (env.GETADDRESS_API_KEY && shouldUseGetAddress(airportCode, query)) {
        tasks.push(searchGetAddress(env.GETADDRESS_API_KEY, query, airportCode));
      }

      if (env.GOOGLE_PLACES_API_KEY) {
        if (premisePrefix && postcode && isFullNorthernIrelandPostcode(postcode)) {
          tasks.push(
            searchGooglePostcodePremises(env.GOOGLE_PLACES_API_KEY, query, airportCode),
          );
        }

        tasks.push(
          searchGooglePlaces(env.GOOGLE_PLACES_API_KEY, query, airportCode, sessionToken),
        );

        if (!extractLeadingStreetNumber(query) && !premisePrefix) {
          tasks.push(
            searchGoogleEstablishments(
              env.GOOGLE_PLACES_API_KEY,
              query,
              airportCode,
              sessionToken,
            ),
          );
        }

        if (isStreetOnlyQuery(query) || isNumberedAddressQuery(query) || Boolean(premisePrefix)) {
          tasks.push(
            searchGoogleStreetAddresses(env.GOOGLE_PLACES_API_KEY, query, airportCode),
          );
        }

        if (postcode && isFullNorthernIrelandPostcode(postcode) && premisePrefix) {
          tasks.push(
            searchGooglePostcodeAddresses(env.GOOGLE_PLACES_API_KEY, query, airportCode),
          );
        }
      }

      const results = await Promise.all(
        tasks.map(async (task, index) => {
          try {
            return await task;
          } catch (error) {
            console.error(`Address provider task ${index} failed`, error);
            return [];
          }
        }),
      );
      const suggestions = results.flat();

      const seen = new Set<string>();
      const merged = sortSuggestionsByStreetNumber(
        suggestions.filter((item) => {
          if (!isAllowedAutocompleteLabel(item.label, airportCode)) {
            return false;
          }
          const key = item.label.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        }),
      );

      const providers: string[] = [];
      if (env.IDEAL_POSTCODES_API_KEY?.trim()) providers.push("ideal-postcodes");
      if (env.GETADDRESS_API_KEY?.trim()) providers.push("getaddress");
      if (env.GOOGLE_PLACES_API_KEY?.trim()) providers.push("google");

      return json(
        {
          suggestions: merged.slice(0, 10),
          provider: providers.join("+") || "none",
          configured: {
            idealPostcodes: Boolean(env.IDEAL_POSTCODES_API_KEY?.trim()),
            getaddress: Boolean(env.GETADDRESS_API_KEY?.trim()),
            google: Boolean(env.GOOGLE_PLACES_API_KEY?.trim()),
          },
        },
        200,
        origin,
      );
    } catch {
      return json({ error: "Address lookup failed" }, 502, origin);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      processDueReviewRequests(env).then((result) => {
        if (result.sent > 0 || result.errors > 0) {
          console.log("Review request cron", JSON.stringify(result));
        }
      }),
    );
  },
};

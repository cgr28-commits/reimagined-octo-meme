/**
 * Address-to-Address personalised quotes: create / list / approve / pay.
 * Owner chooses Quote Price (£) and validity in any whole minutes (1, 10, 60, …).
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE,
  A2A_QUOTE_VALIDITY_DEFAULT_MINUTES,
  a2aQuoteStatusLabel,
  computeA2aQuoteExpiresAtIso,
  formatA2aQuoteValidityLabel,
  isA2aCounterOffer,
  isA2aQuotePayable,
  listA2aJourneyChanges,
  normalizeA2aQuotedPriceGbp,
  normalizeA2aQuoteValidityMinutes,
  resolveA2aOriginalBooking,
  type A2aQuoteRequestRecord,
} from "../shared/a2a-personalised-quote";
import { buildA2aQuotePaymentLinkEmail } from "../shared/a2a-quote-payment-email";
import { normaliseJourneyAddressLabel } from "../shared/journey-address-label";
import { isValidCustomerEmail } from "../shared/short-notice-payment-email";
import {
  createSumUpHostedCheckout,
  type SumUpCheckoutResult,
} from "../shared/sumup-checkout";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  generateA2aPaymentToken,
  generateA2aQuoteReference,
  getA2aQuoteByReference,
  getA2aQuoteByToken,
  listA2aQuoteHistory,
  listOpenA2aQuoteRequests,
  saveA2aQuoteRequest,
} from "./a2a-quote-store";
import {
  savePendingCheckout,
  pendingCheckoutStoreConfigured,
} from "./pending-checkout-store";
import { resolveWorkerTripRouteMetrics } from "./resolve-route-metrics";
import {
  DEFAULT_BOOKING_EMAIL,
  trySendResendOnlyCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";
import {
  formatJourneyDistance,
  formatJourneyDuration,
} from "../../../src/lib/trip-route";

export type A2aQuoteEnv = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE: KVNamespace;
    SUMUP_API_KEY?: string;
    SUMUP_MERCHANT_CODE?: string;
    PUBLIC_SITE_ORIGIN?: string;
    GOOGLE_PLACES_API_KEY?: string;
  };

function formatAmountLabel(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function siteOriginFrom(env: A2aQuoteEnv, request?: Request): string {
  const fromEnv = env.PUBLIC_SITE_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = request?.headers.get("Origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");
  return "https://www.myairporttaxini.co.uk";
}

export function buildA2aQuotePayUrl(siteOrigin: string, paymentToken: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  return `${base}/pay/a2a-quote/?token=${encodeURIComponent(paymentToken)}`;
}

function toOwnerSummary(record: A2aQuoteRequestRecord) {
  const original = resolveA2aOriginalBooking(record);
  const changes = listA2aJourneyChanges(original, record.booking, normaliseJourneyAddressLabel);
  const counterOffer = changes.length > 0;
  return {
    reference: record.reference,
    status: record.status,
    statusLabel: a2aQuoteStatusLabel(record.status),
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail,
    customerMobile: record.booking.mobileNumber,
    pickupLabel: normaliseJourneyAddressLabel(record.booking.pickupLabel),
    dropoffLabel: normaliseJourneyAddressLabel(record.booking.dropoffLabel),
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    returnJourney: record.booking.returnJourney,
    returnDate: record.booking.returnDate,
    returnTime: record.booking.returnTime,
    passengers: record.booking.passengers,
    suitcases: record.booking.suitcases,
    vehicle: record.booking.vehicle,
    journeyDistance: record.booking.journeyDistance ?? null,
    journeyDuration: record.booking.journeyDuration ?? null,
    tripLabel: record.booking.tripLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    quotedPrice: record.quotedPrice ?? null,
    quotedPriceLabel:
      typeof record.quotedPrice === "number" ? formatAmountLabel(record.quotedPrice) : null,
    quoteApprovedAt: record.quoteApprovedAt ?? null,
    quoteValidityMinutes: record.quoteValidityMinutes ?? null,
    quoteValidityLabel:
      typeof record.quoteValidityMinutes === "number"
        ? formatA2aQuoteValidityLabel(record.quoteValidityMinutes)
        : null,
    quoteExpiresAt: record.quoteExpiresAt ?? null,
    paymentUrl: record.paymentUrl ?? null,
    paymentReference: record.paymentReference ?? null,
    paidAt: record.paidAt ?? null,
    paymentLinkEmailSentAt: record.paymentLinkEmailSentAt ?? null,
    payable: isA2aQuotePayable(record),
    isCounterOffer: counterOffer,
    journeyChanges: changes,
    originalPickupLabel: normaliseJourneyAddressLabel(original.pickupLabel),
    originalDropoffLabel: normaliseJourneyAddressLabel(original.dropoffLabel),
    originalTripDate: original.tripDate,
    originalTripTime: original.tripTime,
    originalReturnDate: original.returnDate || "",
    originalReturnTime: original.returnTime || "",
    originalPassengers: original.passengers,
    originalSuitcases: original.suitcases,
  };
}

export function publicA2aQuoteSummary(record: A2aQuoteRequestRecord) {
  const expired =
    record.status === "EXPIRED" ||
    (record.quoteExpiresAt != null &&
      !Number.isNaN(new Date(record.quoteExpiresAt).getTime()) &&
      new Date(record.quoteExpiresAt).getTime() <= Date.now() &&
      record.status === "QUOTE_APPROVED_AWAITING_PAYMENT");

  const original = resolveA2aOriginalBooking(record);
  const changes = listA2aJourneyChanges(original, record.booking, normaliseJourneyAddressLabel);
  const counterOffer =
    Boolean(record.isCounterOffer) ||
    (record.status === "QUOTE_APPROVED_AWAITING_PAYMENT" && changes.length > 0);

  return {
    reference: record.reference,
    status: expired ? "EXPIRED" : record.status,
    statusLabel: a2aQuoteStatusLabel(expired ? "EXPIRED" : record.status),
    amount: record.quotedPrice ?? null,
    amountLabel:
      typeof record.quotedPrice === "number" ? formatAmountLabel(record.quotedPrice) : null,
    customerName: record.booking.customerName,
    pickupLabel: normaliseJourneyAddressLabel(record.booking.pickupLabel),
    dropoffLabel: normaliseJourneyAddressLabel(record.booking.dropoffLabel),
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    returnJourney: record.booking.returnJourney,
    returnDate: record.booking.returnDate || "",
    returnTime: record.booking.returnTime || "",
    passengers: record.booking.passengers,
    suitcases: record.booking.suitcases,
    vehicle: record.booking.vehicle,
    quoteExpiresAt: record.quoteExpiresAt ?? null,
    quoteValidityMinutes: record.quoteValidityMinutes ?? null,
    quoteValidityLabel:
      typeof record.quoteValidityMinutes === "number"
        ? formatA2aQuoteValidityLabel(record.quoteValidityMinutes)
        : null,
    paymentUrl: record.paymentUrl ?? null,
    payable: !expired && isA2aQuotePayable(record),
    expired,
    expiredMessage: expired ? A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE : null,
    isCounterOffer: counterOffer,
    journeyChanges: changes,
    originalPickupLabel: normaliseJourneyAddressLabel(original.pickupLabel),
    originalDropoffLabel: normaliseJourneyAddressLabel(original.dropoffLabel),
    originalTripDate: original.tripDate,
    originalTripTime: original.tripTime,
    originalReturnJourney: Boolean(original.returnJourney),
    originalReturnDate: original.returnDate || "",
    originalReturnTime: original.returnTime || "",
    originalPassengers: original.passengers,
    originalSuitcases: original.suitcases,
  };
}

async function maybeExpireRecord(
  store: KVNamespace,
  record: A2aQuoteRequestRecord,
  now = new Date(),
): Promise<A2aQuoteRequestRecord> {
  if (record.status !== "QUOTE_APPROVED_AWAITING_PAYMENT") return record;
  if (!record.quoteExpiresAt) return record;
  const expires = new Date(record.quoteExpiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() > now.getTime()) return record;
  if (record.paymentReference || record.paidAt) return record;
  const expired: A2aQuoteRequestRecord = {
    ...record,
    status: "EXPIRED",
    expiredAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await saveA2aQuoteRequest(store, expired);
  return expired;
}

export async function createA2aQuoteRequest(options: {
  store: KVNamespace;
  booking: PaidBookingDetails;
  now?: Date;
}): Promise<A2aQuoteRequestRecord> {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const record: A2aQuoteRequestRecord = {
    reference: generateA2aQuoteReference(now),
    paymentToken: generateA2aPaymentToken(),
    status: "AWAITING_QUOTE",
    booking: options.booking,
    originalBooking: { ...options.booking },
    createdAt,
    updatedAt: createdAt,
  };
  await saveA2aQuoteRequest(options.store, record);
  return record;
}

export async function handleCreateA2aQuoteRequest(
  env: A2aQuoteEnv,
  body: Record<string, unknown>,
): Promise<{ ok: true; reference: string; status: string } | { error: string; status: number }> {
  const booking = body.booking as PaidBookingDetails | undefined;
  if (!booking?.customerName?.trim() || !booking.pickupLabel?.trim() || !booking.dropoffLabel?.trim()) {
    return { error: "Journey details are required.", status: 400 };
  }
  if (!booking.customerEmail?.trim() || !isValidCustomerEmail(booking.customerEmail)) {
    return { error: "A valid customer email is required for a personalised quote.", status: 400 };
  }
  if (!booking.tripDate?.trim() || !booking.tripTime?.trim()) {
    return { error: "Pickup date and time are required.", status: 400 };
  }

  const record = await createA2aQuoteRequest({
    store: env.TRACKING_STORE,
    booking: {
      customerName: booking.customerName.trim(),
      customerEmail: booking.customerEmail.trim(),
      mobileNumber: String(booking.mobileNumber ?? "").trim(),
      tripLabel: String(booking.tripLabel ?? "Address to Address").trim() || "Address to Address",
      pickupLabel: normaliseJourneyAddressLabel(booking.pickupLabel),
      dropoffLabel: normaliseJourneyAddressLabel(booking.dropoffLabel),
      returnJourney: Boolean(booking.returnJourney),
      tripDate: booking.tripDate.trim(),
      tripTime: booking.tripTime.trim(),
      returnDate: String(booking.returnDate ?? "").trim(),
      returnTime: String(booking.returnTime ?? "").trim(),
      flightNumber: String(booking.flightNumber ?? "").trim(),
      passengers: Number(booking.passengers) || 1,
      suitcases: Number(booking.suitcases) || 0,
      vehicle: String(booking.vehicle ?? "").trim() || "Saloon",
      isAirportTrip: false,
      ...(booking.journeyDistance ? { journeyDistance: String(booking.journeyDistance) } : {}),
      ...(booking.journeyDuration ? { journeyDuration: String(booking.journeyDuration) } : {}),
      ...(booking.termsAcceptedAt ? { termsAcceptedAt: String(booking.termsAcceptedAt) } : {}),
      ...(booking.termsVersion ? { termsVersion: String(booking.termsVersion) } : {}),
      ...(booking.cancellationPolicyVersion
        ? { cancellationPolicyVersion: String(booking.cancellationPolicyVersion) }
        : {}),
      ...(booking.marketingOptIn ? { marketingOptIn: true } : {}),
      ...(booking.marketingOptInAt ? { marketingOptInAt: String(booking.marketingOptInAt) } : {}),
      ...(booking.marketingConsentVersion
        ? { marketingConsentVersion: String(booking.marketingConsentVersion) }
        : {}),
    },
  });

  return { ok: true, reference: record.reference, status: record.status };
}

export async function handleOwnerListA2aQuotes(
  request: Request,
  env: A2aQuoteEnv,
): Promise<
  | {
      ok: true;
      quotes: ReturnType<typeof toOwnerSummary>[];
      awaitingCount: number;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized", status: 401 };
  }
  const url = new URL(request.url);
  const filter = String(url.searchParams.get("filter") ?? "awaiting").trim().toLowerCase();
  const includeHistory =
    filter === "all" ||
    filter === "history" ||
    filter === "paid" ||
    filter === "expired" ||
    filter === "cancelled" ||
    filter === "approved" ||
    filter === "awaiting-payment";

  const baseRecords = includeHistory
    ? await listA2aQuoteHistory(env.TRACKING_STORE)
    : await listOpenA2aQuoteRequests(env.TRACKING_STORE);

  const refreshed: A2aQuoteRequestRecord[] = [];
  for (const record of baseRecords) {
    refreshed.push(await maybeExpireRecord(env.TRACKING_STORE, record));
  }

  // Count only open AWAITING_QUOTE rows for the queue header (never history noise).
  const openForCount =
    includeHistory ? await listOpenA2aQuoteRequests(env.TRACKING_STORE) : refreshed;
  const awaitingCount = openForCount.filter((r) => r.status === "AWAITING_QUOTE").length;

  const filtered = refreshed.filter((r) => {
    switch (filter) {
      case "awaiting":
        return r.status === "AWAITING_QUOTE";
      case "approved":
      case "awaiting-payment":
        return r.status === "QUOTE_APPROVED_AWAITING_PAYMENT";
      case "paid":
      case "confirmed":
        return r.status === "CONFIRMED";
      case "expired":
        return r.status === "EXPIRED" || r.status === "CANCELLED";
      case "cancelled":
        return r.status === "CANCELLED";
      case "history":
        return r.status !== "AWAITING_QUOTE";
      case "all":
        return true;
      default:
        return r.status === "AWAITING_QUOTE";
    }
  });

  return {
    ok: true,
    awaitingCount,
    quotes: filtered.map(toOwnerSummary),
  };
}

export async function handlePublicA2aQuote(
  env: A2aQuoteEnv,
  token: string,
): Promise<
  | { ok: true; quote: ReturnType<typeof publicA2aQuoteSummary> }
  | { error: string; status: number }
> {
  const existing = await getA2aQuoteByToken(env.TRACKING_STORE, token);
  if (!existing) {
    return { error: "This quote link is invalid or no longer available.", status: 404 };
  }
  const record = await maybeExpireRecord(env.TRACKING_STORE, existing);
  return { ok: true, quote: publicA2aQuoteSummary(record) };
}

async function sendA2aPaymentEmail(
  env: A2aQuoteEnv,
  record: A2aQuoteRequestRecord,
  payUrl: string,
): Promise<{ sent: boolean; error?: string; provider?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const validityMinutes =
    record.quoteValidityMinutes ?? A2A_QUOTE_VALIDITY_DEFAULT_MINUTES;
  const original = resolveA2aOriginalBooking(record);
  const counterOffer = isA2aCounterOffer(
    original,
    record.booking,
    normaliseJourneyAddressLabel,
  );
  const email = buildA2aQuotePaymentLinkEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: normaliseJourneyAddressLabel(record.booking.pickupLabel),
    dropoffLabel: normaliseJourneyAddressLabel(record.booking.dropoffLabel),
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    returnJourney: Boolean(record.booking.returnJourney),
    returnDate: String(record.booking.returnDate ?? "").trim(),
    returnTime: String(record.booking.returnTime ?? "").trim(),
    passengers: Number(record.booking.passengers) || 1,
    suitcases: Number(record.booking.suitcases) || 0,
    amountLabel: formatAmountLabel(record.quotedPrice ?? 0),
    reference: record.reference,
    payUrl,
    validityMinutes,
    isCounterOffer: counterOffer,
    originalPickupLabel: normaliseJourneyAddressLabel(original.pickupLabel),
    originalDropoffLabel: normaliseJourneyAddressLabel(original.dropoffLabel),
    originalTripDate: original.tripDate,
    originalTripTime: original.tripTime,
    originalReturnJourney: Boolean(original.returnJourney),
    originalReturnDate: String(original.returnDate ?? "").trim(),
    originalReturnTime: String(original.returnTime ?? "").trim(),
    originalPassengers: Number(original.passengers) || 1,
    originalSuitcases: Number(original.suitcases) || 0,
  });
  const result = await trySendResendOnlyCustomerEmail(env, {
    to: record.booking.customerEmail.trim(),
    toName: record.booking.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  if (result.sent) {
    // Owner/business copy of exactly what the customer received.
    const ownerTo =
      env.BOOKING_NOTIFICATION_EMAIL?.trim() ||
      env.BOOKING_TO_EMAIL?.trim() ||
      DEFAULT_BOOKING_EMAIL;
    void trySendResendOnlyCustomerEmail(env, {
      to: ownerTo,
      toName: "Bookings",
      subject: `[Bookings copy] ${email.subject}`,
      body: email.text,
      htmlBody: email.html,
    }).catch(() => undefined);
  }
  return {
    sent: result.sent,
    error: result.error,
    ...(result.provider ? { provider: result.provider } : {}),
  };
}

/**
 * Owner edits journey details on an awaiting A2A quote before approving.
 * Saved pickup / destination / date / time (and return) become what the
 * customer sees in the payment email and pay page after Approve Quote.
 */
export async function handleOwnerUpdateA2aQuoteJourney(
  request: Request,
  env: A2aQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; record: ReturnType<typeof toOwnerSummary> }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized", status: 401 };
  }

  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Reference is required.", status: 400 };

  const existing = await getA2aQuoteByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Quote request not found.", status: 404 };
  if (existing.status !== "AWAITING_QUOTE") {
    return {
      error: "Journey details can only be edited before the quote is approved.",
      status: 409,
    };
  }

  const pickupLabel = normaliseJourneyAddressLabel(String(body.pickupLabel ?? ""));
  const dropoffLabel = normaliseJourneyAddressLabel(String(body.dropoffLabel ?? ""));
  const tripDate = String(body.tripDate ?? "").trim();
  const tripTime = String(body.tripTime ?? "").trim();
  if (!pickupLabel || !dropoffLabel) {
    return { error: "Pickup and destination are required.", status: 400 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return { error: "Enter a valid pickup date (YYYY-MM-DD).", status: 400 };
  }
  if (!/^\d{2}:\d{2}$/.test(tripTime)) {
    return { error: "Enter a valid pickup time (HH:MM).", status: 400 };
  }

  const returnJourney = Boolean(
    body.returnJourney === true ||
      body.returnJourney === "true" ||
      existing.booking.returnJourney,
  );
  let returnDate = String(body.returnDate ?? existing.booking.returnDate ?? "").trim();
  let returnTime = String(body.returnTime ?? existing.booking.returnTime ?? "").trim();
  if (returnJourney) {
    if (returnDate && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
      return { error: "Enter a valid return date (YYYY-MM-DD).", status: 400 };
    }
    if (returnTime && !/^\d{2}:\d{2}$/.test(returnTime)) {
      return { error: "Enter a valid return time (HH:MM).", status: 400 };
    }
  } else {
    returnDate = "";
    returnTime = "";
  }

  const passengersRaw = body.passengers;
  const suitcasesRaw = body.suitcases;
  const passengers =
    passengersRaw === undefined || passengersRaw === null || passengersRaw === ""
      ? Number(existing.booking.passengers) || 1
      : Math.max(1, Math.min(7, Math.floor(Number(passengersRaw)) || 1));
  const suitcases =
    suitcasesRaw === undefined || suitcasesRaw === null || suitcasesRaw === ""
      ? Number(existing.booking.suitcases) || 0
      : Math.max(0, Math.min(20, Math.floor(Number(suitcasesRaw)) || 0));

  const addressesChanged =
    pickupLabel !== normaliseJourneyAddressLabel(existing.booking.pickupLabel) ||
    dropoffLabel !== normaliseJourneyAddressLabel(existing.booking.dropoffLabel);

  let journeyDistance = String(existing.booking.journeyDistance ?? "").trim();
  let journeyDuration = String(existing.booking.journeyDuration ?? "").trim();

  const bodyDistance = String(body.journeyDistance ?? "").trim();
  const bodyDuration = String(body.journeyDuration ?? "").trim();
  if (bodyDistance) journeyDistance = bodyDistance;
  if (bodyDuration) journeyDuration = bodyDuration;

  // When addresses change and the client did not supply fresh metrics, try the Worker resolver.
  if (addressesChanged && (!bodyDistance || !bodyDuration)) {
    try {
      const metrics = await resolveWorkerTripRouteMetrics({
        pickupAddress: pickupLabel,
        dropoffAddress: dropoffLabel,
        googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
      });
      if (metrics) {
        journeyDistance = formatJourneyDistance(metrics.distanceKm);
        journeyDuration = formatJourneyDuration(metrics.durationMinutes);
      }
    } catch {
      // Keep previous / client-supplied metrics if Worker route lookup fails.
    }
  }

  const nowIso = new Date().toISOString();
  const originalBooking = existing.originalBooking
    ? existing.originalBooking
    : { ...existing.booking };
  const nextBooking = {
    ...existing.booking,
    pickupLabel,
    dropoffLabel,
    tripDate,
    tripTime,
    returnJourney,
    returnDate,
    returnTime,
    passengers,
    suitcases,
  } as A2aQuoteRequestRecord["booking"];
  if (journeyDistance) nextBooking.journeyDistance = journeyDistance;
  else delete nextBooking.journeyDistance;
  if (journeyDuration) nextBooking.journeyDuration = journeyDuration;
  else delete nextBooking.journeyDuration;

  const next: A2aQuoteRequestRecord = {
    ...existing,
    originalBooking,
    booking: nextBooking,
    updatedAt: nowIso,
  };

  await saveA2aQuoteRequest(env.TRACKING_STORE, next);
  return { ok: true, record: toOwnerSummary(next) };
}

/**
 * Owner Approve Quote: set price, validity (any whole minutes), create SumUp checkout,
 * email customer Pay Securely link. Expiry is computed server-side.
 */
export async function handleOwnerApproveA2aQuote(
  request: Request,
  env: A2aQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      record: ReturnType<typeof toOwnerSummary>;
      payUrl: string;
      paymentEmailSent: boolean;
      paymentEmailError?: string;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized", status: 401 };
  }

  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Reference is required.", status: 400 };

  const quotedPrice = normalizeA2aQuotedPriceGbp(body.quotedPrice ?? body.quotePrice);
  if (quotedPrice == null) {
    return { error: "Enter a valid Quote Price (£) between 1 and 5000.", status: 400 };
  }

  const validityMinutes = normalizeA2aQuoteValidityMinutes(
    body.validityMinutes ?? body.quoteValidityMinutes ?? A2A_QUOTE_VALIDITY_DEFAULT_MINUTES,
  );
  if (validityMinutes == null) {
    return {
      error: "Enter how long the quote is valid in whole minutes (e.g. 1, 10, or 60).",
      status: 400,
    };
  }

  const existing = await getA2aQuoteByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Quote request not found.", status: 404 };
  if (existing.status === "CONFIRMED" || existing.paymentReference) {
    return { error: "This quote has already been paid.", status: 409 };
  }
  if (existing.status === "CANCELLED") {
    return { error: "This quote request was cancelled.", status: 409 };
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const merchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  if (!apiKey || !merchantCode) {
    return { error: "SumUp is not configured on the Worker.", status: 503 };
  }
  if (!pendingCheckoutStoreConfigured(env.TRACKING_STORE)) {
    return { error: "Booking store is not configured.", status: 503 };
  }

  const now = new Date();
  const approvedAt = now.toISOString();
  const quoteExpiresAt = computeA2aQuoteExpiresAtIso(approvedAt, validityMinutes);
  const siteOrigin = siteOriginFrom(env, request);
  const payPageUrl = buildA2aQuotePayUrl(siteOrigin, existing.paymentToken);
  const checkoutReference = `${existing.reference}-${Date.now().toString(36)}`.slice(0, 100);
  const redirectUrl = `${siteOrigin}/booking-confirmed/?payment=return`;

  let checkout: SumUpCheckoutResult;
  try {
    checkout = await createSumUpHostedCheckout(apiKey, merchantCode, {
      amount: quotedPrice,
      description: `A2A quote ${existing.reference}`.slice(0, 140),
      checkoutReference,
      redirectUrl,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create SumUp checkout",
      status: 502,
    };
  }

  await savePendingCheckout(env.TRACKING_STORE, {
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    amount: quotedPrice,
    booking: existing.booking,
    createdAt: approvedAt,
    a2aQuoteToken: existing.paymentToken,
    a2aQuoteReference: existing.reference,
  });

  const originalBooking = existing.originalBooking
    ? existing.originalBooking
    : { ...existing.booking };
  const counterOffer = isA2aCounterOffer(
    originalBooking,
    existing.booking,
    normaliseJourneyAddressLabel,
  );

  const record: A2aQuoteRequestRecord = {
    ...existing,
    originalBooking,
    status: "QUOTE_APPROVED_AWAITING_PAYMENT",
    quotedPrice,
    quoteApprovedAt: approvedAt,
    quoteValidityMinutes: validityMinutes,
    quoteExpiresAt,
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    paymentUrl: checkout.paymentUrl,
    isCounterOffer: counterOffer,
    updatedAt: approvedAt,
  };

  // Prefer SumUp hosted URL in the email Pay Securely button; pay page also works.
  const emailPayUrl = checkout.paymentUrl || payPageUrl;
  const send = await sendA2aPaymentEmail(env, record, emailPayUrl);
  const next: A2aQuoteRequestRecord = send.sent
    ? {
        ...record,
        paymentLinkEmailSentAt: approvedAt,
        paymentLinkEmailPayUrl: emailPayUrl,
      }
    : record;

  await saveA2aQuoteRequest(env.TRACKING_STORE, next);

  return {
    ok: true,
    record: toOwnerSummary(next),
    payUrl: emailPayUrl,
    paymentEmailSent: send.sent,
    ...(send.error ? { paymentEmailError: send.error } : {}),
  };
}

/**
 * Resend the personalised price + SumUp payment link email for an approved quote.
 * Only reports success when Resend accepts the message.
 */
export async function handleOwnerResendA2aPaymentEmail(
  request: Request,
  env: A2aQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      record: ReturnType<typeof toOwnerSummary>;
      payUrl: string;
      paymentEmailSent: true;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized", status: 401 };
  }

  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Reference is required.", status: 400 };

  const existing = await getA2aQuoteByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Quote request not found.", status: 404 };

  const record = await maybeExpireRecord(env.TRACKING_STORE, existing);
  if (record.status === "CONFIRMED" || record.paymentReference || record.paidAt) {
    return { error: "This quote has already been paid.", status: 409 };
  }
  if (record.status === "CANCELLED") {
    return { error: "This quote request was cancelled.", status: 409 };
  }
  if (record.status === "EXPIRED") {
    return { error: "This quote has expired.", status: 409 };
  }
  if (record.status !== "QUOTE_APPROVED_AWAITING_PAYMENT") {
    return { error: "Approve the quote before sending a payment email.", status: 409 };
  }
  if (!isA2aQuotePayable(record)) {
    return { error: A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE, status: 409 };
  }
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { error: "Customer email is missing or invalid.", status: 400 };
  }

  const siteOrigin = siteOriginFrom(env, request);
  const payPageUrl = buildA2aQuotePayUrl(siteOrigin, record.paymentToken);
  const emailPayUrl =
    (record.paymentUrl || record.paymentLinkEmailPayUrl || "").trim() || payPageUrl;

  const send = await sendA2aPaymentEmail(env, record, emailPayUrl);
  if (!send.sent) {
    return { error: send.error || "Could not send payment email.", status: 502 };
  }

  const sentAt = new Date().toISOString();
  const next: A2aQuoteRequestRecord = {
    ...record,
    paymentLinkEmailSentAt: sentAt,
    paymentLinkEmailPayUrl: emailPayUrl,
    updatedAt: sentAt,
  };
  await saveA2aQuoteRequest(env.TRACKING_STORE, next);

  return {
    ok: true,
    record: toOwnerSummary(next),
    payUrl: emailPayUrl,
    paymentEmailSent: true,
  };
}

export async function resolveA2aQuoteForPayment(
  store: KVNamespace,
  token: string,
): Promise<
  | { ok: true; record: A2aQuoteRequestRecord }
  | { error: string; status: number }
> {
  const existing = await getA2aQuoteByToken(store, token);
  if (!existing) {
    return { error: "This quote link is invalid or no longer available.", status: 404 };
  }
  const record = await maybeExpireRecord(store, existing);
  if (record.status === "EXPIRED") {
    return { error: A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE, status: 410 };
  }
  if (record.status === "CONFIRMED" || record.paymentReference) {
    return { error: "This quote has already been paid.", status: 409 };
  }
  if (!isA2aQuotePayable(record)) {
    return { error: A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE, status: 410 };
  }
  return { ok: true, record };
}

export async function markA2aQuotePaid(
  store: KVNamespace,
  tokenOrReference: string,
  paymentReference: string,
  checkoutId?: string,
): Promise<void> {
  let record =
    (await getA2aQuoteByToken(store, tokenOrReference)) ??
    (await getA2aQuoteByReference(store, tokenOrReference));
  if (!record) return;
  if (record.paymentReference || record.status === "CONFIRMED") return;
  const now = new Date().toISOString();
  const next: A2aQuoteRequestRecord = {
    ...record,
    status: "CONFIRMED",
    paymentReference,
    paidAt: now,
    updatedAt: now,
    ...(checkoutId ? { checkoutId } : {}),
  };
  await saveA2aQuoteRequest(store, next);
}

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
  isA2aQuotePayable,
  normalizeA2aQuotedPriceGbp,
  normalizeA2aQuoteValidityMinutes,
  type A2aQuoteRequestRecord,
} from "../shared/a2a-personalised-quote";
import { buildA2aQuotePaymentLinkEmail } from "../shared/a2a-quote-payment-email";
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
  listOpenA2aQuoteRequests,
  saveA2aQuoteRequest,
} from "./a2a-quote-store";
import {
  savePendingCheckout,
  pendingCheckoutStoreConfigured,
} from "./pending-checkout-store";
import {
  trySendBrandedCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";

export type A2aQuoteEnv = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE: KVNamespace;
    SUMUP_API_KEY?: string;
    SUMUP_MERCHANT_CODE?: string;
    PUBLIC_SITE_ORIGIN?: string;
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
  return {
    reference: record.reference,
    status: record.status,
    statusLabel: a2aQuoteStatusLabel(record.status),
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail,
    customerMobile: record.booking.mobileNumber,
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
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
    payable: isA2aQuotePayable(record),
  };
}

export function publicA2aQuoteSummary(record: A2aQuoteRequestRecord) {
  const expired =
    record.status === "EXPIRED" ||
    (record.quoteExpiresAt != null &&
      !Number.isNaN(new Date(record.quoteExpiresAt).getTime()) &&
      new Date(record.quoteExpiresAt).getTime() <= Date.now() &&
      record.status === "QUOTE_APPROVED_AWAITING_PAYMENT");

  return {
    reference: record.reference,
    status: expired ? "EXPIRED" : record.status,
    statusLabel: a2aQuoteStatusLabel(expired ? "EXPIRED" : record.status),
    amount: record.quotedPrice ?? null,
    amountLabel:
      typeof record.quotedPrice === "number" ? formatAmountLabel(record.quotedPrice) : null,
    customerName: record.booking.customerName,
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    returnJourney: record.booking.returnJourney,
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
      pickupLabel: booking.pickupLabel.trim(),
      dropoffLabel: booking.dropoffLabel.trim(),
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
): Promise<{ ok: true; quotes: ReturnType<typeof toOwnerSummary>[] } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized", status: 401 };
  }
  const records = await listOpenA2aQuoteRequests(env.TRACKING_STORE);
  const refreshed: A2aQuoteRequestRecord[] = [];
  for (const record of records) {
    refreshed.push(await maybeExpireRecord(env.TRACKING_STORE, record));
  }
  return {
    ok: true,
    quotes: refreshed.filter((r) => r.status === "AWAITING_QUOTE" || r.status === "QUOTE_APPROVED_AWAITING_PAYMENT").map(toOwnerSummary),
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
): Promise<{ sent: boolean; error?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const validityMinutes =
    record.quoteValidityMinutes ?? A2A_QUOTE_VALIDITY_DEFAULT_MINUTES;
  const email = buildA2aQuotePaymentLinkEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    amountLabel: formatAmountLabel(record.quotedPrice ?? 0),
    reference: record.reference,
    payUrl,
    validityMinutes,
  });
  const result = await trySendBrandedCustomerEmail(env, {
    to: record.booking.customerEmail.trim(),
    toName: record.booking.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  return { sent: result.sent, error: result.error };
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

  const record: A2aQuoteRequestRecord = {
    ...existing,
    status: "QUOTE_APPROVED_AWAITING_PAYMENT",
    quotedPrice,
    quoteApprovedAt: approvedAt,
    quoteValidityMinutes: validityMinutes,
    quoteExpiresAt,
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    paymentUrl: checkout.paymentUrl,
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

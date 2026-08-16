import {
  buildCustomerRefundConfirmationEmail,
  buildOwnerRefundConfirmationEmail,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  getSumUpCheckout,
  getSuccessfulTransactionId,
  resolveSumUpTransactionForRefund,
  refundSumUpTransaction,
} from "../shared/sumup-checkout";
import {
  cancelCalendarEvents,
  getGoogleAccessToken,
  parseServiceAccountJson,
} from "./google-calendar";
import {
  getPaidBookingRecord,
  markPaidBookingRefunded,
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  markTrackingJobRefunded,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendBrandedCustomerEmail, trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

type RefundEnv = WorkerEmailEnv &
  DriverAuthEnv & {
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  TRACKING_STORE?: KVNamespace;
  BOOKING_TO_EMAIL?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
const BUSINESS_NAME = "My Airport Taxi NI";

function isKnownRefundAmount(label: string | undefined): boolean {
  const trimmed = label?.trim() ?? "";
  return Boolean(trimmed) && trimmed.toLowerCase() !== "unknown";
}

function resolveRefundAmountLabel(
  record: PaidBookingRecord,
  preferred?: string,
): string | null {
  if (isKnownRefundAmount(preferred)) {
    return preferred!.trim();
  }

  if (isKnownRefundAmount(record.amountPaidLabel)) {
    return record.amountPaidLabel.trim();
  }

  if (record.amount > 0) {
    return formatPaidAmount(record.amount, record.currency);
  }

  return null;
}

function applyCheckoutAmount(
  record: PaidBookingRecord,
  checkout: { amount?: number; currency?: string },
): string | null {
  if (typeof checkout.amount !== "number" || checkout.amount <= 0) {
    return null;
  }

  record.amount = checkout.amount;
  record.currency = checkout.currency ?? record.currency;
  record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
  return record.amountPaidLabel;
}

function calendarConfigured(env: RefundEnv): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

export type RefundIssueResult = {
  ok: boolean;
  alreadyRefunded?: boolean;
  paymentReference: string;
  refundAmount?: string;
  sumUpRefunded?: boolean;
  calendarCancelled?: number;
  /** @deprecated Use calendarCancelled */
  calendarDeleted?: number;
  trackingRemoved?: boolean;
  trackingMarkedRefunded?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  warnings?: string[];
  error?: string;
};

export async function issueBookingRefund(
  env: RefundEnv,
  paymentReferenceInput: string,
  options?: { trackingToken?: string },
): Promise<RefundIssueResult> {
  const paymentReference = paymentReferenceInput.trim();
  if (!paymentReference) {
    return { ok: false, paymentReference: "", error: "Missing payment reference" };
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, paymentReference, error: "Booking store is not configured" };
  }

  let record =
    (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) ??
    (await buildLegacyPaidBookingRecord(env, paymentReference, options?.trackingToken));

  if (!record) {
    return {
      ok: false,
      paymentReference,
      error: "Booking not found for that payment reference",
    };
  }

  if (record.status === "refunded") {
    return {
      ok: true,
      alreadyRefunded: true,
      paymentReference,
      refundAmount: record.refundAmountLabel ?? record.amountPaidLabel,
    };
  }

  const warnings: string[] = [];
  let refundAmountLabel = record.amountPaidLabel;
  let sumUpRefunded = false;

  const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";

  if (sumUpApiKey) {
    if (!record.transactionId || !resolveRefundAmountLabel(record, refundAmountLabel)) {
      const resolved = await resolveSumUpTransactionForRefund(
        sumUpApiKey,
        sumUpMerchantCode,
        record.paymentReference,
        record.checkoutId || undefined,
      );
      if (resolved?.id) {
        record.transactionId = resolved.id;
        if (typeof resolved.amount === "number" && resolved.amount > 0) {
          record.amount = resolved.amount;
          record.currency = resolved.currency ?? record.currency;
          record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
          refundAmountLabel = record.amountPaidLabel;
        }
      }
    }

    if (!resolveRefundAmountLabel(record, refundAmountLabel) && record.checkoutId) {
      try {
        const checkout = await getSumUpCheckout(sumUpApiKey, record.checkoutId);
        const transactionId = getSuccessfulTransactionId(checkout);
        if (transactionId) {
          record.transactionId = transactionId;
        }
        const checkoutAmount = applyCheckoutAmount(record, checkout);
        if (checkoutAmount) {
          refundAmountLabel = checkoutAmount;
        }
      } catch {
        // resolveSumUpTransactionForRefund already attempted checkout lookup.
      }
    }

    if (!record.transactionId) {
      return {
        ok: false,
        paymentReference,
        error: "Could not find SumUp transaction for this booking",
      };
    }

    const resolvedBeforeRefund = resolveRefundAmountLabel(record, refundAmountLabel);
    if (!resolvedBeforeRefund) {
      return {
        ok: false,
        paymentReference,
        error: "Could not determine refund amount for this booking",
      };
    }
    refundAmountLabel = resolvedBeforeRefund;

    try {
      const refund = await refundSumUpTransaction(
        sumUpApiKey,
        record.transactionId,
        undefined,
        sumUpMerchantCode || undefined,
      );
      sumUpRefunded = true;
      if (typeof refund.refundedAmount === "number" && refund.refundedAmount > 0) {
        refundAmountLabel = formatPaidAmount(refund.refundedAmount, refund.currency ?? record.currency);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      return { ok: false, paymentReference, error: detail };
    }
  } else {
    warnings.push("SumUp refund was not attempted — missing API key");
    const resolvedRefundAmount = resolveRefundAmountLabel(record, refundAmountLabel);
    if (!resolvedRefundAmount) {
      return {
        ok: false,
        paymentReference,
        error: "Could not determine refund amount for this booking",
      };
    }
    refundAmountLabel = resolvedRefundAmount;
  }

  let calendarCancelled = 0;
  if (calendarConfigured(env) && record.calendarEventIds.length > 0) {
    try {
      const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!);
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const refundNote =
        `Refunded: ${refundAmountLabel}\n` +
        `Reference: ${paymentReference}\n` +
        `Cancelled at: ${new Date().toISOString()}`;
      const result = await cancelCalendarEvents(
        accessToken,
        env.GOOGLE_CALENDAR_ID!.trim(),
        record.calendarEventIds,
        { refundNote },
      );
      calendarCancelled = result.cancelled;
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Calendar cancellation failed",
      );
    }
  } else if (calendarConfigured(env)) {
    warnings.push("No stored calendar event ids — calendar entry may remain");
  }

  let trackingMarkedRefunded = false;
  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token =
      record.trackingToken ??
      (await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference))?.token;
    if (token) {
      trackingMarkedRefunded = await markTrackingJobRefunded(
        env.TRACKING_STORE,
        token,
        refundAmountLabel,
      );
    }
  }

  const emailDetails = {
    customerName: record.customerName,
    paymentReference: record.paymentReference,
    refundAmount: refundAmountLabel,
    tripLabel: record.tripLabel,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    tripDate: record.tripDate,
    tripTime: record.tripTime,
  };

  const customerEmail = buildCustomerRefundConfirmationEmail(emailDetails, BUSINESS_NAME);
  const ownerEmail = buildOwnerRefundConfirmationEmail(emailDetails, BUSINESS_NAME);

  const customerEmailResult = await trySendBrandedCustomerEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const ownerEmailResult = await trySendOwnerOperationalEmail(env, {
    to: "bookings@myairporttaxini.co.uk",
    subject: ownerEmail.subject,
    body: ownerEmail.body,
  });

  if (!customerEmailResult.sent) {
    warnings.push(
      customerEmailResult.error
        ? `Customer refund email failed: ${customerEmailResult.error}`
        : "Customer refund email failed",
    );
  }

  if (!ownerEmailResult.sent) {
    warnings.push(
      ownerEmailResult.error
        ? `Owner refund email failed: ${ownerEmailResult.error}`
        : "Owner refund email failed",
    );
  }

  const existingPaidRecord = await getPaidBookingRecord(env.TRACKING_STORE!, paymentReference);
  if (existingPaidRecord) {
    await markPaidBookingRefunded(env.TRACKING_STORE!, paymentReference, refundAmountLabel);
  } else {
    await savePaidBookingRecord(env.TRACKING_STORE!, {
      ...record,
      status: "refunded",
      refundedAt: new Date().toISOString(),
      refundAmountLabel,
    });
  }

  return {
    ok: true,
    paymentReference,
    refundAmount: refundAmountLabel,
    sumUpRefunded,
    calendarCancelled,
    calendarDeleted: calendarCancelled,
    trackingRemoved: trackingMarkedRefunded,
    trackingMarkedRefunded,
    customerEmailSent: customerEmailResult.sent,
    ownerEmailSent: ownerEmailResult.sent,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function buildLegacyPaidBookingRecord(
  env: RefundEnv,
  paymentReference: string,
  trackingToken?: string,
): Promise<PaidBookingRecord | null> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return null;
  }

  let trackingJob =
    trackingToken?.trim()
      ? await getTrackingJob(env.TRACKING_STORE, trackingToken.trim())
      : null;

  if (
    trackingJob &&
    paymentReference &&
    trackingJob.paymentReference?.trim() &&
    trackingJob.paymentReference.trim() !== paymentReference.trim()
  ) {
    trackingJob = null;
  }

  if (!trackingJob) {
    trackingJob = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
  }

  if (!trackingJob) {
    return null;
  }

  const resolvedReference = trackingJob.paymentReference?.trim() || paymentReference;
  let transactionId: string | undefined;
  let amount = 0;
  let currency = "GBP";
  let amountPaidLabel = "Unknown";

  if (env.SUMUP_API_KEY?.trim() && env.SUMUP_MERCHANT_CODE?.trim()) {
    try {
      const transaction = await resolveSumUpTransactionForRefund(
        env.SUMUP_API_KEY.trim(),
        env.SUMUP_MERCHANT_CODE.trim(),
        resolvedReference,
      );
      if (transaction?.id) {
        transactionId = transaction.id;
        if (typeof transaction.amount === "number") {
          amount = transaction.amount;
          currency = transaction.currency ?? "GBP";
          amountPaidLabel = formatPaidAmount(amount, currency);
        }
      }
    } catch {
      // SumUp lookup is best-effort when building the legacy record.
    }
  }

  return {
    paymentReference: resolvedReference,
    checkoutId: "",
    transactionId,
    transactionCode: resolvedReference,
    amount,
    currency,
    amountPaidLabel,
    customerName: trackingJob.customerName,
    customerEmail: trackingJob.customerEmail ?? "",
    mobileNumber: trackingJob.customerMobile,
    tripLabel: "Airport transfer",
    pickupLabel: trackingJob.pickupLabel,
    dropoffLabel: trackingJob.dropoffLabel,
    returnJourney: false,
    tripDate: trackingJob.tripDate,
    tripTime: trackingJob.tripTime,
    trackingToken: trackingJob.token,
    calendarEventIds: [],
    status: "confirmed",
    createdAt: trackingJob.createdAt,
  };
}

export async function savePaidBookingRecordFromConfirm(input: {
  env: RefundEnv;
  booking: PaidBookingDetails;
  checkoutId: string;
  transactionId?: string;
  transactionCode?: string;
  amount: number;
  currency: string;
  amountPaidLabel: string;
  paymentReference: string;
  trackingToken?: string;
  calendarEventIds: string[];
}): Promise<void> {
  if (!paidBookingStoreConfigured(input.env.TRACKING_STORE)) {
    return;
  }

  const record: PaidBookingRecord = {
    paymentReference: input.paymentReference,
    checkoutId: input.checkoutId,
    transactionId: input.transactionId,
    transactionCode: input.transactionCode,
    amount: input.amount,
    currency: input.currency,
    amountPaidLabel: input.amountPaidLabel,
    customerName: input.booking.customerName,
    customerEmail: input.booking.customerEmail,
    mobileNumber: input.booking.mobileNumber,
    tripLabel: input.booking.tripLabel,
    pickupLabel: input.booking.pickupLabel,
    dropoffLabel: input.booking.dropoffLabel,
    returnJourney: input.booking.returnJourney,
    tripDate: input.booking.tripDate,
    tripTime: input.booking.tripTime,
    returnDate: input.booking.returnDate || undefined,
    returnTime: input.booking.returnTime || undefined,
    flightNumber: input.booking.flightNumber || undefined,
    returnFlightNumber: input.booking.returnFlightNumber || undefined,
    passengers: input.booking.passengers,
    suitcases: input.booking.suitcases,
    vehicle: input.booking.vehicle,
    journeyDistance: input.booking.journeyDistance,
    journeyDuration: input.booking.journeyDuration,
    isAirportTrip: input.booking.isAirportTrip,
    airportCode: input.booking.airportCode,
    isFromAirport: input.booking.isFromAirport,
    termsAcceptedAt: input.booking.termsAcceptedAt,
    termsVersion: input.booking.termsVersion,
    trackingToken: input.trackingToken,
    calendarEventIds: input.calendarEventIds,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  await savePaidBookingRecord(input.env.TRACKING_STORE, record);
}

export async function handleRefundRequest(
  request: Request,
  env: RefundEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return json(
      { error: "Unauthorized — refunds require the owner access key (OWNER_ACCESS_KEY)." },
      401,
      origin,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const paymentReference = String(body.paymentReference ?? "").trim();
  if (!paymentReference) {
    return json({ error: "Missing paymentReference" }, 400, origin);
  }

  const trackingToken = String(body.trackingToken ?? "").trim() || undefined;
  const result = await issueBookingRefund(env, paymentReference, { trackingToken });
  return json(result, result.ok ? 200 : 502, origin);
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Accept, X-Owner-Key, X-Driver-Key";

  return new Response(JSON.stringify(body), { status, headers });
}

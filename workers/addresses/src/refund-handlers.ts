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
  refundSumUpTransaction,
} from "../shared/sumup-checkout";
import {
  deleteCalendarEvents,
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
  cancelTrackingJob,
  findTrackingJobByPaymentReference,
  trackingStoreConfigured,
} from "./tracking-store";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

type RefundEnv = WorkerEmailEnv & {
  SUMUP_API_KEY?: string;
  TRACKING_STORE?: KVNamespace;
  BOOKING_TO_EMAIL?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
const BUSINESS_NAME = "My Airport Taxi NI";

export function ownerAuthorized(request: Request, env: RefundEnv): boolean {
  const expected = env.OWNER_ACCESS_KEY?.trim() || env.DRIVER_ACCESS_KEY?.trim() || "";
  if (!expected) {
    return false;
  }

  const headerKey = request.headers.get("X-Owner-Key")?.trim() ?? "";
  const driverKey = request.headers.get("X-Driver-Key")?.trim() ?? "";
  const urlKey = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  const provided = headerKey || driverKey || urlKey;
  return provided === expected;
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
  calendarDeleted?: number;
  trackingRemoved?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  warnings?: string[];
  error?: string;
};

export async function issueBookingRefund(
  env: RefundEnv,
  paymentReferenceInput: string,
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
    (await buildLegacyPaidBookingRecord(env, paymentReference));

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

  if (env.SUMUP_API_KEY?.trim() && record.transactionId) {
    try {
      const refund = await refundSumUpTransaction(env.SUMUP_API_KEY.trim(), record.transactionId);
      if (typeof refund.refundedAmount === "number") {
        refundAmountLabel = formatPaidAmount(refund.refundedAmount, refund.currency ?? record.currency);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      return { ok: false, paymentReference, error: detail };
    }
  } else if (env.SUMUP_API_KEY?.trim() && record.checkoutId) {
    try {
      const checkout = await getSumUpCheckout(env.SUMUP_API_KEY.trim(), record.checkoutId);
      const transactionId = getSuccessfulTransactionId(checkout);
      if (!transactionId) {
        return {
          ok: false,
          paymentReference,
          error: "Could not find SumUp transaction for this booking",
        };
      }
      record.transactionId = transactionId;
      const refund = await refundSumUpTransaction(env.SUMUP_API_KEY.trim(), transactionId);
      if (typeof refund.refundedAmount === "number") {
        refundAmountLabel = formatPaidAmount(refund.refundedAmount, refund.currency ?? record.currency);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      return { ok: false, paymentReference, error: detail };
    }
  } else {
    warnings.push("SumUp refund was not attempted — missing API key or transaction id");
  }

  let calendarDeleted = 0;
  if (calendarConfigured(env) && record.calendarEventIds.length > 0) {
    try {
      const serviceAccount = parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!);
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const result = await deleteCalendarEvents(
        accessToken,
        env.GOOGLE_CALENDAR_ID!.trim(),
        record.calendarEventIds,
      );
      calendarDeleted = result.deleted;
      if (result.errors.length > 0) {
        warnings.push(...result.errors.map((message) => `Calendar: ${message}`));
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Calendar deletion failed",
      );
    }
  } else if (calendarConfigured(env)) {
    warnings.push("No stored calendar event ids — calendar entry may remain");
  }

  let trackingRemoved = false;
  if (trackingStoreConfigured(env.TRACKING_STORE)) {
    const token =
      record.trackingToken ??
      (await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference))?.token;
    if (token) {
      trackingRemoved = await cancelTrackingJob(env.TRACKING_STORE, token);
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

  const customerEmailResult = await trySendEmail(env, {
    to: record.customerEmail,
    toName: record.customerName,
    subject: customerEmail.subject,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  const ownerEmailResult = await trySendEmail(env, {
    to: env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL,
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

  await markPaidBookingRefunded(env.TRACKING_STORE, paymentReference, refundAmountLabel);

  return {
    ok: true,
    paymentReference,
    refundAmount: refundAmountLabel,
    sumUpRefunded: Boolean(record.transactionId || record.checkoutId),
    calendarDeleted,
    trackingRemoved,
    customerEmailSent: customerEmailResult.sent,
    ownerEmailSent: ownerEmailResult.sent,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function buildLegacyPaidBookingRecord(
  env: RefundEnv,
  paymentReference: string,
): Promise<PaidBookingRecord | null> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return null;
  }

  const trackingJob = await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference);
  if (!trackingJob) {
    return null;
  }

  return {
    paymentReference,
    checkoutId: "",
    transactionCode: paymentReference,
    amount: 0,
    currency: "GBP",
    amountPaidLabel: "Unknown",
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
    return json({ error: "Unauthorized" }, 401, origin);
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

  const result = await issueBookingRefund(env, paymentReference);
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
  headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, X-Owner-Key";

  return new Response(JSON.stringify(body), { status, headers });
}

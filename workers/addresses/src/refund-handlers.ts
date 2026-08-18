/**
 * Paid booking refund / cancellation — extends the existing SumUp refund pipeline.
 * Supports full/partial refunds, cancel-without-refund, and refund-without-cancel.
 */

import {
  buildCustomerRefundConfirmationEmail,
  buildOwnerRefundConfirmationEmail,
  buildCustomerCancellationEmails,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  generateRefundOpId,
  isOperationallyCancelled,
  isWithin24HoursOfPickup,
  nextMoneyStatus,
  ownerNotesRequired,
  parseMoneyLabelToNumber,
  remainingRefundableBalance,
  resolveRefundAmountForAction,
  roundGbp,
  type RefundActionKind,
  type RefundAuditEntry,
  type RefundReasonCategory,
  REFUND_REASON_CATEGORIES,
} from "../shared/refund-ops";
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
  paidBookingStoreConfigured,
  savePaidBookingRecord,
} from "./paid-booking-store";
import {
  findTrackingJobByPaymentReference,
  getTrackingJob,
  markTrackingJobRefunded,
  trackingStoreConfigured,
} from "./tracking-store";
import {
  trySendBrandedCustomerEmail,
  trySendOwnerOperationalEmail,
  type WorkerEmailEnv,
} from "./worker-email";
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

const BUSINESS_NAME = "My Airport Taxi NI";

function normalizeSecret(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function expectedOwnerKey(env: RefundEnv): string {
  if (env.OWNER_ACCESS_KEY?.trim()) return normalizeSecret(env.OWNER_ACCESS_KEY);
  if (env.DRIVER_ACCESS_KEY?.trim()) return normalizeSecret(env.DRIVER_ACCESS_KEY);
  return "";
}

function verifyConfirmOwnerKey(env: RefundEnv, confirmOwnerKey: string): boolean {
  const expected = expectedOwnerKey(env);
  const provided = normalizeSecret(confirmOwnerKey);
  return Boolean(expected) && Boolean(provided) && expected === provided;
}

function isKnownRefundAmount(label: string | undefined): boolean {
  const trimmed = label?.trim() ?? "";
  return Boolean(trimmed) && trimmed.toLowerCase() !== "unknown";
}

function calendarConfigured(env: RefundEnv): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function amountPaidOf(record: PaidBookingRecord): number {
  if (typeof record.amount === "number" && record.amount > 0) return roundGbp(record.amount);
  return parseMoneyLabelToNumber(record.amountPaidLabel) ?? 0;
}

function amountRefundedOf(record: PaidBookingRecord): number {
  if (typeof record.amountRefunded === "number" && record.amountRefunded >= 0) {
    return roundGbp(record.amountRefunded);
  }
  if (record.status === "refunded") return amountPaidOf(record);
  return 0;
}

function refundLockKey(paymentReference: string): string {
  return `booking:refund-lock:${paymentReference.trim().toLowerCase()}`;
}

export type RefundIssueResult = {
  ok: boolean;
  alreadyRefunded?: boolean;
  alreadyProcessed?: boolean;
  paymentReference: string;
  refundAmount?: string;
  refundAmountValue?: number;
  cumulativeRefunded?: number;
  remainingBalance?: number;
  status?: string;
  cancelBooking?: boolean;
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
  auditId?: string;
};

export type ProcessRefundOptions = {
  trackingToken?: string;
  amount?: number | null;
  cancelBooking?: boolean;
  refundFullRemaining?: boolean;
  reasonCategory?: RefundReasonCategory;
  ownerNotes?: string;
  customerFacingReason?: string;
  idempotencyKey?: string;
  confirmOwnerKey?: string;
  actionKind?: RefundActionKind;
  /** Legacy path: skip confirm-key body check (header auth only). Prefer false. */
  legacyFullRefund?: boolean;
};

/**
 * Backward-compatible full refund + cancel (existing admin / owner one-click).
 * New UI should call processBookingRefundOrCancel with explicit options + re-auth key.
 */
export async function issueBookingRefund(
  env: RefundEnv,
  paymentReferenceInput: string,
  options?: { trackingToken?: string },
): Promise<RefundIssueResult> {
  return processBookingRefundOrCancel(env, {
    paymentReference: paymentReferenceInput,
    trackingToken: options?.trackingToken,
    cancelBooking: true,
    refundFullRemaining: true,
    reasonCategory: "other",
    ownerNotes: "Legacy full refund + cancel",
    idempotencyKey: `legacy-full-${paymentReferenceInput.trim()}-${Date.now()}`,
    actionKind: "cancel_full_refund",
    legacyFullRefund: true,
  });
}

export async function processBookingRefundOrCancel(
  env: RefundEnv,
  options: ProcessRefundOptions & { paymentReference: string },
): Promise<RefundIssueResult> {
  const paymentReference = options.paymentReference.trim();
  if (!paymentReference) {
    return { ok: false, paymentReference: "", error: "Missing payment reference" };
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, paymentReference, error: "Booking store is not configured" };
  }

  if (!options.legacyFullRefund) {
    if (!options.confirmOwnerKey || !verifyConfirmOwnerKey(env, options.confirmOwnerKey)) {
      return {
        ok: false,
        paymentReference,
        error: "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation.",
      };
    }
  }

  const actionKind: RefundActionKind = options.actionKind ?? "cancel_full_refund";
  const cancelBooking = options.cancelBooking ?? true;
  const refundFullRemaining = options.refundFullRemaining ?? true;
  const reasonCategory = options.reasonCategory ?? "other";
  if (!REFUND_REASON_CATEGORIES.includes(reasonCategory)) {
    return { ok: false, paymentReference, error: "Invalid refund reason category." };
  }

  const idempotencyKey = (options.idempotencyKey ?? "").trim();
  if (!idempotencyKey) {
    return { ok: false, paymentReference, error: "Missing idempotency key." };
  }

  let record =
    (await getPaidBookingRecord(env.TRACKING_STORE, paymentReference)) ??
    (await buildLegacyPaidBookingRecord(env, paymentReference, options.trackingToken));

  if (!record) {
    return {
      ok: false,
      paymentReference,
      error: "Booking not found for that payment reference",
    };
  }

  const prior = (record.refundHistory ?? []).find(
    (entry) => entry.idempotencyKey === idempotencyKey && entry.success,
  );
  if (prior) {
    return {
      ok: true,
      alreadyProcessed: true,
      paymentReference,
      refundAmount: formatPaidAmount(prior.refundAmount, prior.currency),
      refundAmountValue: prior.refundAmount,
      cumulativeRefunded: prior.cumulativeRefundedAmount,
      remainingBalance: prior.remainingBalance,
      status: record.status,
      cancelBooking: prior.cancelBooking,
      auditId: prior.id,
    };
  }

  if (record.status === "refunded" && refundFullRemaining && !cancelBooking) {
    return {
      ok: true,
      alreadyRefunded: true,
      paymentReference,
      refundAmount: record.refundAmountLabel ?? record.amountPaidLabel,
      status: record.status,
    };
  }

  const amountPaid = amountPaidOf(record);
  const alreadyRefunded = amountRefundedOf(record);
  const remaining = remainingRefundableBalance(amountPaid, alreadyRefunded);

  const resolved = resolveRefundAmountForAction({
    actionKind,
    remainingBalance: remaining,
    amount: options.amount,
    refundFullRemaining,
  });
  if (resolved.error) {
    return { ok: false, paymentReference, error: resolved.error };
  }
  const refundAmount = resolved.refundAmount;

  if (refundAmount <= 0 && !cancelBooking) {
    return {
      ok: false,
      paymentReference,
      error: "Nothing to do — choose a refund amount and/or cancel the booking.",
    };
  }

  const within24h = isWithin24HoursOfPickup(record.tripDate, record.tripTime);
  const notes = (options.ownerNotes ?? "").trim();
  if (
    ownerNotesRequired({
      reasonCategory,
      refundAmount,
      refundFullRemaining: refundAmount >= remaining - 0.001 && refundAmount > 0,
      within24h,
    }) &&
    !notes
  ) {
    return {
      ok: false,
      paymentReference,
      error: "Owner notes are required for this refund/cancellation.",
    };
  }

  const requestedAt = new Date().toISOString();
  const auditId = generateRefundOpId();
  const warnings: string[] = [];

  // Short-lived lock against double-submit races.
  const lockKey = refundLockKey(paymentReference);
  try {
    const existingLock = await env.TRACKING_STORE!.get(lockKey);
    if (existingLock && existingLock !== idempotencyKey) {
      return {
        ok: false,
        paymentReference,
        error: "Another refund is already in progress for this booking. Wait and retry.",
      };
    }
    await env.TRACKING_STORE!.put(lockKey, idempotencyKey, { expirationTtl: 90 });
  } catch {
    warnings.push("Could not acquire refund lock — continuing carefully");
  }

  let sumUpRefunded = false;
  let sumUpStatus = "skipped";
  let sumUpReference: string | undefined;
  let refundAmountLabel =
    refundAmount > 0 ? formatPaidAmount(refundAmount, record.currency || "GBP") : "£0";

  if (refundAmount > 0) {
    const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
    const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";

    if (!sumUpApiKey) {
      await appendFailedAudit(env, record, {
        id: auditId,
        bookingReference: paymentReference,
        originalAmountPaid: amountPaid,
        refundAmount,
        cumulativeRefundedAmount: alreadyRefunded,
        remainingBalance: remaining,
        currency: record.currency || "GBP",
        fullOrPartial: refundAmount >= remaining - 0.001 ? "full" : "partial",
        cancelBooking,
        reasonCategory,
        ownerNotes: notes,
        customerFacingReason: options.customerFacingReason?.trim() || undefined,
        requestedAt,
        success: false,
        failureDetail: "SumUp refund was not attempted — missing API key",
        customerEmailStatus: "skipped",
        ownerEmailStatus: "skipped",
        idempotencyKey,
        actionKind,
        sumUpStatus: "missing_api_key",
      });
      await clearLock(env, lockKey, idempotencyKey);
      return {
        ok: false,
        paymentReference,
        error: "SumUp refund was not attempted — missing API key",
        auditId,
      };
    }

    if (!record.transactionId) {
      const resolvedTx = await resolveSumUpTransactionForRefund(
        sumUpApiKey,
        sumUpMerchantCode,
        record.paymentReference,
        record.checkoutId || undefined,
      );
      if (resolvedTx?.id) {
        record.transactionId = resolvedTx.id;
        if (typeof resolvedTx.amount === "number" && resolvedTx.amount > 0) {
          record.amount = resolvedTx.amount;
          record.currency = resolvedTx.currency ?? record.currency;
          record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
        }
      }
    }

    if (!record.transactionId && record.checkoutId) {
      try {
        const checkout = await getSumUpCheckout(sumUpApiKey, record.checkoutId);
        const transactionId = getSuccessfulTransactionId(checkout);
        if (transactionId) record.transactionId = transactionId;
        if (typeof checkout.amount === "number" && checkout.amount > 0) {
          record.amount = checkout.amount;
          record.currency = checkout.currency ?? record.currency;
          record.amountPaidLabel = formatPaidAmount(record.amount, record.currency);
        }
      } catch {
        // best effort
      }
    }

    if (!record.transactionId) {
      await appendFailedAudit(env, record, {
        id: auditId,
        bookingReference: paymentReference,
        originalAmountPaid: amountPaidOf(record),
        refundAmount,
        cumulativeRefundedAmount: alreadyRefunded,
        remainingBalance: remaining,
        currency: record.currency || "GBP",
        fullOrPartial: "partial",
        cancelBooking,
        reasonCategory,
        ownerNotes: notes,
        requestedAt,
        success: false,
        failureDetail: "Could not find SumUp transaction for this booking",
        customerEmailStatus: "skipped",
        ownerEmailStatus: "skipped",
        idempotencyKey,
        actionKind,
        sumUpStatus: "transaction_not_found",
      });
      await clearLock(env, lockKey, idempotencyKey);
      return {
        ok: false,
        paymentReference,
        error: "Could not find SumUp transaction for this booking",
        auditId,
      };
    }

    try {
      const refund = await refundSumUpTransaction(
        sumUpApiKey,
        record.transactionId,
        // Always pass explicit GBP amount for partials and remaining balances.
        refundAmount,
        sumUpMerchantCode || undefined,
      );
      sumUpRefunded = true;
      sumUpStatus = "accepted";
      sumUpReference = record.transactionId;
      if (typeof refund.refundedAmount === "number" && refund.refundedAmount > 0) {
        refundAmountLabel = formatPaidAmount(
          refund.refundedAmount,
          refund.currency ?? record.currency,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      await appendFailedAudit(env, record, {
        id: auditId,
        bookingReference: paymentReference,
        sumUpTransactionId: record.transactionId,
        originalAmountPaid: amountPaidOf(record),
        refundAmount,
        cumulativeRefundedAmount: alreadyRefunded,
        remainingBalance: remaining,
        currency: record.currency || "GBP",
        fullOrPartial: refundAmount >= remaining - 0.001 ? "full" : "partial",
        cancelBooking,
        reasonCategory,
        ownerNotes: notes,
        requestedAt,
        completedAt: new Date().toISOString(),
        success: false,
        failureDetail: detail,
        customerEmailStatus: "skipped",
        ownerEmailStatus: "pending",
        idempotencyKey,
        actionKind,
        sumUpStatus: "failed",
      });

      // Alert owner — never tell customer the refund completed.
      await trySendOwnerOperationalEmail(env, {
        to: "bookings@myairporttaxini.co.uk",
        subject: `REFUND FAILED — ${record.customerName} — ${paymentReference}`,
        body:
          `SumUp refund FAILED for ${paymentReference}.\n` +
          `Customer: ${record.customerName}\n` +
          `Attempted amount: ${refundAmountLabel}\n` +
          `Detail: ${detail}\n` +
          `No customer refund-completed email was sent.\n` +
          `You can safely retry after checking SumUp.`,
      });

      await clearLock(env, lockKey, idempotencyKey);
      return { ok: false, paymentReference, error: detail, auditId };
    }
  }

  // Operational cancel (calendar + tracking) only when requested.
  let calendarCancelled = 0;
  let trackingMarkedRefunded = false;
  if (cancelBooking) {
    if (calendarConfigured(env) && record.calendarEventIds.length > 0) {
      try {
        const serviceAccount = parseServiceAccountJson(
          env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
        );
        const accessToken = await getGoogleAccessToken(serviceAccount);
        const refundNote =
          `${refundAmount > 0 ? `Refunded: ${refundAmountLabel}` : "Cancelled without refund"}\n` +
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

    if (trackingStoreConfigured(env.TRACKING_STORE)) {
      const token =
        record.trackingToken ??
        (await findTrackingJobByPaymentReference(env.TRACKING_STORE, paymentReference))
          ?.token;
      if (token) {
        trackingMarkedRefunded = await markTrackingJobRefunded(
          env.TRACKING_STORE,
          token,
          refundAmount > 0 ? refundAmountLabel : "Cancelled",
        );
      }
    }
  }

  const paidAfter = amountPaidOf(record);
  const cumulative = roundGbp(alreadyRefunded + refundAmount);
  const remainingAfter = remainingRefundableBalance(paidAfter, cumulative);
  const nextStatus = nextMoneyStatus({
    cancelBooking: cancelBooking || isOperationallyCancelled(record.status),
    amountPaid: paidAfter,
    amountRefundedAfter: cumulative,
  });

  const emailBundle = buildCustomerCancellationEmails(
    {
      customerName: record.customerName,
      paymentReference: record.paymentReference,
      refundAmount: refundAmountLabel,
      refundAmountValue: refundAmount,
      originalAmount: formatPaidAmount(paidAfter, record.currency || "GBP"),
      originalAmountValue: paidAfter,
      cumulativeRefunded: formatPaidAmount(cumulative, record.currency || "GBP"),
      remainingPaid: formatPaidAmount(remainingAfter, record.currency || "GBP"),
      tripLabel: record.tripLabel,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      cancelBooking,
      within24h,
      reasonCategory,
      customerFacingReason: options.customerFacingReason?.trim() || undefined,
      bookingRemainsActive: !cancelBooking && !isOperationallyCancelled(nextStatus),
      actionKind,
    },
    BUSINESS_NAME,
  );

  let customerEmailSent = false;
  let ownerEmailSent = false;
  let customerEmailStatus: RefundAuditEntry["customerEmailStatus"] = "skipped";
  let ownerEmailStatus: RefundAuditEntry["ownerEmailStatus"] = "skipped";

  if (emailBundle.customer) {
    const customerEmailResult = await trySendBrandedCustomerEmail(env, {
      to: record.customerEmail,
      toName: record.customerName,
      subject: emailBundle.customer.subject,
      body: emailBundle.customer.text,
      htmlBody: emailBundle.customer.html,
    });
    customerEmailSent = customerEmailResult.sent;
    customerEmailStatus = customerEmailResult.sent ? "sent" : "failed";
    if (!customerEmailResult.sent) {
      warnings.push(
        customerEmailResult.error
          ? `Customer email failed: ${customerEmailResult.error}`
          : "Customer email failed",
      );
    }
  }

  const ownerEmail =
    emailBundle.owner ??
    buildOwnerRefundConfirmationEmail(
      {
        customerName: record.customerName,
        paymentReference: record.paymentReference,
        refundAmount: refundAmountLabel,
        tripLabel: record.tripLabel,
        pickupLabel: record.pickupLabel,
        dropoffLabel: record.dropoffLabel,
        tripDate: record.tripDate,
        tripTime: record.tripTime,
      },
      BUSINESS_NAME,
    );

  const ownerEmailResult = await trySendOwnerOperationalEmail(env, {
    to: "bookings@myairporttaxini.co.uk",
    subject: ownerEmail.subject,
    body: ownerEmail.body,
  });
  ownerEmailSent = ownerEmailResult.sent;
  ownerEmailStatus = ownerEmailResult.sent ? "sent" : "failed";
  if (!ownerEmailResult.sent) {
    warnings.push(
      ownerEmailResult.error
        ? `Owner email failed: ${ownerEmailResult.error}`
        : "Owner email failed",
    );
  }

  const completedAt = new Date().toISOString();
  const audit: RefundAuditEntry = {
    id: auditId,
    bookingReference: paymentReference,
    sumUpTransactionId: record.transactionId,
    originalAmountPaid: paidAfter,
    refundAmount,
    cumulativeRefundedAmount: cumulative,
    remainingBalance: remainingAfter,
    currency: record.currency || "GBP",
    fullOrPartial:
      refundAmount <= 0 ? "none" : remainingAfter <= 0.001 ? "full" : "partial",
    cancelBooking,
    reasonCategory,
    ownerNotes: notes,
    customerFacingReason: options.customerFacingReason?.trim() || undefined,
    requestedAt,
    completedAt,
    sumUpStatus,
    sumUpReference,
    success: true,
    customerEmailStatus,
    ownerEmailStatus,
    idempotencyKey,
    actionKind,
  };

  const updated: PaidBookingRecord = {
    ...record,
    amount: paidAfter,
    amountPaidLabel: formatPaidAmount(paidAfter, record.currency || "GBP"),
    amountRefunded: cumulative,
    status: nextStatus,
    refundAmountLabel:
      cumulative > 0
        ? formatPaidAmount(cumulative, record.currency || "GBP")
        : record.refundAmountLabel,
    ...(refundAmount > 0 || nextStatus === "refunded"
      ? { refundedAt: record.refundedAt ?? completedAt }
      : {}),
    ...(cancelBooking ? { cancelledAt: record.cancelledAt ?? completedAt } : {}),
    refundHistory: [...(record.refundHistory ?? []), audit],
  };

  await savePaidBookingRecord(env.TRACKING_STORE!, updated, {
    previousTripDate: record.tripDate,
  });
  await clearLock(env, lockKey, idempotencyKey);

  return {
    ok: true,
    paymentReference,
    refundAmount: refundAmountLabel,
    refundAmountValue: refundAmount,
    cumulativeRefunded: cumulative,
    remainingBalance: remainingAfter,
    status: nextStatus,
    cancelBooking,
    sumUpRefunded,
    calendarCancelled,
    calendarDeleted: calendarCancelled,
    trackingRemoved: trackingMarkedRefunded,
    trackingMarkedRefunded,
    customerEmailSent,
    ownerEmailSent,
    auditId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function clearLock(
  env: RefundEnv,
  lockKey: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    const current = await env.TRACKING_STORE!.get(lockKey);
    if (current === idempotencyKey) {
      await env.TRACKING_STORE!.delete(lockKey);
    }
  } catch {
    // ignore
  }
}

async function appendFailedAudit(
  env: RefundEnv,
  record: PaidBookingRecord,
  entry: RefundAuditEntry,
): Promise<void> {
  try {
    const latest =
      (await getPaidBookingRecord(env.TRACKING_STORE!, record.paymentReference)) ?? record;
    await savePaidBookingRecord(
      env.TRACKING_STORE!,
      {
        ...latest,
        refundHistory: [...(latest.refundHistory ?? []), entry],
      },
      { previousTripDate: latest.tripDate },
    );
  } catch {
    // Audit write failure must not hide the primary error.
  }
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
      // best effort
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
    amountRefunded: 0,
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
  personalQuoteCode?: string;
  standardWebsiteAmount?: number;
  personalQuotedAmount?: number;
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
    amountRefunded: 0,
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
    cancellationPolicyVersion: input.booking.cancellationPolicyVersion,
    trackingToken: input.trackingToken,
    calendarEventIds: input.calendarEventIds,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...(input.personalQuoteCode ? { personalQuoteCode: input.personalQuoteCode } : {}),
    ...(typeof input.standardWebsiteAmount === "number"
      ? { standardWebsiteAmount: input.standardWebsiteAmount }
      : {}),
    ...(typeof input.personalQuotedAmount === "number"
      ? { personalQuotedAmount: input.personalQuotedAmount }
      : {}),
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
  const confirmOwnerKey = String(body.confirmOwnerKey ?? body.ownerKey ?? "").trim();
  const hasExtendedFields =
    body.actionKind != null ||
    body.cancelBooking != null ||
    body.amount != null ||
    body.refundFullRemaining != null ||
    body.reasonCategory != null ||
    body.idempotencyKey != null ||
    Boolean(confirmOwnerKey);

  // Legacy clients: header-auth full refund + cancel (admin page / old owner button).
  if (!hasExtendedFields) {
    const result = await issueBookingRefund(env, paymentReference, { trackingToken });
    return json(result, result.ok ? 200 : 502, origin);
  }

  if (!confirmOwnerKey || !verifyConfirmOwnerKey(env, confirmOwnerKey)) {
    return json(
      {
        error:
          "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation (server-side check).",
      },
      401,
      origin,
    );
  }

  const actionKind = String(body.actionKind ?? "cancel_full_refund") as RefundActionKind;
  const cancelBooking =
    body.cancelBooking === true ||
    actionKind === "cancel_full_refund" ||
    actionKind === "cancel_partial_refund" ||
    actionKind === "cancel_no_refund" ||
    actionKind === "full_refund_and_cancel";
  const refundFullRemaining =
    body.refundFullRemaining === true ||
    actionKind === "cancel_full_refund" ||
    actionKind === "full_refund_keep_active" ||
    actionKind === "full_refund_and_cancel";

  const result = await processBookingRefundOrCancel(env, {
    paymentReference,
    trackingToken,
    amount: body.amount != null ? Number(body.amount) : null,
    cancelBooking,
    refundFullRemaining,
    reasonCategory: String(body.reasonCategory ?? "other") as RefundReasonCategory,
    ownerNotes: String(body.ownerNotes ?? ""),
    customerFacingReason: String(body.customerFacingReason ?? ""),
    idempotencyKey: String(body.idempotencyKey ?? ""),
    confirmOwnerKey,
    actionKind,
    legacyFullRefund: false,
  });

  const status = result.ok ? 200 : result.error?.includes("OWNER_ACCESS_KEY") ? 401 : 502;
  return json(result, status, origin);
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

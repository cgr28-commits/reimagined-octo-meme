/**
 * Paid booking refund / cancellation — extends the existing SumUp refund pipeline.
 * Supports full/partial refunds, cancel-without-refund, and refund-without-cancel.
 *
 * Money-moving work must be routed through RefundCoordinator (Durable Object).
 * Serialization uses DO blockConcurrencyWhile — no KV refund locks.
 */

import {
  buildOwnerRefundConfirmationEmail,
  buildCustomerCancellationEmails,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  cappedRefundAmount,
  generateRefundOpId,
  isWithin24HoursOfPickup,
  nextBookingStatuses,
  ownerNotesRequired,
  parseMoneyLabelToNumber,
  remainingRefundableBalance,
  resolveOperationalStatus,
  resolvePaymentStatusFromRecord,
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
  getSumUpTransactionDetails,
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
    REFUND_COORDINATOR?: DurableObjectNamespace;
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

function calendarConfigured(env: RefundEnv): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

function amountPaidOf(record: PaidBookingRecord): number {
  if (typeof record.amount === "number" && record.amount > 0) return roundGbp(record.amount);
  return parseMoneyLabelToNumber(record.amountPaidLabel) ?? 0;
}

/** Treat legacy refunded / refunded_active as fully refunded when amountRefunded is missing. */
function amountRefundedOf(record: PaidBookingRecord): number {
  if (typeof record.amountRefunded === "number" && record.amountRefunded >= 0) {
    return roundGbp(record.amountRefunded);
  }
  if (record.status === "refunded" || record.status === "refunded_active") {
    return amountPaidOf(record);
  }
  return 0;
}

function isTerminalMoneySuccess(entry: RefundAuditEntry): boolean {
  return (
    entry.success &&
    (entry.operationState === "processor_accepted" || entry.operationState === "completed")
  );
}

function isUncertainEntry(entry: RefundAuditEntry): boolean {
  if (entry.operationState === "completed" || entry.operationState === "failed") return false;
  if (entry.operationState === "processing" || entry.operationState === "reconciliation_required") {
    return true;
  }
  if (entry.operationState === "processor_accepted" && !entry.completedAt) return true;
  return false;
}

function patchAuditEntry(
  record: PaidBookingRecord,
  auditId: string,
  patch: Partial<RefundAuditEntry>,
): PaidBookingRecord {
  const history = record.refundHistory ?? [];
  return {
    ...record,
    refundHistory: history.map((entry) =>
      entry.id === auditId ? { ...entry, ...patch } : entry,
    ),
  };
}

async function persistRecord(
  env: RefundEnv,
  record: PaidBookingRecord,
  previousTripDate?: string,
): Promise<void> {
  await savePaidBookingRecord(env.TRACKING_STORE!, record, {
    previousTripDate,
  });
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
  confirmOwnerKey: string;
  actionKind?: RefundActionKind;
};

/**
 * Backward-compatible full refund + cancel (existing admin / owner one-click).
 * Requires confirmOwnerKey — no bypass path.
 */
export async function issueBookingRefund(
  env: RefundEnv,
  paymentReferenceInput: string,
  options: { trackingToken?: string; confirmOwnerKey: string },
): Promise<RefundIssueResult> {
  const paymentReference = paymentReferenceInput.trim();
  if (!options.confirmOwnerKey || !verifyConfirmOwnerKey(env, options.confirmOwnerKey)) {
    return {
      ok: false,
      paymentReference,
      error: "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation.",
    };
  }

  return processBookingRefundOrCancel(env, {
    paymentReference,
    trackingToken: options.trackingToken,
    cancelBooking: true,
    refundFullRemaining: true,
    reasonCategory: "other",
    ownerNotes: "Legacy full refund + cancel",
    idempotencyKey: `legacy-full-${paymentReference}-${Date.now()}`,
    actionKind: "cancel_full_refund",
    confirmOwnerKey: options.confirmOwnerKey,
  });
}

export async function processBookingRefundOrCancel(
  env: RefundEnv,
  options: ProcessRefundOptions & { paymentReference: string },
): Promise<RefundIssueResult> {
  // Serialization is handled by RefundCoordinator Durable Object (blockConcurrencyWhile).
  // No KV refund lock here — callers must route money-moving work through the DO.
  const paymentReference = options.paymentReference.trim();
  if (!paymentReference) {
    return { ok: false, paymentReference: "", error: "Missing payment reference" };
  }

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return { ok: false, paymentReference, error: "Booking store is not configured" };
  }

  if (!options.confirmOwnerKey || !verifyConfirmOwnerKey(env, options.confirmOwnerKey)) {
    return {
      ok: false,
      paymentReference,
      error: "Re-enter OWNER_ACCESS_KEY to confirm this refund or cancellation.",
    };
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

  const initialTripDateRef = { value: "" };

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
  initialTripDateRef.value = record.tripDate;

  const priorSameKey = (record.refundHistory ?? []).find(
    (entry) => entry.idempotencyKey === idempotencyKey,
  );

  if (priorSameKey && isTerminalMoneySuccess(priorSameKey)) {
    return {
      ok: true,
      alreadyProcessed: true,
      paymentReference,
      refundAmount: formatPaidAmount(priorSameKey.refundAmount, priorSameKey.currency),
      refundAmountValue: priorSameKey.refundAmount,
      cumulativeRefunded: priorSameKey.cumulativeRefundedAmount,
      remainingBalance: priorSameKey.remainingBalance,
      status: record.status,
      cancelBooking: priorSameKey.cancelBooking,
      auditId: priorSameKey.id,
    };
  }

  if (priorSameKey && isUncertainEntry(priorSameKey)) {
    return await finishUncertainRefund(env, record, priorSameKey, {
      paymentReference,
      cancelBooking,
      reasonCategory,
      customerFacingReason: options.customerFacingReason?.trim() || undefined,
      actionKind,
      initialTripDate: initialTripDateRef.value,
    });
  }

  const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";

  // Different idempotency key — reconcile SumUp totals first so cumulative cannot exceed paid.
  if (sumUpApiKey) {
    const reconciled = await reconcileRecordWithSumUp(
      env,
      record,
      sumUpApiKey,
      sumUpMerchantCode,
      initialTripDateRef.value,
    );
    record = reconciled.record;
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
  const requestedRefundAmount = resolved.refundAmount;

  if (requestedRefundAmount <= 0 && !cancelBooking) {
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
      refundAmount: requestedRefundAmount,
      refundFullRemaining:
        requestedRefundAmount >= remaining - 0.001 && requestedRefundAmount > 0,
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

  const previouslyCancelled = resolveOperationalStatus(record) === "cancelled";

  let refundAmount = requestedRefundAmount;
  let refundAmountLabel =
    refundAmount > 0 ? formatPaidAmount(refundAmount, record.currency || "GBP") : "£0";
  let sumUpRefunded = false;

  const baseAudit: Omit<RefundAuditEntry, "operationState"> = {
    id: auditId,
    bookingReference: paymentReference,
    sumUpTransactionId: record.transactionId,
    originalAmountPaid: amountPaid,
    refundAmount,
    cumulativeRefundedAmount: alreadyRefunded,
    remainingBalance: remaining,
    currency: record.currency || "GBP",
    fullOrPartial:
      refundAmount <= 0 ? "none" : remaining - refundAmount <= 0.001 ? "full" : "partial",
    cancelBooking,
    reasonCategory,
    ownerNotes: notes,
    customerFacingReason: options.customerFacingReason?.trim() || undefined,
    requestedAt,
    success: false,
    customerEmailStatus: "skipped",
    ownerEmailStatus: "skipped",
    idempotencyKey,
    actionKind,
  };

  // Audit: requested — save early.
  record = {
    ...record,
    refundHistory: [...(record.refundHistory ?? []), { ...baseAudit, operationState: "requested" }],
  };
  await persistRecord(env, record, initialTripDateRef.value);

  // Audit: processing — save.
  record = patchAuditEntry(record, auditId, { operationState: "processing" });
  await persistRecord(env, record, initialTripDateRef.value);

  if (refundAmount > 0) {
    if (!sumUpApiKey) {
      await failRefund(
        env,
        record,
        auditId,
        paymentReference,
        "SumUp refund was not attempted — missing API key",
        { sumUpStatus: "missing_api_key" },
        initialTripDateRef.value,
      );
      return {
        ok: false,
        paymentReference,
        error: "SumUp refund was not attempted — missing API key",
        auditId,
      };
    }

    record = await resolveTransactionOnRecord(env, record, sumUpApiKey, sumUpMerchantCode);
    record = patchAuditEntry(record, auditId, { sumUpTransactionId: record.transactionId });
    await persistRecord(env, record, initialTripDateRef.value);

    if (!record.transactionId) {
      await failRefund(
        env,
        record,
        auditId,
        paymentReference,
        "Could not find SumUp transaction for this booking",
        { sumUpStatus: "transaction_not_found" },
        initialTripDateRef.value,
      );
      return {
        ok: false,
        paymentReference,
        error: "Could not find SumUp transaction for this booking",
        auditId,
      };
    }

    const reconciled = await reconcileRecordWithSumUp(
      env,
      record,
      sumUpApiKey,
      sumUpMerchantCode,
      initialTripDateRef.value,
    );
    record = reconciled.record;
    const authoritativeAlready = reconciled.authoritativeAlready;
    const paidNow = amountPaidOf(record);

    refundAmount = cappedRefundAmount({
      requested: refundAmount,
      amountPaid: paidNow,
      alreadyRefunded: authoritativeAlready,
    });
    refundAmountLabel =
      refundAmount > 0 ? formatPaidAmount(refundAmount, record.currency || "GBP") : "£0";

    record = patchAuditEntry(record, auditId, {
      refundAmount,
      originalAmountPaid: paidNow,
      cumulativeRefundedAmount: authoritativeAlready,
      remainingBalance: remainingRefundableBalance(paidNow, authoritativeAlready),
      fullOrPartial:
        refundAmount <= 0
          ? "none"
          : remainingRefundableBalance(paidNow, authoritativeAlready + refundAmount) <= 0.001
            ? "full"
            : "partial",
    });
    await persistRecord(env, record, initialTripDateRef.value);

    if (refundAmount <= 0) {
      // Already fully refunded on SumUp — sync local, skip SumUp call.
      const cumulative = authoritativeAlready;
      const statuses = nextBookingStatuses({
        cancelBooking,
        previouslyCancelled,
        amountPaid: paidNow,
        amountRefundedAfter: cumulative,
      });

      const processorAcceptedAt = new Date().toISOString();
      record = {
        ...record,
        amount: paidNow,
        amountPaidLabel: formatPaidAmount(paidNow, record.currency || "GBP"),
        amountRefunded: cumulative,
        operationalStatus: statuses.operationalStatus,
        paymentStatus: statuses.paymentStatus,
        status: statuses.status,
        refundAmountLabel:
          cumulative > 0
            ? formatPaidAmount(cumulative, record.currency || "GBP")
            : record.refundAmountLabel,
        ...(cumulative > 0 ? { refundedAt: record.refundedAt ?? processorAcceptedAt } : {}),
        ...(cancelBooking ? { cancelledAt: record.cancelledAt ?? processorAcceptedAt } : {}),
      };
      record = patchAuditEntry(record, auditId, {
        refundAmount: 0,
        cumulativeRefundedAmount: cumulative,
        remainingBalance: remainingRefundableBalance(paidNow, cumulative),
        fullOrPartial: cumulative >= paidNow - 0.001 && cumulative > 0 ? "full" : "none",
        operationState: "processor_accepted",
        processorAcceptedAt,
        success: true,
        sumUpStatus: "already_refunded",
      });
      await persistRecord(env, record, initialTripDateRef.value);

      return await completeRefundSideEffects(env, {
        record,
        auditId,
        paymentReference,
        refundAmount: 0,
        refundAmountLabel: "£0",
        cancelBooking,
        reasonCategory,
        customerFacingReason: options.customerFacingReason?.trim() || undefined,
        actionKind,
        within24h,
        warnings,
        initialTripDate: initialTripDateRef.value,
        alreadyProcessed: true,
      });
    }

    try {
      const refund = await refundSumUpTransaction(
        sumUpApiKey,
        record.transactionId!,
        refundAmount,
        sumUpMerchantCode || undefined,
      );
      sumUpRefunded = true;
      if (typeof refund.refundedAmount === "number" && refund.refundedAmount > 0) {
        refundAmountLabel = formatPaidAmount(
          refund.refundedAmount,
          refund.currency ?? record.currency,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SumUp refund failed";
      await failRefund(env, record, auditId, paymentReference, detail, {
        sumUpStatus: "failed",
        sumUpTransactionId: record.transactionId,
      }, initialTripDateRef.value);

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

      return { ok: false, paymentReference, error: detail, auditId };
    }

    const paidAfter = amountPaidOf(record);
    const cumulative = roundGbp(authoritativeAlready + refundAmount);
    const statuses = nextBookingStatuses({
      cancelBooking,
      previouslyCancelled,
      amountPaid: paidAfter,
      amountRefundedAfter: cumulative,
    });
    const processorAcceptedAt = new Date().toISOString();

    record = {
      ...record,
      amount: paidAfter,
      amountPaidLabel: formatPaidAmount(paidAfter, record.currency || "GBP"),
      amountRefunded: cumulative,
      operationalStatus: statuses.operationalStatus,
      paymentStatus: statuses.paymentStatus,
      status: statuses.status,
      refundAmountLabel: formatPaidAmount(cumulative, record.currency || "GBP"),
      refundedAt: record.refundedAt ?? processorAcceptedAt,
      ...(cancelBooking ? { cancelledAt: record.cancelledAt ?? processorAcceptedAt } : {}),
    };
    record = patchAuditEntry(record, auditId, {
      refundAmount,
      cumulativeRefundedAmount: cumulative,
      remainingBalance: remainingRefundableBalance(paidAfter, cumulative),
      fullOrPartial:
        remainingRefundableBalance(paidAfter, cumulative) <= 0.001 ? "full" : "partial",
      operationState: "processor_accepted",
      processorAcceptedAt,
      success: true,
      sumUpStatus: "accepted",
      sumUpReference: record.transactionId,
    });
    await persistRecord(env, record, initialTripDateRef.value);

    return await completeRefundSideEffects(env, {
      record,
      auditId,
      paymentReference,
      refundAmount,
      refundAmountLabel,
      cancelBooking,
      reasonCategory,
      customerFacingReason: options.customerFacingReason?.trim() || undefined,
      actionKind,
      within24h,
      warnings,
      initialTripDate: initialTripDateRef.value,
      sumUpRefunded,
    });
  }

  // Cancel without refund (refundAmount = 0).
  const paidAfter = amountPaidOf(record);
  const cumulative = amountRefundedOf(record);
  const statuses = nextBookingStatuses({
    cancelBooking,
    previouslyCancelled,
    amountPaid: paidAfter,
    amountRefundedAfter: cumulative,
  });

  record = {
    ...record,
    operationalStatus: statuses.operationalStatus,
    paymentStatus: statuses.paymentStatus,
    status: statuses.status,
    ...(cancelBooking ? { cancelledAt: record.cancelledAt ?? new Date().toISOString() } : {}),
  };
  record = patchAuditEntry(record, auditId, {
    refundAmount: 0,
    cumulativeRefundedAmount: cumulative,
    remainingBalance: remainingRefundableBalance(paidAfter, cumulative),
    fullOrPartial: "none",
    operationState: "processor_accepted",
    processorAcceptedAt: new Date().toISOString(),
    success: true,
    sumUpStatus: "skipped",
  });
  await persistRecord(env, record, initialTripDateRef.value);

  return await completeRefundSideEffects(env, {
    record,
    auditId,
    paymentReference,
    refundAmount: 0,
    refundAmountLabel: "£0",
    cancelBooking,
    reasonCategory,
    customerFacingReason: options.customerFacingReason?.trim() || undefined,
    actionKind,
    within24h,
    warnings,
    initialTripDate: initialTripDateRef.value,
  });
}

async function resolveTransactionOnRecord(
  env: RefundEnv,
  record: PaidBookingRecord,
  sumUpApiKey: string,
  sumUpMerchantCode: string,
): Promise<PaidBookingRecord> {
  let updated = { ...record };

  if (!updated.transactionId) {
    const resolvedTx = await resolveSumUpTransactionForRefund(
      sumUpApiKey,
      sumUpMerchantCode,
      updated.paymentReference,
      updated.checkoutId || undefined,
    );
    if (resolvedTx?.id) {
      updated.transactionId = resolvedTx.id;
      if (typeof resolvedTx.amount === "number" && resolvedTx.amount > 0) {
        updated.amount = resolvedTx.amount;
        updated.currency = resolvedTx.currency ?? updated.currency;
        updated.amountPaidLabel = formatPaidAmount(updated.amount, updated.currency);
      }
    }
  }

  if (!updated.transactionId && updated.checkoutId) {
    try {
      const checkout = await getSumUpCheckout(sumUpApiKey, updated.checkoutId);
      const transactionId = getSuccessfulTransactionId(checkout);
      if (transactionId) updated.transactionId = transactionId;
      if (typeof checkout.amount === "number" && checkout.amount > 0) {
        updated.amount = checkout.amount;
        updated.currency = checkout.currency ?? updated.currency;
        updated.amountPaidLabel = formatPaidAmount(updated.amount, updated.currency);
      }
    } catch {
      // best effort
    }
  }

  return updated;
}

async function reconcileRecordWithSumUp(
  env: RefundEnv,
  record: PaidBookingRecord,
  sumUpApiKey: string,
  sumUpMerchantCode: string,
  initialTripDate: string,
): Promise<{ record: PaidBookingRecord; authoritativeAlready: number }> {
  let updated = await resolveTransactionOnRecord(env, record, sumUpApiKey, sumUpMerchantCode);
  const localAlready = amountRefundedOf(updated);

  if (!updated.transactionId) {
    return { record: updated, authoritativeAlready: localAlready };
  }

  const details = await getSumUpTransactionDetails(
    sumUpApiKey,
    updated.transactionId,
    sumUpMerchantCode || undefined,
  );
  const processorRefunded = details?.amountRefunded ?? 0;
  const authoritativeAlready = Math.max(localAlready, processorRefunded);

  if (processorRefunded > localAlready) {
    const paid = amountPaidOf(updated);
    const paymentStatus = resolvePaymentStatusFromRecord({
      amountPaid: paid,
      amountRefunded: authoritativeAlready,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
    });
    updated = {
      ...updated,
      amountRefunded: authoritativeAlready,
      paymentStatus,
      status: deriveCombinedFromRecord(updated, paymentStatus, authoritativeAlready),
    };
    await persistRecord(env, updated, initialTripDate);
  }

  return { record: updated, authoritativeAlready };
}

function deriveCombinedFromRecord(
  record: PaidBookingRecord,
  paymentStatus: ReturnType<typeof derivePaymentStatus>,
  amountRefundedAfter: number,
): PaidBookingRecord["status"] {
  const operational = resolveOperationalStatus(record);
  return nextBookingStatuses({
    cancelBooking: operational === "cancelled",
    previouslyCancelled: operational === "cancelled",
    amountPaid: amountPaidOf(record),
    amountRefundedAfter,
  }).status;
}

async function failRefund(
  env: RefundEnv,
  record: PaidBookingRecord,
  auditId: string,
  paymentReference: string,
  failureDetail: string,
  extra: Partial<RefundAuditEntry>,
  initialTripDate: string,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const failed = patchAuditEntry(record, auditId, {
    ...extra,
    operationState: "failed",
    completedAt,
    success: false,
    failureDetail,
    customerEmailStatus: "skipped",
    ownerEmailStatus: "pending",
  });
  await persistRecord(env, failed, initialTripDate);
}

async function finishUncertainRefund(
  env: RefundEnv,
  record: PaidBookingRecord,
  prior: RefundAuditEntry,
  ctx: {
    paymentReference: string;
    cancelBooking: boolean;
    reasonCategory: RefundReasonCategory;
    customerFacingReason?: string;
    actionKind: RefundActionKind;
    initialTripDate: string;
  },
): Promise<RefundIssueResult> {
  const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  const warnings: string[] = [];

  if (sumUpApiKey) {
    const reconciled = await reconcileRecordWithSumUp(
      env,
      record,
      sumUpApiKey,
      sumUpMerchantCode,
      ctx.initialTripDate,
    );
    record = reconciled.record;
  }

  const paidAfter = amountPaidOf(record);
  const cumulative = amountRefundedOf(record);
  const intendedRefund = prior.refundAmount;
  const moneyMoved =
    intendedRefund > 0 &&
    cumulative >= roundGbp((prior.cumulativeRefundedAmount ?? 0) + intendedRefund - 0.001);

  if (moneyMoved || prior.operationState === "processor_accepted") {
    const cancelBooking = prior.cancelBooking ?? ctx.cancelBooking;
    const statuses = nextBookingStatuses({
      cancelBooking,
      previouslyCancelled: resolveOperationalStatus(record) === "cancelled",
      amountPaid: paidAfter,
      amountRefundedAfter: cumulative,
    });

    record = {
      ...record,
      amountRefunded: cumulative,
      operationalStatus: statuses.operationalStatus,
      paymentStatus: statuses.paymentStatus,
      status: statuses.status,
      refundAmountLabel:
        cumulative > 0
          ? formatPaidAmount(cumulative, record.currency || "GBP")
          : record.refundAmountLabel,
    };

    if (!prior.processorAcceptedAt) {
      record = patchAuditEntry(record, prior.id, {
        operationState: "processor_accepted",
        processorAcceptedAt: new Date().toISOString(),
        success: true,
        cumulativeRefundedAmount: cumulative,
        remainingBalance: remainingRefundableBalance(paidAfter, cumulative),
      });
      await persistRecord(env, record, ctx.initialTripDate);
    }

    return await completeRefundSideEffects(env, {
      record,
      auditId: prior.id,
      paymentReference: ctx.paymentReference,
      refundAmount: prior.refundAmount,
      refundAmountLabel: formatPaidAmount(prior.refundAmount, prior.currency),
      cancelBooking,
      reasonCategory: prior.reasonCategory ?? ctx.reasonCategory,
      customerFacingReason: prior.customerFacingReason ?? ctx.customerFacingReason,
      actionKind: prior.actionKind ?? ctx.actionKind,
      within24h: isWithin24HoursOfPickup(record.tripDate, record.tripTime),
      warnings,
      initialTripDate: ctx.initialTripDate,
      sumUpRefunded: prior.refundAmount > 0,
      alreadyProcessed: true,
    });
  }

  record = patchAuditEntry(record, prior.id, {
    operationState: "reconciliation_required",
    failureDetail: "Prior refund attempt uncertain — SumUp totals do not show the expected refund.",
  });
  await persistRecord(env, record, ctx.initialTripDate);

  return {
    ok: false,
    paymentReference: ctx.paymentReference,
    error:
      "A prior refund attempt is still uncertain. Check SumUp and retry with the same idempotency key.",
    auditId: prior.id,
    warnings,
  };
}

async function completeRefundSideEffects(
  env: RefundEnv,
  input: {
    record: PaidBookingRecord;
    auditId: string;
    paymentReference: string;
    refundAmount: number;
    refundAmountLabel: string;
    cancelBooking: boolean;
    reasonCategory: RefundReasonCategory;
    customerFacingReason?: string;
    actionKind: RefundActionKind;
    within24h: boolean;
    warnings: string[];
    initialTripDate: string;
    sumUpRefunded?: boolean;
    alreadyProcessed?: boolean;
  },
): Promise<RefundIssueResult> {
  let record = input.record;
  const warnings = input.warnings;

  let calendarCancelled = 0;
  let trackingMarkedRefunded = false;

  if (input.cancelBooking) {
    if (calendarConfigured(env) && record.calendarEventIds.length > 0) {
      try {
        const serviceAccount = parseServiceAccountJson(
          env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
        );
        const accessToken = await getGoogleAccessToken(serviceAccount);
        const refundNote =
          `${input.refundAmount > 0 ? `Refunded: ${input.refundAmountLabel}` : "Cancelled without refund"}\n` +
          `Reference: ${input.paymentReference}\n` +
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
        (await findTrackingJobByPaymentReference(env.TRACKING_STORE, input.paymentReference))
          ?.token;
      if (token) {
        trackingMarkedRefunded = await markTrackingJobRefunded(
          env.TRACKING_STORE,
          token,
          input.refundAmount > 0 ? input.refundAmountLabel : "Cancelled",
        );
      }
    }
  }

  const paidAfter = amountPaidOf(record);
  const cumulative = amountRefundedOf(record);
  const remainingAfter = remainingRefundableBalance(paidAfter, cumulative);
  const operationalAfter = resolveOperationalStatus(record);

  const emailBundle = buildCustomerCancellationEmails(
    {
      customerName: record.customerName,
      paymentReference: record.paymentReference,
      refundAmount: input.refundAmountLabel,
      refundAmountValue: input.refundAmount,
      originalAmount: formatPaidAmount(paidAfter, record.currency || "GBP"),
      originalAmountValue: paidAfter,
      cumulativeRefunded: formatPaidAmount(cumulative, record.currency || "GBP"),
      remainingPaid: formatPaidAmount(remainingAfter, record.currency || "GBP"),
      tripLabel: record.tripLabel,
      pickupLabel: record.pickupLabel,
      dropoffLabel: record.dropoffLabel,
      tripDate: record.tripDate,
      tripTime: record.tripTime,
      cancelBooking: input.cancelBooking,
      within24h: input.within24h,
      reasonCategory: input.reasonCategory,
      customerFacingReason: input.customerFacingReason,
      bookingRemainsActive: operationalAfter === "confirmed",
      actionKind: input.actionKind,
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
        refundAmount: input.refundAmountLabel,
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
      ownerEmailResult.error ? `Owner email failed: ${ownerEmailResult.error}` : "Owner email failed",
    );
  }

  const completedAt = new Date().toISOString();
  record = patchAuditEntry(record, input.auditId, {
    completedAt,
    operationState: "completed",
    success: true,
    customerEmailStatus,
    ownerEmailStatus,
    cumulativeRefundedAmount: cumulative,
    remainingBalance: remainingAfter,
  });
  await persistRecord(env, record, input.initialTripDate);

  return {
    ok: true,
    ...(input.alreadyProcessed ? { alreadyProcessed: true } : {}),
    paymentReference: input.paymentReference,
    refundAmount: input.refundAmountLabel,
    refundAmountValue: input.refundAmount,
    cumulativeRefunded: cumulative,
    remainingBalance: remainingAfter,
    status: record.status,
    cancelBooking: input.cancelBooking,
    sumUpRefunded: input.sumUpRefunded ?? false,
    calendarCancelled,
    calendarDeleted: calendarCancelled,
    trackingRemoved: trackingMarkedRefunded,
    trackingMarkedRefunded,
    customerEmailSent,
    ownerEmailSent,
    auditId: input.auditId,
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
    operationalStatus: "confirmed",
    paymentStatus: "paid",
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
    operationalStatus: "confirmed",
    paymentStatus: "paid",
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

  const confirmOwnerKey = String(body.confirmOwnerKey ?? body.ownerKey ?? "").trim();
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

  if (!env.REFUND_COORDINATOR) {
    return json(
      { error: "Refund coordinator is not configured — cannot safely serialize refunds." },
      503,
      origin,
    );
  }

  const trackingToken = String(body.trackingToken ?? "").trim() || undefined;
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

  const options: ProcessRefundOptions & {
    paymentReference: string;
    confirmOwnerKeyVerified: true;
  } = {
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
    confirmOwnerKeyVerified: true,
  };

  const id = env.REFUND_COORDINATOR.idFromName(paymentReference.trim().toLowerCase());
  const stub = env.REFUND_COORDINATOR.get(id);
  const doResponse = await stub.fetch(
    new Request("https://refund-coordinator/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    }),
  );

  const responseBody = await doResponse.text();
  return withCors(new Response(responseBody, { status: doResponse.status }), origin);
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Owner-Key, X-Driver-Key",
  );
  return new Response(response.body, { status: response.status, headers });
}

function json(body: unknown, status: number, origin: string | null): Response {
  return withCors(new Response(JSON.stringify(body), { status }), origin);
}

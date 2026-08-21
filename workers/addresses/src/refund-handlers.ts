/**
 * Paid booking refund / cancellation — extends the existing SumUp refund pipeline.
 * Supports full/partial refunds, cancel-without-refund, and refund-without-cancel.
 *
 * Money-moving work must be routed through RefundCoordinator (Durable Object).
 * The DO atomically reserves operation state; SumUp/email/calendar run outside
 * blockConcurrencyWhile. No KV refund locks.
 */

import {
  buildOwnerRefundConfirmationEmail,
  buildCustomerCancellationEmails,
  formatPaidAmount,
  type PaidBookingDetails,
} from "../shared/booking-notifications";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  grossAmountCollectedOf,
  journeyFareOf,
} from "../shared/paid-booking-record";
import { normalizeCustomerBookingReference } from "../shared/customer-booking-reference";
import {
  applyProcessorAuthoritativeRefund,
  cappedRefundAmount,
  canMarkExternalRefund,
  EXTERNAL_REFUND_OWNER_NOTES,
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
  REFUND_REASON_LABELS,
  type RefundActionKind,
  type RefundAuditEntry,
  type RefundReasonCategory,
  REFUND_REASON_CATEGORIES,
} from "../shared/refund-ops";
import { shouldMarkTrackingJobsOnRefundSideEffects } from "../shared/refund-tracking-side-effects";
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
  claimUniqueCustomerBookingReference,
  ensureManageBookingToken,
} from "./paid-booking-store";
import {
  findTrackingJobByPaymentReference,
  findTrackingJobsByPaymentReference,
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

export type RefundEnv = WorkerEmailEnv &
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

/** Gross money collected — never the current journey fare when they differ. */
function amountPaidOf(record: PaidBookingRecord): number {
  return grossAmountCollectedOf(record);
}

/** After a successful SumUp refund: preserve journey fare; reduce refund-due. */
function moneyFieldsAfterRefund(
  record: PaidBookingRecord,
  input: {
    grossCollected: number;
    cumulativeRefunded: number;
    amountMovedThisOp: number;
  },
): Partial<PaidBookingRecord> {
  const dueBefore = Number(record.refundDueAmount) || 0;
  const dueAfter = roundGbp(Math.max(0, dueBefore - Math.max(0, input.amountMovedThisOp)));
  return {
    amount: journeyFareOf(record) || record.amount,
    originalAmount: record.originalAmount ?? input.grossCollected,
    amountPaidLabel: formatPaidAmount(input.grossCollected, record.currency || "GBP"),
    amountRefunded: input.cumulativeRefunded,
    refundDueAmount: dueAfter,
    ...(dueAfter <= 0.005
      ? { refundDueReason: "", refundDueAt: "" }
      : {}),
  };
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
  operationalStatus?: string;
  paymentStatus?: string;
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
  /** Owner portal vs refund-test vs legacy — stored on audit only. */
  initiatedBy?: "owner" | "owner_refund_test" | "legacy";
  /**
   * Called immediately after monetary success is persisted (`processor_accepted`),
   * before email/calendar/tracking side effects. Used by RefundCoordinator to update
   * durable operation state without holding blockConcurrencyWhile across I/O.
   */
  onProcessorAccepted?: (info: {
    auditId: string;
    sumUpRefunded: boolean;
  }) => Promise<void>;
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

/**
 * Owner reconciliation: customer already refunded manually in SumUp.
 * Never calls SumUp / payment APIs, never issues money, never emails the customer.
 * Marks booking Cancelled + fully refunded, closes journey/tracking, preserves
 * original payment amount + payment reference for audit.
 */
async function processMarkExternalRefund(
  env: RefundEnv,
  options: ProcessRefundOptions & { paymentReference: string },
  recordInput: PaidBookingRecord,
  initialTripDate: string,
): Promise<RefundIssueResult> {
  const paymentReference = options.paymentReference.trim();
  let record = recordInput;

  const amountPaid = amountPaidOf(record);
  const alreadyRefunded = amountRefundedOf(record);
  if (
    !canMarkExternalRefund({
      status: record.status,
      operationalStatus: record.operationalStatus,
      paymentStatus: record.paymentStatus,
      amountPaid,
      amountRefunded: alreadyRefunded,
    })
  ) {
    if (record.status === "refunded") {
      return {
        ok: true,
        alreadyProcessed: true,
        alreadyRefunded: true,
        paymentReference,
        refundAmount: formatPaidAmount(amountPaid, record.currency || "GBP"),
        refundAmountValue: 0,
        cumulativeRefunded: amountPaid,
        remainingBalance: 0,
        status: record.status,
        operationalStatus: "cancelled",
        paymentStatus: "fully_refunded",
        cancelBooking: true,
        sumUpRefunded: false,
        customerEmailSent: false,
        ownerEmailSent: false,
      };
    }
    return {
      ok: false,
      paymentReference,
      error: "This booking cannot be marked as externally refunded.",
    };
  }

  const idempotencyKey = (options.idempotencyKey ?? "").trim();
  if (!idempotencyKey) {
    return { ok: false, paymentReference, error: "Missing idempotency key." };
  }

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
      cancelBooking: true,
      sumUpRefunded: false,
      customerEmailSent: false,
      ownerEmailSent: false,
      auditId: priorSameKey.id,
    };
  }

  // Idempotent across different keys: already closed as external/manual refund.
  const priorExternal = (record.refundHistory ?? []).find(
    (entry) =>
      entry.actionKind === "mark_external_refund" &&
      entry.success === true &&
      (entry.operationState === "completed" || entry.operationState === "processor_accepted"),
  );
  if (priorExternal && record.status === "refunded") {
    return {
      ok: true,
      alreadyProcessed: true,
      alreadyRefunded: true,
      paymentReference,
      refundAmount: formatPaidAmount(amountPaid, record.currency || "GBP"),
      refundAmountValue: 0,
      cumulativeRefunded: amountPaid,
      remainingBalance: 0,
      status: record.status,
      operationalStatus: "cancelled",
      paymentStatus: "fully_refunded",
      cancelBooking: true,
      sumUpRefunded: false,
      customerEmailSent: false,
      ownerEmailSent: false,
      auditId: priorExternal.id,
    };
  }

  const bookedRefundAmount = remainingRefundableBalance(amountPaid, alreadyRefunded);
  // Books show full amount returned; money was already moved outside this system.
  // Only attribute newly recorded refund money when books still show a remaining balance —
  // avoids double-counting in financial totals when SumUp was already reconciled locally.
  const auditRefundAmount = bookedRefundAmount > 0.001 ? bookedRefundAmount : 0;
  const cumulativeAfter = amountPaid;
  const refundAmountLabel =
    auditRefundAmount > 0
      ? formatPaidAmount(auditRefundAmount, record.currency || "GBP")
      : formatPaidAmount(amountPaid, record.currency || "GBP");
  const nowIso = new Date().toISOString();
  const auditId = generateRefundOpId();
  const notes =
    (options.ownerNotes ?? "").trim() || EXTERNAL_REFUND_OWNER_NOTES;
  const warnings: string[] = [];

  const statuses = nextBookingStatuses({
    cancelBooking: true,
    previouslyCancelled: resolveOperationalStatus(record) === "cancelled",
    amountPaid,
    amountRefundedAfter: cumulativeAfter,
  });

  const auditEntry: RefundAuditEntry = {
    id: auditId,
    bookingReference: paymentReference,
    sumUpTransactionId: record.transactionId,
    originalAmountPaid: amountPaid,
    // When books already show fully refunded, record £0 newly attributed so financial
    // totals do not double-count; cumulative still reflects the full paid amount.
    refundAmount: auditRefundAmount > 0 ? auditRefundAmount : 0,
    cumulativeRefundedAmount: cumulativeAfter,
    remainingBalance: 0,
    amountRetained: 0,
    currency: record.currency || "GBP",
    fullOrPartial: "full",
    cancelBooking: true,
    reasonCategory: "other",
    reasonLabel: REFUND_REASON_LABELS.other,
    ownerNotes: notes,
    ownerNotesAt: nowIso,
    initiatedBy: options.initiatedBy ?? "owner",
    within24HoursOfPickup: isWithin24HoursOfPickup(record.tripDate, record.tripTime),
    requestedAt: nowIso,
    completedAt: nowIso,
    processorAcceptedAt: nowIso,
    sumUpStatus: "external_manual_sumup",
    sumUpReference: record.transactionId,
    success: true,
    customerEmailStatus: "skipped",
    ownerEmailStatus: "skipped",
    idempotencyKey,
    actionKind: "mark_external_refund",
    operationState: "completed",
    bookingStatusAfter: statuses.status,
  };

  // Preserve original payment amount + payment reference; never rewrite amountPaidLabel.
  record = {
    ...record,
    amount: journeyFareOf(record) || record.amount,
    originalAmount: record.originalAmount ?? amountPaid,
    amountPaidLabel:
      record.amountPaidLabel || formatPaidAmount(amountPaid, record.currency || "GBP"),
    amountRefunded: cumulativeAfter,
    refundDueAmount: 0,
    refundDueReason: "",
    refundDueAt: "",
    operationalStatus: statuses.operationalStatus,
    paymentStatus: statuses.paymentStatus,
    status: statuses.status,
    refundedAt: record.refundedAt ?? nowIso,
    cancelledAt: record.cancelledAt ?? nowIso,
    refundAmountLabel,
    refundHistory: [...(record.refundHistory ?? []), auditEntry],
  };
  await persistRecord(env, record, initialTripDate);

  if (options.onProcessorAccepted) {
    await options.onProcessorAccepted({ auditId, sumUpRefunded: false });
  }

  let calendarCancelled = 0;
  let trackingMarkedRefunded = false;

  if (calendarConfigured(env) && record.calendarEventIds.length > 0) {
    try {
      const serviceAccount = parseServiceAccountJson(
        env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!,
      );
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const refundNote =
        `Refunded externally (manual SumUp) — closed as refunded\n` +
        `Reference: ${paymentReference}\n` +
        `Marked at: ${nowIso}`;
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
    const paymentRef = paymentReference.trim();
    const jobsByRef = await findTrackingJobsByPaymentReference(
      env.TRACKING_STORE,
      paymentRef,
    );
    const tokens = new Set<string>(jobsByRef.map((job) => job.token));
    const hintedToken = record.trackingToken?.trim();
    if (hintedToken) {
      const hinted = await getTrackingJob(env.TRACKING_STORE, hintedToken);
      if (hinted && hinted.paymentReference?.trim() === paymentRef) {
        tokens.add(hinted.token);
      } else if (hinted && !hinted.paymentReference?.trim()) {
        tokens.add(hinted.token);
      }
    }
    for (const token of tokens) {
      const ok = await markTrackingJobRefunded(
        env.TRACKING_STORE,
        token,
        refundAmountLabel,
        { closeJourney: true },
      );
      if (ok) trackingMarkedRefunded = true;
    }
  }

  return {
    ok: true,
    paymentReference,
    refundAmount: refundAmountLabel,
    refundAmountValue: auditRefundAmount > 0 ? auditRefundAmount : 0,
    cumulativeRefunded: cumulativeAfter,
    remainingBalance: 0,
    status: record.status,
    operationalStatus: record.operationalStatus,
    paymentStatus: record.paymentStatus,
    cancelBooking: true,
    sumUpRefunded: false,
    calendarCancelled,
    calendarDeleted: calendarCancelled,
    trackingRemoved: trackingMarkedRefunded,
    trackingMarkedRefunded,
    customerEmailSent: false,
    ownerEmailSent: false,
    auditId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function processBookingRefundOrCancel(
  env: RefundEnv,
  options: ProcessRefundOptions & { paymentReference: string },
): Promise<RefundIssueResult> {
  // Serialization / single-flight is handled by RefundCoordinator Durable Object
  // (short atomic reserve in DO storage). No KV refund lock and no long-held DO lock here.
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

  // External / manual SumUp reconciliation — never touch payment APIs.
  if (actionKind === "mark_external_refund") {
    return await processMarkExternalRefund(
      env,
      { ...options, cancelBooking: true, refundFullRemaining: true, actionKind },
      record,
      initialTripDateRef.value,
    );
  }

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
      onProcessorAccepted: options.onProcessorAccepted,
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
    amountRetained: remainingRefundableBalance(amountPaid, alreadyRefunded),
    currency: record.currency || "GBP",
    fullOrPartial:
      refundAmount <= 0 ? "none" : remaining - refundAmount <= 0.001 ? "full" : "partial",
    cancelBooking,
    reasonCategory,
    reasonLabel: REFUND_REASON_LABELS[reasonCategory] ?? reasonCategory,
    ownerNotes: notes,
    ownerNotesAt: notes ? requestedAt : undefined,
    customerFacingReason: options.customerFacingReason?.trim() || undefined,
    initiatedBy: options.initiatedBy ?? (record.isRefundTest ? "owner_refund_test" : "owner"),
    within24HoursOfPickup: within24h,
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
        ...moneyFieldsAfterRefund(record, {
          grossCollected: paidNow,
          cumulativeRefunded: cumulative,
          amountMovedThisOp: 0,
        }),
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
      if (options.onProcessorAccepted) {
        await options.onProcessorAccepted({ auditId, sumUpRefunded: cumulative > 0 });
      }

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

    let sumUpRequestBody = "";
    let sumUpEndpoint = "";
    let sumUpHttpStatus = 0;
    try {
      const refund = await refundSumUpTransaction(
        sumUpApiKey,
        record.transactionId!,
        refundAmount,
        sumUpMerchantCode || undefined,
      );
      sumUpRefunded = true;
      sumUpRequestBody = refund.requestBody;
      sumUpEndpoint = refund.endpoint;
      sumUpHttpStatus = refund.httpStatus;
      // Never trust refund.responseAmount / empty 204 body for books.
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

    // CRITICAL: SumUp refund responses are often empty (204 / {}). Never trust the
    // requested amount alone — re-fetch processor refunded_amount as authoritative.
    const postRefund = await reconcileRecordWithSumUp(
      env,
      record,
      sumUpApiKey,
      sumUpMerchantCode,
      initialTripDateRef.value,
    );
    record = postRefund.record;
    const paidAfter = amountPaidOf(record);
    const applied = applyProcessorAuthoritativeRefund({
      amountPaid: paidAfter,
      localAmountRefunded: authoritativeAlready,
      processorAmountRefunded: postRefund.authoritativeAlready,
      requestedThisOperation: refundAmount,
    });
    const processorTotal = applied.amountRefunded;
    const expectedMinimum = applied.expectedCumulative;
    const processorMismatch = applied.reconciliationRequired;
    const processorFullyRefunded = applied.furtherRefundBlocked;

    if (processorMismatch) {
      warnings.push(
        `SumUp processor refund total (£${processorTotal.toFixed(2)}) differs from requested cumulative (£${expectedMinimum.toFixed(2)}). Local books use the processor total.`,
      );
    }
    if (processorFullyRefunded && refundAmount + authoritativeAlready < paidAfter - 0.011) {
      warnings.push(
        "SumUp shows this transaction is fully refunded — further money refunds are blocked.",
      );
    }

    // Local books = processor-authoritative total (never understate / overstate remaining).
    const cumulative = processorTotal;
    const actualMoved = roundGbp(Math.max(0, cumulative - authoritativeAlready));
    refundAmountLabel = formatPaidAmount(actualMoved, record.currency || "GBP");
    const statuses = nextBookingStatuses({
      cancelBooking,
      previouslyCancelled,
      amountPaid: paidAfter,
      amountRefundedAfter: cumulative,
    });
    const processorAcceptedAt = new Date().toISOString();
    const remainingAfter = applied.remainingRefundable;
    const operationState = processorMismatch
      ? ("reconciliation_required" as const)
      : ("processor_accepted" as const);

    record = {
      ...record,
      ...moneyFieldsAfterRefund(record, {
        grossCollected: paidAfter,
        cumulativeRefunded: cumulative,
        amountMovedThisOp: actualMoved,
      }),
      operationalStatus: statuses.operationalStatus,
      paymentStatus: statuses.paymentStatus,
      status: statuses.status,
      refundAmountLabel: formatPaidAmount(cumulative, record.currency || "GBP"),
      refundedAt: record.refundedAt ?? processorAcceptedAt,
      ...(cancelBooking ? { cancelledAt: record.cancelledAt ?? processorAcceptedAt } : {}),
    };
    record = patchAuditEntry(record, auditId, {
      refundAmount: actualMoved,
      cumulativeRefundedAmount: cumulative,
      remainingBalance: remainingAfter,
      fullOrPartial: remainingAfter <= 0.001 ? "full" : "partial",
      operationState,
      processorAcceptedAt,
      success: !processorMismatch,
      sumUpStatus: processorMismatch
        ? `processor_mismatch:${sumUpEndpoint}:http${sumUpHttpStatus}:body=${sumUpRequestBody || "(empty)"}`
        : `accepted:${sumUpEndpoint}:http${sumUpHttpStatus}:body=${sumUpRequestBody || "(empty)"}`,
      sumUpReference: record.transactionId,
      failureDetail: processorMismatch
        ? `Requested £${refundAmount.toFixed(2)} (expected cumulative £${expectedMinimum.toFixed(2)}); SumUp reports £${processorTotal.toFixed(2)} refunded. Request body: ${sumUpRequestBody || "(empty → SumUp full refund semantics)"}.`
        : undefined,
    });
    await persistRecord(env, record, initialTripDateRef.value);
    if (options.onProcessorAccepted) {
      await options.onProcessorAccepted({ auditId, sumUpRefunded: true });
    }

    if (processorMismatch) {
      await trySendOwnerOperationalEmail(env, {
        to: "bookings@myairporttaxini.co.uk",
        subject: `REFUND RECONCILIATION REQUIRED — ${record.customerName} — ${paymentReference}`,
        body:
          `SumUp refund amount MISMATCH for ${paymentReference}.\n` +
          `Requested this operation: £${refundAmount.toFixed(2)}\n` +
          `Expected cumulative after request: £${expectedMinimum.toFixed(2)}\n` +
          `SumUp authoritative refunded total: £${processorTotal.toFixed(2)}\n` +
          `Remaining refundable (from SumUp): £${remainingAfter.toFixed(2)}\n` +
          `Endpoint: ${sumUpEndpoint} (HTTP ${sumUpHttpStatus})\n` +
          `Request body: ${sumUpRequestBody || "(empty)"}\n` +
          `Local books updated to the SumUp total. Do not issue another refund until reviewed.\n` +
          `Transaction ID: ${record.transactionId ?? "—"}\n`,
      });
    }

    // If processor shows fully refunded (or over), still complete side effects but
    // remaining is £0 so further money refunds are blocked by remaining balance checks.
    return await completeRefundSideEffects(env, {
      record,
      auditId,
      paymentReference,
      refundAmount: actualMoved,
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
  if (options.onProcessorAccepted) {
    await options.onProcessorAccepted({ auditId, sumUpRefunded: false });
  }

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
        updated.originalAmount = updated.originalAmount ?? resolvedTx.amount;
        updated.currency = resolvedTx.currency ?? updated.currency;
        updated.amountPaidLabel = formatPaidAmount(
          grossAmountCollectedOf({
            ...updated,
            originalAmount: updated.originalAmount,
            amountPaidLabel: formatPaidAmount(resolvedTx.amount, updated.currency),
          }),
          updated.currency,
        );
        const hasSettlementGap =
          (Number(updated.refundDueAmount) || 0) > 0.005 ||
          (updated.amendmentHistory?.length ?? 0) > 0 ||
          (updated.additionalPayments?.length ?? 0) > 0;
        if (!hasSettlementGap) {
          updated.amount = resolvedTx.amount;
        }
      }
    }
  }

  if (!updated.transactionId && updated.checkoutId) {
    try {
      const checkout = await getSumUpCheckout(sumUpApiKey, updated.checkoutId);
      const transactionId = getSuccessfulTransactionId(checkout);
      if (transactionId) updated.transactionId = transactionId;
      if (typeof checkout.amount === "number" && checkout.amount > 0) {
        updated.originalAmount = updated.originalAmount ?? checkout.amount;
        updated.currency = checkout.currency ?? updated.currency;
        updated.amountPaidLabel = formatPaidAmount(
          grossAmountCollectedOf({
            ...updated,
            originalAmount: updated.originalAmount,
            amountPaidLabel: formatPaidAmount(checkout.amount, updated.currency),
          }),
          updated.currency,
        );
        const hasSettlementGap =
          (Number(updated.refundDueAmount) || 0) > 0.005 ||
          (updated.amendmentHistory?.length ?? 0) > 0 ||
          (updated.additionalPayments?.length ?? 0) > 0;
        if (!hasSettlementGap) {
          updated.amount = checkout.amount;
        }
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
    const statuses = nextBookingStatuses({
      cancelBooking: resolveOperationalStatus(updated) === "cancelled",
      previouslyCancelled: resolveOperationalStatus(updated) === "cancelled",
      amountPaid: paid,
      amountRefundedAfter: authoritativeAlready,
    });
    updated = {
      ...updated,
      amountRefunded: authoritativeAlready,
      paymentStatus: statuses.paymentStatus,
      operationalStatus: statuses.operationalStatus,
      status: statuses.status,
      refundAmountLabel:
        authoritativeAlready > 0
          ? formatPaidAmount(authoritativeAlready, updated.currency || "GBP")
          : updated.refundAmountLabel,
      ...(authoritativeAlready >= paid - 0.001 && authoritativeAlready > 0
        ? { refundedAt: updated.refundedAt ?? new Date().toISOString() }
        : {}),
    };
    await persistRecord(env, updated, initialTripDate);
  }

  return { record: updated, authoritativeAlready };
}

/**
 * Owner/diagnostics: pull SumUp refunded_amount and sync local books when the
 * processor total is ahead of our KV record (e.g. the £1 test mismatch).
 * Does not call SumUp refund APIs.
 */
export async function syncPaidBookingRefundTotalsFromSumUp(
  env: RefundEnv,
  record: PaidBookingRecord,
): Promise<{
  record: PaidBookingRecord;
  authoritativeAlready: number;
  syncedFromProcessor: boolean;
}> {
  const sumUpApiKey = env.SUMUP_API_KEY?.trim() ?? "";
  const sumUpMerchantCode = env.SUMUP_MERCHANT_CODE?.trim() ?? "";
  const before = amountRefundedOf(record);
  if (!sumUpApiKey) {
    return { record, authoritativeAlready: before, syncedFromProcessor: false };
  }
  const reconciled = await reconcileRecordWithSumUp(
    env,
    record,
    sumUpApiKey,
    sumUpMerchantCode,
    record.tripDate,
  );
  return {
    record: reconciled.record,
    authoritativeAlready: reconciled.authoritativeAlready,
    syncedFromProcessor: amountRefundedOf(reconciled.record) > before + 0.001,
  };
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
    onProcessorAccepted?: (info: {
      auditId: string;
      sumUpRefunded: boolean;
    }) => Promise<void>;
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

    if (ctx.onProcessorAccepted) {
      await ctx.onProcessorAccepted({
        auditId: prior.id,
        sumUpRefunded: prior.refundAmount > 0,
      });
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
  }

  // Tracking jobs: mark on operational cancel, AND on owner isRefundTest keep-active
  // refunds (refund-test UI forces cancelBooking=false so isolation jobs would
  // otherwise never receive refundedAt). Real customer keep-active refunds are
  // unchanged — journey can remain live without stamping tracking refunded.
  const shouldMarkTrackingRefunded = shouldMarkTrackingJobsOnRefundSideEffects({
    cancelBooking: input.cancelBooking,
    isRefundTest: record.isRefundTest,
  });
  if (shouldMarkTrackingRefunded && trackingStoreConfigured(env.TRACKING_STORE)) {
    const paymentRef = input.paymentReference.trim();
    const jobsByRef = await findTrackingJobsByPaymentReference(
      env.TRACKING_STORE,
      paymentRef,
    );
    const tokens = new Set<string>(jobsByRef.map((job) => job.token));

    // trackingToken is only a hint — verify it belongs to this paymentReference.
    const hintedToken = record.trackingToken?.trim();
    if (hintedToken) {
      const hinted = await getTrackingJob(env.TRACKING_STORE, hintedToken);
      if (hinted && hinted.paymentReference?.trim() === paymentRef) {
        tokens.add(hinted.token);
      } else if (hinted && hinted.paymentReference?.trim()) {
        warnings.push(
          `Skipped tracking token ${hintedToken.slice(0, 8)}… — paymentReference mismatch (not mutating other booking)`,
        );
      }
    }

    if (tokens.size === 0 && hintedToken) {
      // Legacy jobs with no paymentReference on the tracking record: mark only that token.
      const hinted = await getTrackingJob(env.TRACKING_STORE, hintedToken);
      if (hinted && !hinted.paymentReference?.trim()) {
        tokens.add(hinted.token);
      }
    }

    for (const token of tokens) {
      const ok = await markTrackingJobRefunded(
        env.TRACKING_STORE,
        token,
        input.refundAmount > 0 ? input.refundAmountLabel : "Cancelled",
      );
      if (ok) trackingMarkedRefunded = true;
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
      ownerNotes: (record.refundHistory ?? []).find((e) => e.id === input.auditId)?.ownerNotes,
      auditId: input.auditId,
      sumUpTransactionId: record.transactionId,
      cumulativeRefundedValue: cumulative,
      amountRetained: formatPaidAmount(remainingAfter, record.currency || "GBP"),
      paymentStatusAfter: record.paymentStatus,
      operationalStatusAfter: operationalAfter,
      initiatedBy:
        (record.refundHistory ?? []).find((e) => e.id === input.auditId)?.initiatedBy ?? "owner",
    },
    BUSINESS_NAME,
  );

  let customerEmailSent = false;
  let ownerEmailSent = false;
  let customerEmailStatus: RefundAuditEntry["customerEmailStatus"] = "skipped";
  let ownerEmailStatus: RefundAuditEntry["ownerEmailStatus"] = "skipped";

  // Owner £1 live refund tests: suppress customer-facing cancellation/refund emails.
  const suppressCustomerEmails = record.isRefundTest === true;

  if (emailBundle.customer && !suppressCustomerEmails) {
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
  } else if (suppressCustomerEmails) {
    customerEmailStatus = "skipped";
    warnings.push("Refund test — customer refund/cancellation email suppressed.");
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
    amountRetained: remainingAfter,
    bookingStatusAfter: record.status,
    sumUpTransactionId: record.transactionId,
    sumUpReference: record.transactionId,
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
  isRefundTest?: boolean;
}): Promise<string | undefined> {
  if (!paidBookingStoreConfigured(input.env.TRACKING_STORE)) {
    return undefined;
  }

  const existing = await getPaidBookingRecord(
    input.env.TRACKING_STORE,
    input.paymentReference,
  );
  const customerReference =
    normalizeCustomerBookingReference(existing?.customerReference ?? "") ||
    (await claimUniqueCustomerBookingReference(
      input.env.TRACKING_STORE,
      input.paymentReference,
    ));

  const record: PaidBookingRecord = {
    paymentReference: input.paymentReference,
    customerReference,
    manageBookingToken: existing?.manageBookingToken,
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
    createdAt: existing?.createdAt || new Date().toISOString(),
    ...(input.isRefundTest ? { isRefundTest: true } : {}),
    ...(input.personalQuoteCode ? { personalQuoteCode: input.personalQuoteCode } : {}),
    ...(typeof input.standardWebsiteAmount === "number"
      ? { standardWebsiteAmount: input.standardWebsiteAmount }
      : {}),
    ...(typeof input.personalQuotedAmount === "number"
      ? { personalQuotedAmount: input.personalQuotedAmount }
      : {}),
  };

  await savePaidBookingRecord(input.env.TRACKING_STORE, record);
  // Opaque manage-booking token (metadata only — does not burn free amendment quota).
  const withToken = await ensureManageBookingToken(input.env.TRACKING_STORE, {
    ...record,
    manageBookingToken: existing?.manageBookingToken,
  });
  void withToken;
  return customerReference;
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
  const refundTestRequested = body.refundTest === true;
  const cancelBooking =
    typeof body.cancelBooking === "boolean"
      ? body.cancelBooking
      : actionKind === "cancel_full_refund" ||
        actionKind === "cancel_partial_refund" ||
        actionKind === "cancel_no_refund" ||
        actionKind === "full_refund_and_cancel" ||
        actionKind === "mark_external_refund";
  const refundFullRemaining =
    typeof body.refundFullRemaining === "boolean"
      ? body.refundFullRemaining
      : actionKind === "cancel_full_refund" ||
        actionKind === "full_refund_keep_active" ||
        actionKind === "full_refund_and_cancel" ||
        actionKind === "mark_external_refund";

  // Guard: refund-test UI may only touch isRefundTest records; normal UI must not.
  if (paidBookingStoreConfigured(env.TRACKING_STORE)) {
    const existing = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
    if (existing?.isAmendmentTestFixture) {
      return json(
        {
          error:
            "This is an AMENDMENT TEST fixture (no live SumUp payment). It cannot be refunded via SumUp.",
        },
        400,
        origin,
      );
    }
    if (existing?.isRefundTest && !refundTestRequested) {
      return json(
        {
          error:
            "This is a REFUND TEST booking. Use Owner → Refund Test (not the normal Cancel/Refund UI).",
        },
        400,
        origin,
      );
    }
    if (refundTestRequested && existing && !existing.isRefundTest) {
      return json(
        {
          error:
            "Refund Test endpoint cannot refund a normal customer booking. Use the normal Cancel/Refund flow.",
        },
        400,
        origin,
      );
    }
    if (refundTestRequested && !existing) {
      return json({ error: "Refund test booking not found for that payment reference." }, 404, origin);
    }
  } else if (refundTestRequested) {
    return json({ error: "Booking store is not configured" }, 503, origin);
  }

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
    initiatedBy: refundTestRequested ? "owner_refund_test" : "owner",
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
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Owner-Key, X-Driver-Key",
  );
  return new Response(response.body, { status: response.status, headers });
}

function json(body: unknown, status: number, origin: string | null): Response {
  return withCors(new Response(JSON.stringify(body), { status }), origin);
}

export function isRefundDiagnosticsPath(pathname: string): boolean {
  return (
    pathname === "/paid-bookings/refund-diagnostics" ||
    pathname === "/api/paid-bookings/refund-diagnostics"
  );
}

/**
 * Owner-only read-only refund diagnostics for production smoke tests.
 * Never returns secrets, card details, or API keys.
 */
export async function handleRefundDiagnosticsRequest(
  request: Request,
  env: RefundEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  if (!ownerAuthorized(request, env)) {
    return json(
      { error: "Unauthorized — refund diagnostics require OWNER_ACCESS_KEY." },
      401,
      origin,
    );
  }

  const url = new URL(request.url);
  const paymentReference = (url.searchParams.get("paymentReference") ?? "").trim();
  if (!paymentReference) {
    return json({ error: "Missing paymentReference" }, 400, origin);
  }

  const coordinatorConfigured = Boolean(env.REFUND_COORDINATOR);
  const sumUpConfigured = Boolean(env.SUMUP_API_KEY?.trim() && env.SUMUP_MERCHANT_CODE?.trim());

  if (!paidBookingStoreConfigured(env.TRACKING_STORE)) {
    return json(
      {
        ok: false,
        coordinatorConfigured,
        sumUpConfigured,
        error: "Booking store is not configured",
      },
      503,
      origin,
    );
  }

  const recordRaw = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  if (!recordRaw) {
    return json(
      {
        ok: false,
        coordinatorConfigured,
        sumUpConfigured,
        paymentReference,
        error: "Booking not found",
      },
      404,
      origin,
    );
  }

  // Always reconcile from SumUp before reporting remaining — never show a false
  // £0.50 remaining when the processor already fully refunded.
  const synced = await syncPaidBookingRefundTotalsFromSumUp(env, recordRaw);
  const record = synced.record;

  const amountPaid = amountPaidOf(record);
  const amountRefunded = amountRefundedOf(record);
  const remaining = remainingRefundableBalance(amountPaid, amountRefunded);
  const history = [...(record.refundHistory ?? [])].sort((a, b) =>
    String(b.requestedAt).localeCompare(String(a.requestedAt)),
  );
  const latest = history[0];

  // Never expose secrets — only presence flags and public booking money/ops fields.
  return json(
    {
      ok: true,
      coordinatorConfigured,
      sumUpConfigured,
      paymentReference: record.paymentReference,
      transactionId: record.transactionId ?? null,
      transactionCode: record.transactionCode ?? null,
      checkoutId: record.checkoutId || null,
      currency: record.currency || "GBP",
      originalAmount: amountPaid,
      amountRefunded,
      remainingRefundable: remaining,
      syncedFromProcessor: synced.syncedFromProcessor,
      amountPaidLabel: record.amountPaidLabel,
      combinedStatus: record.status,
      operationalStatus: resolveOperationalStatus(record),
      paymentStatus:
        record.paymentStatus ??
        resolvePaymentStatusFromRecord({
          amountPaid,
          amountRefunded,
          status: record.status,
          paymentStatus: record.paymentStatus,
        }),
      cancelledAt: record.cancelledAt ?? null,
      refundedAt: record.refundedAt ?? null,
      calendarEventCount: Array.isArray(record.calendarEventIds)
        ? record.calendarEventIds.length
        : 0,
      trackingTokenPresent: Boolean(record.trackingToken),
      latestRefundOperation: latest
        ? {
            auditId: latest.id,
            operationState: latest.operationState,
            actionKind: latest.actionKind,
            refundAmount: latest.refundAmount,
            cumulativeRefundedAmount: latest.cumulativeRefundedAmount,
            remainingBalance: latest.remainingBalance,
            amountRetained: latest.amountRetained ?? null,
            cancelBooking: latest.cancelBooking,
            reasonCategory: latest.reasonCategory,
            reasonLabel: latest.reasonLabel ?? null,
            ownerNotes: latest.ownerNotes || null,
            ownerNotesAt: latest.ownerNotesAt ?? null,
            initiatedBy: latest.initiatedBy ?? null,
            within24HoursOfPickup: latest.within24HoursOfPickup ?? null,
            bookingStatusAfter: latest.bookingStatusAfter ?? null,
            success: latest.success,
            sumUpStatus: latest.sumUpStatus ?? null,
            sumUpTransactionId: latest.sumUpTransactionId ?? null,
            customerEmailStatus: latest.customerEmailStatus,
            ownerEmailStatus: latest.ownerEmailStatus,
            requestedAt: latest.requestedAt,
            processorAcceptedAt: latest.processorAcceptedAt ?? null,
            completedAt: latest.completedAt ?? null,
            failureDetail: latest.failureDetail ?? null,
            idempotencyKeySuffix: latest.idempotencyKey
              ? latest.idempotencyKey.slice(-12)
              : null,
          }
        : null,
      refundHistoryCount: history.length,
      // Truncated history for UI — includes internal notes for owner diagnostics only.
      recentAudits: history.slice(0, 5).map((entry) => ({
        auditId: entry.id,
        operationState: entry.operationState,
        refundAmount: entry.refundAmount,
        cumulativeRefundedAmount: entry.cumulativeRefundedAmount,
        remainingBalance: entry.remainingBalance,
        amountRetained: entry.amountRetained ?? null,
        cancelBooking: entry.cancelBooking,
        reasonCategory: entry.reasonCategory,
        reasonLabel: entry.reasonLabel ?? null,
        ownerNotes: entry.ownerNotes || null,
        ownerNotesAt: entry.ownerNotesAt ?? null,
        initiatedBy: entry.initiatedBy ?? null,
        within24HoursOfPickup: entry.within24HoursOfPickup ?? null,
        bookingStatusAfter: entry.bookingStatusAfter ?? null,
        customerEmailStatus: entry.customerEmailStatus,
        ownerEmailStatus: entry.ownerEmailStatus,
        requestedAt: entry.requestedAt,
        completedAt: entry.completedAt ?? null,
        success: entry.success,
        sumUpTransactionId: entry.sumUpTransactionId ?? null,
      })),
    },
    200,
    origin,
  );
}

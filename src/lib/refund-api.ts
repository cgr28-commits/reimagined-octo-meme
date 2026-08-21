import type {
  RefundActionKind,
  RefundReasonCategory,
} from "../../shared/refund-ops";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const host = new URL(bookings).hostname.toLowerCase();
      if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
        return DEFAULT_WORKER_BASE;
      }

      return bookings.replace(/\/bookings\/?$/, "");
    } catch {
      return DEFAULT_WORKER_BASE;
    }
  }

  return DEFAULT_WORKER_BASE;
}

const WORKER_BASE = resolveWorkerBaseUrl();

export type RefundIssueResponse = {
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
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  warnings?: string[];
  error?: string;
  auditId?: string;
};

/**
 * Full refund + cancel — still requires a freshly entered confirmOwnerKey
 * (must not reuse only the unlocked dashboard session).
 */
export async function issueBookingRefund(input: {
  ownerKey: string;
  confirmOwnerKey: string;
  paymentReference: string;
  trackingToken?: string;
  ownerNotes?: string;
  idempotencyKey?: string;
}): Promise<RefundIssueResponse> {
  return processBookingRefundOrCancel({
    ownerKey: input.ownerKey,
    confirmOwnerKey: input.confirmOwnerKey,
    paymentReference: input.paymentReference,
    trackingToken: input.trackingToken,
    actionKind: "cancel_full_refund",
    cancelBooking: true,
    refundFullRemaining: true,
    reasonCategory: "other",
    ownerNotes: input.ownerNotes ?? "Full refund + cancel",
    idempotencyKey:
      input.idempotencyKey ??
      `ui-full-${input.paymentReference.trim()}-${crypto.randomUUID()}`,
  });
}

/** Extended cancel / refund with re-entered owner key + idempotency. */
export async function processBookingRefundOrCancel(input: {
  ownerKey: string;
  confirmOwnerKey: string;
  paymentReference: string;
  trackingToken?: string;
  actionKind: RefundActionKind;
  cancelBooking: boolean;
  refundFullRemaining: boolean;
  amount?: number | null;
  reasonCategory: RefundReasonCategory;
  ownerNotes?: string;
  customerFacingReason?: string;
  idempotencyKey: string;
}): Promise<RefundIssueResponse> {
  const response = await fetch(`${WORKER_BASE}/bookings/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": input.ownerKey.trim(),
      "X-Driver-Key": input.ownerKey.trim(),
    },
    body: JSON.stringify({
      paymentReference: input.paymentReference.trim(),
      ...(input.trackingToken?.trim() ? { trackingToken: input.trackingToken.trim() } : {}),
      confirmOwnerKey: input.confirmOwnerKey.trim(),
      actionKind: input.actionKind,
      cancelBooking: input.cancelBooking,
      refundFullRemaining: input.refundFullRemaining,
      amount: input.amount ?? null,
      reasonCategory: input.reasonCategory,
      ownerNotes: input.ownerNotes ?? "",
      customerFacingReason: input.customerFacingReason ?? "",
      idempotencyKey: input.idempotencyKey,
    }),
  });

  const payload = (await response.json().catch(() => null)) as RefundIssueResponse | null;
  if (!payload) {
    throw new Error(`Refund request failed (${response.status})`);
  }

  if (!response.ok && !payload.error) {
    throw new Error(`Refund request failed (${response.status})`);
  }

  return payload;
}

/**
 * Mark a booking as already refunded manually in SumUp.
 * Does not call SumUp or send refund emails — local books + journey close only.
 */
export async function markBookingRefundedExternally(input: {
  ownerKey: string;
  confirmOwnerKey: string;
  paymentReference: string;
  trackingToken?: string;
  idempotencyKey?: string;
}): Promise<RefundIssueResponse> {
  return processBookingRefundOrCancel({
    ownerKey: input.ownerKey,
    confirmOwnerKey: input.confirmOwnerKey,
    paymentReference: input.paymentReference,
    trackingToken: input.trackingToken,
    actionKind: "mark_external_refund",
    cancelBooking: true,
    refundFullRemaining: true,
    reasonCategory: "other",
    ownerNotes:
      "Manually confirmed refunded by Owner — no SumUp API refund issued.",
    idempotencyKey:
      input.idempotencyKey ??
      `ui-external-${input.paymentReference.trim()}-${crypto.randomUUID()}`,
  });
}

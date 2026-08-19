import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { generateRefundOpId } from "../../shared/refund-ops";
import type { RefundIssueResponse } from "@/lib/refund-api";
import type { RefundDiagnosticsReport } from "@/lib/paid-bookings-api";

const WORKER_BASE = resolveWorkerBaseUrl();

export type RefundTestBookingSummary = {
  paymentReference: string;
  checkoutId: string;
  transactionId?: string | null;
  transactionCode?: string | null;
  amountPaid: number;
  amountPaidLabel: string;
  amountRefunded: number;
  remainingRefundable: number;
  syncedFromProcessor?: boolean;
  status: string;
  operationalStatus?: string;
  paymentStatus?: string;
  createdAt: string;
  refundedAt?: string | null;
  isRefundTest: true;
  refundHistoryCount: number;
  tripLabel: string;
};

export type RefundTestPendingCheckout = {
  checkoutId: string;
  checkoutReference: string;
  amount: number;
  createdAt: string;
  isRefundTest: true;
  status: string;
};

export type RefundTestListResponse = {
  ok: boolean;
  coordinatorConfigured: boolean;
  sumUpConfigured: boolean;
  warning: string;
  bookings: RefundTestBookingSummary[];
  pendingCheckouts: RefundTestPendingCheckout[];
  error?: string;
};

export type RefundTestCheckoutResult = {
  ok: boolean;
  isRefundTest?: boolean;
  amount?: number;
  amountLabel?: string;
  checkoutId?: string;
  checkoutReference?: string;
  paymentUrl?: string;
  warning?: string;
  error?: string;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

export async function createRefundTestCheckout(input: {
  ownerKey: string;
  redirectUrl: string;
}): Promise<RefundTestCheckoutResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/refund-test/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": input.ownerKey.trim(),
    },
    body: JSON.stringify({
      redirectUrl: input.redirectUrl,
      // Amount intentionally omitted — server hard-codes £1.00
    }),
  });
  const payload = (await parseJson(response)) as RefundTestCheckoutResult;
  if (!response.ok) {
    throw new Error(String(payload.error ?? `Refund test checkout failed (${response.status})`));
  }
  return payload;
}

export async function fetchRefundTestList(ownerKey: string): Promise<RefundTestListResponse> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/refund-test/list`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  const payload = (await parseJson(response)) as RefundTestListResponse;
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load refund tests"));
  }
  return payload;
}

export async function issueRefundTestRefund(input: {
  ownerKey: string;
  confirmOwnerKey: string;
  paymentReference: string;
  amount: number | null;
  refundFullRemaining?: boolean;
  idempotencyKey?: string;
}): Promise<RefundIssueResponse> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/refund-test/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": input.ownerKey.trim(),
    },
    body: JSON.stringify({
      paymentReference: input.paymentReference.trim(),
      confirmOwnerKey: input.confirmOwnerKey.trim(),
      amount: input.amount,
      refundFullRemaining: input.refundFullRemaining === true,
      idempotencyKey: input.idempotencyKey ?? `refund-test-${generateRefundOpId()}`,
      ownerNotes: "Owner £1 live SumUp refund test",
    }),
  });
  const payload = (await response.json().catch(() => null)) as RefundIssueResponse | null;
  if (!payload) {
    throw new Error(`Refund test refund failed (${response.status})`);
  }
  if (!response.ok && !payload.error) {
    throw new Error(`Refund test refund failed (${response.status})`);
  }
  return payload;
}

export type { RefundDiagnosticsReport };

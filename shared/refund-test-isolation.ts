/**
 * Owner-only £1 refund-test tracking isolation helpers.
 * Pure naming / verification — no KV side effects.
 */

export const REFUND_TEST_ISOLATION_DECOY_PREFIX = "REFUND-TEST-ISOLATION-DECOY:";

export function refundTestIsolationDecoyPaymentReference(paymentReference: string): string {
  const trimmed = paymentReference.trim();
  return `${REFUND_TEST_ISOLATION_DECOY_PREFIX}${trimmed}`;
}

export function isRefundTestIsolationDecoyPaymentReference(
  paymentReference: string | null | undefined,
): boolean {
  return String(paymentReference || "")
    .trim()
    .startsWith(REFUND_TEST_ISOLATION_DECOY_PREFIX);
}

/**
 * After refunding the primary isRefundTest tracking job (which may still have
 * a foreign pairedToken pointing at the decoy), isolation passes when the decoy
 * was NOT stamped refundedAt.
 */
export function refundTestTrackingIsolationPassed(input: {
  primaryRefundedAt?: string | null;
  decoyRefundedAt?: string | null;
  primaryPaymentReference: string;
  decoyPaymentReference: string;
}): { ok: boolean; reason: string } {
  if (!input.primaryPaymentReference.trim()) {
    return { ok: false, reason: "missing_primary_payment_reference" };
  }
  if (!isRefundTestIsolationDecoyPaymentReference(input.decoyPaymentReference)) {
    return { ok: false, reason: "decoy_payment_reference_not_tagged" };
  }
  if (input.decoyPaymentReference === input.primaryPaymentReference) {
    return { ok: false, reason: "decoy_shares_primary_payment_reference" };
  }
  if (!input.primaryRefundedAt?.trim()) {
    return { ok: false, reason: "primary_not_marked_refunded_yet" };
  }
  if (input.decoyRefundedAt?.trim()) {
    return {
      ok: false,
      reason: "FAIL_decoy_marked_refunded — foreign pairedToken bleed still present",
    };
  }
  return {
    ok: true,
    reason: "PASS — primary refunded; decoy with foreign paymentReference untouched",
  };
}

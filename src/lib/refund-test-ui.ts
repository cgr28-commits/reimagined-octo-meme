/**
 * Pure UI helpers for the owner £1 live SumUp refund-test form.
 * Keep money-moving decisions explicit — no silent £0 / remaining shortcuts.
 */

export function roundGbp(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Parse the Amount field for the refund-test UI.
 * Returns null when blank, zero, negative, NaN, or above remaining.
 */
export function parseRefundTestAmountInput(
  raw: string,
  remainingRefundable: number,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const rounded = roundGbp(value);
  if (rounded <= 0) return null;
  if (rounded > remainingRefundable + 0.001) return null;
  return rounded;
}

export function canSubmitRefundTest(input: {
  amountRaw: string;
  remainingRefundable: number;
  confirmOwnerKey: string;
  finalConfirm: boolean;
  busy: boolean;
}): { ok: boolean; amount: number | null; reason?: string } {
  if (input.busy) {
    return { ok: false, amount: null, reason: "busy" };
  }
  if (input.remainingRefundable < 0.01) {
    return { ok: false, amount: null, reason: "fully_refunded" };
  }
  const amount = parseRefundTestAmountInput(input.amountRaw, input.remainingRefundable);
  if (amount == null) {
    return { ok: false, amount: null, reason: "invalid_amount" };
  }
  if (!input.confirmOwnerKey.trim()) {
    return { ok: false, amount, reason: "missing_owner_key" };
  }
  if (!input.finalConfirm) {
    return { ok: false, amount, reason: "missing_confirm" };
  }
  return { ok: true, amount };
}

/** Fill helper — never submits. */
export function remainingBalanceFillValue(remainingRefundable: number): string {
  if (remainingRefundable < 0.01) return "";
  return roundGbp(remainingRefundable).toFixed(2);
}

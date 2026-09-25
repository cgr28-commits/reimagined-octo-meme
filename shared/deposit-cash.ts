/**
 * Deposit + Cash payment option.
 * Server/Worker is authoritative. Browser-sent percent/minimum/deposit is ignored.
 * Changing admin settings never recalculates existing or in-progress bookings.
 */

import { formatGbpAmount, roundGbp } from "./gbp";

export const PAYMENT_METHOD_FULL_ONLINE = "FULL_ONLINE" as const;
export const PAYMENT_METHOD_DEPOSIT_CASH = "DEPOSIT_CASH" as const;

export type PaymentMethod = typeof PAYMENT_METHOD_FULL_ONLINE | typeof PAYMENT_METHOD_DEPOSIT_CASH;

export const DEFAULT_DEPOSIT_CASH_ENABLED = false;
export const DEFAULT_DEPOSIT_PERCENT = 20;
export const DEFAULT_DEPOSIT_MINIMUM_GBP = 15;

export const MIN_DEPOSIT_PERCENT = 10;
export const MAX_DEPOSIT_PERCENT = 50;
export const MIN_DEPOSIT_MINIMUM_GBP = 5;
export const MAX_DEPOSIT_MINIMUM_GBP = 100;

/** Hide Deposit + Cash when the deposit would cover almost the whole fare. */
export const DEPOSIT_CASH_MAX_SHARE = 0.95;

export type DepositCashSettings = {
  enabled: boolean;
  percent: number;
  minimumGbp: number;
};

export type DepositCashSnapshot = {
  paymentMethod: typeof PAYMENT_METHOD_DEPOSIT_CASH;
  totalFare: number;
  onlineAmountPaid: number;
  cashBalanceDue: number;
  depositPercentUsed: number;
  depositMinimumUsed: number;
};

export type DepositCashQuote = {
  eligible: boolean;
  totalFare: number;
  depositGbp: number;
  cashDueGbp: number;
  percentUsed: number;
  minimumUsed: number;
};

export const DEPOSIT_CASH_CHOOSE_HEADING = "Choose how you'd like to pay";
export const DEPOSIT_CASH_OPTION_LABEL = "Deposit + Cash";
export const DEPOSIT_CASH_BADGE = "Pay less today";
export const DEPOSIT_CASH_SUPPORTING =
  "Secure your booking with a deposit and pay the remaining balance in cash.";
export const FULL_ONLINE_OPTION_LABEL = "Pay in Full Online";
export const FULL_ONLINE_SUPPORTING = "Secure card payment powered by SumUp.";
export const DEPOSIT_CASH_SUMMARY_HEADING = "Payment summary";
export const DEPOSIT_CASH_SELECTED_HEADING = "Cash payment selected";
export const SECURE_SUMUP_LINE = "Secure payment powered by SumUp";

export function defaultDepositCashSettings(): DepositCashSettings {
  return {
    enabled: DEFAULT_DEPOSIT_CASH_ENABLED,
    percent: DEFAULT_DEPOSIT_PERCENT,
    minimumGbp: DEFAULT_DEPOSIT_MINIMUM_GBP,
  };
}

export function parseDepositPercentInput(value: unknown): number | null {
  if (typeof value === "boolean" || value == null) return null;
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9) return null;
  if (rounded < MIN_DEPOSIT_PERCENT || rounded > MAX_DEPOSIT_PERCENT) return null;
  return rounded;
}

export function parseDepositMinimumInput(value: unknown): number | null {
  if (typeof value === "boolean" || value == null) return null;
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/^£/, ""))
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = roundGbp(raw);
  if (rounded < MIN_DEPOSIT_MINIMUM_GBP || rounded > MAX_DEPOSIT_MINIMUM_GBP) return null;
  return rounded;
}

export function normalizeDepositCashSettings(raw: unknown): DepositCashSettings {
  const defaults = defaultDepositCashSettings();
  if (!raw || typeof raw !== "object") return defaults;
  const input = raw as Partial<DepositCashSettings> & {
    depositCashEnabled?: unknown;
    depositPercent?: unknown;
    depositMinimumGbp?: unknown;
  };
  const percent =
    parseDepositPercentInput(input.percent) ??
    parseDepositPercentInput(input.depositPercent) ??
    defaults.percent;
  const minimumGbp =
    parseDepositMinimumInput(input.minimumGbp) ??
    parseDepositMinimumInput(input.depositMinimumGbp) ??
    defaults.minimumGbp;
  return {
    enabled: input.enabled === true || input.depositCashEnabled === true,
    percent,
    minimumGbp,
  };
}

export function parseDepositCashSettingsInput(raw: unknown): DepositCashSettings {
  if (!raw || typeof raw !== "object") {
    throw new Error("Deposit + Cash settings are required.");
  }
  const input = raw as Record<string, unknown>;
  const enabledRaw = input.enabled ?? input.depositCashEnabled;
  if (enabledRaw !== true && enabledRaw !== false) {
    throw new Error("Deposit + Cash must be enabled or disabled.");
  }
  const percent = parseDepositPercentInput(input.percent ?? input.depositPercent);
  if (percent == null) {
    throw new Error(
      `Deposit percentage must be a whole number between ${MIN_DEPOSIT_PERCENT} and ${MAX_DEPOSIT_PERCENT}.`,
    );
  }
  const minimumGbp = parseDepositMinimumInput(input.minimumGbp ?? input.depositMinimumGbp);
  if (minimumGbp == null) {
    throw new Error(
      `Minimum deposit must be between ${formatGbpAmount(MIN_DEPOSIT_MINIMUM_GBP)} and ${formatGbpAmount(MAX_DEPOSIT_MINIMUM_GBP)}.`,
    );
  }
  return { enabled: enabledRaw === true, percent, minimumGbp };
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === PAYMENT_METHOD_FULL_ONLINE || value === PAYMENT_METHOD_DEPOSIT_CASH;
}

export function normalizePaymentMethod(value: unknown): PaymentMethod {
  return value === PAYMENT_METHOD_DEPOSIT_CASH
    ? PAYMENT_METHOD_DEPOSIT_CASH
    : PAYMENT_METHOD_FULL_ONLINE;
}

export function isDepositCashPaymentMethod(value: unknown): boolean {
  return value === PAYMENT_METHOD_DEPOSIT_CASH;
}

/**
 * Calculate a deposit from the FINAL fare (after return discount + airport charges).
 * cashDue + deposit always equals the exact total.
 */
export function calculateDepositCashQuote(
  finalFareGbp: number,
  settings: DepositCashSettings,
): DepositCashQuote {
  const totalFare = roundGbp(finalFareGbp);
  const percentUsed = settings.percent;
  const minimumUsed = roundGbp(settings.minimumGbp);
  if (!Number.isFinite(totalFare) || totalFare <= 0) {
    return {
      eligible: false,
      totalFare,
      depositGbp: 0,
      cashDueGbp: 0,
      percentUsed,
      minimumUsed,
    };
  }
  const percentAmount = roundGbp((totalFare * percentUsed) / 100);
  let depositGbp = roundGbp(Math.max(percentAmount, minimumUsed));
  depositGbp = roundGbp(Math.min(depositGbp, totalFare));
  const cashDueGbp = roundGbp(totalFare - depositGbp);
  const eligible =
    cashDueGbp >= 0.01 && depositGbp + 0.001 < totalFare * DEPOSIT_CASH_MAX_SHARE;
  return {
    eligible,
    totalFare,
    depositGbp,
    cashDueGbp,
    percentUsed,
    minimumUsed,
  };
}

export function snapshotDepositCash(quote: DepositCashQuote): DepositCashSnapshot {
  return {
    paymentMethod: PAYMENT_METHOD_DEPOSIT_CASH,
    totalFare: quote.totalFare,
    onlineAmountPaid: quote.depositGbp,
    cashBalanceDue: quote.cashDueGbp,
    depositPercentUsed: quote.percentUsed,
    depositMinimumUsed: quote.minimumUsed,
  };
}

export function depositCashAmountsMatch(
  snapshot: Pick<DepositCashSnapshot, "totalFare" | "onlineAmountPaid" | "cashBalanceDue">,
): boolean {
  return (
    roundGbp(snapshot.onlineAmountPaid + snapshot.cashBalanceDue) ===
    roundGbp(snapshot.totalFare)
  );
}

export function paidBookingConversionValueGbp(record: {
  totalFare?: number | null;
  amount?: number | null;
}): number {
  if (typeof record.totalFare === "number" && record.totalFare > 0) {
    return roundGbp(record.totalFare);
  }
  if (typeof record.amount === "number" && record.amount > 0) {
    return roundGbp(record.amount);
  }
  return 0;
}

export function remainingCashDueGbp(record: {
  paymentMethod?: string | null;
  cashBalanceDue?: number | null;
  cashCollected?: boolean | null;
}): number {
  if (!isDepositCashPaymentMethod(record.paymentMethod)) return 0;
  if (record.cashCollected === true) return 0;
  const due = Number(record.cashBalanceDue);
  return Number.isFinite(due) && due > 0 ? roundGbp(due) : 0;
}

export function cashDueOnTheDayCopy(cashDueGbp: number): string {
  return `Please have ${formatGbpAmount(cashDueGbp)} in cash available for your driver on the day.`;
}

export function cashSelectedBody(cashDueGbp: number): string {
  return `The remaining ${formatGbpAmount(cashDueGbp)} must be paid in cash to your driver on the day. Please ensure you have the cash available before your pickup.`;
}

export function cashAgreementLabel(cashDueGbp: number): string {
  return `I understand that the remaining ${formatGbpAmount(cashDueGbp)} is payable in cash to my driver on the day.`;
}

export function depositPayButtonLabel(depositGbp: number): string {
  return `Pay ${formatGbpAmount(depositGbp)} Deposit & Confirm Booking`;
}

export function fullPayButtonLabel(totalGbp: number): string {
  return `Pay ${formatGbpAmount(totalGbp)} & Confirm Booking`;
}

export function nothingToPayOnTheDayLabel(): string {
  return "Nothing to pay on the day";
}

export function cashToDriverOnTheDayLabel(cashDueGbp: number): string {
  return `${formatGbpAmount(cashDueGbp)} cash to your driver on the day`;
}

export function todayPayLabel(amountGbp: number): string {
  return `${formatGbpAmount(amountGbp)} today`;
}

export type PublicDepositCashOffer = {
  enabled: boolean;
  eligible: boolean;
  percent: number;
  minimumGbp: number;
  totalFare: number;
  depositGbp: number;
  cashDueGbp: number;
};

export function publicDepositCashOffer(
  finalFareGbp: number,
  settings: DepositCashSettings,
): PublicDepositCashOffer {
  const quote = calculateDepositCashQuote(finalFareGbp, settings);
  return {
    enabled: settings.enabled === true,
    eligible: settings.enabled === true && quote.eligible,
    percent: quote.percentUsed,
    minimumGbp: quote.minimumUsed,
    totalFare: quote.totalFare,
    depositGbp: quote.depositGbp,
    cashDueGbp: quote.cashDueGbp,
  };
}

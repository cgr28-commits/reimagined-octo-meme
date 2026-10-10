/**
 * Public luggage quantities for the quote and booking.
 *
 * Public selector when Offer 7 Seater Minibus Online is ON:
 *   0  1  2  3
 *   4  5+
 *
 * "5+" means five or more large bags. It must never be stored or shown as an
 * exact count of 5. That selector is the public luggage maximum: counts above
 * the 5+ token are rejected. When the 7 Seater is off, the maximum is 4.
 * Saloon, Estate and Business Class suitability is separate and unchanged.
 *
 * Luggage quantity does not hold payment. A 7 Seater within the 7-passenger
 * maximum and this luggage selector can be booked and paid. Historical
 * requests that already stored luggage_capacity still show that reason.
 * Do not invent or advertise an exact physical luggage capacity.
 */

export const PUBLIC_FIVE_PLUS_SUITCASES = 5;
export const PUBLIC_FIVE_PLUS_SUITCASE_LABEL = "5+";

export const MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD = 12;

export const PAYMENT_HOLD_REASONS = [
  "short_notice",
  "unavailable_period",
  "luggage_capacity",
] as const;

export type PaymentHoldReason = (typeof PAYMENT_HOLD_REASONS)[number];

export const LUGGAGE_CAPACITY_HOLD_REASON = "luggage_capacity" as const;

export const LUGGAGE_CAPACITY_CONFIRMATION_HEADING =
  "Luggage capacity confirmation required";

export const LUGGAGE_CAPACITY_CONFIRMATION_BODY =
  "With this number of passengers and standard suitcases (23kg), we need to confirm the available 7 Seater has sufficient luggage space before you book.";

export const LUGGAGE_CAPACITY_CONFIRMATION_CTA = "Request Capacity Confirmation";

export const LUGGAGE_CAPACITY_OWNER_REASON = "Luggage capacity confirmation";

export const LUGGAGE_CAPACITY_RECEIVED_BODY =
  "We’ll confirm the available 7 Seater has sufficient luggage space, then email you a secure payment link if we can fulfil the journey. No payment has been taken.";

export type LuggageExactnessOptions = {
  /** false = customer selected 5+ (five or more). true/omitted = exact count. */
  suitcasesExact?: boolean;
};

export function isFivePlusLuggage(
  suitcases: number,
  options?: LuggageExactnessOptions,
): boolean {
  if (options?.suitcasesExact === false) return true;
  const bags = Math.floor(Number(suitcases));
  return Number.isFinite(bags) && bags >= PUBLIC_FIVE_PLUS_SUITCASES;
}

export function formatPublicSuitcaseChoice(count: number): string {
  const n = Math.floor(Number(count));
  if (Number.isFinite(n) && n >= PUBLIC_FIVE_PLUS_SUITCASES) {
    return PUBLIC_FIVE_PLUS_SUITCASE_LABEL;
  }
  return String(count);
}

export function formatOwnerLargeBags(
  suitcases: number,
  options?: LuggageExactnessOptions,
): string {
  if (isFivePlusLuggage(suitcases, options)) {
    return PUBLIC_FIVE_PLUS_SUITCASE_LABEL;
  }
  const bags = Math.floor(Number(suitcases));
  return Number.isFinite(bags) && bags >= 0 ? String(bags) : "0";
}

export function formatOwnerLargeBagsLabel(
  suitcases: number,
  options?: LuggageExactnessOptions,
): string {
  const value = formatOwnerLargeBags(suitcases, options);
  return value === PUBLIC_FIVE_PLUS_SUITCASE_LABEL
    ? "5+ large bags"
    : `${value} large bag${value === "1" ? "" : "s"}`;
}

export function applyPublicFivePlusLuggage<
  T extends { suitcases: number; suitcasesExact?: boolean },
>(booking: T): T {
  if (!isFivePlusLuggage(booking.suitcases, { suitcasesExact: booking.suitcasesExact })) {
    return booking;
  }
  return {
    ...booking,
    suitcases: PUBLIC_FIVE_PLUS_SUITCASES,
    suitcasesExact: false,
  };
}

/** Luggage quantity never blocks booking or payment. The public selector is the limit. */
export function needsLuggageCapacityConfirmation(
  _passengers: number,
  _suitcases: number,
  _options?: LuggageExactnessOptions,
): boolean {
  return false;
}

export function combinePaymentHoldReasons(options: {
  underMinimumNotice?: boolean;
  blockingPeriodId?: string | null;
  passengers: number;
  suitcases: number;
  suitcasesExact?: boolean;
}): PaymentHoldReason[] {
  const reasons: PaymentHoldReason[] = [];
  if (options.underMinimumNotice) reasons.push("short_notice");
  if (options.blockingPeriodId) reasons.push("unavailable_period");
  if (
    needsLuggageCapacityConfirmation(options.passengers, options.suitcases, {
      suitcasesExact: options.suitcasesExact,
    })
  ) {
    reasons.push(LUGGAGE_CAPACITY_HOLD_REASON);
  }
  return reasons;
}

export function hasLuggageCapacityHold(
  reasons: readonly string[] | undefined | null,
): boolean {
  return Array.isArray(reasons) && reasons.includes(LUGGAGE_CAPACITY_HOLD_REASON);
}

export function ownerHoldReasonLabel(
  reasons: readonly string[] | undefined | null,
): string {
  if (hasLuggageCapacityHold(reasons)) {
    return LUGGAGE_CAPACITY_OWNER_REASON;
  }
  if (reasons?.includes("unavailable_period")) {
    return "Availability confirmation";
  }
  if (reasons?.includes("short_notice")) {
    return "Short-notice request";
  }
  return "Short-notice request";
}

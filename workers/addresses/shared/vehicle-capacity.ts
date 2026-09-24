/**
 * Conservative high-load luggage capacity confirmation for the 7 Seater Minibus.
 *
 * This is a booking-safety hold, not a claim about exact physical vehicle
 * capacity. A high combined passenger + large-bag load must not go to
 * automatic payment until the owner confirms the available 7 Seater has
 * sufficient luggage space.
 *
 * Rule:
 *   party requires a 7 Seater (passengers > 4 OR large bags > 4)
 *   AND (passengers + large bags) >= MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD (12)
 *
 * Combinations that trigger (public 1–7 passengers / 0–7 large bags):
 *   5+7, 6+6, 6+7, 7+5, 7+6, 7+7
 *
 * Combinations that do not trigger (normal Minibus instant booking when ON):
 *   5+0–6, 6+0–5, 7+0–4, and 1–4 passengers with 5–7 bags where combined < 12
 *   (4+7=11, 3+7=10, 2+7=9, 1+7=8)
 *
 * Selector limits stay 1–7 / 0–7 when Minibus is ON. This only holds payment.
 */

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
  "With this number of passengers and large bags, we need to confirm the available 7 Seater has sufficient luggage space before you book.";

export const LUGGAGE_CAPACITY_CONFIRMATION_CTA = "Request Capacity Confirmation";

export const LUGGAGE_CAPACITY_OWNER_REASON = "Luggage capacity confirmation";

export const LUGGAGE_CAPACITY_RECEIVED_BODY =
  "We’ll confirm the available 7 Seater has sufficient luggage space, then email you a secure payment link if we can fulfil the journey. No payment has been taken.";

export function needsLuggageCapacityConfirmation(
  passengers: number,
  suitcases: number,
): boolean {
  const pax = Math.floor(Number(passengers));
  const bags = Math.floor(Number(suitcases));
  if (!Number.isFinite(pax) || !Number.isFinite(bags)) return false;
  if (pax < 1 || bags < 0) return false;
  const requiresMinibus = pax > 4 || bags > 4;
  if (!requiresMinibus) return false;
  return pax + bags >= MINIBUS_HIGH_LOAD_COMBINED_THRESHOLD;
}

export function combinePaymentHoldReasons(options: {
  underMinimumNotice?: boolean;
  blockingPeriodId?: string | null;
  passengers: number;
  suitcases: number;
}): PaymentHoldReason[] {
  const reasons: PaymentHoldReason[] = [];
  if (options.underMinimumNotice) reasons.push("short_notice");
  if (options.blockingPeriodId) reasons.push("unavailable_period");
  if (needsLuggageCapacityConfirmation(options.passengers, options.suitcases)) {
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

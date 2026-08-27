/**
 * Public-website £5 first-booking offer.
 *
 * Eligibility is based on the taxi/journey fare BEFORE airport access charges
 * (Express Drop-Off / Pick-Up). Airport access never counts toward the £40 minimum
 * and is never discounted by this offer.
 *
 * When stackWithReturnJourneyDiscount is true, the offer applies on top of the
 * existing 5% return-journey saving (return discount first, then £5).
 *
 * Change `shared/first-booking-offer.json` only — QuoteCard + Worker pick it up.
 */

import config from "./first-booking-offer.json";

export type FirstBookingOfferConfig = {
  enabled: boolean;
  discountAmountGbp: number;
  minimumEligibleJourneyFareGbp: number;
  /** When false, the offer is withheld if a return-journey discount already applies. */
  stackWithReturnJourneyDiscount: boolean;
};

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export const FIRST_BOOKING_OFFER_CONFIG: FirstBookingOfferConfig = {
  enabled: Boolean(config.enabled),
  discountAmountGbp: roundGbp(Number(config.discountAmountGbp) || 0),
  minimumEligibleJourneyFareGbp: roundGbp(
    Number(config.minimumEligibleJourneyFareGbp) || 0,
  ),
  stackWithReturnJourneyDiscount: Boolean(config.stackWithReturnJourneyDiscount),
};

export const FIRST_BOOKING_OFFER_LABEL = "£5 FIRST BOOKING OFFER";
export const FIRST_BOOKING_OFFER_SHORT_LABEL = "First Booking Offer";

export type FirstBookingOfferInput = {
  /**
   * Taxi/journey fare before airport access charges and before this offer.
   * For return journeys this is the fare AFTER the 5% return discount.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /** When false, do not apply even if fare-eligible (e.g. personal/quick quote). */
  claimOffer?: boolean;
  /** True when the existing 5% return discount is already in the journey fare. */
  returnJourneyDiscountApplied?: boolean;
  /** Override config (tests). */
  config?: Partial<FirstBookingOfferConfig>;
  /**
   * When true, this email has already redeemed the first-booking offer.
   * Server sets this from KV; client leaves unset (optimistic until payment).
   */
  alreadyRedeemed?: boolean;
};

export type FirstBookingOfferResult = {
  enabled: boolean;
  eligible: boolean;
  applied: boolean;
  discountGbp: number;
  journeyFareAfterOfferGbp: number;
  minimumEligibleJourneyFareGbp: number;
  reason:
    | "applied"
    | "disabled"
    | "not_claimed"
    | "below_minimum"
    | "already_redeemed"
    | "return_stack_blocked"
    | "invalid_fare";
};

export function resolveFirstBookingOffer(
  input: FirstBookingOfferInput,
): FirstBookingOfferResult {
  const cfg: FirstBookingOfferConfig = {
    ...FIRST_BOOKING_OFFER_CONFIG,
    ...(input.config ?? {}),
  };
  const journeyFare = roundGbp(Number(input.journeyFareBeforeAirportAccessGbp));
  const base: Omit<FirstBookingOfferResult, "reason" | "eligible" | "applied"> = {
    enabled: cfg.enabled,
    discountGbp: 0,
    journeyFareAfterOfferGbp: Number.isFinite(journeyFare) ? Math.max(0, journeyFare) : 0,
    minimumEligibleJourneyFareGbp: cfg.minimumEligibleJourneyFareGbp,
  };

  if (!cfg.enabled || cfg.discountAmountGbp <= 0) {
    return { ...base, eligible: false, applied: false, reason: "disabled" };
  }
  if (!Number.isFinite(journeyFare) || journeyFare <= 0) {
    return { ...base, eligible: false, applied: false, reason: "invalid_fare" };
  }
  if (input.claimOffer === false) {
    return { ...base, eligible: false, applied: false, reason: "not_claimed" };
  }
  if (input.alreadyRedeemed === true) {
    return { ...base, eligible: false, applied: false, reason: "already_redeemed" };
  }
  if (
    input.returnJourneyDiscountApplied &&
    cfg.stackWithReturnJourneyDiscount === false
  ) {
    return {
      ...base,
      eligible: false,
      applied: false,
      reason: "return_stack_blocked",
    };
  }
  if (journeyFare < cfg.minimumEligibleJourneyFareGbp) {
    return { ...base, eligible: false, applied: false, reason: "below_minimum" };
  }

  const discountGbp = roundGbp(
    Math.min(cfg.discountAmountGbp, journeyFare),
  );
  return {
    enabled: cfg.enabled,
    eligible: true,
    applied: true,
    discountGbp,
    journeyFareAfterOfferGbp: roundGbp(Math.max(0, journeyFare - discountGbp)),
    minimumEligibleJourneyFareGbp: cfg.minimumEligibleJourneyFareGbp,
    reason: "applied",
  };
}

/** Normalise email for first-booking redemption keys. */
export function normalizeFirstBookingEmail(email: string): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function firstBookingOfferRedeemedKey(email: string): string {
  return `promo:first-booking-offer:${normalizeFirstBookingEmail(email)}`;
}

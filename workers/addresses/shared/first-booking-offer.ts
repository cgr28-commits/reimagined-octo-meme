/**
 * Public-website £5 first-booking offer.
 *
 * Simple rule: £5 off your first booking when you spend £40 or more.
 *
 * The £40 minimum uses the customer’s total booking value BEFORE this £5 offer:
 * journey fare (after any 5% return discount) + airport fixed costs + Express
 * airport access. Express therefore counts toward the £40 minimum.
 *
 * The £5 itself is taken from the journey/transfer portion (never from Express).
 * Avoided Express (free drop-off area) is not a promotional saving.
 *
 * When stackWithReturnJourneyDiscount is true, the offer stacks on top of the
 * existing 5% return-journey saving (return discount first, then £5).
 *
 * Change `shared/first-booking-offer.json` only — QuoteCard + Worker pick it up.
 */

import config from "./first-booking-offer.json";

export type FirstBookingOfferConfig = {
  enabled: boolean;
  discountAmountGbp: number;
  /** Minimum booking value (before this offer) required to qualify. */
  minimumEligibleBookingValueGbp: number;
  /** When false, the offer is withheld if a return-journey discount already applies. */
  stackWithReturnJourneyDiscount: boolean;
};

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

const rawConfig = config as Record<string, unknown>;

export const FIRST_BOOKING_OFFER_CONFIG: FirstBookingOfferConfig = {
  enabled: Boolean(rawConfig.enabled),
  discountAmountGbp: roundGbp(Number(rawConfig.discountAmountGbp) || 0),
  minimumEligibleBookingValueGbp: roundGbp(
    Number(
      rawConfig.minimumEligibleBookingValueGbp ??
        // Legacy key from the old “journey fare only” rule.
        rawConfig.minimumEligibleJourneyFareGbp,
    ) || 0,
  ),
  stackWithReturnJourneyDiscount: Boolean(rawConfig.stackWithReturnJourneyDiscount),
};

/** @deprecated Use minimumEligibleBookingValueGbp — kept for gradual call-site migration. */
export const minimumEligibleJourneyFareGbpAlias =
  FIRST_BOOKING_OFFER_CONFIG.minimumEligibleBookingValueGbp;

export const FIRST_BOOKING_OFFER_LABEL = "£5 FIRST BOOKING OFFER";
export const FIRST_BOOKING_OFFER_SHORT_LABEL = "First Booking Offer";

export type FirstBookingOfferInput = {
  /**
   * Taxi/journey fare after return discount (when booked), before this offer
   * and before Express airport access.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /**
   * Express Drop-Off / Pick-Up fee included in booking value for the £40 check.
   * Not discounted by this offer.
   */
  airportAccessChargeGbp?: number;
  /**
   * Operational airport fixed costs (e.g. Dublin parking/toll) included in
   * booking value for the £40 check. Not discounted by this offer.
   */
  airportFixedCostsGbp?: number;
  /** When false, do not apply even if value-eligible (e.g. personal/quick quote). */
  claimOffer?: boolean;
  /** True when the existing 5% return discount is already in the journey fare. */
  returnJourneyDiscountApplied?: boolean;
  /** Override config (tests). */
  config?: Partial<FirstBookingOfferConfig>;
  /**
   * When true, this email has already redeemed the first-booking offer.
   * Server sets this from KV; client leaves unset until verification.
   */
  alreadyRedeemed?: boolean;
};

export type FirstBookingOfferResult = {
  enabled: boolean;
  eligible: boolean;
  applied: boolean;
  discountGbp: number;
  journeyFareAfterOfferGbp: number;
  bookingValueBeforeOfferGbp: number;
  minimumEligibleBookingValueGbp: number;
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
  const airportAccessChargeGbp = roundGbp(
    Math.max(0, Number(input.airportAccessChargeGbp) || 0),
  );
  const airportFixedCostsGbp = roundGbp(
    Math.max(0, Number(input.airportFixedCostsGbp) || 0),
  );
  const bookingValueBeforeOfferGbp = roundGbp(
    (Number.isFinite(journeyFare) ? Math.max(0, journeyFare) : 0) +
      airportFixedCostsGbp +
      airportAccessChargeGbp,
  );

  const base: Omit<FirstBookingOfferResult, "reason" | "eligible" | "applied"> = {
    enabled: cfg.enabled,
    discountGbp: 0,
    journeyFareAfterOfferGbp: Number.isFinite(journeyFare) ? Math.max(0, journeyFare) : 0,
    bookingValueBeforeOfferGbp,
    minimumEligibleBookingValueGbp: cfg.minimumEligibleBookingValueGbp,
  };

  if (!cfg.enabled || cfg.discountAmountGbp <= 0) {
    return { ...base, eligible: false, applied: false, reason: "disabled" };
  }
  if (!Number.isFinite(journeyFare) || journeyFare < 0) {
    return { ...base, eligible: false, applied: false, reason: "invalid_fare" };
  }
  if (journeyFare <= 0 && bookingValueBeforeOfferGbp <= 0) {
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
  if (bookingValueBeforeOfferGbp < cfg.minimumEligibleBookingValueGbp) {
    return { ...base, eligible: false, applied: false, reason: "below_minimum" };
  }
  if (journeyFare <= 0) {
    // Qualifying value came only from access/fixed costs — nothing left to discount.
    return { ...base, eligible: true, applied: false, reason: "invalid_fare" };
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
    bookingValueBeforeOfferGbp,
    minimumEligibleBookingValueGbp: cfg.minimumEligibleBookingValueGbp,
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

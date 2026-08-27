/**
 * Public-website £5 booking saving.
 *
 * Simple rule: £5 off when the current booking value is £40 or more.
 * Applies to every customer — no email / history / redemption check.
 *
 * Booking value (before this £5) =
 *   journey fare (after any 5% return discount)
 *   + airport fixed costs
 *   + Express airport access
 *
 * The £5 is taken from the journey/transfer portion (never from Express).
 * Avoided Express (free drop-off area) is not a promotional saving.
 *
 * When stackWithReturnJourneyDiscount is true, stacks on top of the 5% return
 * saving (return discount first, then £5).
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
        rawConfig.minimumEligibleJourneyFareGbp,
    ) || 0,
  ),
  stackWithReturnJourneyDiscount: Boolean(rawConfig.stackWithReturnJourneyDiscount),
};

/** Customer-facing labels — not limited to first bookings. */
export const FIRST_BOOKING_OFFER_LABEL = "£5 BOOKING SAVING";
export const FIRST_BOOKING_OFFER_SHORT_LABEL = "£5 Booking Saving";

export type FirstBookingOfferInput = {
  /**
   * Taxi/journey fare after return discount (when booked), before this offer
   * and before Express airport access.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /** Express fee included in booking value for the £40 check. Not discounted. */
  airportAccessChargeGbp?: number;
  /** Airport fixed costs included in booking value. Not discounted. */
  airportFixedCostsGbp?: number;
  /** When false, do not apply (e.g. personal/quick quote). */
  claimOffer?: boolean;
  /** True when the existing 5% return discount is already in the journey fare. */
  returnJourneyDiscountApplied?: boolean;
  /** Override config (tests). */
  config?: Partial<FirstBookingOfferConfig>;
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
    return { ...base, eligible: true, applied: false, reason: "invalid_fare" };
  }

  const discountGbp = roundGbp(Math.min(cfg.discountAmountGbp, journeyFare));
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

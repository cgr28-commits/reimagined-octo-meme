/**
 * Authoritative public-website fare breakdown for display + SumUp parity.
 *
 * Layers (never reorder casually):
 * 1. Journey fare (after 5% return discount when booked)
 * 2. Promotional discounts (first-booking £5; return saving is already in layer 1)
 * 3. Airport access charges (Express — never discounted, never in promo totals)
 * 4. Final amount payable
 *
 * First-booking £40 minimum uses booking value before the £5 offer:
 * journey + airport fixed costs + Express access.
 */

import {
  RETURN_JOURNEY_DISCOUNT_RATE,
  formatReturnJourneyDiscountPercent,
} from "./return-journey-discount";
import {
  FIRST_BOOKING_OFFER_CONFIG,
  FIRST_BOOKING_OFFER_LABEL,
  FIRST_BOOKING_OFFER_SHORT_LABEL,
  resolveFirstBookingOffer,
  type FirstBookingOfferConfig,
  type FirstBookingOfferResult,
} from "./first-booking-offer";

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

/** Undiscounted 2× one-way total implied by a post-discount return fare. */
export function getUndiscountedReturnJourneyFareGbp(
  returnJourneyFareGbp: number,
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): number {
  const fare = roundGbp(returnJourneyFareGbp);
  if (!Number.isFinite(fare) || fare < 0 || !(rate > 0 && rate < 1)) {
    return fare;
  }
  return roundGbp(fare / (1 - rate));
}

export function getReturnJourneySavingGbp(
  returnJourneyFareGbp: number,
  rate: number = RETURN_JOURNEY_DISCOUNT_RATE,
): number {
  const fare = roundGbp(returnJourneyFareGbp);
  const undiscounted = getUndiscountedReturnJourneyFareGbp(fare, rate);
  return roundGbp(Math.max(0, undiscounted - fare));
}

export type WebsiteFareBreakdownInput = {
  /**
   * Taxi/journey fare after return discount (when booked), before first-booking
   * offer and before Express airport access.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /**
   * Operational airport fixed costs already folded into the quoted transfer
   * (e.g. Dublin parking/toll). Never discounted; counts toward £40 booking value.
   */
  airportFixedCostsGbp?: number;
  /** Express Drop-Off / Pick-Up fee when selected (0 when free option chosen). */
  airportAccessChargeGbp?: number;
  returnJourney?: boolean;
  /** Apply first-booking offer when booking-value-eligible. */
  claimFirstBookingOffer?: boolean;
  alreadyRedeemedFirstBookingOffer?: boolean;
  firstBookingConfig?: Partial<FirstBookingOfferConfig>;
};

export type WebsiteFareBreakdown = {
  journeyFareBeforeReturnDiscountGbp: number;
  journeyFareBeforePromotionsGbp: number;
  airportFixedCostsGbp: number;
  returnJourney: boolean;
  returnJourneySavingGbp: number;
  returnJourneyDiscountPercentLabel: string;
  firstBooking: FirstBookingOfferResult;
  firstBookingSavingGbp: number;
  journeyFareAfterPromotionsGbp: number;
  /** Transfer subtotal after promos + undiscounted fixed costs (no Express). */
  transferFareAfterPromotionsGbp: number;
  airportAccessChargeGbp: number;
  /** Journey + fixed costs + Express, before the £5 first-booking offer. */
  bookingValueBeforeFirstBookingOfferGbp: number;
  totalPromotionalSavingGbp: number;
  /** Strikethrough / original eligible price (journey before promos only). */
  originalEligibleJourneyPriceGbp: number;
  finalAmountPayableGbp: number;
  firstBookingLabel: string;
  firstBookingShortLabel: string;
};

/**
 * Compose the customer-facing / SumUp fare from journey + promos + access.
 * Airport access is added last and never enters promotional savings.
 */
export function composeWebsiteFareBreakdown(
  input: WebsiteFareBreakdownInput,
): WebsiteFareBreakdown {
  const returnJourney = Boolean(input.returnJourney);
  const journeyBeforePromo = roundGbp(
    Math.max(0, Number(input.journeyFareBeforeAirportAccessGbp) || 0),
  );
  const airportFixedCostsGbp = roundGbp(
    Math.max(0, Number(input.airportFixedCostsGbp) || 0),
  );
  const airportAccessChargeGbp = roundGbp(
    Math.max(0, Number(input.airportAccessChargeGbp) || 0),
  );

  const returnJourneySavingGbp = returnJourney
    ? getReturnJourneySavingGbp(journeyBeforePromo)
    : 0;
  const journeyFareBeforeReturnDiscountGbp = returnJourney
    ? getUndiscountedReturnJourneyFareGbp(journeyBeforePromo)
    : journeyBeforePromo;

  const bookingValueBeforeFirstBookingOfferGbp = roundGbp(
    journeyBeforePromo + airportFixedCostsGbp + airportAccessChargeGbp,
  );

  const firstBooking = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: journeyBeforePromo,
    airportAccessChargeGbp,
    airportFixedCostsGbp,
    claimOffer: input.claimFirstBookingOffer !== false,
    returnJourneyDiscountApplied: returnJourney,
    alreadyRedeemed: input.alreadyRedeemedFirstBookingOffer === true,
    config: input.firstBookingConfig,
  });

  const firstBookingSavingGbp = firstBooking.applied ? firstBooking.discountGbp : 0;
  const journeyFareAfterPromotionsGbp = firstBooking.applied
    ? firstBooking.journeyFareAfterOfferGbp
    : journeyBeforePromo;
  const transferFareAfterPromotionsGbp = roundGbp(
    journeyFareAfterPromotionsGbp + airportFixedCostsGbp,
  );
  const totalPromotionalSavingGbp = roundGbp(
    returnJourneySavingGbp + firstBookingSavingGbp,
  );
  const finalAmountPayableGbp = roundGbp(
    transferFareAfterPromotionsGbp + airportAccessChargeGbp,
  );

  return {
    journeyFareBeforeReturnDiscountGbp,
    journeyFareBeforePromotionsGbp: journeyBeforePromo,
    airportFixedCostsGbp,
    returnJourney,
    returnJourneySavingGbp,
    returnJourneyDiscountPercentLabel: formatReturnJourneyDiscountPercent(),
    firstBooking,
    firstBookingSavingGbp,
    journeyFareAfterPromotionsGbp,
    transferFareAfterPromotionsGbp,
    airportAccessChargeGbp,
    bookingValueBeforeFirstBookingOfferGbp,
    totalPromotionalSavingGbp,
    originalEligibleJourneyPriceGbp: journeyFareBeforeReturnDiscountGbp,
    finalAmountPayableGbp,
    firstBookingLabel: FIRST_BOOKING_OFFER_LABEL,
    firstBookingShortLabel: FIRST_BOOKING_OFFER_SHORT_LABEL,
  };
}

export function formatGbpFare(amount: number): string {
  const rounded = roundGbp(amount);
  if (!Number.isFinite(rounded)) return "£—";
  return `£${rounded.toFixed(2)}`;
}

export { FIRST_BOOKING_OFFER_CONFIG, FIRST_BOOKING_OFFER_LABEL };

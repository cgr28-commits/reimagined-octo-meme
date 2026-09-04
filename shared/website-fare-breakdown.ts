/**
 * Authoritative public-website fare breakdown for display + SumUp parity.
 *
 * Exact order (do not reorder):
 * 1. Journey fare (after 5% return discount when booked) + fixed costs
 * 2. Optional promotional savings on the journey portion only
 * 3. Add currently selected airport access charge (Express)
 * 4. finalAmountPayable = transferAfterPromos + Express
 *
 * Display should show Journey fare and Express separately — never fold Express
 * into an “Original booking value” that is then shown again as +Express.
 *
 * Avoided Express (free drop-off) is NOT a promotional saving.
 * No email / customer-history / redemption gate.
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
import {
  applyReturnOfferSaving,
  formatReturnOfferPercent,
} from "./return-offer";

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
   * Taxi/journey fare after return discount (when booked), before the £5
   * booking saving and before Express airport access.
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
  /**
   * Apply the £5 booking saving when booking-value-eligible.
   * Default true for open website. Pass false only for personal/quick-quote paths.
   */
  claimFirstBookingOffer?: boolean;
  firstBookingConfig?: Partial<FirstBookingOfferConfig>;
  /**
   * Secure follow-up return-offer rate (e.g. 0.05). Applied to the journey
   * fare only — never airport fixed costs or Express. Do not stack with the
   * £5 first-booking offer.
   */
  returnOfferDiscountRate?: number;
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
  returnOfferSavingGbp: number;
  returnOfferDiscountPercentLabel: string;
  journeyFareAfterPromotionsGbp: number;
  /** Transfer subtotal after promos + undiscounted fixed costs (no Express). */
  transferFareAfterPromotionsGbp: number;
  airportAccessChargeGbp: number;
  /**
   * Journey + fixed costs + Express — used only for £40 booking-value eligibility.
   * Do not display this as “Original booking value” when Express is also listed.
   */
  bookingValueBeforeFirstBookingOfferGbp: number;
  /**
   * Journey (+ fixed costs) after promos, before Express — customer “Journey fare” line.
   */
  journeyFareDisplayGbp: number;
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

  const returnOfferRate = Number(input.returnOfferDiscountRate);
  const applyReturnOffer =
    Number.isFinite(returnOfferRate) && returnOfferRate > 0 && returnOfferRate < 1;
  const returnOffer = applyReturnOffer
    ? applyReturnOfferSaving(journeyBeforePromo, returnOfferRate)
    : { savingGbp: 0, fareAfterGbp: journeyBeforePromo };
  const returnOfferSavingGbp = returnOffer.savingGbp;

  const firstBooking = resolveFirstBookingOffer({
    journeyFareBeforeAirportAccessGbp: journeyBeforePromo,
    airportAccessChargeGbp,
    airportFixedCostsGbp,
    claimOffer: input.claimFirstBookingOffer !== false && !applyReturnOffer,
    returnJourneyDiscountApplied: returnJourney,
    config: input.firstBookingConfig,
  });

  const firstBookingSavingGbp = firstBooking.applied ? firstBooking.discountGbp : 0;
  const journeyFareAfterPromotionsGbp = applyReturnOffer
    ? returnOffer.fareAfterGbp
    : firstBooking.applied
      ? firstBooking.journeyFareAfterOfferGbp
      : journeyBeforePromo;
  const transferFareAfterPromotionsGbp = roundGbp(
    journeyFareAfterPromotionsGbp + airportFixedCostsGbp,
  );
  const totalPromotionalSavingGbp = roundGbp(
    returnJourneySavingGbp + firstBookingSavingGbp + returnOfferSavingGbp,
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
    returnOfferSavingGbp,
    returnOfferDiscountPercentLabel: formatReturnOfferPercent(
      applyReturnOffer ? returnOfferRate : undefined,
    ),
    journeyFareAfterPromotionsGbp,
    transferFareAfterPromotionsGbp,
    airportAccessChargeGbp,
    bookingValueBeforeFirstBookingOfferGbp,
    journeyFareDisplayGbp: transferFareAfterPromotionsGbp,
    totalPromotionalSavingGbp,
    originalEligibleJourneyPriceGbp: journeyFareBeforeReturnDiscountGbp,
    finalAmountPayableGbp,
    firstBookingLabel: FIRST_BOOKING_OFFER_LABEL,
    firstBookingShortLabel: FIRST_BOOKING_OFFER_SHORT_LABEL,
  };
}

import { formatGbpAmount } from "./gbp";

/** Same display rules as formatQuote / formatGbpAmount (whole £241; pence £179.50). */
export function formatGbpFare(amount: number): string {
  return formatGbpAmount(amount);
}

export { FIRST_BOOKING_OFFER_CONFIG, FIRST_BOOKING_OFFER_LABEL };

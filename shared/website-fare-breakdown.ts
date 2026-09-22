/**
 * Authoritative public-website fare breakdown for display + SumUp parity.
 *
 * Exact order (do not reorder):
 * 1. Base journey/vehicle fare per leg (Estate +£6 already in that fare)
 * 2. Combine outbound + return BASE fares
 * 3. 5% return-journey discount on that BASE journey total only
 * 4. Night & Weekend Surcharge on each qualifying leg, from the original
 *    undiscounted base fare (never reduced by the 5%)
 * 5. Add airport/barrier/fixed costs at full value
 * 6. Add selected Express / airport access at full value
 * 7. finalAmountPayable = discounted base + surcharge + fixed + Express
 *
 * The 5% return discount never reduces the Night & Weekend Surcharge,
 * airport/barrier/Express, or other fixed charges.
 *
 * Other promotions (e.g. follow-up return-offer codes) keep their existing
 * rule: they apply to the journey excluding the Night & Weekend Surcharge.
 *
 * Display should show Journey fare and Express separately — never fold Express
 * into an “Original booking value” that is then shown again as +Express.
 *
 * Avoided Express (free drop-off) is NOT a promotional saving.
 */

import {
  RETURN_JOURNEY_DISCOUNT_RATE,
  formatReturnJourneyDiscountPercent,
} from "./return-journey-discount";
import { NIGHT_WEEKEND_SURCHARGE_LABEL } from "./night-weekend-surcharge";
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
   * Taxi/journey fare after the 5% return discount (when booked) PLUS any
   * Night & Weekend Surcharge already added by the pricing engine, before
   * Express airport access. The surcharge is not discounted.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /**
   * Night & Weekend Surcharge already included in
   * `journeyFareBeforeAirportAccessGbp`. Displayed separately — not added again.
   */
  nightWeekendSurchargeGbp?: number;
  /**
   * Operational airport fixed costs already folded into the quoted transfer
   * (e.g. Dublin parking/toll). Never discounted.
   */
  airportFixedCostsGbp?: number;
  /** Express Drop-Off / Pick-Up fee when selected (0 when free option chosen). */
  airportAccessChargeGbp?: number;
  /** Optional per-leg Express charges for return bookings. */
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
  returnJourney?: boolean;
  /**
   * Secure follow-up return-offer rate (e.g. 0.05). Applied to the current
   * live journey fare only — never airport fixed costs or Express.
   */
  returnOfferDiscountRate?: number;
};

export type WebsiteFareBreakdown = {
  journeyFareBeforeReturnDiscountGbp: number;
  journeyFareBeforePromotionsGbp: number;
  nightWeekendSurchargeGbp: number;
  nightWeekendSurchargeLabel: string;
  airportFixedCostsGbp: number;
  returnJourney: boolean;
  returnJourneySavingGbp: number;
  returnJourneyDiscountPercentLabel: string;
  returnOfferSavingGbp: number;
  returnOfferDiscountPercentLabel: string;
  journeyFareAfterPromotionsGbp: number;
  /** Transfer subtotal after promos + undiscounted fixed costs (no Express). */
  transferFareAfterPromotionsGbp: number;
  airportAccessChargeGbp: number;
  outboundAirportAccessChargeGbp: number;
  returnAirportAccessChargeGbp: number;
  /** Journey + fixed costs + Express (display/audit total before any promo). */
  bookingValueBeforePromotionsGbp: number;
  /**
   * Journey (+ fixed costs) after promos, before Express — customer “Journey fare” line.
   */
  journeyFareDisplayGbp: number;
  totalPromotionalSavingGbp: number;
  /** Strikethrough / original eligible price (journey before promos only). */
  originalEligibleJourneyPriceGbp: number;
  finalAmountPayableGbp: number;
};

/**
 * Compose the customer-facing / SumUp fare from journey + promos + access.
 * Airport access is added last and never enters promotional savings.
 */
export function composeWebsiteFareBreakdown(
  input: WebsiteFareBreakdownInput,
): WebsiteFareBreakdown {
  const returnJourney = Boolean(input.returnJourney);
  const journeyInclusive = roundGbp(
    Math.max(0, Number(input.journeyFareBeforeAirportAccessGbp) || 0),
  );
  const nightWeekendSurchargeGbp = roundGbp(
    Math.max(0, Number(input.nightWeekendSurchargeGbp) || 0),
  );
  /** Engine total = discounted base journey + undiscounted surcharge. */
  const discountedBaseGbp = roundGbp(
    Math.max(0, journeyInclusive - nightWeekendSurchargeGbp),
  );
  const baseJourneyBeforeReturnDiscountGbp = returnJourney
    ? getUndiscountedReturnJourneyFareGbp(discountedBaseGbp)
    : discountedBaseGbp;
  const returnJourneySavingGbp = returnJourney
    ? getReturnJourneySavingGbp(discountedBaseGbp)
    : 0;
  const journeyFareBeforeReturnDiscountGbp = returnJourney
    ? baseJourneyBeforeReturnDiscountGbp
    : journeyInclusive;
  /**
   * Follow-up return-offer codes keep the existing rule: they discount the
   * journey excluding Night & Weekend Surcharge. Same-booking 5% is already
   * in `discountedBaseGbp` and never includes the surcharge.
   */
  const journeyForOtherPromos = discountedBaseGbp;
  const airportFixedCostsGbp = roundGbp(
    Math.max(0, Number(input.airportFixedCostsGbp) || 0),
  );
  const outboundAirportAccessChargeGbp = roundGbp(
    Math.max(0, Number(input.outboundAirportAccessChargeGbp) || 0),
  );
  const returnAirportAccessChargeGbp = roundGbp(
    Math.max(0, Number(input.returnAirportAccessChargeGbp) || 0),
  );
  const airportAccessChargeGbp = roundGbp(
    Math.max(
      0,
      Number(input.airportAccessChargeGbp) ||
        outboundAirportAccessChargeGbp + returnAirportAccessChargeGbp,
    ),
  );

  const bookingValueBeforePromotionsGbp = roundGbp(
    baseJourneyBeforeReturnDiscountGbp +
      nightWeekendSurchargeGbp +
      airportFixedCostsGbp +
      airportAccessChargeGbp,
  );

  const returnOfferRate = Number(input.returnOfferDiscountRate);
  const applyReturnOffer =
    Number.isFinite(returnOfferRate) && returnOfferRate > 0 && returnOfferRate < 1;
  const returnOffer = applyReturnOffer
    ? applyReturnOfferSaving(journeyForOtherPromos, returnOfferRate)
    : { savingGbp: 0, fareAfterGbp: journeyForOtherPromos };
  const returnOfferSavingGbp = returnOffer.savingGbp;

  const journeyFareAfterPromotionsGbp = applyReturnOffer
    ? roundGbp(returnOffer.fareAfterGbp + nightWeekendSurchargeGbp)
    : journeyInclusive;
  const transferFareAfterPromotionsGbp = roundGbp(
    journeyFareAfterPromotionsGbp + airportFixedCostsGbp,
  );
  const totalPromotionalSavingGbp = roundGbp(
    returnJourneySavingGbp + returnOfferSavingGbp,
  );
  const finalAmountPayableGbp = roundGbp(
    transferFareAfterPromotionsGbp + airportAccessChargeGbp,
  );

  return {
    journeyFareBeforeReturnDiscountGbp,
    journeyFareBeforePromotionsGbp: journeyForOtherPromos,
    nightWeekendSurchargeGbp,
    nightWeekendSurchargeLabel: NIGHT_WEEKEND_SURCHARGE_LABEL,
    airportFixedCostsGbp,
    returnJourney,
    returnJourneySavingGbp,
    returnJourneyDiscountPercentLabel: formatReturnJourneyDiscountPercent(),
    returnOfferSavingGbp,
    returnOfferDiscountPercentLabel: formatReturnOfferPercent(
      applyReturnOffer ? returnOfferRate : undefined,
    ),
    journeyFareAfterPromotionsGbp,
    transferFareAfterPromotionsGbp,
    airportAccessChargeGbp,
    outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp,
    bookingValueBeforePromotionsGbp,
    journeyFareDisplayGbp: transferFareAfterPromotionsGbp,
    totalPromotionalSavingGbp,
    originalEligibleJourneyPriceGbp: journeyFareBeforeReturnDiscountGbp,
    finalAmountPayableGbp,
  };
}

import { formatGbpAmount } from "./gbp";

/** Same display rules as formatQuote / formatGbpAmount (whole £241; pence £179.50). */
export function formatGbpFare(amount: number): string {
  return formatGbpAmount(amount);
}

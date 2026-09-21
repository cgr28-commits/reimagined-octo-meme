/**
 * Authoritative public-website fare breakdown for display + SumUp parity.
 *
 * Exact order (do not reorder):
 * 1. Journey/vehicle fare per leg (Estate +£6 already in that fare)
 * 2. Night & Weekend Surcharge on each qualifying leg
 * 3. Combine outbound + return journey fares including those surcharges
 * 4. 5% return-journey discount on that combined qualifying journey amount
 * 5. Add airport/barrier/fixed costs at full value
 * 6. Add selected Express / airport access at full value
 * 7. finalAmountPayable = discounted journey + fixed + Express
 *
 * The 5% return discount therefore reduces the Night & Weekend Surcharge.
 * It never reduces airport/barrier/Express/fixed charges.
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
   * Taxi/journey fare after same-order return discount (when booked),
   * including any Night & Weekend Surcharge, before Express airport access.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /**
   * Night & Weekend Surcharge already included in
   * `journeyFareBeforeAirportAccessGbp`. Display only — not added again.
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
  const qualifyingJourneyTotal = returnJourney
    ? getUndiscountedReturnJourneyFareGbp(journeyInclusive)
    : journeyInclusive;
  const returnJourneySavingGbp = returnJourney
    ? getReturnJourneySavingGbp(journeyInclusive)
    : 0;
  const journeyFareBeforeReturnDiscountGbp = returnJourney
    ? qualifyingJourneyTotal
    : journeyInclusive;
  /**
   * Follow-up return-offer codes keep the existing rule: they discount the
   * journey excluding Night & Weekend Surcharge. Same-booking 5% return is
   * already in `journeyInclusive` and includes the surcharge.
   */
  const journeyForOtherPromos = returnJourney
    ? roundGbp(
        Math.max(0, qualifyingJourneyTotal - nightWeekendSurchargeGbp) *
          (1 - RETURN_JOURNEY_DISCOUNT_RATE),
      )
    : roundGbp(Math.max(0, journeyInclusive - nightWeekendSurchargeGbp));
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
    qualifyingJourneyTotal + airportFixedCostsGbp + airportAccessChargeGbp,
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

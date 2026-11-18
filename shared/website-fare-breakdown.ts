/**
 * Authoritative public-website fare breakdown for display + SumUp parity.
 *
 * Exact order (do not reorder):
 * 1. Base journey/vehicle fare per leg (configured Estate uplift already in that fare)
 * 2. Add time premiums to the vehicle fare
 * 3. Combine outbound + return vehicle fares and apply the 5% return discount
 * 4. Add Dublin tolls and airport/barrier/fixed costs at full value
 * 5. Add selected Express / airport access at full value
 * 6. Round the final customer payable to the nearest pound where applicable
 *
 * The 5% return discount never reduces Dublin tolls, airport/barrier/Express,
 * or other fixed charges.
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
import { NIGHT_WEEKEND_SURCHARGE_LABEL, NIGHT_WEEKEND_SURCHARGE_EXPLANATION } from "./night-weekend-surcharge";
import {
  applyReturnOfferSaving,
  formatReturnOfferPercent,
} from "./return-offer";
import { businessClassFlooredPayableGbp } from "./business-class-minimum";

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
   * Taxi/journey fare after the 5% return discount (when booked), including
   * time premiums and any tolls folded into the fare, before airport access.
   */
  journeyFareBeforeAirportAccessGbp: number;
  /**
   * Night & Weekend Surcharge already included in
   * `journeyFareBeforeAirportAccessGbp`. Displayed separately — not added again.
   */
  nightWeekendSurchargeGbp?: number;
  /** Address-to-address Dublin tolls folded into journey fare; never discounted. */
  dublinTollsGbp?: number;
  /** Copy from the same configured pricing snapshot as the authoritative fare. */
  nightWeekendSurchargeLabel?: string;
  nightWeekendSurchargeExplanation?: string;
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
  /**
   * Business Class only. Omit for every other vehicle.
   * One-way price floor applied after the normal fare, including airport access.
   */
  businessClassMinimumFareGbp?: number;
  /** Journey + Night & Weekend + airport fixed costs, before access and before the return discount. */
  outboundOneWayBeforeAccessGbp?: number;
  returnOneWayBeforeAccessGbp?: number;
  /** Owner return-discount rate. Defaults to the public 5%. */
  returnDiscountRate?: number;
  /** Trusted matched postcode fare explicitly contains pence. Never taken from a payment client. */
  preserveFixedFarePence?: boolean;
  /**
   * Email promo code (see shared/promo-code.ts). Applied last, to the vehicle fare only
   * (journey fare incl. any time-of-day / Christmas pricing; never airport fixed costs,
   * airport access or Meet & Greet). Ignored below the code's minimum vehicle fare.
   */
  promoCode?: { code: string; discountRate: number; minimumVehicleFareGbp: number } | null;
};

export type WebsiteFareBreakdown = {
  journeyFareBeforeReturnDiscountGbp: number;
  journeyFareBeforePromotionsGbp: number;
  nightWeekendSurchargeGbp: number;
  nightWeekendSurchargeLabel: string;
  nightWeekendSurchargeExplanation: string;
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
  /** Code applied to this breakdown (only when it qualified). */
  promoCode?: string;
  promoCodeDiscountRate?: number;
  /**
   * Exact reduction in the amount payable from the promo code (after the usual whole-pound
   * rounding), so the saving line and the total always agree.
   */
  promoCodeSavingGbp: number;
  /** Vehicle fare the promo was assessed on (journey fare, both legs, excl. airport charges). */
  promoEligibleVehicleFareGbp: number;
  /** "applied" | "below_minimum" when a code was supplied; "none" otherwise. */
  promoCodeStatus: "applied" | "below_minimum" | "none";
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
  const dublinTollsGbp = roundGbp(Math.max(0, Number(input.dublinTollsGbp) || 0));
  const discountedVehicleFareGbp = roundGbp(Math.max(0, journeyInclusive - dublinTollsGbp));
  const returnRate = Number.isFinite(input.returnDiscountRate)
    ? Number(input.returnDiscountRate)
    : RETURN_JOURNEY_DISCOUNT_RATE;
  const vehicleFareBeforeReturnDiscountGbp = returnJourney
    ? getUndiscountedReturnJourneyFareGbp(discountedVehicleFareGbp, returnRate)
    : discountedVehicleFareGbp;
  const returnJourneySavingGbp = returnJourney
    ? roundGbp(vehicleFareBeforeReturnDiscountGbp - discountedVehicleFareGbp)
    : 0;
  const journeyFareBeforeReturnDiscountGbp = returnJourney
    ? roundGbp(vehicleFareBeforeReturnDiscountGbp + dublinTollsGbp)
    : journeyInclusive;
  /**
   * Follow-up return-offer codes keep the existing rule: they discount the
   * journey excluding Night & Weekend Surcharge. Same-booking 5% already
   * applies to the complete vehicle fare, including that surcharge.
   */
  const journeyForOtherPromos = roundGbp(
    Math.max(0, discountedVehicleFareGbp - nightWeekendSurchargeGbp),
  );
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
    journeyFareBeforeReturnDiscountGbp +
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
    ? roundGbp(returnOffer.fareAfterGbp + nightWeekendSurchargeGbp + dublinTollsGbp)
    : journeyInclusive;
  const transferFareAfterPromotionsGbp = roundGbp(
    journeyFareAfterPromotionsGbp + airportFixedCostsGbp,
  );
  const totalPromotionalSavingGbp = roundGbp(
    returnJourneySavingGbp + returnOfferSavingGbp,
  );
  // Keep the existing vehicle-fare rounding; optional services retain their exact price.
  let finalAmountPayableGbp = roundGbp(
    (input.preserveFixedFarePence ? roundGbp : roundCustomerPayableGbp)(transferFareAfterPromotionsGbp) + airportAccessChargeGbp,
  );
  let journeyFareAfterPromotionsAdjusted = journeyFareAfterPromotionsGbp;
  let transferFareAfterPromotionsAdjusted = transferFareAfterPromotionsGbp;
  let journeyFareBeforePromotionsAdjusted = roundGbp(
    journeyForOtherPromos + nightWeekendSurchargeGbp + dublinTollsGbp,
  );
  let journeyFareBeforeReturnDiscountAdjusted = journeyFareBeforeReturnDiscountGbp;
  let journeyFareDisplayAdjusted = transferFareAfterPromotionsGbp;

  const minimumFareGbp = Number(input.businessClassMinimumFareGbp);
  const outboundBeforeAccess = Number(input.outboundOneWayBeforeAccessGbp);
  if (
    Number.isFinite(minimumFareGbp) &&
    minimumFareGbp >= 0 &&
    Number.isFinite(outboundBeforeAccess)
  ) {
    const floored = businessClassFlooredPayableGbp({
      minimumFareGbp,
      returnJourney,
      returnDiscountRate: input.returnDiscountRate,
      outboundOneWayBeforeAccessGbp: outboundBeforeAccess,
      returnOneWayBeforeAccessGbp: input.returnOneWayBeforeAccessGbp,
      outboundAirportAccessChargeGbp: 0,
      returnAirportAccessChargeGbp: 0,
    });
    const flooredAfterOffer =
      floored == null
        ? null
        : roundGbp(roundCustomerPayableGbp(Math.max(0, floored - returnOfferSavingGbp)) + airportAccessChargeGbp);
    if (flooredAfterOffer != null && flooredAfterOffer > finalAmountPayableGbp + 0.001) {
      const uplift = roundGbp(flooredAfterOffer - finalAmountPayableGbp);
      finalAmountPayableGbp = flooredAfterOffer;
      journeyFareAfterPromotionsAdjusted = roundGbp(journeyFareAfterPromotionsGbp + uplift);
      transferFareAfterPromotionsAdjusted = roundGbp(transferFareAfterPromotionsGbp + uplift);
      journeyFareBeforePromotionsAdjusted = roundGbp(
        journeyForOtherPromos + nightWeekendSurchargeGbp + dublinTollsGbp + uplift,
      );
      journeyFareBeforeReturnDiscountAdjusted = roundGbp(
        journeyFareBeforeReturnDiscountGbp + uplift,
      );
      journeyFareDisplayAdjusted = transferFareAfterPromotionsAdjusted;
    }
  }

  // Email promo code: last, on the vehicle fare only. The saving is the exact drop in the
  // amount payable after the usual whole-pound rounding, so the rows always add up.
  const promoEligibleVehicleFareGbp = roundGbp(
    Math.max(0, journeyFareAfterPromotionsAdjusted - dublinTollsGbp),
  );
  let promoCodeSavingGbp = 0;
  let promoCodeStatus: WebsiteFareBreakdown["promoCodeStatus"] = "none";
  const promo = input.promoCode;
  const promoRate = Number(promo?.discountRate);
  if (promo && promo.code && Number.isFinite(promoRate) && promoRate > 0 && promoRate < 1) {
    const minimumPence = Math.round(roundGbp(Number(promo.minimumVehicleFareGbp) || 0) * 100);
    if (Math.round(promoEligibleVehicleFareGbp * 100) < minimumPence) {
      promoCodeStatus = "below_minimum";
    } else {
      const rawDiscount = roundGbp(promoEligibleVehicleFareGbp * promoRate);
      const transferAfterPromo = roundGbp(Math.max(0, transferFareAfterPromotionsAdjusted - rawDiscount));
      const payableAfterPromo = roundGbp(
        (input.preserveFixedFarePence ? roundGbp : roundCustomerPayableGbp)(transferAfterPromo) + airportAccessChargeGbp,
      );
      promoCodeSavingGbp = roundGbp(Math.max(0, finalAmountPayableGbp - payableAfterPromo));
      if (promoCodeSavingGbp > 0) {
        promoCodeStatus = "applied";
        finalAmountPayableGbp = payableAfterPromo;
        journeyFareAfterPromotionsAdjusted = roundGbp(journeyFareAfterPromotionsAdjusted - promoCodeSavingGbp);
        transferFareAfterPromotionsAdjusted = roundGbp(transferFareAfterPromotionsAdjusted - promoCodeSavingGbp);
        journeyFareDisplayAdjusted = roundGbp(journeyFareDisplayAdjusted - promoCodeSavingGbp);
      }
    }
  }

  return {
    promoCodeSavingGbp,
    promoEligibleVehicleFareGbp,
    promoCodeStatus,
    ...(promoCodeStatus === "applied" && promo
      ? { promoCode: promo.code, promoCodeDiscountRate: promoRate }
      : {}),
    journeyFareBeforeReturnDiscountGbp: journeyFareBeforeReturnDiscountAdjusted,
    journeyFareBeforePromotionsGbp: journeyFareBeforePromotionsAdjusted,
    nightWeekendSurchargeGbp,
    nightWeekendSurchargeLabel: input.nightWeekendSurchargeLabel ?? NIGHT_WEEKEND_SURCHARGE_LABEL,
    nightWeekendSurchargeExplanation: input.nightWeekendSurchargeExplanation ?? NIGHT_WEEKEND_SURCHARGE_EXPLANATION,
    airportFixedCostsGbp,
    returnJourney,
    returnJourneySavingGbp,
    returnJourneyDiscountPercentLabel: formatReturnJourneyDiscountPercent(returnRate),
    returnOfferSavingGbp,
    returnOfferDiscountPercentLabel: formatReturnOfferPercent(
      applyReturnOffer ? returnOfferRate : undefined,
    ),
    journeyFareAfterPromotionsGbp: journeyFareAfterPromotionsAdjusted,
    transferFareAfterPromotionsGbp: transferFareAfterPromotionsAdjusted,
    airportAccessChargeGbp,
    outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp,
    bookingValueBeforePromotionsGbp,
    journeyFareDisplayGbp: journeyFareDisplayAdjusted,
    totalPromotionalSavingGbp: roundGbp(totalPromotionalSavingGbp + promoCodeSavingGbp),
    originalEligibleJourneyPriceGbp: journeyFareBeforeReturnDiscountAdjusted,
    finalAmountPayableGbp,
  };
}

import { formatGbpAmount, roundCustomerPayableGbp } from "./gbp";

/** Same display rules as formatQuote / formatGbpAmount (whole £241; pence £179.50). */
export function formatGbpFare(amount: number): string {
  return formatGbpAmount(amount);
}

/**
 * Customers never see Evening / Night / Weekend / Christmas surcharges as a separate line or
 * note. The surcharge is folded into the journey fare shown, so the rows still add up to the
 * same amount payable.
 */
export function customerFacingFareBreakdown(breakdown: WebsiteFareBreakdown): WebsiteFareBreakdown {
  const surcharge = breakdown.nightWeekendSurchargeGbp > 0 ? breakdown.nightWeekendSurchargeGbp : 0;
  // The amount payable rounds the transfer fare to whole pounds (e.g. £60.50 → £61). Show that
  // rounding inside the journey fare line too, so the rows a customer sees add up to the amount
  // charged. Display only: the amount payable itself is unchanged.
  const roundingGbp = Math.round(
    (breakdown.finalAmountPayableGbp -
      breakdown.transferFareAfterPromotionsGbp -
      breakdown.airportAccessChargeGbp) * 100,
  ) / 100;
  const rounding = Number.isFinite(roundingGbp) && Math.abs(roundingGbp) < 1 ? roundingGbp : 0;
  if (!(surcharge > 0) && rounding === 0) return breakdown;
  const add = (value: number) => Math.round((value + surcharge + rounding) * 100) / 100;
  return {
    ...breakdown,
    journeyFareBeforePromotionsGbp: add(breakdown.journeyFareBeforePromotionsGbp),
    originalEligibleJourneyPriceGbp: add(breakdown.originalEligibleJourneyPriceGbp),
    nightWeekendSurchargeGbp: 0,
  };
}

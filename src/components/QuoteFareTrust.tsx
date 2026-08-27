/**
 * Compact fixed-price trust + promotional savings presentation for the quote tool.
 * Emerald visual language only — never sale-banner styling.
 */

import {
  composeWebsiteFareBreakdown,
  formatGbpFare,
  type WebsiteFareBreakdown,
} from "../../shared/website-fare-breakdown";

export function buildOpenWebsiteFareBreakdown(input: {
  journeyFareBeforeAirportAccessGbp: number;
  airportFixedCostsGbp?: number;
  airportAccessChargeGbp?: number;
  returnJourney?: boolean;
  /**
   * Apply the £5 first-booking offer in displayed/payable totals.
   * Must be true only after email eligibility is verified (not redeemed).
   */
  claimFirstBookingOffer?: boolean;
  alreadyRedeemedFirstBookingOffer?: boolean;
}): WebsiteFareBreakdown {
  return composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: input.journeyFareBeforeAirportAccessGbp,
    airportFixedCostsGbp: input.airportFixedCostsGbp ?? 0,
    airportAccessChargeGbp: input.airportAccessChargeGbp ?? 0,
    returnJourney: Boolean(input.returnJourney),
    claimFirstBookingOffer: input.claimFirstBookingOffer === true,
    alreadyRedeemedFirstBookingOffer:
      input.alreadyRedeemedFirstBookingOffer === true,
  });
}

/**
 * Advertise the first-booking welcome offer without applying it to the price.
 * Emerald/navy premium tone — never sale-banner styling.
 */
export function FirstBookingOfferAdvert({
  discountAmountGbp,
  minimumBookingValueGbp,
  className = "",
}: {
  discountAmountGbp: number;
  minimumBookingValueGbp: number;
  className?: string;
}) {
  const amount = Math.round(Number(discountAmountGbp) || 0);
  const minValue = Math.round(Number(minimumBookingValueGbp) || 0);
  if (amount <= 0 || minValue <= 0) return null;

  return (
    <div
      className={`mt-2.5 rounded-lg border border-emerald/25 bg-emerald/[0.06] px-3 py-2.5 ${className}`}
      aria-label={`New customer offer: save £${amount} on your first booking`}
    >
      <p className="text-xs font-semibold leading-snug text-emerald">
        New customer? Save £{amount} on your first booking
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-white/55">
        £{minValue} minimum booking value · Eligibility confirmed before payment
      </p>
    </div>
  );
}

/** Compact reinforcement directly under the dominant fixed price. */
export function FixedPriceAssurance({ className = "" }: { className?: string }) {
  return (
    <div className={`mt-1.5 space-y-0.5 ${className}`}>
      <p className="text-sm font-semibold text-emerald">✓ Fixed price. No surprises.</p>
      <p className="text-xs leading-snug text-white/55">
        The price you book is the price you pay.
      </p>
    </div>
  );
}

/** Compact reliability list — keep above the final CTA, not a large feature card. */
export function BookWithConfidence({ className = "" }: { className?: string }) {
  const items = [
    "Fixed price — no surprises",
    "Reliable, pre-booked airport transfer",
    "Flight monitoring for airport collections",
    "Free cancellation up to 24 hours before pickup",
    "Secure online payment",
  ];
  return (
    <div
      className={`rounded-xl border border-emerald/25 bg-emerald/[0.06] px-3.5 py-3 ${className}`}
    >
      <p className="text-sm font-semibold text-emerald">Book with confidence</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-snug text-white/75">
            <span className="shrink-0 font-semibold text-emerald" aria-hidden>
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="quote-secondary mt-2 text-[11px] leading-snug">
        Plans change? Cancel more than 24 hours before pickup for a full refund.
      </p>
    </div>
  );
}

export function PromotionalSavingsSummary({
  breakdown,
  className = "",
}: {
  breakdown: WebsiteFareBreakdown;
  className?: string;
}) {
  const hasPromo = breakdown.totalPromotionalSavingGbp > 0;
  if (!hasPromo) return null;

  return (
    <div className={`mt-2.5 space-y-1.5 ${className}`}>
      {breakdown.returnJourneySavingGbp > 0 ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald">
          ✓ {breakdown.returnJourneyDiscountPercentLabel} RETURN JOURNEY SAVING — YOU SAVE{" "}
          {formatGbpFare(breakdown.returnJourneySavingGbp)}
        </p>
      ) : null}
      {breakdown.firstBookingSavingGbp > 0 ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald">
          ✓ {breakdown.firstBookingLabel}
          <span className="ml-1.5 font-medium normal-case tracking-normal text-emerald/90">
            — you save {formatGbpFare(breakdown.firstBookingSavingGbp)}
          </span>
        </p>
      ) : null}
      {breakdown.totalPromotionalSavingGbp > 0 ? (
        <p className="text-xs font-medium text-emerald/90">
          ✓ YOU SAVE {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
        </p>
      ) : null}
    </div>
  );
}

/** Compact original → payable + line items for promos and Express access. */
export function PromotionalPriceBreakdown({
  breakdown,
  freeAirportAccessSelected = false,
  className = "",
}: {
  breakdown: WebsiteFareBreakdown;
  /**
   * When true, customer chose the free drop-off/pick-up area so Express was not
   * added. This is not an extra promotional −£5 on the journey fare.
   */
  freeAirportAccessSelected?: boolean;
  className?: string;
}) {
  const hasPromo = breakdown.totalPromotionalSavingGbp > 0;
  const accessGbp = breakdown.airportAccessChargeGbp;
  const hasAccess = accessGbp > 0;
  if (!hasPromo && !hasAccess && !freeAirportAccessSelected) return null;

  return (
    <div className={`mt-2 space-y-1.5 text-xs leading-snug ${className}`}>
      {hasPromo ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-white/45 line-through">
              {formatGbpFare(breakdown.originalEligibleJourneyPriceGbp)}
            </span>
            <span className="text-sm font-semibold text-white">
              {formatGbpFare(breakdown.journeyFareAfterPromotionsGbp)}
            </span>
            <span className="font-semibold text-emerald">
              ✓ YOU SAVE {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
            </span>
          </div>
          <dl className="space-y-0.5 text-white/60">
            {breakdown.returnJourneySavingGbp > 0 ? (
              <div className="flex justify-between gap-3">
                <dt>
                  Return Journey Saving ({breakdown.returnJourneyDiscountPercentLabel})
                </dt>
                <dd className="shrink-0 text-emerald/90">
                  −{formatGbpFare(breakdown.returnJourneySavingGbp)}
                </dd>
              </div>
            ) : null}
            {breakdown.firstBookingSavingGbp > 0 ? (
              <div className="flex justify-between gap-3">
                <dt>{breakdown.firstBookingShortLabel}</dt>
                <dd className="shrink-0 text-emerald/90">
                  −{formatGbpFare(breakdown.firstBookingSavingGbp)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-white/10 pt-1 font-medium text-white/75">
              <dt>Total promotional saving</dt>
              <dd className="shrink-0 text-emerald">
                {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
              </dd>
            </div>
          </dl>
        </>
      ) : null}

      <dl className="space-y-0.5 text-white/60">
        {hasAccess ? (
          <div className="flex justify-between gap-3">
            <dt>Airport Express access</dt>
            <dd className="shrink-0 tabular-nums text-white/80">
              +{formatGbpFare(accessGbp)}
            </dd>
          </div>
        ) : null}
        {freeAirportAccessSelected && !hasAccess ? (
          <div className="flex justify-between gap-3 text-white/55">
            <dt>Airport Express access</dt>
            <dd className="shrink-0 tabular-nums">Not added</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-white/10 pt-1 font-semibold text-white">
          <dt>Amount payable</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(breakdown.finalAmountPayableGbp)}
          </dd>
        </div>
      </dl>
      {freeAirportAccessSelected && !hasAccess ? (
        <p className="text-[11px] leading-snug text-emerald/85">
          ✓ You’ve avoided the Express Drop-Off charge
        </p>
      ) : null}
    </div>
  );
}

/** Step 3 / Pay & Confirm — full payable breakdown before SumUp. */
export function FinalPayableBreakdown({
  breakdown,
  freeAirportAccessSelected = false,
  className = "",
}: {
  breakdown: WebsiteFareBreakdown;
  freeAirportAccessSelected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
        Price breakdown
      </p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3 text-white/75">
          <dt>Journey fare</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(breakdown.originalEligibleJourneyPriceGbp)}
          </dd>
        </div>
        {breakdown.returnJourneySavingGbp > 0 ? (
          <div className="flex justify-between gap-3 text-emerald/90">
            <dt>Return journey saving</dt>
            <dd className="shrink-0 tabular-nums">
              −{formatGbpFare(breakdown.returnJourneySavingGbp)}
            </dd>
          </div>
        ) : null}
        {breakdown.firstBookingSavingGbp > 0 ? (
          <div className="flex justify-between gap-3 text-emerald/90">
            <dt>First booking saving</dt>
            <dd className="shrink-0 tabular-nums">
              −{formatGbpFare(breakdown.firstBookingSavingGbp)}
            </dd>
          </div>
        ) : null}
        {breakdown.airportAccessChargeGbp > 0 ? (
          <div className="flex justify-between gap-3 text-white/75">
            <dt>Airport Express access</dt>
            <dd className="shrink-0 tabular-nums">
              +{formatGbpFare(breakdown.airportAccessChargeGbp)}
            </dd>
          </div>
        ) : freeAirportAccessSelected ? (
          <div className="flex justify-between gap-3 text-white/55">
            <dt>Airport Express access</dt>
            <dd className="shrink-0 tabular-nums">Not added</dd>
          </div>
        ) : null}
        {breakdown.totalPromotionalSavingGbp > 0 ? (
          <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5 font-medium text-emerald">
            <dt>Total promotional savings</dt>
            <dd className="shrink-0 tabular-nums">
              {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5 text-base font-semibold text-white">
          <dt>Final amount payable</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(breakdown.finalAmountPayableGbp)}
          </dd>
        </div>
      </dl>
      <FixedPriceAssurance className="mt-2.5" />
    </div>
  );
}

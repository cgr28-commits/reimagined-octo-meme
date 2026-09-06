/**
 * Compact fixed-price trust + promotional savings presentation for the quote tool.
 * Emerald visual language only — never sale-banner styling.
 */

import {
  composeWebsiteFareBreakdown,
  formatGbpFare,
  type WebsiteFareBreakdown,
} from "../../shared/website-fare-breakdown";
import {
  expressAirportLegendLabel,
  expressAvoidedChargeMessage,
  type ExpressAirportService,
} from "../../shared/express-drop-off";

export function buildOpenWebsiteFareBreakdown(input: {
  journeyFareBeforeAirportAccessGbp: number;
  airportFixedCostsGbp?: number;
  airportAccessChargeGbp?: number;
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
  returnJourney?: boolean;
  returnOfferDiscountRate?: number;
}): WebsiteFareBreakdown {
  return composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: input.journeyFareBeforeAirportAccessGbp,
    airportFixedCostsGbp: input.airportFixedCostsGbp ?? 0,
    airportAccessChargeGbp: input.airportAccessChargeGbp ?? 0,
    outboundAirportAccessChargeGbp: input.outboundAirportAccessChargeGbp ?? 0,
    returnAirportAccessChargeGbp: input.returnAirportAccessChargeGbp ?? 0,
    returnJourney: Boolean(input.returnJourney),
    ...(typeof input.returnOfferDiscountRate === "number"
      ? { returnOfferDiscountRate: input.returnOfferDiscountRate }
      : {}),
  });
}

/** Compact reinforcement directly under the dominant fixed price. */
export function FixedPriceAssurance({
  className = "",
  includesSelectedAirportAccess = false,
}: {
  className?: string;
  /** When Express/free airport access is offered, the headline total already includes that choice. */
  includesSelectedAirportAccess?: boolean;
}) {
  return (
    <div className={`mt-1.5 space-y-0.5 ${className}`}>
      <p className="text-sm font-semibold text-emerald">✓ Fixed price. No surprises.</p>
      <p className="text-xs leading-snug text-white/55">
        {includesSelectedAirportAccess
          ? "Includes your selected airport access option."
          : "The price you book is the price you pay."}
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
      {breakdown.returnOfferSavingGbp > 0 ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald">
          ✓ {breakdown.returnOfferDiscountPercentLabel} RETURN JOURNEY SAVING — YOU SAVE{" "}
          {formatGbpFare(breakdown.returnOfferSavingGbp)}
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

/** Compact journey fare → Express → payable (Express never folded into journey). */
export function PromotionalPriceBreakdown({
  breakdown,
  freeAirportAccessSelected = false,
  service = "drop-off",
  className = "",
}: {
  breakdown: WebsiteFareBreakdown;
  /**
   * When true, customer chose the free drop-off/pick-up area so Express was not
   * added. This is not an extra promotional −£5 on the journey fare.
   */
  freeAirportAccessSelected?: boolean;
  service?: ExpressAirportService;
  className?: string;
}) {
  const accessLabel = expressAirportLegendLabel(service);
  const hasPromo = breakdown.totalPromotionalSavingGbp > 0;
  const accessGbp = breakdown.airportAccessChargeGbp;
  const hasAccess = accessGbp > 0;
  const showPerLegAccess =
    breakdown.returnJourney &&
    (breakdown.outboundAirportAccessChargeGbp > 0 ||
      breakdown.returnAirportAccessChargeGbp > 0 ||
      freeAirportAccessSelected);
  const journeyDisplayGbp = breakdown.returnJourney
    ? breakdown.originalEligibleJourneyPriceGbp
    : breakdown.journeyFareDisplayGbp;
  const journeyLabel = breakdown.returnJourney ? "Return journey fare" : "Journey fare";
  const finalPayableGbp = breakdown.finalAmountPayableGbp;
  if (!hasPromo && !hasAccess && !freeAirportAccessSelected) return null;

  return (
    <div className={`mt-2 space-y-1.5 text-xs leading-snug ${className}`}>
      {hasPromo && !breakdown.returnJourney ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-white/45 line-through">
            {formatGbpFare(
              breakdown.journeyFareBeforePromotionsGbp + breakdown.airportFixedCostsGbp,
            )}
          </span>
          <span className="text-sm font-semibold text-white">
            {formatGbpFare(finalPayableGbp)}
          </span>
          <span className="font-semibold text-emerald">
            ✓ YOU SAVE {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
          </span>
        </div>
      ) : null}

      <dl className="space-y-0.5 text-white/60">
        <div className="flex justify-between gap-3">
          <dt>{journeyLabel}</dt>
          <dd className="shrink-0 tabular-nums text-white/80">
            {formatGbpFare(journeyDisplayGbp)}
          </dd>
        </div>
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
        {breakdown.returnOfferSavingGbp > 0 ? (
          <div className="flex justify-between gap-3">
            <dt>Return journey saving ({breakdown.returnOfferDiscountPercentLabel})</dt>
            <dd className="shrink-0 text-emerald/90">
              −{formatGbpFare(breakdown.returnOfferSavingGbp)}
            </dd>
          </div>
        ) : null}
        {showPerLegAccess ? (
          <>
            <div className="flex justify-between gap-3">
              <dt>Outbound airport charge</dt>
              <dd className="shrink-0 tabular-nums text-white/80">
                {breakdown.outboundAirportAccessChargeGbp > 0
                  ? `+${formatGbpFare(breakdown.outboundAirportAccessChargeGbp)}`
                  : "Not added"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Return airport charge</dt>
              <dd className="shrink-0 tabular-nums text-white/80">
                {breakdown.returnAirportAccessChargeGbp > 0
                  ? `+${formatGbpFare(breakdown.returnAirportAccessChargeGbp)}`
                  : "Not added"}
              </dd>
            </div>
          </>
        ) : hasAccess ? (
          <div className="flex justify-between gap-3">
            <dt>{accessLabel}</dt>
            <dd className="shrink-0 tabular-nums text-white/80">
              +{formatGbpFare(accessGbp)}
            </dd>
          </div>
        ) : null}
        {freeAirportAccessSelected && !hasAccess && !showPerLegAccess ? (
          <div className="flex justify-between gap-3 text-white/55">
            <dt>{accessLabel}</dt>
            <dd className="shrink-0 tabular-nums">Not added</dd>
          </div>
        ) : null}
        {hasPromo ? (
          <div className="flex justify-between gap-3 border-t border-white/10 pt-1 font-medium text-white/75">
            <dt>Total promotional saving</dt>
            <dd className="shrink-0 text-emerald">
              {formatGbpFare(breakdown.totalPromotionalSavingGbp)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-white/10 pt-1 font-semibold text-white">
          <dt>Amount payable</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(finalPayableGbp)}
          </dd>
        </div>
      </dl>
      {freeAirportAccessSelected && !hasAccess && !showPerLegAccess ? (
        <p className="text-[11px] leading-snug text-emerald/85">
          ✓ {expressAvoidedChargeMessage(service)}
        </p>
      ) : null}
    </div>
  );
}

/** Step 3 / Pay & Confirm — full payable breakdown before SumUp. */
export function FinalPayableBreakdown({
  breakdown,
  freeAirportAccessSelected = false,
  service = "drop-off",
  className = "",
}: {
  breakdown: WebsiteFareBreakdown;
  freeAirportAccessSelected?: boolean;
  service?: ExpressAirportService;
  className?: string;
}) {
  const accessLabel = expressAirportLegendLabel(service);
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
        Price breakdown
      </p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3 text-white/75">
          <dt>{breakdown.returnJourney ? "Return journey fare" : "Journey fare"}</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(
              breakdown.returnJourney
                ? breakdown.originalEligibleJourneyPriceGbp
                : breakdown.journeyFareDisplayGbp,
            )}
          </dd>
        </div>
        {breakdown.returnJourneySavingGbp > 0 ? (
          <div className="flex justify-between gap-3 text-emerald/90">
            <dt>Return Journey Saving</dt>
            <dd className="shrink-0 tabular-nums">
              −{formatGbpFare(breakdown.returnJourneySavingGbp)}
            </dd>
          </div>
        ) : null}
        {breakdown.returnJourney &&
        (breakdown.outboundAirportAccessChargeGbp > 0 ||
          breakdown.returnAirportAccessChargeGbp > 0 ||
          freeAirportAccessSelected) ? (
          <>
            <div className="flex justify-between gap-3 text-white/75">
              <dt>Outbound airport charge</dt>
              <dd className="shrink-0 tabular-nums">
                {breakdown.outboundAirportAccessChargeGbp > 0
                  ? `+${formatGbpFare(breakdown.outboundAirportAccessChargeGbp)}`
                  : "Not added"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-white/75">
              <dt>Return airport charge</dt>
              <dd className="shrink-0 tabular-nums">
                {breakdown.returnAirportAccessChargeGbp > 0
                  ? `+${formatGbpFare(breakdown.returnAirportAccessChargeGbp)}`
                  : "Not added"}
              </dd>
            </div>
          </>
        ) : breakdown.airportAccessChargeGbp > 0 ? (
          <div className="flex justify-between gap-3 text-white/75">
            <dt>{accessLabel}</dt>
            <dd className="shrink-0 tabular-nums">
              +{formatGbpFare(breakdown.airportAccessChargeGbp)}
            </dd>
          </div>
        ) : freeAirportAccessSelected ? (
          <div className="flex justify-between gap-3 text-white/55">
            <dt>{accessLabel}</dt>
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
          <dt>Amount payable</dt>
          <dd className="shrink-0 tabular-nums">
            {formatGbpFare(breakdown.finalAmountPayableGbp)}
          </dd>
        </div>
      </dl>
      <FixedPriceAssurance
        className="mt-2.5"
        includesSelectedAirportAccess={
          freeAirportAccessSelected ||
          breakdown.airportAccessChargeGbp > 0 ||
          breakdown.outboundAirportAccessChargeGbp > 0 ||
          breakdown.returnAirportAccessChargeGbp > 0
        }
      />
    </div>
  );
}

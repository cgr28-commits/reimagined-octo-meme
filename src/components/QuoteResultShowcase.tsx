"use client";

import { forwardRef, type ReactNode } from "react";
import { preload } from "react-dom";
import { withBasePath } from "@/lib/paths";
import {
  LUGGAGE_CAPACITY_CONFIRMATION_BODY,
  LUGGAGE_CAPACITY_CONFIRMATION_HEADING,
} from "../../shared/vehicle-capacity";
import { AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE } from "@/lib/authoritative-quote-fare";
import { STANDARD_SALOON_IMAGE } from "@/lib/vehicle-artwork";

type QuoteResultShowcaseProps = {
  priceLabel: string;
  formattedPrice: string;
  airportAccess?: ReactNode;
  bookButton: ReactNode;
  /** Shown only when the first displayed price already includes the 10%. */
  surchargeNote?: string | null;
  /** High passenger + luggage load — fare shown, payment held. */
  capacityConfirmation?: boolean;
  /** Worker quote failed. Do not show a fallback fare in the price slot. */
  priceUnavailable?: boolean;
  onRetryPrice?: () => void;
};

// Price, airport access and booking only. The vehicle itself is the
// Choose your vehicle selector above this panel.

const EXECUTIVE_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

/** Vehicle art used by the selector. Preloaded with the quote form. */
const QUOTE_RESULT_VEHICLE_IMAGES = [
  EXECUTIVE_IMAGE,
  ESTATE_IMAGE,
  MINIBUS_IMAGE,
  ...(STANDARD_SALOON_IMAGE ? [STANDARD_SALOON_IMAGE] : []),
] as const;

/**
 * Start these downloads with the quote form, before a price exists.
 * Low priority so they do not compete with the page's hero image.
 * The result photo then comes from cache.
 */
export function preloadQuoteResultVehicleImages() {
  for (const href of QUOTE_RESULT_VEHICLE_IMAGES) {
    preload(href, { as: "image", fetchPriority: "low" });
  }
}

const QuoteResultShowcase = forwardRef<HTMLDivElement, QuoteResultShowcaseProps>(
  function QuoteResultShowcase(
    {
      priceLabel,
      formattedPrice,
      airportAccess,
      bookButton,
      surchargeNote = null,
      capacityConfirmation = false,
      priceUnavailable = false,
      onRetryPrice,
    },
    ref,
  ) {
  return (
    <div
      ref={ref}
      id="quote-selected-vehicle-card"
      data-quote-selected-vehicle-card
      data-quote-result-card
      data-quote-price-section
      className="quote-result-card overflow-hidden rounded-2xl border border-navy/10 bg-white px-4 py-5 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.22)] sm:px-5 sm:py-6"
    >
      <div className="min-w-0 text-center lg:text-left">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-dark">
            {priceLabel}
          </p>
          {priceUnavailable ? (
            <div className="mt-2" data-quote-fare-status="unavailable">
              <p className="text-sm font-semibold leading-relaxed text-navy">
                {AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE}
              </p>
              {onRetryPrice ? (
                <button
                  type="button"
                  onClick={onRetryPrice}
                  data-quote-price-retry
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
          <p
            data-quote-fare-status={formattedPrice.startsWith("£") ? "ready" : "pending"}
            className="mt-1 flex min-h-[clamp(3.5rem,1.6rem+10vw,4.5rem)] items-center justify-center lg:min-h-[clamp(4rem,3rem+2vw,5rem)] lg:justify-start"
          >
            <span
              className={
                formattedPrice.startsWith("£")
                  ? "font-sans text-[clamp(3.5rem,1.6rem+10vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-navy tabular-nums lg:text-[clamp(4rem,3rem+2vw,5rem)]"
                  : "font-sans text-[clamp(2.65rem,1.22rem+7.6vw,3.4rem)] font-bold leading-tight tracking-[-0.03em] text-navy/55 lg:text-[clamp(3rem,2.2rem+1.4vw,3.4rem)]"
              }
            >
              {formattedPrice}
            </span>
          </p>
          )}
          {surchargeNote ? (
            <p
              className="mt-2 text-xs font-semibold text-emerald-dark"
              data-night-weekend-surcharge-badge
            >
              {surchargeNote}
            </p>
          ) : null}
          {priceUnavailable ? null : (
            <p className="mt-2 text-sm font-semibold text-emerald-dark">✓ Fixed price. No surprises.</p>
          )}
          {capacityConfirmation ? (
            <div
              className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-left"
              data-luggage-capacity-confirmation
            >
              <p className="text-sm font-semibold text-navy">
                {LUGGAGE_CAPACITY_CONFIRMATION_HEADING}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-navy/75">
                {LUGGAGE_CAPACITY_CONFIRMATION_BODY}
              </p>
            </div>
          ) : null}
          {airportAccess ? (
            <div className="mt-3 text-left" data-quote-result-airport-access>
              {airportAccess}
            </div>
          ) : null}

          <div className="mt-4">{bookButton}</div>
          <p className="mt-2.5 text-[11px] leading-snug text-[#475569]">
            🔒 Secure booking · Takes around 2 minutes
          </p>

          <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-medium leading-snug text-navy/85">
            <Benefit icon="card">
              {capacityConfirmation ? "We'll confirm first" : "Secure payment"}
              <span className="block font-normal text-[#475569]">
                {capacityConfirmation ? "no payment taken yet" : "powered by SumUp"}
              </span>
            </Benefit>
            <Benefit icon="plane">
              Flight monitoring
              <span className="block font-normal text-[#475569]">for airport pickups</span>
            </Benefit>
            <Benefit>No hidden charges</Benefit>
          </ul>
      </div>
    </div>
  );
  },
);

export default QuoteResultShowcase;

function Benefit({
  children,
  icon = "tick",
}: {
  children: React.ReactNode;
  icon?: "tick" | "plane" | "card";
}) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="shrink-0 text-emerald-dark" aria-hidden>
        {icon === "plane" ? "✈" : icon === "card" ? "💳" : "✓"}
      </span>
      <span>{children}</span>
    </li>
  );
}


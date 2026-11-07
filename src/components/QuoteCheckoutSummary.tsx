"use client";

import type { ReactNode } from "react";

type Props = {
  routeLine: string;
  pickupAddress?: string;
  destinationAddress?: string;
  detailLine: string;
  totalLabel: string;
  whenLine?: string | null;
  returnWhenLine?: string | null;
  accessLine?: string | null;
  onEditJourney: () => void;
  onChangeDropOff?: (() => void) | null;
  changeAccessLabel?: string;
  /** Desktop (1200px+) only: the journey laid out for the side panel. Hidden below 1200px. */
  desktopDetails?: ReactNode;
  children?: ReactNode;
};

/**
 * Compact post-quote booking summary — route, party, total, and short edit links.
 * Does not render the large quote price card or Express selector.
 */
export default function QuoteCheckoutSummary({
  routeLine,
  pickupAddress,
  destinationAddress,
  detailLine,
  totalLabel,
  whenLine,
  returnWhenLine,
  accessLine,
  onEditJourney,
  onChangeDropOff,
  changeAccessLabel = "Change airport access",
  desktopDetails,
  children,
}: Props) {
  // "Total £48" → label + amount, so the desktop panel can style the amount on its own.
  // Same text and spacing on every screen size.
  const totalMatch = /^(Total)\s+(.+)$/.exec(totalLabel);
  return (
    <div
      id="quote-price-summary"
      data-booking-nav-heading
      tabIndex={-1}
      className="scroll-mt-44 rounded-xl quote-panel px-3.5 py-3 outline-none md:scroll-mt-28"
    >
      <div data-checkout-summary-details>
      {desktopDetails ? <div className="hidden" data-checkout-desktop-details>{desktopDetails}</div> : null}
      <p className="text-sm font-semibold leading-snug break-words text-white" data-checkout-route>{routeLine}</p>
      <p className="mt-1 text-sm quote-secondary" data-checkout-party>{detailLine}</p>
      {whenLine ? (
        <p className="mt-1 text-sm font-semibold text-white" data-checkout-pickup-time>
          Pickup time: {whenLine}
        </p>
      ) : null}
      {returnWhenLine ? (
        <p className="mt-1 text-sm font-semibold text-white" data-checkout-return-time>
          Return pickup: {returnWhenLine}
        </p>
      ) : null}
      {accessLine ? <p className="mt-1 text-xs text-white/75" data-checkout-access>{accessLine}</p> : null}
      </div>
      <p className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl" data-checkout-total>
        {totalMatch ? (
          <>
            <span data-checkout-total-label>{totalMatch[1]}</span> <span data-checkout-total-amount>{totalMatch[2]}</span>
          </>
        ) : (
          totalLabel
        )}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs font-semibold" data-checkout-summary-controls>
        {pickupAddress && destinationAddress ? (
          <details className="min-w-0 text-white/75 open:basis-full">
            <summary className="min-h-11 cursor-pointer content-center text-emerald">Full journey addresses</summary>
            <p className="break-words"><strong>Pickup:</strong> {pickupAddress}</p>
            <p className="mt-1 break-words"><strong>Destination:</strong> {destinationAddress}</p>
          </details>
        ) : null}
        <button
          type="button"
          onClick={onEditJourney}
          className="min-h-11 text-emerald underline-offset-2 hover:underline"
        >
          Edit journey
        </button>
        {onChangeDropOff ? (
          <button
            type="button"
            onClick={onChangeDropOff}
            className="min-h-11 text-emerald underline-offset-2 hover:underline"
          >
            {changeAccessLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

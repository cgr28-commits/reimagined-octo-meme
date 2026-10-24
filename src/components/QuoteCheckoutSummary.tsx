"use client";

import type { ReactNode } from "react";

type Props = {
  routeLine: string;
  pickupAddress?: string;
  destinationAddress?: string;
  detailLine: string;
  totalLabel: string;
  whenLine?: string | null;
  accessLine?: string | null;
  onEditJourney: () => void;
  onChangeDropOff?: (() => void) | null;
  changeAccessLabel?: string;
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
  accessLine,
  onEditJourney,
  onChangeDropOff,
  changeAccessLabel = "Change airport access",
  children,
}: Props) {
  return (
    <div
      id="quote-price-summary"
      data-booking-nav-heading
      tabIndex={-1}
      className="scroll-mt-44 rounded-xl quote-panel px-3.5 py-3 outline-none md:scroll-mt-28"
    >
      <p className="text-sm font-semibold leading-snug break-words text-white">{routeLine}</p>
      <p className="mt-1 text-sm quote-secondary">{detailLine}</p>
      {whenLine ? (
        <p className="mt-1 text-sm font-semibold text-white" data-checkout-pickup-time>
          Pickup time: {whenLine}
        </p>
      ) : null}
      {accessLine ? <p className="mt-1 text-xs text-white/75">{accessLine}</p> : null}
      <p className="mt-2 text-lg font-bold tracking-tight text-white sm:text-xl">{totalLabel}</p>
      {pickupAddress && destinationAddress ? (
        <details className="mt-1 text-xs text-white/75">
          <summary className="flex min-h-11 cursor-pointer items-center text-emerald">Full journey addresses</summary>
          <p className="break-words"><strong>Pickup:</strong> {pickupAddress}</p>
          <p className="mt-1 break-words"><strong>Destination:</strong> {destinationAddress}</p>
        </details>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
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

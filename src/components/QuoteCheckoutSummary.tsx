"use client";

import type { ReactNode } from "react";

type Props = {
  routeLine: string;
  detailLine: string;
  totalLabel: string;
  accessLine?: string | null;
  onEditJourney: () => void;
  onChangeDropOff?: (() => void) | null;
  children?: ReactNode;
};

/**
 * Compact post-quote booking summary — route, party, total, and short edit links.
 * Does not render the large quote price card or Express selector.
 */
export default function QuoteCheckoutSummary({
  routeLine,
  detailLine,
  totalLabel,
  accessLine,
  onEditJourney,
  onChangeDropOff,
  children,
}: Props) {
  return (
    <div
      id="quote-price-summary"
      data-booking-nav-heading
      tabIndex={-1}
      className="scroll-mt-44 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-3 outline-none md:scroll-mt-28"
    >
      <p className="text-sm font-semibold leading-snug text-white">{routeLine}</p>
      <p className="mt-1 text-sm text-white/70">{detailLine}</p>
      <p className="mt-2 text-lg font-bold tracking-tight text-white sm:text-xl">{totalLabel}</p>
      {accessLine ? <p className="mt-1 text-xs text-white/60">{accessLine}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
        <button
          type="button"
          onClick={onEditJourney}
          className="text-emerald underline-offset-2 hover:underline"
        >
          Edit journey
        </button>
        {onChangeDropOff ? (
          <button
            type="button"
            onClick={onChangeDropOff}
            className="text-emerald underline-offset-2 hover:underline"
          >
            Change drop-off
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

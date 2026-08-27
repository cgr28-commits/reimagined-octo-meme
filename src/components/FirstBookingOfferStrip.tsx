"use client";

import QuoteNavLink from "@/components/QuoteNavLink";
import {
  FIRST_BOOKING_OFFER_CONFIG,
} from "../../shared/first-booking-offer";

/**
 * Homepage presentation only — advertises the £5 first-booking welcome offer
 * near the main Get a Quote CTA. Does not apply any discount or change eligibility.
 */
export default function FirstBookingOfferStrip() {
  if (!FIRST_BOOKING_OFFER_CONFIG.enabled) {
    return null;
  }

  const amount = FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp;
  const minFare = FIRST_BOOKING_OFFER_CONFIG.minimumEligibleJourneyFareGbp;

  return (
    <aside
      className="mb-3 rounded-xl border border-emerald/28 bg-gradient-to-br from-navy-light/90 via-navy-light/70 to-navy/90 p-3 shadow-[0_0_0_1px_rgba(47,191,74,0.08),0_10px_28px_rgba(2,10,24,0.35)] sm:mb-3.5 sm:p-3.5"
      aria-label={`New customer offer: £${amount} off first booking`}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald">
        New customer offer · £{amount} off
      </p>
      <p className="mt-1.5 text-sm font-bold leading-snug tracking-tight text-white sm:text-[0.95rem]">
        £{amount} OFF YOUR FIRST BOOKING
      </p>
      <p className="mt-1 text-[0.8rem] leading-snug text-white/68 sm:text-[0.8125rem]">
        New customer? Get £{amount} off your first airport transfer when your
        journey fare is £{minFare} or more.
      </p>
      <QuoteNavLink
        href="/#quote"
        className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald transition-colors hover:text-emerald-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/70"
      >
        Get a Quote
        <span aria-hidden="true">→</span>
      </QuoteNavLink>
    </aside>
  );
}

/** Compact badge for brand column — reinforces the offer without leading the page. */
export function FirstBookingOfferBadge({ className = "" }: { className?: string }) {
  if (!FIRST_BOOKING_OFFER_CONFIG.enabled) {
    return null;
  }

  const amount = FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp;

  return (
    <span
      className={`inline-flex items-center rounded-full border border-emerald/35 bg-emerald/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-emerald ${className}`}
    >
      New customer offer · £{amount} off
    </span>
  );
}

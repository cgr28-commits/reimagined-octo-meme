"use client";

import QuoteNavLink from "@/components/QuoteNavLink";
import {
  FIRST_BOOKING_OFFER_CONFIG,
} from "../../shared/first-booking-offer";

/**
 * Homepage presentation only — advertises the £5 first-booking welcome offer
 * near the main Get a Quote CTA. Does not apply any discount or change eligibility.
 *
 * Mobile: slim premium strip (no CTA — quote tool is immediately below).
 * Desktop: fuller copy + optional Get a Quote link.
 */
export default function FirstBookingOfferStrip() {
  if (!FIRST_BOOKING_OFFER_CONFIG.enabled) {
    return null;
  }

  const amount = FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp;
  const minFare = FIRST_BOOKING_OFFER_CONFIG.minimumEligibleJourneyFareGbp;

  return (
    <aside
      className="first-booking-offer-enter mb-2 rounded-lg border border-emerald/30 bg-gradient-to-r from-navy-light/95 via-navy-light/80 to-navy/90 px-3 py-2 shadow-[0_0_0_1px_rgba(47,191,74,0.1),0_6px_20px_rgba(2,10,24,0.28)] md:mb-3.5 md:rounded-xl md:bg-gradient-to-br md:p-3.5 md:shadow-[0_0_0_1px_rgba(47,191,74,0.08),0_10px_28px_rgba(2,10,24,0.35)]"
      aria-label={`New customer offer: £${amount} off first booking`}
    >
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-emerald md:text-[0.65rem]">
        New customer offer
      </p>
      <p className="mt-0.5 text-[0.8125rem] font-bold leading-snug tracking-tight text-white md:mt-1.5 md:text-[0.95rem]">
        <span className="text-emerald">£{amount} OFF</span>
        {" YOUR FIRST BOOKING"}
      </p>
      {/* Mobile: one compact eligibility line — no long explanation, no CTA */}
      <p className="mt-0.5 text-[0.7rem] leading-snug text-white/60 md:hidden">
        Journey fare £{minFare}+ · Eligibility confirmed before payment
      </p>
      {/* Desktop: fuller welcome wording + CTA into the quote panel */}
      <p className="mt-1 hidden text-[0.8125rem] leading-snug text-white/68 md:block">
        New customer? Get £{amount} off your first airport transfer when your
        journey fare is £{minFare} or more.
      </p>
      <QuoteNavLink
        href="/#quote"
        className="mt-2.5 hidden items-center gap-1.5 text-sm font-bold text-emerald transition-colors hover:text-emerald-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/70 md:inline-flex"
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

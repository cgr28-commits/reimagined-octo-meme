"use client";

import QuoteNavLink from "@/components/QuoteNavLink";
import {
  FIRST_BOOKING_OFFER_CONFIG,
} from "../../shared/first-booking-offer";

/**
 * Homepage presentation only — advertises the £5 booking offer near the main
 * Get a Quote CTA. Does not apply any discount itself.
 *
 * Mobile: ultra-slim premium strip (no CTA — quote tool is immediately below).
 * Desktop: fuller copy + Get a Quote link.
 */
export default function FirstBookingOfferStrip() {
  if (!FIRST_BOOKING_OFFER_CONFIG.enabled) {
    return null;
  }

  const amount = FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp;
  const minValue = FIRST_BOOKING_OFFER_CONFIG.minimumEligibleBookingValueGbp;

  return (
    <aside
      className="first-booking-offer-enter mb-1.5 rounded-lg border border-emerald/30 bg-gradient-to-r from-navy-light/95 via-navy-light/80 to-navy/90 px-2.5 py-1.5 shadow-[0_0_0_1px_rgba(47,191,74,0.1),0_6px_18px_rgba(2,10,24,0.28)] md:mb-3.5 md:rounded-xl md:bg-gradient-to-br md:p-3.5 md:shadow-[0_0_0_1px_rgba(47,191,74,0.08),0_10px_28px_rgba(2,10,24,0.35)]"
      aria-label={`£${amount} booking offer: £${amount} off bookings £${minValue}+`}
      data-offer-layout="compact-v2"
    >
      {/* Mobile: compact strip */}
      <div className="md:hidden">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-emerald">
          £{amount} booking offer
        </p>
        <p className="mt-0.5 text-[0.8rem] font-bold leading-none tracking-tight text-white">
          <span className="text-emerald">£{amount} OFF</span>
          {` BOOKINGS £${minValue}+`}
        </p>
        <p className="mt-0.5 text-[0.65rem] leading-snug text-white/55">
          Save £{amount} when your booking value is £{minValue} or more.
        </p>
      </div>

      {/* Desktop: fuller wording + CTA */}
      <div className="hidden md:block">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald">
          £{amount} booking offer
        </p>
        <p className="mt-1.5 text-[0.95rem] font-bold leading-snug tracking-tight text-white">
          <span className="text-emerald">£{amount} OFF</span>
          {` BOOKINGS £${minValue}+`}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-white/68">
          Save £{amount} when your booking value is £{minValue} or more.
        </p>
        <QuoteNavLink
          href="/#quote"
          className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald transition-colors hover:text-emerald-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald/70"
        >
          Get a Quote
          <span aria-hidden="true">→</span>
        </QuoteNavLink>
      </div>
    </aside>
  );
}

/** Compact badge for brand column — reinforces the offer without leading the page. */
export function FirstBookingOfferBadge({ className = "" }: { className?: string }) {
  if (!FIRST_BOOKING_OFFER_CONFIG.enabled) {
    return null;
  }

  const amount = FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp;
  const minValue = FIRST_BOOKING_OFFER_CONFIG.minimumEligibleBookingValueGbp;

  return (
    <span
      className={`inline-flex items-center rounded-full border border-emerald/35 bg-emerald/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-emerald ${className}`}
    >
      £{amount} off bookings £{minValue}+
    </span>
  );
}

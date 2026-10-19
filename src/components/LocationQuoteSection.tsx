"use client";

import { LandingPageStickyQuoteCta } from "@/components/LandingPageQuoteCta";
import QuoteCard from "@/components/QuoteCard";

type Props = {
  bookingIntroduction?: string;
  pickupNotice?: string;
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  addressHint?: string;
  heading?: string;
  eyebrow?: string;
  description?: string;
  /** Show the additional mobile quote link below the calculator. */
  showStickyQuote?: boolean;
  /** Prefer the existing 7 Seater Minibus when it is offered and fits the party. */
  preferMinibus?: boolean;
};

export default function LocationQuoteSection({
  bookingIntroduction,
  pickupNotice,
  airportCode = "",
  direction = "to-airport",
  addressHint = "",
  heading = "Get your fixed quote",
  eyebrow = "Instant quote",
  description = "Fixed prices. No surge pricing. Airport pickups include up to 60 minutes complimentary waiting time.",
  showStickyQuote = true,
  preferMinibus = false,
}: Props) {
  return (
    <section
      id="quote"
      data-landing-quote
      className="relative scroll-mt-36 py-16 sm:py-20 md:scroll-mt-28"
    >
      <span id="live-quote" className="sr-only">
        Fixed quote calculator
      </span>
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/25 to-navy" />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">{eyebrow}</p>
          <h2
            data-booking-nav-heading
            className="mt-2 text-2xl font-bold text-white sm:text-3xl"
          >
            {heading}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
            {description}
          </p>
        </div>
        {pickupNotice ? <p className="mb-6 rounded-xl border border-emerald/30 bg-emerald/5 p-4 text-sm leading-relaxed text-white/85"><strong>Station pickup:</strong> {pickupNotice}</p> : null}
        <QuoteCard
          bookingIntroduction={bookingIntroduction}
          presentation="homepage"
          initialAirportCode={airportCode}
          initialDirection={direction}
          initialAddressHint={addressHint}
          preferMinibus={preferMinibus}
        />
      </div>
      {showStickyQuote ? <LandingPageStickyQuoteCta /> : null}
    </section>
  );
}

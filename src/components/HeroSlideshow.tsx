"use client";

import QuoteCard from "./QuoteCard";
import QuoteHelpContact from "./QuoteHelpContact";

export default function HeroSlideshow() {
  return (
    <section className="relative min-h-screen max-w-full overflow-x-clip overflow-y-hidden pt-20 md:pt-28">
      <div className="absolute inset-0 overflow-hidden bg-navy" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-light/20 via-navy to-navy-dark" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_12%_0%,rgba(12,42,82,0.5),transparent_58%)]" />
      </div>

      {/* Mobile: compact service message first, then the start of the quote form.
          Tablet (md) and desktop (lg): existing quote-first / two-column layout. */}
      <div className="relative mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-3.5 px-4 py-2 sm:px-6 md:gap-12 md:px-6 md:py-16 lg:max-w-[1400px] lg:grid-cols-[minmax(0,1fr)_minmax(500px,600px)] lg:items-start lg:gap-14 lg:px-10 lg:py-14 xl:gap-16 xl:px-12 xl:py-16">
        <div className="order-1 min-w-0 md:order-2 lg:order-1 lg:pt-2">
          <p className="section-eyebrow mb-2 max-w-full md:mb-5 lg:mb-6">Private taxi airport transfers</p>

          <h1 className="font-display text-balance text-[1.95rem] font-semibold leading-[1.12] tracking-tight text-white md:text-[2.7rem] md:leading-[1.08] lg:text-[3.35rem] xl:text-[3.7rem] xl:leading-[1.06]">
            Belfast Airport Transfers – Pre-Booked 24/7
          </h1>

          <p className="mt-2.5 max-w-xl text-[0.9375rem] leading-snug text-white/68 md:hidden">
            Fixed-price, pre-booked private taxi transfers to Belfast International, Belfast City and Dublin Airport.
          </p>

          <p className="mt-5 hidden max-w-xl text-base leading-relaxed text-white/68 sm:text-lg md:block lg:mt-6 lg:max-w-xl lg:text-[1.125rem] lg:leading-relaxed">
            Reliable, fixed-price airport transfers to and from Belfast International, Belfast City and Dublin Airport. Book in advance and travel with confidence.
          </p>

          <p className="mt-4 hidden max-w-xl text-sm font-medium leading-snug text-white/78 md:block sm:text-[0.95rem]">
            Fixed fares. Reliable airport transfers. No surprises.
          </p>

          <ul className="mt-8 hidden gap-3.5 text-sm text-white/62 sm:grid-cols-2 md:grid lg:mt-10 lg:gap-x-8 lg:gap-y-3.5">
            {[
              "Instant fixed prices online",
              "Airport fees & applicable tolls included",
              "Flight monitoring on airport pickups",
              "60 minutes complimentary airport waiting",
              "Secure card booking where eligible",
              "5% off when you book a return",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  className="mt-[0.55rem] h-px w-3 shrink-0 bg-emerald/80"
                  aria-hidden
                />
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 hidden max-w-lg text-sm leading-relaxed text-white/48 md:block lg:mt-10">
            Get your fixed price below. Eligible bookings can be confirmed securely by card.
          </p>
        </div>

        <div
          className="order-2 min-w-0 w-full scroll-mt-20 md:order-1 md:scroll-mt-28 lg:order-2 lg:justify-self-stretch"
          id="quote"
        >
          <QuoteCard />
          <QuoteHelpContact />
        </div>
      </div>
    </section>
  );
}

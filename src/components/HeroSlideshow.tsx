"use client";

import { LOWEST_AIRPORT_FROM_PRICE, SERVICE_FLAGS } from "@/lib/data";
import QuoteCard from "./QuoteCard";

export default function HeroSlideshow() {
  const fromPrice = `From £${LOWEST_AIRPORT_FROM_PRICE}`;
  const airportList = SERVICE_FLAGS.belfastCityAirport
    ? "Belfast International, Belfast City, Dublin, and City of Derry airports"
    : "Belfast International, Dublin, and City of Derry airports";

  return (
    <section className="relative min-h-screen max-w-full overflow-x-clip overflow-y-hidden bg-navy pt-36 md:pt-28">
      <div className="absolute inset-0 bg-navy" aria-hidden="true" />

      <div className="relative mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-14 px-4 py-16 sm:px-6 lg:flex-row lg:items-start lg:gap-20 lg:px-8 lg:py-24">
        <div className="min-w-0 flex-1 lg:max-w-xl lg:pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald">
            Airport transfers · Northern Ireland
          </p>

          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            Private airport transfers, quoted before you book
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70 sm:text-xl">
            Fixed prices to {airportList} and long-distance routes across Northern Ireland — with
            flight tracking, meet &amp; greet, and complimentary waiting time.
          </p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/55">
            Enter your journey details for a live quote, then pay securely online to confirm.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#quote"
              className="rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-colors hover:bg-emerald-light"
            >
              Get a Quote
            </a>
            <a
              href="#airports"
              className="rounded-full border border-white/15 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/35"
            >
              View Airports
            </a>
          </div>

          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/55">
            <li>{fromPrice}</li>
            <li>Flight tracking</li>
            <li>Meet &amp; greet</li>
          </ul>
        </div>

        <div className="min-w-0 w-full flex-1 scroll-mt-28 lg:max-w-md" id="quote">
          <QuoteCard />
        </div>
      </div>
    </section>
  );
}

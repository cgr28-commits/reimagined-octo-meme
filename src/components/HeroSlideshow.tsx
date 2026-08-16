"use client";

import { SERVICE_FLAGS } from "@/lib/data";
import QuoteCard from "./QuoteCard";

export default function HeroSlideshow() {
  const airportList = SERVICE_FLAGS.belfastCityAirport
    ? "Belfast International, Belfast City, City of Derry, and Dublin"
    : "Belfast International, City of Derry, and Dublin";

  return (
    <section className="relative min-h-screen max-w-full overflow-x-clip overflow-y-hidden pt-44 md:pt-28">
      <div className="absolute inset-0 overflow-hidden bg-navy" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy-dark" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-dark/80 via-transparent to-navy-light/30" />
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald/10 blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-navy-light/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
            Fixed Price Airport Transfers
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            My Airport Taxi NI
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75 sm:text-xl">
            Fixed price transfers to {airportList} airports — and door-to-door across Northern
            Ireland.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#quote"
              className="rounded-full bg-emerald px-8 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light hover:shadow-emerald/40"
            >
              Get a Fixed Quote
            </a>
            <a
              href="#quote"
              className="rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-emerald/50 hover:bg-white/5"
            >
              Book Your Transfer
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Get your fixed price instantly</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Airport fees included where applicable
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Flight monitoring
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              60 minutes complimentary airport waiting
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Secure online booking
            </div>
          </div>

          <p className="mt-6 max-w-lg text-sm text-white/55">
            Get your fixed price online. Eligible bookings can be confirmed securely by card.
          </p>
        </div>

        <div className="min-w-0 w-full flex-1 scroll-mt-40 md:scroll-mt-32 lg:max-w-md" id="quote">
          <QuoteCard />
        </div>
      </div>
    </section>
  );
}

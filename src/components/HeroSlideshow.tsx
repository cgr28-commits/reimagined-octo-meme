"use client";

import { SERVICE_FLAGS } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import QuoteCard from "./QuoteCard";

export default function HeroSlideshow() {
  const airportList = SERVICE_FLAGS.belfastCityAirport
    ? "Belfast International, Belfast City, City of Derry and Dublin"
    : "Belfast International, City of Derry and Dublin";

  return (
    <section className="relative min-h-screen max-w-full overflow-x-clip overflow-y-hidden pt-36 md:pt-28">
      <div className="absolute inset-0 overflow-hidden bg-navy" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy-dark" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-dark/80 via-transparent to-navy-light/30" />
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald/10 blur-3xl" />
        <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-navy-light/40 blur-3xl" />
      </div>

      {/* Mobile: quote first so “Where are you travelling?” is above the fold. Desktop: copy | quote. */}
      <div className="relative mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-8 px-4 py-5 sm:px-6 md:gap-12 md:py-16 lg:max-w-[1400px] lg:grid-cols-[minmax(0,1fr)_minmax(500px,600px)] lg:items-start lg:gap-14 lg:px-10 lg:py-14 xl:gap-16 xl:px-12 xl:py-16">
        <div className="order-2 min-w-0 lg:order-1 lg:pt-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald lg:mb-3.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
            Fixed Price Airport Transfers
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-[4rem] xl:leading-[1.08]">
            My Airport Taxi NI
          </h1>

          <p className="mt-5 max-w-xl break-words text-lg leading-relaxed text-white/75 sm:text-xl lg:mt-4 lg:max-w-2xl lg:text-xl lg:leading-relaxed">
            Fixed price transfers to {airportList} airports — plus door-to-door transfers across
            Northern Ireland and the Republic of Ireland.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65 lg:mt-5 lg:grid lg:grid-cols-2 lg:gap-x-7 lg:gap-y-2.5">
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
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save 5% when you book a return
            </div>
          </div>

          <p className="mt-6 max-w-lg text-sm text-white/55 lg:mt-6 lg:max-w-xl">
            Get your fixed price online. Eligible bookings can be confirmed securely by card.
          </p>
        </div>

        <div
          className="order-1 min-w-0 w-full scroll-mt-36 xl:scroll-mt-28 lg:order-2 lg:justify-self-stretch"
          id="quote"
        >
          <QuoteCard />
          <p className="mt-4 px-1 text-center text-sm leading-relaxed text-white/50">
            Need help?{" "}
            <a
              href={whatsAppChatUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald/90 underline-offset-2 hover:text-emerald hover:underline"
            >
              WhatsApp us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

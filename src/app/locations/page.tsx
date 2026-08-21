import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import QuoteNavLink from "@/components/QuoteNavLink";
import SectionHeading from "@/components/SectionHeading";
import { AREAS, SERVICE_FLAGS, SITE } from "@/lib/data";
import {
  LOCATIONS_AIRPORT_EXAMPLES,
  LOCATIONS_LONG_DISTANCE_EXAMPLES,
  LOCATIONS_PAGE_INTRO,
  LOCATIONS_ROI_EXAMPLES,
  LOCATIONS_ROUTE_NOTE,
} from "@/lib/locations-content";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: `Locations We Cover | ${SITE.name}`,
  description:
    "Areas served across Northern Ireland, Republic of Ireland destinations, airports, and popular long-distance transfer routes. Examples for guidance — get a live quote for your exact journey.",
  alternates: {
    canonical: "/locations/",
  },
};

export default function LocationsPage() {
  if (!SERVICE_FLAGS.addressToAddress) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 xl:pt-28">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy" />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 text-sm text-white/50 transition-colors hover:text-emerald"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to home
            </Link>

            <div className="mt-8 max-w-3xl">
              <SectionHeading
                as="h1"
                align="left"
                eyebrow="Locations"
                title="Where we travel"
                description={LOCATIONS_PAGE_INTRO}
              />
            </div>

            <div className="mt-14 grid gap-10 lg:grid-cols-2">
              <section>
                <h2 className="text-xl font-bold text-white">Northern Ireland destinations</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Door-to-door drop-offs across NI from Greater Belfast pickups, including:
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {AREAS.map((area) => (
                    <li
                      key={area}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75"
                    >
                      {area}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-bold text-white">Republic of Ireland</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Cross-border and ROI long-distance transfers are quoted individually. Example
                  destinations:
                </p>
                <ul className="mt-4 space-y-2">
                  {LOCATIONS_ROI_EXAMPLES.map((place) => (
                    <li
                      key={place}
                      className="rounded-xl border border-white/10 bg-navy-light/50 px-4 py-2.5 text-sm text-white/80"
                    >
                      {place}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-bold text-white">Airports</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Pre-booked airport pickups for long-distance transfers are available from Belfast
                  International, Belfast City and Dublin Airport. City of Derry (LDY) remains available
                  for Greater Belfast connections:
                </p>
                <ul className="mt-4 space-y-2">
                  {LOCATIONS_AIRPORT_EXAMPLES.map((airport) => (
                    <li
                      key={airport}
                      className="rounded-xl border border-white/10 bg-navy-light/50 px-4 py-2.5 text-sm text-white/80"
                    >
                      {airport}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-bold text-white">Popular long-distance routes</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{LOCATIONS_ROUTE_NOTE}</p>
                <ul className="mt-4 space-y-2">
                  {LOCATIONS_LONG_DISTANCE_EXAMPLES.map((route) => (
                    <li
                      key={route}
                      className="rounded-xl border border-white/10 bg-navy-light/50 px-4 py-2.5 text-sm text-white/80"
                    >
                      {route}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="mt-14 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
              <p className="text-sm font-medium uppercase tracking-wider text-emerald">Your journey</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
                Enter your pickup and destination on the homepage quote form for an instant NI price
                or to request a fixed cross-border quote.
              </p>
              <QuoteNavLink
                href="/#quote"
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-emerald px-8 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
              >
                Get a live quote
              </QuoteNavLink>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

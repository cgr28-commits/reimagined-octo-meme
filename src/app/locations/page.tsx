import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import QuoteNavLink from "@/components/QuoteNavLink";
import SectionHeading from "@/components/SectionHeading";
import { AREAS, SERVICE_FLAGS, SITE } from "@/lib/data";
import {
  LOCATIONS_AIRPORT_LINKS,
  LOCATIONS_HUB_H1,
  LOCATIONS_HUB_INTRO,
  LOCATIONS_LONG_DISTANCE_EXAMPLES,
  LOCATIONS_PAGE_INTRO,
  LOCATIONS_ROI_EXAMPLES,
  LOCATIONS_ROUTE_NOTE,
} from "@/lib/locations-content";
import { getTownHubByAreaName, TOWN_HUB_PAGES } from "@/lib/location-pages";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: `${LOCATIONS_HUB_H1} | ${SITE.name}`,
  description:
    "Find airport taxi pages for towns across Northern Ireland, plus long-distance destinations we cover. Pre-book transfers to Belfast International, Belfast City, Dublin and City of Derry Airport.",
  alternates: {
    canonical: "/locations/",
  },
};

export default function LocationsPage() {
  if (!SERVICE_FLAGS.addressToAddress) {
    notFound();
  }

  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations/" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy" />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <LandingBreadcrumbs
              items={[
                { name: "Home", href: "/" },
                { name: "Locations" },
              ]}
            />

            <div className="mt-8 max-w-3xl">
              <SectionHeading
                as="h1"
                align="left"
                eyebrow="Locations"
                title={LOCATIONS_HUB_H1}
                navId="locations"
                description={LOCATIONS_HUB_INTRO}
              />
            </div>

            <section className="mt-8">
              <h2 className="text-xl font-bold text-white">Airport taxi towns</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                Dedicated airport taxi pages for towns we quote most often. Each town links through
                to Belfast International, Belfast City and Dublin Airport.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TOWN_HUB_PAGES.map((hub) => (
                  <li key={hub.slug}>
                    <Link
                      href={`/locations/${hub.slug}/`}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-emerald/40"
                    >
                      <p className="text-base font-bold text-white">{hub.town.name} airport taxis</p>
                      <p className="mt-1 text-sm text-white/55">
                        {hub.town.name} to Belfast International, Belfast City and Dublin Airport
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-14 grid gap-10 lg:grid-cols-2">
              <section className="lg:col-span-2">
                <p className="max-w-3xl text-sm leading-relaxed text-white/60">{LOCATIONS_PAGE_INTRO}</p>
              </section>
              <section>
                <h2 className="text-xl font-bold text-white">Northern Ireland destinations</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Door-to-door drop-offs across NI from Greater Belfast pickups, including:
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {AREAS.map((area) => {
                    const hub = getTownHubByAreaName(area);
                    const chipClass =
                      "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75";
                    return (
                      <li key={area}>
                        {hub ? (
                          <Link
                            href={`/locations/${hub.slug}/`}
                            className={`${chipClass} transition-colors hover:border-emerald/40 hover:text-emerald`}
                          >
                            {area}
                          </Link>
                        ) : (
                          <span className={chipClass}>{area}</span>
                        )}
                      </li>
                    );
                  })}
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
                  {LOCATIONS_AIRPORT_LINKS.map((airport) => (
                    <li key={airport.href}>
                      <Link
                        href={airport.href}
                        className="block rounded-xl border border-white/10 bg-navy-light/50 px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-emerald/40 hover:text-emerald"
                      >
                        {airport.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/transfers/dublin-airport-to-belfast/"
                      className="block rounded-xl border border-white/10 bg-navy-light/50 px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      Dublin Airport to Belfast taxi
                    </Link>
                  </li>
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

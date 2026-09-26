import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import {
  AIRPORT_PAGES,
  getRoutesForTown,
  getTownHubPage,
  TOWN_HUB_PAGES,
} from "@/lib/location-pages";
import { withBasePath } from "@/lib/paths";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TOWN_HUB_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getTownHubPage(slug);
  if (!page) {
    return { title: `Airport Taxi | ${SITE.name}` };
  }
  return {
    title: `${page.title} | ${SITE.name}`,
    description: page.metaDescription,
    alternates: { canonical: `/locations/${page.slug}/` },
    openGraph: {
      title: `${page.title} | ${SITE.name}`,
      description: page.metaDescription,
      url: `/locations/${page.slug}/`,
      images: page.heroBase
        ? [
            {
              url: withBasePath(`/images/hero/optimized/${page.heroBase}-1920.jpg`),
              width: 1920,
              height: 1080,
              alt: page.heroAlt ?? page.town.name,
            },
          ]
        : [
            {
              url: withBasePath("/og-image-square.png"),
              width: 1024,
              height: 1024,
              alt: SITE.name,
            },
          ],
    },
  };
}

export default async function TownHubPage({ params }: Props) {
  const { slug } = await params;
  const page = getTownHubPage(slug);
  if (!page) notFound();

  const routes = getRoutesForTown(page.town.slug);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations/" },
    { name: page.town.name, path: `/locations/${page.slug}/` },
  ];
  const breadcrumb = getBreadcrumbJsonLd(crumbs);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/locations/${page.slug}/`,
    areaServed: [page.town.name, ...page.areas, "Northern Ireland"],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS}>
        <LandingHeroMedia baseName={page.heroBase} alt={page.heroAlt} />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Locations", href: "/locations/" },
              { name: page.town.name },
            ]}
          />

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {page.town.name} · Airport taxi
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{page.h1}</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
            <LandingCtaRow
              quoteLabel="Get a Live Quote"
              whatsappMessage={`Hi, I'd like an airport taxi from ${page.town.name}.`}
            />
          </header>

          <section className="mt-10">
            <h2 className="text-lg font-bold text-white">Airport transfers from {page.town.name}</h2>
            <ul className="mt-4 grid gap-3">
              {routes.map((route) => (
                <li key={route.slug}>
                  <Link
                    href={`/transfers/${route.slug}/`}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-emerald/40"
                  >
                    <p className="text-sm font-semibold text-emerald">{route.airport.code}</p>
                    <p className="mt-1 text-base font-bold text-white">
                      {page.town.name} to {route.airport.name}
                    </p>
                    <p className="mt-1 text-sm text-white/55">{route.airport.shortName} transfers</p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-white/50">
              See all{" "}
              <Link href="/airports/" className="text-emerald hover:text-emerald-light">
                airport transfers
              </Link>
              {AIRPORT_PAGES.filter((airport) => page.airportCodes.includes(airport.code)).map(
                (airport) => (
                  <span key={airport.slug}>
                    {" "}
                    ·{" "}
                    <Link
                      href={`/airports/${airport.slug}/`}
                      className="text-emerald hover:text-emerald-light"
                    >
                      {airport.shortName}
                    </Link>
                  </span>
                ),
              )}
              .
            </p>
          </section>
        </div>

        <LocationQuoteSection
          addressHint={page.town.addressHint}
          heading={`Quote an airport taxi from ${page.town.name}`}
        />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Areas around {page.town.name} we cover</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {page.areas.map((area) => {
                const linkedHub = TOWN_HUB_PAGES.find(
                  (hub) => hub.town.name === area && hub.slug !== page.slug,
                );
                const chipClass =
                  "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75";
                return (
                  <li key={area}>
                    {linkedHub ? (
                      <Link
                        href={`/locations/${linkedHub.slug}/`}
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
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/65">
              {page.localNotes.map((note) => (
                <li key={note} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>

          {page.relatedTownSlugs.some((townSlug) => {
            const related = TOWN_HUB_PAGES.find((hub) => hub.town.slug === townSlug);
            return related && related.slug !== page.slug && !page.areas.includes(related.town.name);
          }) ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Nearby airport taxi pages</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {page.relatedTownSlugs.map((townSlug) => {
                  const related = TOWN_HUB_PAGES.find((hub) => hub.town.slug === townSlug);
                  if (!related || related.slug === page.slug || page.areas.includes(related.town.name)) return null;
                  return (
                    <li key={related.slug}>
                      <Link
                        href={`/locations/${related.slug}/`}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                      >
                        {related.town.name} airport taxis
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Which airport from {page.town.name}?</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Compare the airport options for this area and choose the route that suits your
              journey. Booking details — the live fare, flight monitoring on collections, and
              WhatsApp — sit on the route page, not on this chooser.
            </p>
            <ul className="mt-5 space-y-4">
              {page.whichAirport.map((item) => (
                <li key={item.code}>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">{item.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
            <h2 className="text-lg font-bold text-white">Book your {page.town.name} airport taxi</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
              Use the quote box on this page for a live fixed price, or message us on WhatsApp.
            </p>
            <div className="flex justify-center">
              <LandingCtaRow
                quoteLabel="Get a Live Quote"
                whatsappMessage={`Hi, I'd like an airport taxi from ${page.town.name}.`}
              />
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

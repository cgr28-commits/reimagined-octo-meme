import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";
import { LANDING_WHY_BOOK } from "@/lib/landing-why-book";
import { SITE } from "@/lib/data";
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
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="relative h-56 overflow-hidden sm:h-72">
          {page.heroBase && page.heroAlt ? (
            <OptimizedHeroPicture baseName={page.heroBase} alt={page.heroAlt} priority />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-b from-navy-light/40 via-navy to-navy"
              aria-hidden
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
        </div>

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
              quoteLabel="Get an instant quote"
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
                    <p className="mt-1 text-sm text-white/55">{route.airport.shortName} route page</p>
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
              {page.areas.map((area) => (
                <li
                  key={area}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75"
                >
                  {area}
                </li>
              ))}
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

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Why book with {SITE.name}?</h2>
            <ul className="mt-4 space-y-4">
              {LANDING_WHY_BOOK.map((item) => (
                <li key={item.title}>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
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
                quoteLabel="Get an instant quote"
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

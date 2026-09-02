import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import EmergeDiscoveryPromo from "@/components/EmergeDiscoveryPromo";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";
import QuoteNavLink from "@/components/QuoteNavLink";
import { SITE } from "@/lib/data";
import {
  AIRPORT_PAGES,
  getAirportPage,
  TRANSFER_ROUTE_PAGES,
} from "@/lib/location-pages";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";
import { withBasePath } from "@/lib/paths";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return AIRPORT_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getAirportPage(slug);
  if (!page) {
    return { title: `Airport Transfer | ${SITE.name}` };
  }
  return {
    title: `${page.title} | ${SITE.name}`,
    description: page.metaDescription,
    alternates: { canonical: `/airports/${page.slug}/` },
    openGraph: {
      title: `${page.title} | ${SITE.name}`,
      description: page.metaDescription,
      url: `/airports/${page.slug}/`,
      images: [
        {
          url: withBasePath(`/images/hero/optimized/${page.heroBase}-1920.jpg`),
          width: 1920,
          height: 1080,
          alt: page.heroAlt,
        },
      ],
    },
  };
}

export default async function AirportTransferPage({ params }: Props) {
  const { slug } = await params;
  const page = getAirportPage(slug);
  if (!page) notFound();

  const relatedRoutes = TRANSFER_ROUTE_PAGES.filter((route) => route.airport.slug === page.slug);
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Airports", path: "/airports/" },
    { name: page.shortName, path: `/airports/${page.slug}/` },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/airports/${page.slug}/`,
    areaServed: page.areaServed,
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
        <div className="relative h-64 overflow-hidden sm:h-80 lg:h-[22rem]">
          <OptimizedHeroPicture baseName={page.heroBase} alt={page.heroAlt} priority />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy/60 via-transparent to-navy/40" />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/airports/"
            className="relative z-10 -mt-10 inline-flex min-h-11 items-center gap-2 text-sm text-white/70 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All airports
          </Link>

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {page.code} · Airport transfers
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{page.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="rounded-lg bg-emerald/15 px-3 py-1 font-semibold text-emerald">
                {page.fromPriceLabel}
              </span>
              <span className="text-white/50">{page.durationNote}</span>
            </div>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
            <QuoteNavLink
              href="#quote"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
            >
              {`Get a ${page.shortName} Quote`}
            </QuoteNavLink>
          </header>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">What&apos;s included</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/65">
              {page.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Local tips for {page.shortName}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">
              {page.localTips.map((tip) => (
                <li key={tip} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          {relatedRoutes.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Popular routes to {page.shortName}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {relatedRoutes.map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/transfers/${route.slug}/`}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      {route.town.name} → {page.shortName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {page.slug === "belfast-international" ||
          page.slug === "belfast-city" ||
          page.slug === "dublin" ? (
            <EmergeDiscoveryPromo />
          ) : null}
        </div>

        <LocationQuoteSection
          airportCode={page.code}
          direction="to-airport"
          heading={`Quote a ${page.shortName} transfer`}
        />
      </main>
      <Footer />
    </>
  );
}

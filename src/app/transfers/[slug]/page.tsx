import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";
import { SITE } from "@/lib/data";
import {
  getTransferRoutePage,
  TRANSFER_ROUTE_PAGES,
} from "@/lib/location-pages";
import { withBasePath } from "@/lib/paths";
import { getBreadcrumbJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TRANSFER_ROUTE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getTransferRoutePage(slug);
  if (!page) {
    return { title: `Airport Transfer | ${SITE.name}` };
  }
  return {
    title: `${page.title} | ${SITE.name}`,
    description: page.metaDescription,
    alternates: { canonical: `/transfers/${page.slug}/` },
    openGraph: {
      title: `${page.title} | ${SITE.name}`,
      description: page.metaDescription,
      url: `/transfers/${page.slug}/`,
      images: [
        {
          url: withBasePath(`/images/hero/optimized/${page.airport.heroBase}-1920.jpg`),
          width: 1920,
          height: 1080,
          alt: page.airport.heroAlt,
        },
      ],
    },
  };
}

export default async function TransferRoutePage({ params }: Props) {
  const { slug } = await params;
  const page = getTransferRoutePage(slug);
  if (!page) notFound();

  const otherFromTown = TRANSFER_ROUTE_PAGES.filter(
    (route) => route.town.slug === page.town.slug && route.slug !== page.slug,
  );
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: page.airport.shortName, path: `/airports/${page.airport.slug}/` },
    { name: `${page.town.name} transfers`, path: `/transfers/${page.slug}/` },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/transfers/${page.slug}/`,
    areaServed: [page.town.name, page.airport.name, "Northern Ireland"],
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
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="relative h-56 overflow-hidden sm:h-72">
          <OptimizedHeroPicture
            baseName={page.airport.heroBase}
            alt={page.airport.heroAlt}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/airports/${page.airport.slug}/`}
            className="relative z-10 -mt-8 inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {page.airport.shortName} transfers
          </Link>

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {page.town.name} · {page.airport.code}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{page.title}</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
          </header>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Journey notes</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/65">
              {page.journeyNotes.map((note) => (
                <li key={note} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-white/45">
              Typical guide: {page.airport.fromPriceLabel} · {page.airport.durationNote}
            </p>
          </section>

          {otherFromTown.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">Other airports from {page.town.name}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {otherFromTown.map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/transfers/${route.slug}/`}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      {page.town.name} → {route.airport.shortName}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {page.slug === "belfast-to-dublin" ? (
            <section className="mt-8 rounded-2xl border border-emerald/25 bg-emerald/5 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-white">Going to EMERGE Belfast?</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Flying into Dublin for EMERGE? Pre-book your airport, hotel or return transfer for
                29–30 August 2026.
              </p>
              <Link
                href="/events/emerge-belfast-taxi/"
                className="mt-4 inline-flex text-sm font-semibold text-emerald hover:text-emerald-light"
              >
                View EMERGE Transfers
              </Link>
            </section>
          ) : null}
        </div>

        <LocationQuoteSection
          airportCode={page.airport.code}
          direction="to-airport"
          addressHint={page.town.addressHint}
          heading={`${page.town.name} → ${page.airport.shortName} quote`}
        />
      </main>
      <Footer />
    </>
  );
}

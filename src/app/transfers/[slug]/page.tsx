import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import EmergeDiscoveryPromo from "@/components/EmergeDiscoveryPromo";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import { LANDING_WHY_BOOK } from "@/lib/landing-why-book";
import { SITE } from "@/lib/data";
import {
  getTransferRoutePage,
  getTransferStaticSlugs,
  TRANSFER_ROUTE_PAGES,
} from "@/lib/location-pages";
import { withBasePath } from "@/lib/paths";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getTransferStaticSlugs().map((slug) => ({ slug }));
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
  if (page.slug !== slug) {
    permanentRedirect(`/transfers/${page.slug}/`);
  }

  const isLanding = Boolean(page.faqs?.length);
  const isFromAirport = page.direction === "from-airport";
  const hubHref = page.hubSlug ? `/locations/${page.hubSlug}/` : "/locations/";
  const quoteHeading = isFromAirport
    ? `${page.airport.shortName} → ${page.town.name} quote`
    : `${page.town.name} → ${page.airport.shortName} quote`;
  const whatsappMessage = isFromAirport
    ? `Hi, I'd like a taxi from ${page.airport.name} to ${page.town.name}.`
    : `Hi, I'd like a taxi from ${page.town.name} to ${page.airport.name}.`;
  const otherFromTown = TRANSFER_ROUTE_PAGES.filter(
    (route) => route.town.slug === page.town.slug && route.slug !== page.slug,
  );
  const breadcrumbItems = page.hubSlug
    ? [
        { name: "Home", path: "/" },
        { name: "Locations", path: "/locations/" },
        { name: page.town.name, path: hubHref },
        { name: page.airport.shortName, path: `/transfers/${page.slug}/` },
      ]
    : [
        { name: "Home", path: "/" },
        { name: page.airport.shortName, path: `/airports/${page.airport.slug}/` },
        {
          name: isFromAirport
            ? `${page.airport.shortName} to ${page.town.name}`
            : `${page.town.name} transfers`,
          path: `/transfers/${page.slug}/`,
        },
      ];
  const breadcrumb = getBreadcrumbJsonLd(breadcrumbItems);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.title}`,
    description: page.metaDescription,
    path: `/transfers/${page.slug}/`,
    areaServed: [page.town.name, page.airport.name, "Northern Ireland"],
  });
  const faqLd = page.faqs?.length ? getFaqPageJsonLd(page.faqs) : null;

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
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      ) : null}
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="relative h-56 overflow-hidden sm:h-72">
          <OptimizedHeroPicture
            baseName={page.airport.heroBase}
            alt={page.airport.heroAlt}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {isLanding && page.hubSlug ? (
            <LandingBreadcrumbs
              items={[
                { name: "Home", href: "/" },
                { name: "Locations", href: "/locations/" },
                { name: page.town.name, href: hubHref },
                { name: page.airport.shortName },
              ]}
            />
          ) : isLanding ? (
            <LandingBreadcrumbs
              items={[
                { name: "Home", href: "/" },
                { name: page.airport.shortName, href: `/airports/${page.airport.slug}/` },
                {
                  name: isFromAirport
                    ? `${page.airport.shortName} to ${page.town.name}`
                    : `${page.town.name} transfers`,
                },
              ]}
            />
          ) : (
            <Link
              href={`/airports/${page.airport.slug}/`}
              className="relative z-10 -mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-white/70 transition-colors hover:text-emerald"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {page.airport.shortName} transfers
            </Link>
          )}

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              {isFromAirport
                ? `${page.airport.shortName} · ${page.town.name}`
                : `${page.town.name} · ${page.airport.code}`}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{page.h1}</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">{page.intro}</p>
            {isLanding ? (
              <LandingCtaRow
                quoteLabel="Get a Live Quote"
                whatsappMessage={whatsappMessage}
              />
            ) : (
              <div className="mt-6">
                <LandingPageQuoteCta />
              </div>
            )}
          </header>
        </div>

        <LocationQuoteSection
          airportCode={page.airport.code}
          direction={page.direction}
          addressHint={page.town.addressHint}
          heading={quoteHeading}
        />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {isLanding ? (
            <>
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <h2 className="text-lg font-bold text-white">Journey information</h2>
                <p className="mt-4 text-sm leading-relaxed text-white/65">{page.journeyInfo}</p>
              </section>

              {isFromAirport ? (
                <>
                  <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-white">
                      {page.airport.shortName} to {page.town.name}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-white/65">{page.fromAirport}</p>
                  </section>

                  <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-white">
                      Travelling from {page.town.name} to {page.airport.shortName}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-white/65">{page.goingToAirport}</p>
                  </section>
                </>
              ) : (
                <>
                  <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-white">
                      Travelling from {page.town.name} to {page.airport.shortName}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-white/65">{page.goingToAirport}</p>
                  </section>

                  <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-white">
                      {page.airport.shortName} to {page.town.name}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-white/65">{page.fromAirport}</p>
                  </section>
                </>
              )}

              <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <h2 className="text-lg font-bold text-white">Why book with {SITE.name}?</h2>
                {page.whyBookIntro ? (
                  <p className="mt-4 text-sm leading-relaxed text-white/65">{page.whyBookIntro}</p>
                ) : null}
                <ul className="mt-4 space-y-4">
                  {LANDING_WHY_BOOK.map((item) => (
                    <li key={item.title}>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">{item.text}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {page.localAreasText ? (
                <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <h2 className="text-lg font-bold text-white">
                    Areas around {page.town.name} we cover
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-white/65">{page.localAreasText}</p>
                </section>
              ) : null}

              {page.faqs ? (
                <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <h2 className="text-lg font-bold text-white">Frequently asked questions</h2>
                  <dl className="mt-4 space-y-5">
                    {page.faqs.map((faq) => (
                      <div key={faq.question}>
                        <dt className="text-sm font-semibold text-white">{faq.question}</dt>
                        <dd className="mt-1.5 text-sm leading-relaxed text-white/65">{faq.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </>
          ) : (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
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
                Get your fixed price based on your journey. {page.airport.durationNote}
              </p>
            </section>
          )}

          {otherFromTown.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-white">
                {isFromAirport
                  ? `Other ${page.town.name} airport transfers`
                  : `Other airports from ${page.town.name}`}
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {otherFromTown.map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/transfers/${route.slug}/`}
                      className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75 transition-colors hover:border-emerald/40 hover:text-emerald"
                    >
                      {route.direction === "from-airport"
                        ? `${route.airport.shortName} to ${route.town.name}`
                        : `${page.town.name} to ${route.airport.name}`}
                    </Link>
                  </li>
                ))}
              </ul>
              {page.hubSlug ? (
                <p className="mt-4 text-sm text-white/50">
                  Back to{" "}
                  <Link href={hubHref} className="text-emerald hover:text-emerald-light">
                    {page.town.name} airport taxis
                  </Link>
                  {" · "}
                  <Link
                    href={`/airports/${page.airport.slug}/`}
                    className="text-emerald hover:text-emerald-light"
                  >
                    {page.airport.shortName} transfers
                  </Link>
                  {" · "}
                  <Link href="/airports/" className="text-emerald hover:text-emerald-light">
                    All airport transfers
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}

          {page.slug === "belfast-to-dublin" ? (
            <>
              <p className="mt-8 text-sm leading-relaxed text-white/65">
                Landing at Dublin Airport and travelling to Belfast? Use{" "}
                <Link
                  href="/transfers/dublin-airport-to-belfast/"
                  className="text-emerald hover:text-emerald-light"
                >
                  Dublin Airport to Belfast taxi
                </Link>
                .
              </p>
              <EmergeDiscoveryPromo description="Flying into Dublin for EMERGE? Pre-book your airport, hotel or return transfer for 29–30 August 2026." />
            </>
          ) : null}

          {isLanding ? (
            <section className="mt-8 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 text-center sm:px-10">
              <h2 className="text-lg font-bold text-white">
                {isFromAirport
                  ? `Get your ${page.airport.shortName} to ${page.town.name} transfer quote`
                  : `Get your ${page.town.name} transfer quote`}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75">
                {isFromAirport
                  ? `${page.airport.shortName} is already selected as the pickup. Enter your ${page.town.name} address to see the current fixed price, or message us on WhatsApp.`
                  : `${page.airport.shortName} is already selected in the quote box. Enter your ${page.town.name} address to see the current fixed price, or message us on WhatsApp.`}
              </p>
              <div className="flex justify-center">
                <LandingCtaRow
                  quoteLabel="Get a Live Quote"
                  whatsappMessage={whatsappMessage}
                />
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

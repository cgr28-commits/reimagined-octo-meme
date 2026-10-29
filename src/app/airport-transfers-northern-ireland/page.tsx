import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { LandingPageStickyQuoteCta } from "@/components/LandingPageQuoteCta";
import SectionHeading from "@/components/SectionHeading";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import { AIRPORT_PAGES, TOWN_HUB_PAGES } from "@/lib/location-pages";
import {
  NI_TRANSFERS_AIRPORT_NOTES,
  NI_TRANSFERS_DESCRIPTION,
  NI_TRANSFERS_FAQS,
  NI_TRANSFERS_H1,
  NI_TRANSFERS_INCLUDED,
  NI_TRANSFERS_INTRO,
  NI_TRANSFERS_PATH,
  NI_TRANSFERS_SEO_TITLE,
} from "@/lib/northern-ireland-airport-transfers-content";

export const metadata: Metadata = {
  title: NI_TRANSFERS_SEO_TITLE,
  description: NI_TRANSFERS_DESCRIPTION,
  alternates: { canonical: NI_TRANSFERS_PATH },
};

export default function NorthernIrelandAirportTransfersPage() {
  const towns = [...TOWN_HUB_PAGES].sort((a, b) => a.town.name.localeCompare(b.town.name));
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: NI_TRANSFERS_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Airport transfers in Northern Ireland",
      serviceType: "Airport transfer",
      provider: { "@type": "LocalBusiness", name: SITE.name, url: SITE.url, telephone: SITE.landline },
      areaServed: { "@type": "AdministrativeArea", name: "Northern Ireland" },
      url: `${SITE.url}${NI_TRANSFERS_PATH}`,
    },
  ];

  return (
    <>
      {schema.map((item) => (
        <script
          key={item["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }}
        />
      ))}
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS}>
        <div className="relative overflow-hidden">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                eyebrow="All six counties"
                title={NI_TRANSFERS_H1}
                navId="ni-airport-transfers"
                description={NI_TRANSFERS_INTRO}
              />
            </div>
          </div>
        </div>

        <LocationQuoteSection
          showStickyQuote={false}
          description="Enter your full pickup address and airport for an instant fixed price."
        />

        <div className="relative overflow-hidden">
          <div className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <section>
              <h2 className="text-xl font-bold text-white sm:text-2xl">Choose your airport</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {AIRPORT_PAGES.map((airport) => (
                  <Link
                    key={airport.code}
                    href={`/airports/${airport.slug}/`}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald/50"
                  >
                    <h3 className="text-lg font-semibold text-white">{airport.shortName} taxi transfers</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">
                      {NI_TRANSFERS_AIRPORT_NOTES[airport.code]}
                    </p>
                    <span className="mt-3 inline-block text-sm font-semibold text-emerald">{airport.name} →</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="text-xl font-bold text-white sm:text-2xl">Airport taxis by town</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
                Pick your town for a short guide to each airport from there. Not listed? We still cover you —
                enter your full address in the quote box.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {towns.map((hub) => (
                  <li key={hub.slug}>
                    <Link
                      href={`/locations/${hub.slug}/`}
                      className="block rounded-xl border border-white/10 bg-navy-light/50 px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:border-emerald/50 hover:text-white"
                    >
                      {hub.town.name} airport taxis
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-white/60">
                Arriving by train or coach? See{" "}
                <Link href="/belfast-grand-central-station-taxi/" className="text-emerald underline underline-offset-4">
                  Belfast Grand Central Station taxis
                </Link>
                . Flying from Dublin? See{" "}
                <Link href="/transfers/belfast-to-dublin-airport/" className="text-emerald underline underline-offset-4">
                  Belfast to Dublin Airport
                </Link>
                .
              </p>
            </section>

            <section className="mt-16">
              <h2 className="text-xl font-bold text-white sm:text-2xl">What&apos;s included</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {NI_TRANSFERS_INCLUDED.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="text-xl font-bold text-white sm:text-2xl">Northern Ireland airport transfer FAQs</h2>
              <div className="mt-6 space-y-4">
                {NI_TRANSFERS_FAQS.map((faq) => (
                  <details key={faq.question} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <summary className="cursor-pointer font-semibold text-white">{faq.question}</summary>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
        <LandingPageStickyQuoteCta />
      </main>
      <Footer />
    </>
  );
}

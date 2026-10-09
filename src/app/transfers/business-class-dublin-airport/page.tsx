import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingCtaRow from "@/components/LandingCtaRow";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import {
  BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS,
  BUSINESS_CLASS_DUBLIN_FAQS,
  BUSINESS_CLASS_DUBLIN_H1,
  BUSINESS_CLASS_DUBLIN_PATH,
  BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS,
  BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
  BUSINESS_CLASS_DUBLIN_SEO_TITLE,
  BUSINESS_CLASS_DUBLIN_WHATSAPP,
} from "@/lib/business-class-dublin-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `${BUSINESS_CLASS_DUBLIN_SEO_TITLE} | ${SITE.name}`,
  description: BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
  alternates: { canonical: BUSINESS_CLASS_DUBLIN_PATH },
  openGraph: {
    title: `${BUSINESS_CLASS_DUBLIN_SEO_TITLE} | ${SITE.name}`,
    description: BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
    url: BUSINESS_CLASS_DUBLIN_PATH,
  },
};

export default function BusinessClassDublinAirportPage() {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Dublin Airport", path: "/airports/dublin/" },
    { name: BUSINESS_CLASS_DUBLIN_H1, path: BUSINESS_CLASS_DUBLIN_PATH },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${BUSINESS_CLASS_DUBLIN_H1}`,
    description: BUSINESS_CLASS_DUBLIN_SEO_DESCRIPTION,
    path: BUSINESS_CLASS_DUBLIN_PATH,
    areaServed: ["Dublin Airport", "Belfast", "Northern Ireland"],
    serviceType: "Airport Transfer",
  });
  const faqLd = getFaqPageJsonLd(BUSINESS_CLASS_DUBLIN_FAQS);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS}>
        <LandingHeroMedia baseName="dublin-airport" alt="Dublin Airport terminal" />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Dublin Airport", href: "/airports/dublin/" },
              { name: "Business Class" },
            ]}
          />

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Dublin Airport · Vehicle upgrade
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{BUSINESS_CLASS_DUBLIN_H1}</h1>
            <p className="mt-6 text-lg leading-relaxed text-white/70">
              Business Class is a vehicle you choose in the normal quote for a transfer between
              Belfast, the rest of Northern Ireland, and Dublin Airport. It is not a separate
              chauffeur service. Enter the journey as usual, then select Business Class yourself
              under Vehicle options. The quote confirms the fixed fare before you book.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              The quote starts with Dublin Airport as the destination. Choose From an Airport if
              you are being collected there. Business Class is not selected for you.
            </p>
            <LandingCtaRow whatsappMessage={BUSINESS_CLASS_DUBLIN_WHATSAPP} />
          </header>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Passengers and luggage</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Business Class carries 1–4 passengers and up to 2 large suitcases. If you have 3 or
              4 large suitcases, select Estate instead. The quote shows which vehicles fit the
              passengers and luggage you enter, and it does not choose Business Class for you.
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Dublin Airport pickups</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              When Dublin Airport is the pickup, Business Class includes:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/65">
              {BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Dublin Airport drop-offs</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              When you are travelling to Dublin Airport, Business Class includes:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/65">
              {BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Meet &amp; Greet is not included on a drop-off.
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Belfast, Northern Ireland and Dublin Airport</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              The route is the same cross-border transfer already quoted on this site. Dublin
              tolls and terminal access stay inside the fixed fare, as they do for the other
              vehicles. Business Class changes the vehicle and, on an airport pickup, the meeting
              service. It does not change how the price is calculated.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              <Link
                href="/transfers/belfast-to-dublin-airport/"
                className="text-emerald hover:text-emerald-light"
              >
                Belfast to Dublin Airport
              </Link>
              {" and "}
              <Link
                href="/transfers/dublin-airport-to-belfast/"
                className="text-emerald hover:text-emerald-light"
              >
                Dublin Airport to Belfast
              </Link>
              {" use this quote. The "}
              <Link href="/airports/dublin/" className="text-emerald hover:text-emerald-light">
                Dublin Airport transfers
              </Link>
              {" guide covers the wider route."}
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Frequently asked questions</h2>
            <dl className="mt-4 space-y-5">
              {BUSINESS_CLASS_DUBLIN_FAQS.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-sm font-semibold text-white">{faq.question}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-white/65">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <LocationQuoteSection
          airportCode="DUB"
          direction="to-airport"
          heading="Quote a Dublin Airport transfer"
        />
      </main>
      <Footer />
    </>
  );
}

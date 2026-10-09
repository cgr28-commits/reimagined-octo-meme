import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
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

const lightCardClass =
  "rounded-2xl border border-[#d7e0ec] bg-white px-4 py-4 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.16)] sm:px-5 sm:py-5";

function InclusionList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-snug text-[#1a2a3d]">
          <svg
            viewBox="0 0 16 16"
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald"
            fill="none"
            aria-hidden
          >
            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M4.6 8.15 6.7 10.2 11.4 5.7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

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
      <style>{`
        @media (max-width: 767px) {
          .business-class-dublin [data-landing-hero] { height: 8rem; }
          .business-class-dublin [data-landing-hero] img { object-position: center 42%; }
        }
      `}</style>
      <main className={`${LANDING_PAGE_MAIN_CLASS} business-class-dublin`}>
        <LandingHeroMedia baseName="business-class-dublin" alt="Dublin Airport terminal at dusk" />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Dublin Airport", href: "/airports/dublin/" },
              { name: "Business Class" },
            ]}
          />

          <header className="mt-5">
            <p className="text-sm font-semibold text-emerald">Extra comfort for your journey.</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl">
              {BUSINESS_CLASS_DUBLIN_H1}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">
              Enjoy a more comfortable Dublin Airport transfer with luggage assistance, complimentary
              bottled water and a fixed fare confirmed before booking. Dublin Airport pickups also
              include Meet &amp; Greet inside arrivals.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-6 sm:gap-3">
              <LandingPageQuoteCta className="inline-flex min-h-11 items-center rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 sm:px-6 sm:py-3" />
              <a
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(BUSINESS_CLASS_DUBLIN_WHATSAPP)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 sm:px-6 sm:py-3"
              >
                <span className="sm:hidden">WhatsApp</span>
                <span className="hidden sm:inline">WhatsApp @{SITE.whatsappUsername}</span>
              </a>
            </div>
          </header>

          <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
            <div className="grid gap-8 sm:grid-cols-2">
              <section className={lightCardClass}>
                <h2 className="text-lg font-bold text-navy">Dublin Airport pickups</h2>
                <InclusionList items={BUSINESS_CLASS_DUBLIN_PICKUP_INCLUSIONS} />
              </section>

              <section className={lightCardClass}>
                <h2 className="text-lg font-bold text-navy">Dublin Airport drop-offs</h2>
                <InclusionList items={BUSINESS_CLASS_DUBLIN_DROPOFF_INCLUSIONS} />
                <p className="mt-3 text-sm leading-snug text-[#1a2a3d]">
                  Meet &amp; Greet is not included on a drop-off.
                </p>
              </section>
            </div>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Passengers and luggage</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#1a2a3d]">
                Business Class carries 1–4 passengers and up to 2 large suitcases. If you have 3 or
                4 large suitcases, select Estate instead.
              </p>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">How to book Business Class</h2>
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-[#1a2a3d]">
                <li className="flex gap-2.5">
                  <span className="font-semibold text-emerald-dark">1.</span>
                  <span>
                    The quote starts with Dublin Airport as the destination. Choose From an Airport
                    if you are being collected there.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-semibold text-emerald-dark">2.</span>
                  <span>
                    Enter the journey as usual, then select Business Class yourself under Vehicle
                    options.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-semibold text-emerald-dark">3.</span>
                  <span>
                    Business Class is not selected for you. It is not a separate chauffeur service.
                  </span>
                </li>
              </ol>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Belfast, Northern Ireland and Dublin Airport</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#1a2a3d]">
                Dublin tolls and terminal access stay inside the fixed fare. Business Class does not
                change how the price is calculated.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#1a2a3d]">
                <Link
                  href="/transfers/belfast-to-dublin-airport/"
                  className="font-semibold text-navy underline decoration-emerald decoration-2 underline-offset-2"
                >
                  Belfast to Dublin Airport
                </Link>
                {" and "}
                <Link
                  href="/transfers/dublin-airport-to-belfast/"
                  className="font-semibold text-navy underline decoration-emerald decoration-2 underline-offset-2"
                >
                  Dublin Airport to Belfast
                </Link>
                {" use this quote. The "}
                <Link
                  href="/airports/dublin/"
                  className="font-semibold text-navy underline decoration-emerald decoration-2 underline-offset-2"
                >
                  Dublin Airport transfers
                </Link>
                {" guide covers the wider route."}
              </p>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Frequently asked questions</h2>
              <dl className="mt-3 space-y-4">
                {BUSINESS_CLASS_DUBLIN_FAQS.map((faq) => (
                  <div key={faq.question}>
                    <dt className="text-sm font-semibold text-navy">{faq.question}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#1a2a3d]">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>

        <LocationQuoteSection
          airportCode="DUB"
          direction="to-airport"
          heading="Quote a Dublin Airport transfer"
          showStickyQuote={false}
        />
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import VitoVehiclePlaceholder from "@/components/VitoVehiclePlaceholder";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import type { VitoPageContent } from "@/lib/vito-group-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const cardClass =
  "rounded-2xl border border-[#d7e0ec] bg-white px-4 py-4 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.16)] sm:px-5 sm:py-5";

export default function VitoGroupLanding({ page }: { page: VitoPageContent }) {
  const crumbs = [
    { name: "Home", path: "/" },
    ...(page.breadcrumbParent
      ? [{ name: page.breadcrumbParent.name, path: page.breadcrumbParent.href }]
      : []),
    { name: page.h1, path: page.path },
  ];
  const breadcrumb = getBreadcrumbJsonLd(crumbs);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${page.h1}`,
    description: page.description,
    path: page.path,
    areaServed: [...page.areaServed],
    serviceType: page.serviceType,
  });
  const faqLd = getFaqPageJsonLd(page.faqs);

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
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              ...(page.breadcrumbParent
                ? [{ name: page.breadcrumbParent.name, href: page.breadcrumbParent.href }]
                : []),
              { name: page.h1 },
            ]}
          />

          <header className="mt-5">
            <p className="text-sm font-semibold text-emerald">{page.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl">{page.h1}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">{page.intro}</p>
            <div className="mt-4 sm:mt-6">
              <LandingPageQuoteCta />
            </div>
          </header>

          <div className="mt-8">
            <VitoVehiclePlaceholder />
          </div>

          <div className="mt-8 space-y-6 sm:mt-10 sm:space-y-8">
            {page.sections.map((section) => (
              <section key={section.heading} className={cardClass}>
                <h2 className="text-lg font-bold text-navy">{section.heading}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-relaxed text-[#1a2a3d]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section className={cardClass}>
              <h2 className="text-lg font-bold text-navy">Related transfers</h2>
              <ul className="mt-3 space-y-2">
                {page.related.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-semibold text-navy underline decoration-emerald decoration-2 underline-offset-2"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold text-navy">Frequently asked questions</h2>
              <dl className="mt-3 space-y-4">
                {page.faqs.map((faq) => (
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
          airportCode={page.airportCode}
          direction={page.direction}
          heading={page.quoteHeading}
          preferMinibus
        />
      </main>
      <Footer />
    </>
  );
}

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
import { withBasePath } from "@/lib/paths";
import {
  GOLF_BUSINESS_CLASS_POINTS,
  GOLF_COURSES,
  GOLF_FAQS,
  GOLF_GROUP_POINTS,
  GOLF_HERO_CREDIT,
  GOLF_TRANSFERS_H1,
  GOLF_TRANSFERS_PATH,
  GOLF_TRANSFERS_SEO_DESCRIPTION,
  GOLF_TRANSFERS_SEO_TITLE,
  GOLF_TRANSFERS_WHATSAPP,
} from "@/lib/golf-transfers-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const lightCardClass =
  "rounded-2xl border border-[#d7e0ec] bg-white px-4 py-4 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.16)] sm:px-5 sm:py-5";

function TickList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-snug text-[#1a2a3d]">
          <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
            <path d="M4.6 8.15 6.7 10.2 11.4 5.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export const metadata: Metadata = {
  title: { absolute: GOLF_TRANSFERS_SEO_TITLE },
  description: GOLF_TRANSFERS_SEO_DESCRIPTION,
  alternates: { canonical: GOLF_TRANSFERS_PATH },
  openGraph: {
    title: GOLF_TRANSFERS_SEO_TITLE,
    description: GOLF_TRANSFERS_SEO_DESCRIPTION,
    url: GOLF_TRANSFERS_PATH,
    images: [{ url: "/og-image-square.png", alt: SITE.name }],
  },
};

export default function GolfTransfersPage() {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: GOLF_TRANSFERS_H1, path: GOLF_TRANSFERS_PATH },
  ]);
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${GOLF_TRANSFERS_H1}`,
    description: GOLF_TRANSFERS_SEO_DESCRIPTION,
    path: GOLF_TRANSFERS_PATH,
    areaServed: ["Portrush", "Portstewart", "Castlerock", "Newcastle, County Down", "Northern Ireland"],
    serviceType: "Golf Transfer",
  });
  const faqLd = getFaqPageJsonLd(GOLF_FAQS);
  const whatsappHref = `https://wa.me/${SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp}?text=${encodeURIComponent(GOLF_TRANSFERS_WHATSAPP)}`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Header />
      <style>{`
        .golf-transfers [data-landing-hero] img { object-position: 30% 42%; }
      `}</style>
      <main className={`${LANDING_PAGE_MAIN_CLASS} golf-transfers`}>
        <LandingHeroMedia baseName="royal-portrush" alt="Aerial view of the Royal Portrush links beside Whiterocks beach on the Causeway Coast" />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="mt-2 text-right text-[11px] text-white/45">
            <a href={GOLF_HERO_CREDIT.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              {GOLF_HERO_CREDIT.text}
            </a>
          </p>

          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Golf Transfers" }]} />

          <header className="mt-5">
            <p className="text-sm font-semibold text-emerald">Royal Portrush · Portstewart · Castlerock · Royal County Down</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl">{GOLF_TRANSFERS_H1}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">
              Private, pre-booked transfers from the airport to your hotel and the first tee. Travel in our Business
              Class executive car or bring the whole group in a 7-seater — with a fixed fare agreed before you book.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-6 sm:gap-3">
              <LandingPageQuoteCta className="inline-flex min-h-11 items-center rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 sm:px-6 sm:py-3" />
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 sm:px-6 sm:py-3"
              >
                Plan a golf trip on WhatsApp
              </a>
            </div>
          </header>

          <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
            <section className={`${lightCardClass} overflow-hidden`}>
              <div className="grid items-center gap-4 sm:grid-cols-[1fr_1.1fr]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald">Business Class</p>
                  <h2 className="mt-1 text-xl font-bold text-navy">Arrive at the course in style</h2>
                  <TickList items={GOLF_BUSINESS_CLASS_POINTS} />
                  <p className="mt-3 text-sm leading-relaxed text-[#1a2a3d]">
                    Choose Business Class under Vehicle options when you get your quote.{" "}
                    <Link
                      href="/transfers/business-class-dublin-airport/"
                      className="font-semibold text-navy underline decoration-emerald decoration-2 underline-offset-2"
                    >
                      More about Business Class
                    </Link>
                  </p>
                </div>
                <img
                  src={withBasePath("/images/vehicles/quote-business-class.webp")}
                  alt="My Airport Taxi NI Business Class executive car"
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full rounded-xl object-contain"
                />
              </div>
            </section>

            <section className={`${lightCardClass} overflow-hidden`}>
              <div className="grid items-center gap-4 sm:grid-cols-[1.1fr_1fr]">
                <img
                  src={withBasePath("/images/vehicles/quote-minibus.webp")}
                  alt="My Airport Taxi NI 7-seater for golf groups"
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="order-2 h-auto w-full rounded-xl object-contain sm:order-1"
                />
                <div className="order-1 sm:order-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald">Golf groups</p>
                  <h2 className="mt-1 text-xl font-bold text-navy">Travelling as a four-ball or more?</h2>
                  <TickList items={GOLF_GROUP_POINTS} />
                </div>
              </div>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Courses we drive to</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {GOLF_COURSES.map((course) => (
                  <li key={course.name} className="rounded-xl border border-[#e3e9f1] bg-[#f7f9fb] p-3">
                    <p className="text-sm font-bold text-navy">{course.name}</p>
                    <p className="text-xs font-semibold text-emerald-dark">{course.area}</p>
                    <p className="mt-1 text-sm leading-snug text-[#1a2a3d]">{course.note}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-[#1a2a3d]">
                Playing somewhere else in Northern Ireland? We cover the whole country — get a quote with your course
                as the destination.
              </p>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Golf bags</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#1a2a3d]">
                Golf bags take more room than suitcases. Add the number of golf bags to your booking notes, or send it
                to us on WhatsApp, and we will confirm the right vehicle before your trip.
              </p>
            </section>

            <section className={lightCardClass}>
              <h2 className="text-lg font-bold text-navy">Frequently asked questions</h2>
              <dl className="mt-3 space-y-4">
                {GOLF_FAQS.map((faq) => (
                  <div key={faq.question}>
                    <dt className="text-sm font-semibold text-navy">{faq.question}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#1a2a3d]">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>

        <LocationQuoteSection heading="Quote your golf transfer" showStickyQuote={false} />
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import { DUBLIN_CITY_TRANSFER_PAGE as page, DUBLIN_CITY_TRANSFER_PATH as path } from "@/lib/dublin-city-transfer-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const cardClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7";

const hero = {
  base: "dublin-beckett-bridge",
  alt: "Samuel Beckett Bridge over the River Liffey in Dublin city",
  author: "Wikimedia Commons contributors",
  source: "https://commons.wikimedia.org/wiki/File:Dublin_-_Samuel_Beckett_Bridge.jpg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};

export default function DublinCityTransferLanding() {
  const schemas = [
    getBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Long-distance transfers", path: "/long-distance-transfers/" },
      { name: page.title, path },
    ]),
    getServiceAreaJsonLd({
      name: page.title,
      description: page.description,
      path,
      areaServed: ["Belfast", "Dublin", "Northern Ireland", "County Dublin"],
      serviceType: "Private Long-Distance Transfer",
    }),
    getFaqPageJsonLd(page.faqs),
  ];
  const whatsappNumber = SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp;
  const whatsappText = encodeURIComponent("Hello, I would like a quote for a taxi between Belfast and Dublin city.");

  return (
    <>
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}
      <Header />
      <style>{`
        .dublin-city-transfer-page [data-landing-hero] { height: clamp(18rem, 34vw, 30rem); }
        .dublin-city-transfer-page [data-landing-hero] > div { background: linear-gradient(to top, rgba(7,28,56,.7), rgba(7,28,56,.05) 60%); }
        .dublin-city-transfer-page [data-landing-hero] img { object-position: center 55%; }
        @media (max-width: 767px) {
          .dublin-city-transfer-page [data-landing-hero] { height: 11rem; }
          body:has(.dublin-city-transfer-page) [data-sticky-quote-bar] { display: none; }
        }
      `}</style>
      <main className={`${LANDING_PAGE_MAIN_CLASS} dublin-city-transfer-page`}>
        <LandingHeroMedia baseName={hero.base} alt={hero.alt} />
        <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Long-distance transfers", href: "/long-distance-transfers/" },
              { name: page.h1 },
            ]}
          />
          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald">{page.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">{page.h1}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">{page.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LandingPageQuoteCta label="Get a Fixed Quote" />
              <a
                className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
                href={`https://wa.me/${whatsappNumber}?text=${whatsappText}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Message us on WhatsApp
              </a>
            </div>
            <ul className="mt-7 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
              {page.heroHighlights.map((item) => (
                <li key={item} className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3">{item}</li>
              ))}
            </ul>
          </header>

          <div className="mt-10 space-y-6 sm:mt-14">
            <section className={cardClass}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{page.journeyTitle}</h2>
              <p className="mt-4 leading-relaxed text-white/75">{page.journeyText}</p>
            </section>
            <div className="grid gap-6 md:grid-cols-2">
              <section className={cardClass}>
                <h2 className="text-xl font-bold text-white">{page.belfastToDublinTitle}</h2>
                <p className="mt-4 leading-relaxed text-white/75">{page.belfastToDublinText}</p>
              </section>
              <section className={cardClass}>
                <h2 className="text-xl font-bold text-white">{page.dublinToBelfastTitle}</h2>
                <p className="mt-4 leading-relaxed text-white/75">{page.dublinToBelfastText}</p>
              </section>
            </div>
            <section className={cardClass}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{page.timeTitle}</h2>
              <p className="mt-4 leading-relaxed text-white/75">{page.timeText}</p>
            </section>
            <section className="rounded-2xl border border-[#d7e0ec] bg-white p-5 text-navy sm:p-7">
              <h2 className="text-xl font-bold sm:text-2xl">Flying in or out of Dublin Airport?</h2>
              <p className="mt-4 leading-relaxed">
                This page is for Dublin city addresses. For flights, use our Dublin Airport pages: your driver monitors the flight and airport pickups include up to 60 minutes&apos; waiting.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-emerald-dark">
                <Link href="/transfers/belfast-to-dublin-airport/" className="underline underline-offset-4">Belfast to Dublin Airport</Link>
                <Link href="/transfers/dublin-airport-to-belfast/" className="underline underline-offset-4">Dublin Airport to Belfast</Link>
              </div>
            </section>
            <section className="rounded-2xl border border-emerald/30 bg-emerald/10 p-5 sm:p-7">
              <h2 className="text-xl font-bold text-white sm:text-2xl">A clear fixed price before you book</h2>
              <p className="mt-4 leading-relaxed text-white/80">{page.quoteText}</p>
              <p className="mt-3 leading-relaxed text-white/75">Cancel up to 24 hours before your pickup for a full refund.</p>
              <div className="mt-5"><LandingPageQuoteCta label="Get a Fixed Quote" /></div>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-white">Frequently asked questions</h2>
              <div className="mt-5 space-y-3">
                {page.faqs.map((faq) => (
                  <details key={faq.question} className={cardClass}>
                    <summary className="cursor-pointer text-base font-semibold text-white">{faq.question}</summary>
                    <p className="mt-4 leading-relaxed text-white/75">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
            <nav aria-label="Related transfers" className={cardClass}>
              <h2 className="text-lg font-bold text-white">Related journeys</h2>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-emerald">
                <Link className="underline underline-offset-4" href="/transfers/belfast-to-dublin-airport/">Belfast to Dublin Airport</Link>
                <Link className="underline underline-offset-4" href="/transfers/dublin-airport-to-belfast/">Dublin Airport to Belfast</Link>
                <Link className="underline underline-offset-4" href="/long-distance-transfers/">All long-distance transfers</Link>
              </div>
            </nav>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-white/45">
            Photo: <a href={hero.source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{hero.author}</a>{" · "}
            <a href={hero.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{hero.license}</a>. Resized and cropped for display.
          </p>
        </div>
        <LocationQuoteSection heading="Get your Belfast–Dublin city fixed quote" eyebrow="Your journey" description={page.quoteText} />
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import HeroSlideshow from "@/components/HeroSlideshow";
import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";
import { SITE } from "@/lib/data";
import { firstSentence, LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS } from "@/lib/landing-page-layout";
import { DUBLIN_CITY_TRANSFER_PAGE, DUBLIN_CITY_TRANSFER_PATH } from "@/lib/dublin-city-transfer-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const CHRISTMAS_PATH = "/transfers/belfast-dublin-christmas-taxi/";

const cardClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7";

const hero = {
  base: "dublin-beckett-bridge",
  alt: "Samuel Beckett Bridge over the River Liffey in Dublin city",
  author: "Wikimedia Commons contributors",
  source: "https://commons.wikimedia.org/wiki/File:Dublin_-_Samuel_Beckett_Bridge.jpg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};

type LandingFaq = { readonly question: string; readonly answer: string };

/**
 * A photo with its credit. Freely licensed photos carry the source and licence their
 * licence requires; the business's own images leave those out.
 */
export type CreditedPhoto = {
  readonly base: string;
  readonly alt: string;
  readonly caption?: string;
  readonly author: string;
  readonly source?: string;
  readonly license?: string;
  readonly licenseUrl?: string;
};

export type BelfastDublinLandingContent = {
  readonly title: string;
  readonly h1: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly intro: string;
  readonly heroHighlights: readonly string[];
  readonly journeyTitle: string;
  readonly journeyText: string;
  readonly belfastToDublinTitle: string;
  readonly belfastToDublinText: string;
  readonly dublinToBelfastTitle: string;
  readonly dublinToBelfastText: string;
  readonly timeTitle: string;
  readonly timeText: string;
  readonly quoteText: string;
  readonly faqs: readonly LandingFaq[];
  readonly quoteHeading?: string;
  readonly hero?: CreditedPhoto;
  readonly gallery?: readonly CreditedPhoto[];
  readonly galleryTitle?: string;
  readonly extraSections?: readonly { readonly title: string; readonly text: string }[];
  readonly whatsappMessage?: string;
};

type Props = { page?: BelfastDublinLandingContent; path?: string };

/** Belfast ⇄ Dublin city landing. Defaults to the Dublin city page; seasonal pages pass their own content. */
export default function DublinCityTransferLanding({
  page = DUBLIN_CITY_TRANSFER_PAGE,
  path = DUBLIN_CITY_TRANSFER_PATH,
}: Props = {}) {
  const heroImage: CreditedPhoto = page.hero ?? hero;
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
  const whatsappText = encodeURIComponent(
    page.whatsappMessage ?? "Hello, I would like a quote for a taxi between Belfast and Dublin city.",
  );

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
      <main className={`${LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS} dublin-city-transfer-page`}>
        {/* Quote tool first: the same quote hero as the homepage, with this page's heading. */}
        <HeroSlideshow heading={page.h1} intro={firstSentence(page.intro)} />
        <LandingHeroMedia baseName={heroImage.base} alt={heroImage.alt} />
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
            {page.gallery && page.gallery.length > 0 ? (
              <section aria-labelledby="landing-gallery-title">
                <h2 id="landing-gallery-title" className="text-xl font-bold text-white sm:text-2xl">
                  {page.galleryTitle ?? "Photos"}
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {page.gallery.map((photo) => (
                    <figure key={photo.base} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="relative aspect-video">
                        <OptimizedHeroPicture
                          baseName={photo.base}
                          alt={photo.alt}
                          widths={[960]}
                          width={960}
                          height={540}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      </div>
                      {photo.caption ? (
                        <figcaption className="px-4 py-3 text-sm text-white/75">{photo.caption}</figcaption>
                      ) : null}
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}
            <section className={cardClass}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{page.timeTitle}</h2>
              <p className="mt-4 leading-relaxed text-white/75">{page.timeText}</p>
            </section>
            {(page.extraSections ?? []).map((section) => (
              <section key={section.title} className={cardClass}>
                <h2 className="text-xl font-bold text-white sm:text-2xl">{section.title}</h2>
                <p className="mt-4 leading-relaxed text-white/75">{section.text}</p>
              </section>
            ))}
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
                {path !== CHRISTMAS_PATH ? (
                  <Link className="underline underline-offset-4" href={CHRISTMAS_PATH}>Christmas &amp; New Year trips Belfast ⇄ Dublin</Link>
                ) : null}
                {path !== DUBLIN_CITY_TRANSFER_PATH ? (
                  <Link className="underline underline-offset-4" href={DUBLIN_CITY_TRANSFER_PATH}>Belfast to Dublin city</Link>
                ) : null}
                <Link className="underline underline-offset-4" href="/transfers/business-class-dublin-airport/">Business Class to Dublin</Link>
                <Link className="underline underline-offset-4" href="/long-distance-transfers/">All long-distance transfers</Link>
              </div>
            </nav>
          </div>
          <div className="mt-8 space-y-1 text-xs leading-relaxed text-white/45">
            {[heroImage, ...(page.gallery ?? [])]
              .filter((photo) => photo.source && photo.license && photo.licenseUrl)
              .map((photo) => (
                <p key={photo.base}>
                  Photo{photo.caption ? ` (${photo.caption})` : ""}:{" "}
                  <a href={photo.source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{photo.author}</a>{" · "}
                  <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{photo.license}</a>. Resized and cropped for display.
                </p>
              ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import LandingHeroMedia from "@/components/LandingHeroMedia";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import LocationQuoteSection from "@/components/LocationQuoteSection";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import { CORK_TRANSFER_PAGES, type CorkTransferDirection } from "@/lib/cork-transfer-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const cardClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7";
export default function CorkTransferLanding({ direction }: { direction: CorkTransferDirection }) {
  const page = CORK_TRANSFER_PAGES[direction];
  const path = `/transfers/${direction}/`;
  const opposite = direction === "belfast-to-cork" ? "cork-to-belfast" : "belfast-to-cork";
  const schemas = [
    getBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Long-distance transfers", path: "/long-distance-transfers/" }, { name: page.title, path }]),
    getServiceAreaJsonLd({ name: page.title, description: page.description, path, areaServed: ["Belfast", "Cork", "Belfast International Airport", "George Best Belfast City Airport"], serviceType: "Private Long-Distance Transfer" }),
    getFaqPageJsonLd(page.faqs),
  ];
  return (
    <>
      {schemas.map((schema, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />)}
      <Header />
      <style>{`
        @media (max-width: 767px) {
          .cork-transfer-page [data-landing-hero] { height: 8rem; }
          body:has(.cork-transfer-page) [data-sticky-quote-bar] { display: none; }
        }
      `}</style>
      <main className={`${LANDING_PAGE_MAIN_CLASS} cork-transfer-page`}>
        <LandingHeroMedia baseName="titanic-belfast" alt="Titanic Belfast, a landmark on the Belfast side of your journey" />
        <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6 lg:px-8">
          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Long-distance transfers", href: "/long-distance-transfers/" }, { name: page.title }]} />
          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald">{page.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">{page.title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">{page.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LandingPageQuoteCta label="Get a Fixed Quote" />
              <a className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white" href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hello, I would like a quote for a " + direction.replaceAll("-", " ") + " transfer.")}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
            </div>
            <ul className="mt-7 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
              {["Private, door-to-door travel", "Price agreed before payment", "Cars and 7-seaters when available"].map(item => <li key={item} className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3">{item}</li>)}
            </ul>
          </header>
          <div className="mt-10 space-y-6 sm:mt-14">
            <section className={cardClass}><h2 className="text-xl font-bold text-white sm:text-2xl">{page.journeyTitle}</h2><p className="mt-4 leading-relaxed text-white/75">{page.journeyText}</p></section>
            <div className="grid gap-6 md:grid-cols-2">
              <section className={cardClass}><h2 className="text-xl font-bold text-white">{page.collectionTitle}</h2><p className="mt-4 leading-relaxed text-white/75">{page.collectionText}</p></section>
              <section className={cardClass}><h2 className="text-xl font-bold text-white">{page.destinationTitle}</h2><p className="mt-4 leading-relaxed text-white/75">{page.destinationText}</p></section>
            </div>
            <section className={cardClass}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">Allow time for a long cross-border journey</h2>
              <p className="mt-4 leading-relaxed text-white/75">Belfast and Cork are at opposite ends of a substantial road journey. Allow roughly five to six hours, depending on the exact addresses, traffic and any agreed stops. The usual motorway journey passes the Dublin area; your actual route and timing depend on conditions on the day.</p>
              <p className="mt-3 leading-relaxed text-white/75">Let us know about an appointment, onward connection or planned comfort stop before booking. Your pickup time should leave room for that plan, rather than relying on the shortest mapped driving time.</p>
            </section>
            <section className="rounded-2xl border border-[#d7e0ec] bg-white p-5 text-navy sm:p-7">
              <h2 className="text-xl font-bold sm:text-2xl">{page.airportTitle}</h2>
              <p className="mt-4 leading-relaxed">{page.airportText}</p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-emerald-dark"><Link href="/airports/belfast-international/" className="underline underline-offset-4">Belfast International guide</Link><Link href="/airports/belfast-city/" className="underline underline-offset-4">Belfast City Airport guide</Link></div>
            </section>
            <section className={cardClass}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">Match the vehicle to your party and baggage</h2>
              <p className="mt-4 leading-relaxed text-white/75">Enter every passenger and suitcase before selecting a vehicle. Saloon suits up to four passengers with up to two standard suitcases. Estate offers extra luggage space for a smaller party with more bags. For a larger group, choose a 7-Seater Minibus when the quote offers one. Availability and capacity restrictions still apply.</p>
              <p className="mt-3 leading-relaxed text-white/75">If you have oversized baggage or select 5+ suitcases, confirm the capacity with us before booking. Child or booster seats are requested subject to availability.</p>
            </section>
            <section className="rounded-2xl border border-emerald/30 bg-emerald/10 p-5 sm:p-7">
              <h2 className="text-xl font-bold text-white sm:text-2xl">A clear quote before you book</h2>
              <p className="mt-4 leading-relaxed text-white/80">{page.quoteText}</p>
              <p className="mt-3 leading-relaxed text-white/75">Have your travel date and time ready for the booking or request stage. A quote is not a confirmed reservation; complete the booking steps after the price and availability have been agreed.</p>
              <div className="mt-5"><LandingPageQuoteCta label="Get a Fixed Quote" /></div>
            </section>
            <section><h2 className="text-2xl font-bold text-white">Frequently asked questions</h2>
              <div className="mt-5 space-y-3">{page.faqs.map(faq => <details key={faq.question} className={cardClass}><summary className="cursor-pointer text-base font-semibold text-white">{faq.question}</summary><p className="mt-4 leading-relaxed text-white/75">{faq.answer}</p></details>)}</div>
            </section>
            <nav aria-label="Related transfers" className={cardClass}><h2 className="text-lg font-bold text-white">Plan the other direction</h2><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-emerald"><Link className="underline underline-offset-4" href={`/transfers/${opposite}/`}>{CORK_TRANSFER_PAGES[opposite].title}</Link><Link className="underline underline-offset-4" href="/long-distance-transfers/">All long-distance transfers</Link><Link className="underline underline-offset-4" href="/transfers/belfast-to-dublin-airport/">Belfast to Dublin Airport</Link></div></nav>
          </div>
        </div>
        <LocationQuoteSection heading="Get your Belfast–Cork fixed quote" eyebrow="Your journey" description={page.quoteText} />
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import HeroSlideshow from "@/components/HeroSlideshow";
import { SITE } from "@/lib/data";
import { firstSentence, LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS } from "@/lib/landing-page-layout";
import { DERRY_TRANSFER_PAGE as page } from "@/lib/derry-transfer-content";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";

const cardClass = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7";
const path = "/transfers/belfast-to-derry/";

export default function DerryTransferLanding() {
  const schemas = [
    getBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Long-distance transfers", path: "/long-distance-transfers/" }, { name: page.title, path }]),
    getServiceAreaJsonLd({ name: page.title, description: page.description, path, areaServed: ["Belfast", "Derry", "Londonderry"], serviceType: "Private Long-Distance Transfer" }),
    getFaqPageJsonLd([...page.faqs]),
  ];
  return (
    <>
      {schemas.map((schema, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />)}
      <Header />
      <style>{`@media (max-width: 767px) { body:has(.derry-transfer-page) [data-sticky-quote-bar] { display: none; } }`}</style>
      <main className={`${LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS} derry-transfer-page`}>
        {/* Quote tool first: the same quote hero as the homepage, with this page's heading. */}
        <HeroSlideshow heading={page.title} intro={firstSentence(page.intro)} />
        <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6 lg:px-8">
          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Long-distance transfers", href: "/long-distance-transfers/" }, { name: page.title }]} />
          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald">{page.eyebrow}</p>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">{page.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LandingPageQuoteCta label="Get a Fixed Quote" />
              <a className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white" href={`https://wa.me/${SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp}?text=${encodeURIComponent("Hello, I would like a quote for a taxi between Belfast and Derry.")}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
            </div>
            <ul className="mt-7 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
              {["Private, door-to-door travel", "Price agreed before payment", "Free cancellation up to 24 hours"].map(item => <li key={item} className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3">{item}</li>)}
            </ul>
          </header>
          <div className="mt-10 space-y-6 sm:mt-14">
            {page.sections.map(section => (
              <section key={section.title} className={cardClass}>
                <h2 className="text-xl font-bold text-white sm:text-2xl">{section.title}</h2>
                <p className="mt-4 leading-relaxed text-white/75">{section.text}</p>
              </section>
            ))}
            <section className="rounded-2xl border border-[#d7e0ec] bg-white p-5 text-navy sm:p-7">
              <h2 className="text-xl font-bold sm:text-2xl">{page.airportTitle}</h2>
              <p className="mt-4 leading-relaxed">{page.airportText}</p>
              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-emerald-dark">
                {page.airportLinks.map(link => <Link key={link.href} href={link.href} className="underline underline-offset-4">{link.label}</Link>)}
              </div>
            </section>
            <section className="rounded-2xl border border-emerald/30 bg-emerald/10 p-5 sm:p-7">
              <h2 className="text-xl font-bold text-white sm:text-2xl">A clear price before you book</h2>
              <p className="mt-4 leading-relaxed text-white/80">{page.quoteText}</p>
              <div className="mt-5"><LandingPageQuoteCta label="Get a Fixed Quote" /></div>
            </section>
            <section><h2 className="text-2xl font-bold text-white">Frequently asked questions</h2>
              <div className="mt-5 space-y-3">{page.faqs.map(faq => <details key={faq.question} className={cardClass}><summary className="cursor-pointer text-base font-semibold text-white">{faq.question}</summary><p className="mt-4 leading-relaxed text-white/75">{faq.answer}</p></details>)}</div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

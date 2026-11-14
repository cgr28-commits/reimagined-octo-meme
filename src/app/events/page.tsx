import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import BelfastEventsList from "@/components/BelfastEventsList";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import {
  BESPOKE_PUBLIC_PAGES_ENABLED,
  BUSINESS_CLASS_REQUEST_PATH,
  EVENTS_HUB_PATH,
  EVENT_TRANSFER_REQUEST_PATH,
} from "@/lib/bespoke-public";
import {
  EVENTS_HUB_H1,
  EVENTS_HUB_INTRO,
  EVENTS_HUB_SEO_DESCRIPTION,
  EVENTS_HUB_SEO_TITLE,
  EVENT_FAQS,
  EVENT_GROUP_NOTE,
  EVENT_STEPS,
} from "@/lib/belfast-events-content";
import { loadBuildTimeBelfastEvents } from "@/lib/belfast-events-snapshot";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";
import { BELFAST_VENUES } from "../../../shared/belfast-events";

export function generateMetadata(): Metadata {
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }
  return {
    title: { absolute: `${EVENTS_HUB_SEO_TITLE} | ${SITE.name}` },
    description: EVENTS_HUB_SEO_DESCRIPTION,
    alternates: { canonical: EVENTS_HUB_PATH },
    openGraph: { title: EVENTS_HUB_SEO_TITLE, description: EVENTS_HUB_SEO_DESCRIPTION, url: EVENTS_HUB_PATH, type: "website" },
  };
}

export default async function BelfastEventsHubPage() {
  // Public launch needs owner approval: 404 (and no sitemap entry) until then.
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) notFound();
  const initialEvents = await loadBuildTimeBelfastEvents();

  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: EVENTS_HUB_H1, path: EVENTS_HUB_PATH },
  ]);
  // Service + FAQ only. No Event markup: we provide transport, not the events or tickets.
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — ${EVENTS_HUB_H1}`,
    description: EVENTS_HUB_SEO_DESCRIPTION,
    path: EVENTS_HUB_PATH,
    areaServed: ["Belfast", ...BELFAST_VENUES.slice(0, 8).map((v) => v.name)],
    serviceType: "Private event transfer",
  });
  const faqLd = getFaqPageJsonLd(EVENT_FAQS);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS} data-belfast-events-hub>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Belfast events" }]} />

          <header className="mt-6 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Belfast events</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{EVENTS_HUB_H1}</h1>
            <p className="mt-5 text-lg leading-relaxed text-white/70">{EVENTS_HUB_INTRO}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={EVENT_TRANSFER_REQUEST_PATH} className="btn-primary inline-flex min-h-12 items-center rounded-full px-6 text-base font-bold">
                Request an event transfer
              </Link>
              <a
                href={`tel:${SITE.officeLandline}`}
                className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-6 text-sm font-semibold text-white/80 hover:border-emerald/40 hover:text-emerald"
              >
                Call {SITE.officeLandlineDisplay}
              </a>
            </div>
          </header>

          <section aria-labelledby="how-it-works" className="mt-12">
            <h2 id="how-it-works" className="text-xl font-bold text-white">How it works</h2>
            <ol className="mt-5 grid gap-4 md:grid-cols-3">
              {EVENT_STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald text-sm font-bold text-navy" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-base font-bold text-white">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="upcoming-events" className="mt-14">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="upcoming-events" className="text-xl font-bold text-white">Upcoming Belfast events</h2>
              <p className="text-sm text-white/55">Concerts, sport, theatre, comedy, festivals and exhibitions.</p>
            </div>
            <div className="mt-5">
              <BelfastEventsList initialEvents={initialEvents} />
            </div>
            <p className="mt-5 text-sm text-white/55">
              Not listed?{" "}
              <Link href={EVENT_TRANSFER_REQUEST_PATH} className="font-semibold text-emerald underline">
                Request a transfer for any Belfast event
              </Link>
              . We don&apos;t sell tickets; please buy them from the official seller.
            </p>
          </section>

          <div className="mt-14 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="groups" className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 id="groups" className="text-lg font-bold text-white">{EVENT_GROUP_NOTE.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{EVENT_GROUP_NOTE.body}</p>
            </section>
            <section aria-labelledby="business-class" className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 id="business-class" className="text-lg font-bold text-white">Business Class for your night out</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                For up to 3 passengers who&apos;d like our Business Class car, send a bespoke request and we&apos;ll quote personally.
              </p>
              <Link href={BUSINESS_CLASS_REQUEST_PATH} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline">
                Request Business Class
              </Link>
            </section>
          </div>

          <section aria-labelledby="venues" className="mt-14">
            <h2 id="venues" className="text-xl font-bold text-white">Belfast venues we cover</h2>
            <ul className="mt-5 grid gap-x-6 gap-y-2 text-sm text-white/70 sm:grid-cols-2 lg:grid-cols-3">
              {BELFAST_VENUES.map((v) => (
                <li key={v.id} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" aria-hidden="true" />
                  <span>
                    <span className="font-semibold text-white">{v.name}</span>
                    <span className="block text-white/55">{v.area}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="faqs" className="mt-14 max-w-3xl">
            <h2 id="faqs" className="text-xl font-bold text-white">Event transfer questions</h2>
            <dl className="mt-6 space-y-5">
              {EVENT_FAQS.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-base font-semibold text-white">{faq.question}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-white/65">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-14 rounded-2xl border border-emerald/30 bg-emerald/10 px-6 py-8 sm:px-10">
            <h2 className="text-lg font-bold text-white">Flying instead?</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Airport transfers have instant fixed prices, including our Business Class option.{" "}
              <Link href="/#quote" className="font-semibold text-emerald underline">
                Get an instant airport quote
              </Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

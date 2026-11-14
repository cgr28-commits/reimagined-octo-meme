import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import EventTransferRequestClient from "@/components/EventTransferRequestClient";
import { SITE } from "@/lib/data";
import { LANDING_PAGE_MAIN_CLASS } from "@/lib/landing-page-layout";
import { BESPOKE_PUBLIC_PAGES_ENABLED, EVENTS_HUB_PATH, EVENT_TRANSFER_REQUEST_PATH } from "@/lib/bespoke-public";
import { EVENT_GROUP_NOTE, EVENT_REQUEST_SEO_DESCRIPTION, EVENT_REQUEST_SEO_TITLE } from "@/lib/belfast-events-content";
import { loadBuildTimeBelfastEvents } from "@/lib/belfast-events-snapshot";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";

export function generateMetadata(): Metadata {
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) return { title: "Page not found", robots: { index: false, follow: false } };
  return {
    title: { absolute: `${EVENT_REQUEST_SEO_TITLE} | ${SITE.name}` },
    description: EVENT_REQUEST_SEO_DESCRIPTION,
    alternates: { canonical: EVENT_TRANSFER_REQUEST_PATH },
  };
}

export default async function EventTransferRequestPage() {
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) notFound();
  const initialEvents = await loadBuildTimeBelfastEvents();
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Belfast Event Transfers", path: EVENTS_HUB_PATH },
    { name: "Request an event transfer", path: EVENT_TRANSFER_REQUEST_PATH },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Header />
      <main className={LANDING_PAGE_MAIN_CLASS} data-bespoke-request-page="event">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <LandingBreadcrumbs
            items={[{ name: "Home", href: "/" }, { name: "Belfast events", href: EVENTS_HUB_PATH }, { name: "Request a transfer" }]}
          />
          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Event transfer</p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Request an event transfer</h1>
              <p className="mt-4 text-base leading-relaxed text-white/70">
                Tell us about your event and journey. We&apos;ll check availability and email you a personal fixed quotation, usually within a day.
              </p>
              <div className="mt-8">
                <EventTransferRequestClient initialEvents={initialEvents} />
              </div>
            </div>
            <aside className="space-y-4 lg:pt-24" aria-label="About event transfers">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-base font-bold text-white">What happens next</h2>
                <ol className="mt-3 space-y-2 text-sm leading-relaxed text-white/70">
                  <li>1. We check availability for your date and group.</li>
                  <li>2. You get a personal quotation by email.</li>
                  <li>3. Accept and pay online to confirm.</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-base font-bold text-white">{EVENT_GROUP_NOTE.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{EVENT_GROUP_NOTE.body}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-base font-bold text-white">Prefer to talk?</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Call <a className="font-semibold text-emerald underline" href={`tel:${SITE.officeLandline}`}>{SITE.officeLandlineDisplay}</a> or WhatsApp{" "}
                  <a className="font-semibold text-emerald underline" href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener noreferrer">
                    {SITE.whatsappAssistantDisplay}
                  </a>
                  .
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

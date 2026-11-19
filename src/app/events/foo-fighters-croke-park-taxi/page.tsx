import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FooFightersTransfer from "@/components/FooFightersTransfer";
import { EVENTS_HUB_PUBLIC_ENABLED, FOO_FIGHTERS_EVENT_ID, FOO_FIGHTERS_TRANSFER_PATH } from "@/lib/bespoke-public";
import { fooFightersTransportFaqs } from "@/lib/belfast-events-content";
import { loadBuildTimeBelfastEvents } from "@/lib/belfast-events-snapshot";
import { SITE } from "@/lib/data";
import { getBreadcrumbJsonLd, getFaqPageJsonLd, getServiceAreaJsonLd } from "@/lib/structured-data";
import { LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS } from "@/lib/landing-page-layout";
import snapshot from "@/data/belfast-events-snapshot.json";
import type { BelfastEventPublic } from "../../../../shared/belfast-events";

const title = "Foo Fighters at Croke Park | Belfast to Dublin Concert Taxi";

function concertDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function listedFooEvent(events: BelfastEventPublic[]): BelfastEventPublic | undefined {
  return events.find((e) => e.id === FOO_FIGHTERS_EVENT_ID) ??
    (snapshot.events as BelfastEventPublic[]).find((e) => e.id === FOO_FIGHTERS_EVENT_ID);
}

function pageDescription(dateLabel: string): string {
  return `Private taxi from the Belfast corridor to Foo Fighters at Croke Park on ${dateLabel}. Fixed car prices online. A 7-seater request is subject to availability. We do not sell tickets.`;
}

export async function generateMetadata(): Promise<Metadata> {
  if (!EVENTS_HUB_PUBLIC_ENABLED) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }
  const event = listedFooEvent(await loadBuildTimeBelfastEvents());
  const description = pageDescription(event ? concertDateLabel(event.date) : "the listed concert date");
  return {
    title: { absolute: `${title} | ${SITE.name}` },
    description,
    alternates: { canonical: FOO_FIGHTERS_TRANSFER_PATH },
    openGraph: { title, description, url: FOO_FIGHTERS_TRANSFER_PATH, type: "website" },
  };
}

export default async function FooFightersTransferPage() {
  if (!EVENTS_HUB_PUBLIC_ENABLED) notFound();
  const event = listedFooEvent(await loadBuildTimeBelfastEvents());
  if (!event) notFound();
  const dateLabel = concertDateLabel(event.date);
  const description = pageDescription(dateLabel);
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Events", path: "/events/" },
    { name: "Foo Fighters at Croke Park", path: FOO_FIGHTERS_TRANSFER_PATH },
  ]);
  // Service + FAQ only. No Event markup: we provide transport, not tickets.
  const serviceLd = getServiceAreaJsonLd({
    name: `${SITE.name} — Foo Fighters concert taxi`,
    description,
    path: FOO_FIGHTERS_TRANSFER_PATH,
    areaServed: ["Belfast", "Croke Park"],
    serviceType: "Private event transfer",
  });
  const faqLd = getFaqPageJsonLd(fooFightersTransportFaqs(dateLabel));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Header />
      <main className={LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS}>
        <FooFightersTransfer initialEvent={event} />
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FooFightersTransfer from "@/components/FooFightersTransfer";
import { EVENTS_HUB_PUBLIC_ENABLED, FOO_FIGHTERS_EVENT_ID, FOO_FIGHTERS_TRANSFER_PATH } from "@/lib/bespoke-public";
import { loadBuildTimeBelfastEvents } from "@/lib/belfast-events-snapshot";
import { SITE } from "@/lib/data";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";
import { LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS } from "@/lib/landing-page-layout";
import snapshot from "@/data/belfast-events-snapshot.json";
import type { BelfastEventPublic } from "../../../../shared/belfast-events";

const title = "Foo Fighters at Croke Park | Belfast to Dublin Concert Taxi";
const description = "Book a private taxi from the Belfast corridor to Foo Fighters at Croke Park on 18 September 2027, or a pickup from Dublin back to Belfast. See your fare per person.";

export const metadata: Metadata = {
  title: { absolute: `${title} | ${SITE.name}` },
  description,
  alternates: { canonical: FOO_FIGHTERS_TRANSFER_PATH },
  openGraph: { title, description, url: FOO_FIGHTERS_TRANSFER_PATH, type: "website" },
};

export default async function FooFightersTransferPage() {
  if (!EVENTS_HUB_PUBLIC_ENABLED) notFound();
  const events = await loadBuildTimeBelfastEvents();
  const event = events.find(e => e.id === FOO_FIGHTERS_EVENT_ID) ??
    (snapshot.events as BelfastEventPublic[]).find(e => e.id === FOO_FIGHTERS_EVENT_ID);
  if (!event) notFound();
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" }, { name: "Events", path: "/events/" },
    { name: "Foo Fighters at Croke Park", path: FOO_FIGHTERS_TRANSFER_PATH },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Header />
      <main className={LANDING_PAGE_MAIN_WITH_QUOTE_HERO_CLASS}>
        <FooFightersTransfer initialEvent={event} />
      </main>
      <Footer />
    </>
  );
}

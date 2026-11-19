"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeroSlideshow from "@/components/HeroSlideshow";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { EVENTS_HUB_PATH } from "@/lib/bespoke-public";
import { todayInLondon, type BelfastEventPublic } from "../../shared/belfast-events";

export default function FooFightersTransfer({ initialEvent }: { initialEvent: BelfastEventPublic }) {
  const [event, setEvent] = useState<BelfastEventPublic | null>(initialEvent);
  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicBelfastEvents(controller.signal).then(events => {
      if (events && !controller.signal.aborted) setEvent(events.find(e => e.id === initialEvent.id) ?? null);
    });
    return () => controller.abort();
  }, [initialEvent.id]);

  if (!event || event.status !== "published" || event.date < todayInLondon()) {
    return (
      <div className="mx-auto max-w-3xl px-5 pb-12 pt-32 text-white">
        <h1 className="text-3xl font-bold">Foo Fighters at Croke Park</h1>
        <p className="my-4">{event?.status === "postponed" ? "This concert has been postponed." : event?.status === "cancelled" ? "This concert has been cancelled." : "This event is no longer listed."}</p>
        <Link href={EVENTS_HUB_PATH} className="font-semibold text-emerald underline">See upcoming events</Link>
      </div>
    );
  }

  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Dublin" })
    .format(new Date(`${event.date}T12:00:00Z`));
  return (
    <>
      <HeroSlideshow
        heading="Belfast to Dublin for Foo Fighters at Croke Park"
        headingSubject="Foo Fighters at Croke Park"
        intro={`${dateLabel}. Book both ways, or just the taxi home from Dublin to Belfast after the concert. Enter your passenger count to see the price per person.`}
        quoteCardTitle="Foo Fighters concert taxi"
        journey={{ eventTransfer: true, event: { title: event.title, date: event.date }, bookingIntroduction: "Get a fixed fare for your concert journey." }}
        heroBackground={{ baseName: "dublin-beckett-bridge", widths: [960, 1920] }}
      />
      <section className="mx-auto max-w-4xl px-5 pt-5 text-white sm:px-8">
        <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Events", href: EVENTS_HUB_PATH }, { name: "Foo Fighters at Croke Park" }]} />
        <p className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
          <time dateTime={event.date}>{dateLabel}</time>
          {event.highDemandPickupPercent && <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-[#14532d]">High demand</span>}
        </p>
        <h2 className="mt-4 text-2xl font-bold">Getting home from Croke Park</h2>
        <p className="mt-3 max-w-2xl text-white/85">For a lift home, choose One Way, enter Croke Park as your pickup and your home address as the destination. For both ways between the same addresses, choose Return and enter your pickup time for each leg.</p>
        {event.highDemandPickupPercent && <p className="mt-3 max-w-2xl text-white/85">Your quote includes a {event.highDemandPickupPercent}% surcharge on the vehicle fare for a pickup at {event.venueName} on the concert date. Hotel pickups and drop-offs at the stadium or your hotel use the usual fare.</p>}
        <h2 className="mt-7 text-xl font-bold">Travelling from the Belfast corridor</h2>
        <p className="mt-3 max-w-2xl text-white/85">Enter your own pickup in Belfast, Newtownabbey, Lisburn or along the route to Dublin. If you’re going to a hotel first and coming home from the stadium, get a separate one-way quote for each pickup. Groups of two or more see the full vehicle price and the cost each when sharing.</p>
        {event.officialUrl && <p className="mt-5"><a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald underline">Concert and ticket details from Croke Park</a></p>}
      </section>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BespokeRequestForm from "@/components/BespokeRequestForm";
import HeroSlideshow from "@/components/HeroSlideshow";
import LandingBreadcrumbs from "@/components/LandingBreadcrumbs";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { EVENT_GROUP_NOTE, fooFightersTransportFaqs } from "@/lib/belfast-events-content";
import { bookingHelpWhatsAppUrl } from "@/lib/booking-help-whatsapp";
import { EVENTS_HUB_PATH } from "@/lib/bespoke-public";
import { SITE } from "@/lib/data";
import { todayInLondon, type BelfastEventPublic } from "../../shared/belfast-events";

function concertDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(new Date(`${iso}T12:00:00Z`));
}

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
        <Link href={EVENTS_HUB_PATH} className="inline-flex min-h-11 items-center font-semibold text-emerald underline">See upcoming events</Link>
      </div>
    );
  }

  const dateLabel = concertDateLabel(event.date);
  const faqs = fooFightersTransportFaqs(dateLabel);
  return (
    <>
      <HeroSlideshow
        heading="Belfast to Dublin for Foo Fighters at Croke Park"
        headingSubject="Foo Fighters at Croke Park"
        intro={`${dateLabel}. A private taxi from the Belfast corridor to Croke Park, or home to Belfast afterwards. This quote is a fixed car fare. Larger groups can send a transfer request.`}
        quoteCardTitle="Foo Fighters concert taxi"
        journey={{ eventTransfer: true, event: { title: event.title, date: event.date }, bookingIntroduction: "Fixed fare for a car of up to 4 passengers." }}
        heroBackground={{ baseName: "dublin-beckett-bridge", widths: [960, 1920] }}
      />
      <section className="mx-auto max-w-4xl px-5 pt-5 text-white sm:px-8" aria-labelledby="foo-fighters-details">
        <LandingBreadcrumbs items={[{ name: "Home", href: "/" }, { name: "Events", href: EVENTS_HUB_PATH }, { name: "Foo Fighters at Croke Park" }]} />
        <p className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
          <time dateTime={event.date}>{dateLabel}</time>
          <span className="rounded-full border border-white/15 px-3 py-1 text-white/80">{event.venueName}</span>
          {event.highDemandPickupPercent ? <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-[#14532d]">High demand</span> : null}
        </p>
        <h2 id="foo-fighters-details" className="mt-4 text-2xl font-bold sm:text-3xl">Concert taxi from Belfast</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85">{event.summary}</p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85">
          {event.venueName}, {event.venueArea}. Croke Park lists the concert as subject to licence. We do not sell tickets or confirm whether they are on sale.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="#request" className="btn-primary inline-flex min-h-12 items-center rounded-full px-5 text-sm font-bold">
            Request a transfer
          </a>
          {event.officialUrl ? (
            <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white/85 hover:border-emerald/40 hover:text-emerald">
              Official concert page
            </a>
          ) : null}
        </div>
        <h3 className="mt-8 text-xl font-bold">Getting home from Croke Park</h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85">For a lift home, choose One Way, enter Croke Park as your pickup and your home address as the destination. For both ways between the same addresses, choose Return and enter your pickup time for each leg.</p>
        {event.highDemandPickupPercent ? <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85">Your quote includes a {event.highDemandPickupPercent}% surcharge on the vehicle fare for a pickup at {event.venueName} on the concert date. Hotel pickups and drop-offs at the stadium or your hotel use the usual fare.</p> : null}
        <h3 className="mt-7 text-xl font-bold">Travelling from the Belfast corridor</h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85">Enter your own pickup in Belfast, Newtownabbey, Lisburn or along the route to Dublin. If you are going to a hotel first and coming home from the stadium, get a separate one-way quote for each pickup. Two or more passengers see the car price and the cost each. For 5–7 passengers, send the request below. A 7-seater is subject to availability.</p>
      </section>

      <section id="request" className="scroll-mt-28 mx-auto max-w-3xl px-5 pb-8 pt-10 text-white sm:px-8" aria-labelledby="foo-fighters-request">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Transfer request</p>
        <h2 id="foo-fighters-request" className="mt-2 text-2xl font-bold sm:text-3xl">Request this concert transfer</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75">
          Tell us your pickup address, destination, date, time and passengers. The concert name, venue and date come from the approved listing. We email a personal quotation. Nothing is confirmed until you accept and pay.
        </p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-bold text-white">{EVENT_GROUP_NOTE.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{EVENT_GROUP_NOTE.body}</p>
        </div>
        <div className="mt-8">
          <BespokeRequestForm category="event" event={event} />
        </div>
        <p className="mt-6 text-sm leading-relaxed text-white/65">
          Prefer to talk? Call{" "}
          <a className="font-semibold text-emerald underline" href={`tel:${SITE.officeLandline}`}>{SITE.officeLandlineDisplay}</a>
          {" "}or{" "}
          <a className="font-semibold text-emerald underline" href={bookingHelpWhatsAppUrl("Hi, I'd like to request a transfer for Foo Fighters at Croke Park.")} target="_blank" rel="noopener noreferrer">WhatsApp us</a>.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-16 text-white sm:px-8" aria-labelledby="foo-fighters-faqs">
        <h2 id="foo-fighters-faqs" className="text-2xl font-bold">Questions about the taxi</h2>
        <dl className="mt-5 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <dt className="font-bold text-white">{faq.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-white/75">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

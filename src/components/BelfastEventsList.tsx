"use client";

/**
 * Events hub list. Starts from the build-time list (crawlable) and swaps in the
 * live approved list from the Worker, so new approvals and cancellations show
 * without a rebuild. Cancelled/postponed events stay visible but cannot be requested.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { resolveEventVenuePlace } from "@/lib/event-venue-place";
import { beginEventVenueLookup, prefillEventQuote } from "@/lib/event-quote-prefill";
import {
  BELFAST_EVENT_CATEGORIES,
  BELFAST_EVENT_CATEGORY_LABELS,
  belfastEventAcceptsRequests,
  sortBelfastEvents,
  todayInLondon,
  type BelfastEventCategory,
  type BelfastEventPublic,
} from "../../shared/belfast-events";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { BESPOKE_PUBLIC_PAGES_ENABLED, EVENT_TRANSFER_REQUEST_PATH, FOO_FIGHTERS_EVENT_ID, FOO_FIGHTERS_TRANSFER_PATH } from "@/lib/bespoke-public";
import { bookingHelpWhatsAppUrl } from "@/lib/booking-help-whatsapp";
import { eventCityForArea, type EventCity } from "../../shared/belfast-events";

/**
 * Each event goes to the Events page's own instant quote tool (venue pre-filled as a picked
 * address) and WhatsApp — owner, 16 Nov 2026. The request form stays off here, even on previews.
 */
const FORMS = false && BESPOKE_PUBLIC_PAGES_ENABLED;
const CITY_LABELS: Record<EventCity, string> = { belfast: "Belfast", dublin: "Dublin" };

type Filter = "all" | BelfastEventCategory;

function dateParts(date: string): { day: string; month: string; weekday: string; full: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(d);
  return {
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }),
    weekday: fmt({ weekday: "short" }),
    full: fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  };
}

export default function BelfastEventsList({ initialEvents }: { initialEvents: BelfastEventPublic[] }) {
  const [events, setEvents] = useState<BelfastEventPublic[]>(initialEvents);
  const [filter, setFilter] = useState<Filter>("all");
  const [city, setCity] = useState<"all" | EventCity>("all");

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicBelfastEvents(controller.signal).then((live) => {
      // An empty live list (e.g. before the dashboard list is filled) never wipes the built-in list.
      if (live && (live.length > 0 || initialEvents.length === 0)) {
        setEvents(sortBelfastEvents(live.filter((e) => e.date >= todayInLondon())));
      }
    });
    return () => controller.abort();
  }, [initialEvents.length]);

  const counts = useMemo(() => {
    const c: Partial<Record<BelfastEventCategory, number>> = {};
    for (const e of events) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [events]);
  const cities = useMemo(() => Array.from(new Set(events.map((e) => eventCityForArea(e.venueArea)))), [events]);
  const inCity = city === "all" ? events : events.filter((e) => eventCityForArea(e.venueArea) === city);
  const shown = filter === "all" ? inCity : inCity.filter((e) => e.category === filter);

  return (
    <div>
      {cities.length > 1 ? (
        <div className="mb-2 flex gap-2" role="group" aria-label="Filter events by city" data-events-city-filter>
          {(["all", ...cities] as const).map((id) => {
            const active = city === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setCity(id)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${
                  active ? "border-emerald bg-emerald text-navy" : "border-white/15 text-white/75 hover:border-emerald/40"
                }`}
              >
                {id === "all" ? "Belfast & Dublin" : CITY_LABELS[id]}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]" role="group" aria-label="Filter events by type">
        {(["all", ...BELFAST_EVENT_CATEGORIES] as const).map((id) => {
          const active = filter === id;
          const label = id === "all" ? "All events" : BELFAST_EVENT_CATEGORY_LABELS[id];
          const count = id === "all" ? events.length : counts[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${
                active ? "border-emerald bg-emerald text-navy" : "border-white/15 bg-white/[0.03] text-white/80 hover:border-emerald/50"
              }`}
            >
              {label}
              <span className={active ? "text-navy/70" : "text-white/45"}>{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-base font-semibold text-white">
            {events.length === 0 ? "No events listed just now." : "No events in this category just now."}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {FORMS ? (
              <>
                You can still request a transfer for any Belfast event.{" "}
                <Link href={EVENT_TRANSFER_REQUEST_PATH} className="font-semibold text-emerald underline">
                  Request an event transfer
                </Link>
              </>
            ) : (
              <>
                You can still get a fixed price for any venue.{" "}
                <a href="#quote" className="font-semibold text-emerald underline">
                  Get a fixed price
                </a>
              </>
            )}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Upcoming events">
          {shown.map((e) => {
            const d = dateParts(e.date);
            const open = belfastEventAcceptsRequests(e);
            return (
              <li key={e.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <article aria-labelledby={`evt-${e.id}`} className="flex flex-1 gap-4">
                  <div className="flex h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-light text-center" aria-hidden="true">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald">{d.weekday}</span>
                    <span className="text-2xl font-bold leading-none text-white">{d.day}</span>
                    <span className="text-xs font-semibold uppercase text-white/70">{d.month}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{e.categoryLabel}</p>
                    <h3 id={`evt-${e.id}`} className="mt-1 text-lg font-bold leading-snug text-white">
                      {e.title}
                    </h3>
                    <p className="mt-1 text-sm text-white/70">
                      <time dateTime={e.date}>{d.full}</time>
                      {e.startTime ? ` · ${e.startTime}` : ""}
                      {open && e.highDemandPickupPercent && <span className="ml-2 inline-block rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-bold text-[#14532d]">High demand</span>}
                    </p>
                    <p className="text-sm text-white/70">
                      {e.venueName}
                      {FORMS ? "" : `, ${CITY_LABELS[eventCityForArea(e.venueArea)]}`}
                    </p>
                    {e.status !== "published" ? (
                      <p className="mt-3 inline-flex rounded-full bg-amber-400/20 px-3 py-1 text-sm font-semibold text-[#8a5a00]">
                        {e.status === "cancelled" ? "Cancelled" : "Postponed"}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{e.summary}</p>
                    {open && e.pickupPoint ? <p className="mt-2 text-sm text-white/80">Pickup point · {e.pickupPoint}</p> : null}
                  </div>
                </article>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                  {open && !FORMS ? (
                    <>
                      {e.id === FOO_FIGHTERS_EVENT_ID ? (
                        <Link href={FOO_FIGHTERS_TRANSFER_PATH} className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold">
                          Belfast &amp; Croke Park taxi quote
                        </Link>
                      ) : <EventQuoteButton event={e} />}
                      <a
                        href={bookingHelpWhatsAppUrl(`Hi, I'd like a price for ${e.title} on ${d.full}.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline"
                      >
                        WhatsApp us<span className="sr-only"> about {e.title} (opens in a new tab)</span>
                      </a>
                    </>
                  ) : open ? (
                    <Link
                      href={`${EVENT_TRANSFER_REQUEST_PATH}?event=${encodeURIComponent(e.id)}`}
                      className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold"
                      aria-label={`Request a transfer for ${e.title}`}
                    >
                      Request a transfer
                    </Link>
                  ) : (
                    <span className="text-sm text-white/60">Transfers can&apos;t be requested for this event.</span>
                  )}
                  {e.officialUrl ? (
                    <a
                      href={e.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald underline"
                    >
                      Official info<span className="sr-only"> for {e.title} (opens in a new tab)</span>
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Offers the venue and show date as defaults in the event quote form. */
function EventQuoteButton({ event }: { event: BelfastEventPublic }) {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    if (busy) return;
    setBusy(true);
    const quote = document.getElementById("quote");
    quote?.scrollIntoView({ behavior: "smooth", block: "start" });
    const latest = beginEventVenueLookup();
    prefillEventQuote({ pickup: null, dropoff: null, listedId: event.id, eventTitle: event.title, tripDate: event.date, suggestReturnDate: true });
    const place = await resolveEventVenuePlace(event.venueName, event.venueArea);
    setBusy(false);
    if (!latest()) return;
    if (place) prefillEventQuote({ dropoff: place });
    if (place) {
      // Next step for the customer: their pickup address.
      window.setTimeout(() => {
        const pickup = quote?.querySelector<HTMLInputElement>("input[placeholder^='Pickup address']");
        if (pickup && !pickup.value.trim()) pickup.focus({ preventScroll: true });
      }, 400);
    } else {
      // A destination can still be entered when venue lookup is unavailable.
      const dropoff = quote?.querySelector<HTMLInputElement>("input[placeholder^='Destination address']");
      if (dropoff && !dropoff.value.trim()) dropoff.focus({ preventScroll: true });
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold"
      aria-label={`Get a fixed price for ${event.title} at ${event.venueName}`}
    >
      {busy ? "Finding venue…" : "Get a fixed price"}
    </button>
  );
}

"use client";

/**
 * Airport-style quick-pick boxes for popular concerts on the Events & Concerts
 * quote tool. One tap fills the venue as drop-off and the concert date.
 */
import { useEffect, useState } from "react";
import { todayInLondon, type BelfastEventPublic } from "../../shared/belfast-events";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { FOO_FIGHTERS_EVENT_ID } from "@/lib/bespoke-public";
import { beginEventVenueLookup, prefillEventQuote } from "@/lib/event-quote-prefill";
import { resolveEventVenuePlace } from "@/lib/event-venue-place";

const featured = [
  { label: "Foo Fighters", eventId: FOO_FIGHTERS_EVENT_ID, match: (e: BelfastEventPublic) => e.id === FOO_FIGHTERS_EVENT_ID },
  { label: "Garth Brooks", eventId: "garth-brooks-", match: (e: BelfastEventPublic) => e.id.startsWith("garth-brooks-") },
] as const;

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function featuredShows(events: BelfastEventPublic[]): Array<{
  key: string;
  label: string;
  chip: string;
  event: BelfastEventPublic;
}> {
  const today = todayInLondon();
  const upcoming = events.filter((e) => e.status === "published" && e.date >= today);
  return featured.flatMap((item) => {
    const dates = upcoming.filter(item.match).sort((a, b) => a.date.localeCompare(b.date));
    return dates.map((event) => ({
      key: event.id,
      label: item.label,
      chip: dates.length > 1 ? `${item.label} · ${shortDate(event.date)}` : item.label,
      event,
    }));
  });
}

export default function PopularEventPicker({ initialEvents }: { initialEvents: BelfastEventPublic[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [chosenId, setChosenId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");
  const shows = featuredShows(events);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicBelfastEvents(controller.signal).then((live) => {
      if (live && !controller.signal.aborted) setEvents(live);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function fromList(event: Event) {
      const detail = (event as CustomEvent<{ listedId?: string }>).detail;
      if (detail?.listedId) setChosenId(detail.listedId);
    }
    window.addEventListener("quote-prefill-place", fromList);
    return () => window.removeEventListener("quote-prefill-place", fromList);
  }, []);

  async function pick(show: (typeof shows)[number]) {
    if (busyId) return;
    const { event } = show;
    const latest = beginEventVenueLookup();
    setChosenId(event.id);
    setBusyId(event.id);
    setStatus(`Finding ${event.venueName}`);
    prefillEventQuote({
      pickup: null,
      dropoff: null,
      listedId: event.id,
      eventTitle: event.title,
      tripDate: event.date,
      suggestReturnDate: true,
    });
    const place = await resolveEventVenuePlace(event.venueName, event.venueArea);
    if (!latest()) return;
    setBusyId("");
    if (place) {
      prefillEventQuote({ dropoff: place });
      // Keep success for screen readers only — a visible line shifts the quote fields.
      setStatus(`${event.venueName} added as your drop-off`);
      window.setTimeout(() => {
        const pickup = document
          .getElementById("quote")
          ?.querySelector<HTMLInputElement>("input[placeholder^='Pickup address']");
        if (pickup && !pickup.value.trim()) pickup.focus({ preventScroll: true });
      }, 250);
    } else {
      setStatus(`Enter ${event.venueName} in the drop-off box and select the venue`);
    }
  }

  if (!shows.length) return null;

  return (
    <div className="mb-3 min-w-0" data-popular-events>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#071c38]/70">
        Popular
      </p>
      <div
        role="group"
        aria-label="Quick pick a popular event"
        data-popular-event-picks
        className="flex flex-wrap items-center gap-1.5"
      >
        {shows.map((show) => {
          const chosen = chosenId === show.event.id;
          return (
            <button
              key={show.key}
              type="button"
              data-popular-event-pick={show.label}
              data-popular-event-chosen={chosen ? "" : undefined}
              disabled={Boolean(busyId)}
              aria-pressed={chosen}
              aria-busy={busyId === show.event.id}
              onClick={() => void pick(show)}
              className={`box-border inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-[#071c38]/15 px-3 text-[13px] font-semibold leading-none disabled:opacity-60 ${
                chosen
                  ? "bg-[#ecfdf3] text-[#14532d] ring-2 ring-inset ring-[#187742]"
                  : "bg-white text-[#071c38]"
              }`}
            >
              {busyId === show.event.id ? "Finding…" : show.chip}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}

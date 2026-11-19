"use client";

import { useEffect, useId, useRef, useState } from "react";
import { todayInLondon, type BelfastEventPublic } from "../../shared/belfast-events";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { FOO_FIGHTERS_EVENT_ID } from "@/lib/bespoke-public";
import { beginEventVenueLookup, prefillEventQuote, type EventQuotePrefill } from "@/lib/event-quote-prefill";
import { fetchSelectedPlaceDetails } from "@/lib/google-maps";
import { buildDisplayAddress, isQuoteReadyPlace } from "@/lib/selected-place";

// These are the same venue IDs returned by the site's address search.
const featured = [
  { artist: "Foo Fighters", venue: "Croke Park", placeId: "ChIJlflkkmMOZ0gRX7SIDoZHE-U", eventId: FOO_FIGHTERS_EVENT_ID },
  { artist: "Garth Brooks", venue: "Boucher Road Playing Fields", placeId: "ChIJ8ZKkQ4MIYUgRc2EII-pZO4s", eventId: "garth-brooks-" },
] as const;
type Option = (typeof featured)[number] & { dates: BelfastEventPublic[] };
type Endpoint = "dropoff" | "pickup" | "own";

function concertDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}

function optionsFor(events: BelfastEventPublic[]): Option[] {
  const today = todayInLondon();
  return featured.flatMap(concert => {
    const dates = events.filter(e => e.status === "published" && e.date >= today && e.venueName === concert.venue &&
      (concert.artist === "Foo Fighters" ? e.id === concert.eventId : e.id.startsWith(concert.eventId)))
      .sort((a, b) => a.date.localeCompare(b.date));
    return dates.length ? [{ ...concert, dates }] : [];
  });
}

export default function PopularEventPicker({ initialEvents }: { initialEvents: BelfastEventPublic[] }) {
  const id = useId();
  const [events, setEvents] = useState(initialEvents);
  const [artist, setArtist] = useState("");
  const [endpoint, setEndpoint] = useState<Endpoint>("dropoff");
  const [showDate, setShowDate] = useState("");
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  const options = optionsFor(events);
  const selected = options.find(option => option.artist === artist);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetchPublicBelfastEvents(controller.signal).then(live => {
      if (live && !controller.signal.aborted) setEvents(live);
    });
    return () => { controller.abort(); mounted.current = false; };
  }, []);

  useEffect(() => {
    // Keep the radios in step if a customer selects an event further down the page.
    function fromCalendar(event: Event) {
      const detail = (event as CustomEvent<EventQuotePrefill>).detail;
      if (!detail?.listedId) return;
      const option = optionsFor(events).find(item => item.dates.some(e => e.id === detail.listedId));
      setArtist(option?.artist ?? "");
      setShowDate(option ? detail.tripDate ?? "" : "");
      setEndpoint("dropoff");
      setStatus("");
    }
    window.addEventListener("quote-prefill-place", fromCalendar);
    return () => window.removeEventListener("quote-prefill-place", fromCalendar);
  }, [events]);

  function chooseDate(date: string) {
    setShowDate(date);
    prefillEventQuote({ tripDate: date, suggestReturnDate: true });
  }

  async function chooseVenue(option: Option | undefined, side: Endpoint) {
    const latest = beginEventVenueLookup();
    setEndpoint(side);
    setStatus("");
    // Release only values previously supplied by this picker. Manually entered hotels and homes stay put.
    prefillEventQuote({ pickup: null, dropoff: null, eventTitle: option?.dates[0].title ?? "" });
    if (!option || side === "own") return;
    setStatus("Finding the venue address…");
    const listing = option.dates[0];
    const place = await fetchSelectedPlaceDetails(option.placeId, "BFS", listing.venueName + ", " + listing.venueArea, listing.venueName).catch(() => null);
    if (!latest() || !mounted.current) return;
    if (!place || place.placeId !== option.placeId || !isQuoteReadyPlace(place)) {
      setStatus(`Enter ${listing.venueName} in the ${side === "pickup" ? "pickup" : "drop-off"} box and select the venue.`);
      return;
    }
    let kept = false;
    const namedPlace = { ...place, displayAddress: buildDisplayAddress(listing.venueName, place.formattedAddress) };
    prefillEventQuote({ [side]: namedPlace, onAddressKept: () => { kept = true; } });
    const field = side === "pickup" ? "pickup" : "drop-off";
    setStatus(kept ? `Your existing ${field} address has been kept. You can edit it below.` : `${listing.venueName} added as your ${field}.`);
  }

  function chooseArtist(option?: Option) {
    setArtist(option?.artist ?? "");
    chooseDate(option?.dates.length === 1 ? option.dates[0].date : "");
    void chooseVenue(option, option ? endpoint : "dropoff");
  }

  useEffect(() => {
    if (!artist) return;
    if (selected) {
      if (showDate && !selected.dates.some(e => e.date === showDate)) chooseDate("");
      return;
    }
    beginEventVenueLookup();
    setArtist("");
    setShowDate("");
    setStatus("");
    prefillEventQuote({ pickup: null, dropoff: null, tripDate: "", suggestReturnDate: true, eventTitle: "" });
  }, [artist, selected, showDate]);

  if (!options.length) return null;
  return (
    <section data-popular-events aria-label="Concert shortcuts" className="mb-3 min-w-0 rounded-xl border border-[#cbd5e1] bg-white p-3 text-[#071c38] sm:p-4">
      <fieldset>
        <legend className="text-base font-bold text-[#071c38]">Popular events</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {options.map(option => (
            <label key={option.placeId} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[#cbd5e1] px-3 py-2 has-[:checked]:border-[#187742] has-[:checked]:bg-[#ecfdf3]">
              <input className="h-4 w-4 shrink-0 accent-[#187742]" type="radio" name={id + "-artist"} checked={artist === option.artist} onChange={() => chooseArtist(option)} />
              <span><strong className="block text-sm text-[#071c38]">{option.artist}</strong>
                <span className="block text-xs text-[#334155]">{option.venue} · {option.dates[0].venueArea}</span></span>
            </label>
          ))}
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-[#334155]">
          <input type="radio" name={id + "-artist"} className="h-4 w-4 accent-[#187742]" checked={!artist} onChange={() => chooseArtist()} />
          Another event or journey
        </label>
      </fieldset>
      {selected && <>
        {selected.dates.length > 1 ? (
          <label className="mb-2 block text-sm font-semibold text-[#071c38]">
            Concert date
            <select className="ml-2 max-w-full rounded-md border border-[#64748b] bg-white p-2 text-[#071c38]" value={showDate} onChange={e => chooseDate(e.target.value)}>
              <option value="">Choose your show</option>
              {selected.dates.map(e => <option key={e.id} value={e.date}>{concertDate(e.date)}</option>)}
            </select>
          </label>
        ) : <p className="mb-2 text-sm font-semibold text-[#071c38]">{concertDate(selected.dates[0].date)}{selected.dates[0].highDemandPickupPercent ? " · High demand" : ""}</p>}
        <fieldset>
          <legend className="text-sm font-bold text-[#071c38]">Where will you use the venue address?</legend>
          <div className="flex flex-wrap gap-x-4">
            {([["dropoff", "Drop-off"], ["pickup", "Pickup"], ["own", "Use my own addresses"]] as const).map(([side, label]) =>
              <label key={side} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#071c38]">
                <input type="radio" name={id + "-endpoint"} className="h-4 w-4 accent-[#187742]" checked={endpoint === side} onChange={() => void chooseVenue(selected, side)} />{label}
              </label>)}
          </div>
        </fieldset>
      </>}
      <p role="status" className="text-xs text-[#334155]">{status}</p>
    </section>
  );
}

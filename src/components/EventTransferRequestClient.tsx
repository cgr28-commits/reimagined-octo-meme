"use client";

import { useEffect, useState } from "react";
import BespokeRequestForm from "@/components/BespokeRequestForm";
import { fetchPublicBelfastEvents } from "@/lib/belfast-events-api";
import { BELFAST_EVENT_ID, belfastEventAcceptsRequests, type BelfastEventPublic } from "../../shared/belfast-events";

/** Reads ?event=<id> in the browser (static export) and pre-fills the form from the approved listing. */
export default function EventTransferRequestClient({ initialEvents }: { initialEvents: BelfastEventPublic[] }) {
  const [state, setState] = useState<{ ready: boolean; event: BelfastEventPublic | null; notice: string }>({
    ready: false,
    event: null,
    notice: "",
  });

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event") ?? "";
    if (!id || !BELFAST_EVENT_ID.test(id)) {
      setState({ ready: true, event: null, notice: "" });
      return;
    }
    const controller = new AbortController();
    const pick = (list: BelfastEventPublic[]) => list.find((e) => e.id === id) ?? null;
    void fetchPublicBelfastEvents(controller.signal).then((live) => {
      const found = pick(live ?? initialEvents);
      if (found && belfastEventAcceptsRequests(found)) setState({ ready: true, event: found, notice: "" });
      else
        setState({
          ready: true,
          event: null,
          notice: found
            ? `${found.title} is ${found.status}. You can still tell us about another Belfast event below.`
            : "We couldn't find that event. Please enter the event details below.",
        });
    });
    return () => controller.abort();
  }, [initialEvents]);

  if (!state.ready) {
    return <p className="text-sm text-white/60" role="status">Loading…</p>;
  }
  return (
    <>
      {state.notice ? (
        <p role="status" className="mb-6 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-[#8a5a00]">
          {state.notice}
        </p>
      ) : null}
      <BespokeRequestForm category="event" event={state.event} />
    </>
  );
}

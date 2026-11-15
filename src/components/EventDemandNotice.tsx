"use client";

import {
  matchEventForWebsiteQuote,
  websiteEventDatesLabel,
} from "../../shared/whatsapp-events";

type Props = {
  addresses: Array<string | undefined>;
  dates: Array<string | undefined>;
  dropoff?: string;
};

/** Big-event notice on the quote result (e.g. Garth Brooks at Boucher Road, May 2027). */
export default function EventDemandNotice({ addresses, dates, dropoff }: Props) {
  const event = matchEventForWebsiteQuote({ addresses, dates, dropoff });
  if (!event) return null;
  return (
    <div
      role="status"
      data-event-demand-notice={event.id}
      className="mb-2 rounded-xl border-2 border-[#F5B700] bg-[#FFF4D6] px-3.5 py-2.5 text-left text-navy"
    >
      <p className="text-sm font-bold leading-snug">
        <span aria-hidden="true">🎵 </span>
        Garth Brooks at Boucher Road – {websiteEventDatesLabel(event)}
      </p>
      <p className="mt-0.5 text-[0.82rem] font-medium leading-snug">
        Limited availability due to concert bookings. Booking early is advisable to secure your car.
      </p>
    </div>
  );
}

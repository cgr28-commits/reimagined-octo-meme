"use client";

import { seasonalBookingMessage } from "../../shared/seasonal-booking-message";

type Props = {
  /** Pickup date from the quote form (YYYY-MM-DD). */
  tripDate: string;
  /** Short-notice / request bookings: no "secure your journey today" line. */
  needsApproval?: boolean;
  /** "panel" sits between the price and the book button (desktop); "list" sits under the chosen car's price (phones). */
  placement: "panel" | "list";
};

/** Date-specific booking encouragement under an instant quote (owner brief, 15 Nov 2026). */
export default function SeasonalBookingMessage({ tripDate, needsApproval, placement }: Props) {
  const message = seasonalBookingMessage(tripDate, { needsApproval });
  if (!message) return null;
  return (
    <div
      data-seasonal-booking-message={placement}
      data-season={message.season}
      className="mt-2.5 rounded-xl border border-[#071C38]/10 border-l-4 border-l-[#2FBF4A] bg-white px-3.5 py-2.5 text-left text-[#071C38] shadow-[0_1px_2px_rgba(7,28,56,0.06)]"
    >
      <p className="text-[0.95rem] font-extrabold leading-snug tracking-[-0.01em]">
        {message.icon ? <span aria-hidden="true">{message.icon} </span> : null}
        Travelling on <span className="whitespace-nowrap">{message.travelDateLabel}</span>?
      </p>
      <p className="mt-1 text-[0.8rem] font-medium leading-snug text-[#071C38]/80">{message.body}</p>
      {message.closing ? (
        <p className="mt-1 text-[0.8rem] font-bold leading-snug text-[#147a2a]">{message.closing}</p>
      ) : null}
    </div>
  );
}

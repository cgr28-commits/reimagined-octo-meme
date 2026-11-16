"use client";

import { seasonalBookingMessage } from "../../shared/seasonal-booking-message";
import { DEMAND_BAR_SEGMENTS, demandIndicatorFor } from "../../shared/demand-indicator";
import { websiteEventIcon } from "../../shared/website-event-notices";

type Props = {
  /** Pickup date from the quote form (YYYY-MM-DD). */
  tripDate: string;
  returnDate?: string;
  pickup?: string;
  dropoff?: string;
  /** Short-notice / request bookings: no "secure your journey today" line. */
  needsApproval?: boolean;
  /** "panel" sits between the price and the book button (desktop); "list" sits under the chosen car's price (phones). */
  placement: "panel" | "list";
};

/**
 * Date-specific booking message with "Expected demand for your date" (owner, 15 Nov 2026).
 * Busy dates show a demand bar; everyday dates show the seasonal message only.
 */
export default function SeasonalBookingMessage({ tripDate, returnDate, pickup, dropoff, needsApproval, placement }: Props) {
  const message = seasonalBookingMessage(tripDate, { needsApproval });
  const demand = demandIndicatorFor({ tripDate, returnDate, pickup, dropoff, needsApproval });
  if (!message || !demand) return null;
  const veryHigh = demand.level === "very-high";
  const showBar = demand.filledSegments > 0;
  const soon = demand.level === "soon";
  const accent = veryHigh ? "#BA7517" : "#2FBF4A";
  const icon = demand.event ? websiteEventIcon(demand.event) : soon ? "⏱️" : message.icon;
  return (
    <div
      data-seasonal-booking-message={placement}
      data-season={message.season}
      data-demand-level={demand.level}
      className={`mt-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[#071C38] ${
        veryHigh ? "border-[#e2c98f] bg-[#fdf6e7]" : "border-[#071C38]/12 bg-white"
      }`}
    >
      <p className="text-[0.95rem] font-extrabold leading-snug tracking-[-0.01em]">
        {icon ? <span aria-hidden="true">{icon} </span> : null}
        {showBar || soon ? (
          <span className="whitespace-nowrap">{message.travelDateLabel}</span>
        ) : (
          <>
            Travelling on <span className="whitespace-nowrap">{message.travelDateLabel}</span>?
          </>
        )}
      </p>
      {showBar ? (
        <>
          <p className="mt-1.5 flex items-center justify-between gap-2 text-[0.8rem]">
            <span className={veryHigh ? "text-[#633806]" : "text-[#071C38]/70"}>
              {demand.bookedPercent !== null ? "Bookings for your date" : "Expected demand for your date"}
            </span>
            <span className={`font-extrabold ${veryHigh ? "text-[#633806]" : "text-[#0F6E56]"}`}>{demand.label}</span>
          </p>
          <div
            className="mt-1.5 grid grid-cols-5 gap-1"
            role="img"
            aria-label={demand.bookedPercent !== null ? `${demand.label}` : `Expected demand: ${demand.label}`}
            data-demand-bar
          >
            {Array.from({ length: DEMAND_BAR_SEGMENTS }, (_, index) => (
              <span
                key={index}
                className="h-1.5 rounded-full"
                style={{ background: index < demand.filledSegments ? accent : veryHigh ? "#e7dfcf" : "#e3e8ee" }}
              />
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-1.5 text-[0.8rem] font-medium leading-snug text-[#071C38]/80">{demand.body}</p>
      {demand.level === "normal" && message.closing ? (
        <p className="mt-1 text-[0.8rem] font-bold leading-snug text-[#147a2a]">{message.closing}</p>
      ) : null}
    </div>
  );
}

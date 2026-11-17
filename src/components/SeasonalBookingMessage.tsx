"use client";

import { useEffect, useState } from "react";
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

/** Counts up from 0 to the real figure once, so the bar feels alive (owner, 17 Nov 2026). Never goes past the real figure. */
function useCountUp(target: number | null, durationMs = 1400): number | null {
  const [value, setValue] = useState<number | null>(target === null ? null : 0);
  useEffect(() => {
    if (target === null) {
      setValue(null);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/**
 * Date-specific booking message with "Expected demand for your date" (owner, 15 Nov 2026).
 * Busy dates show a demand bar; everyday dates show the seasonal message only.
 */
export default function SeasonalBookingMessage({ tripDate, returnDate, pickup, dropoff, needsApproval, placement }: Props) {
  const message = seasonalBookingMessage(tripDate, { needsApproval });
  const demand = demandIndicatorFor({ tripDate, returnDate, pickup, dropoff, needsApproval });
  const shownPercent = useCountUp(demand?.bookedPercent ?? null);
  if (!message || !demand) return null;
  const veryHigh = demand.level === "very-high";
  const showBar = demand.filledSegments > 0;
  const soon = demand.level === "soon";
  // Pulsing colour by level (owner, 17 Nov 2026): green low, amber middle, red high.
  const tone: "green" | "amber" | "red" =
    demand.bookedPercent !== null
      ? demand.bookedPercent >= 80
        ? "red"
        : demand.bookedPercent >= 60
          ? "amber"
          : "green"
      : veryHigh
        ? "red"
        : demand.level === "high"
          ? "amber"
          : "green";
  const accent = tone === "red" ? "#D93025" : tone === "amber" ? "#E8A317" : "#2FBF4A";
  const icon = demand.event ? websiteEventIcon(demand.event) : soon ? "⏱️" : message.icon;
  return (
    <div
      data-seasonal-booking-message={placement}
      data-season={message.season}
      data-demand-level={demand.level}
      data-demand-tone={tone}
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
            <span className={`inline-flex items-center gap-1.5 ${veryHigh ? "text-[#633806]" : "text-[#071C38]/70"}`}>
              <span className="demand-pulse-dot" style={{ background: accent, color: accent }} aria-hidden="true" />
              {demand.bookedPercent !== null ? "Bookings for your date" : "Expected demand for your date"}
            </span>
            <span className={`font-extrabold tabular-nums ${tone === "red" ? "text-[#B3261E]" : tone === "amber" ? "text-[#8A5A00]" : "text-[#0F6E56]"}`}>
              {demand.bookedPercent !== null && shownPercent !== null ? `${shownPercent}% booked` : demand.label}
            </span>
          </p>
          {demand.bookedPercent !== null ? (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full"
              style={{ background: veryHigh ? "#e7dfcf" : "#e3e8ee" }}
              role="img"
              aria-label={demand.label ?? undefined}
              data-demand-bar
            >
              <span
                className="demand-bar-fill block h-full rounded-full"
                style={{ width: `${demand.bookedPercent}%`, background: accent }}
              />
            </div>
          ) : (
            <div
              className="mt-1.5 grid grid-cols-5 gap-1"
              role="img"
              aria-label={`Expected demand: ${demand.label}`}
              data-demand-bar
            >
              {Array.from({ length: DEMAND_BAR_SEGMENTS }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 overflow-hidden rounded-full ${index < demand.filledSegments ? "demand-segment-on" : ""}`}
                  style={{
                    background: index < demand.filledSegments ? accent : veryHigh ? "#e7dfcf" : "#e3e8ee",
                    animationDelay: `${index * 140}ms`,
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
      <p className="mt-1.5 text-[0.8rem] font-medium leading-snug text-[#071C38]/80">{demand.body}</p>
      {demand.level === "normal" && message.closing ? (
        <p className="mt-1 text-[0.8rem] font-bold leading-snug text-[#147a2a]">{message.closing}</p>
      ) : null}
    </div>
  );
}

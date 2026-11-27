"use client";

import { seasonalBookingMessage } from "../../shared/seasonal-booking-message";
import { demandIndicatorFor } from "../../shared/demand-indicator";
import {
  type AvailabilityView,
  AVAILABILITY_BOOK_EARLY,
  AVAILABILITY_FREE_CANCELLATION,
  AVAILABILITY_PALETTE,
  AVAILABILITY_SEGMENTS,
  availabilityViewFor,
} from "@/lib/availability-indicator-view";

type Props = {
  /** Pickup date from the quote form (YYYY-MM-DD). */
  tripDate: string;
  returnDate?: string;
  pickup?: string;
  dropoff?: string;
  /** Short-notice / request bookings: no "secure your driver" line. */
  needsApproval?: boolean;
};

function TrendingUpIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2FBF4A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

/**
 * Availability indicator above the vehicle choice on the quote results (owner, 27 Nov 2026).
 * Ten rounded segments, colour by expected-demand level (low / moderate / high / very high).
 * No percentages and no "booked" wording: the underlying figures are a calendar table, not live bookings.
 * See src/lib/availability-indicator-view.ts for the rules.
 */
export default function SeasonalBookingMessage({ tripDate, returnDate, pickup, dropoff, needsApproval }: Props) {
  const message = seasonalBookingMessage(tripDate, { needsApproval });
  const demand = demandIndicatorFor({ tripDate, returnDate, pickup, dropoff, needsApproval });
  if (!message || !demand) return null;
  return (
    <AvailabilityIndicatorCard
      view={availabilityViewFor(demand)}
      dateLabel={message.travelDateLabel}
      season={message.season}
      level={demand.level}
    />
  );
}

export function AvailabilityIndicatorCard({
  view,
  dateLabel,
  season,
  level,
}: {
  view: AvailabilityView;
  dateLabel: string;
  season?: string;
  level?: string;
}) {
  const palette = AVAILABILITY_PALETTE[view.tone];
  const hasStatus = view.kind === "bar";

  return (
    <div
      data-seasonal-booking-message="above-vehicles"
      data-season={season}
      data-demand-level={level}
      data-demand-tone={hasStatus ? view.tone : "none"}
      data-demand-kind={view.kind}
      className="mb-3 rounded-xl border px-3.5 py-3 text-left text-[#071C38]"
      style={{ background: hasStatus ? palette.background : "#FFFFFF", borderColor: hasStatus ? palette.border : "rgba(7,28,56,0.12)" }}
    >
      {hasStatus && view.heading ? (
        <p className="flex items-center gap-1.5 text-[0.95rem] font-extrabold leading-snug tracking-[-0.01em]">
          {view.showTrendIcon ? <TrendingUpIcon color={palette.accent} /> : null}
          <span>{view.heading}</span>
        </p>
      ) : null}
      <p className={`${hasStatus ? "mt-0.5 text-[0.8rem] font-semibold text-[#071C38]/70" : "text-[0.95rem] font-extrabold leading-snug tracking-[-0.01em]"}`}>
        <span className="whitespace-nowrap">{dateLabel}</span>
      </p>

      {view.kind === "bar" ? (
        <div
          className="mt-2.5 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${AVAILABILITY_SEGMENTS}, minmax(0, 1fr))` }}
          role="img"
          aria-label={view.status ?? undefined}
          data-demand-bar
        >
          {Array.from({ length: AVAILABILITY_SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={`h-2 rounded-full ${index < view.filledSegments ? "avail-seg-on" : ""}`}
              style={{
                background: index < view.filledSegments ? palette.accent : palette.track,
                animationDelay: `${index * 60}ms`,
              }}
            />
          ))}
        </div>
      ) : null}

      {view.kind === "bar" && view.status ? (
        <p className="mt-2 text-[0.85rem] font-extrabold leading-snug" style={{ color: palette.text }}>
          {view.status}
        </p>
      ) : null}

      {view.bookEarly ? (
        <p className="mt-1.5 text-[0.8rem] font-medium leading-snug text-[#071C38]/85">{AVAILABILITY_BOOK_EARLY}</p>
      ) : null}
      {view.note ? <p className="mt-1 text-[0.8rem] font-medium leading-snug text-[#071C38]/80">{view.note}</p> : null}

      <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-semibold leading-snug text-[#147a2a]">
        <ShieldIcon />
        <span>{AVAILABILITY_FREE_CANCELLATION}</span>
      </p>
    </div>
  );
}

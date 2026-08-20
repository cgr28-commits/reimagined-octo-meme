"use client";

import { useState } from "react";
import {
  formatFlightNumberForDisplay,
  lookupFlightForBooking,
  type VerifiedFlight,
} from "@/lib/flight-lookup";
import {
  ownerFlightCompactSummary,
  resolveOwnerFlightLegContext,
  type OwnerFlightBookingFields,
} from "../../shared/owner-flight-status";

type OwnerFlightStatusPanelProps = {
  booking: OwnerFlightBookingFields;
};

function statusBadgeClass(category?: VerifiedFlight["statusCategory"]): string {
  switch (category) {
    case "on_time":
      return "border-emerald/40 bg-emerald/15 text-emerald";
    case "delayed":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "landed":
      return "border-sky-400/40 bg-sky-500/15 text-sky-100";
    case "cancelled":
      return "border-red-400/40 bg-red-500/15 text-red-100";
    default:
      return "border-white/15 bg-white/5 text-white/70";
  }
}

/**
 * Compact Flight Status for airport-collection Upcoming Jobs.
 * Does not auto-fetch on mount — Check / Refresh only (server-side AeroDataBox cache).
 */
export default function OwnerFlightStatusPanel({ booking }: OwnerFlightStatusPanelProps) {
  const context = resolveOwnerFlightLegContext(booking);
  const [expanded, setExpanded] = useState(false);
  const [flight, setFlight] = useState<VerifiedFlight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!context.showFlightTracker) {
    return null;
  }

  if (context.missingFlightNumber) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-navy/40 px-3 py-2.5 text-sm text-white/65">
        Flight: No flight number supplied
      </div>
    );
  }

  async function loadFlight(refresh: boolean) {
    if (!context.airportCode) {
      setError("Airport code missing for this collection — cannot look up the flight.");
      setExpanded(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await lookupFlightForBooking({
        flightNumber: context.flightNumber,
        tripDate: context.tripDate,
        airportCode: context.airportCode,
        direction: context.direction,
        refresh,
      });
      if (!result.ok || !result.flight) {
        setFlight(null);
        setError(result.ok === false ? result.error : "Flight status unavailable.");
      } else {
        setFlight(result.flight);
      }
      setExpanded(true);
    } catch (err) {
      setFlight(null);
      setError(err instanceof Error ? err.message : "Could not load flight status");
      setExpanded(true);
    } finally {
      setBusy(false);
    }
  }

  const displayNumber = formatFlightNumberForDisplay(context.flightNumber);
  const compact = flight
    ? `✈️ ${ownerFlightCompactSummary({
        flightNumber: flight.flightNumber,
        statusCategory: flight.statusCategory,
        statusLabel: flight.statusLabel,
        estimatedTime: flight.estimatedTime,
        delayMinutes: flight.delayMinutes,
      })}`
    : `✈️ Flight ${displayNumber} — Check flight`;

  return (
    <div className="mt-3 rounded-xl border border-emerald/20 bg-emerald/5 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{compact}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadFlight(Boolean(flight))}
          className="min-h-10 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
        >
          {busy ? "Checking…" : flight ? "Refresh Flight" : "Check Flight"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm text-white/75">
          {error ? <p className="text-amber-100">{error}</p> : null}
          {flight ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(flight.statusCategory)}`}
                >
                  {flight.statusLabel || flight.status || "Status"}
                </span>
                {typeof flight.delayMinutes === "number" && flight.delayMinutes > 0 ? (
                  <span className="text-amber-100">
                    Delayed {flight.delayMinutes} min
                  </span>
                ) : null}
              </div>
              <p>
                <span className="text-white/45">Flight</span> {flight.flightNumber}
                {flight.airline ? ` · ${flight.airline}` : ""}
              </p>
              <p>
                <span className="text-white/45">Route</span> {flight.departureAirport} →{" "}
                {flight.arrivalAirport}
              </p>
              <p>
                <span className="text-white/45">Scheduled</span> {flight.scheduledTime}
                {flight.estimatedTime ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-white">
                      Estimated {flight.estimatedTime}
                    </span>
                  </>
                ) : null}
                {flight.actualTime ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-emerald">
                      Actual {flight.actualTime}
                    </span>
                  </>
                ) : null}
              </p>
              {(flight.terminal || flight.gate) && (
                <p>
                  {flight.terminal ? (
                    <>
                      <span className="text-white/45">Terminal</span> {flight.terminal}
                    </>
                  ) : null}
                  {flight.terminal && flight.gate ? " · " : null}
                  {flight.gate ? (
                    <>
                      <span className="text-white/45">Gate</span> {flight.gate}
                    </>
                  ) : null}
                </p>
              )}
              {flight.statusCategory === "landed" ? (
                <p className="font-semibold text-sky-100">Flight has landed.</p>
              ) : null}
              {flight.statusCategory === "cancelled" ? (
                <p className="font-semibold text-red-100">Flight cancelled — contact the customer.</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

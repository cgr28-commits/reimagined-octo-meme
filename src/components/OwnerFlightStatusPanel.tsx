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
 * Prominent Flight Status for airport-collection Owner job cards.
 * Always visible when eligible (including completed history cards).
 * Does not auto-fetch — Check / Refresh only (server-side AeroDataBox cache).
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
      <div
        className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-3"
        data-owner-flight-status="missing"
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-100/90">
          ✈ Flight Status
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          ✈ Flight: No flight number supplied
        </p>
        <p className="mt-1 text-xs text-white/55">
          Airport collection — add a flight number on the booking if you need live status.
        </p>
      </div>
    );
  }

  async function loadFlight(refresh: boolean) {
    if (!context.airportCode) {
      setError("Airport code missing for this collection — cannot look up the flight.");
      setExpanded(true);
      return;
    }
    if (!context.tripDate) {
      setError("Trip date missing — cannot look up the flight.");
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
  const statusLine = flight
    ? ownerFlightCompactSummary({
        flightNumber: flight.flightNumber,
        statusCategory: flight.statusCategory,
        statusLabel: flight.statusLabel,
        estimatedTime: flight.estimatedTime,
        delayMinutes: flight.delayMinutes,
      }).replace(flight.flightNumber, "").replace(/^ · /, "")
    : "Tap Check Flight for live status";

  return (
    <div
      className="mt-3 rounded-xl border border-emerald/35 bg-emerald/10 px-3 py-3"
      data-owner-flight-status="ready"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald">
        ✈ Flight Status
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-white">{displayNumber}</p>
          <p className="mt-0.5 text-sm text-white/75">
            {flight ? (
              <>
                {flight.statusLabel ? (
                  <span
                    className={`mr-2 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(flight.statusCategory)}`}
                  >
                    {flight.statusLabel}
                  </span>
                ) : null}
                {statusLine}
              </>
            ) : (
              statusLine
            )}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {context.airportName}
            {context.airportCode ? ` (${context.airportCode})` : ""}
            {context.isReturnLeg ? " · return collection" : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadFlight(Boolean(flight))}
          className="min-h-11 shrink-0 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
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
                  <span className="font-semibold text-amber-100">
                    Delayed {flight.delayMinutes} min · ETA{" "}
                    {flight.estimatedTime || "—"}
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
                <span className="text-white/45">Scheduled arrival</span>{" "}
                {flight.scheduledTime}
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
                <p className="font-semibold text-red-100">
                  Flight cancelled — contact the customer.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

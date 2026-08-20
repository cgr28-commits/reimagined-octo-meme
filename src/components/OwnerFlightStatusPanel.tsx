"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatFlightNumberForDisplay,
  lookupFlightForBooking,
  type VerifiedFlight,
} from "@/lib/flight-lookup";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { flightStatusAutoRefreshMs } from "../../shared/flight-lookup";
import {
  ownerFlightCompactSummary,
  resolveOwnerFlightLegContext,
  type OwnerFlightBookingFields,
} from "../../shared/owner-flight-status";

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-xl bg-navy/60 text-sm text-white/50">
      Loading map…
    </div>
  ),
});

type OwnerFlightStatusPanelProps = {
  booking: OwnerFlightBookingFields;
  paymentReference?: string;
  ownerKey?: string;
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

function formatLastUpdated(at: number | null): string {
  if (!at) return "";
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 60) return `Last updated ${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `Last updated ${mins} min ago`;
  return `Last updated ${Math.round(mins / 60)}h ago`;
}

/**
 * Operational Flight Status for airport-collection Owner job cards.
 * Auto-refreshes on a throttled interval (server cache); manual Refresh always available.
 */
export default function OwnerFlightStatusPanel({
  booking,
  paymentReference,
  ownerKey,
}: OwnerFlightStatusPanelProps) {
  const context = resolveOwnerFlightLegContext(booking);
  const [expanded, setExpanded] = useState(false);
  const [watchLive, setWatchLive] = useState(false);
  const [flight, setFlight] = useState<VerifiedFlight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const inFlightRef = useRef(false);

  const loadFlight = useCallback(
    async (refresh: boolean) => {
      if (!context.showFlightTracker || context.missingFlightNumber) return;
      if (inFlightRef.current) return;
      if (!context.airportCode || !context.tripDate) {
        setError(
          !context.airportCode
            ? "Airport code missing for this collection — cannot look up the flight."
            : "Trip date missing — cannot look up the flight.",
        );
        setExpanded(true);
        return;
      }
      inFlightRef.current = true;
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
          setLastFetchedAt(Date.now());
          if (ownerKey && paymentReference) {
            void fetch(`${resolveWorkerBaseUrl()}/flights/driver-alerts`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Owner-Key": ownerKey,
              },
              body: JSON.stringify({
                paymentReference,
                flight: result.flight,
                tripDate: context.tripDate,
                isReturnLeg: context.isReturnLeg,
              }),
            }).catch(() => {
              /* non-blocking */
            });
          }
        }
        if (refresh || expanded || watchLive) setExpanded(true);
      } catch (err) {
        setFlight(null);
        setError(err instanceof Error ? err.message : "Could not load flight status");
        setExpanded(true);
      } finally {
        setBusy(false);
        inFlightRef.current = false;
      }
    },
    [
      context.showFlightTracker,
      context.missingFlightNumber,
      context.airportCode,
      context.tripDate,
      context.flightNumber,
      context.direction,
      context.isReturnLeg,
      ownerKey,
      paymentReference,
      expanded,
      watchLive,
    ],
  );

  useEffect(() => {
    if (!context.showFlightTracker || context.missingFlightNumber) return;
    void loadFlight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/eligibility only
  }, [context.showFlightTracker, context.missingFlightNumber, context.flightNumber, context.tripDate]);

  useEffect(() => {
    if (!context.showFlightTracker || context.missingFlightNumber) return;
    const ms = flightStatusAutoRefreshMs({
      statusCategory: flight?.statusCategory,
      tripDate: context.tripDate,
      scheduledTime: flight?.scheduledTime,
    });
    if (!ms) return;
    const id = window.setInterval(() => {
      void loadFlight(false);
    }, ms);
    return () => window.clearInterval(id);
  }, [
    context.showFlightTracker,
    context.missingFlightNumber,
    context.tripDate,
    flight?.statusCategory,
    flight?.scheduledTime,
    loadFlight,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

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
      </div>
    );
  }

  const displayNumber = formatFlightNumberForDisplay(context.flightNumber);
  const compactLine = flight
    ? flight.statusCategory === "landed"
      ? `LANDED · Actual ${flight.actualTime || "—"}`
      : flight.statusCategory === "cancelled"
        ? "CANCELLED"
        : ownerFlightCompactSummary({
            flightNumber: "",
            statusCategory: flight.statusCategory,
            statusLabel: flight.statusLabel,
            estimatedTime: flight.estimatedTime,
            delayMinutes: flight.delayMinutes,
          }).replace(/^ · /, "") ||
          flight.statusLabel ||
          "Status"
    : "Checking flight…";

  const hasPosition =
    flight?.position &&
    typeof flight.position.lat === "number" &&
    typeof flight.position.lng === "number";

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
          <p className="mt-0.5 text-sm text-white/80">
            {flight?.statusLabel ? (
              <span
                className={`mr-2 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(flight.statusCategory)}`}
              >
                {flight.statusLabel}
              </span>
            ) : null}
            {compactLine}
          </p>
          {flight?.statusCategory === "landed" ? (
            <p className="mt-1 text-xs text-white/60">
              Scheduled {flight.scheduledTime}
              {flight.actualTime ? ` · Arrived ${flight.actualTime}` : ""}
              {typeof flight.delayMinutes === "number" && flight.delayMinutes > 0
                ? ` · ${flight.delayMinutes} min late`
                : ""}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-white/45">
            {context.airportName}
            {context.airportCode ? ` (${context.airportCode})` : ""}
            {context.isReturnLeg ? " · return collection" : ""}
            {lastFetchedAt ? ` · ${formatLastUpdated(lastFetchedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setWatchLive(true);
              setExpanded(true);
              void loadFlight(true);
            }}
            className="min-h-11 rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:opacity-60"
          >
            Watch Live
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadFlight(true)}
            className="min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Refresh Flight"}
          </button>
        </div>
      </div>

      {watchLive ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Live aircraft map
          </p>
          {hasPosition && flight?.position ? (
            <>
              <LiveTrackMap
                markers={[
                  {
                    lat: flight.position.lat,
                    lng: flight.position.lng,
                    label: displayNumber,
                  },
                ]}
              />
              <p className="text-sm text-white/75">
                {displayNumber}
                {" · "}
                {flight.departureAirport} → {flight.arrivalAirport}
              </p>
              <p className="text-xs text-white/55">
                {typeof flight.position.altitudeFt === "number"
                  ? `Alt ${Math.round(flight.position.altitudeFt)} ft`
                  : "Alt —"}
                {" · "}
                {typeof flight.position.groundSpeedKts === "number"
                  ? `${Math.round(flight.position.groundSpeedKts)} kts`
                  : "Speed —"}
                {" · "}
                {typeof flight.position.headingDeg === "number"
                  ? `Hdg ${Math.round(flight.position.headingDeg)}°`
                  : "Hdg —"}
                {flight.position.updatedAt
                  ? ` · Position @ ${flight.position.updatedAt}`
                  : ""}
              </p>
              <p className="text-xs text-white/40">
                Only coordinates returned by AeroDataBox are plotted — no interpolated track.
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-white/10 bg-navy/40 px-3 py-3 text-sm text-white/65">
              Live aircraft position unavailable
            </p>
          )}
          <button
            type="button"
            onClick={() => setWatchLive(false)}
            className="text-xs font-semibold text-white/50 hover:text-white"
          >
            Hide map
          </button>
        </div>
      ) : null}

      {expanded && !watchLive ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm text-white/75">
          {error ? <p className="text-amber-100">{error}</p> : null}
          {flight ? (
            <>
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
                {flight.estimatedTime && flight.statusCategory !== "landed" ? (
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
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

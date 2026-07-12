"use client";

import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "@/lib/paths";

type FlightType = "arrivals" | "departures";

type FlightRecord = {
  flight_iata: string | null;
  dep_iata: string | null;
  arr_iata: string | null;
  dep_time: string | null;
  arr_time: string | null;
  dep_estimated: string | null;
  arr_estimated: string | null;
  dep_delayed: number | null;
  arr_delayed: number | null;
  status: string | null;
};

type FlightBoardPayload = {
  fetchedAt?: string;
  source?: string;
  flights?: FlightRecord[];
  error?: string;
};

type FlightWidgetProps = {
  iata: string;
  type: FlightType;
  officialBoardUrl: string;
};

const REFRESH_MS = 60_000;
const STALE_MS = 60 * 60 * 1000;

function formatTime(value: string | null): string {
  if (!value) return "—";
  const match = value.match(/(\d{2}:\d{2})/);
  return match ? match[1] : value;
}

function formatStatus(status: string | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function statusClass(status: string | null): string {
  switch (status?.toLowerCase()) {
    case "landed":
    case "arrived":
    case "active":
    case "departed":
      return "flight-status-badge flight-status-badge--success";
    case "scheduled":
    case "expected":
      return "flight-status-badge flight-status-badge--neutral";
    case "delayed":
      return "flight-status-badge flight-status-badge--warning";
    case "cancelled":
    case "canceled":
    case "diverted":
      return "flight-status-badge flight-status-badge--danger";
    default:
      return "flight-status-badge flight-status-badge--neutral";
  }
}

function getDisplayTime(flight: FlightRecord, type: FlightType): string {
  if (type === "arrivals") {
    return formatTime(flight.arr_estimated || flight.arr_time);
  }
  return formatTime(flight.dep_estimated || flight.dep_time);
}

function getRouteCode(flight: FlightRecord, type: FlightType): string {
  return type === "arrivals" ? flight.dep_iata ?? "—" : flight.arr_iata ?? "—";
}

function isDelayed(flight: FlightRecord, type: FlightType): boolean {
  return Boolean(type === "arrivals" ? flight.arr_delayed : flight.dep_delayed);
}

function parseFetchedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function FlightWidget({ iata, type, officialBoardUrl }: FlightWidgetProps) {
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  const loadFlights = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${withBasePath(`/flight-data/${iata}-${type}.json`)}?t=${Date.now()}`,
        { signal, cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Flight data unavailable (${response.status})`);
      }

      const data = (await response.json()) as FlightBoardPayload | FlightRecord[];
      const payload: FlightBoardPayload = Array.isArray(data) ? { flights: data } : data;
      const records = payload.flights;

      if (!Array.isArray(records)) {
        throw new Error("Unexpected flight data format");
      }

      if (records.length === 0) {
        throw new Error(payload.error ?? "No flights available right now");
      }

      const fetchedAt = parseFetchedAt(payload.fetchedAt);
      setFlights(records.slice(0, 25));
      setLastUpdated(fetchedAt ?? new Date());
      setIsStale(Boolean(fetchedAt && Date.now() - fetchedAt.getTime() > STALE_MS));
    } catch (err) {
      if (signal?.aborted) return;
      setFlights([]);
      setIsStale(false);
      setError(err instanceof Error ? err.message : "Unable to load flight data");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [iata, type]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFlights(controller.signal);

    const interval = setInterval(() => {
      void loadFlights();
    }, REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadFlights]);

  if (loading && flights.length === 0) {
    return (
      <div className="flight-board flight-board--loading" aria-busy="true">
        <div className="flex items-center justify-center gap-3 py-16 text-white/60">
          <span className="flight-board-spinner" aria-hidden="true" />
          <span>Loading {type} for {iata}…</span>
        </div>
      </div>
    );
  }

  if (error && flights.length === 0) {
    return (
      <div className="flight-board flight-board--error">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
          <p className="text-base font-semibold text-white">Unable to load live flights</p>
          <p className="mt-2 text-sm text-white/50">{error}</p>
          <p className="mt-2 text-sm text-white/40">
            Live flight boards are updated on each site deploy. For the latest official times, use
            the airport board below.
          </p>
          <a
            href={officialBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-emerald-light"
          >
            View official {iata} flight board
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flight-board" aria-label={`${iata} ${type} flight board`}>
      {isStale ? (
        <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
          Flight times may be out of date.{" "}
          <a
            href={officialBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-amber-100 underline-offset-2 hover:underline"
          >
            Check the official {iata} board
          </a>{" "}
          for the latest information.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="flight-board-table w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Flight</th>
              <th className="px-4 py-3 font-semibold">
                {type === "arrivals" ? "From" : "To"}
              </th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((flight, index) => (
              <tr key={`${flight.flight_iata ?? "flight"}-${index}`}>
                <td className="px-4 py-3 font-medium text-white">
                  {getDisplayTime(flight, type)}
                  {isDelayed(flight, type) ? (
                    <span className="ml-2 text-xs text-amber-300">Delayed</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-semibold text-emerald">
                  {flight.flight_iata ?? "—"}
                </td>
                <td className="px-4 py-3 text-white/80">{getRouteCode(flight, type)}</td>
                <td className="px-4 py-3">
                  <span className={statusClass(flight.status)}>
                    {formatStatus(flight.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
        <p>
          Showing {flights.length} {type}
          {lastUpdated
            ? ` · Updated ${lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={officialBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-white/60 transition-colors hover:border-emerald/30 hover:text-emerald"
          >
            Official board
          </a>
          <button
            type="button"
            onClick={() => void loadFlights()}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-white/60 transition-colors hover:border-emerald/30 hover:text-emerald disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

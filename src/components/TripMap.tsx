"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AIRPORTS } from "@/lib/data";
import { isGooglePlacesEnabled } from "@/lib/google-maps";
import { resolveRoutePoint } from "@/lib/route-point-resolver";
import {
  fetchTripRouteMetrics,
  formatJourneyDistance,
  formatJourneyDuration,
  formatJourneyDurationApprox,
  type TripRouteMetrics,
} from "@/lib/trip-route";

const TripMapView = dynamic(() => import("@/components/TripMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center bg-white/5 sm:h-56">
      <p className="text-sm text-white/60">Loading map…</p>
    </div>
  ),
});

type TripMode = "airport" | "address";
type AirportTripDirection = "to-airport" | "from-airport";

type TripMapProps = {
  tripMode: TripMode;
  originAddress: string;
  destinationAddress: string;
  airportCode?: string;
  tripDirection?: AirportTripDirection;
  onRouteMetrics?: (metrics: TripRouteMetrics | null) => void;
  /** Compact distance/time line with optional map expand (default for quote form). */
  variant?: "full" | "summary";
  /** Optional DOM id for the summary card (e.g. quote-route-summary). */
  id?: string;
  /** Prefer selected-place coordinates over re-geocoding the visible address string. */
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
};

type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

function buildGoogleMapsLink(origin: string, destination: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

async function resolveMapPoint(
  address: string,
  label: string,
  airportCode?: string,
  lat?: number | null,
  lng?: number | null,
): Promise<MapPoint | null> {
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng, label };
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  const airport = airportCode
    ? AIRPORTS.find((item) => item.code === airportCode && item.mapLabel === trimmed)
    : null;

  if (airport) {
    return {
      lat: airport.mapLocation.lat,
      lng: airport.mapLocation.lng,
      label: airport.name,
    };
  }

  // Shared resolver: recognises served airports by text, then falls back to
  // geocoding — same resolution Quick Quote / Personal Quotes use.
  const location = await resolveRoutePoint(trimmed);
  if (!location) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
    label,
  };
}

export default function TripMap({
  tripMode,
  originAddress,
  destinationAddress,
  airportCode = "",
  tripDirection = "to-airport",
  onRouteMetrics,
  variant = "full",
  id,
  originLat = null,
  originLng = null,
  destinationLat = null,
  destinationLng = null,
}: TripMapProps) {
  const trimmedOrigin = originAddress.trim();
  const trimmedDestination = destinationAddress.trim();
  const [originPoint, setOriginPoint] = useState<MapPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<MapPoint | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);
  const [showMap, setShowMap] = useState(false);

  const airport = useMemo(
    () => AIRPORTS.find((item) => item.code === airportCode) ?? null,
    [airportCode],
  );

  const links = useMemo(() => {
    if (!trimmedOrigin || !trimmedDestination) {
      return null;
    }

    if (tripMode === "airport" && airport) {
      return {
        mapsLink: buildGoogleMapsLink(trimmedOrigin, trimmedDestination),
        routeLabel:
          tripDirection === "to-airport"
            ? `Pickup to ${airport.name}`
            : `${airport.name} to your drop-off`,
      };
    }

    return {
      mapsLink: buildGoogleMapsLink(trimmedOrigin, trimmedDestination),
      routeLabel: "Pickup to drop-off",
    };
  }, [airport, tripDirection, tripMode, trimmedDestination, trimmedOrigin]);

  useEffect(() => {
    if (!isGooglePlacesEnabled() || !trimmedOrigin || !trimmedDestination) {
      setOriginPoint(null);
      setDestinationPoint(null);
      setMapError(null);
      setRouteMetrics(null);
      onRouteMetrics?.(null);
      return;
    }

    const originLongEnough = trimmedOrigin.length >= 8;
    const destinationLongEnough = trimmedDestination.length >= 8;
    if (!originLongEnough || !destinationLongEnough) {
      setOriginPoint(null);
      setDestinationPoint(null);
      setMapError(null);
      setRouteMetrics(null);
      onRouteMetrics?.(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([
        resolveMapPoint(trimmedOrigin, "Pickup", airportCode, originLat, originLng),
        resolveMapPoint(
          trimmedDestination,
          "Drop-off",
          airportCode,
          destinationLat,
          destinationLng,
        ),
      ])
        .then(async ([origin, destination]) => {
          if (cancelled) {
            return;
          }

          if (!origin || !destination) {
            setOriginPoint(origin);
            setDestinationPoint(destination);
            setMapError("Could not locate one or both addresses on the map yet.");
            setRouteMetrics(null);
            onRouteMetrics?.(null);
            return;
          }

          setOriginPoint(origin);
          setDestinationPoint(destination);
          setMapError(null);

          const metrics = await fetchTripRouteMetrics(
            origin.lat,
            origin.lng,
            destination.lat,
            destination.lng,
          );
          if (!cancelled) {
            setRouteMetrics(metrics);
            onRouteMetrics?.(metrics);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOriginPoint(null);
            setDestinationPoint(null);
            setMapError("Map preview unavailable right now.");
            setRouteMetrics(null);
            onRouteMetrics?.(null);
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    airportCode,
    destinationLat,
    destinationLng,
    onRouteMetrics,
    originLat,
    originLng,
    trimmedDestination,
    trimmedOrigin,
  ]);

  if (!links || trimmedOrigin.length < 8 || trimmedDestination.length < 8) {
    return null;
  }

  if (variant === "summary") {
    return (
      <div
        id={id}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        style={{ overflowAnchor: "none" }}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-emerald">Your Route</p>
        <p className="mt-1 text-sm text-white/70">{links.routeLabel}</p>
        {routeMetrics ? (
          <p className="mt-1.5 text-sm font-semibold text-white">
            {formatJourneyDistance(routeMetrics.distanceKm)}
            <span className="mx-2 font-normal text-white/40">·</span>
            {formatJourneyDurationApprox(routeMetrics.durationMinutes)}
          </p>
        ) : originPoint && destinationPoint ? (
          <p className="mt-1.5 text-xs text-white/50">Calculating distance and time…</p>
        ) : mapError ? (
          <p className="mt-1.5 text-xs text-white/50">{mapError}</p>
        ) : (
          <p className="mt-1.5 text-xs text-white/50">Finding your addresses…</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setShowMap((open) => !open)}
            className="text-sm font-medium text-emerald transition-colors hover:text-emerald-light"
          >
            {showMap ? "Hide route" : "View route"}
          </button>
          <a
            href={links.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white/55 transition-colors hover:text-emerald"
          >
            Open in Google Maps
          </a>
        </div>

        {showMap ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            {originPoint && destinationPoint ? (
              <TripMapView pickup={originPoint} airport={destinationPoint} />
            ) : (
              <div className="flex h-40 items-center justify-center px-4 text-center">
                <p className="text-sm text-white/60">
                  {mapError ?? "Finding your addresses on the map…"}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald">Your Route</p>
        <p className="mt-1 text-sm text-white/70">{links.routeLabel}</p>
        {routeMetrics ? (
          <p className="mt-1.5 text-sm font-semibold text-white">
            {formatJourneyDistance(routeMetrics.distanceKm)}
            <span className="mx-2 font-normal text-white/40">·</span>
            {formatJourneyDuration(routeMetrics.durationMinutes)}
            <span className="ml-1.5 text-xs font-normal text-white/50">(approx.)</span>
          </p>
        ) : originPoint && destinationPoint ? (
          <p className="mt-1.5 text-xs text-white/50">Calculating distance and time…</p>
        ) : null}
      </div>

      {originPoint && destinationPoint ? (
        <TripMapView pickup={originPoint} airport={destinationPoint} />
      ) : (
        <div className="flex h-48 items-center justify-center px-4 text-center sm:h-56">
          <p className="text-sm text-white/60">
            {mapError ?? "Finding your addresses on the map…"}
          </p>
        </div>
      )}

      <div className="border-t border-white/10 px-4 py-3">
        <a
          href={links.mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-emerald transition-colors hover:text-emerald-light"
        >
          Open turn-by-turn directions in Google Maps
        </a>
      </div>
    </div>
  );
}

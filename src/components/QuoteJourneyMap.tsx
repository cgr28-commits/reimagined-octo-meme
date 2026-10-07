"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const TripMapView = dynamic(() => import("@/components/TripMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center">
      <p className="text-sm text-white/70">Loading map…</p>
    </div>
  ),
});

export type QuoteMapPoint = {
  lat: number;
  lng: number;
  label: string;
};

/**
 * In-page journey map. Coordinates come from the address already chosen
 * and the stored airport point. The driving line is the existing OSRM
 * route, requested only after the customer opens the map. It does not
 * recalculate the fare.
 */
export default function QuoteJourneyMap({
  origin,
  destination,
  durationLabel,
  fallbackHref,
}: {
  origin: QuoteMapPoint | null;
  destination: QuoteMapPoint | null;
  durationLabel: string;
  fallbackHref: string | null;
}) {
  const [routeDrawn, setRouteDrawn] = useState<boolean | null>(null);
  const ready = origin != null && destination != null;

  return (
    <div
      id="quote-journey-map"
      data-quote-route-map
      className="overflow-hidden rounded-2xl border border-white/20 bg-[#07182e]"
      style={{ overflowAnchor: "none" }}
    >
      <div className="flex items-baseline justify-between gap-3 px-3 py-2">
        <p className="min-w-0 truncate text-xs font-medium text-white/80">
          {ready ? `${origin.label} → ${destination.label}` : "Your journey"}
        </p>
        {durationLabel ? (
          <p className="shrink-0 text-xs font-semibold text-white" data-quote-route-time>
            {durationLabel}
          </p>
        ) : null}
      </div>
      {ready ? (
        <TripMapView
          pickup={origin}
          airport={destination}
          className="h-[280px] w-full"
          onRouteDrawn={setRouteDrawn}
        />
      ) : (
        <div className="flex h-[280px] items-center justify-center px-4 text-center">
          <p className="text-sm text-white/75">We couldn&apos;t place this journey on the map.</p>
        </div>
      )}
      {!ready || routeDrawn === false ? (
        fallbackHref ? (
          <div className="border-t border-white/10 px-3 py-2 text-center">
            <a
              href={fallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              data-quote-route-fallback
              className="text-xs font-semibold text-emerald underline-offset-2 hover:underline"
            >
              Open this journey in Google Maps
            </a>
          </div>
        ) : null
      ) : null}
    </div>
  );
}

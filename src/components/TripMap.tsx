"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AIRPORTS } from "@/lib/data";
import { geocodePickupAddress, isGooglePlacesEnabled } from "@/lib/google-maps";

const TripMapView = dynamic(() => import("@/components/TripMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center bg-white/5 sm:h-56">
      <p className="text-sm text-white/60">Loading map…</p>
    </div>
  ),
});

type TripMapProps = {
  pickup: string;
  airportCode: string;
  tripDirection: "to-airport" | "from-airport";
};

type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

function buildGoogleMapsLink(
  pickup: string,
  airportCode: string,
  tripDirection: TripMapProps["tripDirection"],
) {
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return null;
  }

  const origin = tripDirection === "to-airport" ? pickup : airport.mapLabel;
  const destination = tripDirection === "to-airport" ? airport.mapLabel : pickup;

  return {
    mapsLink: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`,
    airportName: airport.name,
  };
}

export default function TripMap({ pickup, airportCode, tripDirection }: TripMapProps) {
  const trimmedPickup = pickup.trim();
  const [pickupPoint, setPickupPoint] = useState<MapPoint | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const airport = useMemo(
    () => AIRPORTS.find((item) => item.code === airportCode) ?? null,
    [airportCode],
  );

  const links = useMemo(
    () =>
      trimmedPickup && airportCode
        ? buildGoogleMapsLink(trimmedPickup, airportCode, tripDirection)
        : null,
    [airportCode, tripDirection, trimmedPickup],
  );

  useEffect(() => {
    if (!trimmedPickup || trimmedPickup.length < 8 || !airport || !isGooglePlacesEnabled()) {
      setPickupPoint(null);
      setMapError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void geocodePickupAddress(trimmedPickup)
        .then((location) => {
          if (cancelled) {
            return;
          }

          if (!location) {
            setPickupPoint(null);
            setMapError("Could not locate this address on the map yet.");
            return;
          }

          setPickupPoint({
            lat: location.lat,
            lng: location.lng,
            label: tripDirection === "to-airport" ? "Pickup" : "Drop-off",
          });
          setMapError(null);
        })
        .catch(() => {
          if (!cancelled) {
            setPickupPoint(null);
            setMapError("Map preview unavailable right now.");
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [airport, tripDirection, trimmedPickup]);

  if (!trimmedPickup || !airportCode || trimmedPickup.length < 8 || !links || !airport) {
    return null;
  }

  const airportPoint: MapPoint = {
    lat: airport.mapLocation.lat,
    lng: airport.mapLocation.lng,
    label: airport.name,
  };

  const mapPickup =
    tripDirection === "to-airport"
      ? pickupPoint
      : airportPoint;
  const mapAirport =
    tripDirection === "to-airport"
      ? airportPoint
      : pickupPoint;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald">Your route</p>
        <p className="mt-1 text-sm text-white/70">
          {tripDirection === "to-airport"
            ? `Pickup to ${links.airportName}`
            : `${links.airportName} to your drop-off`}
        </p>
      </div>

      {mapPickup && mapAirport ? (
        <TripMapView pickup={mapPickup} airport={mapAirport} />
      ) : (
        <div className="flex h-48 items-center justify-center px-4 text-center sm:h-56">
          <p className="text-sm text-white/60">
            {mapError ?? "Finding your address on the map…"}
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

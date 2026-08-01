"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  fetchDrivingRoute,
  type MapPoint,
  type RouteSummary,
  summariseRoute,
} from "@/lib/trip-route";

type TripMapViewProps = {
  pickup: MapPoint;
  airport: MapPoint;
  returnJourney?: boolean;
  onRouteInfo?: (summary: RouteSummary | null) => void;
};

function configureLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export default function TripMapView({
  pickup,
  airport,
  returnJourney = false,
  onRouteInfo,
}: TripMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    onRouteInfo?.(null);
  }, [onRouteInfo, pickup.lat, pickup.lng, airport.lat, airport.lng, returnJourney]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    configureLeafletIcons();

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const pickupMarker = L.marker([pickup.lat, pickup.lng]).addTo(map);
    pickupMarker.bindPopup(pickup.label);

    const airportMarker = L.marker([airport.lat, airport.lng]).addTo(map);
    airportMarker.bindPopup(airport.label);

    const bounds = L.latLngBounds([
      [pickup.lat, pickup.lng],
      [airport.lat, airport.lng],
    ]);

    let cancelled = false;

    void fetchDrivingRoute(pickup, airport).then((route) => {
      if (cancelled) {
        return;
      }

      if (route?.coordinates.length) {
        const latLngs = route.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polyline(latLngs, { color: "#2fbf4a", weight: 4, opacity: 0.85 }).addTo(map);
        bounds.extend(latLngs);
        onRouteInfo?.(summariseRoute(route, returnJourney));
      } else {
        L.polyline(
          [
            [pickup.lat, pickup.lng],
            [airport.lat, airport.lng],
          ],
          { color: "#2fbf4a", weight: 4, opacity: 0.85, dashArray: "8 8" },
        ).addTo(map);
        onRouteInfo?.(null);
      }

      map.fitBounds(bounds, { padding: [24, 24] });
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [airport, onRouteInfo, pickup, returnJourney]);

  return <div ref={containerRef} className="h-48 w-full sm:h-56" />;
}

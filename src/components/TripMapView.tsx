"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

type TripMapViewProps = {
  pickup: MapPoint;
  airport: MapPoint;
};

type RouteGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

function configureLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

async function fetchRouteCoordinates(
  pickup: MapPoint,
  airport: MapPoint,
): Promise<[number, number][]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${airport.lng},${airport.lat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      routes?: Array<{ geometry?: RouteGeometry }>;
    };

    return data.routes?.[0]?.geometry?.coordinates ?? [];
  } catch {
    return [];
  }
}

export default function TripMapView({ pickup, airport }: TripMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

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

    void fetchRouteCoordinates(pickup, airport).then((coordinates) => {
      if (coordinates.length > 0) {
        const latLngs = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polyline(latLngs, { color: "#2fbf4a", weight: 4, opacity: 0.85 }).addTo(map);
        bounds.extend(latLngs);
      } else {
        L.polyline(
          [
            [pickup.lat, pickup.lng],
            [airport.lat, airport.lng],
          ],
          { color: "#2fbf4a", weight: 4, opacity: 0.85, dashArray: "8 8" },
        ).addTo(map);
      }

      map.fitBounds(bounds, { padding: [24, 24] });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [airport, pickup]);

  return <div ref={containerRef} className="h-48 w-full sm:h-56" />;
}

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
};

type LiveTrackMapProps = {
  markers: MapMarker[];
};

function configureLeafletIcons() {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function createCustomerIcon() {
  return L.divIcon({
    className: "",
    html: '<div style="width:18px;height:18px;border-radius:50%;background:#34d399;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function LiveTrackMap({ markers }: LiveTrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    configureLeafletIcons();

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
    }

    return () => {
      const map = mapRef.current;
      const markers = markerRefs.current;
      map?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length === 0) {
      return;
    }

    const activeKeys = new Set<string>();

    for (const marker of markers) {
      const key = marker.label;
      activeKeys.add(key);
      const position: L.LatLngExpression = [marker.lat, marker.lng];
      const isCustomer = marker.label.toLowerCase().includes("customer");
      let leafletMarker = markerRefs.current.get(key);

      if (!leafletMarker) {
        leafletMarker = L.marker(position, isCustomer ? { icon: createCustomerIcon() } : undefined).addTo(
          map,
        );
        markerRefs.current.set(key, leafletMarker);
      } else {
        leafletMarker.setLatLng(position);
      }

      leafletMarker.bindPopup(marker.label);
    }

    for (const [key, leafletMarker] of markerRefs.current.entries()) {
      if (!activeKeys.has(key)) {
        leafletMarker.remove();
        markerRefs.current.delete(key);
      }
    }

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 14, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
  }, [markers]);

  return <div ref={containerRef} className="h-64 w-full rounded-xl sm:h-80" />;
}

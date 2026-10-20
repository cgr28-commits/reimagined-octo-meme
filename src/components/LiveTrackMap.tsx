"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { withBasePath } from "@/lib/paths";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
};

export type MapRoutePoint = {
  lat: number;
  lng: number;
};

type LiveTrackMapProps = {
  markers: MapMarker[];
  route?: MapRoutePoint[];
  /** Optional height/layout override. Default matches live tracking cards. */
  className?: string;
};

function createDriverIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:64px;height:80px;filter:drop-shadow(0 2px 3px #0005)"><div style="position:absolute;left:19px;top:54px;width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:24px solid #2FBF4A"></div><div style="position:absolute;left:2px;top:0;width:60px;height:60px;box-sizing:border-box;border-radius:50%;border:3px solid #2FBF4A;background:white;display:flex;align-items:center;justify-content:center"><img src="${withBasePath("/logo-light-header.webp")}" alt="My Airport Taxi NI" width="48" height="38" style="width:48px;height:38px;object-fit:contain" /></div></div>`,
    iconSize: [64, 80],
    iconAnchor: [32, 78],
    popupAnchor: [0, -80],
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

export default function LiveTrackMap({
  markers,
  route = [],
  className,
}: LiveTrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const routeRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

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
      const markersMap = markerRefs.current;
      routeRef.current?.remove();
      routeRef.current = null;
      map?.remove();
      mapRef.current = null;
      markersMap.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (route.length >= 2) {
      const latLngs = route.map((point) => [point.lat, point.lng] as L.LatLngTuple);
      if (!routeRef.current) {
        routeRef.current = L.polyline(latLngs, {
          color: "#34d399",
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
      } else {
        routeRef.current.setLatLngs(latLngs);
      }
    } else {
      routeRef.current?.remove();
      routeRef.current = null;
    }
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
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
        leafletMarker = L.marker(position, { icon: isCustomer ? createCustomerIcon() : createDriverIcon(), title: marker.label }).addTo(
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

    const fitPoints: L.LatLngTuple[] = [
      ...markers.map((marker) => [marker.lat, marker.lng] as L.LatLngTuple),
      ...route.map((point) => [point.lat, point.lng] as L.LatLngTuple),
    ];

    if (fitPoints.length === 0) {
      return;
    }

    if (fitPoints.length === 1) {
      map.setView(fitPoints[0], 14, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(fitPoints);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
  }, [markers, route]);

  return (
    <div
      ref={containerRef}
      className={className?.trim() || "h-64 w-full rounded-xl sm:h-80"}
    />
  );
}

"use client";

/**
 * Customer map for Find Your Driver.
 *
 * OpenStreetMap tile usage policy: attribution always visible, a referrer is
 * sent (origin only — this page uses Referrer-Policy strict-origin), tiles are
 * not prefetched or bulk-downloaded, standard browser caching, and the tile URL
 * can be switched without a code change (NEXT_PUBLIC_MAP_TILE_URL).
 *
 * The driver marker jumps to each real update. It never animates or
 * interpolates between points, and turns grey when the position is stale.
 */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export type FindDriverMapProps = {
  airport: { lat: number; lng: number; name: string };
  driver: { lat: number; lng: number; accuracyM: number; lastKnown: boolean } | null;
};

function driverIcon(lastKnown: boolean) {
  const colour = lastKnown ? "#8A94A6" : "#2FBF4A";
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${colour};border:4px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const airportIcon = () =>
  L.divIcon({
    className: "",
    html: '<div style="width:18px;height:18px;border-radius:4px;background:#071C38;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export default function FindDriverMap({ airport, driver }: FindDriverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
    } as L.TileLayerOptions).addTo(map);
    L.marker([airport.lat, airport.lng], { icon: airportIcon(), title: airport.name, keyboard: false })
      .bindTooltip(airport.name)
      .addTo(map);
    map.setView([airport.lat, airport.lng], 15);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      driverRef.current = null;
      circleRef.current = null;
      fittedRef.current = false;
    };
  }, [airport.lat, airport.lng, airport.name]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driver) {
      driverRef.current?.remove();
      circleRef.current?.remove();
      driverRef.current = null;
      circleRef.current = null;
      return;
    }
    const at: L.LatLngExpression = [driver.lat, driver.lng];
    if (!driverRef.current) {
      driverRef.current = L.marker(at, { icon: driverIcon(driver.lastKnown), title: "Your driver", keyboard: false }).addTo(map);
      circleRef.current = L.circle(at, {
        radius: driver.accuracyM,
        color: "#2FBF4A",
        weight: 1,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    } else {
      driverRef.current.setLatLng(at).setIcon(driverIcon(driver.lastKnown));
      circleRef.current?.setLatLng(at).setRadius(driver.accuracyM);
    }
    circleRef.current?.setStyle({ color: driver.lastKnown ? "#8A94A6" : "#2FBF4A" });
    if (!fittedRef.current) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds([at, [airport.lat, airport.lng]]).pad(0.35), { maxZoom: 17 });
    }
  }, [airport.lat, airport.lng, driver]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={driver ? "Map showing your driver's approximate location and the airport" : "Map of the airport"}
      style={{ height: "min(52vh, 420px)", width: "100%", borderRadius: 16, overflow: "hidden" }}
      data-testid="find-driver-map"
    />
  );
}

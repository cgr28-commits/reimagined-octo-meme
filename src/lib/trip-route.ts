import { AIRPORTS } from "@/lib/data";
import { geocodePickupAddress } from "@/lib/google-maps";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type RouteInfo = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

export type RouteSummary = {
  distanceLabel: string;
  durationLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

export async function resolveMapPoint(
  address: string,
  label: string,
  airportCode?: string,
): Promise<MapPoint | null> {
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

  const location = await geocodePickupAddress(trimmed);
  if (!location) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
    label,
  };
}

export async function fetchDrivingRoute(
  origin: Pick<MapPoint, "lat" | "lng">,
  destination: Pick<MapPoint, "lat" | "lng">,
): Promise<RouteInfo | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: {
          type: "LineString";
          coordinates: [number, number][];
        };
      }>;
    };

    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      return null;
    }

    return {
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration ?? 0,
      coordinates: route.geometry.coordinates,
    };
  } catch {
    return null;
  }
}

export function formatRouteDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 10) {
    return `${miles.toFixed(1)} miles`;
  }

  return `${Math.round(miles)} miles`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} mins`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) {
    return `${hours} hr${hours > 1 ? "s" : ""}`;
  }

  return `${hours} hr${hours > 1 ? "s" : ""} ${remaining} mins`;
}

export function summariseRoute(
  route: Pick<RouteInfo, "distanceMeters" | "durationSeconds">,
  returnJourney = false,
): RouteSummary {
  const distanceMeters = returnJourney ? route.distanceMeters * 2 : route.distanceMeters;
  const durationSeconds = returnJourney ? route.durationSeconds * 2 : route.durationSeconds;

  return {
    distanceMeters,
    durationSeconds,
    distanceLabel: formatRouteDistance(distanceMeters),
    durationLabel: formatRouteDuration(durationSeconds),
  };
}

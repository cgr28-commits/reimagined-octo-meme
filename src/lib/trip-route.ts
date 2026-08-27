export type TripRouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
  }>;
};

/** Public OSRM endpoints — Cloudflare Workers often cannot reach project-osrm.org. */
const OSRM_ROUTE_BASES = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
] as const;

/**
 * NI roads are rarely near great-circle distance. Empirically Knocknagoney→BFS
 * is ~1.47× haversine; 1.48 keeps the BFS >20-mile floor honest when OSRM is down
 * without pushing City Hall→BFS over the gate.
 */
const ROAD_DISTANCE_FACTOR = 1.48;
/** Assumed average speed when estimating duration without OSRM (km/h). */
const ESTIMATED_AVG_SPEED_KMH = 48;

function haversineKm(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(destinationLat - originLat);
  const dLng = toRad(destinationLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destinationLat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(a));
}

function estimateTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): TripRouteMetrics | null {
  const straightKm = haversineKm(originLat, originLng, destinationLat, destinationLng);
  if (!Number.isFinite(straightKm) || straightKm < 0.3) {
    return null;
  }
  const distanceKm = straightKm * ROAD_DISTANCE_FACTOR;
  const durationMinutes = (distanceKm / ESTIMATED_AVG_SPEED_KMH) * 60;
  return { distanceKm, durationMinutes };
}

async function fetchOsrmTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<TripRouteMetrics | null> {
  const path =
    `${originLng},${originLat};${destinationLng},${destinationLat}?overview=false`;

  for (const base of OSRM_ROUTE_BASES) {
    try {
      const response = await fetch(`${base}/${path}`);
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as OsrmRouteResponse;
      const route = data.routes?.[0];
      if (!route?.distance || !route.duration) {
        continue;
      }

      return {
        distanceKm: route.distance / 1000,
        durationMinutes: route.duration / 60,
      };
    } catch {
      // Try the next mirror (Workers often block one host but not another).
    }
  }

  return null;
}

export async function fetchTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<TripRouteMetrics | null> {
  const osrm = await fetchOsrmTripRouteMetrics(
    originLat,
    originLng,
    destinationLat,
    destinationLng,
  );
  if (osrm) {
    return osrm;
  }

  // Last resort when OSRM is unreachable (common from Cloudflare Workers).
  return estimateTripRouteMetrics(
    originLat,
    originLng,
    destinationLat,
    destinationLng,
  );
}

export function formatJourneyDistance(distanceKm: number): string {
  const miles = distanceKm * 0.621371;
  if (miles < 10) {
    return `${miles.toFixed(1)} miles`;
  }

  return `${Math.round(miles)} miles`;
}

export function formatJourneyDuration(durationMinutes: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

/**
 * Customer-facing YOUR ROUTE line — time only, no mileage.
 * e.g. "Journey time: approx. 18 mins"
 */
export function formatRouteCardJourneyTime(durationMinutes: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `Journey time: approx. ${totalMinutes} mins`;
  }

  if (minutes === 0) {
    return `Journey time: approx. ${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }

  return `Journey time: approx. ${hours} ${hours === 1 ? "hr" : "hrs"} ${minutes} mins`;
}

/** Longer copy for route summaries, e.g. "approximately 25 minutes". */
export function formatJourneyDurationApprox(durationMinutes: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `approximately ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }

  if (minutes === 0) {
    return `approximately ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `approximately ${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${
    minutes === 1 ? "minute" : "minutes"
  }`;
}

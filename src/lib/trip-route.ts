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

export async function fetchTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<TripRouteMetrics | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${originLng},${originLat};${destinationLng},${destinationLat}?overview=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OsrmRouteResponse;
    const route = data.routes?.[0];
    if (!route?.distance || !route.duration) {
      return null;
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
    };
  } catch {
    return null;
  }
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

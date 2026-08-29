/**
 * Accept browser-resolved road metrics for authoritative pricing when the
 * Worker cannot reach OSRM. Haversine/estimate metrics are rejected.
 */

export type ClientRouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
  source?: "osrm" | "estimate";
};

export function parseClientRouteMetrics(value: unknown): ClientRouteMetrics | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const distanceKm = Number(record.distanceKm);
  const durationMinutes = Number(record.durationMinutes);
  const source = record.source;
  // Never price from haversine×1.48 display estimates.
  if (source === "estimate") {
    return null;
  }
  if (
    Number.isFinite(distanceKm) &&
    distanceKm > 0.5 &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
  ) {
    return {
      distanceKm,
      durationMinutes,
      // Browser TripMap only forwards OSRM into pricing callbacks.
      source: source === "osrm" ? "osrm" : "osrm",
    };
  }
  return null;
}

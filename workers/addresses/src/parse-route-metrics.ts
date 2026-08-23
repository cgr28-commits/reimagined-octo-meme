/**
 * Accept browser- or worker-resolved route metrics for authoritative pricing.
 */

export type ClientRouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
};

export function parseClientRouteMetrics(value: unknown): ClientRouteMetrics | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const distanceKm = Number(record.distanceKm);
  const durationMinutes = Number(record.durationMinutes);
  if (
    Number.isFinite(distanceKm) &&
    distanceKm > 0.5 &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
  ) {
    return { distanceKm, durationMinutes };
  }
  return null;
}

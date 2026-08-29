export type TripRouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
};

/** Where the metrics came from — only `osrm` may set a commercial fare. */
export type TripRouteMetricsSource = "osrm" | "estimate";

export type ResolvedTripRouteMetrics = TripRouteMetrics & {
  source: TripRouteMetricsSource;
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
 * Identifying headers required by public OSRM mirrors (403 without them from
 * Cloudflare Workers). Never set User-Agent in the browser — forbidden there.
 */
export const OSRM_USER_AGENT =
  "MyAirportTaxiNI/1.0 (+https://www.myairporttaxini.co.uk/contact/)";
export const OSRM_REFERER = "https://www.myairporttaxini.co.uk/";

/**
 * NI roads are rarely near great-circle distance. Empirically Knocknagoney→BFS
 * is ~1.47× haversine; 1.48 is retained for display-only estimates when OSRM is
 * unreachable. It must never determine a customer fare.
 */
const ROAD_DISTANCE_FACTOR = 1.48;
/** Assumed average speed when estimating duration without OSRM (km/h). */
const ESTIMATED_AVG_SPEED_KMH = 48;

/** Server / Worker only — browsers must not set User-Agent. */
export function isOsrmServerRuntime(): boolean {
  // Equivalent to `typeof window === "undefined"`, written so Worker tsc
  // (no DOM lib) still typechecks. Browsers define window; Node/Workers do not.
  return typeof (globalThis as { window?: unknown }).window === "undefined";
}

/**
 * OSRM fetch headers. Always send Accept. Add User-Agent + Referer only when
 * running server-side or inside the Cloudflare Worker.
 */
export function buildOsrmFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (isOsrmServerRuntime()) {
    headers["User-Agent"] = OSRM_USER_AGENT;
    headers.Referer = OSRM_REFERER;
  }
  return headers;
}

function osrmHostnameFromBase(base: string): string {
  try {
    return new URL(base).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Safe server-side OSRM diagnostics — hostname, HTTP status or network-error
 * category, and attempt number only. Never log addresses, coordinates,
 * customer details, or API keys.
 */
function logOsrmDiagnostic(input: {
  hostname: string;
  attempt: number;
  status?: number;
  category?: string;
}): void {
  if (!isOsrmServerRuntime()) {
    return;
  }
  if (typeof input.status === "number") {
    console.warn(
      `[osrm] attempt=${input.attempt} host=${input.hostname} status=${input.status}`,
    );
    return;
  }
  console.warn(
    `[osrm] attempt=${input.attempt} host=${input.hostname} error=${input.category ?? "network"}`,
  );
}

function classifyOsrmNetworkError(error: unknown): string {
  if (error instanceof TypeError) {
    return "network";
  }
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name.includes("abort")) {
      return "abort";
    }
    if (name.includes("timeout")) {
      return "timeout";
    }
  }
  return "network";
}

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

/**
 * Display-only fallback when OSRM is unreachable.
 * Never use for commercial fare / distance-floor pricing.
 */
export function estimateTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): ResolvedTripRouteMetrics | null {
  const straightKm = haversineKm(originLat, originLng, destinationLat, destinationLng);
  if (!Number.isFinite(straightKm) || straightKm < 0.3) {
    return null;
  }
  const distanceKm = straightKm * ROAD_DISTANCE_FACTOR;
  const durationMinutes = (distanceKm / ESTIMATED_AVG_SPEED_KMH) * 60;
  return { distanceKm, durationMinutes, source: "estimate" };
}

export async function fetchOsrmTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<ResolvedTripRouteMetrics | null> {
  const path =
    `${originLng},${originLat};${destinationLng},${destinationLat}?overview=false`;
  const headers = buildOsrmFetchHeaders();

  for (let attempt = 1; attempt <= OSRM_ROUTE_BASES.length; attempt += 1) {
    const base = OSRM_ROUTE_BASES[attempt - 1];
    const hostname = osrmHostnameFromBase(base);
    try {
      const response = await fetch(`${base}/${path}`, { headers });
      if (!response.ok) {
        logOsrmDiagnostic({
          hostname,
          attempt,
          status: response.status,
        });
        continue;
      }

      const data = (await response.json()) as OsrmRouteResponse;
      const route = data.routes?.[0];
      if (!route?.distance || !route.duration) {
        logOsrmDiagnostic({
          hostname,
          attempt,
          category: "empty_route",
        });
        continue;
      }

      return {
        distanceKm: route.distance / 1000,
        durationMinutes: route.duration / 60,
        source: "osrm",
      };
    } catch (error) {
      // Try the next mirror (Workers often block one host but not another).
      logOsrmDiagnostic({
        hostname,
        attempt,
        category: classifyOsrmNetworkError(error),
      });
    }
  }

  return null;
}

/**
 * Road routing for commercial pricing — OSRM only.
 * Returns null when OSRM is unreachable (caller must error/retry, not price).
 */
export async function fetchRoadTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<ResolvedTripRouteMetrics | null> {
  return fetchOsrmTripRouteMetrics(
    originLat,
    originLng,
    destinationLat,
    destinationLng,
  );
}

/**
 * Prefer OSRM; optionally fall back to haversine×1.48 for display only.
 * Pricing callers must use `fetchRoadTripRouteMetrics` or reject `source !== "osrm"`.
 */
export async function fetchTripRouteMetrics(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
  options?: { allowEstimateFallback?: boolean },
): Promise<ResolvedTripRouteMetrics | null> {
  const osrm = await fetchOsrmTripRouteMetrics(
    originLat,
    originLng,
    destinationLat,
    destinationLng,
  );
  if (osrm) {
    return osrm;
  }

  if (options?.allowEstimateFallback) {
    return estimateTripRouteMetrics(
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    );
  }

  return null;
}

/** True when metrics came from real road routing and may set a fare. */
export function isRoadRouteMetrics(
  metrics: TripRouteMetrics | ResolvedTripRouteMetrics | null | undefined,
): metrics is ResolvedTripRouteMetrics {
  return Boolean(
    metrics &&
      Number.isFinite(metrics.distanceKm) &&
      metrics.distanceKm > 0.5 &&
      Number.isFinite(metrics.durationMinutes) &&
      metrics.durationMinutes > 0 &&
      (metrics as ResolvedTripRouteMetrics).source === "osrm",
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

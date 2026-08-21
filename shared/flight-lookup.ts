export type TripDirection = "to-airport" | "from-airport";

export type VerifiedFlight = {
  flightNumber: string;
  airline: string;
  date: string;
  scheduledTime: string;
  scheduledTimeLabel: string;
  airportCode: string;
  airportName: string;
  departureAirport: string;
  arrivalAirport: string;
  status?: string;
  /** Normalised operational category for Owner Dashboard badges. */
  statusCategory?:
    | "on_time"
    | "delayed"
    | "landed"
    | "arrival_pending"
    | "cancelled"
    | "unknown";
  /** Short badge label e.g. ON TIME / DELAYED / LANDED. */
  statusLabel?: string;
  estimatedTime?: string;
  actualTime?: string;
  /** True when ETA has passed but provider has not supplied runway/actual arrival. */
  arrivalConfirmationPending?: boolean;
  /** Last provider status string (e.g. Departed / Delayed). */
  providerStatus?: string;
  /** Which aviation API produced this snapshot. */
  dataProvider?: "cirium" | "aerodatabox";
  delayMinutes?: number | null;
  terminal?: string;
  gate?: string;
  /** Live / last-known aircraft position when provider returns it. */
  position?: {
    lat: number;
    lng: number;
    altitudeFt?: number | null;
    groundSpeedKts?: number | null;
    headingDeg?: number | null;
    updatedAt?: string | null;
    registration?: string | null;
  } | null;
};

export type FlightLookupResult =
  | { ok: true; flight: VerifiedFlight }
  | {
      ok: false;
      error: string;
      code:
        | "invalid_format"
        | "not_found"
        | "airport_mismatch"
        | "api_unavailable"
        | "upstream_error"
        | "rate_limited";
    };

/** IATA codes for airports we serve (includes common aliases). */
export const SERVED_AIRPORT_IATA: Record<string, string[]> = {
  BFS: ["BFS"],
  BHD: ["BHD"],
  DUB: ["DUB"],
  LDY: ["LDY"],
};

const FLIGHT_NUMBER_PATTERN = /^([A-Z0-9]{2,3})\s*(\d{1,4}[A-Z]?)$/i;

export function normalizeFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidFlightNumberFormat(value: string): boolean {
  const normalised = normalizeFlightNumber(value);
  if (normalised.length < 3) {
    return false;
  }
  return FLIGHT_NUMBER_PATTERN.test(normalised);
}

export function formatFlightNumberForDisplay(value: string): string {
  const normalised = normalizeFlightNumber(value);
  // Prefer 2-letter IATA (RK159 → "RK 159") over greedy 3-letter (was "RK1 59").
  const twoLetter = normalised.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/i);
  if (twoLetter) {
    return `${twoLetter[1].toUpperCase()} ${twoLetter[2].toUpperCase()}`;
  }
  const threeLetter = normalised.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/i);
  if (threeLetter) {
    return `${threeLetter[1].toUpperCase()} ${threeLetter[2].toUpperCase()}`;
  }
  return normalised;
}

function airportMatches(code: string | undefined, servedCode: string): boolean {
  if (!code) {
    return false;
  }
  const upper = code.trim().toUpperCase();
  const allowed = SERVED_AIRPORT_IATA[servedCode] ?? [servedCode];
  return allowed.includes(upper);
}

type AeroMovementTimes = {
  local?: string;
  utc?: string;
};

type AeroAirportMovement = {
  airport?: { iata?: string; name?: string; icao?: string };
  scheduledTime?: AeroMovementTimes;
  revisedTime?: AeroMovementTimes;
  predictedTime?: AeroMovementTimes;
  runwayTime?: AeroMovementTimes;
  terminal?: string;
  gate?: string;
  baggageBelt?: string;
};

type AeroFlight = {
  number?: string;
  status?: string;
  airline?: { name?: string; iata?: string; icao?: string };
  departure?: AeroAirportMovement;
  arrival?: AeroAirportMovement;
  location?: {
    lat?: number;
    lon?: number;
    longitude?: number;
    altitude?: number | null;
    altitudeFeet?: number | null;
    groundSpeed?: number | null;
    groundSpeedKts?: number | null;
    trueTrack?: number | null;
    heading?: number | null;
    updated?: string | null;
    lastUpdated?: string | null;
  };
  aircraft?: {
    reg?: string;
    modeS?: string;
  };
};

function readScheduledLocal(scheduled?: { local?: string; utc?: string }): string | null {
  if (scheduled?.local) {
    return scheduled.local;
  }
  if (scheduled?.utc) {
    return scheduled.utc;
  }
  return null;
}

function formatLocalTime(isoLocal: string): string {
  const match = isoLocal.match(/T(\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(isoLocal);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return isoLocal;
}

function formatIsoDate(isoLocal: string): string {
  const match = isoLocal.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? isoLocal.slice(0, 10);
}

function readAirlineName(flight: AeroFlight): string {
  return flight.airline?.name?.trim() || flight.airline?.iata?.trim() || "Airline";
}

function flightMatchesAirport(
  flight: AeroFlight,
  airportCode: string,
  direction: TripDirection,
): boolean {
  const dep = flight.departure?.airport?.iata;
  const arr = flight.arrival?.airport?.iata;

  if (direction === "from-airport") {
    return airportMatches(arr, airportCode);
  }
  return airportMatches(dep, airportCode);
}

function flightMatchesTripDate(
  flight: AeroFlight,
  tripDate: string,
  direction: TripDirection,
): boolean {
  const leg =
    direction === "from-airport"
      ? flight.arrival?.scheduledTime
      : flight.departure?.scheduledTime;
  const scheduledRaw = readScheduledLocal(leg);
  if (!scheduledRaw) {
    return false;
  }
  return formatIsoDate(scheduledRaw) === tripDate;
}

function pickMatchingFlight(
  flights: AeroFlight[],
  airportCode: string,
  direction: TripDirection,
  tripDate: string,
): AeroFlight | null {
  const airportMatches = flights.filter((flight) =>
    flightMatchesAirport(flight, airportCode, direction),
  );
  const pool = airportMatches.length > 0 ? airportMatches : flights;

  for (const flight of pool) {
    if (flightMatchesTripDate(flight, tripDate, direction)) {
      return flight;
    }
  }

  return pool[0] ?? null;
}

/**
 * Parse an AeroDataBox local ISO (Europe/London wall clock, often without offset)
 * into absolute epoch ms. Treating digits as UTC is wrong in BST and caused
 * “ETA passed” checks to lag by ~1 hour — flights stayed DELAYED after landing.
 */
function parseLondonMs(isoLocal: string): number | null {
  const match = isoLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) {
    const parsed = Date.parse(isoLocal);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const [, y, m, d, hh, mm, ss] = match;
  const wallAsUtc = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss || "0"),
  );
  if (!Number.isFinite(wallAsUtc)) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wallAsUtc));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const hour = get("hour");
  const asSeenInLondon = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour === 24 ? 0 : hour,
    get("minute"),
    get("second"),
  );
  if (!Number.isFinite(asSeenInLondon)) return null;
  const offsetMs = asSeenInLondon - wallAsUtc;
  return wallAsUtc - offsetMs;
}

/**
 * Priority:
 * 1. Cancelled
 * 2. Landed / actual arrival (runwayTime or Arrived status)
 * 3. Arrival pending (ETA passed, no actual yet) — never keep DELAYED
 * 4. Delayed / estimated
 * 5. On time / scheduled
 *
 * AeroDataBox often keeps status as "Departed"/"Delayed" after landing and may omit
 * runwayTime. Do not keep showing DELAYED once the trip-date ETA has passed.
 */
export function categorizeFlightStatus(
  rawStatus: string | undefined,
  delayMinutes: number | null | undefined,
  options?: {
    actualTime?: string | null;
    /** ISO local of best known arrival (runway / revised / predicted). */
    bestArrivalIso?: string | null;
    /** Trip/service date YYYY-MM-DD — required to interpret HH:MM ETAs correctly. */
    tripDate?: string | null;
    nowMs?: number;
  },
): { statusCategory: NonNullable<VerifiedFlight["statusCategory"]>; statusLabel: string } {
  const normalised = (rawStatus || "").toLowerCase();
  if (normalised.includes("cancel")) {
    return { statusCategory: "cancelled", statusLabel: "CANCELLED" };
  }
  const hasActual = Boolean(options?.actualTime?.trim());
  if (
    hasActual ||
    normalised === "arrived" ||
    normalised.includes("land") ||
    normalised.includes("arrived") ||
    normalised.includes("gate_arrival")
  ) {
    if (typeof delayMinutes === "number" && delayMinutes >= 5) {
      return { statusCategory: "landed", statusLabel: "ARRIVED LATE" };
    }
    return { statusCategory: "landed", statusLabel: "LANDED" };
  }
  const arrivalIso = anchorArrivalIso(
    options?.bestArrivalIso,
    options?.tripDate,
  );
  if (arrivalTimeClearlyPast(arrivalIso, options?.nowMs)) {
    // ETA passed but provider has not confirmed runway/actual arrival.
    return { statusCategory: "arrival_pending", statusLabel: "ARRIVAL PENDING" };
  }
  if (
    normalised.includes("delay") ||
    normalised.includes("late") ||
    (typeof delayMinutes === "number" && delayMinutes >= 5)
  ) {
    return { statusCategory: "delayed", statusLabel: "DELAYED" };
  }
  if (
    normalised.includes("on time") ||
    normalised.includes("ontime") ||
    normalised.includes("scheduled") ||
    normalised.includes("expected") ||
    normalised.includes("active") ||
    normalised.includes("en route") ||
    normalised.includes("enroute") ||
    normalised.includes("boarding") ||
    normalised.includes("departed") ||
    normalised.includes("approaching")
  ) {
    if (typeof delayMinutes === "number" && delayMinutes >= 5) {
      return { statusCategory: "delayed", statusLabel: "DELAYED" };
    }
    return { statusCategory: "on_time", statusLabel: "ON TIME" };
  }
  if (typeof delayMinutes === "number" && delayMinutes > 0) {
    return { statusCategory: "delayed", statusLabel: "DELAYED" };
  }
  if (rawStatus?.trim()) {
    return { statusCategory: "unknown", statusLabel: rawStatus.trim().toUpperCase() };
  }
  return { statusCategory: "unknown", statusLabel: "STATUS UNKNOWN" };
}

/** Anchor HH:MM or undated local times onto the trip date (prevents “ETA on today” bugs). */
export function anchorArrivalIso(
  isoOrHm?: string | null,
  tripDate?: string | null,
): string | null {
  const raw = isoOrHm?.trim() ?? "";
  if (!raw) return null;
  const date = (tripDate || "").trim();
  const hm = raw.match(/(\d{2}:\d{2})/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && hm) {
    // Prefer trip-date + clock so past-ETA checks survive provider HH:MM-only values.
    if (!raw.includes("T") || !raw.startsWith(date)) {
      return `${date}T${hm[1]}:00`;
    }
  }
  if (raw.includes("T")) return raw;
  if (/^\d{2}:\d{2}$/.test(raw) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T${raw}:00`;
  }
  return raw;
}

/**
 * Pure status resolver for Owner Dashboard + regression tests.
 * Pass scheduled / estimated / actual (runway) wall times with the trip date.
 */
export function resolveFlightStatusFromTimes(input: {
  rawStatus?: string | null;
  tripDate: string;
  scheduledTime?: string | null;
  estimatedTime?: string | null;
  actualTime?: string | null;
  nowMs?: number;
}): {
  statusCategory: NonNullable<VerifiedFlight["statusCategory"]>;
  statusLabel: string;
  scheduledTime?: string;
  estimatedTime?: string;
  actualTime?: string;
  delayMinutes: number | null;
  arrivalConfirmationPending: boolean;
} {
  const scheduledHm = extractHm(input.scheduledTime);
  const estimatedHm = extractHm(input.estimatedTime);
  const actualHm = extractHm(input.actualTime);
  let delayMinutes: number | null = null;
  const schedIso = anchorArrivalIso(scheduledHm || input.scheduledTime, input.tripDate);
  const estIso = anchorArrivalIso(estimatedHm || input.estimatedTime, input.tripDate);
  const actIso = anchorArrivalIso(actualHm || input.actualTime, input.tripDate);
  if (schedIso && (actIso || estIso)) {
    const a = parseLondonMs(schedIso);
    const b = parseLondonMs(actIso || estIso || "");
    if (a != null && b != null) delayMinutes = Math.round((b - a) / 60000);
  }
  const { statusCategory, statusLabel } = categorizeFlightStatus(
    input.rawStatus || undefined,
    delayMinutes,
    {
      actualTime: actualHm || undefined,
      bestArrivalIso: actIso || estIso,
      tripDate: input.tripDate,
      nowMs: input.nowMs,
    },
  );
  return {
    statusCategory,
    statusLabel,
    scheduledTime: scheduledHm || undefined,
    estimatedTime: estimatedHm || undefined,
    actualTime: actualHm || undefined,
    delayMinutes,
    arrivalConfirmationPending: statusCategory === "arrival_pending",
  };
}

function extractHm(value?: string | null): string | undefined {
  const raw = value?.trim() ?? "";
  if (!raw) return undefined;
  const m = raw.match(/(\d{2}:\d{2})/);
  return m?.[1];
}

/** True when an arrival wall-clock is ≥10 minutes in the past (London-local parse). */
export function arrivalTimeClearlyPast(
  isoLocal?: string | null,
  nowMs = Date.now(),
): boolean {
  const raw = isoLocal?.trim() ?? "";
  if (!raw) return false;
  const ms = parseLondonMs(raw.includes("T") ? raw : `1970-01-01T${raw}:00`);
  if (ms == null) return false;
  // If we only have HH:MM, parseLondonMs still works with synthetic date — callers
  // should prefer full ISO. For HH:MM-only, compare against today's date.
  if (!raw.includes("T") && /^\d{2}:\d{2}$/.test(raw)) {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const todayMs = parseLondonMs(`${today}T${raw}:00`);
    if (todayMs == null) return false;
    return nowMs - todayMs >= 10 * 60 * 1000;
  }
  return nowMs - ms >= 10 * 60 * 1000;
}

/** Client auto-refresh interval (ms). 0 = stop. */
export function flightStatusAutoRefreshMs(input: {
  statusCategory?: VerifiedFlight["statusCategory"];
  tripDate: string;
  scheduledTime?: string;
  estimatedTime?: string;
  actualTime?: string;
}): number {
  if (input.statusCategory === "landed" || input.statusCategory === "cancelled") {
    return 0;
  }
  // arrival_pending keeps polling for final runway/actual confirmation.
  const date = input.tripDate?.trim() ?? "";
  const time = (
    input.estimatedTime?.trim() ||
    input.scheduledTime?.trim() ||
    "12:00"
  ).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 15 * 60 * 1000;
  const scheduledMs = parseLondonMs(`${date}T${time}:00`);
  if (scheduledMs == null) return 15 * 60 * 1000;
  const hoursUntil = (scheduledMs - Date.now()) / (60 * 60 * 1000);
  // ETA already passed but not yet marked landed — keep forcing status updates.
  if (hoursUntil <= 0) return 60 * 1000;
  if (hoursUntil > 12) return 60 * 60 * 1000;
  if (hoursUntil > 3) return 10 * 60 * 1000;
  if (hoursUntil > 0.5) return 3 * 60 * 1000;
  return 90 * 1000;
}

/**
 * True when a cached non-terminal (delayed/on_time) response should be bypassed
 * because the ETA has passed — avoids sticky DELAYED after landing.
 */
export function shouldBypassStaleFlightCache(flight: {
  statusCategory?: string | null;
  tripDate?: string;
  date?: string;
  scheduledTime?: string;
  estimatedTime?: string;
  actualTime?: string;
}): boolean {
  const category = flight.statusCategory || "";
  if (category === "landed" || category === "cancelled") return false;
  const date = (flight.date || flight.tripDate || "").trim();
  const time = (flight.estimatedTime || flight.scheduledTime || "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  // Force refresh when ETA has passed (covers sticky DELAYED and arrival_pending).
  return arrivalTimeClearlyPast(`${date}T${time}:00`);
}

/** Prefer a newer landed/cancelled snapshot over an older delayed one (client lock). */
export function preferFlightStatusSnapshot(
  previous: VerifiedFlight | null,
  next: VerifiedFlight,
): VerifiedFlight {
  if (!previous) return next;
  const prevRank = statusPriorityRank(previous.statusCategory);
  const nextRank = statusPriorityRank(next.statusCategory);
  // Lower rank = higher priority (cancelled=0, landed=1, …)
  if (prevRank <= 2 && nextRank > prevRank) {
    // Never regress from LANDED / ARRIVAL PENDING / CANCELLED back to DELAYED.
    return previous;
  }
  // Both landed: keep a snapshot that already has actual arrival if the newer one lost it.
  if (
    previous.statusCategory === "landed" &&
    next.statusCategory === "landed" &&
    previous.actualTime &&
    !next.actualTime
  ) {
    return previous;
  }
  return next;
}

function statusPriorityRank(
  category?: VerifiedFlight["statusCategory"] | null,
): number {
  switch (category) {
    case "cancelled":
      return 0;
    case "landed":
      return 1;
    case "arrival_pending":
      return 2;
    case "delayed":
      return 3;
    case "on_time":
      return 4;
    default:
      return 5;
  }
}

/**
 * Cloudflare Cache-Control max-age for flight status responses.
 * Longer when far from arrival; short near arrival; long after landed/cancelled.
 */
export function flightStatusCacheMaxAgeSeconds(input: {
  tripDate: string;
  statusCategory?: VerifiedFlight["statusCategory"];
  scheduledTime?: string;
  estimatedTime?: string;
}): number {
  if (input.statusCategory === "landed" || input.statusCategory === "cancelled") {
    return 60 * 60 * 12;
  }
  if (input.statusCategory === "arrival_pending") {
    return 60;
  }
  const date = input.tripDate?.trim() ?? "";
  const time = (input.estimatedTime?.trim() || input.scheduledTime?.trim() || "12:00").slice(
    0,
    5,
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 600;
  const scheduledMs = parseLondonMs(`${date}T${time}:00`);
  if (scheduledMs == null) return 600;
  const hoursUntil = (scheduledMs - Date.now()) / (60 * 60 * 1000);
  // Past ETA but not landed yet — keep cache very short so we can flip to LANDED.
  if (hoursUntil <= 0) return 60;
  if (hoursUntil > 12) return 60 * 60;
  if (hoursUntil > 3) return 15 * 60;
  if (hoursUntil > 0) return 5 * 60;
  return 60;
}

function mapAeroFlight(
  flight: AeroFlight,
  params: {
    flightNumber: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
    fallbackDate: string;
  },
): VerifiedFlight | null {
  const depAirport = flight.departure?.airport;
  const arrAirport = flight.arrival?.airport;
  const movement =
    params.direction === "from-airport" ? flight.arrival : flight.departure;
  const scheduledRaw = readScheduledLocal(movement?.scheduledTime);

  if (!scheduledRaw) {
    return null;
  }

  const estimatedRaw =
    readScheduledLocal(movement?.revisedTime) ||
    readScheduledLocal(movement?.predictedTime) ||
    undefined;
  const runwayRaw = readScheduledLocal(movement?.runwayTime) || undefined;

  let delayMinutes: number | null = null;
  if (estimatedRaw) {
    const scheduledMs = parseLondonMs(scheduledRaw);
    const estimatedMs = parseLondonMs(estimatedRaw);
    if (scheduledMs != null && estimatedMs != null) {
      delayMinutes = Math.round((estimatedMs - scheduledMs) / 60000);
    }
  }

  const flightDate =
    formatIsoDate(scheduledRaw) || params.fallbackDate;
  // Actual arrival ONLY from runwayTime (never invent actual from ETA).
  const actualRaw = runwayRaw;
  const bestArrivalIso = anchorArrivalIso(
    runwayRaw || estimatedRaw || null,
    flightDate,
  );

  const { statusCategory, statusLabel } = categorizeFlightStatus(
    flight.status,
    delayMinutes,
    {
      actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined,
      bestArrivalIso,
      tripDate: flightDate,
    },
  );

  const relevantAirport =
    params.direction === "from-airport"
      ? arrAirport?.name ?? params.airportName
      : depAirport?.name ?? params.airportName;

  const loc = flight.location;
  const lat = typeof loc?.lat === "number" ? loc.lat : null;
  const lng =
    typeof loc?.lon === "number"
      ? loc.lon
      : typeof loc?.longitude === "number"
        ? loc.longitude
        : null;
  const position =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? {
          lat,
          lng,
          altitudeFt:
            typeof loc?.altitudeFeet === "number"
              ? loc.altitudeFeet
              : typeof loc?.altitude === "number"
                ? loc.altitude
                : null,
          groundSpeedKts:
            typeof loc?.groundSpeedKts === "number"
              ? loc.groundSpeedKts
              : typeof loc?.groundSpeed === "number"
                ? loc.groundSpeed
                : null,
          headingDeg:
            typeof loc?.trueTrack === "number"
              ? loc.trueTrack
              : typeof loc?.heading === "number"
                ? loc.heading
                : null,
          updatedAt: loc?.updated ?? loc?.lastUpdated ?? null,
          registration: flight.aircraft?.reg?.trim() || null,
        }
      : null;

  // Delay vs schedule when we have actual arrival (for "X min late" after landing).
  let resolvedDelay = delayMinutes;
  if (actualRaw) {
    const scheduledMs = parseLondonMs(scheduledRaw);
    const actualMs = parseLondonMs(actualRaw);
    if (scheduledMs != null && actualMs != null) {
      resolvedDelay = Math.round((actualMs - scheduledMs) / 60000);
    }
  }

  return {
    flightNumber: formatFlightNumberForDisplay(flight.number ?? params.flightNumber),
    airline: readAirlineName(flight),
    date: flightDate,
    scheduledTime: formatLocalTime(scheduledRaw),
    scheduledTimeLabel: params.direction === "from-airport" ? "Arrives" : "Departs",
    airportCode: params.airportCode,
    airportName: relevantAirport,
    departureAirport:
      [depAirport?.iata, depAirport?.name].filter(Boolean).join(" · ") || "—",
    arrivalAirport:
      [arrAirport?.iata, arrAirport?.name].filter(Boolean).join(" · ") || "—",
    status: flight.status,
    providerStatus: flight.status,
    dataProvider: "aerodatabox",
    statusCategory,
    statusLabel,
    estimatedTime: estimatedRaw ? formatLocalTime(estimatedRaw) : undefined,
    actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined,
    arrivalConfirmationPending: statusCategory === "arrival_pending",
    delayMinutes: resolvedDelay,
    terminal: movement?.terminal?.trim() || undefined,
    gate: movement?.gate?.trim() || undefined,
    position,
  };
}

async function fetchAeroDataBoxFlights(
  apiKey: string,
  flightNumber: string,
  tripDate?: string,
  attempt = 0,
): Promise<{ status: number; flights: AeroFlight[]; message?: string }> {
  const encoded = encodeURIComponent(flightNumber);
  const query =
    "withAircraftImage=false&withLocation=true&withFlightPlan=false&dateLocalRole=Both";
  const url = tripDate
    ? `https://aerodatabox.p.rapidapi.com/flights/number/${encoded}/${tripDate}?${query}`
    : `https://aerodatabox.p.rapidapi.com/flights/number/${encoded}?${query}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });

  if (response.status === 429 && attempt < 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return fetchAeroDataBoxFlights(apiKey, flightNumber, tripDate, attempt + 1);
  }

  if (response.status === 404) {
    return { status: 404, flights: [] };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return {
      status: response.status,
      flights: [],
      message: body?.message ?? response.statusText,
    };
  }

  let payload: AeroFlight[] | { error?: string; message?: string } | null = null;
  try {
    payload = (await response.json()) as AeroFlight[] | { error?: string; message?: string };
  } catch {
    return { status: 502, flights: [], message: "Invalid flight lookup response" };
  }

  if (Array.isArray(payload)) {
    return { status: 200, flights: payload };
  }

  return {
    status: 200,
    flights: [],
    message: payload?.message ?? payload?.error,
  };
}

export async function lookupFlightViaAeroDataBox(
  apiKey: string,
  params: {
    flightNumber: string;
    tripDate: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
  },
): Promise<FlightLookupResult> {
  const flightNumber = normalizeFlightNumber(params.flightNumber);

  if (!isValidFlightNumberFormat(flightNumber)) {
    return {
      ok: false,
      error: "Enter a valid flight number (e.g. BA1234 or EZY456).",
      code: "invalid_format",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.tripDate)) {
    return {
      ok: false,
      error: "Select your trip date before entering a flight number.",
      code: "invalid_format",
    };
  }

  let result = await fetchAeroDataBoxFlights(apiKey, flightNumber, params.tripDate);

  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      error:
        "Flight lookup API key was rejected. Check your RapidAPI AeroDataBox subscription and secret.",
      code: "upstream_error",
    };
  }

  if (result.status === 429) {
    return {
      ok: false,
      error:
        "Flight verification is temporarily busy. You can still enter your flight number and continue.",
      code: "rate_limited",
    };
  }

  if (result.flights.length === 0 && (result.status === 404 || result.status === 200)) {
    result = await fetchAeroDataBoxFlights(apiKey, flightNumber);

    if (result.status === 429) {
      return {
        ok: false,
        error:
          "Flight verification is temporarily busy. You can still enter your flight number and continue.",
        code: "rate_limited",
      };
    }
  }

  if (result.status !== 200 && result.status !== 404) {
    return {
      ok: false,
      error:
        "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "upstream_error",
    };
  }

  if (result.flights.length === 0) {
    return {
      ok: false,
      error:
        "No flight found for that number on your selected date. Check the flight number, airport, and date match your ticket.",
      code: "not_found",
    };
  }

  const matched = pickMatchingFlight(
    result.flights,
    params.airportCode,
    params.direction,
    params.tripDate,
  );

  if (!matched) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
    };
  }

  if (!flightMatchesAirport(matched, params.airportCode, params.direction)) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
    };
  }

  if (!flightMatchesTripDate(matched, params.tripDate, params.direction)) {
    const leg =
      params.direction === "from-airport"
        ? matched.arrival?.scheduledTime
        : matched.departure?.scheduledTime;
    const actualDate = readScheduledLocal(leg);
    const formatted = actualDate
      ? new Date(`${formatIsoDate(actualDate)}T12:00:00Z`).toLocaleDateString("en-GB", {
          timeZone: "Europe/London",
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : "another date";

    return {
      ok: false,
      error: `That flight operates on ${formatted}, not your selected trip date. Please update your trip date.`,
      code: "not_found",
    };
  }

  const mapped = mapAeroFlight(matched, {
    flightNumber,
    airportCode: params.airportCode,
    airportName: params.airportName,
    direction: params.direction,
    fallbackDate: params.tripDate,
  });

  if (!mapped) {
    return {
      ok: false,
      error: "Flight found but schedule time was unavailable. Please double-check your flight details.",
      code: "upstream_error",
    };
  }

  return { ok: true, flight: mapped };
}

export async function lookupFlight(
  apiKey: string | undefined,
  params: {
    flightNumber: string;
    tripDate: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
  },
): Promise<FlightLookupResult> {
  // Back-compat: single AeroDataBox key argument.
  return lookupFlightWithProviders(
    { aerodataboxRapidApiKey: apiKey },
    params,
  );
}

export type FlightProviderCredentials = {
  /** Cirium / FlightStats Flex app id (primary). */
  ciriumAppId?: string;
  /** Cirium / FlightStats Flex app key (primary). */
  ciriumAppKey?: string;
  /** AeroDataBox RapidAPI key (fallback only). */
  aerodataboxRapidApiKey?: string;
};

/**
 * Prefer Cirium (FlightStats Flex) for final arrival accuracy; fall back to AeroDataBox.
 */
export async function lookupFlightWithProviders(
  credentials: FlightProviderCredentials,
  params: {
    flightNumber: string;
    tripDate: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
  },
): Promise<FlightLookupResult> {
  const ciriumId = credentials.ciriumAppId?.trim() ?? "";
  const ciriumKey = credentials.ciriumAppKey?.trim() ?? "";
  if (ciriumId && ciriumKey) {
    const cirium = await lookupFlightViaCirium(ciriumId, ciriumKey, params);
    if (cirium.ok) return cirium;
    // Soft-fail Cirium (rate limit / temporary) → try AeroDataBox when configured.
    if (
      cirium.code !== "not_found" &&
      cirium.code !== "airport_mismatch" &&
      cirium.code !== "invalid_format" &&
      credentials.aerodataboxRapidApiKey?.trim()
    ) {
      const fallback = await lookupFlightViaAeroDataBox(
        credentials.aerodataboxRapidApiKey.trim(),
        params,
      );
      if (fallback.ok) return fallback;
    }
    if (cirium.code === "not_found" || cirium.code === "airport_mismatch") {
      // Still try ADB in case Cirium missed the occurrence.
      if (credentials.aerodataboxRapidApiKey?.trim()) {
        const fallback = await lookupFlightViaAeroDataBox(
          credentials.aerodataboxRapidApiKey.trim(),
          params,
        );
        if (fallback.ok) return fallback;
      }
    }
    return cirium;
  }

  if (!credentials.aerodataboxRapidApiKey?.trim()) {
    return {
      ok: false,
      error:
        "Flight verification is not configured yet. Add CIRIUM_APP_ID + CIRIUM_APP_KEY (preferred) or AERODATABOX_RAPIDAPI_KEY.",
      code: "api_unavailable",
    };
  }

  return lookupFlightViaAeroDataBox(credentials.aerodataboxRapidApiKey.trim(), params);
}

/** Split IATA flight number into carrier + numeric (RK159 → { RK, 159 }). */
export function splitFlightNumber(
  value: string,
): { carrier: string; number: string } | null {
  const normalised = normalizeFlightNumber(value);
  const two = normalised.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/i);
  if (two) {
    return { carrier: two[1]!.toUpperCase(), number: two[2]!.toUpperCase() };
  }
  const three = normalised.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/i);
  if (three) {
    return { carrier: three[1]!.toUpperCase(), number: three[2]!.toUpperCase() };
  }
  return null;
}

type CiriumDateTime = { dateLocal?: string; dateUtc?: string };

type CiriumFlightStatus = {
  flightId?: number;
  carrierFsCode?: string;
  flightNumber?: string;
  departureAirportFsCode?: string;
  arrivalAirportFsCode?: string;
  status?: string;
  departureDate?: CiriumDateTime;
  arrivalDate?: CiriumDateTime;
  operationalTimes?: {
    scheduledGateDeparture?: CiriumDateTime;
    scheduledRunwayDeparture?: CiriumDateTime;
    estimatedGateDeparture?: CiriumDateTime;
    estimatedRunwayDeparture?: CiriumDateTime;
    actualGateDeparture?: CiriumDateTime;
    actualRunwayDeparture?: CiriumDateTime;
    scheduledGateArrival?: CiriumDateTime;
    scheduledRunwayArrival?: CiriumDateTime;
    estimatedGateArrival?: CiriumDateTime;
    estimatedRunwayArrival?: CiriumDateTime;
    actualGateArrival?: CiriumDateTime;
    actualRunwayArrival?: CiriumDateTime;
  };
  delays?: {
    departureGateDelayMinutes?: number;
    departureRunwayDelayMinutes?: number;
    arrivalGateDelayMinutes?: number;
    arrivalRunwayDelayMinutes?: number;
  };
  airportResources?: {
    departureTerminal?: string;
    departureGate?: string;
    arrivalTerminal?: string;
    arrivalGate?: string;
  };
  flightEquipment?: { tailNumber?: string };
};

function ciriumLocal(dt?: CiriumDateTime | null): string | null {
  if (!dt) return null;
  return dt.dateLocal?.trim() || dt.dateUtc?.trim() || null;
}

function ciriumStatusLabel(code?: string): string {
  switch ((code || "").toUpperCase()) {
    case "S":
      return "Scheduled";
    case "A":
      return "Active";
    case "L":
      return "Landed";
    case "C":
      return "Cancelled";
    case "D":
      return "Diverted";
    case "R":
      return "Redirected";
    case "U":
      return "Unknown";
    default:
      return code?.trim() || "Unknown";
  }
}

/**
 * Map a Cirium / FlightStats Flex flightStatuses[] entry into VerifiedFlight.
 * Exported for RK159 regression tests (ARRIVED LATE + actual arrival).
 */
export function mapCiriumFlightStatus(
  flight: CiriumFlightStatus,
  params: {
    flightNumber: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
    fallbackDate: string;
    airlineName?: string;
  },
): VerifiedFlight | null {
  const times = flight.operationalTimes || {};
  const isArrival = params.direction === "from-airport";

  const scheduledRaw = isArrival
    ? ciriumLocal(times.scheduledGateArrival) ||
      ciriumLocal(times.scheduledRunwayArrival) ||
      ciriumLocal(flight.arrivalDate)
    : ciriumLocal(times.scheduledGateDeparture) ||
      ciriumLocal(times.scheduledRunwayDeparture) ||
      ciriumLocal(flight.departureDate);

  if (!scheduledRaw) return null;

  const estimatedRaw = isArrival
    ? ciriumLocal(times.estimatedGateArrival) ||
      ciriumLocal(times.estimatedRunwayArrival) ||
      undefined
    : ciriumLocal(times.estimatedGateDeparture) ||
      ciriumLocal(times.estimatedRunwayDeparture) ||
      undefined;

  // Passenger-facing actual arrival: gate preferred (matches Google/Cirium "Actual arrival"),
  // runway as fallback (wheels-on).
  const actualRaw = isArrival
    ? ciriumLocal(times.actualGateArrival) ||
      ciriumLocal(times.actualRunwayArrival) ||
      undefined
    : ciriumLocal(times.actualGateDeparture) ||
      ciriumLocal(times.actualRunwayDeparture) ||
      undefined;

  const flightDate = formatIsoDate(scheduledRaw) || params.fallbackDate;

  let delayMinutes: number | null = null;
  if (isArrival) {
    delayMinutes =
      typeof flight.delays?.arrivalGateDelayMinutes === "number"
        ? flight.delays.arrivalGateDelayMinutes
        : typeof flight.delays?.arrivalRunwayDelayMinutes === "number"
          ? flight.delays.arrivalRunwayDelayMinutes
          : null;
  } else {
    delayMinutes =
      typeof flight.delays?.departureGateDelayMinutes === "number"
        ? flight.delays.departureGateDelayMinutes
        : typeof flight.delays?.departureRunwayDelayMinutes === "number"
          ? flight.delays.departureRunwayDelayMinutes
          : null;
  }

  if (delayMinutes == null && actualRaw) {
    const scheduledMs = parseLondonMs(scheduledRaw);
    const actualMs = parseLondonMs(actualRaw);
    if (scheduledMs != null && actualMs != null) {
      delayMinutes = Math.round((actualMs - scheduledMs) / 60000);
    }
  } else if (delayMinutes == null && estimatedRaw) {
    const scheduledMs = parseLondonMs(scheduledRaw);
    const estimatedMs = parseLondonMs(estimatedRaw);
    if (scheduledMs != null && estimatedMs != null) {
      delayMinutes = Math.round((estimatedMs - scheduledMs) / 60000);
    }
  }

  const statusCode = (flight.status || "").toUpperCase();
  const providerStatus = ciriumStatusLabel(statusCode);
  const rawForCategory =
    statusCode === "L"
      ? "Arrived"
      : statusCode === "C"
        ? "Cancelled"
        : statusCode === "A"
          ? "Departed"
          : providerStatus;

  const { statusCategory, statusLabel } = categorizeFlightStatus(
    rawForCategory,
    delayMinutes,
    {
      actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined,
      bestArrivalIso: anchorArrivalIso(actualRaw || estimatedRaw || null, flightDate),
      tripDate: flightDate,
    },
  );

  const depCode = flight.departureAirportFsCode || "—";
  const arrCode = flight.arrivalAirportFsCode || "—";

  return {
    flightNumber: formatFlightNumberForDisplay(
      `${flight.carrierFsCode || ""}${flight.flightNumber || params.flightNumber}`,
    ),
    airline: params.airlineName?.trim() || flight.carrierFsCode || "Airline",
    date: flightDate,
    scheduledTime: formatLocalTime(scheduledRaw),
    scheduledTimeLabel: isArrival ? "Arrives" : "Departs",
    airportCode: params.airportCode,
    airportName: params.airportName,
    departureAirport: depCode,
    arrivalAirport: arrCode,
    status: providerStatus,
    providerStatus,
    dataProvider: "cirium",
    statusCategory,
    statusLabel,
    estimatedTime: estimatedRaw ? formatLocalTime(estimatedRaw) : undefined,
    actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined,
    arrivalConfirmationPending: statusCategory === "arrival_pending",
    delayMinutes,
    terminal: isArrival
      ? flight.airportResources?.arrivalTerminal
      : flight.airportResources?.departureTerminal,
    gate: isArrival
      ? flight.airportResources?.arrivalGate
      : flight.airportResources?.departureGate,
    position: null,
  };
}

export async function lookupFlightViaCirium(
  appId: string,
  appKey: string,
  params: {
    flightNumber: string;
    tripDate: string;
    airportCode: string;
    airportName: string;
    direction: TripDirection;
  },
): Promise<FlightLookupResult> {
  const flightNumber = normalizeFlightNumber(params.flightNumber);
  if (!isValidFlightNumberFormat(flightNumber)) {
    return {
      ok: false,
      error: "Enter a valid flight number (e.g. BA1234 or EZY456).",
      code: "invalid_format",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.tripDate)) {
    return {
      ok: false,
      error: "Select your trip date before entering a flight number.",
      code: "invalid_format",
    };
  }

  const parts = splitFlightNumber(flightNumber);
  if (!parts) {
    return {
      ok: false,
      error: "Enter a valid flight number (e.g. BA1234 or EZY456).",
      code: "invalid_format",
    };
  }

  const [year, month, day] = params.tripDate.split("-");
  const kind = params.direction === "from-airport" ? "arr" : "dep";
  const url = new URL(
    `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${encodeURIComponent(parts.carrier)}/${encodeURIComponent(parts.number)}/${kind}/${year}/${Number(month)}/${Number(day)}`,
  );
  url.searchParams.set("appId", appId);
  url.searchParams.set("appKey", appKey);
  url.searchParams.set("utc", "false");
  if (params.airportCode) {
    url.searchParams.set("airport", params.airportCode);
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      error:
        "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "upstream_error",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error:
        "Cirium flight API credentials were rejected. Check CIRIUM_APP_ID and CIRIUM_APP_KEY.",
      code: "upstream_error",
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      error:
        "Flight verification is temporarily busy. You can still enter your flight number and continue.",
      code: "rate_limited",
    };
  }

  const raw = await response.text();
  let payload: {
    flightStatuses?: CiriumFlightStatus[];
    flightStatus?: CiriumFlightStatus;
    error?: { errorMessage?: string; errorCode?: string };
    appendix?: { airlines?: Array<{ fs?: string; name?: string; iata?: string }> };
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return {
      ok: false,
      error:
        "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "upstream_error",
    };
  }

  if (!response.ok && response.status !== 404) {
    return {
      ok: false,
      error:
        payload.error?.errorMessage ||
        "Flight verification is temporarily unavailable. You can still enter your flight number and continue.",
      code: "upstream_error",
    };
  }

  const statuses = [
    ...(payload.flightStatuses || []),
    ...(payload.flightStatus ? [payload.flightStatus] : []),
  ];

  if (statuses.length === 0) {
    return {
      ok: false,
      error:
        "No flight found for that number on your selected date. Check the flight number, airport, and date match your ticket.",
      code: "not_found",
    };
  }

  const airportUpper = params.airportCode.trim().toUpperCase();
  const matched =
    statuses.find((entry) => {
      const code =
        params.direction === "from-airport"
          ? entry.arrivalAirportFsCode
          : entry.departureAirportFsCode;
      return (code || "").toUpperCase() === airportUpper;
    }) || statuses[0];

  if (!matched) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
    };
  }

  const relevantCode =
    params.direction === "from-airport"
      ? matched.arrivalAirportFsCode
      : matched.departureAirportFsCode;
  if (
    airportUpper &&
    relevantCode &&
    relevantCode.toUpperCase() !== airportUpper &&
    !airportMatches(relevantCode, airportUpper)
  ) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
    };
  }

  const airlineName =
    payload.appendix?.airlines?.find(
      (a) =>
        (a.fs || "").toUpperCase() === (matched.carrierFsCode || "").toUpperCase() ||
        (a.iata || "").toUpperCase() === (matched.carrierFsCode || "").toUpperCase(),
    )?.name || matched.carrierFsCode;

  const mapped = mapCiriumFlightStatus(matched, {
    flightNumber,
    airportCode: params.airportCode,
    airportName: params.airportName,
    direction: params.direction,
    fallbackDate: params.tripDate,
    airlineName,
  });

  if (!mapped) {
    return {
      ok: false,
      error: "Flight found but schedule time was unavailable. Please double-check your flight details.",
      code: "upstream_error",
    };
  }

  return { ok: true, flight: mapped };
}

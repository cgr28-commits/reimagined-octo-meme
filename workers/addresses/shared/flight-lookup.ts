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
  statusCategory?: "on_time" | "delayed" | "landed" | "cancelled" | "unknown";
  /** Short badge label e.g. ON TIME / DELAYED. */
  statusLabel?: string;
  estimatedTime?: string;
  actualTime?: string;
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
  const match = normalised.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/i);
  if (!match) {
    return normalised;
  }
  return `${match[1]} ${match[2]}`;
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

function parseLondonMs(isoLocal: string): number | null {
  const match = isoLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    // Interpret wall-clock as UTC for delta only (same timezone both sides).
    const ms = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0"),
    );
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(isoLocal);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Priority:
 * 1. Cancelled
 * 2. Landed / actual arrival (never keep showing DELAYED once landed)
 * 3. Delayed / estimated
 * 4. On time / scheduled
 */
export function categorizeFlightStatus(
  rawStatus: string | undefined,
  delayMinutes: number | null | undefined,
  options?: { actualTime?: string | null },
): { statusCategory: NonNullable<VerifiedFlight["statusCategory"]>; statusLabel: string } {
  const normalised = (rawStatus || "").toLowerCase();
  if (normalised.includes("cancel")) {
    return { statusCategory: "cancelled", statusLabel: "CANCELLED" };
  }
  if (
    options?.actualTime?.trim() ||
    normalised.includes("land") ||
    normalised.includes("arrived") ||
    normalised.includes("gate_arrival") ||
    normalised === "arr"
  ) {
    return { statusCategory: "landed", statusLabel: "LANDED" };
  }
  // Avoid matching bare "arrival" schedule labels as landed.
  if (normalised.includes("arriv") && !normalised.includes("estimated")) {
    if (
      normalised.includes("has arrived") ||
      normalised.includes("arrived at") ||
      normalised.includes("arrival gate")
    ) {
      return { statusCategory: "landed", statusLabel: "LANDED" };
    }
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
    normalised.includes("boarding")
  ) {
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

/** Client auto-refresh interval (ms). 0 = stop. */
export function flightStatusAutoRefreshMs(input: {
  statusCategory?: VerifiedFlight["statusCategory"];
  tripDate: string;
  scheduledTime?: string;
}): number {
  if (input.statusCategory === "landed" || input.statusCategory === "cancelled") {
    return 0;
  }
  const date = input.tripDate?.trim() ?? "";
  const time = (input.scheduledTime?.trim() || "12:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 15 * 60 * 1000;
  const scheduledMs = parseLondonMs(`${date}T${time}:00`);
  if (scheduledMs == null) return 15 * 60 * 1000;
  const hoursUntil = (scheduledMs - Date.now()) / (60 * 60 * 1000);
  if (hoursUntil > 12) return 60 * 60 * 1000;
  if (hoursUntil > 3) return 10 * 60 * 1000;
  if (hoursUntil > 0.5) return 3 * 60 * 1000;
  if (hoursUntil > -2) return 90 * 1000;
  return 5 * 60 * 1000;
}

/**
 * Cloudflare Cache-Control max-age for flight status responses.
 * Longer when far from arrival; short near arrival; long after landed/cancelled.
 */
export function flightStatusCacheMaxAgeSeconds(input: {
  tripDate: string;
  statusCategory?: VerifiedFlight["statusCategory"];
  scheduledTime?: string;
}): number {
  if (input.statusCategory === "landed" || input.statusCategory === "cancelled") {
    return 60 * 60 * 12;
  }
  const date = input.tripDate?.trim() ?? "";
  const time = (input.scheduledTime?.trim() || "12:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 600;
  const scheduledMs = parseLondonMs(`${date}T${time}:00`);
  if (scheduledMs == null) return 600;
  const hoursUntil = (scheduledMs - Date.now()) / (60 * 60 * 1000);
  if (hoursUntil > 12) return 60 * 60;
  if (hoursUntil > 3) return 15 * 60;
  if (hoursUntil > 0) return 5 * 60;
  return 10 * 60;
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
  const actualRaw = readScheduledLocal(movement?.runwayTime) || undefined;

  let delayMinutes: number | null = null;
  if (estimatedRaw) {
    const scheduledMs = parseLondonMs(scheduledRaw);
    const estimatedMs = parseLondonMs(estimatedRaw);
    if (scheduledMs != null && estimatedMs != null) {
      delayMinutes = Math.round((estimatedMs - scheduledMs) / 60000);
    }
  }

  const { statusCategory, statusLabel } = categorizeFlightStatus(
    flight.status,
    delayMinutes,
    { actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined },
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
    date: formatIsoDate(scheduledRaw) || params.fallbackDate,
    scheduledTime: formatLocalTime(scheduledRaw),
    scheduledTimeLabel: params.direction === "from-airport" ? "Arrives" : "Departs",
    airportCode: params.airportCode,
    airportName: relevantAirport,
    departureAirport:
      [depAirport?.iata, depAirport?.name].filter(Boolean).join(" · ") || "—",
    arrivalAirport:
      [arrAirport?.iata, arrAirport?.name].filter(Boolean).join(" · ") || "—",
    status: flight.status,
    statusCategory,
    statusLabel,
    estimatedTime: estimatedRaw ? formatLocalTime(estimatedRaw) : undefined,
    actualTime: actualRaw ? formatLocalTime(actualRaw) : undefined,
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
  if (!apiKey?.trim()) {
    return {
      ok: false,
      error: "Flight verification is not configured yet.",
      code: "api_unavailable",
    };
  }

  return lookupFlightViaAeroDataBox(apiKey.trim(), params);
}

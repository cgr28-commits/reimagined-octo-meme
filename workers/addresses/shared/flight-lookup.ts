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
};

export type FlightLookupResult =
  | { ok: true; flight: VerifiedFlight }
  | { ok: false; error: string; code: "invalid_format" | "not_found" | "airport_mismatch" | "api_unavailable" | "upstream_error" };

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

type AeroFlight = {
  number?: string;
  status?: string;
  airline?: { name?: string };
  departure?: {
    airport?: { iata?: string; name?: string; icao?: string };
    scheduledTime?: { local?: string; utc?: string };
  };
  arrival?: {
    airport?: { iata?: string; name?: string; icao?: string };
    scheduledTime?: { local?: string; utc?: string };
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

function pickMatchingFlight(
  flights: AeroFlight[],
  airportCode: string,
  direction: TripDirection,
): AeroFlight | null {
  for (const flight of flights) {
    const dep = flight.departure?.airport?.iata;
    const arr = flight.arrival?.airport?.iata;

    if (direction === "from-airport" && airportMatches(arr, airportCode)) {
      return flight;
    }
    if (direction === "to-airport" && airportMatches(dep, airportCode)) {
      return flight;
    }
  }

  return flights[0] ?? null;
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
  const leg =
    params.direction === "from-airport"
      ? flight.arrival?.scheduledTime
      : flight.departure?.scheduledTime;
  const scheduledRaw = readScheduledLocal(leg);

  if (!scheduledRaw) {
    return null;
  }

  const relevantAirport =
    params.direction === "from-airport"
      ? arrAirport?.name ?? params.airportName
      : depAirport?.name ?? params.airportName;

  return {
    flightNumber: formatFlightNumberForDisplay(flight.number ?? params.flightNumber),
    airline: flight.airline?.name?.trim() || "Airline",
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
    return { ok: false, error: "Enter a valid flight number (e.g. BA1234 or EZY456).", code: "invalid_format" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.tripDate)) {
    return { ok: false, error: "Select your trip date before entering a flight number.", code: "invalid_format" };
  }

  const dateLocalRole = params.direction === "from-airport" ? "Arrival" : "Departure";
  const url = new URL(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${params.tripDate}`,
  );
  url.searchParams.set("dateLocalRole", dateLocalRole);
  url.searchParams.set("withAircraftImage", "false");
  url.searchParams.set("withLocation", "false");
  url.searchParams.set("withFlightPlan", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });

  if (response.status === 404) {
    return {
      ok: false,
      error: "No flight found for that number on your selected date. Check the flight number and date.",
      code: "not_found",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "Flight lookup is temporarily unavailable. Please try again.",
      code: "upstream_error",
    };
  }

  const payload = (await response.json()) as AeroFlight[] | { error?: string };
  const flights = Array.isArray(payload) ? payload : [];

  if (flights.length === 0) {
    return {
      ok: false,
      error: "No flight found for that number on your selected date. Check the flight number and date.",
      code: "not_found",
    };
  }

  const matched = pickMatchingFlight(flights, params.airportCode, params.direction);
  if (!matched) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
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

  const dep = matched.departure?.airport?.iata;
  const arr = matched.arrival?.airport?.iata;
  const airportOk =
    params.direction === "from-airport"
      ? airportMatches(arr, params.airportCode)
      : airportMatches(dep, params.airportCode);

  if (!airportOk) {
    return {
      ok: false,
      error: `That flight does not ${params.direction === "from-airport" ? "arrive at" : "depart from"} ${params.airportName} on this date.`,
      code: "airport_mismatch",
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

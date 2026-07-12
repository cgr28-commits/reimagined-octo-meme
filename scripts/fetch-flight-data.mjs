import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AIRPORTS = ["BFS", "BHD", "DUB"];
const TYPES = ["arrivals", "departures"];
const API_BASE = "https://myairports.online/api/airports";
const OUTPUT_DIR = join("public", "flight-data");
const MAX_FLIGHTS = 25;

function isDelayed(flight) {
  const status = (flight.status ?? "").toLowerCase();
  const gate = (flight.gate ?? "").toLowerCase();
  return status.includes("delayed") || gate.includes("delayed");
}

function normalizeStatus(flight) {
  const status = (flight.status ?? "").toLowerCase();
  const gate = (flight.gate ?? "").toLowerCase();

  if (status.includes("cancel")) return "cancelled";
  if (status.includes("delay") || gate.includes("delayed")) return "delayed";
  if (status === "arrived" || status === "landed") return "arrived";
  if (status === "departed") return "departed";
  if (status === "on schedule" || status === "scheduled" || status === "expected") {
    return "scheduled";
  }
  if (status === "unknown" && gate.includes("delayed")) return "delayed";
  if (status === "unknown" && gate.includes("arrived")) return "arrived";

  return status || "scheduled";
}

function normalizeFlight(flight, type) {
  const delayed = isDelayed(flight);
  const scheduled = flight.scheduled ?? null;
  const estimated = flight.estimated ?? flight.actual ?? null;
  const status = normalizeStatus(flight);

  if (type === "arrivals") {
    return {
      flight_iata: flight.flightNumber ?? null,
      dep_iata: flight.origin?.iata ?? null,
      arr_iata: flight.destination?.iata ?? null,
      dep_time: null,
      arr_time: scheduled,
      dep_estimated: null,
      arr_estimated: estimated,
      dep_delayed: null,
      arr_delayed: delayed ? 1 : null,
      status,
    };
  }

  return {
    flight_iata: flight.flightNumber ?? null,
    dep_iata: flight.origin?.iata ?? null,
    arr_iata: flight.destination?.iata ?? null,
    dep_time: scheduled,
    arr_time: null,
    dep_estimated: estimated,
    arr_estimated: null,
    dep_delayed: delayed ? 1 : null,
    arr_delayed: null,
    status,
  };
}

async function fetchBoard(airport, type) {
  const response = await fetch(`${API_BASE}/${airport}/${type}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${airport} ${type} unavailable (${response.status})`);
  }

  const data = await response.json();

  if (!data.supported || !Array.isArray(data.flights)) {
    throw new Error(`${airport} ${type} returned unexpected data`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    source: "myairports.online",
    airport,
    type,
    flights: data.flights.slice(0, MAX_FLIGHTS).map((flight) => normalizeFlight(flight, type)),
  };
}

mkdirSync(OUTPUT_DIR, { recursive: true });

let failures = 0;

for (const airport of AIRPORTS) {
  for (const type of TYPES) {
    const outputPath = join(OUTPUT_DIR, `${airport}-${type}.json`);

    try {
      const board = await fetchBoard(airport, type);
      writeFileSync(outputPath, `${JSON.stringify(board, null, 2)}\n`, "utf8");
      console.log(`Fetched ${airport} ${type} (${board.flights.length} flights)`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      console.warn(`Failed ${airport} ${type}: ${message}`);
      writeFileSync(
        outputPath,
        `${JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            source: "myairports.online",
            airport,
            type,
            flights: [],
            error: message,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  }
}

if (failures === AIRPORTS.length * TYPES.length) {
  process.exitCode = 1;
  console.error("All flight board fetches failed");
} else {
  console.log("Flight data written to public/flight-data/");
}

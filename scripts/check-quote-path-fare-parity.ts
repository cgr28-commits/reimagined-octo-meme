/**
 * Fare parity: Public Live Quote engine = Quick Quote authoritative service =
 * Personal Quotes website-fare wrapper under universal distance pricing.
 *
 * All paths must require road metrics (no zone-only silent fallback).
 *
 * Run: npx tsx scripts/check-quote-path-fare-parity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateWebsiteOneWayFare } from "../src/lib/website-fare";
import { SALOON_VEHICLE, ESTATE_VEHICLE, MINIBUS_VEHICLE } from "../src/lib/vehicle-selection";
import { selectedPlaceFromParts } from "../src/lib/selected-place";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const milesToKm = (miles: number) => miles / 0.621371;
const KNOCKNAGONEY = "66 Knocknagoney Park, Belfast";
/** Real-world Knocknagoney → BFS driving distance is above the 20-mile floor. */
const KNOCK_BFS_METRICS = {
  distanceKm: milesToKm(22),
  durationMinutes: 31,
};
const CITY_HALL = "Belfast City Hall, Belfast BT1 5GS";
const CITY_BFS_METRICS = {
  distanceKm: milesToKm(14),
  durationMinutes: 25,
};
const CITY_BHD_METRICS = {
  distanceKm: milesToKm(4.5),
  durationMinutes: 12,
};
const CITY_DUB_METRICS = {
  distanceKm: 168,
  durationMinutes: 115,
};
const ENNISKILLEN = "10 East Bridge Street, Enniskillen, BT74 7AB";
const ENNI_BFS_METRICS = {
  distanceKm: milesToKm(79),
  durationMinutes: 95,
};

const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB")!;

type Row = {
  label: string;
  publicFare: number;
  quickQuote: number | "error";
  personal: number | "error";
  miles: number;
  match: boolean;
};

const rows: Row[] = [];

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

function airportPlace(code: "BFS" | "BHD" | "DUB") {
  const a = SERVED_AIRPORTS.find((item) => item.code === code)!;
  return selectedPlaceFromParts({
    placeId: a.placeId,
    formattedAddress: a.formattedAddress,
    name: a.name,
    lat: a.lat,
    lng: a.lng,
  });
}

function addressPlace(address: string, lat: number, lng: number) {
  return selectedPlaceFromParts({
    placeId: `test:${address}`,
    formattedAddress: address,
    name: address,
    lat,
    lng,
  });
}

function compareThree(options: {
  label: string;
  address: string;
  airportCode: "BFS" | "BHD" | "DUB";
  fromAirport: boolean;
  metrics: { distanceKm: number; durationMinutes: number };
  vehicle?: typeof SALOON_VEHICLE;
  passengers?: number;
  suitcases?: number;
  expected?: number;
}) {
  const vehicle = options.vehicle ?? SALOON_VEHICLE;
  const passengers = options.passengers ?? 2;
  const suitcases = options.suitcases ?? 2;
  const address = options.address;
  const metrics = options.metrics;
  const miles = Math.round(metrics.distanceKm * 0.621371 * 10) / 10;

  const publicFare = calculateQuote(
    address,
    options.airportCode,
    vehicle,
    false,
    {},
    metrics,
    options.fromAirport,
  );
  assert.ok(publicFare, `${options.label}: public calculateQuote must return a fare`);

  const airportAddr =
    options.airportCode === "BFS"
      ? bfs.formattedAddress
      : options.airportCode === "BHD"
        ? bhd.formattedAddress
        : dub.formattedAddress;

  const quickFixed = calculateAuthoritativeWebsiteQuote({
    airportCode: options.airportCode,
    fromAirport: options.fromAirport,
    pickupAddress: options.fromAirport ? airportAddr : address,
    dropoffAddress: options.fromAirport ? address : airportAddr,
    returnJourney: false,
    passengers,
    suitcases,
    routeMetrics: metrics,
    vehicleType: vehicle,
    maxPassengers: passengers > 4 ? 7 : undefined,
  });

  const pickupPlace = options.fromAirport
    ? airportPlace(options.airportCode)
    : addressPlace(address, 54.6, -5.9);
  const dropoffPlace = options.fromAirport
    ? addressPlace(address, 54.6, -5.9)
    : airportPlace(options.airportCode);

  const personal = calculateWebsiteOneWayFare({
    pickupAddress: options.fromAirport ? airportAddr : address,
    dropoffAddress: options.fromAirport ? address : airportAddr,
    pickupPlace,
    dropoffPlace,
    vehicleType: vehicle,
    routeMetrics: metrics,
  });

  assert.equal(quickFixed.ok, true, `${options.label}: Quick Quote must succeed with metrics`);
  assert.ok(personal, `${options.label}: Personal Quotes must succeed with metrics`);
  if (quickFixed.ok && personal) {
    assert.equal(quickFixed.amount, publicFare!.amount, `${options.label}: QQ vs public`);
    assert.equal(personal.amount, publicFare!.amount, `${options.label}: Personal vs public`);
    if (options.expected != null) {
      assert.equal(publicFare!.amount, options.expected, `${options.label}: expected fare`);
    }
    rows.push({
      label: options.label,
      publicFare: publicFare!.amount,
      quickQuote: quickFixed.amount,
      personal: personal.amount,
      miles,
      match:
        quickFixed.amount === publicFare!.amount && personal.amount === publicFare!.amount,
    });
  }

  // Without metrics, authoritative Quick Quote must refuse — never silent zone-only.
  const without = calculateAuthoritativeWebsiteQuote({
    airportCode: options.airportCode,
    fromAirport: options.fromAirport,
    pickupAddress: options.fromAirport ? airportAddr : address,
    dropoffAddress: options.fromAirport ? address : airportAddr,
    returnJourney: false,
    passengers,
    suitcases,
    routeMetrics: null,
    vehicleType: vehicle,
    maxPassengers: passengers > 4 ? 7 : undefined,
  });
  assert.equal(without.ok, false, `${options.label}: missing metrics must not silently price`);
  if (!without.ok) {
    assert.equal(without.reason, "no_fare");
  }
}

check("Wiring: shared resolver + Quick Quote / Personal / TripMap", () => {
  assert.match(read("shared/route-metrics-resolver.ts"), /resolveTripRouteMetricsForAddresses/);
  assert.match(read("src/lib/route-point-resolver.ts"), /geocodePickupAddress/);
  assert.match(
    read("workers/addresses/src/quick-quote-handlers.ts"),
    /parseClientRouteMetrics/,
  );
  assert.match(
    read("workers/addresses/src/quote-handlers.ts"),
    /parseClientRouteMetrics/,
  );
  assert.match(
    read("src/app/quick-quote/QuickQuoteOwnerClient.tsx"),
    /resolveTripRouteMetricsForAddresses/,
  );
  // Browser metrics preferred; Worker still prices when browser resolve fails.
  assert.match(
    read("src/app/quick-quote/QuickQuoteOwnerClient.tsx"),
    /routeMetrics: routeMetrics \?\? undefined/,
  );
  assert.match(read("src/lib/quick-quote-api.ts"), /routeMetrics/);
  assert.match(read("src/lib/addresses-api.ts"), /fetchWorkerForwardGeocode/);
  assert.match(read("src/lib/google-maps.ts"), /fetchWorkerForwardGeocode/);
  assert.match(read("src/lib/trip-route.ts"), /ROAD_DISTANCE_FACTOR/);
  assert.match(read("workers/addresses/src/index.ts"), /forwardGeocode/);
  assert.match(read("shared/airport-transfer-intent.ts"), /resolveAirportTransferIntent/);
  assert.match(read("workers/addresses/src/quote-handlers.ts"), /resolveAirportTransferIntent/);
  assert.match(read("workers/addresses/src/quote-handlers.ts"), /roadRoutingRequired|routing_unavailable|Commercial fare requires/);
  assert.match(
    read("src/app/quick-quote/QuickQuoteOwnerClient.tsx"),
    /resolveAirportTransferIntent/,
  );
  assert.match(
    read("src/components/OwnerPersonalQuotesPanel.tsx"),
    /resolveTripRouteMetricsForAddresses/,
  );
  assert.match(read("src/components/TripMap.tsx"), /resolveRoutePoint/);
  assert.match(read("src/components/AddressInput.tsx"), /geocodePickupAddress/);
  assert.doesNotMatch(
    read("src/components/OwnerPersonalQuotesPanel.tsx"),
    /typeof pickupPlace\.lat === "number" &&\s*typeof pickupPlace\.lng === "number"/,
  );
  assert.match(
    read("workers/addresses/src/quick-quote-handlers.ts"),
    /could not measure that route/i,
  );
});

check("Test A: Knocknagoney → BFS (universal ~22 mi → £62)", () => {
  const zoneOnly = calculateQuote(KNOCKNAGONEY, "BFS", SALOON_VEHICLE, false, {}, null, false);
  assert.equal(zoneOnly, null, "null metrics must refuse fare (no zone fallback)");

  compareThree({
    label: "A Knocknagoney → BFS",
    address: KNOCKNAGONEY,
    airportCode: "BFS",
    fromAirport: false,
    metrics: KNOCK_BFS_METRICS,
    expected: 62,
  });
});

check("Test B: BFS → Knocknagoney (same metrics, pickup direction)", () => {
  compareThree({
    label: "B BFS → Knocknagoney",
    address: KNOCKNAGONEY,
    airportCode: "BFS",
    fromAirport: true,
    metrics: KNOCK_BFS_METRICS,
    expected: 62,
  });
});

check("Short Belfast City Hall → BFS (~14 mi → £48)", () => {
  compareThree({
    label: "City Hall → BFS",
    address: CITY_HALL,
    airportCode: "BFS",
    fromAirport: false,
    metrics: CITY_BFS_METRICS,
    expected: 48,
  });
});

check("BHD drop-off and pickup (City Hall ~4.5 mi → £31)", () => {
  compareThree({
    label: "City Hall → BHD",
    address: CITY_HALL,
    airportCode: "BHD",
    fromAirport: false,
    metrics: CITY_BHD_METRICS,
    expected: 31,
  });
  compareThree({
    label: "BHD → City Hall",
    address: CITY_HALL,
    airportCode: "BHD",
    fromAirport: true,
    metrics: CITY_BHD_METRICS,
    expected: 31,
  });
});

check("BFS pickup (City Hall reverse)", () => {
  compareThree({
    label: "BFS → City Hall",
    address: CITY_HALL,
    airportCode: "BFS",
    fromAirport: true,
    metrics: CITY_BFS_METRICS,
    expected: 48,
  });
});

check("Dublin Airport drop-off (~104 mi → £245 + £4 fixed)", () => {
  compareThree({
    label: "City Hall → DUB",
    address: CITY_HALL,
    airportCode: "DUB",
    fromAirport: false,
    metrics: CITY_DUB_METRICS,
    expected: 249,
  });
});

check("Long-distance NI (Enniskillen → BFS)", () => {
  compareThree({
    label: "Enniskillen → BFS",
    address: ENNISKILLEN,
    airportCode: "BFS",
    fromAirport: false,
    metrics: ENNI_BFS_METRICS,
  });
});

check("Minibus Knocknagoney → BFS", () => {
  compareThree({
    label: "Knocknagoney → BFS Minibus",
    address: KNOCKNAGONEY,
    airportCode: "BFS",
    fromAirport: false,
    metrics: KNOCK_BFS_METRICS,
    vehicle: MINIBUS_VEHICLE,
    passengers: 6,
    suitcases: 2,
  });
});

check("Estate uses same metrics path", () => {
  compareThree({
    label: "Knocknagoney → BFS Estate",
    address: KNOCKNAGONEY,
    airportCode: "BFS",
    fromAirport: false,
    metrics: KNOCK_BFS_METRICS,
    vehicle: ESTATE_VEHICLE,
    passengers: 2,
    suitcases: 4,
  });
});

console.log("\n=== Comparison table ===\n");
console.log(
  "Journey".padEnd(34) +
    "Public".padStart(8) +
    "QuickQ".padStart(8) +
    "Personal".padStart(10) +
    "Miles".padStart(8) +
    "Match".padStart(8),
);
for (const row of rows) {
  console.log(
    row.label.padEnd(34) +
      `£${row.publicFare}`.padStart(8) +
      `£${row.quickQuote}`.padStart(8) +
      `£${row.personal}`.padStart(10) +
      String(row.miles).padStart(8) +
      (row.match ? "YES" : "NO").padStart(8),
  );
  assert.equal(row.match, true, `${row.label} must match across all three paths`);
}

console.log("\nAll quote-path fare-parity checks passed.");

export const TEST_BOOKING_STORAGE_KEY = "matni-test-booking-v1";

export type TestBookingPrefill = {
  active: true;
  chargeAmount: 1;
  tripMode: "airport";
  tripDirection: "to-airport";
  airportCode: "BFS";
  pickupAddress: string;
  tripDate: string;
  tripTime: string;
  passengers: number;
  suitcases: number;
  vehicle: "Estate Car (1–4 passengers)";
  flightNumber: string;
  routeLabel: string;
};

/** Test-price overrides are local development/test only, never production builds. */
export function isTestBookingAllowed(): boolean {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

function clearTestBooking(): void {
  try { sessionStorage.removeItem(TEST_BOOKING_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

function londonDatePlusDays(days: number): string {
  const now = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function buildTestBookingPrefill(): TestBookingPrefill {
  return {
    active: true,
    chargeAmount: 1,
    tripMode: "airport",
    tripDirection: "to-airport",
    airportCode: "BFS",
    pickupAddress: "249 Rashee Road, Ballyclare, BT39 9JN",
    // Keep ≥12h ahead so the customer Pay now path stays available in test mode.
    tripDate: londonDatePlusDays(1),
    tripTime: "10:00",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    flightNumber: "EZY123",
    routeLabel: "Ballyclare → Belfast International (BFS)",
  };
}

export function activateTestBooking(): TestBookingPrefill | null {
  if (!isTestBookingAllowed()) {
    clearTestBooking();
    return null;
  }
  const prefill = buildTestBookingPrefill();
  try {
    sessionStorage.setItem(TEST_BOOKING_STORAGE_KEY, JSON.stringify(prefill));
    return prefill;
  } catch {
    return null;
  }
}

export function readTestBookingPrefill(): TestBookingPrefill | null {
  // Check before reading: manually injected storage must never enable production overrides.
  if (!isTestBookingAllowed()) {
    clearTestBooking();
    return null;
  }
  try {
    const raw = sessionStorage.getItem(TEST_BOOKING_STORAGE_KEY);
    clearTestBooking();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" ||
        !("active" in parsed) || parsed.active !== true ||
        !("chargeAmount" in parsed) || parsed.chargeAmount !== 1) return null;
    // Storage is an activation signal, never authority for an amount or route.
    return buildTestBookingPrefill();
  } catch {
    return null;
  }
}

export function formatTestTripDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

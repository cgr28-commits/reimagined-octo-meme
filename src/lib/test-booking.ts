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

function tomorrowLondonDate(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow);
}

export function buildTestBookingPrefill(): TestBookingPrefill {
  return {
    active: true,
    chargeAmount: 1,
    tripMode: "airport",
    tripDirection: "to-airport",
    airportCode: "BFS",
    pickupAddress: "249 Rashee Road, Ballyclare, BT39 9JN",
    tripDate: tomorrowLondonDate(),
    tripTime: "06:00",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    flightNumber: "EZY123",
    routeLabel: "Ballyclare → Belfast International (BFS)",
  };
}

export function activateTestBooking(): TestBookingPrefill {
  const prefill = buildTestBookingPrefill();
  sessionStorage.setItem(TEST_BOOKING_STORAGE_KEY, JSON.stringify(prefill));
  return prefill;
}

export function readTestBookingPrefill(): TestBookingPrefill | null {
  const raw = sessionStorage.getItem(TEST_BOOKING_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem(TEST_BOOKING_STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as TestBookingPrefill;
    return parsed?.active ? parsed : null;
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

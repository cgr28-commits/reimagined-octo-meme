/**
 * Dashboard "Bookings at the same time": how many bookings can overlap, and whether
 * a clash beyond that is taken as a request (default) or blocked.
 * Run: npx tsx scripts/check-booking-clash.ts
 */
import assert from "node:assert/strict";
import {
  BOOKING_CLASH_REQUEST_ONLY_REASON,
  decideCustomerSmartAvailabilityGate,
} from "../shared/customer-smart-availability";
import {
  DEFAULT_BOOKING_CLASH_SETTINGS,
  DEFAULT_SMART_OPS_CONFIG,
  normalizeBookingClashSettings,
  normalizeSmartOpsConfig,
  type BookingClashSettings,
} from "../shared/smart-ops-config";
import type { SmartOccupiedJob } from "../shared/smart-conflict";

const BFS = { lat: 54.6575, lng: -6.2158 };
const BELFAST = { lat: 54.5964, lng: -5.9302 };
const BHD = { lat: 54.6181, lng: -5.8724 };
const LARNE = { lat: 54.851, lng: -5.811 };
const MONDAY = "2026-09-07";
const NOW = new Date("2026-09-06T12:00:00+01:00");

const larneAt0700: SmartOccupiedJob = {
  id: "TAAA4672EAN",
  pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
  dropoffLabel: "George Best Belfast City Airport",
  pickup: LARNE,
  dropoff: BHD,
  tripDate: MONDAY,
  tripTime: "07:00",
  durationMinutes: 33,
  airportCode: "BHD",
};
const secondLarneAt0700: SmartOccupiedJob = { ...larneAt0700, id: "TBBB0000SECOND" };

// BFS → Belfast at 05:33 cannot also reach Larne for 07:00 (the existing booking).
const booking = {
  pickupLabel: "Belfast International Airport",
  dropoffLabel: "Belfast City Centre",
  tripDate: MONDAY,
  tripTime: "05:33",
  vehicle: "Saloon",
  airportCode: "BFS",
  isFromAirport: true,
  routeDurationMinutes: 30,
  pickupLat: BFS.lat,
  pickupLng: BFS.lng,
  dropoffLat: BELFAST.lat,
  dropoffLng: BELFAST.lng,
};

function gate(bookingClash: BookingClashSettings, occupied: SmartOccupiedJob[], vehicle = "Saloon") {
  return decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: { ...booking, vehicle },
    occupied,
    config: normalizeSmartOpsConfig({ ...DEFAULT_SMART_OPS_CONFIG, bookingClash }),
    now: NOW,
  });
}

// Defaults: just the owner; a clash becomes a request.
assert.deepEqual(DEFAULT_BOOKING_CLASH_SETTINGS, { maxAtSameTime: 1, whenFull: "request_only" });
assert.deepEqual(DEFAULT_SMART_OPS_CONFIG.bookingClash, DEFAULT_BOOKING_CLASH_SETTINGS);
assert.deepEqual(normalizeSmartOpsConfig({}).bookingClash, DEFAULT_BOOKING_CLASH_SETTINGS, "old saved config gets the default");
assert.deepEqual(normalizeBookingClashSettings({ maxAtSameTime: 7, whenFull: "x" }), DEFAULT_BOOKING_CLASH_SETTINGS);
assert.deepEqual(normalizeBookingClashSettings({ maxAtSameTime: "2", whenFull: "block" }), { maxAtSameTime: 2, whenFull: "block" });

// No clash: bookable as normal.
const free = gate(DEFAULT_BOOKING_CLASH_SETTINGS, []);
assert.equal(free.blocked, false);
assert.equal(free.requestOnly, undefined);

// 1 at a time, request only (default): clash is a request, not a block.
const requested = gate({ maxAtSameTime: 1, whenFull: "request_only" }, [larneAt0700]);
assert.equal(requested.blocked, false, "not blocked");
assert.equal(requested.requestOnly, true, "taken as a request");
assert.equal(requested.reason, BOOKING_CLASH_REQUEST_ONLY_REASON);

// 1 at a time, block: the old behaviour.
const blocked = gate({ maxAtSameTime: 1, whenFull: "block" }, [larneAt0700]);
assert.equal(blocked.blocked, true);
assert.notEqual(blocked.requestOnly, true);

// 2 at a time: one clashing booking still leaves room, so it books straight away.
const second = gate({ maxAtSameTime: 2, whenFull: "block" }, [larneAt0700]);
assert.equal(second.blocked, false);
assert.notEqual(second.requestOnly, true, "a spare slot books normally");

// 2 at a time but two clashing bookings: full → request (or block).
assert.equal(gate({ maxAtSameTime: 2, whenFull: "request_only" }, [larneAt0700, secondLarneAt0700]).requestOnly, true);
assert.equal(gate({ maxAtSameTime: 2, whenFull: "block" }, [larneAt0700, secondLarneAt0700]).blocked, true);
// 3 at a time: both clashes fit.
const third = gate({ maxAtSameTime: 3, whenFull: "block" }, [larneAt0700, secondLarneAt0700]);
assert.equal(third.blocked, false);
assert.notEqual(third.requestOnly, true);

// 7-Seater keeps its own separate availability: never turned into a request here.
assert.notEqual(gate({ maxAtSameTime: 3, whenFull: "request_only" }, [larneAt0700], "7 Seater Minibus").requestOnly, true);

console.log("All booking clash checks passed.");

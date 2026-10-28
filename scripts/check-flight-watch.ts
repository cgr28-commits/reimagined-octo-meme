/**
 * Flight watch: timing parse, 30-minute checks from 3h before pickup, alert rules,
 * alert email wording, and cron wiring.
 * Run: npx tsx scripts/check-flight-watch.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { flightTiming, type VerifiedFlight } from "../shared/flight-lookup";
import {
  buildFlightAlertEmail,
  decideFlightAlert,
  isFlightCheckDue,
  nextFlightWatchState,
  type FlightWatchState,
} from "../shared/flight-watch";

const root = path.resolve(import.meta.dirname, "..");

// AeroDataBox timing
{
  const t = flightTiming({
    scheduledTime: { utc: "2026-10-31 14:30Z", local: "2026-10-31 14:30+00:00" },
    revisedTime: { utc: "2026-10-31 15:07Z", local: "2026-10-31 15:07+00:00" },
  });
  assert.equal(t.delayMinutes, 37);
  assert.equal(t.expectedTime, "15:07");
  assert.equal(t.actualReported, false);
  const landed = flightTiming({
    scheduledTime: { utc: "2026-10-31 14:30Z", local: "2026-10-31 14:30+00:00" },
    revisedTime: { utc: "2026-10-31 15:07Z", local: "2026-10-31 15:07+00:00" },
    runwayTime: { utc: "2026-10-31 15:01Z", local: "2026-10-31 15:01+00:00" },
  });
  assert.equal(landed.expectedTime, "15:01", "runway (actual) time wins");
  assert.equal(landed.actualReported, true);
  assert.equal(flightTiming({ scheduledTime: { utc: "2026-10-31 14:30Z" } }).delayMinutes, null);
}
console.log("OK  expected / actual landing times are read from the flight data");

// When checks run (pickup 14:30 London on 31 Oct 2026 = GMT)
const job = {
  isFromAirport: true,
  flightNumber: "EI3324",
  airportCode: "BHD",
  tripDate: "2026-10-31",
  tripTime: "14:30",
} as const;
assert.equal(isFlightCheckDue(job, new Date("2026-10-31T11:00:00Z")), false, "not before 3h");
assert.equal(isFlightCheckDue(job, new Date("2026-10-31T11:31:00Z")), true, "from 3h before");
assert.equal(
  isFlightCheckDue({ ...job, flightWatch: { checkedAt: "2026-10-31T11:31:00Z" } }, new Date("2026-10-31T11:50:00Z")),
  false,
  "30-minute spacing",
);
assert.equal(
  isFlightCheckDue({ ...job, flightWatch: { checkedAt: "2026-10-31T11:31:00Z" } }, new Date("2026-10-31T12:01:00Z")),
  true,
);
assert.equal(isFlightCheckDue({ ...job, flightWatch: { checkedAt: "2026-10-31T13:00:00Z", landed: true } }, new Date("2026-10-31T14:00:00Z")), false, "stops once landed");
assert.equal(isFlightCheckDue({ ...job, journeyStatus: "completed" }, new Date("2026-10-31T13:00:00Z")), false);
assert.equal(isFlightCheckDue({ ...job, isFromAirport: false }, new Date("2026-10-31T13:00:00Z")), false, "drop-offs not watched");
assert.equal(isFlightCheckDue({ ...job, flightNumber: "" }, new Date("2026-10-31T13:00:00Z")), false);
assert.equal(isFlightCheckDue(job, new Date("2026-10-31T18:31:00Z")), false, "stops 4h after pickup");
console.log("OK  checks every 30 minutes from 3 hours before pickup until landing");

// Alert rules
const base: VerifiedFlight = {
  flightNumber: "EI 3324",
  airline: "Aer Lingus",
  date: "2026-10-31",
  scheduledTime: "14:30",
  scheduledTimeLabel: "Arrives",
  airportCode: "BHD",
  airportName: "George Best Belfast City",
  departureAirport: "LHR · London Heathrow",
  arrivalAirport: "BHD · Belfast City",
  status: "Expected",
};
const f = (patch: Partial<VerifiedFlight>): VerifiedFlight => ({ ...base, ...patch });
assert.equal(decideFlightAlert(undefined, f({ delayMinutes: 5, expectedTime: "14:35" })), null, "small delays ignored");
assert.equal(decideFlightAlert(undefined, f({ delayMinutes: 37, expectedTime: "15:07" })), "delayed");
assert.equal(decideFlightAlert(undefined, f({ delayMinutes: -20, expectedTime: "14:10" })), "early");
const afterDelay: FlightWatchState = { checkedAt: "x", lastAlert: { at: "x", kind: "delayed", delayMinutes: 37 } };
assert.equal(decideFlightAlert(afterDelay, f({ delayMinutes: 45 })), null, "8 more minutes: no repeat");
assert.equal(decideFlightAlert(afterDelay, f({ delayMinutes: 60 })), "delayed", "another 15+ minutes: alert");
assert.equal(decideFlightAlert(afterDelay, f({ delayMinutes: 0 })), "delayed", "back on time is reported");
assert.equal(decideFlightAlert(afterDelay, f({ status: "Arrived", actualReported: true, expectedTime: "15:01" })), "landed");
assert.equal(decideFlightAlert({ checkedAt: "x", lastAlert: { at: "x", kind: "landed" } }, f({ status: "Arrived", actualReported: true })), null);
assert.equal(decideFlightAlert(undefined, f({ status: "Canceled" })), "cancelled");
assert.equal(decideFlightAlert(undefined, f({ status: "Diverted" })), "diverted");
const state = nextFlightWatchState(undefined, f({ delayMinutes: 37, expectedTime: "15:07" }), "delayed", new Date("2026-10-31T12:00:00Z"));
assert.equal(state.lastAlert?.delayMinutes, 37);
assert.equal(state.landed, false);
console.log("OK  alerts for 15+ min delays/early, further 15+ min changes, landing, cancellation, diversion");

// Email wording
{
  const delayed = buildFlightAlertEmail({
    kind: "delayed",
    flight: f({ delayMinutes: 37, expectedTime: "15:07" }),
    customerName: "Sarah Jones",
    bookingReference: "MAT-1042",
    bookedPickupTime: "14:30",
    airportName: "George Best Belfast City Airport",
  });
  assert.match(delayed.subject, /EI 3324 delayed 37 min — now 15:07/);
  assert.match(delayed.subject, /Sarah Jones 14:30/);
  assert.match(delayed.body, /booking time has not been changed/);
  assert.match(delayed.body, /MAT-1042/);
  const landed = buildFlightAlertEmail({
    kind: "landed",
    flight: f({ expectedTime: "15:01", actualReported: true, delayMinutes: 31 }),
    bookedPickupTime: "14:30",
    airportName: "George Best Belfast City Airport",
  });
  assert.match(landed.body, /waiting runs until about 16:01/);
  const cancelled = buildFlightAlertEmail({ kind: "cancelled", flight: f({ status: "Canceled" }), bookedPickupTime: "14:30", airportName: "x" });
  assert.match(cancelled.subject, /CANCELLED/);
}
console.log("OK  alert emails give the new time, booked time unchanged, and waiting window on landing");

// Wiring
const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
assert.match(index, /processFlightWatch\(env, new Date\(event\.scheduledTime\)\)/);
const handler = fs.readFileSync(path.join(root, "workers/addresses/src/flight-watch-handlers.ts"), "utf8");
assert.match(handler, /assignedDriverEmail/, "assigned driver gets the alert");
assert.match(handler, /MAX_LOOKUPS_PER_RUN/);
assert.doesNotMatch(handler, /tripTime\s*=|pickupAt\s*=/, "never changes the booked pickup time");
const driver = fs.readFileSync(path.join(root, "src/app/driver/DriverPageClient.tsx"), "utf8");
assert.match(driver, /flight\.expectedTime/);
assert.match(driver, /Scheduled arrival:[\s\S]{0,80}flight\.scheduledTime\}/);
console.log("OK  runs on the 5-minute cron, emails owner + assigned driver, shows new ETA on the driver page");

console.log("\nAll flight watch checks passed.");

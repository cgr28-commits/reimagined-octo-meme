/** Return-leg driver assignment emails must show the return journey (Neill Thompson, 15 Nov 2026). */
import assert from "node:assert/strict";
import { buildDriverAssignmentEmail, driverEmailJobForLeg, type BookingJobRecord } from "../shared/booking-job";

const job = {
  id: "pi_test",
  customerName: "Neill Thompson",
  pickupLabel: "51 Ravara Rd, Ballygowan, Newtownards BT23 6NW, UK",
  dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
  tripDate: "2026-11-11",
  tripTime: "06:20",
  returnJourney: true,
  returnDate: "2026-11-15",
  returnTime: "17:50",
  flightNumber: "",
  returnFlightNumber: "IB1885",
  passengers: 2,
  suitcases: 1,
  vehicle: "Standard Saloon (1–4 passengers)",
  driverFirstName: "Colin",
  driverPayAmount: "£230.00",
} as unknown as BookingJobRecord;

const ret = driverEmailJobForLeg(job, {
  journeyLeg: "return",
  pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
  dropoffLabel: "51 Ravara Rd, Ballygowan, Newtownards BT23 6NW, UK",
  tripDate: "2026-11-15",
  tripTime: "17:50",
});
const email = buildDriverAssignmentEmail({ job: ret, acceptUrl: "https://example.test/accept" });
assert.match(email.subject, /15-11-2026 17:50/);
assert.match(email.text, /Pickup: Dublin Airport/);
assert.match(email.text, /Drop-off: 51 Ravara Rd/);
assert.match(email.text, /Flight: IB1885/);
assert.doesNotMatch(email.text, /06:20|11-11-2026/);
assert.doesNotMatch(email.text, /Return:/);

// Leg details missing on an old record: fall back to the booking's return fields.
const fallback = driverEmailJobForLeg(job, { journeyLeg: "return" });
assert.equal(fallback.pickupLabel, job.dropoffLabel);
assert.equal(fallback.tripDate, "2026-11-15");
assert.equal(fallback.tripTime, "17:50");

// Outbound leg uses the leg's (possibly edited) time, not the stale booking time.
const out = driverEmailJobForLeg(job, { journeyLeg: "outbound", tripDate: "2026-11-11", tripTime: "05:00", pickupLabel: job.pickupLabel, dropoffLabel: job.dropoffLabel });
const outEmail = buildDriverAssignmentEmail({ job: out, acceptUrl: "https://example.test/accept" });
assert.match(outEmail.subject, /11-11-2026 05:00/);
assert.doesNotMatch(outEmail.text, /Flight: IB1885/);
console.log("driver email leg checks passed");

// Same driver both ways: the return leg must get its own driver-details message.
import { driverDetailsJobKey } from "../workers/addresses/src/customer-driver-details";
assert.equal(driverDetailsJobKey("pi_test", "outbound"), "pi_test");
assert.equal(driverDetailsJobKey("pi_test", undefined), "pi_test");
assert.equal(driverDetailsJobKey("pi_test", "return"), "pi_test:return");
console.log("driver details per-leg key checks passed");

/** Flight-shaped diary entries for Flighty: which legs qualify and the title format. */
import assert from "node:assert/strict";
import {
  airportCollectionLegs,
  airportForLabel,
  flightyEventTitle,
} from "../workers/addresses/src/flighty-calendar";

assert.equal(airportForLabel("Dublin Airport, Co. Dublin, Ireland")?.code, "DUB");
assert.equal(airportForLabel("George Best Belfast City Airport, Airport Rd")?.code, "BHD");
assert.equal(airportForLabel("Belfast International Airport, Aldergrove")?.code, "BFS");
assert.equal(airportForLabel("51 Ravara Rd, Ballygowan"), null);

// Neill Thompson: home -> Dublin, return collected at Dublin on IB1885.
const neill = airportCollectionLegs({
  customerName: "Neill Thompson",
  pickupLabel: "51 Ravara Rd, Ballygowan",
  dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
  tripDate: "2026-11-11",
  tripTime: "05:00",
  returnJourney: true,
  returnDate: "2026-11-15",
  returnTime: "17:50",
  returnFlightNumber: "ib 1885",
});
assert.deepEqual(neill, [
  { leg: "return", flightNumber: "IB1885", date: "2026-11-15", pickupTime: "17:50", airportCode: "DUB", airportName: "Dublin Airport" },
]);

// Airport pickup one-way.
const pickup = airportCollectionLegs({
  customerName: "A",
  pickupLabel: "Belfast International Airport",
  dropoffLabel: "Holywood",
  tripDate: "2026-11-20",
  tripTime: "10:00",
  flightNumber: "EZY3022",
});
assert.equal(pickup.length, 1);
assert.equal(pickup[0]!.airportCode, "BFS");

// Drop-off at airport only: nothing to track.
assert.equal(
  airportCollectionLegs({ customerName: "B", pickupLabel: "Glengormley", dropoffLabel: "Dublin Airport", tripDate: "2026-11-20", tripTime: "05:00", flightNumber: "FR1" }).length,
  0,
);

const flight = { departureIata: "MAD", arrivalIata: "DUB" } as Parameters<typeof flightyEventTitle>[1];
assert.equal(flightyEventTitle("ib1885", flight), "IB1885 MAD to DUB");
assert.equal(flightyEventTitle("IB1885", { ...flight, departureIata: null }), null);
console.log("flighty calendar checks passed");

// Finding our flight entries for a booking when it's edited or cancelled.
import { isFlightyEventFor } from "../workers/addresses/src/flighty-calendar";
const ours = {
  summary: "IB1885 MAD to DUB",
  description:
    "Flight IB1885 MAD to DUB (Iberia).\nCustomer pickup: N, 2026-11-15 17:50 at Dublin Airport.\nLeg: return\nPayment reference: pi_123\nAdded for flight tracking by My Airport Taxi NI.",
};
assert.equal(isFlightyEventFor(ours, "pi_123"), true);
assert.equal(isFlightyEventFor(ours, "pi_123", "return"), true);
assert.equal(isFlightyEventFor(ours, "pi_123", "outbound"), false);
assert.equal(isFlightyEventFor(ours, "pi_999"), false);
// The booking's own job entry must never be deleted.
assert.equal(
  isFlightyEventFor({ summary: "My Airport Taxi NI — Airport pickup — N", description: "Payment reference: pi_123" }, "pi_123"),
  false,
);
assert.equal(isFlightyEventFor({ ...ours, status: "cancelled" }, "pi_123"), false);
console.log("flighty edit/cancel checks passed");

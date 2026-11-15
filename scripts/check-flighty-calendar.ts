/** Flight-shaped diary entries for Flighty: which legs qualify and the title format. */
import assert from "node:assert/strict";
import {
  airportCollectionLegs,
  airportForLabel,
  buildFlightyEvent,
  isFlightyEventFor,
  splitFlightDesignator,
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

type VF = Parameters<typeof buildFlightyEvent>[0]["flight"];
const leg = (code: string, date: string, time: string, name: string) =>
  ({ leg: "outbound" as const, flightNumber: "", date, pickupTime: time, airportCode: code, airportName: name });
function make(typed: string, flight: Partial<VF>, l = leg("DUB", "2026-11-15", "17:50", "Dublin Airport")) {
  return buildFlightyEvent({
    typedFlightNumber: typed,
    flight: { airline: "Airline", flightNumber: typed, ...flight } as VF,
    leg: l,
    customerName: "Test Customer",
    paymentReference: "pi_test",
  });
}

// Iberia IB1885, 15 Nov 2026, MAD 16:10 (UTC+1) -> DUB 17:50 (UTC+0).
const ib = make("ib1885", {
  airline: "Iberia", flightNumber: "IB 1885",
  departureIata: "MAD", arrivalIata: "DUB", departureCity: "Madrid", arrivalCity: "Dublin",
  departureScheduledUtc: "2026-11-15T15:10:00.000Z", arrivalScheduledUtc: "2026-11-15T17:50:00.000Z",
  departureScheduledLocal: "2026-11-15 16:10", arrivalScheduledLocal: "2026-11-15 17:50",
});
assert.ok(ib);
assert.equal(ib.summary, "Flight to Dublin (IB 1885)");
assert.equal(ib.location, "Madrid MAD");
assert.equal(ib.startUtc, "2026-11-15T15:10:00.000Z"); // flight departure, not taxi pickup
assert.equal(ib.endUtc, "2026-11-15T17:50:00.000Z");
assert.match(ib.description, /^Iberia flight IB 1885\nMadrid \(MAD\) to Dublin \(DUB\)\nDeparts Madrid \(MAD\) 2026-11-15 16:10 local time\nArrives Dublin \(DUB\) 2026-11-15 17:50 local time/);
assert.match(ib.description, /Customer pickup: Test Customer, 2026-11-15 17:50 at Dublin Airport/);
assert.match(ib.description, /Payment reference: pi_test/);
assert.equal(isFlightyEventFor({ summary: ib.summary, description: ib.description.replace(/\nLeg: outbound/, "\nLeg: return") }, "pi_test", "return"), true);

// EasyJet typed in ICAO form: use the IATA designator the lookup returns.
const ezy = make("EZY3022", {
  airline: "easyJet", flightNumber: "U2 3022", departureIata: "LGW", arrivalIata: "BFS",
  departureCity: "London", arrivalCity: "Belfast",
  departureScheduledUtc: "2026-11-20T08:00:00.000Z", arrivalScheduledUtc: "2026-11-20T09:20:00.000Z",
}, leg("BFS", "2026-11-20", "09:20", "Belfast International Airport"));
assert.equal(ezy?.summary, "Flight to Belfast (U2 3022)");
assert.equal(ezy?.location, "London LGW");

// Ryanair, Aer Lingus, British Airways.
assert.equal(make("FR 812", { airline: "Ryanair", flightNumber: "FR 812", departureIata: "STN", arrivalIata: "DUB", arrivalCity: "Dublin", departureCity: "London",
  departureScheduledUtc: "2026-11-20T10:00:00.000Z", arrivalScheduledUtc: "2026-11-20T11:15:00.000Z" })?.summary, "Flight to Dublin (FR 812)");
assert.equal(make("ei3711", { airline: "Aer Lingus", flightNumber: "EI 3711", departureIata: "LHR", arrivalIata: "BHD", arrivalCity: "Belfast", departureCity: "London",
  departureScheduledUtc: "2026-11-20T10:00:00.000Z", arrivalScheduledUtc: "2026-11-20T11:20:00.000Z" })?.summary, "Flight to Belfast (EI 3711)");
assert.equal(make("BA1394", { airline: "British Airways", flightNumber: "BA 1394", departureIata: "LHR", arrivalIata: "BHD", arrivalCity: "Belfast", departureCity: "London",
  departureScheduledUtc: "2026-11-20T10:00:00.000Z", arrivalScheduledUtc: "2026-11-20T11:20:00.000Z" })?.summary, "Flight to Belfast (BA 1394)");

// Codeshare: keep the operating flight the lookup confirmed.
assert.equal(make("AA8051", { airline: "Aer Lingus", flightNumber: "EI 105", departureIata: "JFK", arrivalIata: "DUB", arrivalCity: "Dublin", departureCity: "New York",
  departureScheduledUtc: "2026-11-20T23:00:00.000Z", arrivalScheduledUtc: "2026-11-21T05:45:00.000Z" })?.summary, "Flight to Dublin (EI 105)");

// Overnight, crossing time zones: JFK 18:00 (UTC-5) -> DUB 05:45 next day.
const night = make("EI105", { airline: "Aer Lingus", flightNumber: "EI 105", departureIata: "JFK", arrivalIata: "DUB", departureCity: "New York", arrivalCity: "Dublin",
  departureScheduledUtc: "2026-11-20T23:00:00.000Z", arrivalScheduledUtc: "2026-11-21T05:45:00.000Z",
  departureScheduledLocal: "2026-11-20 18:00", arrivalScheduledLocal: "2026-11-21 05:45" }, leg("DUB", "2026-11-21", "05:45", "Dublin Airport"));
assert.equal(night?.startUtc, "2026-11-20T23:00:00.000Z");
assert.equal(night?.endUtc, "2026-11-21T05:45:00.000Z");
assert.match(night!.description, /Departs New York \(JFK\) 2026-11-20 18:00 local time\nArrives Dublin \(DUB\) 2026-11-21 05:45 local time/);

// No real schedule -> no entry (never invent times).
assert.equal(make("IB1885", { departureIata: "MAD", arrivalIata: "DUB" }), null);
assert.equal(make("IB1885", { departureIata: null, arrivalIata: "DUB", departureScheduledUtc: "2026-11-15T15:10:00.000Z", arrivalScheduledUtc: "2026-11-15T17:50:00.000Z" }), null);
assert.equal(make("IB1885", { departureIata: "MAD", arrivalIata: "DUB", departureScheduledUtc: "2026-11-15T17:50:00.000Z", arrivalScheduledUtc: "2026-11-15T15:10:00.000Z" }), null);
// Missing city name falls back to the airport code.
assert.equal(make("IB1885", { flightNumber: "IB 1885", departureIata: "MAD", arrivalIata: "DUB",
  departureScheduledUtc: "2026-11-15T15:10:00.000Z", arrivalScheduledUtc: "2026-11-15T17:50:00.000Z" })?.summary, "Flight to DUB (IB 1885)");

// Missing or invalid flight numbers never produce a leg.
assert.equal(airportCollectionLegs({ customerName: "C", pickupLabel: "Dublin Airport", dropoffLabel: "Belfast", tripDate: "2026-11-20", tripTime: "10:00" }).length, 0);
assert.equal(airportCollectionLegs({ customerName: "C", pickupLabel: "Dublin Airport", dropoffLabel: "Belfast", tripDate: "2026-11-20", tripTime: "10:00", flightNumber: "   " }).length, 0);
assert.equal(splitFlightDesignator("IB1885"), "IB 1885");
assert.equal(splitFlightDesignator("u2 3022"), "U2 3022");
assert.equal(splitFlightDesignator("EZY3022"), "EZY 3022");
assert.equal(splitFlightDesignator("FR812"), "FR 812");
console.log("flighty calendar checks passed");

// Finding our flight entries for a booking when it's edited or cancelled.
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

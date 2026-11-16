/** Return diary entry must show the return pickup (outbound drop-off), not the home address. */
import assert from "node:assert/strict";
import { buildTransferCalendarEvents } from "../workers/addresses/src/google-calendar";

const events = buildTransferCalendarEvents({
  customerName: "Neill Thompson",
  tripLabel: "Airport transfer",
  pickupLabel: "51 Ravara Rd, Ballygowan",
  dropoffLabel: "Dublin Airport",
  tripDate: "2026-11-11",
  tripTime: "05:00",
  returnJourney: true,
  returnDate: "2026-11-15",
  returnTime: "17:50",
} as Parameters<typeof buildTransferCalendarEvents>[0]);

assert.equal(events.length, 2);
const [out, ret] = events;
assert.match(out!.description, /Pickup: 51 Ravara Rd, Ballygowan\nDrop-off: Dublin Airport/);
assert.equal(out!.location, "51 Ravara Rd, Ballygowan");
assert.match(ret!.description, /Pickup: Dublin Airport\nDrop-off: 51 Ravara Rd, Ballygowan/);
assert.match(ret!.description, /RETURN/);
assert.equal(ret!.location, "Dublin Airport");
assert.equal(ret!.startDateTime, "2026-11-15T17:50");
console.log("return calendar address checks passed");

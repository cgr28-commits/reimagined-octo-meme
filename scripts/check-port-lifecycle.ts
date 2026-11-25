/** Port identity across quote -> saved quote -> booking -> amendment, direction and swaps. Run: npx tsx scripts/check-port-lifecycle.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_PORTS, portPickupNotes, resolveJourneyPorts, sailingRequirement } from "../shared/ports";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";

const P = (id: string) => DEFAULT_PORTS.find((p) => p.id === id)!;
const cruise = P("belfast-cruise-terminal"), vt4 = P("stena-belfast-cairnryan-vt4");
const BFS = { placeId: "ChIJairport", lat: 54.657, lng: -6.216 };

// 1. Place id identifies the port even with no coordinates (saved quotes carry no diaryRoute coordinates).
let r = resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: cruise.placeId, dropoffPlaceId: BFS.placeId });
assert.equal(r.pickupPort?.id, cruise.id); assert.equal(r.dropoffPort, null);
// 2. Swapped: the port becomes the drop-off.
r = resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: BFS.placeId, dropoffPlaceId: cruise.placeId });
assert.equal(r.pickupPort, null); assert.equal(r.dropoffPort?.id, cruise.id);
// 3. Coordinates remain a fallback for older quotes; an unrelated id never matches a port.
r = resolveJourneyPorts(DEFAULT_PORTS, { pickupLat: vt4.lat, pickupLng: vt4.lng });
assert.equal(r.pickupPort?.id, vt4.id);
assert.equal(resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: "ChIJother" }).pickupPort, null);
console.log("OK  port resolved by stable id; swap moves it to the drop-off; coordinates only a fallback");

// 4. Instructions follow direction.
const from = resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: cruise.placeId, dropoffPlaceId: BFS.placeId });
const to = resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: BFS.placeId, dropoffPlaceId: cruise.placeId });
assert.deepEqual(portPickupNotes(from.pickupPort, from.dropoffPort, false).map((n) => n.leg), ["outbound"]);
assert.equal(portPickupNotes(to.pickupPort, to.dropoffPort, false).length, 0, "drop-off-only port: no 'Where we meet you'");
assert.deepEqual(portPickupNotes(to.pickupPort, to.dropoffPort, true).map((n) => n.leg), ["return"], "return reverses: port becomes the return pickup");
assert.deepEqual(portPickupNotes(from.pickupPort, from.dropoffPort, true).map((n) => n.leg), ["outbound"]);
console.log("OK  instructions: pickup only; none for drop-off-only; return journey reverses");

// 5. Cruise ship mandatory for cruise pickups; ferry prefilled; optional sailing info.
assert.equal(sailingRequirement(from.pickupPort, from.dropoffPort, false).shipRequired, true);
assert.equal(sailingRequirement(to.pickupPort, to.dropoffPort, false).shipRequired, false);
assert.equal(sailingRequirement(to.pickupPort, to.dropoffPort, true).shipRequired, true, "return from a cruise terminal");
const f = resolveJourneyPorts(DEFAULT_PORTS, { pickupPlaceId: vt4.placeId });
const fs = sailingRequirement(f.pickupPort, f.dropoffPort, false);
assert.equal(fs.shipRequired, false); assert.match(fs.prefill, /Stena Line/); assert.match(fs.prefill, /Cairnryan/);
console.log(`OK  ship name required for cruise pickups; ferry prefill "${fs.prefill}"`);

// 6. Server gate.
const base = { customerName: "A B", customerEmail: "a@b.co", mobileNumber: "+1 212 555 0147", tripLabel: "t", pickupLabel: "p", dropoffLabel: "d",
  tripDate: "2026-12-20", tripTime: "10:00", vehicle: "Standard", passengers: 2, termsAcceptedAt: "2026-11-25T10:00:00Z" } as const;
const ship = (b: Record<string, unknown>) => getPaymentBookingBlockers({ ...base, ...b } as never).some((x) => /ship name/i.test(x));
assert.equal(ship({ pickupPlaceId: cruise.placeId }), true);
assert.equal(ship({ pickupPlaceId: cruise.placeId, sailingDetails: "MSC Virtuosa" }), false);
assert.equal(ship({ dropoffPlaceId: cruise.placeId }), false);
assert.equal(ship({ pickupPlaceId: vt4.placeId }), false);
assert.equal(ship({}), false);
console.log("OK  payment gate enforces ship name only for cruise pickups");

// 7. Lifecycle wiring (static): ids on the quick-quote journey, booking merge, saved quote, amendments.
const rd = (f: string) => readFileSync(f, "utf8");
assert.match(rd("shared/quick-quote.ts"), /pickupPlaceId\?: string/);
assert.match(rd("workers/addresses/src/quick-quote-handlers.ts"), /placeIdOf\(body\.pickupPlaceId\)/);
assert.match(rd("workers/addresses/src/index.ts"), /pickupPlaceId: j\.pickupPlaceId \?\? booking\.pickupPlaceId/);
assert.match(rd("workers/addresses/src/saved-quote-handlers.ts"), /pickupPlaceId: journey\.pickupPlaceId/);
assert.match(rd("shared/booking-amendment.ts"), /"sailingDetails"/);
assert.match(rd("workers/addresses/src/booking-amendment-handlers.ts"), /proposed\.sailingDetails/);
assert.match(rd("workers/addresses/src/paid-booking-edit-handlers.ts"), /fields\.sailingDetails/);
assert.match(rd("workers/addresses/src/quote-handlers.ts"), /requireSchedule === true/);
const qc = rd("src/components/QuoteCard.tsx");
assert.match(qc, /function handlePickupChange[\s\S]{0,300}setPickupPlace\(emptySelectedPlace\(\)\)/);
assert.match(qc, /function handleDropoffChange[\s\S]{0,300}setDropoffPlace\(emptySelectedPlace\(\)\)/);
console.log("OK  place ids persist quote -> booking; sailing details amendable (owner + customer); editing an address clears its id");

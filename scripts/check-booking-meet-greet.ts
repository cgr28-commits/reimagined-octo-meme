import assert from "node:assert/strict";
import fs from "node:fs";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
for (const airportCode of ["BFS", "BHD", "DUB"] as const) {
  for (const returnJourney of [false, true]) {
    for (const fromAirport of [false, true]) {
      const express = resolveExpressDropOff({ airportCode, fromAirport, returnJourney, selected: true, outboundSelected: true, returnSelected: true });
      const input = { airportCode, fromAirport, returnJourney, expressLegs: express.legs,
        fees: { bfsGbp: 25, bhdGbp: 25, dubGbp: 25 }, allowPaidMeetGreet: true };
      const ordinary = quoteAirportAccessCharges(input);
      const selected = quoteAirportAccessCharges({ ...input, outboundChoice: "meet-greet", returnChoice: "meet-greet" });
      const eligible = fromAirport || returnJourney;
      assert.equal(selected.meetGreetFeeGbp, eligible ? 25 : 0);
      assert.equal(selected.expressDropOffFee, ordinary.expressDropOffFee);
      assert.equal(selected.airportAccessChargeGbp - ordinary.airportAccessChargeGbp, eligible ? 25 : 0);
      const included = quoteAirportAccessCharges({ ...input, meetGreetIncluded: true });
      assert.equal(included.meetGreetFeeGbp, 0);
      assert.equal(included.expressDropOffFee, ordinary.expressDropOffFee);
      const changed = quoteAirportAccessCharges({ ...input, fees: { bfsGbp: 30, bhdGbp: 30, dubGbp: 30 }, outboundChoice: "meet-greet", returnChoice: "meet-greet" });
      assert.equal(changed.meetGreetFeeGbp, eligible ? 30 : 0);
    }
  }
}
const a2a = quoteAirportAccessCharges({ isAirportToAirport: true, pickupAirportCode: "BFS", dropoffAirportCode: "DUB", returnJourney: true,
  outboundChoice: "meet-greet", returnChoice: "meet-greet", allowPaidMeetGreet: true, fees: { bfsGbp: 25, bhdGbp: 25, dubGbp: 25 } });
assert.equal(a2a.meetGreetFeeGbp, 50);
assert.equal(a2a.expressDropOffFee, 0);
const card = fs.readFileSync("src/components/QuoteCard.tsx", "utf8");
assert.ok(card.indexOf('data-booking-meet-greet') > card.indexOf('id="child-seat-availability"'));
assert.match(card, /personalised name board/);
assert.match(card, /disabled=\{included\}/);
const worker = fs.readFileSync("workers/addresses/src/index.ts", "utf8");
assert.match(worker, /outboundChoice: booking.outboundAirportAccessOption === "meet-greet"/);
assert.match(worker, /fees: pricing.meetGreet/);
assert.match(worker, /allowPaidMeetGreet: true/);
assert.equal(fs.readFileSync("shared/meet-greet.ts", "utf8"), fs.readFileSync("workers/addresses/shared/meet-greet.ts", "utf8"));
console.log("PASS optional Meet & Greet: configured fees, airport pickup legs, return journeys, mandatory access unchanged, Business Class included, authoritative checkout wiring, Worker sync.");

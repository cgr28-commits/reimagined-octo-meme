/**
 * Direction-aware airport fee / waiting / toll inclusion wording.
 */
import assert from "node:assert/strict";
import {
  formatEmailFareIncludesBlock,
  getAddressToAddressInclusions,
  getAirportTripInclusions,
  resolveJourneyInclusions,
} from "../shared/journey-inclusions";

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("Airport pickup: 60 min waiting only for BFS (no pickup fee line)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: true, airportCode: "BFS" });
  assert.equal(inc.summary, "Fixed price for your journey.");
  assert.doesNotMatch(inc.summary, /drop-off|fee|toll/i);
  assert.ok(!inc.bullets.some((b) => /pickup fee|drop-off/i.test(b)));
  assert.ok(inc.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.equal(inc.complimentaryWaitingMinutes, 60);
  assert.equal(inc.mentionsTolls, false);
});

check("Airport drop-off: no fee bullets for BHD (no 60 min waiting)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: false, airportCode: "BHD" });
  assert.equal(inc.summary, "Fixed price for your journey.");
  assert.doesNotMatch(inc.summary, /pickup fee|fee|toll/i);
  assert.ok(!inc.bullets.some((b) => /fee|toll|parking|60 minutes/.test(b)));
  assert.equal(inc.complimentaryWaitingMinutes, 10);
});

check("Dublin Airport pickup: parking + M1 + waiting (no drop-off fee)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: true, airportCode: "DUB" });
  assert.ok(inc.bullets.some((b) => /Airport parking and M1 tolls included/.test(b)));
  assert.ok(inc.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!inc.bullets.some((b) => /drop-off/i.test(b)));
  assert.ok(!inc.bullets.some((b) => /Express/i.test(b)));
  assert.equal(inc.mentionsTolls, true);
});

check("Dublin Airport drop-off: M1 tolls only (no drop-off fee claim, no waiting)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" });
  assert.ok(inc.bullets.some((b) => /M1 tolls included/.test(b)));
  assert.ok(!inc.bullets.some((b) => /drop-off fee/i.test(b)));
  assert.ok(!inc.bullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.bullets.some((b) => /pickup|parking/i.test(b)));
  assert.equal(inc.mentionsTolls, true);
});

check("City of Derry: waiting on pickup only; never airport-fee wording", () => {
  const pickup = getAirportTripInclusions({ isFromAirport: true, airportCode: "LDY" });
  assert.ok(pickup.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!pickup.bullets.some((b) => /fee|toll|parking/i.test(b)));
  assert.equal(pickup.mentionsTolls, false);

  const dropoff = getAirportTripInclusions({ isFromAirport: false, airportCode: "LDY" });
  assert.ok(!dropoff.bullets.some((b) => /fee|toll|parking|waiting/i.test(b)));
  assert.doesNotMatch(dropoff.summary, /fee|toll/i);
  assert.equal(dropoff.mentionsTolls, false);
});

check("Address-to-address: fixed price + 10 min waiting, no airport fees/tolls", () => {
  const inc = getAddressToAddressInclusions();
  assert.equal(inc.summary, "Fixed price for your journey.");
  assert.ok(inc.bullets.some((b) => /10 minutes complimentary waiting/.test(b)));
  assert.ok(!inc.bullets.some((b) => /airport|toll|express|fee/i.test(b)));
  assert.equal(inc.mentionsTolls, false);
  assert.equal(inc.complimentaryWaitingMinutes, 10);
});

check("Return home→BFS then BFS→home: outbound no drop-off fee; return pickup waiting only", () => {
  const inc = getAirportTripInclusions({
    isFromAirport: false,
    returnJourney: true,
    airportCode: "BFS",
  });
  assert.ok(!inc.outboundBullets.some((b) => /drop-off|fee/i.test(b)));
  assert.ok(!inc.outboundBullets.some((b) => /60 minutes/.test(b)));
  assert.ok(inc.returnBullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.returnBullets.some((b) => /pickup fee|drop-off|fee/i.test(b)));
});

check("Email includes block matches customer examples", () => {
  const pickup = formatEmailFareIncludesBlock(
    getAirportTripInclusions({ isFromAirport: true, airportCode: "BFS" }),
    "£55.00",
  );
  assert.match(pickup, /Fixed fare: £55\.00/);
  assert.doesNotMatch(pickup, /pickup fee|drop-off|fee included/i);
  assert.match(pickup, /60 minutes complimentary airport waiting/);

  const dropoff = formatEmailFareIncludesBlock(
    getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" }),
    "£234",
  );
  assert.match(dropoff, /M1 tolls included/);
  assert.doesNotMatch(dropoff, /drop-off fee/i);
  assert.doesNotMatch(dropoff, /60 minutes/);
});

check("resolveJourneyInclusions A2A vs airport", () => {
  const a2a = resolveJourneyInclusions({
    isAirportTrip: false,
    isFromAirport: false,
    addressToAddress: true,
  });
  assert.equal(a2a.summary, "Fixed price for your journey.");

  const airport = resolveJourneyInclusions({
    isAirportTrip: true,
    isFromAirport: true,
    airportCode: "BHD",
  });
  assert.equal(airport.summary, "Fixed price for your journey.");
  assert.ok(airport.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!airport.bullets.some((b) => /fee included/i.test(b)));
});

check("No contradictory dual fee wording helpers remain in QuoteCard", async () => {
  const fs = await import("node:fs");
  const card = fs.readFileSync("src/components/QuoteCard.tsx", "utf8");
  assert.doesNotMatch(card, /express drop-off and pickup fees/i);
  assert.match(card, /PriceInclusionBlock/);
  assert.match(card, /resolveJourneyInclusions|journey-inclusions/);
});

check("Operational airport charge line items remain unset (wording + fixed-cost path)", async () => {
  const cfg = JSON.parse(
    await import("node:fs").then((fs) => fs.readFileSync("src/lib/pricing-config.json", "utf8")),
  ) as {
    operational: {
      defaultTollsGbp: number | null;
      airportChargesGbp: Record<string, number | null>;
    };
  };
  assert.equal(cfg.operational.defaultTollsGbp, null);
  for (const code of ["BFS", "BHD", "DUB", "LDY"]) {
    assert.equal(cfg.operational.airportChargesGbp[code], null);
  }
});

console.log("\nAll airport fee wording checks passed.");

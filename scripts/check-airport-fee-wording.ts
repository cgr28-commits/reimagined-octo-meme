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

check("Airport pickup: express pickup + 60 min waiting (no drop-off fee)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: true, airportCode: "BFS" });
  assert.match(inc.summary, /express pickup fee/i);
  assert.doesNotMatch(inc.summary, /drop-off/i);
  assert.ok(inc.bullets.some((b) => /Express pickup fee included/.test(b)));
  assert.ok(inc.bullets.some((b) => /60 minutes complimentary airport waiting/.test(b)));
  assert.ok(!inc.bullets.some((b) => /drop-off/i.test(b)));
  assert.equal(inc.complimentaryWaitingMinutes, 60);
  assert.equal(inc.mentionsTolls, false);
});

check("Airport drop-off: express drop-off only (no 60 min waiting)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: false, airportCode: "BHD" });
  assert.match(inc.summary, /express drop-off fee/i);
  assert.doesNotMatch(inc.summary, /pickup fee/i);
  assert.ok(inc.bullets.some((b) => /Express drop-off fee included/.test(b)));
  assert.ok(!inc.bullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.bullets.some((b) => /pickup fee/i.test(b)));
  assert.equal(inc.complimentaryWaitingMinutes, 10);
});

check("Dublin Airport pickup includes tolls + pickup + waiting", () => {
  const inc = getAirportTripInclusions({ isFromAirport: true, airportCode: "DUB" });
  assert.ok(inc.bullets.some((b) => /Applicable tolls included/.test(b)));
  assert.ok(inc.bullets.some((b) => /Express pickup fee included/.test(b)));
  assert.ok(inc.bullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.bullets.some((b) => /drop-off/i.test(b)));
  assert.equal(inc.mentionsTolls, true);
});

check("Dublin Airport drop-off includes tolls + drop-off (no waiting)", () => {
  const inc = getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" });
  assert.ok(inc.bullets.some((b) => /Applicable tolls included/.test(b)));
  assert.ok(inc.bullets.some((b) => /Express drop-off fee included/.test(b)));
  assert.ok(!inc.bullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.bullets.some((b) => /pickup fee/i.test(b)));
});

check("Address-to-address: fixed price only, no airport fees/tolls", () => {
  const inc = getAddressToAddressInclusions();
  assert.equal(inc.summary, "Fixed price for your journey.");
  assert.equal(inc.bullets.length, 0);
  assert.equal(inc.mentionsTolls, false);
  assert.equal(inc.complimentaryWaitingMinutes, 10);
});

check("Return home→BFS then BFS→home evaluates each leg", () => {
  const inc = getAirportTripInclusions({
    isFromAirport: false,
    returnJourney: true,
    airportCode: "BFS",
  });
  assert.ok(inc.outboundBullets.some((b) => /drop-off/i.test(b)));
  assert.ok(!inc.outboundBullets.some((b) => /60 minutes/.test(b)));
  assert.ok(inc.returnBullets.some((b) => /pickup/i.test(b)));
  assert.ok(inc.returnBullets.some((b) => /60 minutes/.test(b)));
  assert.ok(!inc.outboundBullets.some((b) => /pickup fee/i.test(b)));
  assert.ok(!inc.returnBullets.some((b) => /drop-off/i.test(b)));
});

check("Email includes block matches customer examples", () => {
  const pickup = formatEmailFareIncludesBlock(
    getAirportTripInclusions({ isFromAirport: true, airportCode: "BFS" }),
    "£55.00",
  );
  assert.match(pickup, /Fixed fare: £55\.00/);
  assert.match(pickup, /Express pickup fee/);
  assert.match(pickup, /60 minutes complimentary airport waiting time/);
  assert.doesNotMatch(pickup, /drop-off/i);

  const dropoff = formatEmailFareIncludesBlock(
    getAirportTripInclusions({ isFromAirport: false, airportCode: "DUB" }),
    "£230",
  );
  assert.match(dropoff, /Applicable tolls/);
  assert.match(dropoff, /Express drop-off fee/);
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
  assert.match(airport.summary, /pickup fee/i);
});

check("No contradictory dual fee wording helpers remain in QuoteCard", async () => {
  const fs = await import("node:fs");
  const card = fs.readFileSync("src/components/QuoteCard.tsx", "utf8");
  assert.doesNotMatch(card, /express drop-off and pickup fees/i);
  assert.match(card, /PriceInclusionBlock/);
  assert.match(card, /resolveJourneyInclusions|journey-inclusions/);
});

check("Operational airport charge line items remain unset (wording-only change)", async () => {
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

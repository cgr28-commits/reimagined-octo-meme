/**
 * Temporary EMERGE Boucher ↔ Belfast city centre £24 fare (29–30 Aug 2026 only).
 * Run: npx tsx scripts/check-emerge-boucher-city-centre-fare.ts
 */

import assert from "node:assert/strict";
import { VEHICLE_TYPES } from "../src/lib/data";
import {
  EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_DATES,
  EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP,
  isBelfastCityCentreEndpoint,
  isBoucherPlayingFieldsEndpoint,
  isEmergeBoucherCityCentreFixedFareDate,
  resolveEmergeBoucherCityCentreOneWayGbp,
} from "../src/lib/emerge-belfast-festival-fare";
import { calculatePointToPointQuote } from "../src/lib/quote";

const SALOON = VEHICLE_TYPES[0];
const BOUCHER = "Boucher Playing Fields, Belfast, BT12 6HR, UK";
const CITY_HALL = "Belfast City Hall, Donegall Square North, Belfast BT1 5GS, UK";
const MALONE = "100 Malone Road, Belfast BT9 5BN, UK";
const BANGOR = "Main Street, Bangor BT20 5ED, UK";

/** Representative short A2A metrics (~Boucher ↔ centre). */
const METRICS = { distanceKm: 4.2, durationMinutes: 14 };

function fare(
  pickup: string,
  dropoff: string,
  outboundDate: string,
): number | null {
  return (
    calculatePointToPointQuote(
      pickup,
      dropoff,
      SALOON,
      false,
      { outboundDate, outboundTime: "16:00" },
      METRICS,
    )?.amount ?? null
  );
}

console.log("=== Matchers ===");
assert.equal(isBoucherPlayingFieldsEndpoint({ address: BOUCHER }), true);
assert.equal(
  isBoucherPlayingFieldsEndpoint({
    placeName: "Boucher Playing Fields",
    formattedAddress: "Boucher Rd, Belfast BT12 6EU, UK",
    lat: 54.578938,
    lng: -5.963782,
  }),
  true,
);
assert.equal(isBoucherPlayingFieldsEndpoint({ address: CITY_HALL }), false);
assert.equal(isBelfastCityCentreEndpoint({ address: CITY_HALL }), true);
assert.equal(isBelfastCityCentreEndpoint({ address: "Belfast City Centre" }), true);
assert.equal(isBelfastCityCentreEndpoint({ address: MALONE }), false, "BT9 must not count as centre");
assert.equal(isBelfastCityCentreEndpoint({ address: BOUCHER }), false, "Boucher is not centre");
assert.equal(isBelfastCityCentreEndpoint({ address: BANGOR }), false);
console.log("OK  Boucher + tight city-centre matchers");

console.log("\n=== Date gate (auto-expires after 30 Aug 2026) ===");
assert.deepEqual([...EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_DATES], [
  "2026-08-29",
  "2026-08-30",
]);
assert.equal(isEmergeBoucherCityCentreFixedFareDate("2026-08-29"), true);
assert.equal(isEmergeBoucherCityCentreFixedFareDate("2026-08-30"), true);
assert.equal(isEmergeBoucherCityCentreFixedFareDate("2026-08-28"), false);
assert.equal(isEmergeBoucherCityCentreFixedFareDate("2026-08-31"), false);
assert.equal(isEmergeBoucherCityCentreFixedFareDate(""), false);
assert.equal(EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP, 24);
console.log("OK  only 29–30 Aug 2026; 31 Aug onward is off");

console.log("\n=== Fixed £24 on festival dates (both directions) ===");
assert.equal(fare(CITY_HALL, BOUCHER, "2026-08-29"), 24);
assert.equal(fare(BOUCHER, CITY_HALL, "2026-08-30"), 24);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
    outboundDate: "2026-08-29",
  }),
  24,
);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: BOUCHER },
    dropoff: { address: CITY_HALL },
    outboundDate: "2026-08-30",
  }),
  24,
);
console.log("OK  29 Aug centre→Boucher £24; 30 Aug Boucher→centre £24");

console.log("\n=== Same route outside festival weekend = normal fare ===");
const fri28 = fare(CITY_HALL, BOUCHER, "2026-08-28");
const mon31 = fare(CITY_HALL, BOUCHER, "2026-08-31");
assert.ok(fri28 != null && fri28 > 0);
assert.ok(mon31 != null && mon31 > 0);
assert.notEqual(fri28, 24, `28 Aug should not be £24 (got ${fri28})`);
assert.notEqual(mon31, 24, `31 Aug should not be £24 (got ${mon31})`);
assert.equal(fri28, mon31, "normal engine should match for same route off-weekend");
console.log(`OK  28 Aug = £${fri28}; 31 Aug = £${mon31} (normal, not £24)`);

console.log("\n=== Unrelated routes unaffected on festival dates ===");
const maloneBoucher = fare(MALONE, BOUCHER, "2026-08-29");
const bangorBoucher = fare(BANGOR, BOUCHER, "2026-08-29");
const centreBangor = fare(CITY_HALL, BANGOR, "2026-08-29");
assert.ok(maloneBoucher != null);
assert.ok(bangorBoucher != null);
assert.ok(centreBangor != null);
assert.notEqual(maloneBoucher, 24, "Malone (BT9) ↔ Boucher must not get £24");
assert.notEqual(bangorBoucher, 24, "Bangor ↔ Boucher must not get £24");
assert.notEqual(centreBangor, 24, "City centre ↔ Bangor must not get £24");
console.log("OK  non city-centre/Boucher pairs keep normal pricing");

console.log("\n=== Uses selected pickup date, not 'today' ===");
// Calling with an explicit past/future festival date still resolves from outboundDate.
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
    outboundDate: "2026-08-29",
  }),
  24,
);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
    outboundDate: "2026-08-28",
  }),
  null,
);
console.log("OK  outboundDate drives the rule");

console.log("\nAll EMERGE Boucher↔city-centre festival fare checks passed.");

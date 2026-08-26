/**
 * Temporary EMERGE Boucher ↔ Belfast city centre £24 fare (route-only, no date).
 * Run: npx tsx scripts/check-emerge-boucher-city-centre-fare.ts
 */

import assert from "node:assert/strict";
import { VEHICLE_TYPES } from "../src/lib/data";
import {
  EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP,
  isBelfastCityCentreEndpoint,
  isBoucherPlayingFieldsEndpoint,
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
  outboundDate?: string,
): number | null {
  return (
    calculatePointToPointQuote(
      pickup,
      dropoff,
      SALOON,
      false,
      outboundDate
        ? { outboundDate, outboundTime: "16:00" }
        : {},
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

assert.equal(EMERGE_BOUCHER_CITY_CENTRE_FIXED_FARE_GBP, 24);

console.log("\n=== Fixed £24 with no journey date (initial quote) ===");
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
  }),
  24,
);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: BOUCHER },
    dropoff: { address: CITY_HALL },
    outboundDate: null,
  }),
  24,
);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
    outboundDate: "",
  }),
  24,
);
assert.equal(fare(CITY_HALL, BOUCHER), 24);
assert.equal(fare(BOUCHER, CITY_HALL), 24);
console.log("OK  £24 both directions with no outboundDate");

console.log("\n=== Fixed £24 regardless of selected date ===");
assert.equal(fare(CITY_HALL, BOUCHER, "2026-08-28"), 24);
assert.equal(fare(CITY_HALL, BOUCHER, "2026-08-29"), 24);
assert.equal(fare(BOUCHER, CITY_HALL, "2026-08-30"), 24);
assert.equal(fare(CITY_HALL, BOUCHER, "2026-08-31"), 24);
assert.equal(
  resolveEmergeBoucherCityCentreOneWayGbp({
    pickup: { address: CITY_HALL },
    dropoff: { address: BOUCHER },
    outboundDate: "2026-08-31",
  }),
  24,
);
console.log("OK  £24 on 28/29/30/31 Aug (date ignored)");

console.log("\n=== Unrelated routes unaffected ===");
const maloneBoucher = fare(MALONE, BOUCHER);
const bangorBoucher = fare(BANGOR, BOUCHER);
const centreBangor = fare(CITY_HALL, BANGOR);
assert.ok(maloneBoucher != null);
assert.ok(bangorBoucher != null);
assert.ok(centreBangor != null);
assert.notEqual(maloneBoucher, 24, "Malone (BT9) ↔ Boucher must not get £24");
assert.notEqual(bangorBoucher, 24, "Bangor ↔ Boucher must not get £24");
assert.notEqual(centreBangor, 24, "City centre ↔ Bangor must not get £24");
console.log("OK  non city-centre/Boucher pairs keep normal pricing");

console.log("\nAll EMERGE Boucher↔city-centre festival fare checks passed.");

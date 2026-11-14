/**
 * Belfast city centre (BT1/BT2) ↔ Belfast International minimum Saloon fare.
 * Off by default (£0). When set it floors each city-centre BFS leg's vehicle
 * fare; every other journey keeps the airport-wide Belfast International minimum.
 *
 * Run: tsx scripts/check-bfs-city-centre-minimum.ts
 */
import assert from "node:assert/strict";
import { applyBfsCityCentreMinimumFare, isBelfastCityCentreAddress } from "../shared/bfs-minimum-fare";
import {
  DEFAULT_BFS_CITY_CENTRE_MINIMUM_SALOON_FARE_GBP,
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  ownerPricingEngineOptions,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { calculateQuote } from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const settings = defaultOwnerPricingSettings();
settings.saloonFormula = { enabled: true, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
settings.estate.upliftGbp = 19;
settings.evening.enabled = false;
settings.night.enabled = false;
settings.weekend.enabled = false;
settings.bfsMinimumSaloonFareGbp = 38;
const schedule = { outboundDate: "2026-11-10", outboundTime: "12:00" };
const metrics = (fare: number) => ({ distanceKm: Math.max(0, (fare - 10) / 2.5) / 0.621371, durationMinutes: 30 });
const cityHall = "Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK";
const europa = "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK";
const glengormley = "7 Glen Manor Road, Newtownabbey BT36 7FU, UK";
const lisburnRoad = "100 Lisburn Road, Belfast BT9 6AG, UK";
const bt10 = "1 Finaghy Road North, Belfast BT10 0JA, UK";
const bt12 = "Hope Street, Belfast BT12 5EE, UK";

console.log("=== City centre is BT1 and BT2 only (full postcode needed) ===");
for (const address of [cityHall, europa]) assert.ok(isBelfastCityCentreAddress(address), address);
for (const address of [glengormley, lisburnRoad, bt10, bt12, "Belfast City Centre", "", null, undefined]) {
  assert.ok(!isBelfastCityCentreAddress(address), String(address));
}

console.log("=== Off by default: nothing changes ===");
assert.equal(DEFAULT_BFS_CITY_CENTRE_MINIMUM_SALOON_FARE_GBP, 0);
assert.equal(defaultOwnerPricingSettings().bfsCityCentreMinimumSaloonFareGbp, 0);
assert.equal(applyBfsCityCentreMinimumFare(48, SALOON_VEHICLE, ["BFS"], cityHall, settings), 48);
assert.equal(calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, schedule, metrics(48), false, settings)!.journeyFareGbp, 48);

console.log("=== £57 floor on city centre ↔ BFS, both directions, Saloon and Estate ===");
const with57 = { ...settings, bfsCityCentreMinimumSaloonFareGbp: 57 };
for (const address of [cityHall, europa]) {
  for (const fromAirport of [false, true]) {
    for (const [normal, expected] of [[30, 57], [48, 57], [57, 57], [64, 64]] as const) {
      const saloon = calculateQuote(address, "BFS", SALOON_VEHICLE, false, schedule, metrics(normal), fromAirport, with57)!;
      assert.equal(saloon.journeyFareGbp, expected, `saloon ${normal} → ${expected}`);
      const estate = calculateQuote(address, "BFS", ESTATE_VEHICLE, false, schedule, metrics(normal), fromAirport, with57)!;
      assert.equal(estate.journeyFareGbp, expected + 19, "estate = saloon floor + uplift");
      const viaPublic = calculateQuote(address, "BFS", SALOON_VEHICLE, false, schedule, metrics(normal), fromAirport, toPublicOwnerPricingConfig(with57))!;
      assert.equal(viaPublic.amount, saloon.amount, "public config parity");
    }
  }
}

console.log("=== Applied after the drive-to-pickup charge, so £57 stays £57 ===");
assert.equal(calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, schedule, metrics(48), false, with57, ["BFS"], { positioningChargeGbp: 3 })!.journeyFareGbp, 57);
assert.equal(calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, schedule, metrics(56), false, with57, ["BFS"], { positioningChargeGbp: 3 })!.journeyFareGbp, 59);

console.log("=== Return: each leg floored, then the usual return discount ===");
const oneWay = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, schedule, metrics(48), false, with57)!;
const ret = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, true, { ...schedule, returnDate: "2026-11-17", returnTime: "12:00" }, metrics(48), false, with57)!;
const plainReturn = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, true, { ...schedule, returnDate: "2026-11-17", returnTime: "12:00" }, metrics(57), false, settings)!;
assert.ok(ret.journeyFareGbp! > oneWay.journeyFareGbp!, "return costs more than one way");
assert.equal(ret.journeyFareGbp, plainReturn.journeyFareGbp, "same as a normal £57-per-leg return");

console.log("=== Everything else is untouched ===");
for (const address of [glengormley, lisburnRoad, bt10, bt12]) {
  for (const fromAirport of [false, true]) {
    const before = calculateQuote(address, "BFS", SALOON_VEHICLE, false, schedule, metrics(30), fromAirport, settings)!;
    const after = calculateQuote(address, "BFS", SALOON_VEHICLE, false, schedule, metrics(30), fromAirport, with57)!;
    assert.equal(after.amount, before.amount, `${address} unchanged`);
    assert.equal(after.journeyFareGbp, 38, "local trips keep the £38 Belfast International minimum");
  }
}
for (const airport of ["BHD", "DUB"]) {
  const before = calculateQuote(cityHall, airport, SALOON_VEHICLE, false, schedule, metrics(40), false, settings)!;
  const after = calculateQuote(cityHall, airport, SALOON_VEHICLE, false, schedule, metrics(40), false, with57)!;
  assert.equal(after.amount, before.amount, `city centre → ${airport} unchanged`);
}
assert.equal(applyBfsCityCentreMinimumFare(30, "7 Seater Minibus", ["BFS"], cityHall, with57), 30, "Saloon and Estate only");

console.log("=== Validation, public config and change summary ===");
const valid = validateOwnerPricingInput({ ...with57 });
assert.ok(valid.ok, "57 is valid");
if (valid.ok) assert.equal(valid.settings.bfsCityCentreMinimumSaloonFareGbp, 57);
const legacy = validateOwnerPricingInput({ ...settings, bfsCityCentreMinimumSaloonFareGbp: undefined });
assert.ok(legacy.ok && legacy.settings.bfsCityCentreMinimumSaloonFareGbp === 0, "older saves default to off");
assert.ok(!validateOwnerPricingInput({ ...settings, bfsCityCentreMinimumSaloonFareGbp: -1 }).ok, "negative rejected");
assert.ok(!validateOwnerPricingInput({ ...settings, bfsCityCentreMinimumSaloonFareGbp: 57.5 }).ok, "pence rejected");
assert.equal(toPublicOwnerPricingConfig(with57).bfsCityCentreMinimumSaloonFareGbp, 57);
assert.equal(ownerPricingEngineOptions(with57).bfsCityCentreMinimumSaloonFareGbp, 57, "engine options carry the floor");
const diff = diffOwnerPricingSettings(settings, with57);
assert.ok(diff.some(row => /Belfast city centre/.test(row.setting) && row.oldValue === "No extra minimum" && row.newValue === "£57.00"), "confirm dialog shows the change");

console.log("PASS");

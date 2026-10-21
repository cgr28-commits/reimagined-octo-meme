import assert from "node:assert/strict";
import { addLongDistanceTiers, LONG_DISTANCE_TIER_MILES } from "../src/lib/long-distance-pricing";
import { defaultOwnerPricingSettings, validateOwnerPricingInput } from "../shared/owner-pricing-config";
import { rawUniversalSaloonJourneyFareGbp, calculateUniversalSaloonJourneyFareGbp } from "../shared/universal-distance-pricing";
const settings = defaultOwnerPricingSettings();
const original = structuredClone(settings.saloon);
const expanded = addLongDistanceTiers(original);
assert.deepEqual(original, settings.saloon, "Adding tiers must not mutate saved settings");
for (const miles of LONG_DISTANCE_TIER_MILES) assert.ok(expanded.knots.some(knot => knot.miles === miles));
assert.deepEqual(expanded.knots.filter(knot => knot.miles <= 100), original.knots);
assert.deepEqual(addLongDistanceTiers(expanded), expanded, "Do not duplicate tiers on repeat or reload");
assert.equal(validateOwnerPricingInput({ ...settings, saloon: expanded }).ok, true);
const curve = (s: typeof original) => ({ minimumGbp: s.minimumFareGbp, floorMiles: s.floorMiles, knots: s.knots.map(knot => [knot.miles, knot.fareGbp] as const) });
for (let miles = 0; miles <= 400; miles += 0.25) {
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(miles, curve(original)) - rawUniversalSaloonJourneyFareGbp(miles, curve(expanded))) < 1e-8);
  assert.equal(calculateUniversalSaloonJourneyFareGbp(miles, curve(original)), calculateUniversalSaloonJourneyFareGbp(miles, curve(expanded)));
}
const custom = { ...original, knots: [...original.knots, { miles: 150, fareGbp: 350 }] };
const customExpanded = addLongDistanceTiers(custom);
assert.equal(customExpanded.knots.find(knot => knot.miles === 150)?.fareGbp, 350);
for (let miles = 0; miles <= 400; miles += 0.25) assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(miles, curve(custom)) - rawUniversalSaloonJourneyFareGbp(miles, curve(customExpanded))) < 1e-8);
const raised = { ...expanded, knots: expanded.knots.map(knot => knot.miles >= 125 ? { ...knot, fareGbp: knot.fareGbp + 25 } : knot) };
assert.equal(calculateUniversalSaloonJourneyFareGbp(267, curve(raised)), 10 + 2.2 * 267, "Retired tiers cannot override £10 + £2.20 per mile");
for (let miles = 0; miles <= 100; miles += 0.25) assert.equal(calculateUniversalSaloonJourneyFareGbp(miles, curve(raised)), calculateUniversalSaloonJourneyFareGbp(miles, curve(original)));
assert.throws(() => addLongDistanceTiers({ ...original, knots: [] }));
assert.throws(() => addLongDistanceTiers({ ...original, knots: [{ miles: 100, fareGbp: 200 }, { miles: 90, fareGbp: 180 }] }));
console.log("Long-distance tiers: preservation, interpolation, extrapolation, custom saved tiers, editing and validation passed.");

/**
 * Public passenger/luggage selectors follow Offer 7 Seater Minibus Online.
 * Run: npx tsx scripts/check-public-minibus-capacity.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import {
  MAX_PASSENGERS,
  MAX_SUITCASES,
  isValidPublicPassengerCount,
  isValidPublicSuitcaseCount,
  publicPassengerCapacityCopy,
  publicPassengerOptions,
  publicSuitcaseOptions,
} from "../shared/passenger-limits";
import {
  defaultOwnerPricingSettings,
  minibusBaseFareFromSaloon,
  normalizeOwnerPricingSettings,
  publicMaxPassengers,
  publicMaxSuitcases,
} from "../shared/owner-pricing-config";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
import { previewMinibusQueryOverride } from "../src/lib/pricing-preview-store";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

function quoteInput(overrides: Record<string, unknown> = {}) {
  return {
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS" as const,
    fromAirport: false,
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    ...overrides,
  };
}

const offPricing = defaultOwnerPricingSettings();
const onPricing = {
  ...defaultOwnerPricingSettings(),
  minibus: { publicEnabled: true, multiplier: 1.55 },
};

check("1. Minibus OFF => passenger max 4", () => {
  assert.equal(publicMaxPassengers(false), 4);
  assert.deepEqual(publicPassengerOptions(false), [1, 2, 3, 4]);
  assert.equal(isValidPublicPassengerCount(4, false), true);
  assert.equal(isValidPublicPassengerCount(5, false), false);
});

check("2. Minibus OFF => luggage max 4", () => {
  assert.equal(publicMaxSuitcases(false), 4);
  assert.deepEqual(publicSuitcaseOptions(false), [0, 1, 2, 3, 4]);
  assert.equal(isValidPublicSuitcaseCount(4, false), true);
  assert.equal(isValidPublicSuitcaseCount(5, false), false);
});

check("3. Minibus OFF => 5 passengers rejected server-side", () => {
  const result = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 5, suitcases: 2, pricing: offPricing }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "passenger_limit");
    assert.match(result.message, /1–4 passengers|up to 4 passengers/);
  }
});

check("4. Minibus OFF => 5 large bags rejected server-side", () => {
  const result = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 5, pricing: offPricing }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "luggage_limit");
    assert.match(result.message, /0–4|up to 4 large suitcases/);
  }
});

check("5. Minibus ON => passenger options 1–7", () => {
  assert.equal(publicMaxPassengers(true), 7);
  assert.deepEqual(publicPassengerOptions(true), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(isValidPublicPassengerCount(7, true), true);
});

check("6. Minibus ON => luggage options 0–7", () => {
  assert.equal(publicMaxSuitcases(true), 7);
  assert.deepEqual(publicSuitcaseOptions(true), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(isValidPublicSuitcaseCount(7, true), true);
});

check("7–9. 5/6/7 passengers => Minibus", () => {
  for (const pax of [5, 6, 7]) {
    assert.equal(requiresMinibus(pax, 2), true);
    assert.equal(selectVehicleForParty(pax, 2), MINIBUS_VEHICLE);
    const result = calculateAuthoritativeWebsiteQuote(
      quoteInput({
        passengers: pax,
        suitcases: 2,
        pricing: onPricing,
        vehicleType: SALOON_VEHICLE,
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vehicleType, MINIBUS_VEHICLE);
    }
  }
});

check("10. 8 passengers => rejected", () => {
  const result = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 8, suitcases: 2, pricing: onPricing }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "passenger_limit");
});

check("11–13. 5/6/7 large bags cannot be Saloon/Estate", () => {
  for (const bags of [5, 6, 7]) {
    assert.equal(requiresMinibus(2, bags), true);
    assert.notEqual(selectVehicleForParty(2, bags), SALOON_VEHICLE);
    assert.notEqual(selectVehicleForParty(2, bags), ESTATE_VEHICLE);
    assert.equal(selectVehicleForParty(2, bags), MINIBUS_VEHICLE);
    const result = calculateAuthoritativeWebsiteQuote(
      quoteInput({
        passengers: 2,
        suitcases: bags,
        pricing: onPricing,
        vehicleType: ESTATE_VEHICLE,
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vehicleType, MINIBUS_VEHICLE);
    }
  }
});

check("14. 8 large bags => rejected", () => {
  const result = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 8, pricing: onPricing }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "luggage_limit");
});

check("15. Existing 1–4 passenger Saloon/Estate behaviour unchanged", () => {
  assert.equal(selectVehicleForParty(1, 0), SALOON_VEHICLE);
  assert.equal(selectVehicleForParty(4, 2), SALOON_VEHICLE);
  assert.equal(selectVehicleForParty(2, 3), ESTATE_VEHICLE);
  assert.equal(selectVehicleForParty(4, 4), ESTATE_VEHICLE);
  assert.equal(requiresMinibus(4, 4), false);
  const saloon = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 1, pricing: onPricing }),
  );
  const estate = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 4, pricing: onPricing }),
  );
  assert.equal(saloon.ok, true);
  assert.equal(estate.ok, true);
  if (saloon.ok) assert.equal(saloon.vehicleType, SALOON_VEHICLE);
  if (estate.ok) assert.equal(estate.vehicleType, ESTATE_VEHICLE);
});

check("16. Minibus switched OFF after a 5–7 passenger quote => checkout blocked", () => {
  const whileOn = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 6, suitcases: 2, pricing: onPricing }),
  );
  assert.equal(whileOn.ok, true);
  if (whileOn.ok) assert.equal(whileOn.vehicleType, MINIBUS_VEHICLE);

  const afterOff = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 6, suitcases: 2, pricing: offPricing, vehicleType: MINIBUS_VEHICLE }),
  );
  assert.equal(afterOff.ok, false);
  if (!afterOff.ok) {
    assert.ok(afterOff.reason === "passenger_limit" || afterOff.reason === "vehicle_unavailable");
    assert.notEqual(afterOff.reason, "no_fare");
  }
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE/);
  assert.doesNotMatch(card, /if \(passengers > passengerLimit\) \{\s*setPassengers\(passengerLimit\)/);
  assert.doesNotMatch(card, /if \(suitcases > SELECTOR_MAX_SUITCASES\) \{\s*setSuitcases\(SELECTOR_MAX_SUITCASES\)/);
});

check("17. Missing/corrupt configuration => safe public maximum remains 4", () => {
  assert.equal(MAX_PASSENGERS, 4);
  assert.equal(MAX_SUITCASES, 4);
  assert.equal(normalizeOwnerPricingSettings(null).minibus.publicEnabled, false);
  assert.equal(normalizeOwnerPricingSettings({}).minibus.publicEnabled, false);
  assert.equal(normalizeOwnerPricingSettings({ minibus: { publicEnabled: "yes" } }).minibus.publicEnabled, false);
  assert.equal(publicMaxPassengers(normalizeOwnerPricingSettings(null).minibus.publicEnabled), 4);
  assert.equal(publicMaxSuitcases(false), 4);
  const result = calculateAuthoritativeWebsiteQuote(quoteInput({ passengers: 5, suitcases: 2 }));
  assert.equal(result.ok, false);
});

check("18. Preview ON/OFF correctly changes the selectors", () => {
  assert.equal(publicPassengerCapacityCopy(false), "Private airport transfer for 1–4 passengers.");
  assert.equal(publicPassengerCapacityCopy(true), "Private airport transfers for up to 7 passengers.");
  const selectors = read("src/components/PublicPartySelectors.tsx");
  assert.match(selectors, /publicPassengerOptions/);
  assert.match(selectors, /publicSuitcaseOptions/);
  assert.match(selectors, /grid-cols-4/);
  assert.match(selectors, /Private airport transfers for up to 7 passengers|publicPassengerCapacityCopy/);
  const preview = read("src/lib/pricing-preview-store.ts");
  assert.match(preview, /previewMinibusQueryOverride/);
  assert.match(preview, /value === "0" \|\| value === "off"/);
  const offPage = read("src/app/owner/pricing-preview/quote-off/page.tsx");
  const onPage = read("src/app/owner/pricing-preview/quote-on/page.tsx");
  assert.match(offPage, /publicMinibusEnabled=\{false\}/);
  assert.match(onPage, /publicMinibusEnabled=\{true\}/);
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /PublicPartySelectors/);
  assert.doesNotMatch(progressive, /options=\{\[1, 2, 3, 4\]\}/);
  void previewMinibusQueryOverride;
});

check("Approved Minibus pricing unchanged (Estate × 1.55, penny only)", () => {
  const result = calculateAuthoritativeWebsiteQuote(
    quoteInput({
      passengers: 5,
      suitcases: 2,
      pricing: onPricing,
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.vehicleType, MINIBUS_VEHICLE);
  }
  const fare = minibusBaseFareFromSaloon(50, onPricing);
  assert.equal(fare.estateGbp, 56);
  assert.equal(fare.minibusQuotedGbp, 86.8);
  assert.equal(fare.minibusExactGbp, 86.8);
});

check("7 passengers + 7 bags is Minibus only — no invented Request Quote rule", () => {
  assert.equal(selectVehicleForParty(7, 7), MINIBUS_VEHICLE);
  const data = read("src/lib/data.ts");
  assert.match(data, /needsLuggageCapacityConfirmation[\s\S]*return false/);
});

console.log("\nPublic Minibus capacity checks passed.");

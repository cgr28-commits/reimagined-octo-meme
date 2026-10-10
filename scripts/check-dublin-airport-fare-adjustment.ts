/**
 * Dublin Airport Fare Adjustment (%) — journey fare only.
 * Run: npx tsx scripts/check-dublin-airport-fare-adjustment.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { roundCustomerPayableGbp, roundGbp } from "../shared/gbp";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import {
  getOwnerPricingSettings,
  saveOwnerPricingSettings,
} from "../workers/addresses/src/owner-pricing-store";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const ESTATE = "Estate Car (1–4 passengers)" as const;
const EXECUTIVE = "Executive Saloon (1–4 passengers)" as const;
const MINIBUS = "Minibus (5–7 passengers)" as const;
const VEHICLES = [SALOON, ESTATE, EXECUTIVE, MINIBUS] as const;

const CITY = "Belfast City Hall, Belfast BT1 5GS";
const MILES = 98.6;
const DUB_METRICS = { distanceKm: MILES / 0.621371, durationMinutes: 110.5 };
const BFS_METRICS = { distanceKm: 18 / 0.621371, durationMinutes: 30 };

function pricingAt(rate: number): OwnerPricingSettings {
  const settings = defaultOwnerPricingSettings();
  settings.dublinAirportFareAdjustment = { rate };
  settings.minibus.publicEnabled = true;
  return settings;
}

function quoteDub(
  vehicle: (typeof VEHICLES)[number],
  rate: number,
  returnJourney: boolean,
  fromAirport: boolean,
) {
  const quote = calculateQuote(
    CITY,
    "DUB",
    vehicle,
    returnJourney,
    {},
    DUB_METRICS,
    fromAirport,
    pricingAt(rate),
  );
  assert.ok(quote, `${vehicle} ${rate} return=${returnJourney} from=${fromAirport}`);
  return quote;
}

const zeroSaloon = quoteDub(SALOON, 0, false, false)!;
const baseJourney = zeroSaloon.journeyFareGbp!;
assert.equal(baseJourney, 206, "98.6 mile Saloon journey stays £206 at 0%");
assert.equal(zeroSaloon.airportFixedCostsGbp, 4);
assert.equal(zeroSaloon.amount, 210);

console.log("Belfast City Hall → Dublin Airport at 98.6 miles");
console.log("vehicle | rate | one-way journey | one-way total | payable | return journey | return total | return payable | tolls");

for (const rate of [0, 0.1, 0.2]) {
  for (const vehicle of VEHICLES) {
    const one = quoteDub(vehicle, rate, false, false)!;
    const ret = quoteDub(vehicle, rate, true, false)!;
    const from = quoteDub(vehicle, rate, false, true)!;
    const base = quoteDub(vehicle, 0, false, false)!;
    const baseFrom = quoteDub(vehicle, 0, false, true)!;
    const adjusted = rate === 0 ? base.journeyFareGbp! : roundGbp(base.journeyFareGbp! * (1 + rate));
    assert.equal(one.journeyFareGbp, adjusted, `${vehicle} one-way journey at ${rate}`);
    assert.equal(one.airportFixedCostsGbp, base.airportFixedCostsGbp);
    assert.equal(one.amount, roundGbp(adjusted + base.airportFixedCostsGbp!));
    assert.equal(from.journeyFareGbp, one.journeyFareGbp, `${vehicle} from-airport journey matches`);
    assert.equal(from.airportFixedCostsGbp, baseFrom.airportFixedCostsGbp);
    assert.equal(from.amount, roundGbp(adjusted + baseFrom.airportFixedCostsGbp!));
    const baseReturn = quoteDub(vehicle, 0, true, false)!;
    const returnJourney = roundGbp(getReturnJourneyFare(adjusted, 0.05));
    assert.equal(ret.journeyFareGbp, returnJourney, `${vehicle} return discount on adjusted fare`);
    assert.equal(ret.airportFixedCostsGbp, baseReturn.airportFixedCostsGbp);
    assert.equal(ret.amount, roundGbp(returnJourney + baseReturn.airportFixedCostsGbp!));
    if (vehicle === SALOON || vehicle === ESTATE) {
      assert.equal(one.airportFixedCostsGbp, 4);
      assert.equal(from.airportFixedCostsGbp, 9);
      assert.equal(ret.airportFixedCostsGbp, 13);
    }
    const onePayable = roundCustomerPayableGbp(one.amount);
    const returnPayable = roundCustomerPayableGbp(ret.amount);
    console.log(
      `${vehicle.split(" ")[0]} | ${rate * 100}% | ${one.journeyFareGbp} | ${one.amount} | ${onePayable} | ${ret.journeyFareGbp} | ${ret.amount} | ${returnPayable} | ${one.airportFixedCostsGbp}/${ret.airportFixedCostsGbp}`,
    );
  }
}

const bfsZero = calculateQuote(CITY, "BFS", SALOON, false, {}, BFS_METRICS, false, pricingAt(0))!;
const bfsRaised = calculateQuote(CITY, "BFS", SALOON, false, {}, BFS_METRICS, false, pricingAt(0.2))!;
assert.equal(bfsRaised.amount, bfsZero.amount);
assert.equal(bfsRaised.journeyFareGbp, bfsZero.journeyFareGbp);

const cityZero = calculatePointToPointQuote(CITY, "Dublin city centre", SALOON, false, {}, DUB_METRICS, null, undefined, pricingAt(0))!;
const cityRaised = calculatePointToPointQuote(CITY, "Dublin city centre", SALOON, false, {}, DUB_METRICS, null, undefined, pricingAt(0.2))!;
assert.equal(cityRaised.amount, cityZero.amount);

for (const rate of [0, 0.1, 0.2]) {
  for (const returnJourney of [false, true]) {
    const direct = quoteDub(SALOON, rate, returnJourney, false)!;
    const service = calculateAuthoritativeWebsiteQuote({
      airportCode: "DUB",
      fromAirport: false,
      pickupAddress: CITY,
      dropoffAddress: "Dublin Airport",
      returnJourney,
      passengers: 1,
      suitcases: 1,
      routeMetrics: DUB_METRICS,
      vehicleType: SALOON,
      pricing: pricingAt(rate),
    });
    assert.equal(service.ok, true);
    if (!service.ok) continue;
    assert.equal(service.amount, direct.amount);
    assert.equal(service.journeyFareGbp, direct.journeyFareGbp);
    assert.equal(service.airportFixedCostsGbp, direct.airportFixedCostsGbp);
    assert.equal(roundCustomerPayableGbp(service.amount), roundCustomerPayableGbp(direct.amount));
  }
}

const storedWithoutField = defaultOwnerPricingSettings();
const raw = JSON.parse(JSON.stringify(storedWithoutField)) as Record<string, unknown>;
delete raw.dublinAirportFareAdjustment;
const normalized = normalizeOwnerPricingSettings(raw);
assert.equal(normalized.dublinAirportFareAdjustment.rate, 0);
assert.equal(normalized.estate.upliftGbp, storedWithoutField.estate.upliftGbp);
assert.equal(normalized.saloon.knots.length, storedWithoutField.saloon.knots.length);

const tooHigh = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  dublinAirportFareAdjustment: { rate: 1.5 },
});
assert.equal(tooHigh.ok, false);
const negative = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  dublinAirportFareAdjustment: { rate: -0.1 },
});
assert.equal(negative.ok, false);

const changes = diffOwnerPricingSettings(pricingAt(0), pricingAt(0.1));
assert.deepEqual(
  changes.filter((change) => change.setting === "Dublin Airport Fare Adjustment"),
  [{ setting: "Dublin Airport Fare Adjustment", oldValue: "0%", newValue: "10%" }],
);

const panel = fs.readFileSync("src/components/OwnerPricingPanel.tsx", "utf8");
assert.match(panel, /Dublin Airport Fare Adjustment \(%\)/);
assert.match(panel, /data-dublin-fare-adjustment/);
const quoteSrc = fs.readFileSync("src/lib/quote.ts", "utf8");
assert.match(quoteSrc, /dublinAirportJourneyFareGbp/);
const payment = fs.readFileSync("workers/addresses/src/index.ts", "utf8");
assert.match(payment, /dublinAirportJourney/);

function memoryKv() {
  const data = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
}

async function verifySavedSettingMatchesQuoteAndCheckout() {
  const store = memoryKv();
  const initial = await getOwnerPricingSettings(store);
  assert.equal(initial.dublinAirportFareAdjustment.rate, 0);

  const draft = defaultOwnerPricingSettings();
  draft.dublinAirportFareAdjustment = { rate: 0.1 };
  const saved = await saveOwnerPricingSettings(store, draft, {
    expectedVersion: initial.version,
    actor: "owner",
  });
  assert.equal(saved.settings.dublinAirportFareAdjustment.rate, 0.1);
  assert.ok(
    saved.audit.some((entry) =>
      entry.changes.some(
        (change) =>
          change.setting === "Dublin Airport Fare Adjustment" &&
          change.oldValue === "0%" &&
          change.newValue === "10%",
      ),
    ),
  );

  const loaded = await getOwnerPricingSettings(store);
  assert.equal(loaded.dublinAirportFareAdjustment.rate, 0.1);
  assert.equal(loaded.saloon.knots.length, initial.saloon.knots.length);
  assert.equal(loaded.estate.upliftGbp, initial.estate.upliftGbp);

  for (const vehicle of VEHICLES) {
    for (const returnJourney of [false, true]) {
      const quote = calculateQuote(
        CITY,
        "DUB",
        vehicle,
        returnJourney,
        {},
        DUB_METRICS,
        false,
        loaded,
      )!;
      const service = calculateAuthoritativeWebsiteQuote({
        airportCode: "DUB",
        fromAirport: false,
        pickupAddress: CITY,
        dropoffAddress: "Dublin Airport",
        returnJourney,
        passengers: vehicle === MINIBUS ? 6 : 2,
        suitcases: vehicle === ESTATE || vehicle === MINIBUS ? 4 : 1,
        routeMetrics: DUB_METRICS,
        vehicleType: vehicle,
        pricing: loaded,
        ownerMode: vehicle === MINIBUS,
        maxPassengers: 7,
      });
      assert.equal(service.ok, true);
      if (!service.ok) continue;
      assert.equal(service.amount, quote.amount);
      assert.equal(service.journeyFareGbp, quote.journeyFareGbp);
      assert.equal(service.airportFixedCostsGbp, quote.airportFixedCostsGbp);
      const breakdown = composeWebsiteFareBreakdown({
        journeyFareBeforeAirportAccessGbp: service.journeyFareGbp ?? 0,
        airportFixedCostsGbp: service.airportFixedCostsGbp ?? 0,
        nightWeekendSurchargeGbp: service.nightWeekendSurchargeGbp ?? 0,
        returnJourney,
        ...(vehicle === EXECUTIVE
          ? {
              businessClassMinimumFareGbp: loaded.executive.minimumFareGbp,
              outboundOneWayBeforeAccessGbp: service.outboundOneWayBeforeAccessGbp,
              returnOneWayBeforeAccessGbp: service.returnOneWayBeforeAccessGbp,
              returnDiscountRate: loaded.returnDiscount.rate,
            }
          : {}),
      });
      const charge = resolveSumUpChargeAmountGbp(
        breakdown.finalAmountPayableGbp,
        breakdown.finalAmountPayableGbp,
      );
      assert.equal(charge, breakdown.finalAmountPayableGbp);
      const withExtra = composeWebsiteFareBreakdown({
        journeyFareBeforeAirportAccessGbp: service.journeyFareGbp ?? 0,
        airportFixedCostsGbp: service.airportFixedCostsGbp ?? 0,
        nightWeekendSurchargeGbp: service.nightWeekendSurchargeGbp ?? 0,
        airportAccessChargeGbp: 10,
        returnJourney,
      });
      assert.equal(withExtra.airportAccessChargeGbp, 10);
      assert.equal(
        withExtra.finalAmountPayableGbp,
        roundCustomerPayableGbp(
          (service.journeyFareGbp ?? 0) + (service.airportFixedCostsGbp ?? 0) + 10,
        ),
      );
    }
  }

  const bfsSaved = calculateQuote(CITY, "BFS", SALOON, false, {}, BFS_METRICS, false, loaded)!;
  const bfsDefault = calculateQuote(CITY, "BFS", SALOON, false, {}, BFS_METRICS, false, initial)!;
  assert.equal(bfsSaved.amount, bfsDefault.amount);

  const zeroDraft = defaultOwnerPricingSettings();
  zeroDraft.dublinAirportFareAdjustment = { rate: 0 };
  const restored = await saveOwnerPricingSettings(store, zeroDraft, {
    expectedVersion: loaded.version,
    actor: "owner",
  });
  assert.equal(restored.settings.dublinAirportFareAdjustment.rate, 0);
  const back = calculateQuote(CITY, "DUB", SALOON, false, {}, DUB_METRICS, false, restored.settings)!;
  assert.equal(back.amount, 210);
  assert.equal(back.airportFixedCostsGbp, 4);
}

verifySavedSettingMatchesQuoteAndCheckout()
  .then(() => {
    console.log("Dublin Airport fare adjustment checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

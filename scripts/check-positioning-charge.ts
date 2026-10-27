/**
 * Drive-to-pickup (positioning) charge — settings, fare composition, Worker
 * helper and privacy checks. Routing is mocked; nothing is saved or deployed.
 *
 * Run: node --import tsx scripts/check-positioning-charge.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  defaultProfitabilitySettings,
  diffProfitabilitySettings,
  isPositioningChargeActive,
  normalizeProfitabilitySettings,
  positioningChargeFromMilesGbp,
  validateProfitabilitySettings,
  type ProfitabilitySettings,
} from "../src/lib/owner-profitability-settings";
import {
  calculateAuthoritativeWebsiteQuote,
  type QuoteServiceInput,
} from "../src/lib/quote-service";
import {
  defaultOwnerPricingSettings,
  toPublicOwnerPricingConfig,
} from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolvePositioningChargeGbp } from "../workers/addresses/src/positioning-charge";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const ON: ProfitabilitySettings = {
  ...defaultProfitabilitySettings(),
  positioningChargeEnabled: true,
  positioningFreeMiles: 4,
  positioningRatePerMileGbp: 1,
};

async function main() {
  console.log("=== Settings: OFF by default, validated, audited ===");
  const defaults = defaultProfitabilitySettings();
  assert.equal(defaults.positioningChargeEnabled, false);
  assert.equal(defaults.positioningFreeMiles, 4);
  assert.equal(defaults.positioningRatePerMileGbp, 1);
  assert.equal(isPositioningChargeActive(defaults), false);
  assert.equal(isPositioningChargeActive(ON), true);
  assert.equal(isPositioningChargeActive({ ...ON, positioningRatePerMileGbp: 0 }), false);
  // Independent of MPG / profitability protection.
  assert.equal(ON.vehicleMpg, null);

  // Settings saved before this feature existed read back as OFF.
  const legacy = normalizeProfitabilitySettings({
    targetHourlyEarningsGbp: 40,
    minimumSaloonOneWayGbp: 38,
    dieselPricePerLitreGbp: 1.6,
    vehicleMpg: 47,
    wearAllowancePerMileGbp: 0.1,
  });
  assert.equal(legacy.positioningChargeEnabled, false);
  assert.equal(legacy.vehicleMpg, 47);
  // Corrupt stored values fall back to OFF instead of breaking pricing.
  assert.equal(normalizeProfitabilitySettings({ positioningChargeEnabled: "yes" }).positioningChargeEnabled, false);

  const valid = validateProfitabilitySettings({ ...ON, positioningFreeMiles: 6, positioningRatePerMileGbp: 1.25 });
  assert.ok(valid.ok);
  assert.equal(valid.ok && valid.settings.positioningFreeMiles, 6);
  for (const bad of [
    { positioningFreeMiles: -1 },
    { positioningFreeMiles: 31 },
    { positioningRatePerMileGbp: 5.01 },
    { positioningRatePerMileGbp: -0.5 },
    { positioningChargeEnabled: "on" },
  ]) {
    const result = validateProfitabilitySettings({ ...ON, ...bad });
    assert.equal(result.ok, false, `should reject ${JSON.stringify(bad)}`);
  }
  const audit = diffProfitabilitySettings(defaults, ON).map((change) => change.setting);
  assert.deepEqual(audit, ["Drive-to-pickup charge"]);

  console.log("=== Charge maths: free radius, whole pounds ===");
  assert.equal(positioningChargeFromMilesGbp(3.9, ON), 0);
  assert.equal(positioningChargeFromMilesGbp(4, ON), 0);
  assert.equal(positioningChargeFromMilesGbp(10, ON), 6);
  assert.equal(positioningChargeFromMilesGbp(10.4, ON), 6);
  assert.equal(positioningChargeFromMilesGbp(10.6, ON), 7);
  assert.equal(positioningChargeFromMilesGbp(10, { ...ON, positioningRatePerMileGbp: 1.25 }), 8);
  assert.equal(positioningChargeFromMilesGbp(10, defaults), 0, "OFF never charges");
  assert.equal(positioningChargeFromMilesGbp(Number.NaN, ON), 0);

  console.log("=== Fare engine: OFF / 0 is byte-identical ===");
  const pricing = defaultOwnerPricingSettings();
  const route = { distanceKm: 30, durationMinutes: 30 };
  const base: QuoteServiceInput = {
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hospital, Lisburn Rd, Belfast BT9 7AB, UK",
    dropoffAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    returnJourney: false,
    outboundDate: "2026-11-11",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
    routeMetrics: route,
    pricing,
  };
  const vehicles = [
    "Standard Saloon (1–4 passengers)",
    "Estate Car (1–4 passengers)",
    "Executive Saloon (1–4 passengers)",
  ] as const;
  const scenarios: Array<Partial<QuoteServiceInput>> = [];
  for (const airportCode of ["BFS", "BHD", "DUB"] as const) {
    for (const fromAirport of [false, true]) {
      for (const returnJourney of [false, true]) {
        for (const outboundTime of ["10:00", "23:30"]) {
          for (const vehicleType of vehicles) {
            scenarios.push({
              airportCode,
              fromAirport,
              returnJourney,
              outboundTime,
              returnDate: returnJourney ? "2026-11-18" : undefined,
              returnTime: returnJourney ? "14:00" : undefined,
              vehicleType,
              pickupAddress: fromAirport ? "Belfast International Airport" : base.pickupAddress,
              dropoffAddress: fromAirport ? base.pickupAddress : "Belfast International Airport",
              routeMetrics: airportCode === "DUB" ? { distanceKm: 170, durationMinutes: 110 } : route,
            });
          }
        }
      }
    }
  }
  for (const scenario of scenarios) {
    const without = calculateAuthoritativeWebsiteQuote({ ...base, ...scenario });
    const zero = calculateAuthoritativeWebsiteQuote({ ...base, ...scenario, positioningChargeGbp: 0 });
    assert.deepEqual(zero, without, `0 charge changed ${JSON.stringify(scenario)}`);
    assert.ok(without.ok, `baseline should price ${JSON.stringify(scenario)}`);
  }
  console.log(`  ${scenarios.length} scenarios unchanged`);

  console.log("=== Fare engine: charge composes like any fare ===");
  const day = calculateAuthoritativeWebsiteQuote(base);
  const dayCharged = calculateAuthoritativeWebsiteQuote({ ...base, positioningChargeGbp: 6 });
  assert.ok(day.ok && dayCharged.ok);
  if (day.ok && dayCharged.ok) {
    assert.equal(dayCharged.amount, day.amount + 6, "weekday one-way adds exactly £6");
    assert.equal(dayCharged.journeyFareGbp, (day.journeyFareGbp ?? 0) + 6);
    assert.equal(dayCharged.airportFixedCostsGbp, day.airportFixedCostsGbp, "airport fees untouched");
    assert.equal(
      dayCharged.outboundOneWayBeforeAccessGbp,
      (day.outboundOneWayBeforeAccessGbp ?? 0) + 6,
    );
    console.log(`  BFS weekday Saloon: £${day.amount} → £${dayCharged.amount}`);
  }

  const nightInput = { ...base, outboundTime: "23:30" };
  const night = calculateAuthoritativeWebsiteQuote(nightInput);
  const nightCharged = calculateAuthoritativeWebsiteQuote({ ...nightInput, positioningChargeGbp: 6 });
  assert.ok(night.ok && nightCharged.ok);
  if (night.ok && nightCharged.ok) {
    assert.ok((night.nightWeekendSurchargeGbp ?? 0) > 0, "default pricing has a night surcharge");
    // The surcharge is a percentage of the vehicle fare, so it also covers the charge.
    assert.ok(
      (nightCharged.nightWeekendSurchargeGbp ?? 0) > (night.nightWeekendSurchargeGbp ?? 0),
      "night surcharge applies to the drive-to-pickup charge",
    );
    assert.ok(nightCharged.amount > night.amount + 6 - 0.001);
  }

  const returnInput: QuoteServiceInput = {
    ...base,
    returnJourney: true,
    returnDate: "2026-11-18",
    returnTime: "14:00",
  };
  const ret = calculateAuthoritativeWebsiteQuote(returnInput);
  const retCharged = calculateAuthoritativeWebsiteQuote({ ...returnInput, positioningChargeGbp: 6 });
  assert.ok(ret.ok && retCharged.ok);
  if (ret.ok && retCharged.ok) {
    const added = Math.round((retCharged.amount - ret.amount) * 100) / 100;
    // Both legs share the address end: £12 before the 5% return discount.
    assert.ok(added > 11 && added <= 12, `return adds ~£12 less 5% (got £${added})`);
    assert.equal(
      retCharged.returnOneWayBeforeAccessGbp,
      (ret.returnOneWayBeforeAccessGbp ?? 0) + 6,
      "return leg carries the charge",
    );
    console.log(`  BFS return Saloon: £${ret.amount} → £${retCharged.amount}`);
  }

  // The customer breakdown is composed from the same parts and still adds up.
  if (dayCharged.ok) {
    const breakdown = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: dayCharged.journeyFareGbp ?? dayCharged.amount,
      nightWeekendSurchargeGbp: dayCharged.nightWeekendSurchargeGbp ?? 0,
      airportFixedCostsGbp: dayCharged.airportFixedCostsGbp ?? 0,
      returnJourney: false,
    });
    assert.equal(breakdown.finalAmountPayableGbp, dayCharged.amount);
  }

  // Fixed postcode fares are owner-set totals and never get the charge.
  const postcodePricing = {
    ...pricing,
    postcodePricingEnabled: true,
    postcodeRules: [
      { district: "BT9", airportCode: "BFS", saloonFareGbp: 50, enabled: true, approvalStatus: "approved" },
    ],
  } as unknown as typeof pricing;
  const fixed = calculateAuthoritativeWebsiteQuote({ ...base, pricing: postcodePricing });
  const fixedCharged = calculateAuthoritativeWebsiteQuote({
    ...base,
    pricing: postcodePricing,
    positioningChargeGbp: 6,
  });
  assert.ok(fixed.ok && fixedCharged.ok && day.ok);
  if (fixed.ok && fixedCharged.ok && day.ok) {
    assert.notEqual(fixed.amount, day.amount, "fixture: the postcode fare is in use");
    assert.equal(fixedCharged.amount, fixed.amount, "postcode fixed fare unchanged");
  }

  // Address-to-address has no airport leg and ignores the field.
  const a2a = calculateAuthoritativeWebsiteQuote({
    ...base,
    airportCode: null,
    dropoffAddress: "Holywood Library, 86-88 High St, Holywood BT18 9AE, UK",
  });
  const a2aCharged = calculateAuthoritativeWebsiteQuote({
    ...base,
    airportCode: null,
    dropoffAddress: "Holywood Library, 86-88 High St, Holywood BT18 9AE, UK",
    positioningChargeGbp: 6,
  });
  assert.deepEqual(a2aCharged, a2a);

  console.log("=== Worker helper: server points, address end, fail open ===");
  const realFetch = globalThis.fetch;
  let lastUrl = "";
  let routeMetres = 10 / 0.621371 * 1000; // 10 road miles
  globalThis.fetch = (async (url: string | URL) => {
    lastUrl = String(url);
    return new Response(
      JSON.stringify({ routes: [{ distance: routeMetres, duration: 900 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const point = { lat: 54.5855, lng: -5.9472 };
    const airport = { lat: 54.6575, lng: -6.2158 };
    assert.deepEqual(
      await resolvePositioningChargeGbp({ settings: defaults, airportTransfer: true, fromAirport: false, pickup: point, dropoff: airport }),
      { chargeGbp: 0, reason: "off" },
    );
    assert.deepEqual(
      await resolvePositioningChargeGbp({ settings: ON, airportTransfer: false, fromAirport: false, pickup: point, dropoff: point }),
      { chargeGbp: 0, reason: "not_airport_transfer" },
    );
    assert.deepEqual(
      await resolvePositioningChargeGbp({ settings: ON, airportTransfer: true, fromAirport: false, pickup: null, dropoff: airport }),
      { chargeGbp: 0, reason: "missing_point" },
    );
    const toAirport = await resolvePositioningChargeGbp({ settings: ON, airportTransfer: true, fromAirport: false, pickup: point, dropoff: airport });
    assert.deepEqual(toAirport, { chargeGbp: 6, reason: null });
    assert.ok(lastUrl.includes(`${point.lng},${point.lat}`), "routes to the pickup when going to the airport");

    const fromAirportPoint = { lat: 54.6431, lng: -5.8732 };
    routeMetres = 12 / 0.621371 * 1000;
    const fromAirport = await resolvePositioningChargeGbp({ settings: ON, airportTransfer: true, fromAirport: true, pickup: airport, dropoff: fromAirportPoint });
    assert.deepEqual(fromAirport, { chargeGbp: 8, reason: null });
    assert.ok(lastUrl.includes(`${fromAirportPoint.lng},${fromAirportPoint.lat}`), "routes to the drop-off when coming from the airport");

    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const outage = await resolvePositioningChargeGbp({ settings: ON, airportTransfer: true, fromAirport: false, pickup: { lat: 54.6, lng: -5.9 }, dropoff: airport });
    assert.deepEqual(outage, { chargeGbp: 0, reason: "routing_failed" }, "routing outage never blocks a booking");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("=== Privacy: base and charge settings stay owner-only ===");
  const publicConfig = JSON.stringify(toPublicOwnerPricingConfig(defaultOwnerPricingSettings()));
  assert.ok(!/positioning/i.test(publicConfig), "public pricing config has no positioning settings");
  const helper = read("workers/addresses/src/positioning-charge.ts");
  assert.ok(helper.includes('from "./operating-base"'), "base stays in the Worker");
  for (const file of ["src/lib/quote.ts", "src/lib/quote-service.ts", "src/lib/owner-profitability-settings.ts"]) {
    assert.ok(!read(file).includes("operating-base"), `${file} must not import the base`);
  }
  const receipt = read("workers/addresses/src/quote-receipt.ts");
  assert.ok(!/positioning/i.test(receipt.split("const CLAIM_KEYS")[1] ?? ""), "receipt claims carry no positioning field");
  const quoteHandler = read("workers/addresses/src/quote-handlers.ts");
  assert.ok(
    /pickup: serverPickup,\s*dropoff: serverDropoff,/.test(quoteHandler),
    "public quotes price the charge from server-resolved coordinates only",
  );
  // Quick quotes are also created by the WhatsApp bot (no map pins), so the
  // charge must come from server-resolved addresses, never body lat/lng.
  const quickQuote = read("workers/addresses/src/quick-quote-handlers.ts");
  assert.ok(
    /resolveWorkerTripRouteMetricsForPayment\(/.test(quickQuote) &&
      /pickup: positioningRoute\?\.ok \? positioningRoute\.pickup : null/.test(quickQuote),
    "quick quotes (owner + WhatsApp) price the charge from server-resolved coordinates",
  );

  console.log("PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

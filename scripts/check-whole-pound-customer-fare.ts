/**
 * Evening band, Night 23:00–06:00 at 20%, Weekend stays configurable,
 * and one final whole-pound ceiling on the customer price.
 * Run: npx tsx scripts/check-whole-pound-customer-fare.ts
 */

import assert from "node:assert/strict";
import { ceilCustomerFareToWholePoundGbp, roundGbp } from "../shared/gbp";
import {
  DEFAULT_EVENING_END_MINUTES,
  DEFAULT_EVENING_START_MINUTES,
  DEFAULT_EVENING_SURCHARGE_RATE,
  DEFAULT_MINIBUS_MULTIPLIER,
  DEFAULT_NIGHT_END_MINUTES,
  DEFAULT_NIGHT_START_MINUTES,
  DEFAULT_NIGHT_SURCHARGE_RATE,
  DEFAULT_WEEKEND_SURCHARGE_RATE,
  defaultOwnerPricingSettings,
  migrateLegacyPremiumSettings,
  normalizeOwnerPricingSettings,
  ownerPricingEngineOptions,
  premiumBandForMinutes,
  premiumWindowsOverlap,
  surchargeRateForDateTime,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import { DEFAULT_TARGET_HOURLY_EARNINGS_GBP } from "../src/lib/owner-profitability-settings";
import { applyTripPremium, isTripPremiumDateTime } from "../src/lib/point-to-point-premium";
import { calculateQuote } from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const MINIBUS = "Minibus (5–7 passengers)" as const;
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const rules = ownerPricingEngineOptions();
const windowRules = {
  eveningEnabled: rules.eveningEnabled,
  eveningStartMinutes: rules.eveningStartMinutes,
  eveningEndMinutes: rules.eveningEndMinutes,
  nightEnabled: rules.nightEnabled,
  nightStartMinutes: rules.nightStartMinutes,
  nightEndMinutes: rules.nightEndMinutes,
  weekendEnabled: rules.weekendEnabled,
  weekendDays: rules.weekendDays,
};

function rateAt(day: number, hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return surchargeRateForDateTime({
    day,
    minutes: hours! * 60 + minutes!,
    eveningRate: rules.eveningRate,
    nightRate: rules.nightRate,
    weekendRate: rules.weekendRate,
    rules: windowRules,
  });
}

function quoteAt(date: string, time: string, vehicle: typeof SALOON_VEHICLE | typeof ESTATE_VEHICLE | typeof MINIBUS) {
  return calculateQuote(cityHall, "BFS", vehicle, false, {
    outboundDate: date,
    outboundTime: time,
  }, cityBfsMetrics);
}

console.log("=== Whole-pound ceiling ===");
assert.equal(ceilCustomerFareToWholePoundGbp(42.01), 43);
assert.equal(ceilCustomerFareToWholePoundGbp(42.9), 43);
assert.equal(ceilCustomerFareToWholePoundGbp(43), 43);
assert.equal(ceilCustomerFareToWholePoundGbp(43.0), 43);
assert.equal(ceilCustomerFareToWholePoundGbp(46.2), 47);
assert.equal(ceilCustomerFareToWholePoundGbp(51.01), 52);
assert.equal(ceilCustomerFareToWholePoundGbp(48.4), 49);
assert.equal(ceilCustomerFareToWholePoundGbp(0), 0);
console.log("OK  £42.01 → £43, £42.90 → £43, £43.00 stays £43");

console.log("\n=== Default bands ===");
assert.equal(DEFAULT_EVENING_SURCHARGE_RATE, 0.1);
assert.equal(DEFAULT_EVENING_START_MINUTES, 20 * 60);
assert.equal(DEFAULT_EVENING_END_MINUTES, 23 * 60);
assert.equal(DEFAULT_NIGHT_SURCHARGE_RATE, 0.2);
assert.equal(DEFAULT_NIGHT_START_MINUTES, 23 * 60);
assert.equal(DEFAULT_NIGHT_END_MINUTES, 6 * 60);
assert.equal(DEFAULT_WEEKEND_SURCHARGE_RATE, 0.1);
assert.equal(DEFAULT_TARGET_HOURLY_EARNINGS_GBP, 40);
assert.equal(DEFAULT_MINIBUS_MULTIPLIER, 1.55);
assert.equal(premiumWindowsOverlap(20 * 60, 23 * 60, 23 * 60, 6 * 60), false);
console.log("OK  Evening 20:00–23:00 +10%, Night 23:00–06:00 +20%, Weekend +10%, £40/hour kept");

console.log("\n=== Weekday boundaries (Wednesday = 3) ===");
assert.equal(rateAt(3, "19:59"), 0);
assert.equal(rateAt(3, "20:00"), 0.1);
assert.equal(rateAt(3, "22:59"), 0.1);
assert.equal(rateAt(3, "23:00"), 0.2);
assert.equal(rateAt(3, "05:59"), 0.2);
assert.equal(rateAt(3, "06:00"), 0);
assert.equal(premiumBandForMinutes(20 * 60, windowRules), "evening");
assert.equal(premiumBandForMinutes(23 * 60, windowRules), "night");
assert.notEqual(rateAt(3, "22:00"), 0.1 + 0.2);
console.log("OK  19:59 day, 20:00/22:59 evening, 23:00/05:59 night, 06:00 day");

console.log("\n=== Weekend adds to Evening or Night from the vehicle fare ===");
assert.equal(rateAt(6, "12:00"), 0.1);
assert.equal(rateAt(6, "20:00"), 0.2);
assert.equal(rateAt(6, "22:59"), 0.2);
assert.equal(rateAt(6, "23:00"), 0.3);
assert.equal(rateAt(0, "05:59"), 0.3);
assert.equal(rateAt(0, "10:00"), 0.1);
assert.equal(rateAt(6, "21:00"), 0.2);
assert.equal(rateAt(6, "23:30"), 0.3);
assert.notEqual(rateAt(6, "23:30"), 1.1 * 1.2 - 1, "Weekend must not compound on Night");
assert.notEqual(rateAt(3, "22:00"), 0.1 + 0.2, "Weekday evening is not also night");
console.log("OK  Saturday daytime 10%; Saturday evening 20%; Saturday night 30% of the vehicle fare");

const saturdayNight = quoteAt("2026-08-22", "23:00", SALOON_VEHICLE);
assert.ok(saturdayNight);
assert.equal(saturdayNight.nightWeekendSurchargeGbp, roundGbp(44 * 0.3));
assert.equal(saturdayNight.journeyFareGbp, roundGbp(44 + 44 * 0.3));
assert.equal(saturdayNight.amount, ceilCustomerFareToWholePoundGbp(44 * 1.3));
const dubMetrics = { distanceKm: 98 / 0.621371, durationMinutes: 120 };
const dubDay = calculateQuote(cityHall, "DUB", SALOON_VEHICLE, false, {
  outboundDate: "2026-08-19",
  outboundTime: "10:00",
}, dubMetrics, true);
const dubSaturdayNight = calculateQuote(cityHall, "DUB", SALOON_VEHICLE, false, {
  outboundDate: "2026-08-22",
  outboundTime: "23:00",
}, dubMetrics, true);
assert.ok(dubDay && dubSaturdayNight);
assert.equal(dubDay.airportFixedCostsGbp, 9);
assert.equal(dubSaturdayNight.airportFixedCostsGbp, 9);
assert.equal(
  dubSaturdayNight.nightWeekendSurchargeGbp,
  roundGbp((dubDay.journeyFareGbp ?? 0) * 0.3),
);
assert.equal(
  dubSaturdayNight.amount,
  ceilCustomerFareToWholePoundGbp((dubSaturdayNight.journeyFareGbp ?? 0) + 9),
);
console.log("OK  Weekend + Night is 30% of the vehicle fare; Dublin access stays £9");

console.log("\n=== Live quotes: Saloon, Estate, 7-seater ===");
const saloonDay = quoteAt("2026-08-19", "10:00", SALOON_VEHICLE);
const saloonEvening = quoteAt("2026-08-19", "20:00", SALOON_VEHICLE);
const saloonNight = quoteAt("2026-08-19", "23:00", SALOON_VEHICLE);
const estateDay = quoteAt("2026-08-19", "10:00", ESTATE_VEHICLE);
const estateNight = quoteAt("2026-08-19", "23:00", ESTATE_VEHICLE);
const minibusDay = quoteAt("2026-08-19", "10:00", MINIBUS);
const minibusEvening = quoteAt("2026-08-19", "22:00", MINIBUS);
const minibusNight = quoteAt("2026-08-19", "23:00", MINIBUS);
assert.ok(saloonDay && saloonEvening && saloonNight && estateDay && estateNight);
assert.ok(minibusDay && minibusEvening && minibusNight);
assert.equal(saloonDay.amount, 44);
assert.equal(saloonEvening.amount, 49);
assert.equal(saloonEvening.nightWeekendSurchargeGbp, 4.4);
assert.equal(saloonNight.amount, 53);
assert.equal(saloonNight.nightWeekendSurchargeGbp, 8.8);
assert.equal(estateDay.amount, 54);
assert.equal(estateNight.journeyFareGbp, 64.8);
assert.equal(estateNight.amount, 65);

const formulaMinibus = calculateUniversalJourneyFareGbp(0, MINIBUS, {
  saloonFareGbp: saloonDay.amount,
  estatePremiumGbp: 10,
  minibusMultiplier: DEFAULT_MINIBUS_MULTIPLIER,
});
assert.equal(formulaMinibus.journeyFareGbp, 83.7);
assert.equal(minibusDay.journeyFareGbp, 83.7);
assert.equal(minibusDay.amount, 84);
assert.equal(minibusEvening.journeyFareGbp, 92.07);
assert.equal(minibusEvening.amount, 93);
assert.equal(minibusNight.amount, 101);
for (const priced of [saloonDay, saloonEvening, saloonNight, estateDay, estateNight, minibusDay, minibusEvening, minibusNight]) {
  assert.equal(priced.amount % 1, 0, `customer amount £${priced.amount} must be a whole pound`);
}
console.log("OK  vehicle prices are whole pounds; 7-seater formula stays Estate × 1.55 before the ceiling");

console.log("\n=== Wall-clock boundaries ===");
assert.equal(isTripPremiumDateTime("2026-08-19", "19:59"), false);
assert.equal(isTripPremiumDateTime("2026-08-19", "20:00"), true);
assert.equal(isTripPremiumDateTime("2026-08-19", "22:59"), true);
assert.equal(isTripPremiumDateTime("2026-08-19", "23:00"), true);
assert.equal(isTripPremiumDateTime("2026-08-20", "05:59"), true);
assert.equal(isTripPremiumDateTime("2026-08-20", "06:00"), false);

const eveningLeg = applyTripPremium(44, {
  outboundDate: "2026-08-19",
  outboundTime: "20:00",
});
const nightLeg = applyTripPremium(44, {
  outboundDate: "2026-08-19",
  outboundTime: "23:00",
});
assert.equal(Math.round(eveningLeg.premiumAmount * 100) / 100, 4.4);
assert.equal(Math.round(nightLeg.premiumAmount * 100) / 100, 8.8);
assert.notEqual(
  Math.round((eveningLeg.premiumAmount + nightLeg.premiumAmount) * 100) / 100,
  Math.round(eveningLeg.premiumAmount * 100) / 100,
);
console.log("OK  surcharge is calculated before the customer ceiling, and Evening is not Night");

console.log("\n=== Stored legacy night default migrates; custom night is kept ===");
const legacy = defaultOwnerPricingSettings();
delete (legacy as { evening?: unknown }).evening;
legacy.night = {
  enabled: true,
  surchargeRate: 0.1,
  startMinutes: 22 * 60,
  endMinutes: 6 * 60,
};
legacy.saloon.minimumFareGbp = 31;
const migrated = normalizeOwnerPricingSettings(legacy);
assert.equal(migrated.saloon.minimumFareGbp, 31);
assert.equal(migrated.evening.startMinutes, 20 * 60);
assert.equal(migrated.evening.surchargeRate, 0.1);
assert.equal(migrated.night.startMinutes, 23 * 60);
assert.equal(migrated.night.surchargeRate, 0.2);

const customNight = defaultOwnerPricingSettings();
delete (customNight as { evening?: unknown }).evening;
customNight.night = {
  enabled: true,
  surchargeRate: 0.15,
  startMinutes: 22 * 60,
  endMinutes: 6 * 60,
};
const kept = migrateLegacyPremiumSettings(customNight, {
  ...defaultOwnerPricingSettings(),
  evening: defaultOwnerPricingSettings().evening,
  night: customNight.night,
});
assert.equal(kept.night.surchargeRate, 0.15);
assert.equal(kept.night.startMinutes, 22 * 60);
console.log("OK  old 22:00/10% default becomes 23:00/20%; a custom 15% night is left alone");

console.log("\n=== Overlapping saved bands are rejected and never added together ===");
const overlap = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  evening: {
    enabled: true,
    surchargeRate: 0.1,
    startMinutes: 20 * 60,
    endMinutes: 23 * 60 + 30,
  },
  night: {
    enabled: true,
    surchargeRate: 0.2,
    startMinutes: 23 * 60,
    endMinutes: 6 * 60,
  },
});
assert.equal(overlap.ok, false);
if (!overlap.ok) {
  assert.match(overlap.errors.map((error) => error.message).join(" "), /cannot overlap/);
}
const overlappedRules = {
  ...windowRules,
  eveningEndMinutes: 23 * 60 + 30,
};
assert.equal(premiumBandForMinutes(23 * 60 + 15, overlappedRules), "night");
assert.equal(
  surchargeRateForDateTime({
    day: 3,
    minutes: 23 * 60 + 15,
    eveningRate: 0.1,
    nightRate: 0.2,
    weekendRate: 0.1,
    rules: overlappedRules,
  }),
  0.2,
);
console.log("OK  overlap cannot be saved, and a shared minute uses Night only");

console.log("\nAll whole-pound customer fare checks passed.");

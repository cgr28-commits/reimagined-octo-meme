/**
 * Christmas period surcharge (owner-configurable: default 20%, 14–31 December).
 * Run: npx tsx scripts/check-christmas-pricing.ts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_CHRISTMAS_PRICING,
  defaultOwnerPricingSettings,
  isMonthDayInRange,
  nightWeekendSurchargeExplanation,
  nightWeekendSurchargeLabel,
  normalizeOwnerPricingSettings,
  parseMonthDayInput,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { applyTripPremium } from "../src/lib/point-to-point-premium";

const settings = defaultOwnerPricingSettings();
const premium = (date: string, time: string, pricing = settings) =>
  applyTripPremium(100, { outboundDate: date, outboundTime: time }, undefined, { pricing }).premiumAmount;

// Defaults: on, 20%, 14–31 December.
assert.deepEqual(DEFAULT_CHRISTMAS_PRICING, { enabled: true, surchargeRate: 0.2, startMonthDay: "12-14", endMonthDay: "12-31" });
assert.deepEqual(settings.christmas, DEFAULT_CHRISTMAS_PRICING);

// Weekday daytime: 0% normally, 20% inside the period (inclusive ends).
assert.equal(premium("2026-12-10", "12:00"), 0, "Thu 10 Dec daytime: no surcharge");
assert.equal(premium("2026-12-14", "12:00"), 20, "Mon 14 Dec: first day");
assert.equal(premium("2026-12-31", "12:00"), 20, "Thu 31 Dec: last day");
assert.equal(premium("2027-01-01", "12:00"), 0, "Fri 1 Jan: after the period");
// Highest applicable, never added together: Christmas 20% beats Night/Weekend 10%.
assert.equal(premium("2026-12-19", "12:00"), 20, "Saturday in the period: 20%, not 30%");
assert.equal(premium("2026-12-15", "23:00"), 20, "Night in the period: 20%, not 30%");
assert.equal(premium("2026-11-14", "12:00"), 10, "Saturday outside the period keeps Weekend 10%");

// Return journey: each leg priced on its own date.
const ret = applyTripPremium(
  100,
  { outboundDate: "2026-12-10", outboundTime: "12:00", returnDate: "2026-12-16", returnTime: "12:00", returnJourney: true },
  undefined,
  { pricing: settings },
);
assert.equal(ret.premiumAmount, 20, "only the return leg is in the period");

// Owner changes: rate, dates, off.
const custom = validateOwnerPricingInput({
  ...settings,
  christmas: { enabled: true, surchargeRate: 0.25, startMonthDay: "20/12", endMonthDay: "02/01" },
});
assert.ok(custom.ok, JSON.stringify(!custom.ok && custom.errors));
const customSettings = custom.ok ? custom.settings : settings;
assert.equal(customSettings.christmas?.startMonthDay, "12-20", "DD/MM stored as MM-DD");
assert.equal(premium("2026-12-19", "12:00", customSettings), 10, "before a later start: Weekend only");
assert.equal(premium("2026-12-21", "12:00", customSettings), 25);
assert.equal(premium("2027-01-01", "12:00", customSettings), 25, "range across New Year");
assert.equal(premium("2027-01-04", "12:00", customSettings), 0);
const off = normalizeOwnerPricingSettings({ ...settings, christmas: { ...DEFAULT_CHRISTMAS_PRICING, enabled: false } });
assert.equal(premium("2026-12-16", "12:00", off), 0, "switched off");

// Invalid input is rejected with a field error.
const bad = validateOwnerPricingInput({ ...settings, christmas: { ...DEFAULT_CHRISTMAS_PRICING, startMonthDay: "31/02" } });
assert.ok(!bad.ok && bad.errors.some((e) => e.field === "christmas.startMonthDay"));
const badRate = validateOwnerPricingInput({ ...settings, christmas: { ...DEFAULT_CHRISTMAS_PRICING, surchargeRate: 1.5 } });
assert.ok(!badRate.ok && badRate.errors.some((e) => e.field === "christmas.surchargeRate"));

// Stored settings from before this change (no christmas key) get the default period.
const legacy = { ...settings } as Record<string, unknown>;
delete legacy.christmas;
assert.deepEqual(normalizeOwnerPricingSettings(legacy).christmas, DEFAULT_CHRISTMAS_PRICING);

// The public config the website prices from carries the same period.
const publicConfig = toPublicOwnerPricingConfig(settings);
assert.deepEqual(publicConfig.christmas, DEFAULT_CHRISTMAS_PRICING);
assert.equal(premium("2026-12-16", "12:00", normalizeOwnerPricingSettings(publicConfig)), 20);

// Customer wording: Christmas only for Christmas trips; explanation names the dates.
assert.equal(nightWeekendSurchargeLabel(settings, ["2026-12-16"]), "Christmas 20% surcharge");
assert.equal(nightWeekendSurchargeLabel(settings, ["2026-11-14"]), "Night & Weekend Surcharge (10%)");
assert.match(nightWeekendSurchargeExplanation(settings), /20% Christmas surcharge applies to pickups from 14 December to 31 December/);

assert.equal(isMonthDayInRange("12-25", "12-14", "12-31"), true);
assert.equal(isMonthDayInRange("01-01", "12-20", "01-02"), true);
assert.equal(parseMonthDayInput("14/12"), "12-14");
assert.equal(parseMonthDayInput("12-14"), "12-14");
assert.equal(parseMonthDayInput("32/12"), null);

console.log("All Christmas pricing checks passed.");

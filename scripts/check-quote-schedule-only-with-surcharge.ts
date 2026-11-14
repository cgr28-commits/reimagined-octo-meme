/**
 * Quote tools ask for the pickup date and time before pricing only when the evening, night or
 * weekend surcharge is switched on in the owner dashboard. With all three off, the customer gets
 * the price first and gives the date and time at the booking step. Christmas does not count:
 * a Christmas journey is re-priced at the booking step for the customer to confirm.
 *
 * Run: npx tsx scripts/check-quote-schedule-only-with-surcharge.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  defaultOwnerPricingSettings,
  quoteNeedsScheduleUpFront,
  toPublicOwnerPricingConfig,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

function settings(modes: Partial<Record<"evening" | "night" | "weekend" | "christmas", { enabled: boolean; surchargeRate?: number }>>): OwnerPricingSettings {
  const base = defaultOwnerPricingSettings();
  const off = { enabled: false };
  return {
    ...base,
    evening: { ...base.evening!, ...off, ...modes.evening },
    night: { ...base.night, ...off, ...modes.night },
    weekend: { ...base.weekend, ...off, ...modes.weekend },
    christmas: { ...base.christmas!, ...off, ...modes.christmas },
  };
}

check("no surcharge on → date and time are not asked before the price", () => {
  assert.equal(quoteNeedsScheduleUpFront(settings({})), false);
  assert.equal(quoteNeedsScheduleUpFront(toPublicOwnerPricingConfig(settings({}))), false);
});

check("evening, night or weekend on → date and time are asked before the price", () => {
  assert.equal(quoteNeedsScheduleUpFront(settings({ evening: { enabled: true, surchargeRate: 0.1 } })), true);
  assert.equal(quoteNeedsScheduleUpFront(settings({ night: { enabled: true, surchargeRate: 0.1 } })), true);
  assert.equal(quoteNeedsScheduleUpFront(settings({ weekend: { enabled: true, surchargeRate: 0.1 } })), true);
  assert.equal(
    quoteNeedsScheduleUpFront(toPublicOwnerPricingConfig(settings({ night: { enabled: true, surchargeRate: 0.1 }, weekend: { enabled: true, surchargeRate: 0.1 } }))),
    true,
  );
});

check("a surcharge switched on at 0% changes no price, so it does not count", () => {
  assert.equal(quoteNeedsScheduleUpFront(settings({ night: { enabled: true, surchargeRate: 0 } })), false);
});

check("Christmas alone does not count (owner decision, 14 Nov 2026)", () => {
  assert.equal(quoteNeedsScheduleUpFront(settings({ christmas: { enabled: true, surchargeRate: 0.15 } })), false);
  assert.equal(
    quoteNeedsScheduleUpFront(settings({ christmas: { enabled: true, surchargeRate: 0.15 }, weekend: { enabled: true, surchargeRate: 0.1 } })),
    true,
  );
});

check("missing settings fall back to the defaults without throwing", () => {
  assert.equal(typeof quoteNeedsScheduleUpFront(null), "boolean");
  assert.equal(typeof quoteNeedsScheduleUpFront(undefined), "boolean");
});

const card = read("src/components/QuoteCard.tsx");

check("website quote card reads the rule from the live settings, with the build-time value for first paint", () => {
  assert.match(card, /quoteNeedsScheduleUpFront\(publicPricing\)/);
  assert.match(card, /publicPricingLoaded \? quoteNeedsScheduleUpFront\(publicPricing\) : QUOTE_SCHEDULE_UP_FRONT_AT_BUILD/);
  assert.match(card, /scheduleUpFrontPreview \?\?/);
  const generated = read("src/generated/quote-schedule-default.ts");
  assert.match(generated, /export const QUOTE_SCHEDULE_UP_FRONT_AT_BUILD: boolean = (true|false);/);
  assert.match(read("package.json"), /generate-sitemap\.mjs && node scripts\/snapshot-quote-schedule-default\.mjs && /);
});

check("with the rule off, no quote form shows the date and time and the price does not wait for them", () => {
  assert.match(card, /const scheduleReadyForQuote = isScheduleComplete \|\| !scheduleUpFront;/);
  assert.match(card, /if \(scheduleUpFront && !isScheduleComplete && \(!design2Home \|\| mobileDesign3\)\)/);
  assert.match(card, /\{scheduleUpFront \? renderQuoteScheduleFields\("quote", true\) : null\}/);
  assert.match(card, /scheduleFields=\{scheduleUpFront \? renderQuoteScheduleFields\("quote"\) : null\}/);
  assert.match(card, /scheduleUpFront && !scheduleEntered\s*\? QUOTE_PRICE_WAIT_FOR_SCHEDULE/);
  // Three quote-form call sites, each guarded; the booking step is the fourth and is never guarded.
  assert.equal((card.match(/renderQuoteScheduleFields\("quote"/g) ?? []).length, 3);
  assert.equal((card.match(/!scheduleUpFront \? null : renderQuoteScheduleFields\("quote", true\)|scheduleUpFront \? renderQuoteScheduleFields\("quote"/g) ?? []).length, 3);
});

check("the booking step always asks for the date and time, and payment still needs them", () => {
  assert.match(card, /Pickup date & time\s*<\/h2>\s*\{renderQuoteScheduleFields\("checkout"\)\}/);
  assert.match(card, /const tripDetailsReady = hasQuoteRoute && isScheduleComplete;/);
  const pay = card.slice(card.indexOf("async function submitCheckoutForm()"));
  assert.match(pay.slice(0, 900), /const schedule = syncScheduleFieldsFromInputs\(\);\s*if \(!validateTripForBooking\(schedule\)\)/);
  const continueDetails = card.slice(card.indexOf("async function handleContinueTravelDetails()"));
  assert.match(continueDetails.slice(0, 900), /if \(!validateTripForBooking\(schedule\)\)/);
});

check("a price that changes once the date is chosen (Christmas) must be confirmed before paying", () => {
  assert.match(card, /data-homepage-fare-change/);
  assert.match(card, /I confirm the updated price\./);
  assert.match(card, /Please confirm the updated price before you pay\./);
});

check("preview-only switch is ignored on the live site", () => {
  const preview = read("src/lib/pricing-preview-store.ts");
  const fn = preview.slice(preview.indexOf("export function previewScheduleUpFrontOverride"));
  assert.match(fn.slice(0, 260), /if \(typeof window === "undefined" \|\| !isBrowserPricingPreview\(\)\) return null;/);
});

console.log("\nAll schedule-only-with-surcharge checks passed.");

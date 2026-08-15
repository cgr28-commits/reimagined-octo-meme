/**
 * Guards public live pricing behind pricing-config.json approval.
 * Run: npx tsx scripts/check-pricing-confirmation.ts
 */
import assert from "node:assert/strict";
import {
  arePricingRulesApproved,
  arePublicLivePricesEnabled,
  calculateOperationalSubtotal,
  getPublicUnapprovedPriceLabel,
  hasOperationalRatesConfigured,
  PRICING_CONFIG,
} from "../src/lib/pricing-config";
import { calculateQuote, calculatePointToPointQuote } from "../src/lib/quote";

assert.equal(arePricingRulesApproved(), false, "pricingRulesApproved must stay false until owner approval");
assert.equal(arePublicLivePricesEnabled(), false, "public live prices must be disabled");
assert.equal(hasOperationalRatesConfigured(), false, "operational £ rates must be null until filled");
assert.equal(getPublicUnapprovedPriceLabel(), "Price confirmation required");

assert.ok(PRICING_CONFIG.airportMinimumFaresGbp.BFS === 45);
assert.ok(PRICING_CONFIG.airportMinimumFaresGbp.BHD === 35);
assert.ok(PRICING_CONFIG.operational.emptyReturnMileageFactor === 1);

const opsNull = calculateOperationalSubtotal({
  distanceKm: 100,
  durationMinutes: 90,
  premiumSchedule: false,
  airportCode: "BFS",
});
assert.equal(opsNull, null, "operational subtotal must be null while rates are unset");

// Draft engine still computes for calibration scripts — must not be used for public UI.
const draft = calculateQuote(
  "Botanic Avenue, Belfast",
  "BFS",
  "Estate Car (1–4 passengers)",
  false,
  {},
);
assert.ok(draft && draft.amount > 0, "draft calculateQuote still works for scripts");

const a2a = calculatePointToPointQuote(
  "Omagh, UK",
  "Boucher Road, Belfast",
  "Estate Car (1–4 passengers)",
  false,
  {},
  { distanceKm: 108, durationMinutes: 95 },
);
assert.ok(a2a && a2a.amount > 0, "draft A2A still works for scripts");

console.log("check-pricing-confirmation: ok");
console.log(`  public label: ${getPublicUnapprovedPriceLabel()}`);
console.log(`  draft BFS Botanic estate: £${draft?.amount}`);
console.log(`  draft Omagh→Boucher (not for public): £${a2a?.amount}`);

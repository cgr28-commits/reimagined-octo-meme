/**
 * Guards public live pricing switch + OTS config presence.
 * Run: npx tsx scripts/check-pricing-confirmation.ts
 */
import assert from "node:assert/strict";
import {
  arePricingRulesApproved,
  arePublicLivePricesEnabled,
  PRICING_CONFIG,
} from "../src/lib/pricing-config";
import { calculateQuote, calculatePointToPointQuote } from "../src/lib/quote";

assert.equal(arePricingRulesApproved(), true, "pricingRulesApproved should be true for live SumUp quotes");
assert.equal(arePublicLivePricesEnabled(), true, "public live prices should be enabled");
assert.ok(PRICING_CONFIG.airportMinimumFaresGbp.BFS === 45);
assert.ok(PRICING_CONFIG.otsReferenceModel.undercutMinGbp === 8);
assert.ok(PRICING_CONFIG.otsReferenceModel.undercutMaxGbp === 10);

const draft = calculateQuote(
  "Botanic Avenue, Belfast",
  "BFS",
  "Estate Car (1–4 passengers)",
  false,
  {},
);
assert.ok(draft && draft.amount > 0, "airport estate quote works");

const a2a = calculatePointToPointQuote(
  "Omagh, UK",
  "Boucher Road, Belfast",
  "Estate Car (1–4 passengers)",
  false,
  {},
  { distanceKm: 108, durationMinutes: 95 },
);
assert.ok(a2a && a2a.amount > 0, "A2A estate quote works");

console.log("check-pricing-confirmation: ok (live prices enabled)");
console.log(`  BFS Botanic estate: £${draft?.amount}`);
console.log(`  Omagh→Boucher estate: £${a2a?.amount}`);

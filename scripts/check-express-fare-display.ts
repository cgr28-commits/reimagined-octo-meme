/**
 * Express Drop-Off must appear as a separate line under Journey fare —
 * never folded into “Original booking value” and shown again as +Express.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";

const root = path.resolve(import.meta.dirname, "..");
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const trust = read("src/components/QuoteFareTrust.tsx");
const card = read("src/components/QuoteCard.tsx");

console.log("=== Express access visible in quote fare UI ===");
{
  assert.match(trust, /Journey fare/);
  assert.match(trust, /expressAirportLegendLabel/);
  assert.match(trust, /expressAvoidedChargeMessage/);
  assert.doesNotMatch(trust, /<dt>Airport Express Drop-Off<\/dt>/);
  assert.match(trust, /Not added/);
  assert.match(trust, /freeAirportAccessSelected/);
  assert.match(trust, /Amount payable/);
  assert.match(trust, /journeyFareDisplayGbp/);
  assert.match(trust, /finalAmountPayableGbp|finalPayableGbp/);
  assert.doesNotMatch(trust, /Original booking value/);
  assert.doesNotMatch(
    trust,
    /line-through[\s\S]{0,120}originalEligibleJourneyPriceGbp[\s\S]{0,80}journeyFareAfterPromotionsGbp/,
  );
  assert.match(card, /freeAirportAccessSelected=\{/);
  assert.match(card, /service=\{expressSelection\.service \?\? "drop-off"\}/);
  assert.match(card, /expressSelection\.feeGbp === 0/);
  assert.doesNotMatch(trust, /totalPromotionalSavingGbp \+ access/);
  console.log("OK  Journey fare + direction-aware Express line + Amount payable");
}

console.log("\n=== Breakdown composition — Express not double-counted in display field ===");
{
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 50,
    airportFixedCostsGbp: 0,
    airportAccessChargeGbp: 5,
    returnJourney: false,
  });
  assert.equal(breakdown.journeyFareDisplayGbp, 50);
  assert.equal(breakdown.airportAccessChargeGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 55);
  assert.equal(breakdown.bookingValueBeforePromotionsGbp, 55);
  assert.ok(breakdown.journeyFareDisplayGbp + breakdown.airportAccessChargeGbp === breakdown.finalAmountPayableGbp);
  console.log("OK  Journey £50 + Express £5 = payable £55");
}

console.log("\nAll express fare-display checks passed.");

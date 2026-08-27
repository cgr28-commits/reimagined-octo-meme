/**
 * Express access must appear in the quote fare breakdown so free-area selection
 * clearly removes the add-on (it is not a second promotional −£5 on the journey).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const trust = read("src/components/QuoteFareTrust.tsx");
const card = read("src/components/QuoteCard.tsx");

console.log("=== Express access visible in quote fare UI ===");
{
  assert.match(trust, /Airport Express access/);
  assert.match(trust, /Not added/);
  assert.match(trust, /freeAirportAccessSelected/);
  assert.match(trust, /Amount payable/);
  assert.match(trust, /Original booking value/);
  assert.match(trust, /bookingValueBeforeFirstBookingOfferGbp|prePromoBookingValueGbp/);
  assert.match(trust, /finalAmountPayableGbp|finalPayableGbp/);
  // Must not promote journey-after-promo as the payable (Express would look stuck).
  assert.doesNotMatch(
    trust,
    /line-through[\s\S]{0,120}originalEligibleJourneyPriceGbp[\s\S]{0,80}journeyFareAfterPromotionsGbp/,
  );
  assert.match(
    trust,
    /You’ve avoided the Express Drop-Off charge|You've avoided the Express Drop-Off charge/,
  );
  assert.match(card, /freeAirportAccessSelected=\{/);
  assert.match(card, /expressSelection\.feeGbp === 0/);
  assert.doesNotMatch(trust, /totalPromotionalSavingGbp \+ access/);
  console.log("OK  Express add-on / free-area state is shown in the fare breakdown");
}

console.log("\nAll express fare-display checks passed.");

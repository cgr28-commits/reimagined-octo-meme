/**
 * Quote UI must advertise the £5 first-booking offer before email verification,
 * and must not apply it to displayed totals until eligibility is verified.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const card = read("src/components/QuoteCard.tsx");
const trust = read("src/components/QuoteFareTrust.tsx");
const api = read("src/lib/first-booking-eligibility-api.ts");
const worker = read("workers/addresses/src/first-booking-eligibility-handlers.ts");

console.log("=== 1. Advertise without applying until verified ===");
{
  assert.match(card, /advertiseFirstBookingOffer/);
  assert.match(card, /applyFirstBookingOffer/);
  assert.match(card, /FirstBookingOfferAdvert/);
  assert.match(card, /checkFirstBookingOfferEligibility/);
  assert.match(card, /claimFirstBookingOffer: applyFirstBookingOffer/);
  assert.match(card, /claimFirstBookingForCheckout/);
  assert.match(
    card,
    /const applyFirstBookingOffer =\s*quoteStep === 3 &&/s,
  );
  assert.match(trust, /FirstBookingOfferAdvert/);
  assert.match(trust, /New customer\? Save £\{amount\} on your first booking/);
  assert.match(trust, /Journey fare £\{minFare\}\+\. Eligibility confirmed before payment\./);
  assert.match(trust, /claimFirstBookingOffer: input\.claimFirstBookingOffer === true/);
  console.log("OK  quote UI gates £5 until eligibility verification");
}

console.log("\n=== 2. Eligibility API + Worker route ===");
{
  assert.match(api, /\/promo\/first-booking-eligibility/);
  assert.match(worker, /hasRedeemedFirstBookingOffer/);
  assert.match(worker, /isFirstBookingEligibilityPath/);
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /first-booking-eligibility/);
  assert.match(index, /handleFirstBookingEligibilityRequest/);
  console.log("OK  worker eligibility endpoint wired");
}

console.log("\nAll first-booking quote-display checks passed.");

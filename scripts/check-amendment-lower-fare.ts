import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describeFareDifference } from "../shared/booking-amendment";

const src = readFileSync("workers/addresses/src/booking-amendment-handlers.ts", "utf8");

// Owner rule: a cheaper recalculated fare is never offered; only a higher fare is charged.
assert.match(src, /Math\.max\(quote\.amount, previousFare\)/, "lower fares must be clamped to the agreed fare");
assert.equal(describeFareDifference(269, Math.max(240, 269)).kind, "none");
assert.equal(describeFareDifference(269, Math.max(290, 269)).kind, "additional_payment");

// Address changes must be priced with a measured route (website quote pipeline).
assert.match(src, /buildAuthoritativeSavedQuotePricing\(/, "amendment must measure the route for the new address");
assert.doesNotMatch(src, /calculateAuthoritativeWebsiteQuote\(/, "no route-less repricing");
console.log("check-amendment-lower-fare: all assertions passed");

/**
 * Signed quote receipt. Does not call the live Worker and does not set MPG.
 * Run: npx tsx scripts/check-quote-receipt.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUOTE_RECEIPT_TTL_SECONDS,
  canonicalJourneyEndpoint,
  decideQuoteReceiptPayment,
  signQuoteReceipt,
  verifyQuoteReceipt,
  type QuoteReceiptClaims,
} from "../workers/addresses/src/quote-receipt";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { checkoutAmountsMatch, resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";

const SECRET = "test-receipt-secret";
const NOW = Date.parse("2026-09-30T12:00:00Z");

function journey(overrides: Partial<QuoteReceiptClaims> = {}): Omit<QuoteReceiptClaims, "exp"> {
  return {
    pricingVersion: 67,
    pickupPlaceId: "place-carrick",
    dropoffPlaceId: "place-bfs",
    pickupAddress: "Carrickfergus",
    dropoffAddress: "Belfast International Airport",
    vehicleType: "Standard Saloon (1–4 passengers)",
    passengers: 2,
    suitcases: 1,
    outboundDate: "2026-09-30",
    outboundTime: "05:00",
    returnJourney: false,
    returnDate: "",
    returnTime: "",
    journeyFareGbp: 65,
    airportFixedCostsGbp: 0,
    nightWeekendSurchargeGbp: 0,
    transferAmountGbp: 65,
    distanceKm: 37.15,
    durationMinutes: 35.2,
    ...overrides,
  };
}

function expectedFrom(claims: Omit<QuoteReceiptClaims, "exp">) {
  return {
    pricingVersion: claims.pricingVersion,
    pickupPlaceId: claims.pickupPlaceId,
    dropoffPlaceId: claims.dropoffPlaceId,
    pickupAddress: claims.pickupAddress,
    dropoffAddress: claims.dropoffAddress,
    vehicleType: claims.vehicleType,
    passengers: claims.passengers,
    suitcases: claims.suitcases,
    outboundDate: claims.outboundDate,
    outboundTime: claims.outboundTime,
    returnJourney: claims.returnJourney,
    returnDate: claims.returnDate,
    returnTime: claims.returnTime,
  };
}

async function main() {
console.log("=== Expiry is three hours ===");
assert.equal(QUOTE_RECEIPT_TTL_SECONDS, 3 * 60 * 60);

console.log("=== Sign, verify, and reject tampering ===");
{
  const token = await signQuoteReceipt(journey(), SECRET, NOW);
  const verified = await verifyQuoteReceipt(token, SECRET, NOW + 60_000);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.claims.transferAmountGbp, 65);
    assert.equal(verified.claims.exp, Math.floor(NOW / 1000) + QUOTE_RECEIPT_TTL_SECONDS);
    const decoded = JSON.parse(
      Buffer.from(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as Record<string, unknown>;
    const keys = Object.keys(decoded).sort();
    assert.deepEqual(keys, [
      "airportFixedCostsGbp",
      "distanceKm",
      "dropoffAddress",
      "dropoffPlaceId",
      "durationMinutes",
      "exp",
      "journeyFareGbp",
      "nightWeekendSurchargeGbp",
      "outboundDate",
      "outboundTime",
      "passengers",
      "pickupAddress",
      "pickupPlaceId",
      "pricingVersion",
      "returnDate",
      "returnJourney",
      "returnTime",
      "suitcases",
      "transferAmountGbp",
      "vehicleType",
    ]);
    const banned = ["Glen Manor", "BT36 7FU", "mpg", "diesel", "wear", "profitability", "operational"];
    const text = JSON.stringify(decoded).toLowerCase();
    for (const word of banned) assert.equal(text.includes(word.toLowerCase()), false, word);
  }

  const forged = token.replace("v1.", "v1.") ;
  const parts = token.split(".");
  const payload = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as { transferAmountGbp: number };
  payload.transferAmountGbp = 1;
  const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const tampered = `v1.${forgedPayload}.${parts[2]}`;
  const bad = await verifyQuoteReceipt(tampered, SECRET, NOW);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "bad_signature");
  void forged;

  const wrongKey = await verifyQuoteReceipt(token, "other-secret", NOW);
  assert.equal(wrongKey.ok, false);

  const expired = await verifyQuoteReceipt(token, SECRET, NOW + QUOTE_RECEIPT_TTL_SECONDS * 1000);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "expired");

  const stillValid = await verifyQuoteReceipt(token, SECRET, NOW + (QUOTE_RECEIPT_TTL_SECONDS - 5) * 1000);
  assert.equal(stillValid.ok, true);
}

console.log("=== Payment accepts the matching receipt and refuses changes ===");
{
  const claims = journey();
  const token = await signQuoteReceipt(claims, SECRET, NOW);
  const accepted = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token,
    nowMs: NOW + 10 * 60 * 1000,
    expected: expectedFrom(claims),
  });
  assert.equal(accepted.action, "accept");
  if (accepted.action === "accept") assert.equal(accepted.claims.journeyFareGbp, 65);

  const airportLabel = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token,
    nowMs: NOW,
    expected: {
      ...expectedFrom(claims),
      dropoffAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    },
  });
  assert.equal(airportLabel.action, "accept");
  assert.equal(
    canonicalJourneyEndpoint("Belfast International Airport"),
    canonicalJourneyEndpoint("Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK"),
  );
  assert.notEqual(canonicalJourneyEndpoint("12 High Street, Carrickfergus"), "airport:BFS");

  const changedVehicle = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token,
    nowMs: NOW,
    expected: { ...expectedFrom(claims), vehicleType: "Estate Car (1–4 passengers)" },
  });
  assert.equal(changedVehicle.action, "refresh");
  if (changedVehicle.action === "refresh") assert.equal(changedVehicle.reason, "journey_mismatch");

  const changedTime = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token,
    nowMs: NOW,
    expected: { ...expectedFrom(claims), outboundTime: "10:00" },
  });
  assert.equal(changedTime.action, "refresh");

  const changedVersion = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token,
    nowMs: NOW,
    expected: { ...expectedFrom(claims), pricingVersion: 68 },
  });
  assert.equal(changedVersion.action, "refresh");
  if (changedVersion.action === "refresh") assert.equal(changedVersion.reason, "pricing_version");

  const missing = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: SECRET,
    token: "",
    nowMs: NOW,
    expected: expectedFrom(claims),
  });
  assert.equal(missing.action, "refresh");
  if (missing.action === "refresh") assert.equal(missing.reason, "missing");

  const noSecret = await decideQuoteReceiptPayment({
    protectionActive: true,
    secret: "",
    token,
    nowMs: NOW,
    expected: expectedFrom(claims),
  });
  assert.equal(noSecret.action, "refresh");

  const inactive = await decideQuoteReceiptPayment({
    protectionActive: false,
    secret: SECRET,
    token,
    nowMs: NOW,
    expected: { ...expectedFrom(claims), vehicleType: "changed" },
  });
  assert.equal(inactive.action, "not_required");
}

console.log("=== Express is added once and £0.02 still rejects a different total ===");
{
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 65,
    airportFixedCostsGbp: 0,
    nightWeekendSurchargeGbp: 0,
    airportAccessChargeGbp: 5,
    outboundAirportAccessChargeGbp: 5,
    returnAirportAccessChargeGbp: 0,
    returnJourney: false,
  });
  assert.equal(breakdown.finalAmountPayableGbp, 70);
  assert.equal(checkoutAmountsMatch(70, breakdown.finalAmountPayableGbp), true);
  assert.equal(checkoutAmountsMatch(70.02, breakdown.finalAmountPayableGbp), true);
  assert.equal(checkoutAmountsMatch(71, breakdown.finalAmountPayableGbp), false);
  assert.equal(checkoutAmountsMatch(65, breakdown.finalAmountPayableGbp), false);
  assert.equal(resolveSumUpChargeAmountGbp(70, breakdown.finalAmountPayableGbp), 70);
  assert.equal(resolveSumUpChargeAmountGbp(71, breakdown.finalAmountPayableGbp), null);
}

console.log("=== Receipt module does not contain the operating base ===");
{
  const source = readFileSync("workers/addresses/src/quote-receipt.ts", "utf8");
  assert.equal(source.includes("Glen Manor"), false);
  assert.equal(source.includes("BT36 7FU"), false);
  assert.equal(source.includes("4.54609"), false);
}

console.log("Quote receipt checks passed.");
}

void main();

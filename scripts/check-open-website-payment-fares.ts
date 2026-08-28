/**
 * Open-website SumUp transfer fare must not accept client-tampered journey/fees.
 * Run: npx tsx scripts/check-open-website-payment-fares.ts
 */

import assert from "node:assert/strict";
import {
  resolveOpenWebsitePaymentTransferFares,
  parseJourneyDistanceKmLabel,
  parseJourneyDurationMinutesLabel,
} from "../shared/open-website-payment-fares";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

const CITY = "Belfast City Hall, Belfast BT1 5GS";
const DUB_METRICS = { distanceKm: 168, durationMinutes: 115 };

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("parsers round-trip distance/duration labels", () => {
  assert.ok(Math.abs((parseJourneyDistanceKmLabel("100 miles") ?? 0) - 100 / 0.621371) < 0.01);
  assert.equal(parseJourneyDurationMinutesLabel("25 min"), 25);
  assert.equal(parseJourneyDurationMinutesLabel("1 hr 5 min"), 65);
});

check("honest City→DUB transfer uses canonical quote", () => {
  const q = calculateQuote(CITY, "DUB", SALOON_VEHICLE, false, {}, DUB_METRICS, false)!;
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(requote.ok, true);
  if (!requote.ok) return;
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: Math.round((q.journeyFareGbp! + q.airportFixedCostsGbp!) * 100) / 100,
    claimedJourneyFareGbp: q.journeyFareGbp,
    claimedAirportFixedCostsGbp: q.airportFixedCostsGbp,
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
      airportCode: "DUB",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    routeMetrics: DUB_METRICS,
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? 230,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.journeyFareGbp, 230);
  assert.equal(resolved.airportFixedCostsGbp, 4);
  assert.equal(resolved.source, "canonical-quote");
});

check("tamper: low journey+fees matching transfer rejected without canonical quote", () => {
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 5,
    claimedJourneyFareGbp: 1,
    claimedAirportFixedCostsGbp: 4,
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport",
      airportCode: "DUB",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
  });
  assert.equal(resolved.ok, false);
});

check("tamper: journey £1 / transfer £1 rejected", () => {
  const mismatched = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    claimedAirportFixedCostsGbp: 0,
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport",
      airportCode: "DUB",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
  });
  assert.equal(mismatched.ok, false);
});

check("canonical quote overrides client £0/£1 journey tampering", () => {
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(requote.ok, true);
  if (!requote.ok) return;

  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 0,
    claimedAirportFixedCostsGbp: 0,
    removedAirportFeeIds: ["outbound:DUB:toll"],
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
      airportCode: "DUB",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    routeMetrics: DUB_METRICS,
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? 230,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.source, "canonical-quote");
  assert.equal(resolved.journeyFareGbp, 230);
  assert.equal(resolved.airportFixedCostsGbp, 4); // toll still applied; removal ignored
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, 234);
  assert.equal(payable.firstBookingSavingGbp, 0);
});

check("DUB pickup: £5 parking + £4 toll mandatory even if client removes", () => {
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: true,
    pickupAddress: "Dublin Airport, Co. Dublin, Ireland",
    dropoffAddress: CITY,
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(requote.ok, true);
  if (!requote.ok) return;
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    removedAirportFeeIds: ["outbound:DUB:pickup", "outbound:DUB:toll"],
    booking: {
      pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
      dropoffLabel: CITY,
      airportCode: "DUB",
      isFromAirport: true,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? 230,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 9,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 9);
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, 239);
});

check("Estate City→DUB canonical journey uplift preserved", () => {
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    passengers: 2,
    suitcases: 3,
    routeMetrics: DUB_METRICS,
    vehicleType: ESTATE_VEHICLE,
  });
  assert.equal(requote.ok, true);
  if (!requote.ok) return;
  assert.equal(requote.journeyFareGbp, 238);
  assert.equal(requote.airportFixedCostsGbp, 4);
});

check("LDY fee removal ignored with canonical quote", () => {
  const q = calculateQuote(CITY, "LDY", SALOON_VEHICLE, false, {}, null, false)!;
  assert.ok(q && q.airportFixedCostsGbp === 1);
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    claimedAirportFixedCostsGbp: 0,
    removedAirportFeeIds: ["outbound:LDY:drop-off"],
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "City of Derry Airport",
      airportCode: "LDY",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    authoritativeQuote: {
      amountGbp: q.amount,
      journeyFareGbp: q.journeyFareGbp ?? q.amount,
      airportFixedCostsGbp: q.airportFixedCostsGbp ?? 1,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 1);
  assert.equal(resolved.journeyFareGbp, q.journeyFareGbp);
});

check("SumUp payable ignores client transfer and uses canonical journey + fees", () => {
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(requote.ok, true);
  if (!requote.ok) return;
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 0,
    claimedJourneyFareGbp: 0,
    claimedAirportFixedCostsGbp: 0,
    removedAirportFeeIds: ["outbound:DUB:toll"],
    booking: {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
      airportCode: "DUB",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? 230,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, 234);
  assert.equal(payable.firstBookingSavingGbp, 0);
});

check("5% return discount still applies on canonical DUB journey", () => {
  const oneWay = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  const ret = calculateAuthoritativeWebsiteQuote({
    airportCode: "DUB",
    fromAirport: false,
    pickupAddress: CITY,
    dropoffAddress: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: true,
    passengers: 2,
    suitcases: 1,
    routeMetrics: DUB_METRICS,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(oneWay.ok && ret.ok, true);
  if (!oneWay.ok || !ret.ok) return;
  // Journey portion only is discounted; fixed costs (outbound toll + return parking+toll) are not.
  assert.ok((ret.journeyFareGbp ?? 0) < (oneWay.journeyFareGbp ?? 0) * 2);
  assert.equal(ret.airportFixedCostsGbp, 13); // £4 + £5 + £4
  assert.equal(ret.amount, 450);
});

console.log("\nAll open-website payment fare checks passed.");

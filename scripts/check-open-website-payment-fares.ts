/**
 * Open-website SumUp transfer fare must not accept client-tampered journey/fees
 * or client-supplied route distance/duration as payment authority.
 * Run: npx tsx scripts/check-open-website-payment-fares.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resolveOpenWebsitePaymentTransferFares,
  resolvePaymentAirportContextFromAddresses,
  checkoutAmountsMatch,
  resolveSumUpChargeAmountGbp,
  buildFareMismatchPaymentError,
  parseJourneyDistanceKmLabel,
  parseJourneyDurationMinutesLabel,
} from "../shared/open-website-payment-fares";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveJourneyAirportFees } from "../shared/airport-fixed-costs";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";

const CITY = "Belfast City Hall, Belfast BT1 5GS";
const DUB_METRICS = { distanceKm: 168, durationMinutes: 115 };
const LDY_METRICS = { distanceKm: 120, durationMinutes: 90 };
/** PR #435 expectations for DUB_METRICS (road miles → universal Saloon). */
const DUB_JOURNEY = calculateUniversalSaloonJourneyFareGbp(
  universalDrivingMilesFromKm(DUB_METRICS.distanceKm),
);
const DUB_DROP_TOTAL = DUB_JOURNEY + 4;
const DUB_PICK_TOTAL = DUB_JOURNEY + 9;
const DUB_ESTATE_JOURNEY = calculateUniversalEstateJourneyFareGbp(DUB_JOURNEY);
/** Genuine long-distance BFS metrics vs client-spoofed 1km/1min. */
const COLERAINE = "Coleraine, Northern Ireland";
const BFS_LABEL = "Belfast International Airport";
const SERVER_BFS_METRICS = { distanceKm: 80, durationMinutes: 70 };
const TAMPERED_METRICS = { distanceKm: 1, durationMinutes: 1 };

const root = path.resolve(import.meta.dirname, "..");

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

check("payment handler resolves route + airport context server-side", () => {
  const index = fs.readFileSync(
    path.join(root, "workers/addresses/src/index.ts"),
    "utf8",
  );
  // Open-website SumUp block must call Worker route resolve with place IDs.
  assert.match(index, /resolveWorkerTripRouteMetricsForPayment/);
  assert.match(
    index,
    /Never trust body\.routeMetrics[\s\S]*resolveWorkerTripRouteMetricsForPayment/,
  );
  assert.match(index, /body\.pickupPlaceId/);
  assert.match(index, /body\.dropoffPlaceId/);
  assert.match(index, /paymentErrorForRouteFailure|route_service_unavailable/);
  // Airport identity from addresses via SERVED_AIRPORTS — not client fields.
  assert.match(index, /resolvePaymentAirportContextFromAddresses/);
  assert.match(
    index,
    /Never trust client airportCode[\s\S]*resolvePaymentAirportContextFromAddresses/,
  );
  // Must never silently replace the customer-agreed amount.
  assert.match(index, /acceptedFinalAmountGbp/);
  assert.match(index, /checkoutAmountsMatch/);
  assert.match(index, /resolveSumUpChargeAmountGbp/);
  assert.match(index, /buildFareMismatchPaymentError/);
  assert.match(index, /code: "fare_mismatch"/);
  assert.match(index, /amount = sumUpChargeGbp/);
  assert.doesNotMatch(index, /amount = serverFinalAmountGbp/);
  // Must not wire body.routeMetrics into payment requote metrics.
  assert.doesNotMatch(
    index,
    /const bodyMetrics\s*=\s*[\s\S]*body\.routeMetrics[\s\S]*resolveRouteMetricsForPayment/,
  );
  assert.doesNotMatch(
    index,
    /resolveRouteMetricsForPayment\(\s*\{[\s\S]*journeyDistance:\s*booking\.journeyDistance/,
  );
  // Quote path still has the same Worker helper (parity).
  const quoteHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/quote-handlers.ts"),
    "utf8",
  );
  assert.match(quoteHandlers, /resolveWorkerTripRouteMetrics/);
  assert.match(quoteHandlers, /resolvePaymentAirportContextFromAddresses/);
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
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.journeyFareGbp, DUB_JOURNEY);
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
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.source, "canonical-quote");
  assert.equal(resolved.journeyFareGbp, DUB_JOURNEY);
  assert.equal(resolved.airportFixedCostsGbp, 4); // toll still applied; removal ignored
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, DUB_DROP_TOTAL);
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
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
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
  assert.equal(payable.finalAmountPayableGbp, DUB_PICK_TOTAL);
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
  assert.equal(requote.journeyFareGbp, DUB_ESTATE_JOURNEY);
  assert.equal(requote.airportFixedCostsGbp, 4);
});

check("LDY fee removal ignored with canonical quote", () => {
  const q = calculateQuote(CITY, "LDY", SALOON_VEHICLE, false, {}, LDY_METRICS, false)!;
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
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
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
  assert.equal(payable.finalAmountPayableGbp, DUB_DROP_TOTAL);
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
  // Fixed costs must not be discounted; total is journey (with 5%) + £13.
  assert.equal(ret.journeyFareGbp, DUB_JOURNEY * 1.9);
  assert.ok(
    Math.abs(ret.amount - ((ret.journeyFareGbp ?? 0) + 13)) < 1.01,
    `return total should be journey+fixed (got £${ret.amount})`,
  );
});

// --- Route-metric tampering: client distance/duration must never cut SumUp ---

function serverQuoteFor(
  pickup: string,
  dropoff: string,
  airportCode: "BFS" | "BHD" | "DUB" | "LDY",
  fromAirport: boolean,
  metrics: { distanceKm: number; durationMinutes: number },
) {
  return calculateAuthoritativeWebsiteQuote({
    airportCode,
    fromAirport,
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: metrics,
    vehicleType: SALOON_VEHICLE,
  });
}

function payableFromServerQuote(
  server: Extract<ReturnType<typeof calculateAuthoritativeWebsiteQuote>, { ok: true }>,
  booking: {
    pickupLabel: string;
    dropoffLabel: string;
    airportCode: string;
    isFromAirport: boolean;
  },
  clientTamper: {
    transfer: number;
    journey: number;
    fixed: number;
    /** Spoofed metrics the browser might send — ignored when server quote is used. */
    routeMetrics: { distanceKm: number; durationMinutes: number };
  },
) {
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: clientTamper.transfer,
    claimedJourneyFareGbp: clientTamper.journey,
    claimedAirportFixedCostsGbp: clientTamper.fixed,
    booking: {
      ...booking,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    routeMetrics: clientTamper.routeMetrics,
    authoritativeQuote: {
      amountGbp: server.amount,
      journeyFareGbp: server.journeyFareGbp ?? server.amount,
      airportFixedCostsGbp: server.airportFixedCostsGbp ?? 0,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return null;
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  return payable.finalAmountPayableGbp;
}

check("tamper distanceKm=1 on mileage BFS: SumUp keeps server fare", () => {
  const genuine = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, SERVER_BFS_METRICS);
  const spoofed = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, {
    distanceKm: 1,
    durationMinutes: SERVER_BFS_METRICS.durationMinutes,
  });
  assert.equal(genuine.ok, true);
  assert.equal(spoofed.ok, true);
  if (!genuine.ok || !spoofed.ok) return;
  assert.ok(
    spoofed.amount < genuine.amount,
    `expected spoofed distance to underprice (${spoofed.amount} < ${genuine.amount})`,
  );
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: COLERAINE,
      dropoffLabel: BFS_LABEL,
      airportCode: "BFS",
      isFromAirport: false,
    },
    {
      transfer: spoofed.amount,
      journey: spoofed.journeyFareGbp ?? spoofed.amount,
      fixed: spoofed.airportFixedCostsGbp ?? 0,
      routeMetrics: { distanceKm: 1, durationMinutes: SERVER_BFS_METRICS.durationMinutes },
    },
  );
  assert.equal(charged, genuine.amount);
});

check("tamper durationMinutes=1 on mileage BFS: SumUp keeps server fare", () => {
  const genuine = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, SERVER_BFS_METRICS);
  const spoofed = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, {
    distanceKm: SERVER_BFS_METRICS.distanceKm,
    durationMinutes: 1,
  });
  assert.equal(genuine.ok, true);
  assert.equal(spoofed.ok, true);
  if (!genuine.ok || !spoofed.ok) return;
  assert.ok(spoofed.amount <= genuine.amount);
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: COLERAINE,
      dropoffLabel: BFS_LABEL,
      airportCode: "BFS",
      isFromAirport: false,
    },
    {
      transfer: spoofed.amount,
      journey: spoofed.journeyFareGbp ?? spoofed.amount,
      fixed: 0,
      routeMetrics: { distanceKm: SERVER_BFS_METRICS.distanceKm, durationMinutes: 1 },
    },
  );
  assert.equal(charged, genuine.amount);
});

check("tamper distanceKm=1 and durationMinutes=1 on mileage BFS: SumUp keeps server fare", () => {
  const genuine = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, SERVER_BFS_METRICS);
  const spoofed = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, TAMPERED_METRICS);
  assert.equal(genuine.ok, true);
  assert.equal(spoofed.ok, true);
  if (!genuine.ok || !spoofed.ok) return;
  assert.ok(spoofed.amount < genuine.amount);
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: COLERAINE,
      dropoffLabel: BFS_LABEL,
      airportCode: "BFS",
      isFromAirport: false,
    },
    {
      transfer: spoofed.amount,
      journey: spoofed.journeyFareGbp ?? spoofed.amount,
      fixed: 0,
      routeMetrics: TAMPERED_METRICS,
    },
  );
  assert.equal(charged, genuine.amount);
});

check("tamper journey+amount+routeMetrics together: SumUp keeps server fare", () => {
  const genuine = serverQuoteFor(COLERAINE, BFS_LABEL, "BFS", false, SERVER_BFS_METRICS);
  assert.equal(genuine.ok, true);
  if (!genuine.ok) return;
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: COLERAINE,
      dropoffLabel: BFS_LABEL,
      airportCode: "BFS",
      isFromAirport: false,
    },
    {
      transfer: 1,
      journey: 1,
      fixed: 0,
      routeMetrics: TAMPERED_METRICS,
    },
  );
  assert.equal(charged, genuine.amount);
});

check("no server requote + DUB fees: checkout rejected (never falls back to client metrics)", () => {
  const dubReject = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
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
    routeMetrics: TAMPERED_METRICS,
    authoritativeQuote: null,
  });
  assert.equal(dubReject.ok, false);
});

check("DUB: tampered metrics ignored when server quote is used", () => {
  const genuine = serverQuoteFor(
    CITY,
    "Dublin Airport, Co. Dublin, Ireland",
    "DUB",
    false,
    DUB_METRICS,
  );
  assert.equal(genuine.ok, true);
  if (!genuine.ok) return;
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: CITY,
      dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
      airportCode: "DUB",
      isFromAirport: false,
    },
    {
      transfer: 1,
      journey: 0,
      fixed: 0,
      routeMetrics: TAMPERED_METRICS,
    },
  );
  assert.equal(charged, DUB_DROP_TOTAL);
});

check("LDY: tampered metrics ignored when server quote is used", () => {
  const genuine = serverQuoteFor(
    CITY,
    "City of Derry Airport",
    "LDY",
    false,
    LDY_METRICS,
  );
  assert.equal(genuine.ok, true);
  if (!genuine.ok) return;
  const charged = payableFromServerQuote(
    genuine,
    {
      pickupLabel: CITY,
      dropoffLabel: "City of Derry Airport",
      airportCode: "LDY",
      isFromAirport: false,
    },
    {
      transfer: 1,
      journey: 1,
      fixed: 0,
      routeMetrics: TAMPERED_METRICS,
    },
  );
  const expected = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: genuine.journeyFareGbp ?? genuine.amount,
    airportFixedCostsGbp: genuine.airportFixedCostsGbp ?? 1,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  }).finalAmountPayableGbp;
  assert.equal(charged, expected);
});

// --- Airport-field tampering: labels (SERVED_AIRPORTS) own fee identity ---

const DUB_LABEL = "Dublin Airport, Co. Dublin, Ireland";
const LDY_LABEL = "City of Derry Airport, Airport Road, Eglinton BT47 3GY, UK";
const BFS_AIRPORT_LABEL = "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK";
const BHD_AIRPORT_LABEL = "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK";

check("derive: Dublin pickup from labels → fromAirport + DUB", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB_LABEL, CITY);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.airportCode, "DUB");
  assert.equal(ctx.context.fromAirport, true);
  assert.equal(ctx.context.isAirportToAirport, false);
});

check("1. DUB pickup: airportCode removed still charges £5 parking + £4 M1", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB_LABEL, CITY);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: ctx.context.airportCode,
    fromAirport: ctx.context.fromAirport,
    pickupAddress: DUB_LABEL,
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
    claimedAirportFixedCostsGbp: 0,
    removedAirportFeeIds: ["outbound:DUB:pickup", "outbound:DUB:toll"],
    booking: {
      pickupLabel: DUB_LABEL,
      dropoffLabel: CITY,
      // Client stripped airport identity fields:
      airportCode: undefined,
      isFromAirport: undefined,
      journeyKind: undefined,
      pickupAirportCode: undefined,
      dropoffAirportCode: undefined,
      isAirportToAirport: undefined,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 9,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 9);
  assert.equal(resolved.airportContext.airportCode, "DUB");
  assert.equal(resolved.airportContext.fromAirport, true);
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, DUB_PICK_TOTAL);
});

check("2. DUB pickup: isFromAirport=false cannot avoid £5", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB_LABEL, CITY);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: ctx.context.airportCode,
    fromAirport: ctx.context.fromAirport, // server true
    pickupAddress: DUB_LABEL,
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
    booking: {
      pickupLabel: DUB_LABEL,
      dropoffLabel: CITY,
      airportCode: "DUB",
      isFromAirport: false, // tamper: claim drop-off direction
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 9,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportContext.fromAirport, true);
  assert.equal(resolved.airportFixedCostsGbp, 9); // parking £5 + M1 £4
});

check("3. Belfast → Dublin: client wrong airport still keeps DUB M1 £4", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(CITY, DUB_LABEL);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.airportCode, "DUB");
  assert.equal(ctx.context.fromAirport, false);
  const requote = calculateAuthoritativeWebsiteQuote({
    airportCode: ctx.context.airportCode,
    fromAirport: ctx.context.fromAirport,
    pickupAddress: CITY,
    dropoffAddress: DUB_LABEL,
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
    booking: {
      pickupLabel: CITY,
      dropoffLabel: DUB_LABEL,
      airportCode: "BFS", // wrong
      isFromAirport: true, // wrong
      journeyKind: "airport-to-address",
      pickupAirportCode: "BFS",
      dropoffAirportCode: null,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: requote.amount,
      journeyFareGbp: requote.journeyFareGbp ?? DUB_JOURNEY,
      airportFixedCostsGbp: requote.airportFixedCostsGbp ?? 4,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportContext.airportCode, "DUB");
  assert.equal(resolved.airportFixedCostsGbp, 4); // M1 only; drop-off fee £0
  const payable = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: resolved.journeyFareGbp,
    airportFixedCostsGbp: resolved.airportFixedCostsGbp,
    airportAccessChargeGbp: 0,
    claimFirstBookingOffer: true,
  });
  assert.equal(payable.finalAmountPayableGbp, DUB_DROP_TOTAL);
});

check("4. LDY pickup: cannot avoid £2.50 by altering airport fields", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(LDY_LABEL, CITY);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.airportCode, "LDY");
  assert.equal(ctx.context.fromAirport, true);
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: false,
    airportCode: ctx.context.airportCode,
    fromAirport: ctx.context.fromAirport,
    removedFeeIds: ["outbound:LDY:pickup"],
  });
  assert.equal(fees.totalAppliedGbp, 2.5);
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    removedAirportFeeIds: ["outbound:LDY:pickup"],
    booking: {
      pickupLabel: LDY_LABEL,
      dropoffLabel: CITY,
      airportCode: "BFS",
      isFromAirport: false,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: 100,
      journeyFareGbp: 97.5,
      airportFixedCostsGbp: 2.5,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 2.5);
});

check("5. LDY drop-off: cannot avoid £1 by altering airport fields", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(CITY, LDY_LABEL);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.airportCode, "LDY");
  assert.equal(ctx.context.fromAirport, false);
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    removedAirportFeeIds: ["outbound:LDY:drop-off"],
    booking: {
      pickupLabel: CITY,
      dropoffLabel: LDY_LABEL,
      airportCode: undefined,
      isFromAirport: true,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: 140,
      journeyFareGbp: 139,
      airportFixedCostsGbp: 1,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 1);
});

check("6. DUB → LDY A2A: all mandatory DUB/LDY charges apply from labels", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB_LABEL, LDY_LABEL);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.isAirportToAirport, true);
  assert.equal(ctx.context.pickupAirportCode, "DUB");
  assert.equal(ctx.context.dropoffAirportCode, "LDY");
  const fees = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: ctx.context.pickupAirportCode,
    dropoffAirportCode: ctx.context.dropoffAirportCode,
    removedFeeIds: [
      "outbound:DUB:pickup",
      "outbound:DUB:toll",
      "outbound:LDY:drop-off",
    ],
  });
  // DUB pickup £5 + M1 £4 + LDY drop £1 = £10; none removable
  assert.equal(fees.totalAppliedGbp, 10);
  assert.ok(fees.lines.every((l) => !l.removable || !l.removed));
  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 1,
    claimedJourneyFareGbp: 1,
    removedAirportFeeIds: [
      "outbound:DUB:pickup",
      "outbound:DUB:toll",
      "outbound:LDY:drop-off",
    ],
    booking: {
      pickupLabel: DUB_LABEL,
      dropoffLabel: LDY_LABEL,
      airportCode: "BFS",
      isFromAirport: false,
      isAirportToAirport: false,
      journeyKind: "address-to-address",
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: 200,
      journeyFareGbp: 190,
      airportFixedCostsGbp: 10,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 10);
  assert.equal(resolved.airportContext.isAirportToAirport, true);
});

check("7. BFS/BHD free-area choice still works on A2A", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(BFS_AIRPORT_LABEL, BHD_AIRPORT_LABEL);
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.context.isAirportToAirport, true);
  assert.equal(ctx.context.pickupAirportCode, "BFS");
  assert.equal(ctx.context.dropoffAirportCode, "BHD");
  // BFS↔BHD: collection waived; destination BHD surcharge removable.
  const withRemoval = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: ctx.context.pickupAirportCode,
    dropoffAirportCode: ctx.context.dropoffAirportCode,
    removedFeeIds: ["outbound:BHD:drop-off"],
  });
  const bhd = withRemoval.lines.find((l) => l.airportCode === "BHD");
  assert.ok(bhd);
  assert.equal(bhd!.removable, true);
  assert.equal(bhd!.removed, true);
  assert.equal(bhd!.appliedAmountGbp, 0);

  const withoutRemoval = resolveJourneyAirportFees({
    isAirportToAirport: true,
    pickupAirportCode: ctx.context.pickupAirportCode,
    dropoffAirportCode: ctx.context.dropoffAirportCode,
  });
  const bhdKept = withoutRemoval.lines.find((l) => l.airportCode === "BHD");
  assert.ok(bhdKept);
  assert.equal(bhdKept!.removable, true);
  assert.equal(bhdKept!.removed, false);
  assert.ok((bhdKept!.appliedAmountGbp ?? 0) > 0);

  const resolved = resolveOpenWebsitePaymentTransferFares({
    clientTransferAmountGbp: 50,
    claimedJourneyFareGbp: 50,
    removedAirportFeeIds: ["outbound:BHD:drop-off"],
    booking: {
      pickupLabel: BFS_AIRPORT_LABEL,
      dropoffLabel: BHD_AIRPORT_LABEL,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      vehicle: "Saloon",
    },
    airportContext: ctx.context,
    authoritativeQuote: {
      amountGbp: 50,
      journeyFareGbp: 50,
      airportFixedCostsGbp: 0,
    },
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.airportFixedCostsGbp, 0);
});

check("ambiguous same-airport both ends rejected", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB_LABEL, DUB_LABEL);
  assert.equal(ctx.ok, false);
});

// --- Consent amount must equal SumUp amount (never silent £138 → £200) ---

check("1. accepted £138 / server £138 → SumUp £138", () => {
  assert.equal(checkoutAmountsMatch(138, 138), true);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138), 138);
});

check("2. accepted £138 / server £138.01 → SumUp £138 (not £138.01)", () => {
  assert.equal(checkoutAmountsMatch(138, 138.01), true);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138.01), 138);
});

check("3. accepted £138 / server £138.02 → SumUp £138 (not £138.02)", () => {
  assert.equal(checkoutAmountsMatch(138, 138.02), true);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138.02), 138);
});

check("4. accepted £138 / server £138.03 → 409, no SumUp", () => {
  assert.equal(checkoutAmountsMatch(138, 138.03), false);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138.03), null);
});

check("5. accepted £138 / server £200 → 409, no SumUp", () => {
  assert.equal(checkoutAmountsMatch(138, 200), false);
  assert.equal(resolveSumUpChargeAmountGbp(138, 200), null);
  const err = buildFareMismatchPaymentError(138, 200);
  assert.equal(err.code, "fare_mismatch");
  assert.equal(err.displayedAmountGbp, 138);
  assert.equal(err.serverAmountGbp, 200);
  assert.match(err.error, /£138/);
  assert.match(err.error, /£200/);
  assert.match(err.error, /review the updated price/i);
});

check("displayed £200 / server £138 → rejected mismatch", () => {
  assert.equal(checkoutAmountsMatch(200, 138), false);
  assert.equal(resolveSumUpChargeAmountGbp(200, 138), null);
});

check("manipulated client amount £1 vs server £138 → rejected", () => {
  assert.equal(checkoutAmountsMatch(1, 138), false);
  assert.equal(resolveSumUpChargeAmountGbp(1, 138), null);
});

check("payment path wires accepted charge + no approximate mismatch rebuild", () => {
  const index = fs.readFileSync(
    path.join(root, "workers/addresses/src/index.ts"),
    "utf8",
  );
  assert.match(index, /resolveSumUpChargeAmountGbp/);
  assert.match(index, /amount = sumUpChargeGbp/);
  assert.doesNotMatch(index, /amount = serverFinalAmountGbp/);

  const createPayment = fs.readFileSync(
    path.join(root, "src/lib/create-payment.ts"),
    "utf8",
  );
  assert.match(createPayment, /acceptedFinalAmountGbp/);
  assert.match(createPayment, /fare_mismatch/);

  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.match(card, /acceptedFinalAmountGbp:\s*paymentAmount/);
  assert.match(card, /isPaymentFareMismatchError/);
  assert.match(card, /refreshAuthoritativeServerQuote/);
  // Must not reconstruct journey by subtracting Express / fixed from server total.
  assert.doesNotMatch(
    card,
    /server\s*-\s*\(prev\.airportFixedCostsGbp/,
  );
  assert.doesNotMatch(
    card,
    /server\s*-\s*\(expressSelection\.feeGbp/,
  );
  assert.match(
    card,
    /isPaymentFareMismatchError\(error\)[\s\S]*refreshAuthoritativeServerQuote\(\)/,
  );
});

console.log("\nAll open-website payment fare checks passed.");

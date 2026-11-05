/**
 * Empty Legs read-only admin preview — offline checks.
 * Does not unlock Smart Return, write pricing, or touch KV.
 * Run: npx tsx scripts/check-empty-legs-preview.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEmptyLegEconomics,
  buildEmptyLegsPreviewConfig,
  buildEmptyLegsPreviewReport,
  EMPTY_LEGS_PREVIEW_ASSUMPTIONS,
  emptyLegsPreviewCsv,
  estimateParentJourneyFareGbp,
} from "../shared/empty-legs-preview";
import {
  DEFAULT_SMART_OPS_CONFIG,
  SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS,
  normalizeSmartOpsConfig,
} from "../shared/smart-ops-config";
import type { SmartReturnParent } from "../shared/smart-return";
import type { SmartShadowRecord } from "../shared/smart-shadow";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BELFAST = { lat: 54.5964, lng: -5.9302 };
const DUB = { lat: 53.4264, lng: -6.2499 };
const MONDAY = "2026-11-09";
const NOW = new Date("2026-11-08T12:00:00Z");

const parent: SmartReturnParent = {
  id: "pay_belfast_dub_1",
  pickupLabel: "Belfast City Hall",
  dropoffLabel: "Dublin Airport",
  pickup: BELFAST,
  dropoff: DUB,
  tripDate: MONDAY,
  tripTime: "10:00",
  durationMinutes: 120,
  airportCode: "DUB",
  isFromAirport: false,
  vehicle: "Saloon",
  amountGbp: 208,
  operationalStatus: "confirmed",
  paymentStatus: "paid",
};

console.log("=== 1. Illustrative assumptions ===");
{
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.maxDiscountPercent, 25);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.minAcceptableFareGbp, 185);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.noStackWithReturnBookingDiscount, true);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.airportFeesUndiscounted, true);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.estateSupplementUndiscounted, true);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.showPrePickupOpportunities, true);
  assert.equal(EMPTY_LEGS_PREVIEW_ASSUMPTIONS.pricePrePickupOpportunities, false);
  console.log("OK  25% / £185 · both types shown · pre-pickup unpriced");
}

console.log("\n=== 2. Preview config never matches live signed-off unlock ===");
{
  const live = normalizeSmartOpsConfig({
    ...DEFAULT_SMART_OPS_CONFIG,
    flags: { ...SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS },
  });
  assert.equal(live.flags.smartReturnPricing, false);
  assert.equal(live.flags.returnCorridorMatching, false);
  const preview = buildEmptyLegsPreviewConfig(live);
  assert.equal(preview.flags.smartReturnPricing, true);
  assert.equal(preview.smartReturn.maxDiscountPercent, 25);
  assert.equal(preview.smartReturn.minAcceptableFareGbp, 185);
  // Live config object must remain unchanged by the preview builder.
  assert.equal(live.flags.smartReturnPricing, false);
  assert.equal(live.smartReturn.minAcceptableFareGbp, 40);
  console.log("OK  preview config is in-memory only; live stays OFF / £40 technical default");
}

console.log("\n=== 3. Parent journey fare estimate strips to-airport fixed ===");
{
  const journey = estimateParentJourneyFareGbp(parent);
  assert.equal(journey, 204);
  console.log("OK  £208 total − £4 to-DUB fixed → £204 journey");
}

console.log("\n=== 4. Report builds post-drop-off priced + pre-pickup unsupported ===");
{
  const shadow: SmartShadowRecord[] = [
    {
      at: NOW.toISOString(),
      fingerprint: "a|b|2026-11-09|12:30|saloon",
      liveQuoted: true,
      liveAmountGbp: 213,
      availability: {
        available: true,
        reason: "AVAILABLE_NO_CONFLICT",
        alternatives: [],
        durationMinutes: 120,
        bufferMinutes: 45,
      },
      smartReturn: {
        eligible: false,
        reason: "SMART_RETURN_DISABLED",
        smartJourneyFareGbp: null,
        savingGbp: 0,
      },
      customerFacingWouldChange: false,
    },
    {
      at: NOW.toISOString(),
      fingerprint: "c|d|2026-11-09|13:00|saloon",
      liveQuoted: true,
      availability: {
        available: true,
        reason: "AVAILABLE_NO_CONFLICT",
        alternatives: [],
        durationMinutes: 120,
        bufferMinutes: 45,
      },
      smartReturn: {
        eligible: false,
        reason: "SMART_RETURN_OUTSIDE_TIME_WINDOW",
        smartJourneyFareGbp: null,
        savingGbp: 0,
      },
      customerFacingWouldChange: false,
    },
  ];

  const report = buildEmptyLegsPreviewReport({
    parents: [parent],
    liveConfig: DEFAULT_SMART_OPS_CONFIG,
    shadow,
    fromYmd: MONDAY,
    toYmd: MONDAY,
    now: NOW,
  });

  assert.equal(report.liveSmartReturnPricing, false);
  assert.equal(report.parentCount, 1);
  assert.equal(report.opportunities.length, 2);

  const post = report.opportunities.find((item) => item.type === "post_dropoff_return");
  const pre = report.opportunities.find((item) => item.type === "pre_pickup_positioning");
  assert.ok(post);
  assert.ok(pre);
  assert.equal(post!.pricingLive, false);
  assert.equal(post!.status, "preview_priced");
  assert.ok((post!.suggestedJourneyFareGbp || 0) >= 185);
  assert.ok((post!.suggestedTotalFareGbp || 0) > (post!.suggestedJourneyFareGbp || 0));
  assert.equal(post!.airportFixedCostsGbp, 9);
  assert.ok((post!.estimatedEmptyMiles || 0) > 50);
  assert.ok(post!.windowStartLocal);
  assert.ok(post!.windowEndLocal);

  assert.equal(pre!.status, "unsupported_unpriced");
  assert.equal(pre!.suggestedJourneyFareGbp, null);
  assert.equal(pre!.suggestedTotalFareGbp, null);
  assert.equal(pre!.reason, "PRE_PICKUP_MATCHING_UNSUPPORTED");
  assert.match(pre!.notes, /not deferred|unsupported\/unpriced/i);
  assert.ok((pre!.economics.emptyMilesConvertedToPaid || 0) > 50);
  assert.equal(pre!.economics.actualMileageEliminated, 0);
  assert.equal(pre!.economics.suggestedRevenueGbp, null);
  assert.equal(pre!.economics.incrementalCostGbp, null);

  assert.ok((post!.economics.emptyMilesConvertedToPaid || 0) > 50);
  assert.equal(post!.economics.actualMileageEliminated, 0);
  assert.ok((post!.economics.costsIncurredAnywayGbp || 0) > 0);
  assert.ok((post!.economics.incrementalCostGbp || 0) >= 9);
  assert.ok((post!.economics.contributionVsIncrementalGbp || 0) > 0);
  assert.ok((post!.economics.loadedOneWayOpCostReferenceGbp || 0) > (post!.economics.incrementalCostGbp || 0));
  assert.match(post!.economics.economicsNote, /incremental cost/i);

  assert.equal(report.shadowSampleCount, 2);
  assert.ok(report.shadowReasonCounts.some((row) => row.reason === "SMART_RETURN_DISABLED"));
  assert.ok(
    report.shadowReasonCounts.some((row) => row.reason === "SMART_RETURN_OUTSIDE_TIME_WINDOW"),
  );

  const csv = emptyLegsPreviewCsv(report);
  assert.match(csv, /post_dropoff_return/);
  assert.match(csv, /pre_pickup_positioning/);
  assert.match(csv, /unsupported_unpriced/);
  assert.match(csv, /pricingLive/);
  assert.match(csv, /emptyMilesConvertedToPaid/);
  assert.match(csv, /actualMileageEliminated/);
  assert.match(csv, /incrementalCostGbp/);
  console.log("OK  dual opportunity types · economics · shadow counts · CSV");
}

console.log("\n=== 4b. Incremental economics vs loaded £/hr reference ===");
{
  const economics = buildEmptyLegEconomics({
    type: "post_dropoff_return",
    baselineEmptyDriveMiles: 98,
    estimatedDetourMiles: 0,
    airportFixedCostsGbp: 9,
    suggestedRevenueGbp: 194,
    durationMinutes: 115,
  });
  assert.equal(economics.emptyMilesConvertedToPaid, 98);
  assert.equal(economics.actualMileageEliminated, 0);
  assert.equal(economics.estimatedDetourMiles, 0);
  assert.equal(economics.incrementalCostGbp, 9);
  assert.ok((economics.costsIncurredAnywayGbp || 0) > 20);
  assert.ok((economics.loadedOneWayOpCostReferenceGbp || 0) > 80);
  assert.ok((economics.contributionVsIncrementalGbp || 0) > 150);
  assert.ok(
    (economics.loadedOneWayOpCostReferenceGbp || 0) > (economics.incrementalCostGbp || 0) * 5,
    "loaded £/hr reference must not be used as the empty-leg decision floor",
  );
  console.log("OK  perfect reverse: convert 98 mi, eliminate 0, incremental ≈ airport fees only");
}

console.log("\n=== 5. Short local parents excluded when longDistanceOnly ===");
{
  const local: SmartReturnParent = {
    id: "pay_local",
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "Belfast International Airport",
    pickup: BELFAST,
    dropoff: { lat: 54.6575, lng: -6.2158 },
    tripDate: MONDAY,
    tripTime: "09:00",
    durationMinutes: 30,
    airportCode: "BFS",
    isFromAirport: false,
    amountGbp: 45,
  };
  const report = buildEmptyLegsPreviewReport({
    parents: [local],
    liveConfig: DEFAULT_SMART_OPS_CONFIG,
    fromYmd: MONDAY,
    toYmd: MONDAY,
    now: NOW,
    longDistanceOnly: true,
  });
  assert.equal(report.parentCount, 0);
  assert.equal(report.opportunities.length, 0);
  console.log("OK  BFS local parent filtered out of DUB-focused preview");
}

console.log("\n=== 6. Wiring: owner portal private, endpoint read-only, flags stay locked ===");
{
  const panel = read("src/components/OwnerEmptyLegsPanel.tsx");
  assert.match(panel, /data-owner-empty-legs/);
  assert.match(panel, /Read-only preview/);
  assert.match(panel, /Export CSV/);
  assert.match(panel, /Approve \(locked\)/);
  assert.match(panel, /EMPTY_LEGS_PREVIEW_ASSUMPTIONS/);
  assert.match(panel, /Empty miles → paid/);
  assert.match(panel, /Mileage eliminated/);
  assert.match(panel, /Incremental cost/);
  assert.match(panel, /pre-pickup/);
  assert.doesNotMatch(panel, /smartReturnPricing:\s*true/);

  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /"empty-legs"/);
  assert.match(switcher, /Empty Legs/);

  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /OwnerEmptyLegsPanel/);
  assert.match(page, /ownerToolTab === "empty-legs"/);
  assert.equal(
    /isOwnerView && savedKey \? \(\s*<OwnerEmptyLegsPanel/.test(page),
    false,
    "Empty Legs must not always render",
  );

  const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(handlers, /handleOwnerEmptyLegsPreview/);
  assert.match(handlers, /\/owner\/smart-ops\/empty-legs/);
  assert.match(handlers, /buildEmptyLegsPreviewReport/);
  assert.match(handlers, /discountsActive:\s*false/);
  // Save path must still hard-lock Smart Return OFF.
  assert.match(handlers, /smartReturnPricing:\s*false/);
  assert.match(handlers, /returnCorridorMatching:\s*false/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /handleOwnerEmptyLegsPreview/);
  assert.match(index, /smart-ops\/empty-legs/);

  const api = read("src/lib/smart-ops-api.ts");
  assert.match(api, /fetchEmptyLegsPreview/);
  assert.match(api, /format:\s*"csv"/);

  const robots = read("src/app/robots.ts");
  assert.match(robots, /\/owner\//);

  console.log("OK  Owner More tool · GET preview endpoint · save lock intact · robots disallow /owner/");
}

console.log("\nAll Empty Legs preview checks passed.");

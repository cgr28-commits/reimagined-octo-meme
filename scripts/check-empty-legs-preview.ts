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
  EMPTY_LEGS_PREVIEW_MAX_RANGE_DAYS,
  emptyLegsPreviewCsv,
  estimateParentJourneyFareGbp,
  PRE_PICKUP_STATUS_LABEL,
  validateEmptyLegsPreviewDateRange,
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

const belfastToDub: SmartReturnParent = {
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

const dubToBelfast: SmartReturnParent = {
  id: "pay_dub_belfast_1",
  pickupLabel: "Dublin Airport",
  dropoffLabel: "Belfast City Hall",
  pickup: DUB,
  dropoff: BELFAST,
  tripDate: MONDAY,
  tripTime: "14:00",
  durationMinutes: 120,
  airportCode: "DUB",
  isFromAirport: true,
  vehicle: "Saloon",
  amountGbp: 213,
  operationalStatus: "confirmed",
  paymentStatus: "paid",
};

const cancelledParent: SmartReturnParent = {
  ...belfastToDub,
  id: "pay_cancelled",
  operationalStatus: "cancelled",
  cancelled: true,
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

console.log("\n=== 2. Preview config never unlocks live flags ===");
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
  assert.equal(live.flags.smartReturnPricing, false);
  assert.equal(live.smartReturn.minAcceptableFareGbp, 40);
  console.log("OK  preview config is in-memory only");
}

console.log("\n=== 3. Parent journey fare estimate ===");
{
  assert.equal(estimateParentJourneyFareGbp(belfastToDub), 204);
  assert.equal(estimateParentJourneyFareGbp(dubToBelfast), 204);
  console.log("OK  fixed costs stripped both directions");
}

console.log("\n=== 4. Belfast→Dublin parent: post-drop-off priced + pre-pickup visible ===");
{
  const report = buildEmptyLegsPreviewReport({
    parents: [belfastToDub, cancelledParent],
    liveConfig: DEFAULT_SMART_OPS_CONFIG,
    shadow: [],
    fromYmd: MONDAY,
    toYmd: MONDAY,
    now: NOW,
  });
  assert.equal(report.parentCount, 1, "cancelled parents excluded");
  assert.equal(report.opportunities.length, 2);
  const post = report.opportunities.find((item) => item.type === "post_dropoff_return")!;
  const pre = report.opportunities.find((item) => item.type === "pre_pickup_positioning")!;
  assert.equal(post.parentCorridor, "belfast_to_dublin");
  assert.equal(post.opportunityCorridor, "dublin_to_belfast");
  assert.equal(post.status, "preview_priced");
  assert.ok((post.suggestedJourneyFareGbp || 0) >= 185);
  assert.ok((post.effectiveDiscountPercent || 0) >= 0);
  assert.equal(post.pricingLive, false);
  assert.equal(pre.status, "unsupported_unpriced");
  assert.equal(pre.statusLabel, PRE_PICKUP_STATUS_LABEL);
  assert.equal(pre.suggestedTotalFareGbp, null);
  assert.equal(pre.parentCorridor, "belfast_to_dublin");
  assert.equal(pre.opportunityCorridor, "belfast_to_dublin");
  assert.equal(report.totals.prePickupCount, 1);
  assert.equal(report.totals.postDropoffCount, 1);
  console.log("OK  Belfast→Dublin both types · cancelled excluded");
}

console.log("\n=== 5. Dublin→Belfast parent: reverse post-drop-off + pre-pickup ===");
{
  const report = buildEmptyLegsPreviewReport({
    parents: [dubToBelfast],
    liveConfig: DEFAULT_SMART_OPS_CONFIG,
    fromYmd: MONDAY,
    toYmd: MONDAY,
    now: NOW,
  });
  const post = report.opportunities.find((item) => item.type === "post_dropoff_return")!;
  const pre = report.opportunities.find((item) => item.type === "pre_pickup_positioning")!;
  assert.equal(post.parentCorridor, "dublin_to_belfast");
  assert.equal(post.opportunityCorridor, "belfast_to_dublin");
  assert.equal(post.status, "preview_priced");
  assert.ok((post.suggestedJourneyFareGbp || 0) >= 185);
  assert.equal(pre.statusLabel, PRE_PICKUP_STATUS_LABEL);
  assert.equal(pre.opportunityCorridor, "dublin_to_belfast");
  console.log("OK  Dublin→Belfast both types");
}

console.log("\n=== 6. Incremental economics vs loaded £/hr reference ===");
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
  assert.equal(economics.waitingTimeCostGbp, null);
  assert.equal(economics.waitingTimeStatus, "unavailable");
  assert.ok((economics.loadedOneWayOpCostReferenceGbp || 0) > 80);
  assert.ok((economics.contributionVsIncrementalGbp || 0) > 150);
  console.log("OK  convert 98 mi, eliminate 0, incremental ≈ airport fees");
}

console.log("\n=== 7. Both parents together + CSV + shadow unavailable ===");
{
  const shadow: SmartShadowRecord[] = [
    {
      at: NOW.toISOString(),
      fingerprint: "a|b|2026-11-09|12:30|saloon",
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
    parents: [belfastToDub, dubToBelfast],
    liveConfig: DEFAULT_SMART_OPS_CONFIG,
    shadow,
    fromYmd: MONDAY,
    toYmd: MONDAY,
    now: NOW,
  });
  assert.equal(report.parentCount, 2);
  assert.equal(report.opportunities.length, 4);
  assert.equal(report.totals.upcomingPotential, 4);
  assert.equal(report.totals.prePickupCount, 2);
  assert.equal(report.totals.postDropoffCount, 2);
  assert.ok(report.totals.estimatedAdditionalRevenuePotentialGbp > 0);
  assert.ok(report.totals.emptyMilesPotentiallyConvertible > 100);
  assert.equal(report.totals.actualMileagePotentiallyEliminated, 0);
  const csv = emptyLegsPreviewCsv(report);
  assert.match(csv, /pre_pickup_positioning/);
  assert.match(csv, /effectiveDiscountPercent/);
  assert.match(csv, /waitingTimeStatus/);
  assert.match(csv, /PRE_PICKUP_MATCHING_UNSUPPORTED|pricing engine not yet available/i);
  assert.equal(report.shadowSampleCount, 1);
  console.log("OK  four opportunities · totals · CSV");
}

console.log("\n=== 8. Wiring + hard restrictions ===");
{
  const panel = read("src/components/OwnerEmptyLegsPanel.tsx");
  assert.match(panel, /data-owner-empty-legs/);
  assert.match(panel, /data-empty-legs-table/);
  assert.match(panel, /data-empty-legs-summary/);
  assert.match(panel, /PRE_PICKUP_STATUS_LABEL/);
  assert.match(panel, /Empty miles converted into paid miles/);
  assert.match(panel, /Estimated mileage potentially eliminated/);
  assert.doesNotMatch(panel, />Mileage eliminated</);
  assert.match(panel, /Incremental contribution/);
  assert.match(panel, /Activate Smart Return \(locked\)/);
  assert.match(panel, /Waiting-time cost/);
  assert.match(panel, /validateEmptyLegsPreviewDateRange/);
  assert.match(panel, /EMPTY_LEGS_PREVIEW_MAX_RANGE_DAYS/);
  assert.match(panel, /Maximum range/);
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
  assert.match(handlers, /validateEmptyLegsPreviewDateRange/);
  assert.match(handlers, /discountsActive:\s*false/);
  assert.match(handlers, /smartReturnPricing:\s*false/);
  assert.match(handlers, /returnCorridorMatching:\s*false/);

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /handleOwnerEmptyLegsPreview/);

  const robots = read("src/app/robots.ts");
  assert.match(robots, /\/owner\//);
  console.log("OK  Owner portal wiring · locks · robots");
}

console.log("\n=== 9. Date-range validation (max 90 days) ===");
{
  assert.equal(EMPTY_LEGS_PREVIEW_MAX_RANGE_DAYS, 90);
  assert.equal(validateEmptyLegsPreviewDateRange("2026-11-01", "2026-11-21").ok, true);
  assert.equal(validateEmptyLegsPreviewDateRange("2026-11-01", "2026-10-31").ok, false);
  assert.match(
    String((validateEmptyLegsPreviewDateRange("2026-11-01", "2026-10-31") as { error: string }).error),
    /earlier than From/i,
  );
  const exactly90 = validateEmptyLegsPreviewDateRange("2026-01-01", "2026-04-01");
  assert.equal(exactly90.ok, true);
  const over90 = validateEmptyLegsPreviewDateRange("2026-01-01", "2026-04-02");
  assert.equal(over90.ok, false);
  assert.match(String((over90 as { error: string }).error), /90 days/i);
  assert.equal(validateEmptyLegsPreviewDateRange("bad", "2026-11-01").ok, false);
  console.log("OK  from≤to · max 90 days · malformed rejected");
}

console.log("\nAll Empty Legs preview checks passed.");

/**
 * Owner-only Empty Legs preview helpers.
 *
 * Illustrative Smart Return pricing for the read-only admin dashboard.
 * Does NOT unlock customer Smart Return, write KV pricing, or change live fares.
 * Pre-pickup positioning opportunities are listed but explicitly unpriced.
 */

import { getAirportLegFixedCostGbp } from "./airport-fixed-costs";
import {
  DEFAULT_SMART_OPS_CONFIG,
  normalizeSmartOpsConfig,
  SMART_OPS_REASON,
  type SmartOpsConfig,
} from "./smart-ops-config";
import {
  addMinutesToTrip,
  coordsFromAirportHint,
  estimateDurationMinutes,
  isLongDistanceJourney,
  nextAvailableFrom,
  roadMilesEstimate,
  type SmartCoords,
  type SmartOccupiedJob,
} from "./smart-conflict";
import {
  evaluateSmartReturn,
  smartReturnIsReleased,
  type SmartReturnParent,
} from "./smart-return";
import type { SmartShadowRecord } from "./smart-shadow";

/**
 * Approved preview assumptions — simulation only, never persisted to live pricing.
 * Both opportunity types are shown; only post-drop-off can be priced today.
 */
export const EMPTY_LEGS_PREVIEW_ASSUMPTIONS = {
  maxDiscountPercent: 25,
  minAcceptableFareGbp: 185,
  label: "Illustrative preview only — live Smart Return remains OFF",
  noStackWithReturnBookingDiscount: true,
  airportFeesUndiscounted: true,
  estateSupplementUndiscounted: true,
  showPrePickupOpportunities: true,
  pricePrePickupOpportunities: false,
  /** Variable £/mi for empty-leg economics (fuel + wear). Excludes £/hr wage. */
  variableCostPerMileGbp: 0.293,
  /**
   * Reference loaded one-way op-cost rate uses £40/hr — shown only as context.
   * Empty-leg decisions use incremental cost, not this loaded figure.
   */
  loadedHourlyReferenceGbp: 40,
  dieselGbpPerLitre: 2,
  vehicleMpg: 47,
  wearPerMileGbp: 0.1,
} as const;

export type EmptyLegOpportunityType = "post_dropoff_return" | "pre_pickup_positioning";

export type EmptyLegOpportunityStatus =
  | "preview_priced"
  | "preview_ineligible"
  | "unsupported_unpriced";

/**
 * Empty-leg economics: separate miles already happening from extra passenger cost,
 * and empty-miles-converted from true odometer reduction.
 */
export type EmptyLegEconomics = {
  /** Empty corridor miles that become paid if this match sells. */
  emptyMilesConvertedToPaid: number | null;
  /**
   * Miles removed from the odometer vs a separate empty positioning trip.
   * Pure reverse fills usually 0 — converting empty→paid does not shrink total miles.
   */
  actualMileageEliminated: number | null;
  /** Empty drive that would happen anyway without a passenger. */
  baselineEmptyDriveMiles: number | null;
  /** Extra miles vs the pure reverse / pure positioning path. */
  estimatedDetourMiles: number | null;
  /** Fuel+wear on baseline empty drive (sunk if already committed). No £/hr wage. */
  costsIncurredAnywayGbp: number | null;
  /** Detour fuel+wear + passenger-caused airport fees — decision-relevant. */
  incrementalCostGbp: number | null;
  suggestedRevenueGbp: number | null;
  /** suggestedRevenue − incrementalCost (null when unpriced). */
  contributionVsIncrementalGbp: number | null;
  /** Reference only: fuel+wear+£40/hr on full one-way — not the empty-leg decision basis. */
  loadedOneWayOpCostReferenceGbp: number | null;
  economicsNote: string;
};

export type EmptyLegOpportunity = {
  id: string;
  type: EmptyLegOpportunityType;
  status: EmptyLegOpportunityStatus;
  parentBookingId: string;
  parentTripDate: string;
  parentTripTime: string;
  parentDirectionLabel: string;
  opportunityDirectionLabel: string;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  estimatedEmptyMiles: number | null;
  normalJourneyFareGbp: number | null;
  normalTotalFareGbp: number | null;
  suggestedJourneyFareGbp: number | null;
  suggestedTotalFareGbp: number | null;
  suggestedSavingGbp: number | null;
  airportFixedCostsGbp: number;
  estatePremiumGbp: number;
  alignment: number | null;
  deviationMiles: number | null;
  economics: EmptyLegEconomics;
  reason: string;
  liveReleaseOpen: boolean;
  pricingLive: false;
  notes: string;
};

export type EmptyLegShadowReasonCount = {
  reason: string;
  count: number;
};

export type EmptyLegsPreviewReport = {
  generatedAt: string;
  assumptions: typeof EMPTY_LEGS_PREVIEW_ASSUMPTIONS;
  liveSmartReturnPricing: boolean;
  liveReturnCorridorMatching: boolean;
  fromYmd: string;
  toYmd: string;
  parentCount: number;
  opportunities: EmptyLegOpportunity[];
  shadowReasonCounts: EmptyLegShadowReasonCount[];
  shadowSampleCount: number;
};

function point(
  explicit: SmartCoords | null | undefined,
  label?: string | null,
  airportCode?: string | null,
): SmartCoords | null {
  if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) return explicit;
  return coordsFromAirportHint(label, airportCode);
}

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function corridorLabel(fromLabel: string, toLabel: string): string {
  const from = String(fromLabel || "Pickup").trim() || "Pickup";
  const to = String(toLabel || "Drop-off").trim() || "Drop-off";
  return `${from} → ${to}`;
}

function shortCorridor(fromLabel: string, toLabel: string, airportCode?: string | null): string {
  const hay = `${fromLabel} ${toLabel} ${airportCode || ""}`.toLowerCase();
  const hasDub = /\bdublin\b|\bdub\b/.test(hay) || String(airportCode || "").toUpperCase() === "DUB";
  const hasBelfast = /\bbelfast\b|\bbfs\b|\bbhd\b/.test(hay);
  if (hasDub && hasBelfast) {
    const fromAirport =
      /\bdublin\b|\bdub\b/.test(String(fromLabel || "").toLowerCase()) ||
      (String(airportCode || "").toUpperCase() === "DUB" &&
        !/\bdublin\b|\bdub\b/.test(String(toLabel || "").toLowerCase()));
    return fromAirport ? "Dublin Airport → Greater Belfast" : "Greater Belfast → Dublin Airport";
  }
  return corridorLabel(fromLabel, toLabel);
}

/** Build in-memory preview config. Never save this to KV. */
export function buildEmptyLegsPreviewConfig(liveConfig?: SmartOpsConfig | null): SmartOpsConfig {
  const base = liveConfig ? normalizeSmartOpsConfig(liveConfig) : normalizeSmartOpsConfig(DEFAULT_SMART_OPS_CONFIG);
  return normalizeSmartOpsConfig({
    ...base,
    flags: {
      ...base.flags,
      // Preview evaluation only — does not unlock customer-facing flags in KV.
      smartReturnPricing: true,
      returnCorridorMatching: true,
    },
    smartReturn: {
      ...base.smartReturn,
      maxDiscountPercent: EMPTY_LEGS_PREVIEW_ASSUMPTIONS.maxDiscountPercent,
      minAcceptableFareGbp: EMPTY_LEGS_PREVIEW_ASSUMPTIONS.minAcceptableFareGbp,
      // Price the opportunity for the dashboard even outside the live release window.
      releaseMode: "immediately",
    },
  });
}

export function estimateParentJourneyFareGbp(parent: SmartReturnParent): number | null {
  const amount = Number(parent.amountGbp);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const code = parent.airportCode || null;
  const fixed = getAirportLegFixedCostGbp(code, parent.isFromAirport === true);
  const journey = roundGbp(Math.max(0, amount - fixed));
  return journey > 0 ? journey : null;
}

export function estimateEmptyMilesForParent(parent: SmartReturnParent): number | null {
  const pickup = point(parent.pickup, parent.pickupLabel, parent.airportCode);
  const dropoff = point(parent.dropoff, parent.dropoffLabel, parent.airportCode);
  if (!pickup || !dropoff) return null;
  return roundMiles(roadMilesEstimate(pickup, dropoff));
}

function reverseAirportFixedGbp(parent: SmartReturnParent): number {
  const code = parent.airportCode || null;
  // Reverse of to-airport is from-airport (and vice versa).
  return getAirportLegFixedCostGbp(code, parent.isFromAirport !== true);
}

function variableCostPerMileGbp(): number {
  const fuel =
    (EMPTY_LEGS_PREVIEW_ASSUMPTIONS.dieselGbpPerLitre * 4.54609) /
    EMPTY_LEGS_PREVIEW_ASSUMPTIONS.vehicleMpg;
  return roundGbp(fuel + EMPTY_LEGS_PREVIEW_ASSUMPTIONS.wearPerMileGbp);
}

function loadedOneWayOpCostReferenceGbp(miles: number, durationMinutes: number): number {
  const hourly =
    (Math.max(0, durationMinutes) / 60) * EMPTY_LEGS_PREVIEW_ASSUMPTIONS.loadedHourlyReferenceGbp;
  return roundGbp(miles * variableCostPerMileGbp() + hourly);
}

/**
 * Build empty-leg economics.
 * Post-drop-off: baseline empty return would happen anyway; only detour + passenger airport fees are incremental.
 * Pre-pickup: baseline is unpaid positioning toward the parent pickup; matching engine still unpriced.
 */
export function buildEmptyLegEconomics(input: {
  type: EmptyLegOpportunityType;
  baselineEmptyDriveMiles: number | null;
  estimatedDetourMiles: number | null;
  airportFixedCostsGbp: number;
  suggestedRevenueGbp: number | null;
  durationMinutes: number;
}): EmptyLegEconomics {
  const baseline = input.baselineEmptyDriveMiles;
  const detour = Math.max(0, Number(input.estimatedDetourMiles) || 0);
  const rate = variableCostPerMileGbp();
  const costsIncurredAnywayGbp =
    baseline != null ? roundGbp(baseline * rate) : null;
  const detourCost = roundGbp(detour * rate);
  const incrementalCostGbp = roundGbp(detourCost + Math.max(0, input.airportFixedCostsGbp || 0));
  const converted = baseline != null ? roundMiles(baseline) : null;
  // Reverse/positioning fills usually do not shrink total odometer — they convert empty→paid.
  // Detours are tracked separately as estimatedDetourMiles (odometer increase).
  const actualMileageEliminated = baseline == null ? null : 0;
  const revenue = input.suggestedRevenueGbp;
  const priced = revenue != null;
  const incrementalForDecision =
    input.type === "pre_pickup_positioning" || !priced ? null : incrementalCostGbp;
  const contribution =
    priced && incrementalForDecision != null
      ? roundGbp(revenue - incrementalForDecision)
      : null;
  const loaded =
    baseline != null
      ? loadedOneWayOpCostReferenceGbp(baseline, input.durationMinutes)
      : null;

  const economicsNote =
    input.type === "post_dropoff_return"
      ? "Decision basis = incremental cost (detour fuel/wear + passenger airport fees), not the full loaded £/hr one-way cost. Empty miles converted ≠ mileage eliminated."
      : "Pre-pickup shown for planning (not deferred). Matching/pricing engine not developed — no suggested fare. Miles shown are the empty positioning corridor that could convert later.";

  return {
    emptyMilesConvertedToPaid: converted,
    actualMileageEliminated,
    baselineEmptyDriveMiles: baseline,
    estimatedDetourMiles: baseline == null ? null : roundMiles(detour),
    costsIncurredAnywayGbp,
    incrementalCostGbp: incrementalForDecision,
    suggestedRevenueGbp: revenue,
    contributionVsIncrementalGbp: contribution,
    loadedOneWayOpCostReferenceGbp: loaded,
    economicsNote,
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function emptyLegsPreviewCsv(report: EmptyLegsPreviewReport): string {
  const headers = [
    "id",
    "type",
    "status",
    "parentBookingId",
    "parentTripDate",
    "parentTripTime",
    "parentDirection",
    "opportunityDirection",
    "windowStartLocal",
    "windowEndLocal",
    "estimatedEmptyMiles",
    "normalJourneyFareGbp",
    "normalTotalFareGbp",
    "suggestedJourneyFareGbp",
    "suggestedTotalFareGbp",
    "suggestedSavingGbp",
    "airportFixedCostsGbp",
    "estatePremiumGbp",
    "alignment",
    "deviationMiles",
    "emptyMilesConvertedToPaid",
    "actualMileageEliminated",
    "baselineEmptyDriveMiles",
    "estimatedDetourMiles",
    "costsIncurredAnywayGbp",
    "incrementalCostGbp",
    "suggestedRevenueGbp",
    "contributionVsIncrementalGbp",
    "loadedOneWayOpCostReferenceGbp",
    "reason",
    "liveReleaseOpen",
    "pricingLive",
    "notes",
  ];
  const rows = report.opportunities.map((item) =>
    [
      item.id,
      item.type,
      item.status,
      item.parentBookingId,
      item.parentTripDate,
      item.parentTripTime,
      item.parentDirectionLabel,
      item.opportunityDirectionLabel,
      item.windowStartLocal,
      item.windowEndLocal,
      item.estimatedEmptyMiles,
      item.normalJourneyFareGbp,
      item.normalTotalFareGbp,
      item.suggestedJourneyFareGbp,
      item.suggestedTotalFareGbp,
      item.suggestedSavingGbp,
      item.airportFixedCostsGbp,
      item.estatePremiumGbp,
      item.alignment,
      item.deviationMiles,
      item.economics.emptyMilesConvertedToPaid,
      item.economics.actualMileageEliminated,
      item.economics.baselineEmptyDriveMiles,
      item.economics.estimatedDetourMiles,
      item.economics.costsIncurredAnywayGbp,
      item.economics.incrementalCostGbp,
      item.economics.suggestedRevenueGbp,
      item.economics.contributionVsIncrementalGbp,
      item.economics.loadedOneWayOpCostReferenceGbp,
      item.reason,
      item.liveReleaseOpen,
      item.pricingLive,
      item.notes,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function summariseShadowReturnReasons(
  shadow: SmartShadowRecord[],
): EmptyLegShadowReasonCount[] {
  const counts = new Map<string, number>();
  for (const item of shadow) {
    const reason = String(item.smartReturn?.reason || "UNKNOWN");
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function buildPostDropoffOpportunity(input: {
  parent: SmartReturnParent;
  previewConfig: SmartOpsConfig;
  liveConfig: SmartOpsConfig;
  now: Date;
}): EmptyLegOpportunity {
  const { parent, previewConfig, liveConfig, now } = input;
  const ready = nextAvailableFrom(parent, previewConfig);
  const flex = previewConfig.smartReturn.returnTimeFlexibilityMinutes;
  const windowStart = ready
    ? addMinutesToTrip(ready.local.slice(0, 10), ready.local.slice(11, 16), -flex)
    : null;
  const windowEnd = ready
    ? addMinutesToTrip(ready.local.slice(0, 10), ready.local.slice(11, 16), flex)
    : null;
  const journeyFare = estimateParentJourneyFareGbp(parent);
  const airportFixed = reverseAirportFixedGbp(parent);
  const miles = estimateEmptyMilesForParent(parent);
  const liveReleaseOpen = smartReturnIsReleased(parent, liveConfig, now);

  const baseNotes =
    "Illustrative post-drop-off Smart Return preview. Live customer discounts remain OFF. Airport fees and Estate stay full; no stacking with the 5% return-booking discount.";

  if (!ready || journeyFare == null) {
    return {
      id: `return:${parent.id}`,
      type: "post_dropoff_return",
      status: "preview_ineligible",
      parentBookingId: parent.id,
      parentTripDate: parent.tripDate,
      parentTripTime: parent.tripTime,
      parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
      opportunityDirectionLabel: shortCorridor(
        parent.dropoffLabel,
        parent.pickupLabel,
        parent.airportCode,
      ),
      windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
      windowEndLocal: windowEnd ? `${windowEnd.tripDate}T${windowEnd.tripTime}` : null,
      estimatedEmptyMiles: miles,
      normalJourneyFareGbp: journeyFare,
      normalTotalFareGbp: journeyFare != null ? roundGbp(journeyFare + airportFixed) : null,
      suggestedJourneyFareGbp: null,
      suggestedTotalFareGbp: null,
      suggestedSavingGbp: null,
      airportFixedCostsGbp: airportFixed,
      estatePremiumGbp: 0,
      alignment: null,
      deviationMiles: null,
      economics: buildEmptyLegEconomics({
        type: "post_dropoff_return",
        baselineEmptyDriveMiles: miles,
        estimatedDetourMiles: 0,
        airportFixedCostsGbp: airportFixed,
        suggestedRevenueGbp: null,
        durationMinutes: estimateDurationMinutes(parent),
      }),
      reason:
        journeyFare == null
          ? "PARENT_FARE_UNKNOWN"
          : SMART_OPS_REASON.SMART_RETURN_OUTSIDE_TIME_WINDOW,
      liveReleaseOpen,
      pricingLive: false,
      notes: `${baseNotes} Could not derive a reverse time window or parent journey fare.`,
    };
  }

  const decision = evaluateSmartReturn({
    request: {
      pickupLabel: parent.dropoffLabel,
      dropoffLabel: parent.pickupLabel,
      pickup: parent.dropoff,
      dropoff: parent.pickup,
      tripDate: ready.local.slice(0, 10),
      tripTime: ready.local.slice(11, 16),
      durationMinutes: estimateDurationMinutes(parent),
      airportCode: parent.airportCode,
      isFromAirport: parent.isFromAirport !== true,
      vehicle: parent.vehicle,
      normalJourneyFareGbp: journeyFare,
      airportFixedCostsGbp: airportFixed,
      airportAccessChargeGbp: 0,
    },
    parents: [parent],
    config: previewConfig,
    now,
    forceEnabled: true,
  });

  const priced = decision.eligible && decision.finalSmartFareGbp != null;
  const economics = buildEmptyLegEconomics({
    type: "post_dropoff_return",
    baselineEmptyDriveMiles: miles,
    estimatedDetourMiles: decision.deviationMiles,
    airportFixedCostsGbp: decision.airportFixedCostsGbp,
    suggestedRevenueGbp: priced ? decision.finalSmartFareGbp : null,
    durationMinutes: estimateDurationMinutes(parent),
  });
  return {
    id: `return:${parent.id}`,
    type: "post_dropoff_return",
    status: priced ? "preview_priced" : "preview_ineligible",
    parentBookingId: parent.id,
    parentTripDate: parent.tripDate,
    parentTripTime: parent.tripTime,
    parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
    opportunityDirectionLabel: shortCorridor(
      parent.dropoffLabel,
      parent.pickupLabel,
      parent.airportCode,
    ),
    windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
    windowEndLocal: windowEnd ? `${windowEnd.tripDate}T${windowEnd.tripTime}` : null,
    estimatedEmptyMiles: miles,
    normalJourneyFareGbp: decision.normalJourneyFareGbp,
    normalTotalFareGbp: decision.finalNormalFareGbp,
    suggestedJourneyFareGbp: decision.smartJourneyFareGbp,
    suggestedTotalFareGbp: decision.finalSmartFareGbp,
    suggestedSavingGbp: priced ? decision.savingGbp : null,
    airportFixedCostsGbp: decision.airportFixedCostsGbp,
    estatePremiumGbp: decision.estatePremiumGbp,
    alignment: decision.alignment,
    deviationMiles: decision.deviationMiles,
    economics,
    reason: decision.reason,
    liveReleaseOpen,
    pricingLive: false,
    notes: liveReleaseOpen
      ? `${baseNotes} ${economics.economicsNote}`
      : `${baseNotes} Live release window is not open yet under current owner settings. ${economics.economicsNote}`,
  };
}

function buildPrePickupOpportunity(input: {
  parent: SmartReturnParent;
  previewConfig: SmartOpsConfig;
}): EmptyLegOpportunity {
  const { parent, previewConfig } = input;
  const turnaround = previewConfig.buffers.minTurnaroundMinutes;
  const duration = estimateDurationMinutes(parent);
  const latestFinish = addMinutesToTrip(parent.tripDate, parent.tripTime, -turnaround);
  const windowStart = latestFinish
    ? addMinutesToTrip(latestFinish.tripDate, latestFinish.tripTime, -duration)
    : null;
  const miles = estimateEmptyMilesForParent(parent);
  const economics = buildEmptyLegEconomics({
    type: "pre_pickup_positioning",
    baselineEmptyDriveMiles: miles,
    estimatedDetourMiles: 0,
    airportFixedCostsGbp: 0,
    suggestedRevenueGbp: null,
    durationMinutes: duration,
  });

  return {
    id: `positioning:${parent.id}`,
    type: "pre_pickup_positioning",
    status: "unsupported_unpriced",
    parentBookingId: parent.id,
    parentTripDate: parent.tripDate,
    parentTripTime: parent.tripTime,
    parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
    opportunityDirectionLabel: `Toward parent pickup · ${shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode)}`,
    windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
    windowEndLocal: latestFinish ? `${latestFinish.tripDate}T${latestFinish.tripTime}` : null,
    estimatedEmptyMiles: miles,
    normalJourneyFareGbp: null,
    normalTotalFareGbp: null,
    suggestedJourneyFareGbp: null,
    suggestedTotalFareGbp: null,
    suggestedSavingGbp: null,
    airportFixedCostsGbp: 0,
    estatePremiumGbp: 0,
    alignment: null,
    deviationMiles: null,
    economics,
    reason: "PRE_PICKUP_MATCHING_UNSUPPORTED",
    liveReleaseOpen: false,
    pricingLive: false,
    notes:
      "Pre-pickup positioning is shown (not deferred) but unsupported/unpriced until its matching engine is developed. Conflict/positioning maths exist for availability only.",
  };
}

/**
 * Build the read-only Empty Legs preview report from confirmed parents + shadow log.
 * Pure function — no KV writes, no flag unlocks.
 */
export function buildEmptyLegsPreviewReport(input: {
  parents: SmartReturnParent[];
  occupied?: SmartOccupiedJob[];
  liveConfig: SmartOpsConfig;
  shadow?: SmartShadowRecord[];
  fromYmd: string;
  toYmd: string;
  now?: Date;
  /** When true, only long-distance / Dublin-style parents (default true for DUB focus). */
  longDistanceOnly?: boolean;
}): EmptyLegsPreviewReport {
  const now = input.now ?? new Date();
  const previewConfig = buildEmptyLegsPreviewConfig(input.liveConfig);
  const longDistanceOnly = input.longDistanceOnly !== false;
  const parents = input.parents
    .filter((parent) => {
      if (parent.cancelled || parent.operationalStatus === "cancelled") return false;
      if (parent.tripDate < input.fromYmd || parent.tripDate > input.toYmd) return false;
      if (!longDistanceOnly) return true;
      return (
        isLongDistanceJourney(parent) ||
        String(parent.airportCode || "").toUpperCase() === "DUB" ||
        /\bdublin\b|\bdub\b/i.test(`${parent.pickupLabel} ${parent.dropoffLabel}`)
      );
    })
    .slice()
    .sort((a, b) =>
      `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`) ||
      a.id.localeCompare(b.id),
    );

  const opportunities: EmptyLegOpportunity[] = [];
  for (const parent of parents) {
    opportunities.push(
      buildPostDropoffOpportunity({
        parent,
        previewConfig,
        liveConfig: input.liveConfig,
        now,
      }),
    );
    opportunities.push(buildPrePickupOpportunity({ parent, previewConfig }));
  }

  return {
    generatedAt: now.toISOString(),
    assumptions: EMPTY_LEGS_PREVIEW_ASSUMPTIONS,
    liveSmartReturnPricing: input.liveConfig.flags.smartReturnPricing === true,
    liveReturnCorridorMatching: input.liveConfig.flags.returnCorridorMatching === true,
    fromYmd: input.fromYmd,
    toYmd: input.toYmd,
    parentCount: parents.length,
    opportunities,
    shadowReasonCounts: summariseShadowReturnReasons(input.shadow || []),
    shadowSampleCount: (input.shadow || []).length,
  };
}

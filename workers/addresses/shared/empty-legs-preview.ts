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
  /** Extra waiting-time cost — null until modelled; never invent a figure. */
  waitingTimeCostGbp: null;
  waitingTimeStatus: "unavailable";
  suggestedRevenueGbp: number | null;
  /** suggestedRevenue − incrementalCost (null when unpriced). */
  contributionVsIncrementalGbp: number | null;
  /** Reference only: fuel+wear+£40/hr on full one-way — not the empty-leg decision basis. */
  loadedOneWayOpCostReferenceGbp: number | null;
  economicsNote: string;
};

export type EmptyLegCorridorDirection =
  | "belfast_to_dublin"
  | "dublin_to_belfast"
  | "other";

export type EmptyLegOpportunity = {
  id: string;
  type: EmptyLegOpportunityType;
  status: EmptyLegOpportunityStatus;
  /** Owner-facing status line (pre-pickup uses the fixed unsupported copy). */
  statusLabel: string;
  parentBookingId: string;
  parentTripDate: string;
  parentTripTime: string;
  parentDirectionLabel: string;
  opportunityDirectionLabel: string;
  /** Filter key for empty-leg opportunity direction. */
  opportunityCorridor: EmptyLegCorridorDirection;
  parentCorridor: EmptyLegCorridorDirection;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  estimatedDurationMinutes: number | null;
  estimatedEmptyMiles: number | null;
  normalJourneyFareGbp: number | null;
  normalTotalFareGbp: number | null;
  suggestedJourneyFareGbp: number | null;
  suggestedTotalFareGbp: number | null;
  suggestedSavingGbp: number | null;
  /** Customer saving ÷ normal total, percent. Null when unpriced. */
  effectiveDiscountPercent: number | null;
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

export const PRE_PICKUP_STATUS_LABEL =
  "Pre-pickup opportunity — pricing engine not yet available." as const;

export type EmptyLegShadowReasonCount = {
  reason: string;
  count: number;
};

export type EmptyLegsPreviewTotals = {
  upcomingPotential: number;
  postDropoffCount: number;
  prePickupCount: number;
  previewPricedCount: number;
  previewIneligibleCount: number;
  estimatedAdditionalRevenuePotentialGbp: number;
  emptyMilesPotentiallyConvertible: number;
  actualMileagePotentiallyEliminated: number;
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
  totals: EmptyLegsPreviewTotals;
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

export function classifyCorridorDirection(
  fromLabel: string,
  toLabel: string,
  airportCode?: string | null,
): EmptyLegCorridorDirection {
  const from = String(fromLabel || "").toLowerCase();
  const to = String(toLabel || "").toLowerCase();
  const code = String(airportCode || "").toUpperCase();
  const fromDub = /\bdublin\b|\bdub\b/.test(from) || (code === "DUB" && !/\bdublin\b|\bdub\b/.test(to));
  const toDub = /\bdublin\b|\bdub\b/.test(to) || (code === "DUB" && !/\bdublin\b|\bdub\b/.test(from));
  const fromBelfast = /\bbelfast\b|\bbfs\b|\bbhd\b/.test(from);
  const toBelfast = /\bbelfast\b|\bbfs\b|\bbhd\b/.test(to);
  if ((fromBelfast || (!fromDub && toDub)) && toDub) return "belfast_to_dublin";
  if (fromDub && (toBelfast || !toDub)) return "dublin_to_belfast";
  return "other";
}

function shortCorridor(fromLabel: string, toLabel: string, airportCode?: string | null): string {
  const direction = classifyCorridorDirection(fromLabel, toLabel, airportCode);
  if (direction === "dublin_to_belfast") return "Dublin Airport → Greater Belfast";
  if (direction === "belfast_to_dublin") return "Greater Belfast → Dublin Airport";
  return corridorLabel(fromLabel, toLabel);
}

function effectiveDiscountPercent(
  savingGbp: number | null,
  normalTotalFareGbp: number | null,
): number | null {
  if (savingGbp == null || normalTotalFareGbp == null || normalTotalFareGbp <= 0) return null;
  return Math.round((savingGbp / normalTotalFareGbp) * 1000) / 10;
}

export function summariseEmptyLegsTotals(
  opportunities: EmptyLegOpportunity[],
): EmptyLegsPreviewTotals {
  let estimatedAdditionalRevenuePotentialGbp = 0;
  let emptyMilesPotentiallyConvertible = 0;
  let actualMileagePotentiallyEliminated = 0;
  let postDropoffCount = 0;
  let prePickupCount = 0;
  let previewPricedCount = 0;
  let previewIneligibleCount = 0;
  for (const item of opportunities) {
    if (item.type === "post_dropoff_return") postDropoffCount += 1;
    if (item.type === "pre_pickup_positioning") prePickupCount += 1;
    if (item.status === "preview_priced") previewPricedCount += 1;
    if (item.status === "preview_ineligible") previewIneligibleCount += 1;
    if (item.economics.contributionVsIncrementalGbp != null) {
      estimatedAdditionalRevenuePotentialGbp += item.economics.contributionVsIncrementalGbp;
    }
    if (item.economics.emptyMilesConvertedToPaid != null) {
      emptyMilesPotentiallyConvertible += item.economics.emptyMilesConvertedToPaid;
    }
    if (item.economics.actualMileageEliminated != null) {
      actualMileagePotentiallyEliminated += item.economics.actualMileageEliminated;
    }
  }
  return {
    upcomingPotential: opportunities.length,
    postDropoffCount,
    prePickupCount,
    previewPricedCount,
    previewIneligibleCount,
    estimatedAdditionalRevenuePotentialGbp: roundGbp(estimatedAdditionalRevenuePotentialGbp),
    emptyMilesPotentiallyConvertible: roundMiles(emptyMilesPotentiallyConvertible),
    actualMileagePotentiallyEliminated: roundMiles(actualMileagePotentiallyEliminated),
  };
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
    waitingTimeCostGbp: null,
    waitingTimeStatus: "unavailable",
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
    "statusLabel",
    "parentBookingId",
    "parentTripDate",
    "parentTripTime",
    "parentDirection",
    "parentCorridor",
    "opportunityDirection",
    "opportunityCorridor",
    "windowStartLocal",
    "windowEndLocal",
    "estimatedDurationMinutes",
    "estimatedEmptyMiles",
    "normalJourneyFareGbp",
    "normalTotalFareGbp",
    "suggestedJourneyFareGbp",
    "suggestedTotalFareGbp",
    "suggestedSavingGbp",
    "effectiveDiscountPercent",
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
    "waitingTimeCostGbp",
    "waitingTimeStatus",
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
      item.statusLabel,
      item.parentBookingId,
      item.parentTripDate,
      item.parentTripTime,
      item.parentDirectionLabel,
      item.parentCorridor,
      item.opportunityDirectionLabel,
      item.opportunityCorridor,
      item.windowStartLocal,
      item.windowEndLocal,
      item.estimatedDurationMinutes,
      item.estimatedEmptyMiles,
      item.normalJourneyFareGbp,
      item.normalTotalFareGbp,
      item.suggestedJourneyFareGbp,
      item.suggestedTotalFareGbp,
      item.suggestedSavingGbp,
      item.effectiveDiscountPercent,
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
      item.economics.waitingTimeCostGbp,
      item.economics.waitingTimeStatus,
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
    const normalTotal = journeyFare != null ? roundGbp(journeyFare + airportFixed) : null;
    return {
      id: `return:${parent.id}`,
      type: "post_dropoff_return",
      status: "preview_ineligible",
      statusLabel: "Preview ineligible — estimate only",
      parentBookingId: parent.id,
      parentTripDate: parent.tripDate,
      parentTripTime: parent.tripTime,
      parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
      opportunityDirectionLabel: shortCorridor(
        parent.dropoffLabel,
        parent.pickupLabel,
        parent.airportCode,
      ),
      opportunityCorridor: classifyCorridorDirection(
        parent.dropoffLabel,
        parent.pickupLabel,
        parent.airportCode,
      ),
      parentCorridor: classifyCorridorDirection(
        parent.pickupLabel,
        parent.dropoffLabel,
        parent.airportCode,
      ),
      windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
      windowEndLocal: windowEnd ? `${windowEnd.tripDate}T${windowEnd.tripTime}` : null,
      estimatedDurationMinutes: estimateDurationMinutes(parent),
      estimatedEmptyMiles: miles,
      normalJourneyFareGbp: journeyFare,
      normalTotalFareGbp: normalTotal,
      suggestedJourneyFareGbp: null,
      suggestedTotalFareGbp: null,
      suggestedSavingGbp: null,
      effectiveDiscountPercent: null,
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
  const saving = priced ? decision.savingGbp : null;
  return {
    id: `return:${parent.id}`,
    type: "post_dropoff_return",
    status: priced ? "preview_priced" : "preview_ineligible",
    statusLabel: priced
      ? "Preview priced — estimate only"
      : "Preview ineligible — estimate only",
    parentBookingId: parent.id,
    parentTripDate: parent.tripDate,
    parentTripTime: parent.tripTime,
    parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
    opportunityDirectionLabel: shortCorridor(
      parent.dropoffLabel,
      parent.pickupLabel,
      parent.airportCode,
    ),
    opportunityCorridor: classifyCorridorDirection(
      parent.dropoffLabel,
      parent.pickupLabel,
      parent.airportCode,
    ),
    parentCorridor: classifyCorridorDirection(
      parent.pickupLabel,
      parent.dropoffLabel,
      parent.airportCode,
    ),
    windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
    windowEndLocal: windowEnd ? `${windowEnd.tripDate}T${windowEnd.tripTime}` : null,
    estimatedDurationMinutes: estimateDurationMinutes(parent),
    estimatedEmptyMiles: miles,
    normalJourneyFareGbp: decision.normalJourneyFareGbp,
    normalTotalFareGbp: decision.finalNormalFareGbp,
    suggestedJourneyFareGbp: decision.smartJourneyFareGbp,
    suggestedTotalFareGbp: decision.finalSmartFareGbp,
    suggestedSavingGbp: saving,
    effectiveDiscountPercent: effectiveDiscountPercent(saving, decision.finalNormalFareGbp),
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

  const parentCorridor = classifyCorridorDirection(
    parent.pickupLabel,
    parent.dropoffLabel,
    parent.airportCode,
  );
  // Pre-pickup fill travels toward the parent pickup, i.e. same direction as the parent.
  const opportunityCorridor = parentCorridor;
  return {
    id: `positioning:${parent.id}`,
    type: "pre_pickup_positioning",
    status: "unsupported_unpriced",
    statusLabel: PRE_PICKUP_STATUS_LABEL,
    parentBookingId: parent.id,
    parentTripDate: parent.tripDate,
    parentTripTime: parent.tripTime,
    parentDirectionLabel: shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode),
    opportunityDirectionLabel: `Toward parent pickup · ${shortCorridor(parent.pickupLabel, parent.dropoffLabel, parent.airportCode)}`,
    opportunityCorridor,
    parentCorridor,
    windowStartLocal: windowStart ? `${windowStart.tripDate}T${windowStart.tripTime}` : null,
    windowEndLocal: latestFinish ? `${latestFinish.tripDate}T${latestFinish.tripTime}` : null,
    estimatedDurationMinutes: duration,
    estimatedEmptyMiles: miles,
    normalJourneyFareGbp: null,
    normalTotalFareGbp: null,
    suggestedJourneyFareGbp: null,
    suggestedTotalFareGbp: null,
    suggestedSavingGbp: null,
    effectiveDiscountPercent: null,
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
    totals: summariseEmptyLegsTotals(opportunities),
    shadowReasonCounts: summariseShadowReturnReasons(input.shadow || []),
    shadowSampleCount: (input.shadow || []).length,
  };
}

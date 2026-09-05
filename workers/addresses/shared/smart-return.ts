/**
 * Smart Return Pricing — optional discounted fare when a customer fills an
 * otherwise empty return. Uses the existing normal journey fare as the base.
 * Never mutates a confirmed customer price.
 */

import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "./universal-distance-pricing";
import { parseLondonLocalDateTime } from "./uk-time";
import {
  SMART_OPS_REASON,
  type SmartOpsConfig,
  type SmartOpsReasonCode,
} from "./smart-ops-config";
import {
  coordsFromAirportHint,
  estimateDurationMinutes,
  haversineMiles,
  isLongDistanceJourney,
  nextAvailableFrom,
  roadMilesEstimate,
  type SmartCoords,
  type SmartOccupiedJob,
} from "./smart-conflict";

export type SmartReturnParent = SmartOccupiedJob & {
  amountGbp?: number;
  confirmedAt?: string;
  operationalStatus?: string;
  paymentStatus?: string;
};

export type SmartReturnRequest = {
  pickupLabel: string;
  dropoffLabel: string;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  tripDate: string;
  tripTime: string;
  durationMinutes?: number;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  vehicle?: string | null;
  normalJourneyFareGbp: number;
  airportFixedCostsGbp?: number;
  airportAccessChargeGbp?: number;
};

export type SmartReturnLink = {
  id: string;
  parentBookingId: string;
  linkedBookingId?: string;
  linkedFareGbp: number;
  linkedMinGbp: number;
  standaloneMinGbp: number;
  createdAt: string;
};

export type SmartReturnDecision = {
  eligible: boolean;
  reason: SmartOpsReasonCode;
  parentBookingId?: string;
  smartJourneyFareGbp: number | null;
  normalJourneyFareGbp: number;
  savingGbp: number;
  airportFixedCostsGbp: number;
  airportAccessChargeGbp: number;
  finalSmartFareGbp: number | null;
  finalNormalFareGbp: number;
  linkedMinGbp: number;
  standaloneMinGbp: number;
  deviationMiles: number;
  alignment: number;
  estatePremiumGbp: number;
};

export type SmartReturnReassessment = {
  keep: boolean;
  flagOwner: boolean;
  reason: SmartOpsReasonCode;
  customerPriceUnchanged: true;
};

function point(
  explicit: SmartCoords | null | undefined,
  label?: string | null,
  airportCode?: string | null,
): SmartCoords | null {
  if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) return explicit;
  return coordsFromAirportHint(label, airportCode);
}

function bearingDegrees(from: SmartCoords, to: SmartCoords): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function headingDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function pointToSegmentMiles(pointAt: SmartCoords, a: SmartCoords, b: SmartCoords): number {
  const toXY = (p: SmartCoords) => ({
    x: (p.lng - a.lng) * 54.6,
    y: (p.lat - a.lat) * 69,
  });
  const p = toXY(pointAt);
  const end = toXY(b);
  const origin = { x: 0, y: 0 };
  const vx = end.x - origin.x;
  const vy = end.y - origin.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 0.0001) return haversineMiles(pointAt, a);
  let t = ((p.x - origin.x) * vx + (p.y - origin.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  };
  return haversineMiles(pointAt, proj);
}

export function routeAlignment(parent: SmartReturnParent, request: SmartReturnRequest): {
  alignment: number;
  deviationMiles: number;
  parentMiles: number;
} {
  const parentPickup = point(parent.pickup, parent.pickupLabel, parent.airportCode);
  const parentDrop = point(parent.dropoff, parent.dropoffLabel, parent.airportCode);
  const reqPickup = point(request.pickup, request.pickupLabel, request.airportCode);
  const reqDrop = point(request.dropoff, request.dropoffLabel, request.airportCode);
  if (!parentPickup || !parentDrop || !reqPickup || !reqDrop) {
    return { alignment: 0, deviationMiles: 99, parentMiles: 0 };
  }

  const parentMiles = roadMilesEstimate(parentPickup, parentDrop);
  const returnHeading = bearingDegrees(parentDrop, parentPickup);
  const requestHeading = bearingDegrees(reqPickup, reqDrop);
  const headingOk = headingDelta(returnHeading, requestHeading) <= 55;
  const startGap = haversineMiles(reqPickup, parentDrop);
  const dropDeviation = pointToSegmentMiles(reqDrop, parentDrop, parentPickup);
  const alignment = headingOk ? Math.max(0, 1 - dropDeviation / 25) : 0;
  return {
    alignment,
    deviationMiles: Math.max(startGap, dropDeviation),
    parentMiles,
  };
}

export function computeSmartReturnFloors(
  normalJourneyFareGbp: number,
  parentMiles: number,
  config: SmartOpsConfig,
): { linkedMinGbp: number; standaloneMinGbp: number } {
  const minAcceptable = config.smartReturn.minAcceptableFareGbp;
  const longFactor = parentMiles >= 60 ? 0.42 : parentMiles >= 25 ? 0.55 : 0.7;
  const linkedMinGbp = Math.max(minAcceptable, Math.round(normalJourneyFareGbp * longFactor));
  const standaloneMinGbp = Math.max(minAcceptable, Math.round(normalJourneyFareGbp * 0.92));
  return { linkedMinGbp, standaloneMinGbp };
}

function estateAdjusted(journeyGbp: number, vehicle?: string | null): {
  fare: number;
  premium: number;
} {
  const isEstate = String(vehicle || "").toLowerCase().includes("estate");
  if (!isEstate) return { fare: journeyGbp, premium: 0 };
  return { fare: journeyGbp + UNIVERSAL_ESTATE_PREMIUM_GBP, premium: UNIVERSAL_ESTATE_PREMIUM_GBP };
}

export function smartReturnIsReleased(
  parent: SmartReturnParent,
  config: SmartOpsConfig,
  now = new Date(),
): boolean {
  const pickup = parseLondonLocalDateTime(parent.tripDate, parent.tripTime);
  if (!pickup) return false;
  if (config.smartReturn.releaseMode === "immediately") return true;
  const hours =
    config.smartReturn.releaseMode === "hours_before_pickup"
      ? config.smartReturn.releaseHoursBeforePickup
      : config.smartReturn.freeCancelCutoffHours;
  return pickup.getTime() - now.getTime() <= hours * 60 * 60 * 1000;
}

export function evaluateSmartReturn(input: {
  request: SmartReturnRequest;
  parents: SmartReturnParent[];
  config: SmartOpsConfig;
  now?: Date;
  forceEnabled?: boolean;
}): SmartReturnDecision {
  const now = input.now ?? new Date();
  const fees = Number(input.request.airportFixedCostsGbp) || 0;
  const access = Number(input.request.airportAccessChargeGbp) || 0;
  const base = Math.max(0, Number(input.request.normalJourneyFareGbp) || 0);
  const estate = estateAdjusted(base, input.request.vehicle);
  const floors = computeSmartReturnFloors(base, 0, input.config);
  const disabled: SmartReturnDecision = {
    eligible: false,
    reason: SMART_OPS_REASON.SMART_RETURN_DISABLED,
    smartJourneyFareGbp: null,
    normalJourneyFareGbp: estate.fare,
    savingGbp: 0,
    airportFixedCostsGbp: fees,
    airportAccessChargeGbp: access,
    finalSmartFareGbp: null,
    finalNormalFareGbp: Math.round((estate.fare + fees + access) * 100) / 100,
    linkedMinGbp: floors.linkedMinGbp + estate.premium,
    standaloneMinGbp: floors.standaloneMinGbp + estate.premium,
    deviationMiles: 0,
    alignment: 0,
    estatePremiumGbp: estate.premium,
  };

  if (!input.forceEnabled && !input.config.flags.smartReturnPricing) {
    return disabled;
  }

  let best: SmartReturnDecision | null = null;

  for (const parent of input.parents) {
    if (parent.cancelled || parent.operationalStatus === "cancelled") continue;
    if (String(parent.status || "").toLowerCase() === "refunded") continue;
    if (!isLongDistanceJourney(parent) && roadMilesEstimate(
      point(parent.pickup, parent.pickupLabel, parent.airportCode) || { lat: 0, lng: 0 },
      point(parent.dropoff, parent.dropoffLabel, parent.airportCode) || { lat: 0, lng: 0 },
    ) < 12) {
      // Short local outbounds can still create a BFS↔Belfast style return.
    }

    const match = routeAlignment(parent, input.request);
    if (!input.forceEnabled && !input.config.flags.returnCorridorMatching && match.deviationMiles > 4) {
      // Corridor matching off: only allow near-exact reverse (airport ↔ same city).
      if (match.alignment < 0.75) continue;
    }
    if (match.alignment < 0.35) {
      const reject = {
        ...disabled,
        reason: SMART_OPS_REASON.SMART_RETURN_POOR_ALIGNMENT,
        parentBookingId: parent.id,
        deviationMiles: Math.round(match.deviationMiles * 10) / 10,
        alignment: match.alignment,
      };
      if (!best) best = reject;
      continue;
    }
    if (match.deviationMiles > input.config.smartReturn.maxDeviationMiles + 8 && match.alignment < 0.55) {
      const reject = {
        ...disabled,
        reason: SMART_OPS_REASON.SMART_RETURN_ROUTE_DEVIATION_TOO_HIGH,
        parentBookingId: parent.id,
        deviationMiles: Math.round(match.deviationMiles * 10) / 10,
        alignment: match.alignment,
      };
      if (!best || best.reason === SMART_OPS_REASON.SMART_RETURN_POOR_ALIGNMENT) best = reject;
      continue;
    }

    const expected = nextAvailableFrom(parent, input.config);
    const requested = parseLondonLocalDateTime(input.request.tripDate, input.request.tripTime);
    const expectedMs = expected
      ? parseLondonLocalDateTime(expected.local.slice(0, 10), expected.local.slice(11, 16))?.getTime()
      : null;
    if (!requested || expectedMs == null) continue;
    const windowMs = input.config.smartReturn.returnTimeFlexibilityMinutes * 60 * 1000;
    if (Math.abs(requested.getTime() - expectedMs) > windowMs) {
      const reject = {
        ...disabled,
        reason: SMART_OPS_REASON.SMART_RETURN_OUTSIDE_TIME_WINDOW,
        parentBookingId: parent.id,
        deviationMiles: Math.round(match.deviationMiles * 10) / 10,
        alignment: match.alignment,
      };
      if (!best) best = reject;
      continue;
    }

    if (!smartReturnIsReleased(parent, input.config, now)) {
      const reject = {
        ...disabled,
        reason: SMART_OPS_REASON.SMART_RETURN_RELEASE_NOT_OPEN,
        parentBookingId: parent.id,
        deviationMiles: Math.round(match.deviationMiles * 10) / 10,
        alignment: match.alignment,
      };
      if (!best) best = reject;
      continue;
    }

    const parentFloors = computeSmartReturnFloors(base, match.parentMiles, input.config);
    const fill = Math.min(1, Math.max(0.25, match.alignment));
    const lengthBoost = match.parentMiles >= 70 ? 1 : match.parentMiles >= 25 ? 0.65 : 0.4;
    const rawDiscount = base * (input.config.smartReturn.maxDiscountPercent / 100) * fill * lengthBoost;
    const discounted = Math.round((base - rawDiscount) * 100) / 100;
    const smartJourney = Math.max(parentFloors.linkedMinGbp, discounted);
    if (smartJourney < input.config.smartReturn.minAcceptableFareGbp - 0.001) {
      const reject = {
        ...disabled,
        reason: SMART_OPS_REASON.SMART_RETURN_BELOW_MINIMUM,
        parentBookingId: parent.id,
        linkedMinGbp: parentFloors.linkedMinGbp + estate.premium,
        standaloneMinGbp: parentFloors.standaloneMinGbp + estate.premium,
      };
      if (!best) best = reject;
      continue;
    }

    const smartWithEstate = smartJourney + estate.premium;
    const saving = Math.max(0, Math.round((estate.fare - smartWithEstate) * 100) / 100);
    const candidate: SmartReturnDecision = {
      eligible: saving > 0,
      reason: saving > 0 ? SMART_OPS_REASON.SMART_RETURN_ELIGIBLE : SMART_OPS_REASON.SMART_RETURN_BELOW_MINIMUM,
      parentBookingId: parent.id,
      smartJourneyFareGbp: smartWithEstate,
      normalJourneyFareGbp: estate.fare,
      savingGbp: saving,
      airportFixedCostsGbp: fees,
      airportAccessChargeGbp: access,
      finalSmartFareGbp: Math.round((smartWithEstate + fees + access) * 100) / 100,
      finalNormalFareGbp: Math.round((estate.fare + fees + access) * 100) / 100,
      linkedMinGbp: parentFloors.linkedMinGbp + estate.premium,
      standaloneMinGbp: parentFloors.standaloneMinGbp + estate.premium,
      deviationMiles: Math.round(match.deviationMiles * 10) / 10,
      alignment: Math.round(match.alignment * 100) / 100,
      estatePremiumGbp: estate.premium,
    };
    if (!best || (!best.eligible && candidate.eligible) || (best.eligible && candidate.eligible && (candidate.savingGbp > best.savingGbp))) {
      best = candidate;
    }
  }

  return best || disabled;
}

export function reassessSmartReturnAfterParentCancel(input: {
  confirmedLinkedFareGbp: number;
  standaloneMinGbp: number;
}): SmartReturnReassessment {
  const keep = input.confirmedLinkedFareGbp + 0.001 >= input.standaloneMinGbp;
  return {
    keep,
    flagOwner: !keep,
    reason: SMART_OPS_REASON.SMART_RETURN_PARENT_CANCELLED,
    customerPriceUnchanged: true,
  };
}

export function customerSmartReturnCopy(): {
  title: string;
  explanation: string;
} {
  return {
    title: "Smart Return Fare",
    explanation:
      "Special fare available because a vehicle is already returning from this area around your selected time.",
  };
}

export function estimateDurationForParent(parent: SmartReturnParent): number {
  return estimateDurationMinutes(parent);
}

/**
 * Shadow evaluation: run Smart Availability / Smart Return without changing
 * the live quote the customer sees. Logs must not store customer PII.
 */

import type { UnavailablePeriod } from "./booking-notice";
import {
  customerFacingSmartOpsEnabled,
  type SmartOpsConfig,
} from "./smart-ops-config";
import {
  evaluateSmartAvailability,
  type SmartAvailabilityDecision,
  type SmartOccupiedJob,
  type SmartRequestedJourney,
} from "./smart-conflict";
import {
  evaluateSmartReturn,
  type SmartReturnDecision,
  type SmartReturnParent,
} from "./smart-return";
import type { SmartAvailabilityException, SmartAvailabilityRule } from "./smart-availability";

export type SmartShadowRecord = {
  at: string;
  fingerprint: string;
  liveQuoted: boolean;
  liveAmountGbp?: number;
  availability: Pick<
    SmartAvailabilityDecision,
    "available" | "reason" | "alternatives" | "durationMinutes" | "bufferMinutes"
  >;
  smartReturn: Pick<
    SmartReturnDecision,
    "eligible" | "reason" | "smartJourneyFareGbp" | "savingGbp" | "parentBookingId"
  >;
  customerFacingWouldChange: boolean;
};

function fingerprint(request: SmartRequestedJourney, vehicle?: string | null): string {
  return [
    (request.pickupLabel || "").trim().toLowerCase(),
    (request.dropoffLabel || "").trim().toLowerCase(),
    request.tripDate,
    request.tripTime,
    (vehicle || "").trim().toLowerCase(),
  ].join("|");
}

export function evaluateSmartOpsShadow(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  parents?: SmartReturnParent[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  liveQuoted: boolean;
  liveAmountGbp?: number;
  normalJourneyFareGbp?: number;
  now?: Date;
}): SmartShadowRecord {
  const availability = evaluateSmartAvailability({
    requested: input.requested,
    occupied: input.occupied,
    rules: input.rules,
    exceptions: input.exceptions,
    legacyPeriods: input.legacyPeriods,
    config: input.config,
    now: input.now,
  });

  const smartReturn = evaluateSmartReturn({
    request: {
      pickupLabel: input.requested.pickupLabel,
      dropoffLabel: input.requested.dropoffLabel,
      pickup: input.requested.pickup,
      dropoff: input.requested.dropoff,
      tripDate: input.requested.tripDate,
      tripTime: input.requested.tripTime,
      durationMinutes: input.requested.durationMinutes,
      airportCode: input.requested.airportCode,
      isFromAirport: input.requested.isFromAirport,
      vehicle: input.requested.vehicle,
      normalJourneyFareGbp: input.normalJourneyFareGbp ?? input.liveAmountGbp ?? 0,
    },
    parents: input.parents || input.occupied,
    config: input.config,
    now: input.now,
    forceEnabled: true,
  });

  return {
    at: (input.now ?? new Date()).toISOString(),
    fingerprint: fingerprint(input.requested, input.requested.vehicle),
    liveQuoted: input.liveQuoted,
    liveAmountGbp: input.liveAmountGbp,
    availability: {
      available: availability.available,
      reason: availability.reason,
      alternatives: availability.alternatives,
      durationMinutes: availability.durationMinutes,
      bufferMinutes: availability.bufferMinutes,
    },
    smartReturn: {
      eligible: smartReturn.eligible,
      reason: smartReturn.reason,
      smartJourneyFareGbp: smartReturn.smartJourneyFareGbp,
      savingGbp: smartReturn.savingGbp,
      parentBookingId: smartReturn.parentBookingId,
    },
    customerFacingWouldChange:
      customerFacingSmartOpsEnabled(input.config) &&
      (!availability.available || smartReturn.eligible),
  };
}

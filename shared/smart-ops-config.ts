/**
 * Smart Availability + Smart Return Pricing — owner-configurable flags and buffers.
 * Signed-off customer flags: Smart Availability and Alternative Times ON.
 * Smart Return, corridor matching and backup capacity stay OFF. Shadow stays ON.
 */

export const SMART_OPS_REASON = {
  AVAILABLE_NO_CONFLICT: "AVAILABLE_NO_CONFLICT",
  BLOCKED_OWNER_AVAILABILITY: "BLOCKED_OWNER_AVAILABILITY",
  BLOCKED_JOURNEY_OVERLAPS_AVAILABILITY: "BLOCKED_JOURNEY_OVERLAPS_AVAILABILITY",
  BLOCKED_RECURRING_AVAILABILITY: "BLOCKED_RECURRING_AVAILABILITY",
  CONFLICT_EXISTING_BOOKING: "CONFLICT_EXISTING_BOOKING",
  CONFLICT_POSITIONING_TIME: "CONFLICT_POSITIONING_TIME",
  CONFLICT_MINIMUM_TURNAROUND: "CONFLICT_MINIMUM_TURNAROUND",
  CONFLICT_LONG_DISTANCE: "CONFLICT_LONG_DISTANCE",
  CONFLICT_NEXT_BOOKING: "CONFLICT_NEXT_BOOKING",
  ALTERNATIVE_TIME_FOUND: "ALTERNATIVE_TIME_FOUND",
  NO_ALTERNATIVE_TIME: "NO_ALTERNATIVE_TIME",
  NO_ALTERNATIVE_WITHIN_MAX_SHIFT: "NO_ALTERNATIVE_WITHIN_MAX_SHIFT",
  ALTERNATIVE_CROSSES_DATE_DISABLED: "ALTERNATIVE_CROSSES_DATE_DISABLED",
  OWNER_OVERRIDE: "OWNER_OVERRIDE",
  SHADOW_ONLY: "SHADOW_ONLY",
  SMART_RETURN_ELIGIBLE: "SMART_RETURN_ELIGIBLE",
  SMART_RETURN_ROUTE_DEVIATION_TOO_HIGH: "SMART_RETURN_ROUTE_DEVIATION_TOO_HIGH",
  SMART_RETURN_OUTSIDE_TIME_WINDOW: "SMART_RETURN_OUTSIDE_TIME_WINDOW",
  SMART_RETURN_BELOW_MINIMUM: "SMART_RETURN_BELOW_MINIMUM",
  SMART_RETURN_PARENT_CANCELLED: "SMART_RETURN_PARENT_CANCELLED",
  SMART_RETURN_PARENT_CANCELLED_REVIEW_REQUIRED: "SMART_RETURN_PARENT_CANCELLED_REVIEW_REQUIRED",
  SMART_RETURN_DISABLED: "SMART_RETURN_DISABLED",
  SMART_RETURN_RELEASE_NOT_OPEN: "SMART_RETURN_RELEASE_NOT_OPEN",
  SMART_RETURN_POOR_ALIGNMENT: "SMART_RETURN_POOR_ALIGNMENT",
  SMART_AVAILABILITY_DISABLED: "SMART_AVAILABILITY_DISABLED",
} as const;

export type SmartOpsReasonCode = (typeof SMART_OPS_REASON)[keyof typeof SMART_OPS_REASON];

export type DriverCapacityMode = "owner_only" | "owner_plus_backup";

export type SmartReturnReleaseMode =
  | "immediately"
  | "inside_free_cancel_cutoff"
  | "hours_before_pickup";

export type SmartOpsFeatureFlags = {
  /** When false (default), customer bookings ignore the new conflict engine. */
  smartAvailability: boolean;
  alternativeTimeSuggestions: boolean;
  smartReturnPricing: boolean;
  returnCorridorMatching: boolean;
  backupDriverCapacity: boolean;
  /** Run the new engine and record a compact comparison without changing quotes. */
  shadowMode: boolean;
};

export type SmartOpsBuffers = {
  shortJourneyBufferMinutes: 15 | 30 | 45;
  longDistanceBufferMinutes: 30 | 45 | 60;
  airportPickupBufferMinutes: number;
  /** Gap required between one booking finishing and the next starting. */
  minTurnaroundMinutes: 5 | 10 | 15 | 20;
  /**
   * Extra minutes after a personal unavailable period. Default 0 — a block
   * ending at 15:00 does not automatically reject a 15:00 pickup.
   */
  postPersonalBlockTurnaroundMinutes: number;
};

export type SmartAlternativeSettings = {
  maxShiftMinutes: 30 | 45 | 60 | 90;
  allowAcrossMidnight: boolean;
};

export type SmartReturnSettings = {
  maxDiscountPercent: number;
  minAcceptableFareGbp: number;
  returnTimeFlexibilityMinutes: number;
  maxDeviationMiles: number;
  releaseMode: SmartReturnReleaseMode;
  releaseHoursBeforePickup: number;
  freeCancelCutoffHours: number;
};

export type SmartOpsConfig = {
  flags: SmartOpsFeatureFlags;
  buffers: SmartOpsBuffers;
  alternatives: SmartAlternativeSettings;
  smartReturn: SmartReturnSettings;
  driverCapacity: DriverCapacityMode;
  updatedAt: string;
};

/** Production customer flags after owner sign-off. Other customer engines stay off. */
export const SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS: SmartOpsFeatureFlags = {
  smartAvailability: true,
  alternativeTimeSuggestions: true,
  smartReturnPricing: false,
  returnCorridorMatching: false,
  backupDriverCapacity: false,
  shadowMode: true,
};

export function applySignedOffCustomerSmartOpsFlags(config: SmartOpsConfig): SmartOpsConfig {
  return {
    ...config,
    flags: { ...SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS },
  };
}

export function customerSmartOpsFlagsMatchSignedOff(flags: SmartOpsFeatureFlags): boolean {
  return (
    flags.smartAvailability === SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.smartAvailability &&
    flags.alternativeTimeSuggestions ===
      SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.alternativeTimeSuggestions &&
    flags.smartReturnPricing === SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.smartReturnPricing &&
    flags.returnCorridorMatching === SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.returnCorridorMatching &&
    flags.backupDriverCapacity === SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.backupDriverCapacity &&
    flags.shadowMode === SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS.shadowMode
  );
}

export const DEFAULT_SMART_OPS_CONFIG: SmartOpsConfig = {
  flags: { ...SIGNED_OFF_CUSTOMER_SMART_OPS_FLAGS },
  buffers: {
    shortJourneyBufferMinutes: 15,
    longDistanceBufferMinutes: 45,
    airportPickupBufferMinutes: 30,
    minTurnaroundMinutes: 10,
    postPersonalBlockTurnaroundMinutes: 0,
  },
  alternatives: {
    maxShiftMinutes: 60,
    allowAcrossMidnight: false,
  },
  smartReturn: {
    maxDiscountPercent: 35,
    minAcceptableFareGbp: 40,
    returnTimeFlexibilityMinutes: 45,
    maxDeviationMiles: 10,
    releaseMode: "inside_free_cancel_cutoff",
    releaseHoursBeforePickup: 24,
    freeCancelCutoffHours: 24,
  },
  driverCapacity: "owner_only",
  updatedAt: new Date(0).toISOString(),
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asBuffer<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  const n = Number(value);
  return (allowed as readonly number[]).includes(n) ? (n as T) : fallback;
}

export function normalizeSmartOpsConfig(raw: unknown): SmartOpsConfig {
  const input = raw && typeof raw === "object" ? (raw as Partial<SmartOpsConfig>) : {};
  const flags = (input.flags && typeof input.flags === "object" ? input.flags : {}) as Partial<
    SmartOpsFeatureFlags
  >;
  const buffers = (input.buffers && typeof input.buffers === "object" ? input.buffers : {}) as Partial<
    SmartOpsBuffers
  >;
  const alternatives = (
    input.alternatives && typeof input.alternatives === "object" ? input.alternatives : {}
  ) as Partial<SmartAlternativeSettings>;
  const smartReturn = (
    input.smartReturn && typeof input.smartReturn === "object" ? input.smartReturn : {}
  ) as Partial<SmartReturnSettings>;

  const releaseMode: SmartReturnReleaseMode =
    smartReturn.releaseMode === "immediately" ||
    smartReturn.releaseMode === "hours_before_pickup" ||
    smartReturn.releaseMode === "inside_free_cancel_cutoff"
      ? smartReturn.releaseMode
      : DEFAULT_SMART_OPS_CONFIG.smartReturn.releaseMode;

  return {
    flags: {
      smartAvailability: flags.smartAvailability === true,
      alternativeTimeSuggestions: flags.alternativeTimeSuggestions === true,
      smartReturnPricing: flags.smartReturnPricing === true,
      returnCorridorMatching: flags.returnCorridorMatching === true,
      backupDriverCapacity: flags.backupDriverCapacity === true,
      shadowMode: flags.shadowMode !== false,
    },
    buffers: {
      shortJourneyBufferMinutes: asBuffer(buffers.shortJourneyBufferMinutes, [15, 30, 45], 15),
      longDistanceBufferMinutes: asBuffer(buffers.longDistanceBufferMinutes, [30, 45, 60], 45),
      airportPickupBufferMinutes: clampNumber(buffers.airportPickupBufferMinutes, 30, 10, 90),
      minTurnaroundMinutes: asBuffer(buffers.minTurnaroundMinutes, [5, 10, 15, 20], 10),
      postPersonalBlockTurnaroundMinutes: clampNumber(
        buffers.postPersonalBlockTurnaroundMinutes,
        0,
        0,
        60,
      ),
    },
    alternatives: {
      maxShiftMinutes: asBuffer(alternatives.maxShiftMinutes, [30, 45, 60, 90], 60),
      allowAcrossMidnight: alternatives.allowAcrossMidnight === true,
    },
    smartReturn: {
      maxDiscountPercent: clampNumber(smartReturn.maxDiscountPercent, 35, 5, 70),
      minAcceptableFareGbp: clampNumber(smartReturn.minAcceptableFareGbp, 40, 20, 400),
      returnTimeFlexibilityMinutes: clampNumber(
        smartReturn.returnTimeFlexibilityMinutes,
        45,
        15,
        180,
      ),
      maxDeviationMiles: clampNumber(smartReturn.maxDeviationMiles, 10, 3, 40),
      releaseMode,
      releaseHoursBeforePickup: clampNumber(smartReturn.releaseHoursBeforePickup, 24, 1, 168),
      freeCancelCutoffHours: clampNumber(smartReturn.freeCancelCutoffHours, 24, 1, 72),
    },
    driverCapacity:
      input.driverCapacity === "owner_plus_backup" ? "owner_plus_backup" : "owner_only",
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

export function customerFacingSmartOpsEnabled(config: SmartOpsConfig): boolean {
  return (
    config.flags.smartAvailability ||
    config.flags.alternativeTimeSuggestions ||
    config.flags.smartReturnPricing
  );
}

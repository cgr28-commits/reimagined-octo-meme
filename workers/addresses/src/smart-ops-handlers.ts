/**
 * Owner Smart Availability / Smart Return APIs.
 * Customer quote responses are never rewritten here.
 */

import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { listPaidBookingsForTripRange, listUpcomingPaidBookings } from "./paid-booking-store";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { addDaysYmd, londonYmd } from "../shared/upcoming-jobs";
import {
  normalizeSmartOpsConfig,
  type SmartOpsConfig,
} from "../shared/smart-ops-config";
import {
  buildQuickBlockRule,
  clearActiveQuickBlocks,
  expandSmartAvailabilityIntervals,
  generateSmartRuleId,
  normalizeSmartAvailabilityException,
  normalizeSmartAvailabilityRule,
  type SmartAvailabilityException,
  type SmartAvailabilityRule,
} from "../shared/smart-availability";
import {
  customerAvailabilityMessage,
  evaluateSmartAvailability,
  occupiedJobsFromPaidBooking,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";
import {
  evaluateSmartReturn,
  reassessSmartReturnAfterParentCancel,
  type SmartReturnParent,
} from "../shared/smart-return";
import { evaluateSmartOpsShadow } from "../shared/smart-shadow";
import {
  customerSmartAvailabilityPreviewRequested as previewRequestedFromRequest,
  decideCustomerSmartAvailabilityGate,
  shouldEnforceCustomerSmartAvailability,
  type CustomerBookingAvailabilityInput,
  type CustomerSmartAvailabilityGate,
} from "../shared/customer-smart-availability";
import { getBookingSettings } from "./booking-settings-store";
import {
  appendSmartShadowRecord,
  getSmartOpsState,
  listSmartShadowRecords,
  reassessSmartReturnsForCancelledParent,
  saveSmartOpsState,
} from "./smart-ops-store";

export type SmartOpsEnv = DriverAuthEnv & {
  TRACKING_STORE: KVNamespace;
};

function unauthorized(): { error: string; status: number } {
  return { error: "Unauthorized", status: 401 };
}

export function paidBookingToOccupiedJob(booking: PaidBookingRecord): SmartOccupiedJob | null {
  return occupiedJobsFromPaidBooking(booking)[0] || null;
}

export function paidBookingToParent(booking: PaidBookingRecord): SmartReturnParent | null {
  const job = paidBookingToOccupiedJob(booking);
  if (!job) return null;
  return {
    ...job,
    amountGbp: booking.amount,
    confirmedAt: booking.createdAt,
    operationalStatus: booking.operationalStatus,
    paymentStatus: booking.paymentStatus,
  };
}

async function loadOccupied(
  store: KVNamespace,
  range?: { fromYmd: string; toYmd: string },
): Promise<{
  occupied: SmartOccupiedJob[];
  parents: SmartReturnParent[];
}> {
  const from = range?.fromYmd || addDaysYmd(londonYmd(), -2);
  const to = range?.toYmd || addDaysYmd(londonYmd(), 180);
  const [ranged, upcoming] = await Promise.all([
    listPaidBookingsForTripRange(store, from, to, { limit: 400 }),
    listUpcomingPaidBookings(store, { pastDays: 7, futureDays: 180, limit: 250 }),
  ]);
  const bookings = new Map<string, PaidBookingRecord>();
  for (const booking of [...ranged, ...upcoming]) {
    bookings.set(booking.paymentReference, booking);
  }
  const occupied: SmartOccupiedJob[] = [];
  const parents: SmartReturnParent[] = [];
  for (const booking of bookings.values()) {
    const jobs = occupiedJobsFromPaidBooking(booking);
    occupied.push(...jobs);
    const parent = paidBookingToParent(booking);
    if (parent) parents.push(parent);
  }
  return { occupied, parents };
}

/**
 * Customer payment/quote gate. Flag OFF and non-preview → allow.
 * Fail-open on unexpected errors so quoting/payment cannot break.
 */
export async function enforceCustomerSmartAvailabilityGate(input: {
  store?: KVNamespace;
  booking: CustomerBookingAvailabilityInput;
  origin?: string | null;
  previewRequested?: boolean;
  now?: Date;
}): Promise<CustomerSmartAvailabilityGate> {
  const allow: CustomerSmartAvailabilityGate = {
    enforce: false,
    available: true,
    blocked: false,
    customerMessage: null,
    reason: null,
    decision: null,
  };
  if (!input.store) return allow;
  try {
    const state = await getSmartOpsState(input.store);
    const enforce = shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: state.config.flags.smartAvailability === true,
      origin: input.origin,
      previewRequested: input.previewRequested === true,
    });
    if (!enforce) return allow;
    const settings = await getBookingSettings(input.store);
    const tripDate = String(input.booking.tripDate || "");
    const { occupied } = await loadOccupied(input.store, {
      fromYmd: addDaysYmd(tripDate || londonYmd(), -3),
      toYmd: addDaysYmd(tripDate || londonYmd(), 3),
    });
    return decideCustomerSmartAvailabilityGate({
      enforce: true,
      booking: input.booking,
      occupied,
      rules: state.rules,
      exceptions: state.exceptions,
      legacyPeriods: settings.unavailablePeriods,
      config: state.config,
      now: input.now,
    });
  } catch {
    return allow;
  }
}

export function customerSmartAvailabilityPreviewRequested(request: Request): boolean {
  return previewRequestedFromRequest({
    headers: request.headers,
    url: request.url,
  });
}

export function isOwnerSmartOpsPath(pathname: string): boolean {
  return (
    pathname === "/owner/smart-ops" ||
    pathname === "/api/owner/smart-ops" ||
    pathname === "/owner/smart-ops/evaluate" ||
    pathname === "/api/owner/smart-ops/evaluate" ||
    pathname === "/owner/smart-ops/calendar" ||
    pathname === "/api/owner/smart-ops/calendar" ||
    pathname === "/owner/smart-ops/shadow" ||
    pathname === "/api/owner/smart-ops/shadow"
  );
}

export async function handleOwnerGetSmartOps(request: Request, env: SmartOpsEnv) {
  if (!ownerAuthorized(request, env)) return unauthorized();
  const state = await getSmartOpsState(env.TRACKING_STORE);
  const shadow = await listSmartShadowRecords(env.TRACKING_STORE);
  return { ok: true, state, shadow };
}

export async function handleOwnerSaveSmartOps(
  request: Request,
  env: SmartOpsEnv,
  body: Record<string, unknown>,
) {
  if (!ownerAuthorized(request, env)) return unauthorized();
  const current = await getSmartOpsState(env.TRACKING_STORE);
  const action = String(body.action || "save_config");

  if (action === "save_config") {
    const incoming = body.config && typeof body.config === "object" ? body.config : {};
    const incomingFlags =
      incoming && typeof incoming === "object" && "flags" in incoming && incoming.flags && typeof incoming.flags === "object"
        ? (incoming.flags as Record<string, unknown>)
        : {};
    const config = normalizeSmartOpsConfig({
      ...current.config,
      ...incoming,
      flags: {
        ...current.config.flags,
        ...incomingFlags,
        // Locked until this draft is signed off. Owner Test Tool still evaluates fully.
        smartAvailability: false,
        alternativeTimeSuggestions: false,
        smartReturnPricing: false,
        returnCorridorMatching: false,
        backupDriverCapacity: false,
        shadowMode: true,
      },
      updatedAt: new Date().toISOString(),
    });
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, config });
    const triedCustomerOn =
      incomingFlags.smartAvailability === true ||
      incomingFlags.alternativeTimeSuggestions === true ||
      incomingFlags.smartReturnPricing === true ||
      incomingFlags.returnCorridorMatching === true ||
      incomingFlags.backupDriverCapacity === true;
    return {
      ok: true,
      state,
      locked:
        triedCustomerOn || incomingFlags.shadowMode === false
          ? "Customer-facing Smart Availability, Alternative Times, Smart Return, corridor matching and backup capacity stay OFF. Shadow mode stays ON."
          : undefined,
    };
  }

  if (action === "quick_block") {
    const kind = body.kind === "rest_of_today" || body.kind === "whole_day" ? body.kind : "hours";
    const hours = Number(body.hours) || 1;
    const rule = buildQuickBlockRule(kind, hours);
    if (!rule) return { error: "Could not create quick block", status: 400 };
    const state = await saveSmartOpsState(env.TRACKING_STORE, {
      ...current,
      rules: [...current.rules, rule],
    });
    return { ok: true, state, rule };
  }

  if (action === "available_now") {
    const rules = clearActiveQuickBlocks(current.rules, new Date());
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, rules });
    return { ok: true, state };
  }

  if (action === "save_rule") {
    const rule = normalizeSmartAvailabilityRule(body.rule as Partial<SmartAvailabilityRule>);
    if (!rule) return { error: "Invalid availability rule", status: 400 };
    const exists = current.rules.some((item) => item.id === rule.id);
    const rules = exists
      ? current.rules.map((item) => (item.id === rule.id ? rule : item))
      : [...current.rules, rule];
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, rules });
    return { ok: true, state, rule };
  }

  if (action === "delete_rule") {
    const id = String(body.id || "").trim();
    const state = await saveSmartOpsState(env.TRACKING_STORE, {
      ...current,
      rules: current.rules.filter((rule) => rule.id !== id),
      exceptions: current.exceptions.filter((item) => item.ruleId !== id),
    });
    return { ok: true, state };
  }

  if (action === "toggle_rule") {
    const id = String(body.id || "").trim();
    const state = await saveSmartOpsState(env.TRACKING_STORE, {
      ...current,
      rules: current.rules.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled, updatedAt: new Date().toISOString() } : rule,
      ),
    });
    return { ok: true, state };
  }

  if (action === "save_exception") {
    const exception = normalizeSmartAvailabilityException({
      ...(body.exception as Partial<SmartAvailabilityException>),
      id: (body.exception as { id?: string } | undefined)?.id || generateSmartRuleId("ex"),
    });
    if (!exception) return { error: "Invalid exception", status: 400 };
    const exists = current.exceptions.some((item) => item.id === exception.id);
    const exceptions = exists
      ? current.exceptions.map((item) => (item.id === exception.id ? exception : item))
      : [...current.exceptions, exception];
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, exceptions });
    return { ok: true, state, exception };
  }

  if (action === "delete_exception") {
    const id = String(body.id || "").trim();
    const state = await saveSmartOpsState(env.TRACKING_STORE, {
      ...current,
      exceptions: current.exceptions.filter((item) => item.id !== id),
    });
    return { ok: true, state };
  }

  if (action === "reassess_link") {
    const parentId = String(body.parentBookingId || "").trim();
    const automatic = await reassessSmartReturnsForCancelledParent(env.TRACKING_STORE, parentId);
    const refreshed = await getSmartOpsState(env.TRACKING_STORE);
    const flagged = refreshed.links
      .filter((link) => link.parentBookingId === parentId)
      .map((link) => ({
        link,
        reassessment: reassessSmartReturnAfterParentCancel({
          confirmedLinkedFareGbp: link.linkedFareGbp,
          standaloneMinGbp: link.standaloneMinGbp,
        }),
      }));
    return { ok: true, state: refreshed, flagged, automatic };
  }

  return { error: "Unknown action", status: 400 };
}

export async function handleOwnerEvaluateSmartOps(
  request: Request,
  env: SmartOpsEnv,
  body: Record<string, unknown>,
) {
  if (!ownerAuthorized(request, env)) return unauthorized();
  const state = await getSmartOpsState(env.TRACKING_STORE);
  const settings = await getBookingSettings(env.TRACKING_STORE);
  const tripDate = String(body.tripDate || londonYmd());
  const { occupied, parents } = await loadOccupied(env.TRACKING_STORE, {
    fromYmd: addDaysYmd(tripDate, -3),
    toYmd: addDaysYmd(tripDate, 3),
  });
  const requested = {
    pickupLabel: String(body.pickupLabel || ""),
    dropoffLabel: String(body.dropoffLabel || ""),
    tripDate,
    tripTime: String(body.tripTime || ""),
    vehicle: String(body.vehicle || "Saloon"),
    airportCode: body.airportCode ? String(body.airportCode) : null,
    isFromAirport: body.isFromAirport === true,
    durationMinutes: Number(body.durationMinutes) || undefined,
    pickup:
      Number.isFinite(Number(body.pickupLat)) && Number.isFinite(Number(body.pickupLng))
        ? { lat: Number(body.pickupLat), lng: Number(body.pickupLng) }
        : undefined,
    dropoff:
      Number.isFinite(Number(body.dropoffLat)) && Number.isFinite(Number(body.dropoffLng))
        ? { lat: Number(body.dropoffLat), lng: Number(body.dropoffLng) }
        : undefined,
  };
  const config: SmartOpsConfig = state.config;
  const availability = evaluateSmartAvailability({
    requested,
    occupied,
    rules: state.rules,
    exceptions: state.exceptions,
    legacyPeriods: settings.unavailablePeriods,
    config,
    ownerOverride: body.ownerOverride === true,
  });
  const smartReturn = evaluateSmartReturn({
    request: {
      ...requested,
      normalJourneyFareGbp: Number(body.normalJourneyFareGbp) || 0,
      airportFixedCostsGbp: Number(body.airportFixedCostsGbp) || 0,
      airportAccessChargeGbp: Number(body.airportAccessChargeGbp) || 0,
    },
    parents,
    config,
    forceEnabled: true,
  });
  const previous = occupied.find((job) => job.id === availability.diagnostics.previousBookingId);
  const next = occupied.find((job) => job.id === availability.diagnostics.nextBookingId);
  return {
    ok: true,
    availability,
    smartReturn,
    occupiedCount: occupied.length,
    occupiedJobs: occupied,
    customerMessage: customerAvailabilityMessage(availability, requested.tripTime),
    diagnostics: {
      requestedPickup: availability.diagnostics.requestedPickupLocal,
      estimatedJourneyDuration: availability.diagnostics.estimatedJourneyDurationMinutes,
      estimatedCompletion: availability.diagnostics.estimatedCompletionLocal,
      operationalBuffer: availability.bufferMinutes,
      minTurnaround: availability.diagnostics.minTurnaroundMinutes,
      expectedFinishingLocation: availability.diagnostics.expectedFinishingLocation,
      previousBooking: previous
        ? { id: previous.id, tripDate: previous.tripDate, tripTime: previous.tripTime, label: `${previous.pickupLabel} → ${previous.dropoffLabel}` }
        : null,
      previousBookingPickupLocal: availability.diagnostics.previousBookingPickupLocal,
      previousBookingTripDate: availability.diagnostics.previousBookingTripDate,
      previousBookingTripTime: availability.diagnostics.previousBookingTripTime,
      previousBookingDurationMinutes: availability.diagnostics.previousBookingDurationMinutes,
      previousBookingCompletionLocal: availability.diagnostics.previousBookingCompletionLocal,
      previousBookingDestination: availability.diagnostics.previousBookingDestination,
      previousBookingOperationalEndLocal: availability.diagnostics.previousBookingOperationalEndLocal,
      previousPositioningNeededMinutes: availability.diagnostics.previousPositioningNeededMinutes,
      earliestReadyAfterPreviousLocal: availability.diagnostics.earliestReadyAfterPreviousLocal,
      earliestBookablePassengerLocal: availability.diagnostics.earliestBookablePassengerLocal,
      proposedAirportBufferMinutes: availability.diagnostics.proposedAirportBufferMinutes,
      proposedOnSiteDeadlineLocal: availability.diagnostics.proposedOnSiteDeadlineLocal,
      conflictBookingId: availability.diagnostics.conflictBookingId,
      conflictKind: availability.diagnostics.conflictKind,
      conflictSummary: availability.diagnostics.conflictSummary,
      nextBooking: next
        ? { id: next.id, tripDate: next.tripDate, tripTime: next.tripTime, label: `${next.pickupLabel} → ${next.dropoffLabel}` }
        : null,
      previousPositioningMinutes: availability.diagnostics.previousPositioningMinutes,
      nextPositioningMinutes: availability.diagnostics.nextPositioningMinutes,
      positioningMinutes: availability.diagnostics.positioningMinutes,
      positioningFrom: availability.diagnostics.positioningFromLabel,
      positioningTo: availability.diagnostics.positioningToLabel,
      positioningFromCoords: availability.diagnostics.positioningFromCoords,
      positioningToCoords: availability.diagnostics.positioningToCoords,
      positioningCoordsKnown: availability.diagnostics.positioningCoordsKnown,
      positioningTravelMinutes: availability.diagnostics.positioningTravelMinutes,
      positioningNeededMinutes: availability.diagnostics.positioningNeededMinutes,
      positioningGapMinutes: availability.diagnostics.positioningGapMinutes,
      earliestReadyLocal: availability.diagnostics.earliestReadyLocal,
      nextPickupLocal: availability.diagnostics.nextPickupLocal,
      nextBookingTripDate: availability.diagnostics.nextBookingTripDate,
      nextBookingTripTime: availability.diagnostics.nextBookingTripTime,
      nextBookingResolvedLocal: availability.diagnostics.nextBookingResolvedLocal,
      proposedPickupResolvedLocal: availability.diagnostics.proposedPickupResolvedLocal,
      proposedCompletionResolvedLocal: availability.diagnostics.proposedCompletionResolvedLocal,
      comparisonFromLocal: availability.diagnostics.comparisonFromLocal,
      comparisonToLocal: availability.diagnostics.comparisonToLocal,
      sameCalendarDayAsNext: availability.diagnostics.sameCalendarDayAsNext,
      blockedTimeOverlap: availability.diagnostics.blockedTimeOverlap,
      blockingInterval: availability.diagnostics.blockingInterval,
      available: availability.available,
      reason: availability.reason,
      alternativeReason: availability.alternativeReason,
      suggestedAlternatives: availability.alternatives,
      normalFare: Number(body.normalJourneyFareGbp) || 0,
      smartReturnEligible: smartReturn.eligible,
      smartReturnParent: smartReturn.parentBookingId || null,
      smartReturnFare: smartReturn.finalSmartFareGbp,
      saving: smartReturn.savingGbp,
      returnRouteDeviation: smartReturn.deviationMiles,
    },
    config,
    customerFacingFlagsOff: {
      smartAvailability: config.flags.smartAvailability,
      alternativeTimeSuggestions: config.flags.alternativeTimeSuggestions,
      smartReturnPricing: config.flags.smartReturnPricing,
    },
  };
}

export async function handleOwnerSmartOpsCalendar(request: Request, env: SmartOpsEnv) {
  if (!ownerAuthorized(request, env)) return unauthorized();
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || londonYmd();
  const to = url.searchParams.get("to") || addDaysYmd(from, 6);
  const state = await getSmartOpsState(env.TRACKING_STORE);
  const settings = await getBookingSettings(env.TRACKING_STORE);
  const { occupied, parents } = await loadOccupied(env.TRACKING_STORE, {
    fromYmd: addDaysYmd(from, -1),
    toYmd: addDaysYmd(to, 1),
  });
  const intervals = expandSmartAvailabilityIntervals({
    rules: state.rules,
    exceptions: state.exceptions,
    fromYmd: from,
    toYmd: to,
    legacyPeriods: settings.unavailablePeriods,
  });
  const bookings = occupied
    .filter((job) => job.tripDate >= from && job.tripDate <= to)
    .map((job) => ({
      id: job.id,
      tripDate: job.tripDate,
      tripTime: job.tripTime,
      status: "booked" as const,
    }));
  return {
    ok: true,
    from,
    to,
    bookings,
    unavailable: intervals.map((interval) => ({
      ruleId: interval.ruleId,
      startLocal: interval.startLocal,
      endLocal: interval.endLocal,
      recurring: interval.recurring,
      status: "unavailable" as const,
    })),
    opportunities: state.config.flags.shadowMode
      ? parents
          .filter((parent) => parent.tripDate >= addDaysYmd(from, -1) && parent.tripDate <= to)
          .slice(0, 12)
          .map((parent) => ({
            parentId: parent.id,
            tripDate: parent.tripDate,
            tripTime: parent.tripTime,
            status: "return_opportunity" as const,
          }))
      : [],
  };
}

export async function recordQuoteShadowSafely(input: {
  store?: KVNamespace;
  requested: {
    pickupLabel: string;
    dropoffLabel: string;
    tripDate: string;
    tripTime: string;
    vehicle?: string | null;
    airportCode?: string | null;
    isFromAirport?: boolean | null;
    durationMinutes?: number;
  };
  liveQuoted: boolean;
  liveAmountGbp?: number;
}): Promise<void> {
  if (!input.store) return;
  try {
    const state = await getSmartOpsState(input.store);
    if (!state.config.flags.shadowMode) return;
    const settings = await getBookingSettings(input.store);
    const requestedDate = input.requested.tripDate || londonYmd();
    const { occupied, parents } = await loadOccupied(input.store, {
      fromYmd: addDaysYmd(requestedDate, -3),
      toYmd: addDaysYmd(requestedDate, 3),
    });
    const record = evaluateSmartOpsShadow({
      requested: input.requested,
      occupied,
      parents,
      rules: state.rules,
      exceptions: state.exceptions,
      legacyPeriods: settings.unavailablePeriods,
      config: state.config,
      liveQuoted: input.liveQuoted,
      liveAmountGbp: input.liveAmountGbp,
      normalJourneyFareGbp: input.liveAmountGbp,
    });
    await appendSmartShadowRecord(input.store, record);
  } catch {
    // Fail-open: shadow must never break the live quote.
  }
}

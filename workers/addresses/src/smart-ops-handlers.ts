/**
 * Owner Smart Availability / Smart Return APIs.
 * Customer quote responses are never rewritten here.
 */

import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { listPaidBookingsCreatedSince } from "./paid-booking-store";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { addDaysYmd, londonYmd } from "../shared/upcoming-jobs";
import {
  normalizeSmartOpsConfig,
  type SmartOpsConfig,
} from "../shared/smart-ops-config";
import {
  buildQuickBlockRule,
  expandSmartAvailabilityIntervals,
  generateSmartRuleId,
  normalizeSmartAvailabilityException,
  normalizeSmartAvailabilityRule,
  type SmartAvailabilityException,
  type SmartAvailabilityRule,
} from "../shared/smart-availability";
import {
  evaluateSmartAvailability,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";
import {
  evaluateSmartReturn,
  reassessSmartReturnAfterParentCancel,
  type SmartReturnParent,
} from "../shared/smart-return";
import { evaluateSmartOpsShadow } from "../shared/smart-shadow";
import { getBookingSettings } from "./booking-settings-store";
import {
  appendSmartShadowRecord,
  getSmartOpsState,
  listSmartShadowRecords,
  saveSmartOpsState,
} from "./smart-ops-store";

export type SmartOpsEnv = DriverAuthEnv & {
  TRACKING_STORE: KVNamespace;
};

function unauthorized(): { error: string; status: number } {
  return { error: "Unauthorized", status: 401 };
}

function parseDurationMinutes(value?: string | null): number {
  if (!value) return 0;
  const hours = value.match(/(\d+)\s*h/);
  const mins = value.match(/(\d+)\s*m/);
  const hourN = hours ? Number(hours[1]) : 0;
  const minN = mins ? Number(mins[1]) : 0;
  if (hourN || minN) return hourN * 60 + minN;
  const plain = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(plain) && plain > 0 && plain < 400 ? Math.round(plain) : 0;
}

export function paidBookingToOccupiedJob(booking: PaidBookingRecord): SmartOccupiedJob | null {
  if (booking.operationalStatus === "cancelled" || booking.status === "cancelled") return null;
  if (booking.isRefundTest || booking.isAmendmentTestFixture) return null;
  return {
    id: booking.paymentReference,
    pickupLabel: booking.pickupLabel || "",
    dropoffLabel: booking.dropoffLabel || "",
    tripDate: booking.tripDate || "",
    tripTime: booking.tripTime || "",
    durationMinutes: parseDurationMinutes(booking.journeyDuration),
    airportCode: booking.airportCode,
    isFromAirport: booking.isFromAirport,
    cancelled: false,
    status: booking.status,
  };
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

async function loadOccupied(store: KVNamespace): Promise<{
  occupied: SmartOccupiedJob[];
  parents: SmartReturnParent[];
}> {
  const from = addDaysYmd(londonYmd(), -90);
  const bookings = await listPaidBookingsCreatedSince(store, from, { limit: 400 });
  const occupied: SmartOccupiedJob[] = [];
  const parents: SmartReturnParent[] = [];
  for (const booking of bookings) {
    const job = paidBookingToOccupiedJob(booking);
    const parent = paidBookingToParent(booking);
    if (job) occupied.push(job);
    if (parent) parents.push(parent);
  }
  return { occupied, parents };
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
    const config = normalizeSmartOpsConfig({
      ...current.config,
      ...(body.config && typeof body.config === "object" ? body.config : {}),
      updatedAt: new Date().toISOString(),
    });
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, config });
    return { ok: true, state };
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
    const now = new Date();
    const cleared = current.rules.map((rule) =>
      rule.enabled && (rule.kind === "one_off" || rule.kind === "full_day")
        ? { ...rule, enabled: false, updatedAt: now.toISOString() }
        : rule,
    );
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, rules: cleared });
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
    const links = current.links.map((link) => {
      if (link.parentBookingId !== parentId) return link;
      return link;
    });
    const flagged = current.links
      .filter((link) => link.parentBookingId === parentId)
      .map((link) => ({
        link,
        reassessment: reassessSmartReturnAfterParentCancel({
          confirmedLinkedFareGbp: link.linkedFareGbp,
          standaloneMinGbp: link.standaloneMinGbp,
        }),
      }));
    const state = await saveSmartOpsState(env.TRACKING_STORE, { ...current, links });
    return { ok: true, state, flagged };
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
  const { occupied, parents } = await loadOccupied(env.TRACKING_STORE);
  const requested = {
    pickupLabel: String(body.pickupLabel || ""),
    dropoffLabel: String(body.dropoffLabel || ""),
    tripDate: String(body.tripDate || ""),
    tripTime: String(body.tripTime || ""),
    vehicle: String(body.vehicle || "Saloon"),
    airportCode: body.airportCode ? String(body.airportCode) : null,
    isFromAirport: body.isFromAirport === true,
    durationMinutes: Number(body.durationMinutes) || undefined,
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
  return {
    ok: true,
    availability,
    smartReturn,
    occupiedCount: occupied.length,
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
  const { occupied, parents } = await loadOccupied(env.TRACKING_STORE);
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
    const { occupied, parents } = await loadOccupied(input.store);
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

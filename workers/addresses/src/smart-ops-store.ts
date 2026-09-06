/**
 * KV store for Smart Availability / Smart Return — separate from booking records.
 * Normalize-on-read. No destructive migration of existing bookings.
 */

import {
  applySignedOffCustomerSmartOpsFlags,
  customerSmartOpsFlagsMatchSignedOff,
  DEFAULT_SMART_OPS_CONFIG,
  normalizeSmartOpsConfig,
  type SmartOpsConfig,
} from "../shared/smart-ops-config";
import {
  normalizeSmartAvailabilityException,
  normalizeSmartAvailabilityRule,
  type SmartAvailabilityException,
  type SmartAvailabilityRule,
} from "../shared/smart-availability";
import {
  reassessSmartReturnAfterParentCancel,
  type SmartReturnLink,
} from "../shared/smart-return";
import type { SmartShadowRecord } from "../shared/smart-shadow";
import {
  getPaidBookingRecord,
  listUpcomingPaidBookings,
  savePaidBookingRecord,
} from "./paid-booking-store";

export type SmartOpsState = {
  config: SmartOpsConfig;
  rules: SmartAvailabilityRule[];
  exceptions: SmartAvailabilityException[];
  links: SmartReturnLink[];
  updatedAt: string;
};

const STATE_KEY = "smart-ops:state";
const SHADOW_KEY = "smart-ops:shadow-log";
const TTL = 60 * 60 * 24 * 365 * 5;
const MAX_RULES = 80;
const MAX_EXCEPTIONS = 120;
const MAX_LINKS = 200;
const MAX_SHADOW = 40;

export function defaultSmartOpsState(): SmartOpsState {
  return {
    config: { ...DEFAULT_SMART_OPS_CONFIG },
    rules: [],
    exceptions: [],
    links: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeSmartOpsState(raw: unknown): SmartOpsState {
  const input = raw && typeof raw === "object" ? (raw as Partial<SmartOpsState>) : {};
  const rules = (Array.isArray(input.rules) ? input.rules : [])
    .map((rule) => normalizeSmartAvailabilityRule(rule))
    .filter((rule): rule is SmartAvailabilityRule => Boolean(rule))
    .slice(0, MAX_RULES);
  const exceptions = (Array.isArray(input.exceptions) ? input.exceptions : [])
    .map((item) => normalizeSmartAvailabilityException(item))
    .filter((item): item is SmartAvailabilityException => Boolean(item))
    .slice(0, MAX_EXCEPTIONS);
  const links = (Array.isArray(input.links) ? input.links : []).slice(0, MAX_LINKS);
  return {
    config: normalizeSmartOpsConfig(input.config),
    rules,
    exceptions,
    links,
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

export async function getSmartOpsState(store: KVNamespace): Promise<SmartOpsState> {
  const raw = await store.get(STATE_KEY, "json");
  const state = raw ? normalizeSmartOpsState(raw) : defaultSmartOpsState();
  if (customerSmartOpsFlagsMatchSignedOff(state.config.flags)) {
    return state;
  }
  return saveSmartOpsState(store, {
    ...state,
    config: applySignedOffCustomerSmartOpsFlags(state.config),
  });
}

export async function saveSmartOpsState(
  store: KVNamespace,
  state: SmartOpsState,
): Promise<SmartOpsState> {
  const normalized = normalizeSmartOpsState({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  await store.put(STATE_KEY, JSON.stringify(normalized), { expirationTtl: TTL });
  return normalized;
}

export async function appendSmartShadowRecord(
  store: KVNamespace,
  record: SmartShadowRecord,
): Promise<void> {
  const raw = await store.get(SHADOW_KEY, "json");
  const current = Array.isArray(raw) ? (raw as SmartShadowRecord[]) : [];
  const next = [record, ...current].slice(0, MAX_SHADOW);
  await store.put(SHADOW_KEY, JSON.stringify(next), { expirationTtl: TTL });
}

export async function listSmartShadowRecords(store: KVNamespace): Promise<SmartShadowRecord[]> {
  const raw = await store.get(SHADOW_KEY, "json");
  return Array.isArray(raw) ? (raw as SmartShadowRecord[]) : [];
}

/**
 * When a parent booking is operationally cancelled, reassess linked Smart Returns.
 * Never changes the confirmed customer price or silently cancels the child.
 */
export async function reassessSmartReturnsForCancelledParent(
  store: KVNamespace,
  parentPaymentRef: string,
): Promise<
  Array<{
    childPaymentRef: string;
    flagOwner: boolean;
    reason: string;
  }>
> {
  const parentRef = parentPaymentRef.trim();
  if (!parentRef) return [];

  const state = await getSmartOpsState(store);
  const upcoming = await listUpcomingPaidBookings(store, {
    pastDays: 2,
    futureDays: 180,
    limit: 250,
  });
  const flagged: Array<{ childPaymentRef: string; flagOwner: boolean; reason: string }> = [];
  const nowIso = new Date().toISOString();

  const childRefs = new Set<string>();
  for (const link of state.links) {
    if (link.parentBookingId === parentRef && link.linkedBookingId) {
      childRefs.add(link.linkedBookingId);
    }
  }
  for (const booking of upcoming) {
    if (booking.smartReturnParentPaymentRef === parentRef) {
      childRefs.add(booking.paymentReference);
    }
  }

  const nextLinks = state.links.map((link) => {
    if (link.parentBookingId !== parentRef) return link;
    return link;
  });

  for (const childRef of childRefs) {
    const child = await getPaidBookingRecord(store, childRef);
    if (!child || child.operationalStatus === "cancelled") continue;
    const linkedFare =
      Number(child.smartReturnLinkedFareGbp) ||
      Number(child.amount) ||
      0;
    const standalone =
      Number(child.smartReturnStandaloneMinGbp) ||
      state.links.find((link) => link.linkedBookingId === childRef)?.standaloneMinGbp ||
      0;
    const reassessment = reassessSmartReturnAfterParentCancel({
      confirmedLinkedFareGbp: linkedFare,
      standaloneMinGbp: standalone,
    });
    await savePaidBookingRecord(store, {
      ...child,
      smartReturnParentCancelledAt: nowIso,
      smartReturnReviewRequired: reassessment.flagOwner ? true : child.smartReturnReviewRequired,
    });
    flagged.push({
      childPaymentRef: childRef,
      flagOwner: reassessment.flagOwner,
      reason: reassessment.reason,
    });
  }

  if (nextLinks.length !== state.links.length) {
    await saveSmartOpsState(store, { ...state, links: nextLinks });
  }

  return flagged;
}

/**
 * Empty Run discount — Worker side. Loads the owner switch and confirmed jobs,
 * then calls the pure engine in shared/empty-run-pricing.ts.
 * Fail-open: any error returns "no discount" so quotes and payments never break.
 */

import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { OPERATING_BASE } from "./operating-base";
import { loadOccupied } from "./smart-ops-handlers";
import { getSmartOpsState } from "./smart-ops-store";
import { getBookingSettings } from "./booking-settings-store";
import { evaluateSmartAvailability } from "../shared/smart-conflict";
import { addDaysYmd } from "../shared/upcoming-jobs";
import {
  EMPTY_RUN_CONFIG_KEY,
  DEFAULT_EMPTY_RUN_SETTINGS,
  evaluateEmptyRunDiscount,
  normalizeEmptyRunSettings,
  type EmptyRunDecision,
  type EmptyRunFare,
  type EmptyRunRequest,
  type EmptyRunSettings,
} from "../shared/empty-run-pricing";

let cached: { at: number; settings: EmptyRunSettings } | null = null;
const CACHE_MS = 30_000;

export async function loadEmptyRunSettings(store: KVNamespace): Promise<EmptyRunSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.settings;
  const raw = await store.get(EMPTY_RUN_CONFIG_KEY, "json").catch(() => null);
  const settings = raw ? normalizeEmptyRunSettings(raw) : { ...DEFAULT_EMPTY_RUN_SETTINGS };
  cached = { at: Date.now(), settings };
  return settings;
}

export async function evaluateEmptyRunSafely(input: {
  store?: KVNamespace;
  request: EmptyRunRequest;
  fare: EmptyRunFare;
  now?: Date;
  /** Preview Worker only (EMPTY_RUN_PREVIEW_FORCE_ON). Never set on production. */
  forceEnabled?: boolean;
}): Promise<EmptyRunDecision | null> {
  try {
    if (!input.store || !input.request.tripDate) return null;
    const stored = await loadEmptyRunSettings(input.store);
    const settings = input.forceEnabled ? { ...stored, enabled: true } : stored;
    if (!settings.enabled) return null;
    const { occupied } = await loadOccupied(input.store, {
      fromYmd: addDaysYmd(input.request.tripDate, -3),
      toYmd: addDaysYmd(input.request.tripDate, 3),
    });
    const [state, booking] = await Promise.all([
      getSmartOpsState(input.store),
      getBookingSettings(input.store),
    ]);
    // Only discount or suggest times the customer can actually book.
    const isTimeAvailable = (tripDate: string, tripTime: string) =>
      !state.config.flags.smartAvailability ||
      evaluateSmartAvailability({
        requested: {
          pickupLabel: input.request.pickupLabel,
          dropoffLabel: input.request.dropoffLabel,
          pickup: input.request.pickup ?? null,
          dropoff: input.request.dropoff ?? null,
          tripDate,
          tripTime,
          durationMinutes: input.request.durationMinutes,
          airportCode: input.request.airportCode ?? null,
          isFromAirport: Boolean(input.request.fromAirport),
          vehicle: input.request.vehicle ?? null,
        },
        occupied,
        rules: state.rules,
        exceptions: state.exceptions,
        legacyPeriods: booking.unavailablePeriods,
        config: state.config,
        searchAlternatives: false,
        now: input.now,
      }).available;
    const decision = evaluateEmptyRunDiscount({
      request: input.request,
      fare: input.fare,
      occupied,
      base: OPERATING_BASE,
      settings,
      now: input.now,
      isTimeAvailable,
    });
    if (decision.applied || decision.offer) {
      console.log(`[empty-run] ${decision.reason} parent=${decision.parentJobId ?? ""}`);
    }
    return decision;
  } catch (error) {
    console.warn("[empty-run] evaluation failed; no discount", error);
    return null;
  }
}

export function isOwnerEmptyRunPath(pathname: string): boolean {
  return pathname === "/owner/smart-ops/empty-run" || pathname === "/api/owner/smart-ops/empty-run";
}

export async function handleOwnerEmptyRun(
  request: Request,
  env: DriverAuthEnv & { TRACKING_STORE: KVNamespace },
): Promise<{ ok: true; settings: EmptyRunSettings } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) return { error: "Unauthorized", status: 401 };
  if (request.method === "GET") {
    cached = null;
    return { ok: true, settings: await loadEmptyRunSettings(env.TRACKING_STORE) };
  }
  if (request.method !== "POST") return { error: "Method not allowed", status: 405 };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
  const current = await loadEmptyRunSettings(env.TRACKING_STORE);
  const settings = normalizeEmptyRunSettings({
    ...current,
    ...(body && typeof body === "object" ? body : {}),
    updatedAt: new Date().toISOString(),
  });
  await env.TRACKING_STORE.put(EMPTY_RUN_CONFIG_KEY, JSON.stringify(settings));
  cached = { at: Date.now(), settings };
  return { ok: true, settings };
}

/** Preview Worker test switch. Production never sets this variable. */
export function emptyRunPreviewForced(env: unknown): boolean {
  return (env as { EMPTY_RUN_PREVIEW_FORCE_ON?: string } | undefined)?.EMPTY_RUN_PREVIEW_FORCE_ON === "true";
}

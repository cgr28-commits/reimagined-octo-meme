/**
 * Instant prices for EVENT transfers (not Business Class requests, not airport transfers).
 *
 * Rule set by the owner: the normal journey fare, plus an event uplift (default 20%,
 * adjustable or switched off in the dashboard), with a £20 minimum — whichever is higher.
 *
 * This file only does the arithmetic and the eligibility rules. The normal fare itself
 * comes from the existing quote engine, which is called unchanged; nothing here alters
 * airport pricing, the pricing settings or the airport quote card.
 */

import type { ValidatedBespokeQuoteRequest } from "./bespoke-quote";
import { parseLondonLocalDateTime } from "./uk-time";

export const EVENT_INSTANT_MINIMUM_FARE_GBP = 20;
export const EVENT_INSTANT_DEFAULT_UPLIFT_PERCENT = 20;
export const EVENT_INSTANT_MAX_UPLIFT_PERCENT = 100;
/** Standard car only. 5–7 passengers need the 7-seater, which is never promised. */
export const EVENT_INSTANT_MAX_PASSENGERS = 4;
/** Closer than this to pickup, the owner prices it personally (no automatic price). */
export const EVENT_INSTANT_MIN_NOTICE_HOURS = 24;
/** How long an instant price stays payable (never past the pickup time). */
export const EVENT_INSTANT_VALIDITY_HOURS = 24;

export const EVENT_INSTANT_SETTINGS_KEY = "bespoke:instant-quote-settings";

export type EventInstantQuoteSettings = {
  /** Instant prices for event transfers on/off. Off = every request is priced by the owner. */
  enabled: boolean;
  /** Event uplift on/off. Off = the normal fare (still subject to the minimum). */
  upliftEnabled: boolean;
  /** Whole percent added to the normal fare, 0–100. */
  upliftPercent: number;
  updatedAt?: string;
};

export const EVENT_INSTANT_DEFAULT_SETTINGS: EventInstantQuoteSettings = {
  enabled: true,
  upliftEnabled: true,
  upliftPercent: EVENT_INSTANT_DEFAULT_UPLIFT_PERCENT,
};

/** Stored or missing settings → safe settings. Anything invalid falls back to the default. */
export function normaliseEventInstantSettings(raw: unknown): EventInstantQuoteSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const percent = value.upliftPercent;
  const validPercent =
    typeof percent === "number" && Number.isInteger(percent) && percent >= 0 && percent <= EVENT_INSTANT_MAX_UPLIFT_PERCENT;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : EVENT_INSTANT_DEFAULT_SETTINGS.enabled,
    upliftEnabled: typeof value.upliftEnabled === "boolean" ? value.upliftEnabled : EVENT_INSTANT_DEFAULT_SETTINGS.upliftEnabled,
    upliftPercent: validPercent ? (percent as number) : EVENT_INSTANT_DEFAULT_SETTINGS.upliftPercent,
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
  };
}

export type EventInstantSettingsInput =
  | { ok: true; settings: Omit<EventInstantQuoteSettings, "updatedAt"> }
  | { ok: false; error: string };

/** Strict check of what the owner saves (no silent fallbacks). */
export function validateEventInstantSettingsInput(raw: unknown): EventInstantSettingsInput {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof value.enabled !== "boolean" || typeof value.upliftEnabled !== "boolean") {
    return { ok: false, error: "Choose on or off for each switch." };
  }
  const percent = value.upliftPercent;
  if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > EVENT_INSTANT_MAX_UPLIFT_PERCENT) {
    return { ok: false, error: `Enter a whole percentage from 0 to ${EVENT_INSTANT_MAX_UPLIFT_PERCENT}.` };
  }
  return { ok: true, settings: { enabled: value.enabled, upliftEnabled: value.upliftEnabled, upliftPercent: percent } };
}

export type EventInstantPrice = {
  /** What the customer pays, in whole pounds. */
  amountGbp: number;
  /** The normal fare from the quote engine. */
  baseFareGbp: number;
  /** Percent actually applied (0 when the uplift is switched off). */
  upliftPercent: number;
  /** True when the £20 minimum set the price. */
  minimumApplied: boolean;
};

/** Normal fare + uplift, or the minimum — whichever is higher. Rounded to the nearest pound. */
export function computeEventInstantPrice(baseFareGbp: number, settings: EventInstantQuoteSettings): EventInstantPrice | null {
  if (!Number.isFinite(baseFareGbp) || baseFareGbp <= 0) return null;
  const upliftPercent = settings.upliftEnabled ? settings.upliftPercent : 0;
  // Work in pence to avoid floating-point drift.
  const basePence = Math.round(baseFareGbp * 100);
  const withUplift = Math.round((basePence * (100 + upliftPercent)) / 100 / 100);
  const amountGbp = Math.max(withUplift, EVENT_INSTANT_MINIMUM_FARE_GBP);
  return {
    amountGbp,
    baseFareGbp: basePence / 100,
    upliftPercent,
    minimumApplied: withUplift < EVENT_INSTANT_MINIMUM_FARE_GBP,
  };
}

export type EventInstantEligibility = { eligible: true } | { eligible: false; reason: string };

/**
 * Which requests may be priced automatically. Everything else stays a normal
 * request that the owner prices personally.
 */
export function eventInstantEligibility(request: ValidatedBespokeQuoteRequest, now: Date): EventInstantEligibility {
  if (request.category !== "event") return { eligible: false, reason: "not_event" };
  const j = request.journey;
  if (j.passengers > EVENT_INSTANT_MAX_PASSENGERS || j.groupVehicleRequested) return { eligible: false, reason: "group" };
  if (j.additionalStops.length > 0) return { eligible: false, reason: "extra_stops" };
  if (j.flightNumber) return { eligible: false, reason: "flight" };
  const pickup = parseLondonLocalDateTime(j.date, j.time);
  if (!pickup) return { eligible: false, reason: "no_pickup_time" };
  if (pickup.getTime() - now.getTime() < EVENT_INSTANT_MIN_NOTICE_HOURS * 3_600_000) return { eligible: false, reason: "short_notice" };
  if (j.returnJourney && (!j.returnDate || !j.returnTime)) return { eligible: false, reason: "return_time_missing" };
  return { eligible: true };
}

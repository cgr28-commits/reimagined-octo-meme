/**
 * Owner booking availability settings (KV).
 * Multiple unavailable periods — eligibility is computed on read (no expiry writes).
 */

import {
  generateUnavailablePeriodId,
  listActiveUnavailablePeriods,
  normalizeUnavailablePeriod,
  normalizeUnavailablePeriods,
  type UnavailablePeriod,
  type UnavailablePeriodInput,
} from "../shared/booking-notice";

export type BookingSettings = {
  unavailablePeriods: UnavailablePeriod[];
  updatedAt: string;
};

const BOOKING_SETTINGS_KEY = "booking:settings";
const TTL = 60 * 60 * 24 * 365 * 5;
const MAX_PERIODS = 60;

export function defaultBookingSettings(): BookingSettings {
  return {
    unavailablePeriods: [],
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * Normalize KV payload. Legacy `minimumOnlineNoticeHours` and
 * `automaticBookingsAvailableFrom` are ignored so only one gate remains.
 */
export function normalizeBookingSettings(
  raw:
    | (Partial<BookingSettings> & {
        minimumOnlineNoticeHours?: number;
        automaticBookingsAvailableFrom?: string | null;
      })
    | null
    | undefined,
): BookingSettings {
  return {
    unavailablePeriods: normalizeUnavailablePeriods(raw?.unavailablePeriods),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

export async function getBookingSettings(store: KVNamespace): Promise<BookingSettings> {
  const raw = await store.get(BOOKING_SETTINGS_KEY, "json");
  if (!raw) return defaultBookingSettings();
  return normalizeBookingSettings(raw as Partial<BookingSettings>);
}

async function putBookingSettings(
  store: KVNamespace,
  settings: BookingSettings,
): Promise<BookingSettings> {
  const normalized = normalizeBookingSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  await store.put(BOOKING_SETTINGS_KEY, JSON.stringify(normalized), {
    expirationTtl: TTL,
  });
  return normalized;
}

/** Full replace (Owner UI). Write only on explicit save. */
export async function saveBookingSettings(
  store: KVNamespace,
  settings: BookingSettings,
): Promise<BookingSettings> {
  const periods = normalizeUnavailablePeriods(settings.unavailablePeriods).slice(0, MAX_PERIODS);
  return putBookingSettings(store, {
    unavailablePeriods: periods,
    updatedAt: new Date().toISOString(),
  });
}

export async function addUnavailablePeriod(
  store: KVNamespace,
  input: UnavailablePeriodInput,
): Promise<{ settings: BookingSettings; period: UnavailablePeriod }> {
  const now = new Date();
  const period = normalizeUnavailablePeriod(
    { ...input, id: input.id || generateUnavailablePeriodId(now) },
    now,
  );
  if (!period) {
    throw new Error("Invalid unavailable period — check start/end date and time.");
  }
  const current = await getBookingSettings(store);
  if (current.unavailablePeriods.length >= MAX_PERIODS) {
    throw new Error(`Maximum of ${MAX_PERIODS} unavailable periods reached.`);
  }
  const settings = await putBookingSettings(store, {
    unavailablePeriods: [...current.unavailablePeriods, period],
    updatedAt: now.toISOString(),
  });
  return { settings, period };
}

export async function updateUnavailablePeriod(
  store: KVNamespace,
  id: string,
  input: UnavailablePeriodInput,
): Promise<{ settings: BookingSettings; period: UnavailablePeriod }> {
  const now = new Date();
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("Missing period id.");
  const current = await getBookingSettings(store);
  const existing = current.unavailablePeriods.find((entry) => entry.id === trimmedId);
  if (!existing) throw new Error("Unavailable period not found.");
  const period = normalizeUnavailablePeriod(
    {
      ...input,
      id: trimmedId,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString(),
    },
    now,
  );
  if (!period) {
    throw new Error("Invalid unavailable period — check start/end date and time.");
  }
  const settings = await putBookingSettings(store, {
    unavailablePeriods: current.unavailablePeriods.map((entry) =>
      entry.id === trimmedId ? period : entry,
    ),
    updatedAt: now.toISOString(),
  });
  return { settings, period };
}

export async function deleteUnavailablePeriod(
  store: KVNamespace,
  id: string,
): Promise<BookingSettings> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("Missing period id.");
  const current = await getBookingSettings(store);
  const next = current.unavailablePeriods.filter((entry) => entry.id !== trimmedId);
  if (next.length === current.unavailablePeriods.length) {
    throw new Error("Unavailable period not found.");
  }
  return putBookingSettings(store, {
    unavailablePeriods: next,
    updatedAt: new Date().toISOString(),
  });
}

/** Read-only view helpers for Owner API (no writes). */
export function bookingSettingsPublicView(settings: BookingSettings, now = new Date()) {
  const active = listActiveUnavailablePeriods(settings.unavailablePeriods, now);
  return {
    ...settings,
    activeUnavailablePeriods: active,
    activeCount: active.length,
  };
}

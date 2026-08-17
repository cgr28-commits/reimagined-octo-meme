/**
 * Owner-configurable booking settings (KV).
 * Automatic bookings available from a Europe/London date/time — not a rolling hours window.
 */

import {
  isAutomaticAvailabilityGateActive,
  normalizeAutomaticAvailabilityLocal,
} from "../shared/booking-notice";

export type BookingSettings = {
  /**
   * Europe/London wall clock `YYYY-MM-DDTHH:mm`.
   * Null / empty / past → no automatic-booking restriction (SumUp proceeds normally).
   */
  automaticBookingsAvailableFrom: string | null;
  updatedAt: string;
};

const BOOKING_SETTINGS_KEY = "booking:settings";
const TTL = 60 * 60 * 24 * 365 * 5;

export function defaultBookingSettings(): BookingSettings {
  return {
    automaticBookingsAvailableFrom: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeBookingSettings(
  raw: Partial<BookingSettings> & {
    /** Legacy hours field — ignored so both rules never run together. */
    minimumOnlineNoticeHours?: number;
  } | null | undefined,
): BookingSettings {
  const availableFrom = normalizeAutomaticAvailabilityLocal(
    raw?.automaticBookingsAvailableFrom ?? null,
  );
  return {
    automaticBookingsAvailableFrom: availableFrom,
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

/** Effective settings for gates: past availability is treated as cleared. */
export function effectiveBookingSettings(
  settings: BookingSettings,
  now = new Date(),
): BookingSettings & { gateActive: boolean } {
  const availableFrom = settings.automaticBookingsAvailableFrom;
  const gateActive = isAutomaticAvailabilityGateActive(availableFrom, now);
  return {
    ...settings,
    automaticBookingsAvailableFrom: gateActive ? availableFrom : null,
    gateActive,
  };
}

export async function getBookingSettings(store: KVNamespace): Promise<BookingSettings> {
  const raw = await store.get<BookingSettings>(BOOKING_SETTINGS_KEY, "json");
  if (!raw) return defaultBookingSettings();
  return normalizeBookingSettings(raw);
}

export async function saveBookingSettings(
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

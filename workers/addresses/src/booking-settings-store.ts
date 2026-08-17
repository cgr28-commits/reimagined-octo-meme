/**
 * Owner-configurable booking settings (KV). Default minimum online notice = 6 hours.
 */

import { DEFAULT_MINIMUM_ONLINE_NOTICE_HOURS } from "../shared/booking-notice";

export type BookingSettings = {
  /** Minimum hours before pickup for automatic SumUp (Europe/London). */
  minimumOnlineNoticeHours: number;
  updatedAt: string;
};

const BOOKING_SETTINGS_KEY = "booking:settings";
const TTL = 60 * 60 * 24 * 365 * 5;

export function defaultBookingSettings(): BookingSettings {
  return {
    minimumOnlineNoticeHours: DEFAULT_MINIMUM_ONLINE_NOTICE_HOURS,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeBookingSettings(
  raw: Partial<BookingSettings> | null | undefined,
): BookingSettings {
  const hours = Number(raw?.minimumOnlineNoticeHours);
  const safeHours =
    Number.isFinite(hours) && hours >= 0 && hours <= 72
      ? Math.round(hours * 10) / 10
      : DEFAULT_MINIMUM_ONLINE_NOTICE_HOURS;
  return {
    minimumOnlineNoticeHours: safeHours,
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
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

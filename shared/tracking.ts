export type TrackingJobRecord = {
  token: string;
  createdAt: string;
  customerName: string;
  customerEmail?: string;
  customerMobile: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  /** Wall-clock pickup in Europe/London as ISO-like local string YYYY-MM-DDTHH:mm */
  pickupAt: string;
  paymentReference?: string;
  driverLat?: number;
  driverLng?: number;
  driverUpdatedAt?: string;
  sharingActive: boolean;
  /** ISO timestamp when the live-tracking reminder email was sent */
  sharingReminderSentAt?: string;
  customerSharingActive?: boolean;
  customerLat?: number;
  customerLng?: number;
  customerUpdatedAt?: string;
  isAirportTrip?: boolean;
  isFromAirport?: boolean;
  airportCode?: string;
  flightNumber?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
};

export const LOCATION_STALE_MS = 5 * 60 * 1000;

export function isLocationFresh(
  updatedAt: string | undefined,
  now = Date.now(),
  maxAgeMs = LOCATION_STALE_MS,
): boolean {
  if (!updatedAt) {
    return false;
  }

  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) {
    return false;
  }

  return now - updated < maxAgeMs;
}

export type TrackingWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  pickupAt: string;
  reason?: "too_early" | "too_late" | "open";
};

const TIME_ZONE = "Europe/London";
const OPEN_BEFORE_MS = 2 * 60 * 60 * 1000;
const CLOSE_AFTER_MS = 90 * 60 * 1000;

export function buildPickupDateTimeLocal(tripDate: string, tripTime: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d{2}:\d{2}$/.test(tripTime)) {
    return null;
  }

  return `${tripDate}T${tripTime}`;
}

function parseLondonLocal(isoLocal: string): Date | null {
  const match = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let offsetMinutes = -90; offsetMinutes <= 90; offsetMinutes += 15) {
    const candidate = new Date(utcGuess + offsetMinutes * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";

    const formatted = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    if (formatted === isoLocal) {
      return candidate;
    }
  }

  return new Date(utcGuess);
}

export function getTrackingWindow(pickupAt: string, now = new Date()): TrackingWindow {
  const pickup = parseLondonLocal(pickupAt);
  if (!pickup) {
    return {
      open: false,
      opensAt: pickupAt,
      closesAt: pickupAt,
      pickupAt,
      reason: "too_early",
    };
  }

  const opensAt = new Date(pickup.getTime() - OPEN_BEFORE_MS);
  const closesAt = new Date(pickup.getTime() + CLOSE_AFTER_MS);
  const open = now >= opensAt && now <= closesAt;

  return {
    open,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    pickupAt,
    reason: now < opensAt ? "too_early" : now > closesAt ? "too_late" : "open",
  };
}

export function formatLondonDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildPublicTrackUrl(token: string, siteUrl = "https://www.myairporttaxini.co.uk"): string {
  return `${siteUrl.replace(/\/$/, "")}/track/?id=${encodeURIComponent(token)}`;
}

export function generateTrackingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

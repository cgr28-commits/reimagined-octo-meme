/**
 * Automatic booking availability gate + service labels (Europe/London).
 * Owner sets "automatic bookings available from" date/time — not a rolling hours window.
 */

import { parseLondonLocalDateTime, parseLondonLocalIso, UK_TIME_ZONE } from "./uk-time";

export type BookableServiceCode = "SALOON" | "ESTATE" | "MINIBUS";

/** Stored as Europe/London wall clock `YYYY-MM-DDTHH:mm`. */
export type AutomaticAvailabilityLocal = string;

/** Map stored vehicle string → Owner Dashboard service code. */
export function vehicleServiceCode(vehicle?: string | null): BookableServiceCode | "OTHER" {
  const v = String(vehicle ?? "").trim().toLowerCase();
  if (!v) return "OTHER";
  if (v.includes("minibus")) return "MINIBUS";
  if (v.includes("estate")) return "ESTATE";
  if (v.includes("saloon") || v.includes("standard")) return "SALOON";
  return "OTHER";
}

export function vehicleServiceLabel(vehicle?: string | null): string {
  const code = vehicleServiceCode(vehicle);
  if (code === "OTHER") return String(vehicle ?? "").trim() || "—";
  return code;
}

/**
 * Normalize Owner-entered availability to `YYYY-MM-DDTHH:mm` (Europe/London wall clock).
 * Accepts `YYYY-MM-DDTHH:mm`, with seconds, or separate date+time.
 */
export function normalizeAutomaticAvailabilityLocal(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const normalized = `${match[1]}T${match[2]}:${match[3]}`;
  if (!parseLondonLocalIso(`${normalized}:00`)) return null;
  return normalized;
}

export function parseAutomaticAvailabilityFrom(
  value: string | null | undefined,
): Date | null {
  const normalized = normalizeAutomaticAvailabilityLocal(value);
  if (!normalized) return null;
  return parseLondonLocalIso(`${normalized}:00`);
}

/**
 * Gate is active only while the Owner-set availability instant is still in the future.
 * Once that wall-clock time has passed (Europe/London), the restriction auto-expires.
 */
export function isAutomaticAvailabilityGateActive(
  availableFrom: string | null | undefined,
  now = new Date(),
): boolean {
  const from = parseAutomaticAvailabilityFrom(availableFrom);
  if (!from) return false;
  return from.getTime() > now.getTime();
}

/**
 * True when automatic SumUp must be blocked and the booking diverted to Owner approval.
 * Uses outbound pickup only. Pickup exactly at availableFrom → allowed (not short-notice).
 */
export function isPickupBeforeAutomaticAvailability(
  tripDate: string,
  tripTime: string,
  availableFrom: string | null | undefined,
  now = new Date(),
): boolean {
  if (!isAutomaticAvailabilityGateActive(availableFrom, now)) {
    return false;
  }
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  const from = parseAutomaticAvailabilityFrom(availableFrom);
  if (!pickup || !from) return false;
  return pickup.getTime() < from.getTime();
}

/** Display: "Tuesday 18 August 2026 · 08:00" */
export function formatAutomaticAvailabilityLabel(
  availableFrom: string | null | undefined,
): string | null {
  const normalized = normalizeAutomaticAvailabilityLocal(availableFrom);
  if (!normalized) return null;
  const [ymd, hm] = normalized.split("T");
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const dayPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${dayPart} · ${hm}`;
}

/** Stable fingerprint of fare-affecting fields (approval lock). */
export function materialJourneyFingerprint(input: {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  returnJourney?: boolean | null;
  returnDate?: string | null;
  returnTime?: string | null;
  vehicle?: string | null;
  amount?: number | null;
}): string {
  const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? (Math.round(input.amount * 100) / 100).toFixed(2)
      : "";
  return [
    norm(input.pickupLabel),
    norm(input.dropoffLabel),
    norm(input.tripDate),
    norm(input.tripTime),
    input.returnJourney ? "return" : "oneway",
    norm(input.returnDate),
    norm(input.returnTime),
    norm(input.vehicle),
    amount,
  ].join("|");
}

/**
 * Payment-link expiry after Owner approval.
 * Never payable after scheduled London pickup.
 * Also expires 4 hours after approval (whichever is sooner).
 * Floor: at least 15 minutes after approval when pickup is still ahead.
 */
export function computeShortNoticePaymentExpiryIso(options: {
  tripDate: string;
  tripTime: string;
  approvedAtIso: string;
  now?: Date;
}): string {
  const now = options.now ?? new Date();
  const approvedAt = new Date(options.approvedAtIso);
  const pickup = parseLondonLocalDateTime(options.tripDate, options.tripTime);
  const fourHoursAfterApproval = new Date(
    (Number.isNaN(approvedAt.getTime()) ? now.getTime() : approvedAt.getTime()) + 4 * 60 * 60 * 1000,
  );
  const fifteenMinutesAfterApproval = new Date(
    (Number.isNaN(approvedAt.getTime()) ? now.getTime() : approvedAt.getTime()) + 15 * 60 * 1000,
  );

  let expires = fourHoursAfterApproval;
  if (pickup && pickup.getTime() < expires.getTime()) {
    expires = pickup;
  }
  if (expires.getTime() < fifteenMinutesAfterApproval.getTime() && pickup && pickup.getTime() > now.getTime()) {
    expires =
      pickup.getTime() < fifteenMinutesAfterApproval.getTime() ? pickup : fifteenMinutesAfterApproval;
  }
  if (pickup && expires.getTime() > pickup.getTime()) {
    expires = pickup;
  }
  return expires.toISOString();
}

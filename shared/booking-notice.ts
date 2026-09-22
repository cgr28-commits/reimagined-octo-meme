/**
 * Owner unavailable booking periods + service labels (Europe/London).
 * request_only: SumUp blocked on outbound pickup; booking request still allowed.
 * no_availability: hard close. Journey-window overlap when duration is known.
 * Expired periods (now >= end) are ignored — no KV write required to expire.
 */

import { hoursUntilPickup } from "./refund-ops";
import { parseLondonLocalDateTime, parseLondonLocalIso, UK_TIME_ZONE } from "./uk-time";

/**
 * Default / fallback minimum elapsed hours before pickup for instant online payment.
 * Owner Dashboard "Short-notice period" overrides this at runtime via booking settings KV.
 * Keep 12 here only as the backward-compatible default when the setting is missing or invalid.
 * Exactly this many hours (or more) uses the normal SumUp flow.
 * Under this threshold requires Owner approval (short-notice request).
 */
export const MINIMUM_BOOKING_NOTICE_HOURS = 12;
export const MIN_MINIMUM_BOOKING_NOTICE_HOURS = 1;
export const MAX_MINIMUM_BOOKING_NOTICE_HOURS = 48;

/** Accept a whole number of hours in 1–48. Invalid owner input must be rejected, not silently defaulted. */
export function parseMinimumBookingNoticeHoursInput(value: unknown): number | null {
  if (typeof value === "boolean" || value == null) return null;
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-9) return null;
  if (
    rounded < MIN_MINIMUM_BOOKING_NOTICE_HOURS ||
    rounded > MAX_MINIMUM_BOOKING_NOTICE_HOURS
  ) {
    return null;
  }
  return rounded;
}

/** Missing/legacy/invalid values fall back to 12 hours. */
export function normalizeMinimumBookingNoticeHours(value: unknown): number {
  return parseMinimumBookingNoticeHoursInput(value) ?? MINIMUM_BOOKING_NOTICE_HOURS;
}

export type ShortNoticeTriggerReason = "unavailable_period" | "under_minimum_notice";

/** True when pickup is strictly under the configured notice window (11h59m yes; 12h00 no). */
export function isWithinMinimumBookingNotice(
  tripDate: string,
  tripTime: string,
  now = new Date(),
  noticeHours = MINIMUM_BOOKING_NOTICE_HOURS,
): boolean {
  const hours = hoursUntilPickup(tripDate, tripTime, now);
  if (hours == null) return false;
  return hours < normalizeMinimumBookingNoticeHours(noticeHours);
}

export function formatHoursUntilPickupLabel(
  tripDate: string,
  tripTime: string,
  now = new Date(),
): string | null {
  const hours = hoursUntilPickup(tripDate, tripTime, now);
  if (hours == null) return null;
  if (hours < 0) return "pickup time has passed";
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function minimumNoticeRequestHeading(): string {
  return "Short-notice booking";
}

export function minimumNoticeRequestBody(
  noticeHours = MINIMUM_BOOKING_NOTICE_HOURS,
): string {
  const hours = normalizeMinimumBookingNoticeHours(noticeHours);
  return (
    `This journey is within our ${hours}-hour advance booking period. You can still request the transfer, but we need to confirm availability before your booking is confirmed.\n\n` +
    `If we can accommodate your journey, we’ll email you with a secure payment link to confirm your booking.`
  );
}

export type BookableServiceCode = "SALOON" | "ESTATE" | "MINIBUS";

/** Europe/London wall clock `YYYY-MM-DDTHH:mm`. */
export type LondonLocalDateTime = string;

export const UNAVAILABLE_PERIOD_MODES = ["request_only", "no_availability"] as const;
export type UnavailablePeriodMode = (typeof UNAVAILABLE_PERIOD_MODES)[number];

/** Missing/legacy/invalid mode stays request-only so existing periods are not hard-closed. */
export function normalizeUnavailablePeriodMode(value: unknown): UnavailablePeriodMode {
  return value === "no_availability" ? "no_availability" : "request_only";
}

export const OWNER_NO_AVAILABILITY_CODE = "owner_no_availability";
export const OWNER_NO_AVAILABILITY_MESSAGE =
  "We’re unavailable at this time. Please choose another pickup date or time.";

export type OwnerAvailabilityState = "no_availability" | "available";

export type PublicOwnerAvailability = {
  state: OwnerAvailabilityState;
  blocked: boolean;
  code: typeof OWNER_NO_AVAILABILITY_CODE | null;
  customerMessage: string | null;
};

export function emptyPublicOwnerAvailability(): PublicOwnerAvailability {
  return {
    state: "available",
    blocked: false,
    code: null,
    customerMessage: null,
  };
}

export function blockedPublicOwnerAvailability(): PublicOwnerAvailability {
  return {
    state: "no_availability",
    blocked: true,
    code: OWNER_NO_AVAILABILITY_CODE,
    customerMessage: OWNER_NO_AVAILABILITY_MESSAGE,
  };
}

export function isOwnerNoAvailabilityMessage(message?: string | null): boolean {
  return String(message || "").trim() === OWNER_NO_AVAILABILITY_MESSAGE;
}

export function parsePublicOwnerAvailability(value: unknown): PublicOwnerAvailability {
  if (!value || typeof value !== "object") return emptyPublicOwnerAvailability();
  const raw = value as { blocked?: unknown; state?: unknown; code?: unknown };
  if (
    raw.blocked === true ||
    raw.state === "no_availability" ||
    raw.code === OWNER_NO_AVAILABILITY_CODE
  ) {
    return blockedPublicOwnerAvailability();
  }
  return emptyPublicOwnerAvailability();
}

export type UnavailablePeriodInput = {
  id?: string;
  startLocal: string;
  endLocal: string;
  /** Private Owner note — never shown to customers. */
  note?: string | null;
  /** Missing mode = request_only. */
  mode?: UnavailablePeriodMode | string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UnavailablePeriod = {
  id: string;
  startLocal: LondonLocalDateTime;
  endLocal: LondonLocalDateTime;
  note?: string;
  mode: UnavailablePeriodMode;
  createdAt: string;
  updatedAt: string;
};

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
 * Normalize to `YYYY-MM-DDTHH:mm` (Europe/London wall clock).
 * Accepts `YYYY-MM-DDTHH:mm`, with seconds, or `YYYY-MM-DD HH:mm`.
 */
export function normalizeLondonLocalDateTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const normalized = `${match[1]}T${match[2]}:${match[3]}`;
  if (!parseLondonLocalIso(`${normalized}:00`)) return null;
  return normalized;
}

/** @deprecated Use normalizeLondonLocalDateTime */
export const normalizeAutomaticAvailabilityLocal = normalizeLondonLocalDateTime;

export function parseLondonLocalStored(value: string | null | undefined): Date | null {
  const normalized = normalizeLondonLocalDateTime(value);
  if (!normalized) return null;
  return parseLondonLocalIso(`${normalized}:00`);
}

export function generateUnavailablePeriodId(now = new Date()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `unavail-${now.getTime().toString(36)}-${rand}`;
}

export function normalizeUnavailablePeriod(
  raw: UnavailablePeriodInput | null | undefined,
  now = new Date(),
): UnavailablePeriod | null {
  if (!raw) return null;
  const startLocal = normalizeLondonLocalDateTime(raw.startLocal);
  const endLocal = normalizeLondonLocalDateTime(raw.endLocal);
  if (!startLocal || !endLocal) return null;
  const start = parseLondonLocalStored(startLocal);
  const end = parseLondonLocalStored(endLocal);
  if (!start || !end || end.getTime() <= start.getTime()) return null;

  const note = String(raw.note ?? "").trim().slice(0, 280);
  const createdAt = raw.createdAt?.trim() || now.toISOString();
  const mode = normalizeUnavailablePeriodMode(raw.mode);
  return {
    id: String(raw.id ?? "").trim() || generateUnavailablePeriodId(now),
    startLocal,
    endLocal,
    mode,
    ...(note ? { note } : {}),
    createdAt,
    updatedAt: raw.updatedAt?.trim() || now.toISOString(),
  };
}

export function normalizeUnavailablePeriods(
  raw: unknown,
  now = new Date(),
): UnavailablePeriod[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, UnavailablePeriod>();
  for (const entry of raw) {
    const period = normalizeUnavailablePeriod(entry as UnavailablePeriodInput, now);
    if (!period) continue;
    byId.set(period.id, period);
  }
  return [...byId.values()].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
}

/** Period is expired when current time is at/after exclusive end — ignore for eligibility. */
export function isUnavailablePeriodExpired(
  period: Pick<UnavailablePeriod, "endLocal">,
  now = new Date(),
): boolean {
  const end = parseLondonLocalStored(period.endLocal);
  if (!end) return true;
  return now.getTime() >= end.getTime();
}

/**
 * Pickup blocked when start ≤ pickup < end (start inclusive, end exclusive).
 * Does not consider wall-clock expiry — callers should skip expired periods.
 */
export function isPickupInsideUnavailablePeriod(
  tripDate: string,
  tripTime: string,
  period: Pick<UnavailablePeriod, "startLocal" | "endLocal">,
): boolean {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  const start = parseLondonLocalStored(period.startLocal);
  const end = parseLondonLocalStored(period.endLocal);
  if (!pickup || !start || !end) return false;
  const t = pickup.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * True when automatic SumUp must be blocked (Owner approval required).
 * Uses outbound pickup only. Expired periods are ignored (no KV write).
 */
export function isPickupBlockedByUnavailablePeriods(
  tripDate: string,
  tripTime: string,
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): boolean {
  return Boolean(findBlockingUnavailablePeriod(tripDate, tripTime, periods, now));
}

export function findBlockingUnavailablePeriod(
  tripDate: string,
  tripTime: string,
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): UnavailablePeriod | null {
  if (!periods?.length) return null;
  for (const period of periods) {
    if (isUnavailablePeriodExpired(period, now)) continue;
    if (isPickupInsideUnavailablePeriod(tripDate, tripTime, period)) {
      return period;
    }
  }
  return null;
}

export function isRequestOnlyUnavailablePeriod(
  period: Pick<UnavailablePeriod, "mode"> | { mode?: unknown },
): boolean {
  return normalizeUnavailablePeriodMode(period.mode) === "request_only";
}

export function isNoAvailabilityPeriod(
  period: Pick<UnavailablePeriod, "mode"> | { mode?: unknown },
): boolean {
  return normalizeUnavailablePeriodMode(period.mode) === "no_availability";
}

/**
 * Request-only conversion still uses outbound pickup only.
 * Hard-close periods are excluded so they cannot become short-notice requests.
 */
export function findRequestOnlyBlockingPeriod(
  tripDate: string,
  tripTime: string,
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): UnavailablePeriod | null {
  if (!periods?.length) return null;
  return findBlockingUnavailablePeriod(
    tripDate,
    tripTime,
    periods.filter((period) => isRequestOnlyUnavailablePeriod(period)),
    now,
  );
}

export type OwnerAvailabilityLeg = {
  tripDate?: string | null;
  tripTime?: string | null;
  durationMinutes?: number | null;
};

export type OwnerAvailabilityBooking = {
  tripDate?: string | null;
  tripTime?: string | null;
  returnJourney?: boolean | null;
  returnDate?: string | null;
  returnTime?: string | null;
  routeDurationMinutes?: number | null;
  journeyDuration?: string | null;
  returnRouteDurationMinutes?: number | null;
  returnJourneyDuration?: string | null;
};

/** Reuse an already-calculated duration. Returns null instead of inventing one. */
export function existingJourneyDurationMinutes(
  minutes?: number | null,
  label?: string | null,
): number | null {
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    return Math.round(minutes);
  }
  const raw = String(label ?? "").trim().toLowerCase();
  if (!raw) return null;
  const hrMin = /^(\d+)\s*hr(?:s)?(?:\s+(\d+)\s*min)?$/.exec(raw);
  if (hrMin) {
    const total = Number(hrMin[1]) * 60 + (hrMin[2] ? Number(hrMin[2]) : 0);
    return total > 0 ? total : null;
  }
  const hoursAndMins = raw.match(/(\d+)\s*h(?:ours?)?(?:\s+(\d+)\s*m(?:in(?:utes?)?)?)?/);
  const minsOnly = raw.match(/(\d+)\s*m(?:in(?:utes?)?)?/);
  if (hoursAndMins && /h/.test(raw)) {
    const total = Number(hoursAndMins[1]) * 60 + (hoursAndMins[2] ? Number(hoursAndMins[2]) : 0);
    return total > 0 ? total : null;
  }
  if (minsOnly) {
    const minutes = Number(minsOnly[1]);
    return minutes > 0 ? minutes : null;
  }
  const plain = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(plain) && plain > 0 && plain < 400 ? Math.round(plain) : null;
}

export function ownerAvailabilityLegsFromBooking(
  booking: OwnerAvailabilityBooking,
): OwnerAvailabilityLeg[] {
  const outboundDuration = existingJourneyDurationMinutes(
    booking.routeDurationMinutes,
    booking.journeyDuration,
  );
  const outbound: OwnerAvailabilityLeg = {
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    durationMinutes: outboundDuration,
  };
  const legs = [outbound];
  if (
    booking.returnJourney &&
    String(booking.returnDate || "").trim() &&
    String(booking.returnTime || "").trim()
  ) {
    const returnDuration = existingJourneyDurationMinutes(
      booking.returnRouteDurationMinutes,
      booking.returnJourneyDuration,
    );
    legs.push({
      tripDate: booking.returnDate,
      tripTime: booking.returnTime,
      durationMinutes: returnDuration ?? outboundDuration,
    });
  }
  return legs.filter((leg) => String(leg.tripDate || "").trim() && String(leg.tripTime || "").trim());
}

export function journeyWindowOverlapsUnavailablePeriod(
  journeyStartMs: number,
  journeyEndMs: number,
  period: Pick<UnavailablePeriod, "startLocal" | "endLocal">,
): boolean {
  const start = parseLondonLocalStored(period.startLocal);
  const end = parseLondonLocalStored(period.endLocal);
  if (!start || !end) return false;
  return journeyStartMs < end.getTime() && journeyEndMs > start.getTime();
}

/**
 * Hard-close overlap. When duration is known: half-open journey window vs period.
 * When duration is missing: safe pickup-time check (start ≤ pickup < end).
 */
export function legConflictsWithNoAvailability(
  leg: OwnerAvailabilityLeg,
  period: Pick<UnavailablePeriod, "startLocal" | "endLocal">,
): boolean {
  const pickup = parseLondonLocalDateTime(String(leg.tripDate || ""), String(leg.tripTime || ""));
  if (!pickup) return false;
  const duration = existingJourneyDurationMinutes(leg.durationMinutes, null);
  if (duration == null) {
    return isPickupInsideUnavailablePeriod(String(leg.tripDate || ""), String(leg.tripTime || ""), period);
  }
  const journeyStart = pickup.getTime();
  const journeyEnd = journeyStart + duration * 60 * 1000;
  return journeyWindowOverlapsUnavailablePeriod(journeyStart, journeyEnd, period);
}

export function findConflictingNoAvailabilityPeriod(
  booking: OwnerAvailabilityBooking,
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): UnavailablePeriod | null {
  if (!periods?.length) return null;
  const legs = ownerAvailabilityLegsFromBooking(booking);
  if (!legs.length) return null;
  for (const period of periods) {
    if (isUnavailablePeriodExpired(period, now)) continue;
    if (!isNoAvailabilityPeriod(period)) continue;
    if (legs.some((leg) => legConflictsWithNoAvailability(leg, period))) {
      return period;
    }
  }
  return null;
}

export function evaluateOwnerNoAvailability(
  booking: OwnerAvailabilityBooking,
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): PublicOwnerAvailability {
  return findConflictingNoAvailabilityPeriod(booking, periods, now)
    ? blockedPublicOwnerAvailability()
    : emptyPublicOwnerAvailability();
}

export class OwnerNoAvailabilityError extends Error {
  readonly code = OWNER_NO_AVAILABILITY_CODE;
  constructor(message = OWNER_NO_AVAILABILITY_MESSAGE) {
    super(message);
    this.name = "OwnerNoAvailabilityError";
  }
}

/** Active = not yet expired (end still in the future). May start in the future. */
export function listActiveUnavailablePeriods(
  periods: UnavailablePeriod[] | null | undefined,
  now = new Date(),
): UnavailablePeriod[] {
  if (!periods?.length) return [];
  return periods.filter((period) => !isUnavailablePeriodExpired(period, now));
}

export function formatLondonLocalLabel(value: string | null | undefined): string | null {
  const normalized = normalizeLondonLocalDateTime(value);
  if (!normalized) return null;
  const [ymd, hm] = normalized.split("T");
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const dayPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(",", "");
  return `${dayPart} · ${hm}`;
}

export function formatUnavailablePeriodRangeLabel(
  period: Pick<UnavailablePeriod, "startLocal" | "endLocal">,
): string {
  const start = formatLondonLocalLabel(period.startLocal) ?? period.startLocal;
  const end = formatLondonLocalLabel(period.endLocal) ?? period.endLocal;
  return `${start} → ${end}`;
}

/** @deprecated Legacy single-gate helpers — kept as thin wrappers during migration tests. */
export function isAutomaticAvailabilityGateActive(
  availableFrom: string | null | undefined,
  now = new Date(),
): boolean {
  const from = parseLondonLocalStored(availableFrom);
  if (!from) return false;
  return from.getTime() > now.getTime();
}

/** @deprecated */
export function isPickupBeforeAutomaticAvailability(
  tripDate: string,
  tripTime: string,
  availableFrom: string | null | undefined,
  now = new Date(),
): boolean {
  const normalized = normalizeLondonLocalDateTime(availableFrom);
  if (!normalized || !isAutomaticAvailabilityGateActive(normalized, now)) return false;
  // Approximate old "available from" as one period from epoch → availableFrom
  return isPickupBlockedByUnavailablePeriods(
    tripDate,
    tripTime,
    [
      {
        id: "legacy",
        startLocal: "1970-01-01T00:00",
        endLocal: normalized,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
    now,
  );
}

/** @deprecated */
export function formatAutomaticAvailabilityLabel(
  availableFrom: string | null | undefined,
): string | null {
  return formatLondonLocalLabel(availableFrom);
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

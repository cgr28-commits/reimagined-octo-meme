/**
 * Owner unavailable booking periods + service labels (Europe/London).
 * SumUp is blocked only when outbound pickup falls inside an active period.
 * Expired periods (now >= end) are ignored — no KV write required to expire.
 */

import { parseLondonLocalDateTime, parseLondonLocalIso, UK_TIME_ZONE } from "./uk-time";

export type BookableServiceCode = "SALOON" | "ESTATE" | "MINIBUS";

/** Europe/London wall clock `YYYY-MM-DDTHH:mm`. */
export type LondonLocalDateTime = string;

export type UnavailablePeriodInput = {
  id?: string;
  startLocal: string;
  endLocal: string;
  /** Private Owner note — never shown to customers. */
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UnavailablePeriod = {
  id: string;
  startLocal: LondonLocalDateTime;
  endLocal: LondonLocalDateTime;
  note?: string;
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
  return {
    id: String(raw.id ?? "").trim() || generateUnavailablePeriodId(now),
    startLocal,
    endLocal,
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

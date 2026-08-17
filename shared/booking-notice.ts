/**
 * Minimum online booking notice + service labels (Europe/London).
 * Default notice hours live in booking settings KV — call sites must not hard-code 6.
 */

import { parseLondonLocalDateTime } from "./uk-time";

export const DEFAULT_MINIMUM_ONLINE_NOTICE_HOURS = 6;

export type BookableServiceCode = "SALOON" | "ESTATE" | "MINIBUS";

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
 * True when pickup (Europe/London wall clock) is at least `hours` ahead of `now`.
 * Exactly N hours ahead → true (auto-pay allowed). Strictly less → short-notice.
 */
export function isPickupAtLeastHoursAhead(
  tripDate: string,
  tripTime: string,
  hours: number,
  now = new Date(),
): boolean {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickup) return false;
  const ms = Number(hours) * 60 * 60 * 1000;
  if (!Number.isFinite(ms) || ms < 0) return false;
  return pickup.getTime() - now.getTime() >= ms;
}

export function isShortNoticePickup(
  tripDate: string,
  tripTime: string,
  minimumNoticeHours: number,
  now = new Date(),
): boolean {
  return !isPickupAtLeastHoursAhead(tripDate, tripTime, minimumNoticeHours, now);
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
    // Very tight window: keep until pickup (capped) or 15 minutes, whichever is sooner.
    expires =
      pickup.getTime() < fifteenMinutesAfterApproval.getTime() ? pickup : fifteenMinutesAfterApproval;
  }
  if (pickup && expires.getTime() > pickup.getTime()) {
    expires = pickup;
  }
  return expires.toISOString();
}

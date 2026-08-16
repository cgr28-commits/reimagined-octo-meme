/**
 * Canonical business mailbox helpers — re-exports central email config.
 */
export {
  BUSINESS_NAME,
  DEFAULT_BOOKING_FROM_EMAIL as BUSINESS_MAILBOX,
  DEFAULT_BOOKING_FROM_EMAIL,
  DEFAULT_BOOKING_NOTIFICATION_EMAIL,
  resolveBookingFromEmail,
  resolveBookingNotificationEmail,
} from "./email-config";

import {
  DEFAULT_BOOKING_FROM_EMAIL,
  resolveBookingFromEmail,
} from "./email-config";

/** Prefer the configured From address; falls back to bookings@. */
export function businessMailbox(candidate?: string | null): string {
  return resolveBookingFromEmail({ BOOKING_FROM_EMAIL: candidate ?? undefined });
}

export function isBusinessMailbox(email: string | null | undefined): boolean {
  const normalised = (email ?? "").trim().toLowerCase();
  return (
    normalised === DEFAULT_BOOKING_FROM_EMAIL.toLowerCase() ||
    normalised === businessMailbox().toLowerCase()
  );
}

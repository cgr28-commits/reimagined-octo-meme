/**
 * CENTRAL EMAIL CONFIG — From address, branding, and notification recipient defaults.
 * Change sender / branding here (or via env) without rewriting booking UI.
 */

export const BUSINESS_NAME = "My Airport Taxi NI";
export const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
export const BUSINESS_WEBSITE_DISPLAY = "www.myairporttaxini.co.uk";
export const BUSINESS_PHONE_DISPLAY = "028 9602 2952";
export const BUSINESS_WHATSAPP_HANDLE = "@belfasttaxi";
export const BUSINESS_TAGLINE =
  "Secure airport transfers across Northern Ireland and beyond.";

/** Default transactional From address (must be on a Resend-verified domain). */
export const DEFAULT_BOOKING_FROM_EMAIL = "bookings@myairporttaxini.co.uk";

/**
 * Default business notification inbox.
 * Prefer BOOKING_NOTIFICATION_EMAIL (or BOOKING_TO_EMAIL) in the environment —
 * never put a private personal address in source.
 */
export const DEFAULT_BOOKING_NOTIFICATION_EMAIL = "bookings@myairporttaxini.co.uk";

export const BRAND = {
  navy: "#071C38",
  emerald: "#2FBF4A",
  white: "#FFFFFF",
  text: "#1a2b3c",
  muted: "#64748b",
  cardBg: "#FFFFFF",
  pageBg: "#f4f6f8",
} as const;

export const LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;

export type EmailEnvLike = {
  BOOKING_FROM_EMAIL?: string;
  BOOKING_NOTIFICATION_EMAIL?: string;
  BOOKING_TO_EMAIL?: string;
  RESEND_API_KEY?: string;
};

export function resolveBookingFromEmail(env?: EmailEnvLike | null): string {
  const from = env?.BOOKING_FROM_EMAIL?.trim();
  return from || DEFAULT_BOOKING_FROM_EMAIL;
}

export function resolveBookingFromHeader(env?: EmailEnvLike | null): string {
  return `${BUSINESS_NAME} <${resolveBookingFromEmail(env)}>`;
}

export function resolveBookingNotificationEmail(env?: EmailEnvLike | null): string {
  return (
    env?.BOOKING_NOTIFICATION_EMAIL?.trim() ||
    env?.BOOKING_TO_EMAIL?.trim() ||
    DEFAULT_BOOKING_NOTIFICATION_EMAIL
  );
}

export function resolveResendApiKey(env?: EmailEnvLike | null): string {
  return env?.RESEND_API_KEY?.trim() || "";
}

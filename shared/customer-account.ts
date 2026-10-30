/**
 * Customer "My bookings" area — passwordless sign-in with a 6-digit email code.
 *
 * An "account" is simply an email address that has booked with us: no password, no
 * separate sign-up. Guest booking is unchanged. Shared types and pure helpers live here
 * so the Worker and the website agree on shapes.
 */

export const CUSTOMER_LOGIN_CODE_LENGTH = 6;
export const CUSTOMER_LOGIN_CODE_TTL_SECONDS = 10 * 60;
export const CUSTOMER_LOGIN_MAX_VERIFY_ATTEMPTS = 5;
export const CUSTOMER_LOGIN_MAX_CODES_PER_HOUR = 5;
export const CUSTOMER_LOGIN_MAX_REQUESTS_PER_IP_PER_HOUR = 30;
export const CUSTOMER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type CustomerBookingStatus = "upcoming" | "completed" | "cancelled";

/** One booking as shown in My bookings — never includes payment ids or internal notes. */
export type CustomerBookingSummary = {
  reference: string;
  status: CustomerBookingStatus;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  vehicle?: string;
  flightNumber?: string;
  totalFare?: number;
  manageUrl?: string;
};

export type CustomerProfile = {
  email: string;
  name: string;
  mobile: string;
};

export type CustomerBookingsResponse = {
  profile: CustomerProfile;
  bookings: CustomerBookingSummary[];
};

export function normalizeCustomerEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length > 254) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeCustomerLoginCode(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === CUSTOMER_LOGIN_CODE_LENGTH ? digits : "";
}

export function normalizeCustomerSessionToken(raw: unknown): string {
  const token = String(raw ?? "").trim().toLowerCase();
  return /^[a-f0-9]{48,96}$/.test(token) ? token : "";
}

export function buildCustomerLoginCodeEmail(input: {
  code: string;
  name?: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const site = (input.siteUrl || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
  const first = input.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const subject = `${input.code} is your My Airport Taxi NI sign-in code`;
  const text =
    `${greeting}\n\n` +
    `Your code to sign in to My bookings is: ${input.code}\n\n` +
    `It expires in 10 minutes. If you didn't ask for this, you can ignore this email — ` +
    `nobody can sign in without the code.\n\n` +
    `My Airport Taxi NI · ${site}`;
  const html =
    `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d2433;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">` +
    `<tr><td style="background:#0b1b33;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">My Airport Taxi NI</td></tr>` +
    `<tr><td style="padding:24px;font-size:15px;line-height:1.55;">` +
    `<p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>` +
    `<p style="margin:0 0 14px;">Your code to sign in to <strong>My bookings</strong> is:</p>` +
    `<p style="margin:0 0 18px;font-size:32px;font-weight:bold;letter-spacing:6px;color:#0b1b33;">${escapeHtml(input.code)}</p>` +
    `<p style="margin:0 0 14px;">It expires in 10 minutes.</p>` +
    `<p style="margin:0;color:#6b7280;font-size:13px;">If you didn't ask for this, you can ignore this email — nobody can sign in without the code.</p>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Opaque Manage Booking access tokens for secure email deep-links.
 * Tokens are random, long, and never derived from MAT-#### / email / SumUp ids.
 */

const TOKEN_BYTES = 24;

/** Generate a cryptographically random manage-booking token (hex). */
export function generateManageBookingToken(bytes = TOKEN_BYTES): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalize a token from a query string (trim + lowercase hex). */
export function normalizeManageBookingToken(raw: string): string {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{32,96}$/.test(trimmed)) return "";
  return trimmed;
}

/** Public manage-booking URL with opaque token (preferred). */
export function buildManageBookingUrl(siteOrigin: string, token: string): string {
  const origin = siteOrigin.replace(/\/$/, "") || "https://www.myairporttaxini.co.uk";
  const normalized = normalizeManageBookingToken(token);
  if (!normalized) return `${origin}/manage-booking/`;
  return `${origin}/manage-booking/?token=${encodeURIComponent(normalized)}`;
}

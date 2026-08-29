/**
 * Privacy-safe partial vehicle registration for customer-facing notifications.
 * Full registration remains stored internally; only this helper should format customer copy.
 *
 * Examples:
 *   AB12 CDE → AB12…
 *   ABC 1234 → ABC…
 *   AB12CDE  → AB12…
 */

export function formatPartialRegistration(registration: string | null | undefined): string {
  const cleaned = String(registration ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (!cleaned) {
    return "";
  }

  const firstToken = cleaned.split(" ")[0] ?? "";
  if (!firstToken) {
    return "";
  }

  // Compact plates without a space: expose only the first four characters.
  if (!cleaned.includes(" ") && firstToken.length > 4) {
    return `${firstToken.slice(0, 4)}…`;
  }

  return `${firstToken}…`;
}

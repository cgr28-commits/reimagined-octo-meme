/**
 * Live payments are switched off on Vercel preview sites (*.vercel.app), which reach the same live
 * booking service and Stripe account as the real website. The real site
 * (www.myairporttaxini.co.uk), local development and automated tests are not affected.
 */
export const PREVIEW_PAYMENTS_DISABLED_MESSAGE =
  "Live payments are switched off on this preview site. Nothing has been booked or charged. To book, please use www.myairporttaxini.co.uk.";

export function previewPaymentsDisabled(hostname?: string | null): boolean {
  let current = "";
  try {
    // Defensive: some test harnesses provide a partial window without location.
    current = typeof window !== "undefined" ? window.location?.hostname ?? "" : "";
  } catch {
    current = "";
  }
  const host = String(hostname ?? current)
    .toLowerCase()
    .split(":")[0]
    .trim();
  return host.endsWith(".vercel.app");
}

/**
 * Live payments are switched off on Vercel preview sites (*.vercel.app), which reach the same live
 * booking service and Stripe account as the real website. The real site
 * (www.myairporttaxini.co.uk), local development and automated tests are not affected.
 */
export const PREVIEW_PAYMENTS_DISABLED_MESSAGE =
  "Live payments are switched off on this preview site. Nothing has been booked or charged. To book, please use www.myairporttaxini.co.uk.";

export function previewPaymentsDisabled(hostname?: string | null): boolean {
  const host = String(hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .toLowerCase()
    .split(":")[0]
    .trim();
  return host.endsWith(".vercel.app");
}

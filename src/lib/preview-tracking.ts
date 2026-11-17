import { previewPaymentsDisabled } from "@/lib/preview-payments";

/**
 * Preview copies of the site only — Vercel design previews (*.vercel.app) and the Cloudflare
 * Pages preview links (*.pages.dev): no Google tag, Ads conversions, remarketing or ad-fraud
 * events, so preview testing can never be counted as real advertising activity.
 * The live site (www.myairporttaxini.co.uk), local development and CI are never matched,
 * so production tracking, attribution and consent behaviour are unchanged.
 */
export function previewTrackingDisabled(hostname?: string | null): boolean {
  return previewPaymentsDisabled(hostname) || cloudflarePagesPreviewHost(hostname);
}

/**
 * Cloudflare Pages links (…pages.dev) are only ever preview or staging copies of the site —
 * the live site is never served from one. Tracking only: payments and notifications on these
 * links keep their own switches (preview-payments / preview-notifications).
 */
function cloudflarePagesPreviewHost(hostname?: string | null): boolean {
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
  return host.endsWith(".pages.dev");
}

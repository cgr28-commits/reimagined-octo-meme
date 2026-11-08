import { previewPaymentsDisabled } from "@/lib/preview-payments";

/**
 * Vercel design previews (*.vercel.app) only: no Google tag, Ads conversions, remarketing or
 * ad-fraud events, so preview testing can never be counted as real advertising activity.
 * The live site (www.myairporttaxini.co.uk), local development and CI are never matched,
 * so production tracking, attribution and consent behaviour are unchanged.
 */
export function previewTrackingDisabled(hostname?: string | null): boolean {
  return previewPaymentsDisabled(hostname);
}

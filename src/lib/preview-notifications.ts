import { previewPaymentsDisabled } from "@/lib/preview-payments";

/**
 * Vercel design previews (*.vercel.app) only. The live site (www.myairporttaxini.co.uk,
 * GitHub Pages) and local/CI hosts are never matched, so production behaviour is unchanged.
 */
export const PREVIEW_NOTIFICATIONS_DISABLED_MESSAGE =
  "Emails and enquiries are switched off on this preview site. Nothing has been sent. To contact us, please use www.myairporttaxini.co.uk.";

export function previewNotificationsDisabled(hostname?: string | null): boolean {
  return previewPaymentsDisabled(hostname);
}

/** Throws before any network request when running on a Vercel preview. */
export function assertPreviewNotificationsAllowed(): void {
  if (previewNotificationsDisabled()) throw new Error(PREVIEW_NOTIFICATIONS_DISABLED_MESSAGE);
}

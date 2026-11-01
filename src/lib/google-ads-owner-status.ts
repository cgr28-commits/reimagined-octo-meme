/**
 * Read-only owner-dashboard labels for the stored Paid Booking upload status.
 * Does not upload, retry, or change the numeric conversion.
 */

export type OwnerGoogleAdsPaidConversionLabel =
  | "Sent"
  | "In daily Google Ads file"
  | "Not sendable (app click ID)"
  | "Failed"
  | "Missing configuration"
  | "No captured click ID"
  | "Not recorded";

/** Google refused API production access; such bookings still go out in the daily file. */
export function isApiNotApprovedError(lastError: string | null | undefined): boolean {
  return /CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION/i.test(lastError ?? "");
}

export function ownerGoogleAdsPaidConversionLabel(
  status: string | null | undefined,
  clickIdCaptured: boolean,
  clickIdType?: string | null,
  lastError?: string | null,
): OwnerGoogleAdsPaidConversionLabel {
  if (status === "sent" || status === "skipped_duplicate") return "Sent";
  if (status === "queued_daily_file") return "In daily Google Ads file";
  if (status === "skipped_daily_file_unsupported") return "Not sendable (app click ID)";
  if (status === "failed" && isApiNotApprovedError(lastError)) {
    return clickIdType === "gclid" ? "In daily Google Ads file" : "Not sendable (app click ID)";
  }
  if (status === "failed") return "Failed";
  if (status === "skipped_not_configured") return "Missing configuration";
  if (status === "skipped_no_click_id" || !clickIdCaptured) return "No captured click ID";
  return "Not recorded";
}

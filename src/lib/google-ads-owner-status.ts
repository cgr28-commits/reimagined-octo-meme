/**
 * Read-only owner-dashboard labels for the stored Paid Booking upload status.
 * Does not upload, retry, or change the numeric conversion.
 */

export type OwnerGoogleAdsPaidConversionLabel =
  | "Consent unavailable or withdrawn"
  | "Cancelled / refunded"
  | "Sent"
  | "Failed"
  | "Missing configuration"
  | "No captured click ID"
  | "Not recorded";

export function ownerGoogleAdsPaidConversionLabel(
  status: string | null | undefined,
  clickIdCaptured: boolean,
): OwnerGoogleAdsPaidConversionLabel {
  if (status === "skipped_no_consent")
    return "Consent unavailable or withdrawn";
  if (status === "skipped_cancelled") return "Cancelled / refunded";
  if (status === "sent" || status === "skipped_duplicate") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped_not_configured") return "Missing configuration";
  if (status === "skipped_no_click_id" || !clickIdCaptured)
    return "No captured click ID";
  return "Not recorded";
}

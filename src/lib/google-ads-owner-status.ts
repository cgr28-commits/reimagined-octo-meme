/**
 * Read-only owner-dashboard labels for the stored Paid Booking upload status.
 * Does not upload, retry, or change the numeric conversion.
 */

export type OwnerGoogleAdsPaidConversionLabel =
  | "Sent"
  | "Failed"
  | "Missing configuration"
  | "No captured click ID"
  | "Not recorded"
  | "Consent rejected"
  | "Consent not answered"
  | "Reason unknown";

export function ownerGoogleAdsPaidConversionLabel(
  status: string | null | undefined,
  clickIdCaptured: boolean,
  attributionOutcome?: string | null,
): OwnerGoogleAdsPaidConversionLabel {
  if (status === "sent" || status === "skipped_duplicate") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped_not_configured") return "Missing configuration";
  if (attributionOutcome === "consent_rejected") return "Consent rejected";
  if (attributionOutcome === "consent_unanswered") return "Consent not answered";
  if (attributionOutcome === "no_click_id") return "No captured click ID";
  if (attributionOutcome === "click_id_captured" && clickIdCaptured) return "Not recorded";
  if (!attributionOutcome && !clickIdCaptured) return "Reason unknown";
  if (clickIdCaptured) return "Not recorded";
  return "Reason unknown";
}

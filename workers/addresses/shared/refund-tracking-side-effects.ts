/**
 * Pure helper: when should completeRefundSideEffects mark tracking jobs?
 * Real customer keep-active refunds stay journey-live (no tracking stamp).
 * Owner isRefundTest keep-active refunds MUST stamp tracking so isolation
 * harness can verify pairedToken bleed does not hit the decoy.
 */
export function shouldMarkTrackingJobsOnRefundSideEffects(input: {
  cancelBooking: boolean;
  isRefundTest?: boolean | null;
}): boolean {
  return input.cancelBooking === true || input.isRefundTest === true;
}

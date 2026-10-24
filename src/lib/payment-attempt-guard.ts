/** Tab-local safety net; server coordinator remains authoritative across tabs/devices. */
const KEY = "matni-payment-outcome-pending-v1";
export const PAYMENT_UNCERTAIN_MESSAGE =
  "We couldn't confirm whether your payment link was created. Your booking details are saved. Please contact My Airport Taxi NI to check before starting another payment.";
export class PaymentOutcomeUncertainError extends Error {
  constructor() { super(PAYMENT_UNCERTAIN_MESSAGE); }
}
export function hasUncertainPayment(): boolean {
  try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(KEY) === "pending"; }
  catch { return false; }
}
export function markPaymentPending(): void {
  try { sessionStorage.setItem(KEY, "pending"); } catch { /* Server still protects duplicates. */ }
}
export function clearPaymentPending(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* No sensitive data is stored. */ }
}

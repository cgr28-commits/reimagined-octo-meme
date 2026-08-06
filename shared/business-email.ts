/** Canonical business mailbox for My Airport Taxi NI — all site mail uses this. */
export const BUSINESS_MAILBOX = "bookings@myairporttaxini.co.uk";
export const BUSINESS_NAME = "My Airport Taxi NI";

/** Always bookings@ — ignore env overrides that point elsewhere. */
export function businessMailbox(_candidate?: string | null): string {
  return BUSINESS_MAILBOX;
}

export function isBusinessMailbox(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === BUSINESS_MAILBOX;
}

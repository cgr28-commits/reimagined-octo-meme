/**
 * First token of a customer name for greetings.
 * Returns "" when the booking has no usable name — never "undefined" or "null".
 */
export function customerGreetingFirstName(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "";
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (!first || /^undefined$/i.test(first) || /^null$/i.test(first)) return "";
  return first;
}

/** Booking-confirmation heading only. Full name stays on the booking record. */
export function bookingConfirmationThankYouHeading(fullName: string | null | undefined): string {
  const first = customerGreetingFirstName(fullName);
  return first ? `Thank you, ${first}` : "Thank you";
}

export const STARTING_BOOKING_REF = 1001;

export function formatBookingReference(refNumber: number): string {
  return `MATNI-${refNumber}`;
}

export function prependBookingReference(message: string, bookingReference: string): string {
  return `Booking reference: ${bookingReference}\n\n${message}`;
}

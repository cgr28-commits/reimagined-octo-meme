export type PaidBookingDetails = {
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate: string;
  returnTime: string;
  flightNumber: string;
  returnFlightNumber?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
};

export type PaidBookingReceipt = PaidBookingDetails & {
  amountPaid: string;
  paymentReference: string;
  transactionCode?: string;
  checkoutReference?: string;
};

function formatTripSchedule(details: PaidBookingDetails): string {
  const lines = [
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date" : "Date"}: ${details.tripDate}`,
    `${details.returnJourney ? "Outbound time" : "Time"}: ${details.tripTime}`,
  ];

  if (details.returnJourney) {
    lines.push(`Return date: ${details.returnDate}`, `Return time: ${details.returnTime}`);
  }

  if (details.isAirportTrip && details.flightNumber) {
    lines.push(`Flight number for going: ${details.flightNumber}`);
  }

  if (details.isAirportTrip && details.returnFlightNumber) {
    lines.push(`Flight number for collection: ${details.returnFlightNumber}`);
  }

  lines.push(
    `Passengers: ${details.passengers}`,
    `Suitcases: ${details.suitcases}`,
    `Vehicle: ${details.vehicle}`,
  );

  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} · ${details.journeyDuration}`);
  }

  return lines.join("\n");
}

export function buildCustomerConfirmationEmail(
  details: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
): { subject: string; body: string } {
  const subject = `Booking confirmed — ${businessName}`;

  const body =
    `Dear ${details.customerName},\n\n` +
    `Thank you for your booking with ${businessName}. Your card payment has been received and your transfer is confirmed.\n\n` +
    `BOOKING DETAILS\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT RECEIPT\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    `Payment reference: ${details.paymentReference}\n` +
    (details.transactionCode ? `Transaction code: ${details.transactionCode}\n` : "") +
    `Payment method: Card (SumUp)\n\n` +
    `We will contact you if we need any further information before your journey.\n\n` +
    `If you have questions, reply to this email or contact us at bookings@myairporttaxini.co.uk.\n\n` +
    `${businessName}`;

  return { subject, body };
}

export function buildOwnerPaidBookingEmail(
  details: PaidBookingReceipt,
  businessName = "My Airport Taxi NI",
): { subject: string; body: string } {
  const subject = `Paid booking — ${details.customerName} — ${details.amountPaid}`;

  const body =
    `New paid booking via ${businessName} website.\n\n` +
    `CUSTOMER\n` +
    `${"=".repeat(40)}\n` +
    `Name: ${details.customerName}\n` +
    `Email: ${details.customerEmail}\n` +
    `Mobile: ${details.mobileNumber || "Not provided"}\n\n` +
    `TRIP\n` +
    `${"=".repeat(40)}\n` +
    `${formatTripSchedule(details)}\n\n` +
    `PAYMENT\n` +
    `${"=".repeat(40)}\n` +
    `Amount paid: ${details.amountPaid}\n` +
    `Payment reference: ${details.paymentReference}\n` +
    (details.transactionCode ? `Transaction code: ${details.transactionCode}\n` : "") +
    (details.checkoutReference ? `Checkout reference: ${details.checkoutReference}\n` : "") +
    `Status: PAID (verified via SumUp)`;

  return { subject, body };
}

export function formatPaidAmount(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

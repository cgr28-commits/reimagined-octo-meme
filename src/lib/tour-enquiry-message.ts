import { formatUkDate, formatUkSubmissionTime } from "@/lib/format-datetime";

export type TourEnquiryDetails = {
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tourTitle: string;
  travelDate: string;
  groupSize: number;
  pickupLocation: string;
  notes: string;
  bookingReference?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
};

export function buildTourEnquiryMessage(
  details: TourEnquiryDetails,
  bookingReference?: string,
): string {
  const reference = bookingReference ?? details.bookingReference;

  return (
    `Hi, I would like to book the following day trip. A payment link will follow shortly.\n\n` +
    (reference ? `Booking reference: ${reference}\n` : "") +
    `Name: ${details.customerName}\n` +
    (details.customerEmail ? `Email: ${details.customerEmail}\n` : "") +
    (details.mobileNumber ? `Mobile: ${details.mobileNumber}\n` : "") +
    `Day trip: ${details.tourTitle}\n` +
    `Preferred date: ${formatUkDate(details.travelDate)}\n` +
    `Group size: ${details.groupSize}\n` +
    `Pickup location: ${details.pickupLocation}\n` +
    (details.notes ? `Notes: ${details.notes}\n` : "") +
    (details.termsAcceptedAt
      ? `Terms accepted: ${details.termsAcceptedAt}${details.termsVersion ? ` (${details.termsVersion})` : ""}\n`
      : "") +
    `Submitted: ${formatUkSubmissionTime()}\n`
  );
}

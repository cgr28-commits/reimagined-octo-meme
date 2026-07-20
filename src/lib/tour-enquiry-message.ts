export type TourEnquiryDetails = {
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  tourTitle: string;
  travelDate: string;
  groupSize: number;
  pickupLocation: string;
  notes: string;
};

export function buildTourEnquiryMessage(details: TourEnquiryDetails): string {
  return (
    `Hi, I would like to book the following day trip. A payment link will follow shortly.\n\n` +
    `Name: ${details.customerName}\n` +
    (details.customerEmail ? `Email: ${details.customerEmail}\n` : "") +
    (details.mobileNumber ? `Mobile: ${details.mobileNumber}\n` : "") +
    `Day trip: ${details.tourTitle}\n` +
    `Preferred date: ${details.travelDate}\n` +
    `Group size: ${details.groupSize}\n` +
    `Pickup location: ${details.pickupLocation}\n` +
    (details.notes ? `Notes: ${details.notes}\n` : "")
  );
}

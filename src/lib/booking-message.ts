export type BookingDetails = {
  customerName: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate: string;
  returnTime: string;
  flightNumber: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  estimatedPrice: string | null;
  isAirportTrip: boolean;
};

export function buildBookingMessage(details: BookingDetails): string {
  return (
    `Hi, I would like to book the following. A payment link will follow shortly.\n\n` +
    `Name: ${details.customerName}\n` +
    `Trip: ${details.tripLabel}\n` +
    `Pickup: ${details.pickupLabel}\n` +
    `Drop-off: ${details.dropoffLabel}\n` +
    `Return journey: ${details.returnJourney ? "Yes" : "No"}\n` +
    `${details.returnJourney ? "Outbound date" : "Date"}: ${details.tripDate}\n` +
    `${details.returnJourney ? "Outbound time" : "Time"}: ${details.tripTime}\n` +
    (details.returnJourney
      ? `Return date: ${details.returnDate}\nReturn time: ${details.returnTime}\n`
      : "") +
    (details.isAirportTrip && details.flightNumber
      ? `Flight number: ${details.flightNumber}\n`
      : "") +
    `Passengers: ${details.passengers}\n` +
    `Suitcases: ${details.suitcases}\n` +
    `Vehicle: ${details.vehicle}\n` +
    (details.estimatedPrice
      ? `Estimated price: ${details.estimatedPrice}\n`
      : !details.isAirportTrip
        ? "Please provide a personal quote for this journey.\n"
        : "")
  );
}

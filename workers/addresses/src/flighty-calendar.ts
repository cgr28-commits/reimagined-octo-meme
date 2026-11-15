/**
 * Adds a flight-shaped Google Calendar entry ("IB1885 MAD to DUB") for each
 * airport collection with a flight number, so Flighty (which scans the owner's
 * calendar for flights) tracks the customer's flight automatically.
 */
import { lookupFlight, normalizeFlightNumber, type VerifiedFlight } from "../shared/flight-lookup";
import { createFlightCalendarEvent } from "./google-calendar";

export type FlightyBookingInput = {
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
};

export type AirportCollectionLeg = {
  leg: "outbound" | "return";
  flightNumber: string;
  date: string;
  pickupTime: string;
  airportCode: string;
  airportName: string;
};

const AIRPORTS: Array<{ code: string; name: string; pattern: RegExp }> = [
  { code: "DUB", name: "Dublin Airport", pattern: /dublin airport/i },
  { code: "BHD", name: "George Best Belfast City Airport", pattern: /belfast city airport|george best/i },
  { code: "BFS", name: "Belfast International Airport", pattern: /belfast international|aldergrove/i },
  { code: "LDY", name: "City of Derry Airport", pattern: /derry airport|city of derry/i },
];

export function airportForLabel(label: string | undefined): { code: string; name: string } | null {
  if (!label) return null;
  const hit = AIRPORTS.find((a) => a.pattern.test(label));
  return hit ? { code: hit.code, name: hit.name } : null;
}

/** Legs where we collect a customer from an airport and know their flight. */
export function airportCollectionLegs(booking: FlightyBookingInput): AirportCollectionLeg[] {
  const legs: AirportCollectionLeg[] = [];
  const outAirport = airportForLabel(booking.pickupLabel);
  const outFlight = normalizeFlightNumber(booking.flightNumber ?? "");
  if (outAirport && outFlight && booking.tripDate) {
    legs.push({
      leg: "outbound",
      flightNumber: outFlight,
      date: booking.tripDate,
      pickupTime: booking.tripTime,
      airportCode: outAirport.code,
      airportName: outAirport.name,
    });
  }
  // Return leg collects from the outbound drop-off.
  const retAirport = airportForLabel(booking.dropoffLabel);
  const retFlight = normalizeFlightNumber(booking.returnFlightNumber ?? "");
  if (booking.returnJourney && retAirport && retFlight && booking.returnDate) {
    legs.push({
      leg: "return",
      flightNumber: retFlight,
      date: booking.returnDate,
      pickupTime: booking.returnTime ?? "",
      airportCode: retAirport.code,
      airportName: retAirport.name,
    });
  }
  return legs;
}

export function flightyEventTitle(flightNumber: string, flight: VerifiedFlight): string | null {
  if (!flight.departureIata || !flight.arrivalIata) return null;
  return `${normalizeFlightNumber(flightNumber)} ${flight.departureIata} to ${flight.arrivalIata}`;
}

export async function logFlightyFlightEvents(input: {
  accessToken: string;
  calendarId: string;
  apiKey: string | undefined;
  booking: FlightyBookingInput;
  paymentReference: string;
}): Promise<{ eventIds: string[]; skipped: string[] }> {
  const eventIds: string[] = [];
  const skipped: string[] = [];
  for (const leg of airportCollectionLegs(input.booking)) {
    const lookup = await lookupFlight(input.apiKey, {
      flightNumber: leg.flightNumber,
      tripDate: leg.date,
      airportCode: leg.airportCode,
      airportName: leg.airportName,
      direction: "from-airport",
    });
    if (!lookup.ok) {
      skipped.push(`${leg.leg}:${lookup.code}`);
      continue;
    }
    const flight = lookup.flight;
    const title = flightyEventTitle(leg.flightNumber, flight);
    if (!title || !flight.departureScheduledUtc || !flight.arrivalScheduledUtc) {
      skipped.push(`${leg.leg}:incomplete`);
      continue;
    }
    const id = await createFlightCalendarEvent(input.accessToken, input.calendarId, {
      summary: title,
      location: flight.departureAirport,
      startUtc: flight.departureScheduledUtc,
      endUtc: flight.arrivalScheduledUtc,
      description:
        `Flight ${title} (${flight.airline}).\n` +
        `Customer pickup: ${input.booking.customerName}, ${leg.date} ${leg.pickupTime} at ${leg.airportName}.\n` +
        `Payment reference: ${input.paymentReference}\n` +
        `Added for flight tracking by My Airport Taxi NI.`,
    });
    if (id) eventIds.push(id);
  }
  return { eventIds, skipped };
}

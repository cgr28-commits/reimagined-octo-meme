/**
 * Adds a flight-shaped Google Calendar entry ("IB1885 MAD to DUB") for each
 * airport collection with a flight number, so Flighty (which scans the owner's
 * calendar for flights) tracks the customer's flight automatically.
 */
import {
  lookupFlight,
  normalizeFlightNumber,
  type VerifiedFlight,
} from "../shared/flight-lookup";
import {
  createFlightCalendarEvent,
  getGoogleAccessToken,
  parseServiceAccountJson,
} from "./google-calendar";

const FLIGHTY_MARKER = "Added for flight tracking by My Airport Taxi NI.";

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

/** "IB1885" / "IB 1885" -> "IB 1885"; "EZY3022" -> "EZY 3022". Prefers the 2-character IATA airline code. */
export function splitFlightDesignator(value: string): string {
  const v = normalizeFlightNumber(value);
  const iata = v.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4}[A-Z]?)$/);
  if (iata) return `${iata[1]} ${iata[2]}`;
  const icao = v.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (icao) return `${icao[1]} ${icao[2]}`;
  return v;
}

/** Use the IATA designator the lookup confirmed ("U2 3022"), not what the customer typed ("EZY3022"). */
function designatorFor(typed: string, flight: VerifiedFlight): string {
  const fromLookup = splitFlightDesignator(flight.flightNumber ?? "");
  return /^[A-Z0-9]{2} \d/.test(fromLookup) ? fromLookup : splitFlightDesignator(typed);
}

/**
 * Airline/Google-style flight entry: "Flight to Dublin (IB 1885)", location
 * "Madrid MAD", airline + flight number + departure airport all present (the
 * three fields Flighty's help says an event must contain).
 */
export function buildFlightyEvent(input: {
  typedFlightNumber: string;
  flight: VerifiedFlight;
  leg: AirportCollectionLeg;
  customerName: string;
  paymentReference: string;
}): { summary: string; location: string; description: string; startUtc: string; endUtc: string } | null {
  const { flight, leg } = input;
  if (!flight.departureIata || !flight.arrivalIata) return null;
  if (!flight.departureScheduledUtc || !flight.arrivalScheduledUtc) return null;
  if (Date.parse(flight.arrivalScheduledUtc) <= Date.parse(flight.departureScheduledUtc)) return null;
  const designator = designatorFor(input.typedFlightNumber, flight);
  const depCity = flight.departureCity || flight.departureIata;
  const arrCity = flight.arrivalCity || flight.arrivalIata;
  const airline = flight.airline && flight.airline !== "Airline" ? flight.airline : designator.split(" ")[0];
  const times =
    flight.departureScheduledLocal && flight.arrivalScheduledLocal
      ? `Departs ${depCity} (${flight.departureIata}) ${flight.departureScheduledLocal} local time\n` +
        `Arrives ${arrCity} (${flight.arrivalIata}) ${flight.arrivalScheduledLocal} local time\n`
      : "";
  return {
    summary: `Flight to ${arrCity} (${designator})`,
    location: `${depCity} ${flight.departureIata}`,
    startUtc: flight.departureScheduledUtc,
    endUtc: flight.arrivalScheduledUtc,
    description:
      `${airline} flight ${designator}\n` +
      `${depCity} (${flight.departureIata}) to ${arrCity} (${flight.arrivalIata})\n` +
      times +
      `\nCustomer pickup: ${input.customerName}, ${leg.date} ${leg.pickupTime} at ${leg.airportName}.\n` +
      `Leg: ${leg.leg}\n` +
      `Payment reference: ${input.paymentReference}\n` +
      FLIGHTY_MARKER,
  };
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
    const event = buildFlightyEvent({
      typedFlightNumber: leg.flightNumber,
      flight: lookup.flight,
      leg,
      customerName: input.booking.customerName,
      paymentReference: input.paymentReference,
    });
    if (!event) {
      skipped.push(`${leg.leg}:incomplete`);
      continue;
    }
    const id = await createFlightCalendarEvent(input.accessToken, input.calendarId, event);
    if (id) eventIds.push(id);
  }
  return { eventIds, skipped };
}


export type FlightyEnv = {
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_CALENDAR_ID?: string;
  AERODATABOX_RAPIDAPI_KEY?: string;
  FLIGHTY_CALENDAR_EVENTS?: string;
};

export type FlightyRecord = FlightyBookingInput & {
  paymentReference: string;
  cancelledLegs?: Array<"outbound" | "return">;
};

function flightyEnabled(env: FlightyEnv): boolean {
  return (
    Boolean(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim() && env.GOOGLE_CALENDAR_ID?.trim()) &&
    env.FLIGHTY_CALENDAR_EVENTS?.trim().toLowerCase() !== "false"
  );
}

/** Pure: is this calendar item one of our flight entries for this booking (and leg)? */
export function isFlightyEventFor(
  event: { summary?: string; description?: string; status?: string },
  paymentReference: string,
  leg?: "outbound" | "return",
): boolean {
  const description = event.description ?? "";
  if (event.status === "cancelled") return false;
  if (!description.includes(FLIGHTY_MARKER)) return false;
  if (!description.includes(`Payment reference: ${paymentReference}`)) return false;
  if (leg && !description.includes(`Leg: ${leg}`)) return false;
  return true;
}

async function findFlightyEvents(
  accessToken: string,
  calendarId: string,
  paymentReference: string,
  leg?: "outbound" | "return",
): Promise<string[]> {
  const params = new URLSearchParams({ q: paymentReference, maxResults: "50", singleEvents: "true" });
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Flight entry search failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    items?: Array<{ id?: string; summary?: string; description?: string; status?: string }>;
  };
  return (payload.items ?? [])
    .filter((item) => item.id && isFlightyEventFor(item, paymentReference, leg))
    .map((item) => item.id!);
}

async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Flight entry delete failed (${response.status})`);
  }
}

/** Remove this booking's flight entries (one leg, or all). Never throws. */
export async function removeFlightyFlightEvents(
  env: FlightyEnv,
  paymentReference: string,
  leg?: "outbound" | "return",
): Promise<{ removed: number; error?: string }> {
  if (!flightyEnabled(env) || !paymentReference.trim()) return { removed: 0 };
  try {
    const accessToken = await getGoogleAccessToken(
      parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!),
    );
    const calendarId = env.GOOGLE_CALENDAR_ID!.trim();
    const ids = await findFlightyEvents(accessToken, calendarId, paymentReference.trim(), leg);
    for (const id of ids) await deleteEvent(accessToken, calendarId, id);
    return { removed: ids.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flight entry removal failed";
    console.error("Flighty remove failed", paymentReference, message);
    return { removed: 0, error: message };
  }
}

/**
 * After a booking edit: drop the old flight entries and add fresh ones for the
 * current dates / flight numbers (skipping cancelled legs). Never throws.
 */
export async function resyncFlightyFlightEvents(
  env: FlightyEnv,
  record: FlightyRecord,
): Promise<{ created: number; error?: string }> {
  if (!flightyEnabled(env) || !record.paymentReference?.trim()) return { created: 0 };
  const removed = await removeFlightyFlightEvents(env, record.paymentReference);
  if (removed.error) return { created: 0, error: removed.error };
  try {
    const cancelled = new Set(record.cancelledLegs ?? []);
    const booking: FlightyBookingInput = {
      ...record,
      flightNumber: cancelled.has("outbound") ? undefined : record.flightNumber,
      returnFlightNumber: cancelled.has("return") ? undefined : record.returnFlightNumber,
    };
    const accessToken = await getGoogleAccessToken(
      parseServiceAccountJson(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON!),
    );
    const result = await logFlightyFlightEvents({
      accessToken,
      calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
      apiKey: env.AERODATABOX_RAPIDAPI_KEY,
      booking,
      paymentReference: record.paymentReference.trim(),
    });
    return { created: result.eventIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flight entry resync failed";
    console.error("Flighty resync failed", record.paymentReference, message);
    return { created: 0, error: message };
  }
}

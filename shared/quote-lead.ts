import { formatUkDateTime, formatUkSubmissionTime } from "./uk-time";
import { formatPassengerSuitcaseCounts } from "./party-size";

export type QuoteLeadDetails = {
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  /** Optional — quote tools can show a price before the customer picks a time. */
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  estimatedPrice: string;
  journeyDistance?: string;
  journeyDuration?: string;
  isAirportTrip: boolean;
};

function scheduleLabel(date?: string, time?: string): string {
  const d = date?.trim() ?? "";
  const t = time?.trim() ?? "";
  if (!d || !t) {
    return "Not set";
  }
  return formatUkDateTime(d, t);
}

export function buildQuoteLeadFingerprint(details: QuoteLeadDetails): string {
  return [
    details.tripLabel,
    details.pickupLabel,
    details.dropoffLabel,
    details.returnJourney ? "1" : "0",
    details.tripDate ?? "",
    details.tripTime ?? "",
    details.returnDate ?? "",
    details.returnTime ?? "",
    details.estimatedPrice,
    details.vehicle,
    String(details.passengers),
    String(details.suitcases),
  ]
    .join("|")
    .toLowerCase();
}

export function buildQuoteLeadSubject(details: QuoteLeadDetails): string {
  const route = `${details.pickupLabel} → ${details.dropoffLabel}`;
  const trimmedRoute = route.length > 72 ? `${route.slice(0, 69)}…` : route;
  return `Quote viewed — ${details.estimatedPrice} — ${trimmedRoute}`;
}

export function buildQuoteLeadMessage(details: QuoteLeadDetails): string {
  const lines = [
    "Someone viewed a live quote on the My Airport Taxi NI website.",
    "",
    "TRIP",
    "=".repeat(40),
    `Trip: ${details.tripLabel}`,
    `Pickup: ${details.pickupLabel}`,
    `Drop-off: ${details.dropoffLabel}`,
    `Return journey: ${details.returnJourney ? "Yes" : "No"}`,
    `${details.returnJourney ? "Outbound date & time" : "Date & time"}: ${scheduleLabel(details.tripDate, details.tripTime)}`,
  ];

  if (details.returnJourney) {
    lines.push(
      `Return date & time: ${scheduleLabel(details.returnDate, details.returnTime)}`,
    );
  }

  lines.push(
    `Party size: ${formatPassengerSuitcaseCounts(details.passengers, details.suitcases)}`,
    `Vehicle: ${details.vehicle}`,
    `Your fixed journey price: ${details.estimatedPrice}`,
  );

  if (details.journeyDistance && details.journeyDuration) {
    lines.push(`Journey: ${details.journeyDistance} · ${details.journeyDuration}`);
  }

  lines.push(
    "",
    "Note: No contact details yet — they have not clicked Book.",
    "",
    `Viewed at: ${formatUkSubmissionTime()}`,
  );

  return lines.join("\n");
}

const UK_TIME_ZONE = "Europe/London";

export type QuoteLeadDetails = {
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
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

function formatUkDate(date: string): string {
  if (!date) {
    return "";
  }

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUkTime(time: string): string {
  if (!time) {
    return "";
  }

  const [hours, minutes] = time.split(":");
  const parsed = new Date();
  parsed.setHours(Number(hours), Number(minutes), 0, 0);

  return parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUkDateTime(date: string, time: string): string {
  const formattedDate = formatUkDate(date);
  const formattedTime = formatUkTime(time);

  if (!formattedDate || !formattedTime) {
    return "";
  }

  return `${formattedDate} at ${formattedTime}`;
}

function formatUkSubmissionTime(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function buildQuoteLeadFingerprint(details: QuoteLeadDetails): string {
  return [
    details.tripLabel,
    details.pickupLabel,
    details.dropoffLabel,
    details.returnJourney ? "1" : "0",
    details.tripDate,
    details.tripTime,
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
    `${details.returnJourney ? "Outbound date & time" : "Date & time"}: ${formatUkDateTime(details.tripDate, details.tripTime)}`,
  ];

  if (details.returnJourney && details.returnDate && details.returnTime) {
    lines.push(
      `Return date & time: ${formatUkDateTime(details.returnDate, details.returnTime)}`,
    );
  }

  lines.push(
    `Passengers: ${details.passengers}`,
    `Suitcases: ${details.suitcases}`,
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

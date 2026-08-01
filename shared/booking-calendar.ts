import {
  createCalendarEvent,
  listCalendarEvents,
  type CalendarEventInput,
  type CalendarEventSummary,
  type GoogleServiceAccount,
  getGoogleCalendarAccessToken,
  queryCalendarBusyPeriods,
} from "./google-calendar";

export type StructuredBooking = {
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney?: boolean;
  tripDate: string;
  tripTime: string;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  estimatedPrice?: string | null;
  isAirportTrip?: boolean;
  bookingType?: "transfer" | "day-trip";
  tourTitle?: string;
  notes?: string;
};

export type BookingCalendarSlot = {
  label: string;
  start: string;
  end: string;
};

export type BookingCalendarConflict = {
  label: string;
  start: string;
  end: string;
  overlappingEvents: Array<{
    summary: string;
    start: string;
    end: string;
  }>;
};

export type BookingCalendarResult = {
  configured: boolean;
  eventsCreated: string[];
  conflicts: BookingCalendarConflict[];
};

const TIMEZONE = "Europe/London";
const TRANSFER_DURATION_MINUTES = 90;
const DAY_TRIP_DURATION_HOURS = 10;

function toLocalDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let adjustment = -12; adjustment <= 12; adjustment++) {
    const candidate = new Date(utcGuess + adjustment * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    if (
      Number(values.year) === year &&
      Number(values.month) === month &&
      Number(values.day) === day &&
      Number(values.hour) === hour &&
      Number(values.minute) === minute
    ) {
      return candidate;
    }
  }

  return new Date(utcGuess);
}

function addMinutesLocal(date: string, time: string, minutes: number): string {
  const instant = localDateTimeToUtc(date, time, TIMEZONE);
  instant.setUTCMinutes(instant.getUTCMinutes() + minutes);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00`;
}

function formatSlotLabel(date: string, time: string): string {
  const parsed = new Date(`${date}T${time}:00`);
  return parsed.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

export function buildBookingCalendarSlots(booking: StructuredBooking): BookingCalendarSlot[] {
  if (booking.bookingType === "day-trip") {
    const tripTime = booking.tripTime || "09:00";
    const start = toLocalDateTime(booking.tripDate, tripTime);
    return [
      {
        label: booking.tourTitle ? `Day trip — ${booking.tourTitle}` : "Day trip",
        start,
        end: addMinutesLocal(booking.tripDate, tripTime, DAY_TRIP_DURATION_HOURS * 60),
      },
    ];
  }

  const outboundStart = toLocalDateTime(booking.tripDate, booking.tripTime);
  const slots: BookingCalendarSlot[] = [
    {
      label: "Outbound transfer",
      start: outboundStart,
      end: addMinutesLocal(booking.tripDate, booking.tripTime, TRANSFER_DURATION_MINUTES),
    },
  ];

  if (booking.returnJourney && booking.returnDate && booking.returnTime) {
    slots.push({
      label: "Return transfer",
      start: toLocalDateTime(booking.returnDate, booking.returnTime),
      end: addMinutesLocal(booking.returnDate, booking.returnTime, TRANSFER_DURATION_MINUTES),
    });
  }

  return slots;
}

function buildEventDescription(booking: StructuredBooking, message: string): string {
  const lines = [
    message,
    "",
    `Pickup: ${booking.pickupLabel}`,
    `Drop-off: ${booking.dropoffLabel}`,
  ];

  if (booking.customerEmail) {
    lines.push(`Email: ${booking.customerEmail}`);
  }

  if (booking.mobileNumber) {
    lines.push(`Mobile: ${booking.mobileNumber}`);
  }

  if (booking.estimatedPrice) {
    lines.push(`Estimated price: ${booking.estimatedPrice}`);
  }

  if (booking.notes) {
    lines.push(`Notes: ${booking.notes}`);
  }

  return lines.join("\n");
}

function buildEventSummary(booking: StructuredBooking, slotLabel: string): string {
  const tripName =
    booking.bookingType === "day-trip"
      ? booking.tourTitle ?? "Day trip"
      : booking.tripLabel;

  return `${booking.customerName} — ${slotLabel} (${tripName})`;
}

function findOverlappingEvents(
  slot: BookingCalendarSlot,
  events: CalendarEventSummary[],
): BookingCalendarConflict["overlappingEvents"] {
  const slotStartMs = slotToInstant(slot.start).getTime();
  const slotEndMs = slotToInstant(slot.end).getTime();

  return events
    .filter((event) => {
      const eventStartMs = new Date(event.start).getTime();
      const eventEndMs = new Date(event.end).getTime();
      return slotStartMs < eventEndMs && eventStartMs < slotEndMs;
    })
    .map((event) => ({
      summary: event.summary,
      start: event.start,
      end: event.end,
    }));
}

function formatConflictNotice(conflicts: BookingCalendarConflict[]): string {
  if (conflicts.length === 0) {
    return "";
  }

  const lines = ["", "⚠️ CALENDAR CONFLICT WARNING", ""];

  for (const conflict of conflicts) {
    lines.push(`${conflict.label}: ${formatInstantLabel(slotToInstant(conflict.start).toISOString())}`);
    if (conflict.overlappingEvents.length === 0) {
      lines.push("  Overlaps with an existing calendar entry.");
      continue;
    }

    for (const event of conflict.overlappingEvents) {
      lines.push(
        `  Overlaps with: ${event.summary} (${formatInstantLabel(event.start)})`,
      );
    }
  }

  lines.push("", "Please review your calendar and contact the customer if needed.");
  return lines.join("\n");
}

function formatInstantLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

function slotToInstant(localDateTime: string): Date {
  const [date, time] = localDateTime.split("T");
  return localDateTimeToUtc(date, time.slice(0, 5), TIMEZONE);
}

export function appendConflictNoticeToMessage(
  message: string,
  conflicts: BookingCalendarConflict[],
): string {
  const notice = formatConflictNotice(conflicts);
  return notice ? `${message}${notice}` : message;
}

export async function syncBookingToGoogleCalendar(
  serviceAccount: GoogleServiceAccount,
  calendarId: string,
  booking: StructuredBooking,
  message: string,
): Promise<BookingCalendarResult> {
  const slots = buildBookingCalendarSlots(booking);
  if (slots.length === 0) {
    return { configured: true, eventsCreated: [], conflicts: [] };
  }

  const accessToken = await getGoogleCalendarAccessToken(serviceAccount);
  const timeMin = slotToInstant(slots[0].start).toISOString();
  const timeMax = slotToInstant(slots[slots.length - 1].end).toISOString();

  const [busyPeriods, existingEvents] = await Promise.all([
    queryCalendarBusyPeriods(accessToken, calendarId, timeMin, timeMax, TIMEZONE),
    listCalendarEvents(accessToken, calendarId, timeMin, timeMax, TIMEZONE),
  ]);

  const conflicts: BookingCalendarConflict[] = [];

  for (const slot of slots) {
    const slotStartMs = slotToInstant(slot.start).getTime();
    const slotEndMs = slotToInstant(slot.end).getTime();
    const hasBusyConflict = busyPeriods.some((period) => {
      const periodStartMs = new Date(period.start).getTime();
      const periodEndMs = new Date(period.end).getTime();
      return slotStartMs < periodEndMs && periodStartMs < slotEndMs;
    });
    const overlappingEvents = findOverlappingEvents(slot, existingEvents);

    if (hasBusyConflict || overlappingEvents.length > 0) {
      conflicts.push({
        label: slot.label,
        start: slot.start,
        end: slot.end,
        overlappingEvents,
      });
    }
  }

  const eventsCreated: string[] = [];

  for (const slot of slots) {
    const event: CalendarEventInput = {
      summary: buildEventSummary(booking, slot.label),
      description: buildEventDescription(booking, message),
      start: {
        dateTime: slot.start,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: slot.end,
        timeZone: TIMEZONE,
      },
    };

    const eventId = await createCalendarEvent(accessToken, calendarId, event);
    eventsCreated.push(eventId);
  }

  return {
    configured: true,
    eventsCreated,
    conflicts,
  };
}

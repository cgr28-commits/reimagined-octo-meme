const TIME_ZONE = "Europe/London";

/**
 * Parse a Europe/London wall-clock pickup (YYYY-MM-DD + HH:mm) to a Date.
 * Matches the worker tracking helper so quote and booking windows stay aligned.
 */
export function parseLondonLocalDateTime(tripDate: string, tripTime: string): Date | null {
  const time = tripTime.trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const isoLocal = `${tripDate}T${time}`;
  const [, year, month, day, hour, minute] =
    isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) ?? [];
  if (!year) {
    return null;
  }

  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let offsetMinutes = -90; offsetMinutes <= 90; offsetMinutes += 15) {
    const candidate = new Date(utcGuess + offsetMinutes * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const formatted = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    if (formatted === isoLocal) {
      return candidate;
    }
  }

  return new Date(utcGuess);
}

/** True when the London pickup is at least `hours` ahead of now. */
export function isPickupAtLeastHoursAhead(
  tripDate: string,
  tripTime: string,
  hours: number,
  now = new Date(),
): boolean {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickup) {
    return false;
  }
  return pickup.getTime() - now.getTime() >= hours * 60 * 60 * 1000;
}

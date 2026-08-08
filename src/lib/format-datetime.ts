const UK_TIME_ZONE = "Europe/London";

/** Display dates as day-month-year (DD-MM-YYYY). */
export function formatUkDate(date: string): string {
  if (!date) {
    return "";
  }

  const iso = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}-${iso[2]}-${iso[1]}`;
  }

  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(parsed);

  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  if (!day || !month || !year) {
    return date;
  }

  return `${day}-${month}-${year}`;
}

export function formatUkTime(time: string): string {
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

export function formatUkDateTime(date: string, time: string): string {
  const formattedDate = formatUkDate(date);
  const formattedTime = formatUkTime(time);

  if (!formattedDate || !formattedTime) {
    return "";
  }

  return `${formattedDate} at ${formattedTime}`;
}

export function formatUkSubmissionTime(date = new Date()): string {
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

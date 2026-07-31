const UK_TIME_ZONE = "Europe/London";

export function formatUkDate(date: string): string {
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

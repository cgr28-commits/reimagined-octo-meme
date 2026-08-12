/** Northern Ireland / UK civil time — never hardcode GMT or BST. */
export const UK_TIME_ZONE = "Europe/London";

/** Customer-facing label instead of GMT/BST suffixes. */
export const UK_LOCAL_TIME_LABEL = "UK local time";

type LondonParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Parse a Europe/London wall-clock datetime (YYYY-MM-DD + HH:mm[.ss]) to a UTC Instant (Date).
 * Customer-entered pickup/return times must always be treated as UK local time.
 */
export function parseLondonLocalDateTime(
  tripDate: string,
  tripTime: string,
): Date | null {
  const time = tripTime.trim().slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return null;
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return null;
  }

  const [hour, minute, second = "00"] = time.split(":");
  return parseLondonLocalIso(`${tripDate}T${hour}:${minute}:${second.slice(0, 2)}`);
}

/**
 * Parse `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` as Europe/London wall clock.
 * Handles DST spring-forward gaps and autumn overlaps via offset search.
 */
export function parseLondonLocalIso(isoLocal: string): Date | null {
  const match = isoLocal
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const target = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let offsetMinutes = -120; offsetMinutes <= 120; offsetMinutes += 15) {
    const candidate = new Date(utcGuess + offsetMinutes * 60 * 1000);
    const parts = formatter.formatToParts(candidate);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const formatted = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    if (formatted === target) {
      return candidate;
    }
  }

  // Spring-forward gap (e.g. 2026-03-29 01:30 never exists) — fall back to UTC guess.
  return new Date(utcGuess);
}

/** True when `iso` is a UTC / offset ISO instant (not a bare London wall-clock). */
export function isUtcInstantString(iso: string): boolean {
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.trim());
}

function londonPartsFromInstant(date: Date): LondonParts | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

/** Offset of Europe/London vs UTC at an instant, in minutes (0 in winter, 60 in summer). */
export function londonUtcOffsetMinutes(instant: Date): number {
  const parts = londonPartsFromInstant(instant);
  if (!parts) {
    return 0;
  }

  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

/** Display dates as day-month-year (DD-MM-YYYY). */
export function formatUkDate(date: string): string {
  if (!date) {
    return "";
  }

  const iso = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}-${iso[2]}-${iso[1]}`;
  }

  const parsed = new Date(`${date}T12:00:00Z`);
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

/** Format a wall-clock HH:mm string for display (no timezone conversion). */
export function formatUkTime(time: string): string {
  if (!time) {
    return "";
  }

  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return time;
  }

  return `${pad2(Number(match[1]))}:${match[2]}`;
}

export function formatUkDateTime(
  date: string,
  time: string,
  options: { withZoneLabel?: boolean } = {},
): string {
  const formattedDate = formatUkDate(date);
  const formattedTime = formatUkTime(time);

  if (!formattedDate || !formattedTime) {
    return "";
  }

  const base = `${formattedDate} at ${formattedTime}`;
  return options.withZoneLabel === false ? base : `${base} (${UK_LOCAL_TIME_LABEL})`;
}

/** Format a stored UTC instant for UK display — never appends GMT/BST. */
export function formatUkInstant(
  value: string | Date,
  options: { withZoneLabel?: boolean; includeYear?: boolean; includeWeekday?: boolean } = {},
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: options.includeWeekday === false ? undefined : "short",
    day: "numeric",
    month: "short",
    year: options.includeYear === false ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return options.withZoneLabel === false
    ? formatted
    : `${formatted} (${UK_LOCAL_TIME_LABEL})`;
}

/**
 * Format a tracking / calendar value that may be either:
 * - London wall-clock `YYYY-MM-DDTHH:mm`
 * - UTC ISO instant (`...Z` / offset)
 */
export function formatUkDateTimeValue(
  value: string,
  options: { withZoneLabel?: boolean; includeYear?: boolean } = {},
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!isUtcInstantString(trimmed)) {
    const local = parseLondonLocalIso(trimmed.length === 16 ? `${trimmed}:00` : trimmed);
    if (local) {
      return formatUkInstant(local, {
        withZoneLabel: options.withZoneLabel,
        includeYear: options.includeYear,
        includeWeekday: true,
      });
    }
  }

  return formatUkInstant(trimmed, {
    withZoneLabel: options.withZoneLabel,
    includeYear: options.includeYear,
    includeWeekday: true,
  });
}

/** Submission / “viewed at” timestamps stored as UTC, shown in UK local time. */
export function formatUkSubmissionTime(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return `${formatted} (${UK_LOCAL_TIME_LABEL})`;
}

/** Today’s calendar date in Europe/London as YYYY-MM-DD. */
export function todayLondonDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIME_ZONE,
  }).format(now);
}

/** Current HH:mm in Europe/London. */
export function nowLondonTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute}`;
}

/**
 * Weekday for a UK calendar date (0 = Sunday … 6 = Saturday).
 * Uses noon UTC so the civil date matches Europe/London year-round.
 */
export function londonWeekday(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const noonUtc = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime())) {
    return null;
  }
  return noonUtc.getUTCDay();
}

/** Minutes since midnight from an HH:mm wall-clock string. */
export function wallClockMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

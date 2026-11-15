/**
 * Date-specific booking encouragement shown with an instant quote (owner brief, 15 Nov 2026).
 *
 * Picks a message from the customer's TRAVEL date (never today's date). Wording is honest:
 * no invented availability, no countdowns, no price-rise claims, and no promise of
 * immediate confirmation when the booking needs the owner's approval.
 */

export type BookingSeason =
  | "christmas"
  | "christmas-run-up"
  | "between-christmas-new-year"
  | "new-year"
  | "easter"
  | "bank-holiday"
  | "summer"
  | "december"
  | "winter"
  | "general";

export type SeasonalBookingMessage = {
  season: BookingSeason;
  icon: string | null;
  /** "Sunday 20 December 2026" — Europe/London, no timezone shift. */
  travelDateLabel: string;
  /** "Travelling on Sunday 20 December 2026?" */
  heading: string;
  body: string;
  /** "Secure your journey today…" — left out when it would repeat "peace of mind" or the booking needs approval. */
  closing: string | null;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { y: number; m: number; d: number };

function parseIso(iso: string): Ymd | null {
  const match = ISO.exec(String(iso ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(utcDate(year, month, day));
}

function firstMonday(year: number, month: number): Date {
  const date = utcDate(year, month, 1);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function lastMonday(year: number, month: number): Date {
  const date = utcDate(year, month + 1, 0);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

/**
 * Northern Ireland bank holidays for a year, with substitute days when a fixed-date holiday
 * falls at the weekend (e.g. Christmas on a Saturday → Monday 27 and Tuesday 28).
 * Special one-off holidays (coronations etc.) are not included.
 */
export function northernIrelandBankHolidays(year: number): Array<{ date: string; name: string }> {
  const easter = new Date(`${easterSunday(year)}T00:00:00Z`);
  const fixed: Array<{ date: Date; name: string }> = [
    { date: utcDate(year, 1, 1), name: "New Year's Day" },
    { date: utcDate(year, 3, 17), name: "St Patrick's Day" },
    { date: utcDate(year, 7, 12), name: "Battle of the Boyne (Orangemen's Day)" },
    { date: utcDate(year, 12, 25), name: "Christmas Day" },
    { date: utcDate(year, 12, 26), name: "Boxing Day" },
  ];
  const moving: Array<{ date: Date; name: string }> = [
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: firstMonday(year, 5), name: "Early May bank holiday" },
    { date: lastMonday(year, 5), name: "Spring bank holiday" },
    { date: lastMonday(year, 8), name: "Summer bank holiday" },
  ];
  const result: Array<{ date: string; name: string }> = moving.map((h) => ({ date: toIso(h.date), name: h.name }));
  // Weekday holidays first, so a substitute never lands on another holiday's own day
  // (2022: Boxing Day Monday 26th, so the Christmas substitute is Tuesday 27th).
  const taken = new Set(moving.map((h) => toIso(h.date)));
  for (const holiday of fixed) {
    if (!isWeekend(holiday.date)) {
      taken.add(toIso(holiday.date));
      result.push({ date: toIso(holiday.date), name: holiday.name });
    }
  }
  for (const holiday of fixed) {
    if (!isWeekend(holiday.date)) continue;
    let date = holiday.date;
    do {
      date = addDays(date, 1);
    } while (isWeekend(date) || taken.has(toIso(date)));
    taken.add(toIso(date));
    result.push({ date: toIso(date), name: `${holiday.name} (substitute day)` });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

const bankHolidayCache = new Map<number, Set<string>>();

function isBankHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  let set = bankHolidayCache.get(year);
  if (!set) {
    set = new Set(northernIrelandBankHolidays(year).map((h) => h.date));
    bankHolidayCache.set(year, set);
  }
  return set.has(toIso(date));
}

/**
 * A bank holiday, or a weekend joined to one (e.g. the Saturday and Sunday before a
 * bank holiday Monday) — the whole long weekend is busy.
 */
export function isBankHolidayPeriod(iso: string): boolean {
  const parsed = parseIso(iso);
  if (!parsed) return false;
  const date = utcDate(parsed.y, parsed.m, parsed.d);
  if (isBankHoliday(date)) return true;
  if (!isWeekend(date)) return false;
  for (const step of [1, -1]) {
    let cursor = addDays(date, step);
    while (isWeekend(cursor) || isBankHoliday(cursor)) {
      if (isBankHoliday(cursor)) return true;
      cursor = addDays(cursor, step);
    }
  }
  return false;
}

/**
 * Easter holidays: from the Saturday before Palm Sunday to the Sunday after Easter
 * (roughly the two-week school break around Easter in Northern Ireland).
 */
export function isEasterHolidays(iso: string): boolean {
  const parsed = parseIso(iso);
  if (!parsed) return false;
  const easter = new Date(`${easterSunday(parsed.y)}T00:00:00Z`);
  const from = toIso(addDays(easter, -8));
  const to = toIso(addDays(easter, 7));
  const value = toIso(utcDate(parsed.y, parsed.m, parsed.d));
  return value >= from && value <= to;
}

export function bookingSeasonFor(iso: string): BookingSeason {
  const parsed = parseIso(iso);
  if (!parsed) return "general";
  const { m, d } = parsed;
  // 1. Christmas Day and the days around it.
  if (m === 12 && d >= 24 && d <= 26) return "christmas";
  // 2. Christmas and New Year travel periods.
  if (m === 12 && d >= 14 && d <= 23) return "christmas-run-up";
  if (m === 12 && d >= 27) return "between-christmas-new-year";
  if (m === 1 && d <= 3) return "new-year";
  // 3. Easter holidays.
  if (isEasterHolidays(iso)) return "easter";
  // 4. Northern Ireland bank holidays.
  if (isBankHolidayPeriod(iso)) return "bank-holiday";
  // 5. Summer holiday season.
  if (m >= 6 && m <= 8) return "summer";
  // 6. November and early December.
  if (m === 12 && d <= 13) return "december";
  if (m === 11 && d >= 15) return "winter";
  // 7. Everything else.
  return "general";
}

/** "Sunday 20 December 2026" in Europe/London, from a YYYY-MM-DD travel date. */
export function formatTravelDate(iso: string): string | null {
  const parsed = parseIso(iso);
  if (!parsed) return null;
  // Midday UTC is the same calendar day in London whether it is GMT or BST.
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12));
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).replace(",", "");
}

const SEASON_COPY: Record<BookingSeason, { icon: string | null; body: string }> = {
  christmas: {
    icon: "🎄",
    body: "Travelling over Christmas? Availability can be limited during the festive holidays. Book your airport, cruise or event transfer early to avoid disappointment.",
  },
  "christmas-run-up": {
    icon: "🎄",
    body: "Christmas is one of our busiest travel periods, and availability can fill up quickly. We recommend booking your airport, cruise or event transfer as early as possible.",
  },
  "between-christmas-new-year": {
    icon: "✨",
    body: "The period between Christmas and New Year is a popular time for travel. Secure your airport, cruise or event transfer in advance.",
  },
  "new-year": {
    icon: "✈️",
    body: "Starting the New Year with a journey? Book your airport, cruise or event transfer early for peace of mind.",
  },
  easter: {
    icon: "🐣",
    body: "Easter is a popular time for holidays and events. We recommend booking your airport, cruise or event transfer early to secure your preferred date.",
  },
  "bank-holiday": {
    icon: null,
    body: "Bank holiday periods can be particularly busy for travel. We recommend arranging your airport, cruise or event transfer in advance.",
  },
  summer: {
    icon: "☀️",
    body: "Summer is one of the busiest times of year for holidays and events. Book your airport, cruise or event transfer early to avoid disappointment.",
  },
  december: {
    icon: null,
    body: "December is a popular time for travel. Secure your airport, cruise or event transfer early and enjoy peace of mind.",
  },
  winter: {
    icon: null,
    body: "The winter travel season is getting busier. We recommend booking your airport, cruise or event transfer early to avoid disappointment.",
  },
  general: {
    icon: "✈️",
    body: "Your quote is ready! We recommend booking your airport, cruise or event transfer early to secure your preferred travel arrangements.",
  },
};

export const SEASONAL_CLOSING = "Secure your journey today and travel with peace of mind.";

/**
 * The message for a travel date, or null when the date is missing or invalid.
 * `needsApproval`: short-notice / request bookings — no "secure today" wording.
 */
export function seasonalBookingMessage(
  iso: string | null | undefined,
  options: { needsApproval?: boolean } = {},
): SeasonalBookingMessage | null {
  const travelDateLabel = formatTravelDate(String(iso ?? ""));
  if (!travelDateLabel) return null;
  const season = bookingSeasonFor(String(iso));
  const copy = SEASON_COPY[season];
  const repeatsPeaceOfMind = /peace of mind/i.test(copy.body);
  return {
    season,
    icon: copy.icon,
    travelDateLabel,
    heading: `Travelling on ${travelDateLabel}?`,
    body: copy.body,
    closing: options.needsApproval || repeatsPeaceOfMind ? null : SEASONAL_CLOSING,
  };
}

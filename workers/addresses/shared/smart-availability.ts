/**
 * Smart Availability rules: one-off, full-day, recurring, and per-occurrence exceptions.
 * Private owner notes never leave this module as customer copy.
 */

import { parseLondonLocalDateTime, UK_TIME_ZONE } from "./uk-time";
import {
  normalizeLondonLocalDateTime,
  parseLondonLocalStored,
  type UnavailablePeriod,
} from "./booking-notice";
import { addDaysYmd } from "./upcoming-jobs";

export const ISO_WEEKDAYS = [
  { iso: 1, label: "Monday" },
  { iso: 2, label: "Tuesday" },
  { iso: 3, label: "Wednesday" },
  { iso: 4, label: "Thursday" },
  { iso: 5, label: "Friday" },
  { iso: 6, label: "Saturday" },
  { iso: 7, label: "Sunday" },
] as const;

export type SmartAvailabilityKind = "one_off" | "recurring" | "full_day";

export type SmartAvailabilityRule = {
  id: string;
  enabled: boolean;
  kind: SmartAvailabilityKind;
  /** Private owner note — never shown to customers. */
  note?: string;
  startLocal?: string;
  endLocal?: string;
  date?: string;
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
  rangeStart?: string;
  rangeEnd?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmartAvailabilityException = {
  id: string;
  ruleId: string;
  date: string;
  kind: "available" | "unavailable";
  startTime?: string;
  endTime?: string;
  note?: string;
  createdAt: string;
};

export type SmartBlockedInterval = {
  startMs: number;
  endMs: number;
  startLocal: string;
  endLocal: string;
  ruleId: string;
  recurring: boolean;
  source: "rule" | "exception" | "legacy";
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function generateSmartRuleId(prefix: string, now = new Date()): string {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatLondonLocalFromInstant(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function londonIsoWeekday(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const instant = parseLondonLocalDateTime(ymd, "12:00");
  if (!instant) return null;
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? null;
}

function normalizeHm(value: string | null | undefined): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function normalizeYmd(value: string | null | undefined): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sanitizeNote(value: unknown): string | undefined {
  const note = String(value ?? "").trim().slice(0, 280);
  return note || undefined;
}

export type UnavailableTimeForm = {
  repeat: "one_off" | "recurring";
  date: string;
  /** Explicit end date for one-off blocks (required for overnight). */
  endDate: string;
  startTime: string;
  endTime: string;
  weekdays: number[];
  note: string;
};

/**
 * Everyday owner control: date + from + until (+ weekdays if recurring).
 * Same-day when until is later than from (00:00–10:00). Overnight when until
 * is earlier or equal and not a full-day 00:00–00:00 (22:00–06:00).
 */
export function buildUnavailableTimeRule(
  input: Partial<UnavailableTimeForm> & { id?: string; enabled?: boolean },
  now = new Date(),
): SmartAvailabilityRule | null {
  const startTime = normalizeHm(input.startTime);
  const endTime = normalizeHm(input.endTime);
  if (!startTime || !endTime) return null;

  if (input.repeat === "recurring") {
    return normalizeSmartAvailabilityRule(
      {
        id: input.id,
        kind: "recurring",
        weekdays: input.weekdays,
        startTime,
        endTime,
        note: input.note,
        enabled: input.enabled,
      },
      now,
    );
  }

  const date = normalizeYmd(input.date);
  if (!date) return null;
  const explicitEndDate = normalizeYmd(input.endDate);
  if (startTime === endTime && (!explicitEndDate || explicitEndDate === date)) {
    return normalizeSmartAvailabilityRule(
      {
        id: input.id,
        kind: "full_day",
        date,
        note: input.note,
        enabled: input.enabled,
      },
      now,
    );
  }
  const endDate =
    explicitEndDate || (endTime < startTime ? addDaysYmd(date, 1) : date);
  return normalizeSmartAvailabilityRule(
    {
      id: input.id,
      kind: "one_off",
      startLocal: `${date}T${startTime}`,
      endLocal: `${endDate}T${endTime}`,
      note: input.note,
      enabled: input.enabled,
    },
    now,
  );
}

export function unavailableFormFromRule(rule: SmartAvailabilityRule, todayYmd: string): UnavailableTimeForm {
  if (rule.kind === "recurring") {
    return {
      repeat: "recurring",
      date: rule.rangeStart || todayYmd,
      endDate: rule.rangeStart || todayYmd,
      startTime: rule.startTime || "00:00",
      endTime: rule.endTime || "10:00",
      weekdays: [...(rule.weekdays || [])],
      note: rule.note || "",
    };
  }
  const startLocal = rule.startLocal || (rule.date ? `${rule.date}T00:00` : `${todayYmd}T00:00`);
  const endLocal = rule.endLocal || `${addDaysYmd(startLocal.slice(0, 10), 1)}T00:00`;
  const startDate = startLocal.slice(0, 10);
  const endDate = endLocal.slice(0, 10);
  const startTime = startLocal.slice(11, 16) || "00:00";
  const endTime = endLocal.slice(11, 16) || "00:00";
  return {
    repeat: "one_off",
    date: startDate,
    endDate: endDate || startDate,
    startTime,
    endTime: rule.kind === "full_day" || (endDate !== startDate && endTime === "00:00" && startTime === "00:00")
      ? "00:00"
      : endTime,
    weekdays: [],
    note: rule.note || "",
  };
}

export function describeUnavailableDate(ymd: string, todayYmd: string): string {
  if (ymd === todayYmd) return "Today";
  if (ymd === addDaysYmd(todayYmd, 1)) return "Tomorrow";
  const instant = parseLondonLocalDateTime(ymd, "12:00");
  if (!instant) return ymd;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: UK_TIME_ZONE,
  }).format(instant);
}

export function describeUnavailableRule(rule: SmartAvailabilityRule, todayYmd: string): string {
  if (rule.kind === "recurring") {
    const days = (rule.weekdays || [])
      .map((d) => ISO_WEEKDAYS.find((item) => item.iso === d)?.label)
      .filter(Boolean)
      .join(", ");
    return `Every ${days || "selected day"} · ${rule.startTime}–${rule.endTime}`;
  }
  if (rule.kind === "full_day" && rule.date) {
    return `All day ${describeUnavailableDate(rule.date, todayYmd)}`;
  }
  const start = rule.startLocal || "";
  const end = rule.endLocal || "";
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);
  if (startDate && startDate === endDate) {
    return `${describeUnavailableDate(startDate, todayYmd)} ${startTime}–${endTime}`;
  }
  if (startDate && endDate) {
    const startLabel =
      startDate === todayYmd ? "Tonight" : describeUnavailableDate(startDate, todayYmd);
    const endLabel = describeUnavailableDate(endDate, todayYmd);
    return `${startLabel} ${startTime} → ${endLabel} ${endTime}`;
  }
  return "Unavailable time";
}

export function normalizeSmartAvailabilityRule(
  raw: Partial<SmartAvailabilityRule> | null | undefined,
  now = new Date(),
): SmartAvailabilityRule | null {
  if (!raw) return null;
  const kind: SmartAvailabilityKind =
    raw.kind === "recurring" || raw.kind === "full_day" ? raw.kind : "one_off";
  const createdAt = raw.createdAt?.trim() || now.toISOString();
  const id = String(raw.id ?? "").trim() || generateSmartRuleId(kind, now);

  if (kind === "recurring") {
    const weekdays = Array.from(
      new Set(
        (Array.isArray(raw.weekdays) ? raw.weekdays : [])
          .map((d) => Number(d))
          .filter((d) => d >= 1 && d <= 7),
      ),
    ).sort((a, b) => a - b);
    const startTime = normalizeHm(raw.startTime);
    const endTime = normalizeHm(raw.endTime);
    // endTime <= startTime is an overnight block (e.g. 22:00–08:00).
    if (!weekdays.length || !startTime || !endTime) return null;
    return {
      id,
      enabled: raw.enabled !== false,
      kind,
      note: sanitizeNote(raw.note),
      weekdays,
      startTime,
      endTime,
      rangeStart: normalizeYmd(raw.rangeStart) || undefined,
      rangeEnd: normalizeYmd(raw.rangeEnd) || null,
      createdAt,
      updatedAt: raw.updatedAt?.trim() || now.toISOString(),
    };
  }

  if (kind === "full_day") {
    const date = normalizeYmd(raw.date) || normalizeYmd(raw.startLocal);
    if (!date) return null;
    return {
      id,
      enabled: raw.enabled !== false,
      kind,
      note: sanitizeNote(raw.note),
      date,
      startLocal: `${date}T00:00`,
      endLocal: `${addDaysYmd(date, 1)}T00:00`,
      createdAt,
      updatedAt: raw.updatedAt?.trim() || now.toISOString(),
    };
  }

  const startLocal = normalizeLondonLocalDateTime(raw.startLocal);
  const endLocal = normalizeLondonLocalDateTime(raw.endLocal);
  if (!startLocal || !endLocal) return null;
  const start = parseLondonLocalStored(startLocal);
  const end = parseLondonLocalStored(endLocal);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return {
    id,
    enabled: raw.enabled !== false,
    kind: "one_off",
    note: sanitizeNote(raw.note),
    startLocal,
    endLocal,
    createdAt,
    updatedAt: raw.updatedAt?.trim() || now.toISOString(),
  };
}

export function normalizeSmartAvailabilityException(
  raw: Partial<SmartAvailabilityException> | null | undefined,
  now = new Date(),
): SmartAvailabilityException | null {
  if (!raw) return null;
  const ruleId = String(raw.ruleId ?? "").trim();
  const date = normalizeYmd(raw.date);
  if (!ruleId || !date) return null;
  const kind = raw.kind === "unavailable" ? "unavailable" : "available";
  return {
    id: String(raw.id ?? "").trim() || generateSmartRuleId("ex", now),
    ruleId,
    date,
    kind,
    startTime: normalizeHm(raw.startTime) || undefined,
    endTime: normalizeHm(raw.endTime) || undefined,
    note: sanitizeNote(raw.note),
    createdAt: raw.createdAt?.trim() || now.toISOString(),
  };
}

function intervalFromLocal(
  startLocal: string,
  endLocal: string,
  ruleId: string,
  recurring: boolean,
  source: SmartBlockedInterval["source"],
): SmartBlockedInterval | null {
  const start = parseLondonLocalStored(startLocal);
  const end = parseLondonLocalStored(endLocal);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    startLocal,
    endLocal,
    ruleId,
    recurring,
    source,
  };
}

function eachYmd(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let i = 0; i < 400 && cursor <= to; i += 1) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

export function expandSmartAvailabilityIntervals(input: {
  rules: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  fromYmd: string;
  toYmd: string;
  legacyPeriods?: UnavailablePeriod[];
}): SmartBlockedInterval[] {
  const exceptions = input.exceptions || [];
  const intervals: SmartBlockedInterval[] = [];

  for (const period of input.legacyPeriods || []) {
    const interval = intervalFromLocal(
      period.startLocal,
      period.endLocal,
      period.id,
      false,
      "legacy",
    );
    if (interval) intervals.push(interval);
  }

  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    if (rule.kind === "recurring") {
      // Include the previous calendar day so overnight blocks (22:00–08:00)
      // that started yesterday still cover early hours today.
      const scanFrom = addDaysYmd(input.fromYmd, -1);
      const from = rule.rangeStart && rule.rangeStart > scanFrom ? rule.rangeStart : scanFrom;
      const to =
        rule.rangeEnd && rule.rangeEnd < input.toYmd ? rule.rangeEnd : input.toYmd;
      if (from > to) continue;
      for (const ymd of eachYmd(from, to)) {
        const weekday = londonIsoWeekday(ymd);
        if (!weekday || !rule.weekdays?.includes(weekday)) continue;
        const exception = exceptions.find((item) => item.ruleId === rule.id && item.date === ymd);
        if (exception?.kind === "available") continue;
        const startTime = exception?.kind === "unavailable" && exception.startTime
          ? exception.startTime
          : rule.startTime;
        const endTime = exception?.kind === "unavailable" && exception.endTime
          ? exception.endTime
          : rule.endTime;
        if (!startTime || !endTime) continue;
        const overnight = endTime <= startTime;
        const interval = intervalFromLocal(
          `${ymd}T${startTime}`,
          `${overnight ? addDaysYmd(ymd, 1) : ymd}T${endTime}`,
          rule.id,
          true,
          exception ? "exception" : "rule",
        );
        if (interval) intervals.push(interval);
      }
      continue;
    }

    const startLocal = rule.startLocal;
    const endLocal = rule.endLocal;
    if (!startLocal || !endLocal) continue;
    const interval = intervalFromLocal(startLocal, endLocal, rule.id, false, "rule");
    if (interval) intervals.push(interval);
  }

  return intervals.sort((a, b) => a.startMs - b.startMs);
}

export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

export function findBlockingSmartInterval(
  tripDate: string,
  tripTime: string,
  intervals: SmartBlockedInterval[],
): SmartBlockedInterval | null {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickup) return null;
  const t = pickup.getTime();
  return intervals.find((interval) => t >= interval.startMs && t < interval.endMs) || null;
}

/** True when the requested operational window overlaps a blocked interval. */
export function findOverlappingSmartInterval(
  startMs: number,
  endMs: number,
  intervals: SmartBlockedInterval[],
  postBlockTurnaroundMinutes = 0,
): SmartBlockedInterval | null {
  const extra = Math.max(0, postBlockTurnaroundMinutes) * 60 * 1000;
  return (
    intervals.find((interval) =>
      intervalsOverlap(startMs, endMs, interval.startMs, interval.endMs + extra),
    ) || null
  );
}

export function isQuickBlockRule(rule: SmartAvailabilityRule): boolean {
  return (
    (rule.kind === "one_off" || rule.kind === "full_day") &&
    Boolean(rule.note && rule.note.startsWith("Quick block"))
  );
}

export function smartIntervalActiveAt(
  interval: SmartBlockedInterval,
  nowMs: number,
): boolean {
  return nowMs >= interval.startMs && nowMs < interval.endMs;
}

/**
 * “Available again now” must only finish currently-active Quick blocks.
 * Planned one-off / full-day rules for other days stay enabled.
 */
export function clearActiveQuickBlocks(
  rules: SmartAvailabilityRule[],
  now = new Date(),
): SmartAvailabilityRule[] {
  const nowMs = now.getTime();
  const ymd = formatLondonLocalFromInstant(now).slice(0, 10);
  const fromYmd = addDaysYmd(ymd, -1);
  const toYmd = addDaysYmd(ymd, 1);
  return rules.map((rule) => {
    if (!rule.enabled || !isQuickBlockRule(rule)) return rule;
    const intervals = expandSmartAvailabilityIntervals({
      rules: [rule],
      fromYmd,
      toYmd,
    });
    const active = intervals.some((interval) => smartIntervalActiveAt(interval, nowMs));
    if (!active) return rule;
    return { ...rule, enabled: false, updatedAt: now.toISOString() };
  });
}

export function buildQuickBlockRule(
  kind: "hours" | "rest_of_today" | "whole_day",
  hours: number,
  now = new Date(),
): SmartAvailabilityRule | null {
  const startLocal = formatLondonLocalFromInstant(now);
  const [ymd] = startLocal.split("T");
  if (kind === "whole_day") {
    return normalizeSmartAvailabilityRule(
      {
        kind: "full_day",
        date: ymd,
        note: "Quick block: whole day",
      },
      now,
    );
  }
  if (kind === "rest_of_today") {
    return normalizeSmartAvailabilityRule(
      {
        kind: "one_off",
        startLocal,
        endLocal: `${addDaysYmd(ymd, 1)}T00:00`,
        note: "Quick block: rest of today",
      },
      now,
    );
  }
  const end = new Date(now.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  return normalizeSmartAvailabilityRule(
    {
      kind: "one_off",
      startLocal,
      endLocal: formatLondonLocalFromInstant(end),
      note: `Quick block: next ${hours} hour${hours === 1 ? "" : "s"}`,
    },
    now,
  );
}

export function validateUnavailableTimeForm(
  form: Partial<UnavailableTimeForm>,
): string | null {
  const startTime = normalizeHm(form.startTime);
  const endTime = normalizeHm(form.endTime);
  if (!startTime || !endTime) return "Choose a start time and an until time.";
  if (form.repeat === "recurring") {
    const weekdays = Array.isArray(form.weekdays) ? form.weekdays : [];
    if (!weekdays.length) return "Choose at least one day of the week.";
    return null;
  }
  const date = normalizeYmd(form.date);
  if (!date) return "Choose a start date.";
  const endDate = normalizeYmd(form.endDate) || (endTime < startTime ? addDaysYmd(date, 1) : date);
  const start = parseLondonLocalStored(`${date}T${startTime}`);
  const end = parseLondonLocalStored(`${endDate}T${endTime}`);
  if (!start || !end) return "Check the date and times, then try again.";
  if (end.getTime() <= start.getTime()) {
    return "Unavailable until must be after unavailable from. For an overnight block, set the until date to the next day.";
  }
  return null;
}

export type MergedBlockedInterval = {
  startMs: number;
  endMs: number;
  startLocal: string;
  endLocal: string;
};

/**
 * Merge overlapping or touching intervals so 08:00–10:00 + 09:30–12:00
 * becomes one continuous 08:00–12:00 window. Adjacent (end === next start)
 * counts as continuous. Recurring occurrences are merged for display/status
 * only — source rules stay separate.
 */
export function mergeOverlappingBlockedIntervals(
  intervals: SmartBlockedInterval[],
): MergedBlockedInterval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: MergedBlockedInterval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.startMs <= last.endMs) {
      if (interval.endMs > last.endMs) {
        last.endMs = interval.endMs;
        last.endLocal = interval.endLocal;
      }
      continue;
    }
    merged.push({
      startMs: interval.startMs,
      endMs: interval.endMs,
      startLocal: interval.startLocal,
      endLocal: interval.endLocal,
    });
  }
  return merged;
}

export type CurrentAvailabilityStatus = {
  available: boolean;
  untilLocal: string | null;
  untilYmd: string | null;
  untilTime: string | null;
  headline: string;
  detail: string;
};

export function resolveCurrentAvailabilityStatus(input: {
  rules: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  now?: Date;
}): CurrentAvailabilityStatus {
  const now = input.now ?? new Date();
  const nowLocal = formatLondonLocalFromInstant(now);
  const todayYmd = nowLocal.slice(0, 10);
  const intervals = expandSmartAvailabilityIntervals({
    rules: input.rules,
    exceptions: input.exceptions,
    legacyPeriods: input.legacyPeriods,
    fromYmd: addDaysYmd(todayYmd, -1),
    toYmd: addDaysYmd(todayYmd, 3),
  });
  const merged = mergeOverlappingBlockedIntervals(intervals);
  const nowMs = now.getTime();
  const active = merged.find((interval) => nowMs >= interval.startMs && nowMs < interval.endMs);
  if (!active) {
    return {
      available: true,
      untilLocal: null,
      untilYmd: null,
      untilTime: null,
      headline: "AVAILABLE NOW",
      detail: "Customers can book now.",
    };
  }
  const untilYmd = active.endLocal.slice(0, 10);
  const untilTime = active.endLocal.slice(11, 16);
  const tomorrow = addDaysYmd(todayYmd, 1);
  const untilLabel =
    untilYmd === todayYmd
      ? untilTime
      : untilYmd === tomorrow
        ? `TOMORROW ${untilTime}`
        : `${describeUnavailableDate(untilYmd, todayYmd).toUpperCase()} ${untilTime}`;
  return {
    available: false,
    untilLocal: active.endLocal,
    untilYmd,
    untilTime,
    headline: `UNAVAILABLE UNTIL ${untilLabel}`,
    detail: `Customers cannot book until ${describeUntilEndLocal(active.endLocal, todayYmd)}.`,
  };
}

export function isOneOffUnavailableExpired(
  rule: SmartAvailabilityRule,
  now = new Date(),
): boolean {
  if (rule.kind === "recurring") return false;
  const endLocal = rule.endLocal;
  if (!endLocal) return false;
  const end = parseLondonLocalStored(endLocal);
  if (!end) return false;
  return now.getTime() >= end.getTime();
}

/** Active list: hide expired one-offs and disabled (ended) temporary blocks. Recurring stays. */
export function selectActiveUnavailableRules(
  rules: SmartAvailabilityRule[],
  now = new Date(),
): SmartAvailabilityRule[] {
  return rules.filter((rule) => {
    if (rule.kind === "recurring") return rule.enabled !== false;
    if (!rule.enabled) return false;
    return !isOneOffUnavailableExpired(rule, now);
  });
}

export function compactUnavailableRuleLabel(
  rule: SmartAvailabilityRule,
  todayYmd: string,
): string {
  if (rule.kind === "recurring" || rule.kind === "full_day") {
    return describeUnavailableRule(rule, todayYmd);
  }
  const start = rule.startLocal || "";
  const end = rule.endLocal || "";
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);
  if (startDate && startDate === endDate) {
    return `${startTime}–${endTime}`;
  }
  return describeUnavailableRule(rule, todayYmd);
}

export type UntilShortcutId = "tonight_22" | "midnight" | "tomorrow_04" | "tomorrow_08";

export function untilShortcutEndLocal(
  kind: UntilShortcutId,
  now = new Date(),
): string | null {
  const startLocal = formatLondonLocalFromInstant(now);
  const ymd = startLocal.slice(0, 10);
  const hm = startLocal.slice(11, 16);
  if (kind === "tonight_22") {
    return hm < "22:00" ? `${ymd}T22:00` : `${addDaysYmd(ymd, 1)}T22:00`;
  }
  if (kind === "midnight") {
    return `${addDaysYmd(ymd, 1)}T00:00`;
  }
  if (kind === "tomorrow_04") return `${addDaysYmd(ymd, 1)}T04:00`;
  if (kind === "tomorrow_08") return `${addDaysYmd(ymd, 1)}T08:00`;
  return null;
}

export function describeUntilEndLocal(endLocal: string, todayYmd: string): string {
  const date = endLocal.slice(0, 10);
  const time = endLocal.slice(11, 16);
  if (!date || !time) return endLocal;
  return `${describeUnavailableDate(date, todayYmd)} ${time}`;
}

/**
 * Temporary block from NOW until an explicit London local end.
 * Midnight-crossing is allowed because the end date is stored on the instant.
 */
export function buildUntilAvailableRule(
  endLocal: string,
  now = new Date(),
): SmartAvailabilityRule | null {
  const startLocal = formatLondonLocalFromInstant(now);
  const normalizedEnd = normalizeLondonLocalDateTime(endLocal);
  if (!normalizedEnd) return null;
  const start = parseLondonLocalStored(startLocal);
  const end = parseLondonLocalStored(normalizedEnd);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return normalizeSmartAvailabilityRule(
    {
      kind: "one_off",
      startLocal,
      endLocal: normalizedEnd,
      note: `Quick block: until ${normalizedEnd.replace("T", " ")}`,
    },
    now,
  );
}

/**
 * Website quote sessions for the daily owner report.
 * One quoteTransactionId = one session. Recalculations upsert the same record.
 * Never stores customer name / mobile / email.
 */

import { todayLondonDate, UK_TIME_ZONE } from "./uk-time";

export const QUOTE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 60;
export const DEFAULT_DAILY_QUOTE_REPORT_LONDON_HOUR = 19;

export type DailyQuoteSessionRecord = {
  quoteTransactionId: string;
  firstQuotedAt: string;
  lastUpdatedAt: string;
  londonDay: string;
  pickupLabel: string;
  dropoffLabel: string;
  airportCode: string | null;
  journeyDirection: string;
  returnJourney: boolean;
  passengers: number;
  suitcases: number;
  vehicle: string;
  journeyFareGbp: number | null;
  airportAccessOption: string | null;
  airportAccessFeeGbp: number;
  totalGbp: number | null;
  estimatedPriceLabel: string;
  booked: boolean;
  bookingReference: string | null;
  source?: "website" | "bot";
};

export type DailyQuoteSessionInput = {
  quoteTransactionId: string;
  pickupLabel: string;
  dropoffLabel: string;
  airportCode?: string | null;
  journeyDirection?: string;
  tripLabel?: string;
  returnJourney?: boolean;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  journeyFareGbp?: number | null;
  airportAccessOption?: string | null;
  airportAccessFeeGbp?: number | null;
  totalGbp?: number | null;
  estimatedPriceLabel?: string;
  source?: "website" | "bot";
  now?: Date;
};

export type DailyQuoteReportTotals = {
  quotesGenerated: number;
  bookingsCompleted: number;
  notBooked: number;
  conversionPercent: number;
};

export function quoteSessionKey(quoteTransactionId: string): string {
  return `quote_session:${normalizeQuoteTransactionId(quoteTransactionId)}`;
}

export function quoteSessionDayMarkerKey(
  londonDay: string,
  quoteTransactionId: string,
): string {
  return `quote_session_day:${londonDay}:${normalizeQuoteTransactionId(quoteTransactionId)}`;
}

export function quoteSessionDayMarkerPrefix(londonDay: string): string {
  return `quote_session_day:${londonDay}:`;
}

export function quoteTransactionIdFromDayMarkerKey(key: string): string | null {
  const match = /^quote_session_day:\d{4}-\d{2}-\d{2}:(.+)$/.exec(key);
  if (!match) return null;
  const id = normalizeQuoteTransactionId(match[1]);
  return isQuoteTransactionId(id) ? id : null;
}

export function collectQuoteTransactionIdsFromMarkerKeys(keys: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of keys) {
    const id = quoteTransactionIdFromDayMarkerKey(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function quoteDailyReportSentKey(londonDay: string): string {
  return `quote_daily_report_sent:${londonDay}`;
}

export function normalizeQuoteTransactionId(value: string): string {
  return value.trim().toLowerCase();
}

export function isQuoteTransactionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{5,80}$/i.test(value.trim());
}

export function londonHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

export function previousLondonCalendarDate(now = new Date()): string {
  const today = todayLondonDate(now);
  const noonUtc = new Date(`${today}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(noonUtc);
}

export function formatLondonReportDate(londonDay: string): string {
  const noonUtc = new Date(`${londonDay}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime())) return londonDay;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(noonUtc);
}

export function formatLondonClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute}`;
}

export function parseGbpAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

export function formatReportGbp(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "TBC";
  return `£${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

export function vehicleReportLabel(vehicle: string): string {
  if (/estate/i.test(vehicle)) return "Estate";
  if (/saloon/i.test(vehicle)) return "Saloon";
  if (/minibus/i.test(vehicle)) return "Minibus";
  return vehicle.trim() || "Vehicle";
}

export function resolveDailyQuoteReportHour(raw?: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return DEFAULT_DAILY_QUOTE_REPORT_LONDON_HOUR;
  }
  return parsed;
}

/**
 * Send the current London calendar day's quote report at or after the configured
 * London hour. With the production :30 cron that is normally 19:30. Later same-day
 * :30 crons can catch up if that slot was missed (for example a deploy after 19:30).
 * The KV sent-marker still prevents a second send that day. Empty days are skipped.
 */
export function shouldSendDailyQuoteReport(input: {
  now?: Date;
  configuredLondonHour?: string | null;
  alreadySent: boolean;
  quoteCount: number;
}): { send: boolean; reportDay: string; reason: string } {
  const now = input.now ?? new Date();
  const reportDay = todayLondonDate(now);
  if (input.alreadySent) {
    return { send: false, reportDay, reason: "already_sent" };
  }
  if (input.quoteCount <= 0) {
    return { send: false, reportDay, reason: "empty" };
  }
  const hour = londonHour(now);
  const target = resolveDailyQuoteReportHour(input.configuredLondonHour);
  if (hour < target) {
    return { send: false, reportDay, reason: "wrong_hour" };
  }
  return { send: true, reportDay, reason: "due" };
}

export function summarizeDailyQuoteSessions(
  sessions: DailyQuoteSessionRecord[],
): DailyQuoteReportTotals {
  const quotesGenerated = sessions.length;
  const bookingsCompleted = sessions.filter((session) => session.booked).length;
  const notBooked = quotesGenerated - bookingsCompleted;
  const conversionPercent =
    quotesGenerated === 0 ? 0 : Math.round((bookingsCompleted / quotesGenerated) * 100);
  return { quotesGenerated, bookingsCompleted, notBooked, conversionPercent };
}

export function mergeQuoteSessionRecord(
  existing: DailyQuoteSessionRecord | null,
  input: DailyQuoteSessionInput,
): DailyQuoteSessionRecord {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const txn = normalizeQuoteTransactionId(input.quoteTransactionId);
  const pickupLabel = input.pickupLabel.trim();
  const dropoffLabel = input.dropoffLabel.trim();
  const journeyDirection =
    input.journeyDirection?.trim() || input.tripLabel?.trim() || existing?.journeyDirection || "";
  const next: DailyQuoteSessionRecord = {
    quoteTransactionId: existing?.quoteTransactionId || txn,
    firstQuotedAt: existing?.firstQuotedAt || iso,
    lastUpdatedAt: iso,
    londonDay: existing?.londonDay || todayLondonDate(now),
    pickupLabel: pickupLabel || existing?.pickupLabel || "",
    dropoffLabel: dropoffLabel || existing?.dropoffLabel || "",
    airportCode: input.airportCode?.trim() || existing?.airportCode || null,
    journeyDirection,
    returnJourney:
      typeof input.returnJourney === "boolean"
        ? input.returnJourney
        : Boolean(existing?.returnJourney),
    passengers:
      typeof input.passengers === "number" && Number.isFinite(input.passengers)
        ? Math.trunc(input.passengers)
        : existing?.passengers ?? 0,
    suitcases:
      typeof input.suitcases === "number" && Number.isFinite(input.suitcases)
        ? Math.trunc(input.suitcases)
        : existing?.suitcases ?? 0,
    vehicle: input.vehicle?.trim() || existing?.vehicle || "",
    journeyFareGbp:
      input.journeyFareGbp != null && Number.isFinite(input.journeyFareGbp)
        ? Math.round(input.journeyFareGbp * 100) / 100
        : existing?.journeyFareGbp ?? null,
    airportAccessOption:
      input.airportAccessOption === undefined
        ? existing?.airportAccessOption ?? null
        : input.airportAccessOption?.trim() || null,
    airportAccessFeeGbp:
      typeof input.airportAccessFeeGbp === "number" && Number.isFinite(input.airportAccessFeeGbp)
        ? Math.round(input.airportAccessFeeGbp * 100) / 100
        : existing?.airportAccessFeeGbp ?? 0,
    totalGbp:
      input.totalGbp != null && Number.isFinite(input.totalGbp)
        ? Math.round(input.totalGbp * 100) / 100
        : parseGbpAmount(input.estimatedPriceLabel) ?? existing?.totalGbp ?? null,
    estimatedPriceLabel:
      input.estimatedPriceLabel?.trim() ||
      existing?.estimatedPriceLabel ||
      formatReportGbp(input.totalGbp ?? existing?.totalGbp ?? null),
    booked: existing?.booked === true,
    bookingReference: existing?.bookingReference ?? null,
    source: input.source || existing?.source || "website",
  };
  return next;
}

export function markQuoteSessionBooked(
  existing: DailyQuoteSessionRecord | null,
  input: {
    quoteTransactionId: string;
    bookingReference: string;
    now?: Date;
    fallback?: Partial<DailyQuoteSessionInput>;
  },
): DailyQuoteSessionRecord {
  const now = input.now ?? new Date();
  const base =
    existing ??
    mergeQuoteSessionRecord(null, {
      quoteTransactionId: input.quoteTransactionId,
      pickupLabel: input.fallback?.pickupLabel || "Unknown pickup",
      dropoffLabel: input.fallback?.dropoffLabel || "Unknown destination",
      airportCode: input.fallback?.airportCode,
      journeyDirection: input.fallback?.journeyDirection || input.fallback?.tripLabel,
      returnJourney: input.fallback?.returnJourney,
      passengers: input.fallback?.passengers,
      suitcases: input.fallback?.suitcases,
      vehicle: input.fallback?.vehicle,
      journeyFareGbp: input.fallback?.journeyFareGbp,
      airportAccessOption: input.fallback?.airportAccessOption,
      airportAccessFeeGbp: input.fallback?.airportAccessFeeGbp,
      totalGbp: input.fallback?.totalGbp,
      estimatedPriceLabel: input.fallback?.estimatedPriceLabel,
      source: input.fallback?.source,
      now,
    });
  return {
    ...base,
    lastUpdatedAt: now.toISOString(),
    booked: true,
    bookingReference: input.bookingReference.trim() || base.bookingReference,
  };
}

export function buildDailyQuoteReportSubject(londonDay: string): string {
  return `My Airport Taxi NI — Daily Quote Report — ${formatLondonReportDate(londonDay)}`;
}

function partyLine(session: DailyQuoteSessionRecord): string {
  const pax =
    session.passengers === 1 ? "1 passenger" : `${session.passengers} passengers`;
  const bags =
    session.suitcases === 1 ? "1 suitcase" : `${session.suitcases} suitcases`;
  return `${pax} · ${bags}`;
}

function accessLine(session: DailyQuoteSessionRecord): string {
  return session.airportAccessOption?.trim() || "No airport access charge";
}

function statusLine(session: DailyQuoteSessionRecord): string {
  if (session.booked) {
    return session.bookingReference
      ? `BOOKED · Ref ${session.bookingReference}`
      : "BOOKED";
  }
  return "Not booked";
}

export function buildDailyQuoteReportText(
  londonDay: string,
  sessions: DailyQuoteSessionRecord[],
): string {
  const totals = summarizeDailyQuoteSessions(sessions);
  const lines = [
    `Daily quote report for ${formatLondonReportDate(londonDay)} (Europe/London).`,
    "",
    `Quotes generated: ${totals.quotesGenerated}`,
    `Bookings completed: ${totals.bookingsCompleted}`,
    `Not booked: ${totals.notBooked}`,
    `Quote-to-booking conversion: ${totals.conversionPercent}%`,
    "",
  ];

  const ordered = [...sessions].sort((a, b) => a.firstQuotedAt.localeCompare(b.firstQuotedAt));
  for (const session of ordered) {
    lines.push(
      `${formatLondonClock(session.firstQuotedAt)}`,
      `${session.pickupLabel} → ${session.dropoffLabel}`,
      partyLine(session),
      vehicleReportLabel(session.vehicle),
      formatReportGbp(session.totalGbp),
      accessLine(session),
      statusLine(session),
      "",
    );
  }

  return lines.join("\n").trim();
}

export function buildDailyQuoteReportHtml(
  londonDay: string,
  sessions: DailyQuoteSessionRecord[],
): string {
  const totals = summarizeDailyQuoteSessions(sessions);
  const rows = [...sessions]
    .sort((a, b) => a.firstQuotedAt.localeCompare(b.firstQuotedAt))
    .map((session) => {
      const status = statusLine(session);
      const booked = session.booked;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(formatLondonClock(session.firstQuotedAt))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(`${session.pickupLabel} → ${session.dropoffLabel}`)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(partyLine(session))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(vehicleReportLabel(session.vehicle))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatReportGbp(session.totalGbp))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(accessLine(session))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:${booked ? "700" : "500"};color:${booked ? "#047857" : "#6b7280"};">${escapeHtml(status)}</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:Arial,sans-serif;color:#111827;max-width:800px;">
    <h1 style="font-size:20px;margin:0 0 12px;">Daily Quote Report — ${escapeHtml(formatLondonReportDate(londonDay))}</h1>
    <p style="margin:0 0 16px;font-size:14px;">
      Quotes generated: <strong>${totals.quotesGenerated}</strong><br/>
      Bookings completed: <strong>${totals.bookingsCompleted}</strong><br/>
      Not booked: <strong>${totals.notBooked}</strong><br/>
      Quote-to-booking conversion: <strong>${totals.conversionPercent}%</strong>
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr style="background:#0b1b33;color:#fff;text-align:left;">
          <th style="padding:8px 10px;">Time</th>
          <th style="padding:8px 10px;">Journey</th>
          <th style="padding:8px 10px;">Passengers / bags</th>
          <th style="padding:8px 10px;">Vehicle</th>
          <th style="padding:8px 10px;">Price</th>
          <th style="padding:8px 10px;">Airport access</th>
          <th style="padding:8px 10px;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Google Ads spend on the owner dashboard (Money → Today / This week / This month).
 *
 * The Google Ads API is not approved for this business's Cloud project, so spend arrives from a
 * Google Ads Script that runs inside the Google Ads account every hour and posts daily totals to
 * the Worker with a private token. Periods use Europe/London days and a Monday–Sunday week, the
 * same as earned revenue.
 */
import { addDaysYmd, londonYmd } from "./upcoming-jobs";

export type AdsSpendDay = { cost: number; clicks: number; impressions: number; conversions: number };
export type AdsSpendDaily = Record<string, AdsSpendDay>;
export type AdsSpendPeriod = { cost: number; clicks: number };
export type AdsSpendPeriods = { today: AdsSpendPeriod; week: AdsSpendPeriod; month: AdsSpendPeriod };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_DAYS = 400;

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Validate a posted report → clean day map (ignores anything malformed). */
export function sanitizeAdsSpendReport(value: unknown): AdsSpendDaily {
  const out: AdsSpendDaily = {};
  const days = (value as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) return out;
  for (const raw of days.slice(0, 500)) {
    const day = raw as Record<string, unknown>;
    const date = typeof day?.date === "string" ? day.date.trim() : "";
    if (!DAY_PATTERN.test(date)) continue;
    out[date] = {
      cost: Math.round(num(day.cost) * 100) / 100,
      clicks: Math.round(num(day.clicks)),
      impressions: Math.round(num(day.impressions)),
      conversions: Math.round(num(day.conversions) * 100) / 100,
    };
  }
  return out;
}

/** Newer report values replace older ones for the same day; very old days are dropped. */
export function mergeAdsSpend(existing: AdsSpendDaily, incoming: AdsSpendDaily, today = londonYmd()): AdsSpendDaily {
  const cutoff = addDaysYmd(today, -KEEP_DAYS);
  const merged: AdsSpendDaily = {};
  for (const [date, day] of Object.entries({ ...existing, ...incoming })) {
    if (date >= cutoff) merged[date] = day;
  }
  return merged;
}

export function mondayOf(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysYmd(day, -((dow + 6) % 7));
}

function sumBetween(daily: AdsSpendDaily, from: string, to: string): AdsSpendPeriod {
  let cost = 0;
  let clicks = 0;
  for (const [date, day] of Object.entries(daily)) {
    if (date < from || date > to) continue;
    cost += day.cost;
    clicks += day.clicks;
  }
  return { cost: Math.round(cost * 100) / 100, clicks };
}

export function adsSpendPeriods(daily: AdsSpendDaily, today = londonYmd()): AdsSpendPeriods {
  return {
    today: sumBetween(daily, today, today),
    week: sumBetween(daily, mondayOf(today), today),
    month: sumBetween(daily, `${today.slice(0, 8)}01`, today),
  };
}

/** The Google Ads Script the owner pastes into Tools → Bulk actions → Scripts. */
export function buildAdsSpendScript(reportUrl: string, token: string): string {
  return `/**
 * My Airport Taxi NI — sends Google Ads spend to the owner dashboard.
 * Schedule: Hourly. Reads this account's daily cost for the last 45 days.
 */
var REPORT_URL = ${JSON.stringify(reportUrl)};
var TOKEN = ${JSON.stringify(token)};

function main() {
  var account = AdsApp.currentAccount();
  var tz = account.getTimeZone();
  var end = new Date();
  var start = new Date(end.getTime() - 45 * 24 * 60 * 60 * 1000);
  var from = Utilities.formatDate(start, tz, "yyyy-MM-dd");
  var to = Utilities.formatDate(end, tz, "yyyy-MM-dd");
  var rows = AdsApp.search(
    "SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions " +
    "FROM customer WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'"
  );
  var days = [];
  while (rows.hasNext()) {
    var row = rows.next();
    days.push({
      date: row.segments.date,
      cost: Number(row.metrics.costMicros || 0) / 1000000,
      clicks: Number(row.metrics.clicks || 0),
      impressions: Number(row.metrics.impressions || 0),
      conversions: Number(row.metrics.conversions || 0)
    });
  }
  var response = UrlFetchApp.fetch(REPORT_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Ads-Spend-Token": TOKEN },
    payload: JSON.stringify({ currency: account.getCurrencyCode(), timeZone: tz, days: days }),
    muteHttpExceptions: true
  });
  Logger.log("Sent " + days.length + " days: HTTP " + response.getResponseCode() + " " + response.getContentText());
}
`;
}

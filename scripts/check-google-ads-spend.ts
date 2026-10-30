/** Google Ads spend on Money: report validation, London Monday–Sunday periods, script, routes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  adsSpendPeriods,
  buildAdsSpendScript,
  mergeAdsSpend,
  mondayOf,
  sanitizeAdsSpendReport,
} from "../shared/google-ads-spend";

assert.equal(mondayOf("2026-10-30"), "2026-10-26", "Friday → Monday");
assert.equal(mondayOf("2026-10-26"), "2026-10-26", "Monday stays");
assert.equal(mondayOf("2026-11-01"), "2026-10-26", "Sunday belongs to the week before");

const report = sanitizeAdsSpendReport({
  days: [
    { date: "2026-10-30", cost: 5.123, clicks: 4, impressions: 30, conversions: 0 },
    { date: "2026-10-27", cost: "25.58", clicks: 19, impressions: 109 },
    { date: "2026-10-25", cost: 29.98, clicks: 26 },
    { date: "2026-09-30", cost: 10, clicks: 2 },
    { date: "bad", cost: 99 },
    { date: "2026-10-29", cost: -4, clicks: "x" },
  ],
});
assert.equal(Object.keys(report).length, 5, "Malformed dates are ignored");
assert.equal(report["2026-10-30"].cost, 5.12);
assert.equal(report["2026-10-29"].cost, 0, "Negative/invalid numbers become zero");

const periods = adsSpendPeriods(report, "2026-10-30");
assert.deepEqual(periods.today, { cost: 5.12, clicks: 4 });
assert.deepEqual(periods.week, { cost: 30.7, clicks: 23 }, "Mon 26 – Fri 30 only");
assert.deepEqual(periods.month, { cost: 60.68, clicks: 49 }, "1–30 October");
console.log("OK  today / week (Mon–Sun) / month totals");

const merged = mergeAdsSpend(
  { "2026-10-30": { cost: 1, clicks: 1, impressions: 1, conversions: 0 }, "2024-01-01": { cost: 9, clicks: 9, impressions: 9, conversions: 0 } },
  { "2026-10-30": { cost: 6, clicks: 5, impressions: 40, conversions: 0 } },
  "2026-10-30",
);
assert.equal(merged["2026-10-30"].cost, 6, "Newer report replaces the day");
assert.equal(merged["2024-01-01"], undefined, "Very old days dropped");
console.log("OK  hourly reports replace each day's figure");

const script = buildAdsSpendScript("https://example.workers.dev/ads/spend-report", "abc123");
assert.match(script, /var TOKEN = "abc123";/);
assert.match(script, /metrics\.cost_micros/);
assert.match(script, /X-Ads-Spend-Token/);
assert.doesNotMatch(script, /AdsApp\.(campaigns|mutate)|setBudget|pause\(/, "Script only reads");
console.log("OK  script is read-only and posts with the token");

const worker = readFileSync(new URL("../workers/addresses/src/index.ts", import.meta.url), "utf8");
assert.match(worker, /"\/ads\/spend-report"/);
assert.match(worker, /handleOwnerAdsSpend\(/);
const handler = readFileSync(new URL("../workers/addresses/src/google-ads-spend.ts", import.meta.url), "utf8");
assert.match(handler, /ownerAuthorized\(request, env\)/);
assert.match(handler, /safeEqual\(presented, token\)/);
const money = readFileSync(new URL("../src/components/OwnerFinancialSummaryPanel.tsx", import.meta.url), "utf8");
assert.match(money, /Google Ads spend/);
assert.match(money, /\.catch\(\(\) => setAdsSpend\(null\)\)/, "Money totals never wait on ad spend");
console.log("OK  routes wired; owner-only script; Money shows spend without blocking");

/**
 * Owner booking availability: request-only vs unavailable rules, weekly days,
 * expired one-offs, and live status precedence.
 * Run: npx tsx scripts/check-owner-booking-availability.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQuickBlockRule,
  buildUnavailableTimeRule,
  expandSmartAvailabilityIntervals,
  findBlockingSmartInterval,
  findRequestOnlySmartBlock,
  isOneOffUnavailableExpired,
  resolveCurrentAvailabilityStatus,
  selectActiveUnavailableRules,
  smartAvailabilityEffect,
} from "../shared/smart-availability";
import { normalizeUnavailablePeriod } from "../shared/booking-notice";
import { addDaysYmd, londonYmd } from "../shared/upcoming-jobs";
import { shouldForceShortNotice } from "../workers/addresses/src/short-notice-handlers";
import { saveSmartOpsState, defaultSmartOpsState } from "../workers/addresses/src/smart-ops-store";
import type { PaidBookingDetails } from "../workers/addresses/shared/booking-notifications";

const root = process.cwd();
const NOW = new Date("2026-09-28T10:00:00+01:00");
const TODAY = londonYmd(NOW);
assert.equal(TODAY, "2026-09-28");

function memoryKv(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw);
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  } as unknown as KVNamespace;
}

function booking(tripTime: string, tripDate = TODAY): PaidBookingDetails {
  return {
    customerName: "Test",
    customerEmail: "test@example.com",
    mobileNumber: "07700900000",
    pickupLabel: "Belfast",
    dropoffLabel: "Belfast International Airport",
    tripDate,
    tripTime,
    passengers: 1,
    suitcases: "0",
    vehicle: "Saloon",
  } as PaidBookingDetails;
}

console.log("=== Quick blocks stay unavailable ===");
{
  for (const hours of [1, 2, 4] as const) {
    const rule = buildQuickBlockRule("hours", hours, NOW);
    assert.ok(rule);
    assert.equal(smartAvailabilityEffect(rule), "unavailable");
    assert.equal(rule.effect, undefined);
    const status = resolveCurrentAvailabilityStatus({ rules: [rule], now: NOW });
    assert.equal(status.state, "unavailable");
    assert.equal(status.available, false);
    assert.match(status.headline, /^UNAVAILABLE UNTIL /);
  }
  const rest = buildQuickBlockRule("rest_of_today", 0, NOW);
  assert.ok(rest);
  assert.equal(rest.endLocal, "2026-09-29T00:00");
  assert.equal(
    resolveCurrentAvailabilityStatus({ rules: [rest], now: NOW }).headline,
    "UNAVAILABLE UNTIL TOMORROW 00:00",
  );
  console.log("OK  1h / 2h / 4h / rest of today");
}

console.log("\n=== One-off unavailable and request only ===");
{
  const closed = buildUnavailableTimeRule({
    id: "closed",
    effect: "unavailable",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "09:00",
    endTime: "12:00",
  });
  const request = buildUnavailableTimeRule({
    id: "request",
    effect: "request_only",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "13:00",
    endTime: "15:00",
  });
  assert.ok(closed && request);
  assert.equal(closed.effect, undefined);
  assert.equal(request.effect, "request_only");
  const before = resolveCurrentAvailabilityStatus({
    rules: [request],
    now: new Date("2026-09-28T12:00:00+01:00"),
  });
  assert.equal(before.state, "available");
  const during = resolveCurrentAvailabilityStatus({
    rules: [request],
    now: new Date("2026-09-28T13:30:00+01:00"),
  });
  assert.equal(during.state, "request_only");
  assert.match(during.headline, /REQUEST ONLY UNTIL 15:00/);
  assert.match(during.detail, /Available afterwards/);
  const after = resolveCurrentAvailabilityStatus({
    rules: [request],
    now: new Date("2026-09-28T15:00:00+01:00"),
  });
  assert.equal(after.state, "available");
  const hard = expandSmartAvailabilityIntervals({
    rules: [closed, request],
    fromYmd: TODAY,
    toYmd: TODAY,
  });
  assert.ok(findBlockingSmartInterval(TODAY, "10:00", hard));
  assert.equal(findBlockingSmartInterval(TODAY, "14:00", hard), null);
  const soft = findRequestOnlySmartBlock({
    rules: [closed, request],
    tripDate: TODAY,
    tripTime: "14:00",
  });
  assert.equal(soft?.ruleId, "request");
  assert.equal(
    findRequestOnlySmartBlock({ rules: [closed, request], tripDate: TODAY, tripTime: "10:00" }),
    null,
  );
  console.log("OK  one-off states, before / during / after");
}

console.log("\n=== Weekly multi-day is one rule ===");
{
  const closed = buildUnavailableTimeRule({
    id: "week-closed",
    effect: "unavailable",
    repeat: "recurring",
    startTime: "08:00",
    endTime: "10:00",
    weekdays: [1, 3, 5],
  });
  const request = buildUnavailableTimeRule({
    id: "week-request",
    effect: "request_only",
    repeat: "recurring",
    startTime: "13:00",
    endTime: "15:00",
    weekdays: [1, 2, 3, 4, 5],
  });
  assert.ok(closed && request);
  assert.deepEqual(closed.weekdays, [1, 3, 5]);
  assert.deepEqual(request.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(request.effect, "request_only");
  const monday = "2026-09-28";
  const tuesday = "2026-09-29";
  const hard = expandSmartAvailabilityIntervals({
    rules: [closed],
    fromYmd: monday,
    toYmd: "2026-10-05",
  });
  assert.ok(findBlockingSmartInterval(monday, "09:00", hard));
  assert.equal(findBlockingSmartInterval(tuesday, "09:00", hard), null);
  assert.ok(findBlockingSmartInterval("2026-09-30", "09:00", hard));
  const softTuesday = findRequestOnlySmartBlock({
    rules: [request],
    tripDate: tuesday,
    tripTime: "14:00",
  });
  assert.equal(softTuesday?.ruleId, "week-request");
  assert.equal(
    findRequestOnlySmartBlock({ rules: [request], tripDate: "2026-10-03", tripTime: "14:00" }),
    null,
  );
  const afterToday = new Date("2026-09-28T16:00:00+01:00");
  assert.equal(isOneOffUnavailableExpired(request, afterToday), false);
  assert.equal(selectActiveUnavailableRules([request, closed], afterToday).length, 2);
  console.log("OK  one record covers several weekdays and stays after today");
}

console.log("\n=== Expired one-off hidden, recurring kept ===");
{
  const expired = buildUnavailableTimeRule({
    id: "gone",
    effect: "request_only",
    repeat: "one_off",
    date: "2026-09-27",
    endDate: "2026-09-27",
    startTime: "13:00",
    endTime: "15:00",
  });
  const weekly = buildUnavailableTimeRule({
    id: "stays",
    effect: "unavailable",
    repeat: "recurring",
    startTime: "08:00",
    endTime: "09:00",
    weekdays: [1],
  });
  assert.ok(expired && weekly);
  const active = selectActiveUnavailableRules([expired, weekly], NOW);
  assert.deepEqual(active.map((rule) => rule.id), ["stays"]);
  assert.equal(resolveCurrentAvailabilityStatus({ rules: [expired], now: NOW }).state, "available");
  console.log("OK  expired one-off filtered from the active list");
}

console.log("\n=== Unavailable wins over request only ===");
{
  const closed = buildUnavailableTimeRule({
    id: "hard",
    effect: "unavailable",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "09:00",
    endTime: "12:00",
  });
  const request = buildUnavailableTimeRule({
    id: "soft",
    effect: "request_only",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "08:00",
    endTime: "15:00",
  });
  assert.ok(closed && request);
  const during = resolveCurrentAvailabilityStatus({ rules: [closed, request], now: NOW });
  assert.equal(during.state, "unavailable");
  assert.equal(during.headline, "UNAVAILABLE UNTIL 12:00");
  const later = resolveCurrentAvailabilityStatus({
    rules: [closed, request],
    now: new Date("2026-09-28T12:30:00+01:00"),
  });
  assert.equal(later.state, "request_only");
  assert.match(later.headline, /REQUEST ONLY UNTIL 15:00/);
  const period = normalizeUnavailablePeriod({
    id: "legacy-request",
    startLocal: `${TODAY}T13:00`,
    endLocal: `${TODAY}T15:00`,
    mode: "request_only",
  });
  const hardClose = normalizeUnavailablePeriod({
    id: "legacy-closed",
    startLocal: `${TODAY}T09:00`,
    endLocal: `${TODAY}T11:00`,
    mode: "no_availability",
  });
  assert.ok(period && hardClose);
  const hardIntervals = expandSmartAvailabilityIntervals({
    rules: [],
    legacyPeriods: [period, hardClose],
    fromYmd: TODAY,
    toYmd: TODAY,
  });
  assert.equal(hardIntervals.length, 1);
  assert.equal(hardIntervals[0]?.ruleId, "legacy-closed");
  const softIntervals = expandSmartAvailabilityIntervals({
    rules: [],
    legacyPeriods: [period, hardClose],
    fromYmd: TODAY,
    toYmd: TODAY,
    include: "request_only",
  });
  assert.equal(softIntervals[0]?.ruleId, "legacy-request");
  const overlapped = resolveCurrentAvailabilityStatus({
    rules: [],
    legacyPeriods: [period, hardClose],
    now: NOW,
  });
  assert.equal(overlapped.state, "unavailable");
  console.log("OK  unavailable precedence, legacy request-only is not a hard block");
}

async function main() {
console.log("\n=== Request-only smart rule forces short notice ===");
{
  const rule = buildUnavailableTimeRule({
    id: "smart-request",
    effect: "request_only",
    repeat: "one_off",
    date: addDaysYmd(TODAY, 3),
    endDate: addDaysYmd(TODAY, 3),
    startTime: "13:00",
    endTime: "15:00",
  });
  assert.ok(rule);
  const store = memoryKv({
    "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 12 },
  });
  await saveSmartOpsState(store, {
    ...defaultSmartOpsState(),
    rules: [rule],
  });
  const inside = await shouldForceShortNotice(
    store,
    booking("14:00", addDaysYmd(TODAY, 3)),
    NOW,
  );
  assert.equal(inside.noAvailability, false);
  assert.equal(inside.shortNotice, true);
  assert.equal(inside.blockingPeriodId, "smart-request");
  const outside = await shouldForceShortNotice(
    store,
    booking("16:00", addDaysYmd(TODAY, 3)),
    NOW,
  );
  assert.equal(outside.shortNotice, false);
  assert.equal(outside.blockingPeriodId, null);
  console.log("OK  smart request-only uses the existing short-notice gate");
}

console.log("\n=== Dashboard wiring ===");
{
  const page = readFileSync(join(root, "src/app/driver/DriverPageClient.tsx"), "utf8");
  const panel = readFileSync(join(root, "src/components/OwnerSmartAvailabilityPanel.tsx"), "utf8");
  const jobs = readFileSync(join(root, "src/components/OwnerPaidBookingsPanel.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/OwnerLiveAvailabilityCard.tsx"), "utf8");
  assert.match(page, /OwnerLiveAvailabilityCard/);
  assert.match(page, /setOwnerToolTab\("availability"\)/);
  assert.match(card, /resolveCurrentAvailabilityStatus/);
  assert.match(panel, /Request only/);
  assert.match(panel, /grid grid-cols-7/);
  assert.match(panel, /section="manage"/);
  assert.match(jobs, /Past Jobs/);
  assert.match(jobs, /selectJobsForDate/);
  assert.match(jobs, /pastDays: 0/);
  assert.match(jobs, /groupCompletedDaysByMonth/);
  assert.match(jobs, /Load earlier jobs/);
  console.log("OK  live status, weekday chips, upcoming/past jobs");
}

console.log("\nAll owner booking availability checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

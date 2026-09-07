/**
 * Owner Availability redesign + return-booking earned revenue.
 * Run: npx tsx scripts/check-owner-availability-earned-revenue.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQuickBlockRule,
  buildUnavailableTimeRule,
  buildUntilAvailableRule,
  clearActiveQuickBlocks,
  compactUnavailableRuleLabel,
  describeUnavailableRule,
  expandSmartAvailabilityIntervals,
  findBlockingSmartInterval,
  isOneOffUnavailableExpired,
  mergeOverlappingBlockedIntervals,
  resolveCurrentAvailabilityStatus,
  selectActiveUnavailableRules,
  untilShortcutEndLocal,
  validateUnavailableTimeForm,
} from "../shared/smart-availability";
import {
  allocateOwnerLegFares,
  buildOwnerOperationalMetrics,
  ownerAirportPassThroughChargesGbp,
  persistableLegFares,
  type OwnerOpsPaidBooking,
} from "../shared/owner-dashboard-ops";
import { addDaysYmd, londonYmd } from "../shared/upcoming-jobs";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const NOW = new Date("2026-09-07T08:30:00+01:00");
const TODAY = londonYmd(NOW);
assert.equal(TODAY, "2026-09-07");

function paid(
  overrides: Partial<OwnerOpsPaidBooking> & { paymentReference: string },
): OwnerOpsPaidBooking {
  return {
    createdAt: "2026-09-01T10:00:00.000Z",
    status: "confirmed",
    customerName: "Test",
    pickupLabel: "BFS",
    dropoffLabel: "BT36",
    tripDate: TODAY,
    tripTime: "09:00",
    amount: 100,
    ...overrides,
  };
}

console.log("=== Availability A: 1 hour from 08:30 ===");
{
  const rule = buildQuickBlockRule("hours", 1, NOW);
  assert.ok(rule);
  assert.equal(rule.startLocal, "2026-09-07T08:30");
  assert.equal(rule.endLocal, "2026-09-07T09:30");
  const status = resolveCurrentAvailabilityStatus({ rules: [rule], now: NOW });
  assert.equal(status.available, false);
  assert.equal(status.headline, "UNAVAILABLE UNTIL 09:30");
  console.log("OK  A  Unavailable until 09:30");
}

console.log("\n=== Availability B: 4 hours from 08:30 ===");
{
  const rule = buildQuickBlockRule("hours", 4, NOW);
  assert.ok(rule);
  assert.equal(rule.endLocal, "2026-09-07T12:30");
  const status = resolveCurrentAvailabilityStatus({ rules: [rule], now: NOW });
  assert.equal(status.headline, "UNAVAILABLE UNTIL 12:30");
  console.log("OK  B  Unavailable until 12:30");
}

console.log("\n=== Availability C: Rest of today ===");
{
  const rule = buildQuickBlockRule("rest_of_today", 0, NOW);
  assert.ok(rule);
  assert.equal(rule.startLocal, "2026-09-07T08:30");
  assert.equal(rule.endLocal, "2026-09-08T00:00");
  const status = resolveCurrentAvailabilityStatus({ rules: [rule], now: NOW });
  assert.equal(status.headline, "UNAVAILABLE UNTIL TOMORROW 00:00");
  console.log("OK  C  Unavailable for remainder of today");
}

console.log("\n=== Availability D: Until Monday 04:00 ===");
{
  const rule = buildUntilAvailableRule("2026-09-08T04:00", NOW);
  assert.ok(rule);
  assert.equal(rule.startLocal, "2026-09-07T08:30");
  assert.equal(rule.endLocal, "2026-09-08T04:00");
  const status = resolveCurrentAvailabilityStatus({ rules: [rule], now: NOW });
  assert.equal(status.headline, "UNAVAILABLE UNTIL TOMORROW 04:00");
  assert.equal(untilShortcutEndLocal("tomorrow_04", NOW), "2026-09-08T04:00");
  console.log("OK  D  Sunday 08:30 → Monday 04:00");
}

console.log("\n=== Availability E: Overnight scheduled 22:00 → 04:00 ===");
{
  const rule = buildUnavailableTimeRule({
    repeat: "one_off",
    date: TODAY,
    endDate: addDaysYmd(TODAY, 1),
    startTime: "22:00",
    endTime: "04:00",
  });
  assert.ok(rule);
  assert.equal(rule.startLocal, "2026-09-07T22:00");
  assert.equal(rule.endLocal, "2026-09-08T04:00");
  const during = resolveCurrentAvailabilityStatus({
    rules: [rule],
    now: new Date("2026-09-08T01:00:00+01:00"),
  });
  assert.equal(during.available, false);
  assert.equal(during.headline, "UNAVAILABLE UNTIL 04:00");
  const intervals = expandSmartAvailabilityIntervals({
    rules: [rule],
    fromYmd: TODAY,
    toYmd: addDaysYmd(TODAY, 1),
  });
  assert.ok(findBlockingSmartInterval(addDaysYmd(TODAY, 1), "03:30", intervals));
  assert.equal(findBlockingSmartInterval(addDaysYmd(TODAY, 1), "04:00", intervals), null);
  assert.match(describeUnavailableRule(rule, TODAY), /Tonight 22:00 → Tomorrow 04:00/);
  console.log("OK  E  overnight blocking");
}

console.log("\n=== Availability F: expired one-off hidden ===");
{
  const expired = buildUnavailableTimeRule({
    id: "expired",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "00:00",
    endTime: "03:00",
  });
  assert.ok(expired);
  assert.equal(isOneOffUnavailableExpired(expired, NOW), true);
  const active = selectActiveUnavailableRules([expired], NOW);
  assert.equal(active.length, 0);
  const status = resolveCurrentAvailabilityStatus({ rules: [expired], now: NOW });
  assert.equal(status.available, true);
  assert.equal(findBlockingSmartInterval(TODAY, "09:00", expandSmartAvailabilityIntervals({
    rules: [expired],
    fromYmd: TODAY,
    toYmd: TODAY,
  })), null);
  console.log("OK  F  expired 00:00–03:00 hidden and not blocking");
}

console.log("\n=== Availability G: future block keeps AVAILABLE NOW ===");
{
  const future = buildUnavailableTimeRule({
    id: "later",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "12:30",
    endTime: "14:00",
  });
  assert.ok(future);
  const status = resolveCurrentAvailabilityStatus({ rules: [future], now: NOW });
  assert.equal(status.available, true);
  assert.equal(status.headline, "AVAILABLE NOW");
  const listed = selectActiveUnavailableRules([future], NOW);
  assert.equal(listed.length, 1);
  assert.equal(compactUnavailableRuleLabel(future, TODAY), "12:30–14:00");
  console.log("OK  G  future 12:30–14:00 shown · status available");
}

console.log("\n=== Availability H: active 08:15–10:00 ===");
{
  const active = buildUnavailableTimeRule({
    id: "now-block",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "08:15",
    endTime: "10:00",
  });
  assert.ok(active);
  const status = resolveCurrentAvailabilityStatus({ rules: [active], now: NOW });
  assert.equal(status.headline, "UNAVAILABLE UNTIL 10:00");
  console.log("OK  H  UNAVAILABLE UNTIL 10:00");
}

console.log("\n=== Availability I: overlapping 08:00–10:00 + 09:30–12:00 ===");
{
  const a = buildUnavailableTimeRule({
    id: "a",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "08:00",
    endTime: "10:00",
  });
  const b = buildUnavailableTimeRule({
    id: "b",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "09:30",
    endTime: "12:00",
  });
  assert.ok(a && b);
  const intervals = expandSmartAvailabilityIntervals({
    rules: [a, b],
    fromYmd: TODAY,
    toYmd: TODAY,
  });
  const merged = mergeOverlappingBlockedIntervals(intervals);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.startLocal, "2026-09-07T08:00");
  assert.equal(merged[0]?.endLocal, "2026-09-07T12:00");
  const status = resolveCurrentAvailabilityStatus({ rules: [a, b], now: NOW });
  assert.equal(status.headline, "UNAVAILABLE UNTIL 12:00");
  console.log("OK  I  continuous 08:00–12:00");
}

console.log("\n=== Availability J: weekly recurring still works ===");
{
  const weekly = buildUnavailableTimeRule({
    id: "tue",
    repeat: "recurring",
    startTime: "08:00",
    endTime: "10:00",
    weekdays: [2],
  });
  assert.ok(weekly);
  const tuesday = "2026-09-08";
  const intervals = expandSmartAvailabilityIntervals({
    rules: [weekly],
    fromYmd: TODAY,
    toYmd: addDaysYmd(TODAY, 8),
  });
  assert.ok(findBlockingSmartInterval(tuesday, "08:30", intervals));
  assert.equal(findBlockingSmartInterval(tuesday, "10:00", intervals), null);
  assert.equal(findBlockingSmartInterval(TODAY, "08:30", intervals), null);
  assert.equal(isOneOffUnavailableExpired(weekly, NOW), false);
  assert.equal(selectActiveUnavailableRules([weekly], NOW).length, 1);
  assert.match(describeUnavailableRule(weekly, TODAY), /Every Tuesday · 08:00–10:00/);
  console.log("OK  J  weekly Tuesday 08:00–10:00");
}

console.log("\n=== Availability K: Available now keeps future scheduled block ===");
{
  const quick = buildQuickBlockRule("hours", 2, NOW);
  const later = buildUnavailableTimeRule({
    id: "school",
    repeat: "one_off",
    date: TODAY,
    endDate: TODAY,
    startTime: "16:00",
    endTime: "18:00",
    note: "School run",
  });
  assert.ok(quick && later);
  const cleared = clearActiveQuickBlocks([later, quick], NOW);
  assert.equal(cleared.find((rule) => rule.id === later.id)?.enabled, true);
  assert.equal(cleared.find((rule) => rule.id === quick.id)?.enabled, false);
  const after = resolveCurrentAvailabilityStatus({ rules: cleared, now: NOW });
  assert.equal(after.available, true);
  assert.equal(selectActiveUnavailableRules(cleared, NOW).some((rule) => rule.id === later.id), true);
  console.log("OK  K  available immediately · later 16:00–18:00 kept");
}

console.log("\n=== Overnight form validation ===");
{
  assert.equal(
    validateUnavailableTimeForm({
      repeat: "one_off",
      date: TODAY,
      endDate: TODAY,
      startTime: "22:00",
      endTime: "04:00",
    }),
    "Unavailable until must be after unavailable from. For an overnight block, set the until date to the next day.",
  );
  assert.equal(
    validateUnavailableTimeForm({
      repeat: "one_off",
      date: TODAY,
      endDate: addDaysYmd(TODAY, 1),
      startTime: "22:00",
      endTime: "04:00",
    }),
    null,
  );
  console.log("OK  overnight needs an explicit next-day until date");
}

console.log("\n=== Revenue A: historic return outbound only ===");
{
  const booking = paid({
    paymentReference: "REV-A",
    returnJourney: true,
    tripDate: TODAY,
    returnDate: "2026-09-14",
    amount: 100,
    expressDropOffFee: 6,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-07T10:00:00.000Z",
    returnJourneyStatus: "scheduled",
  });
  const fares = allocateOwnerLegFares(booking);
  assert.equal(fares.allocated, true);
  assert.equal(fares.outboundFare, 47);
  assert.equal(ownerAirportPassThroughChargesGbp(booking), 6);
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.journeysCompleted, 1);
  assert.equal(metrics.today.earnedRevenueGbp, 47);
  console.log("OK  Revenue A  completed 1 · earned £47");
}

console.log("\n=== Revenue B: return completed later ===");
{
  const booking = paid({
    paymentReference: "REV-B",
    returnJourney: true,
    tripDate: TODAY,
    returnDate: "2026-09-14",
    amount: 100,
    expressDropOffFee: 6,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-07T10:00:00.000Z",
    returnJourneyStatus: "completed",
    returnCompletedAt: "2026-09-14T18:00:00.000Z",
  });
  const outboundDay = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(outboundDay.today.earnedRevenueGbp, 47);
  const returnDay = buildOwnerOperationalMetrics({
    paidBookings: [booking],
    now: new Date("2026-09-14T20:00:00+01:00"),
  });
  assert.equal(returnDay.today.earnedRevenueGbp, 47);
  assert.equal(returnDay.today.journeysCompleted, 1);
  assert.equal(
    outboundDay.today.earnedRevenueGbp + returnDay.today.earnedRevenueGbp,
    94,
  );
  console.log("OK  Revenue B  £47 + £47 on their own completion days");
}

console.log("\n=== Revenue C: stored leg fares kept ===");
{
  const booking = paid({
    paymentReference: "REV-C",
    returnJourney: true,
    amount: 100,
    outboundFare: 52,
    returnFare: 42,
    expressDropOffFee: 6,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-09-07T10:00:00.000Z",
  });
  const fares = allocateOwnerLegFares(booking);
  assert.equal(fares.allocated, false);
  assert.equal(fares.outboundFare, 52);
  assert.equal(fares.returnFare, 42);
  assert.equal(persistableLegFares({ returnJourney: true, outboundFare: 52, returnFare: 42 })?.returnFare, 42);
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.earnedRevenueGbp, 52);
  console.log("OK  Revenue C  stored £52 / £42 used");
}

console.log("\n=== Revenue D: payment today does not earn yet ===");
{
  const booking = paid({
    paymentReference: "REV-D",
    createdAt: "2026-09-07T08:00:00.000Z",
    tripDate: "2026-09-20",
    amount: 80,
    outboundJourneyStatus: "scheduled",
  });
  const metrics = buildOwnerOperationalMetrics({ paidBookings: [booking], now: NOW });
  assert.equal(metrics.today.paymentsReceivedGbp, 80);
  assert.equal(metrics.today.earnedRevenueGbp, 0);
  assert.equal(metrics.today.journeysCompleted, 0);
  console.log("OK  Revenue D  received £80 · earned £0");
}

console.log("\n=== Revenue E: legs in different weeks/months ===");
{
  const booking = paid({
    paymentReference: "REV-E",
    returnJourney: true,
    tripDate: "2026-08-28",
    returnDate: "2026-09-14",
    amount: 100,
    expressDropOffFee: 6,
    outboundJourneyStatus: "completed",
    outboundCompletedAt: "2026-08-28T11:00:00.000Z",
    returnJourneyStatus: "completed",
    returnCompletedAt: "2026-09-14T18:00:00.000Z",
  });
  const august = buildOwnerOperationalMetrics({
    paidBookings: [booking],
    now: new Date("2026-08-28T20:00:00+01:00"),
  });
  assert.equal(august.today.earnedRevenueGbp, 47);
  assert.equal(august.month.earnedRevenueGbp, 47);
  const september = buildOwnerOperationalMetrics({
    paidBookings: [booking],
    now: new Date("2026-09-14T20:00:00+01:00"),
  });
  assert.equal(september.today.earnedRevenueGbp, 47);
  assert.equal(september.month.earnedRevenueGbp, 47);
  assert.equal(september.week.earnedRevenueGbp, 47);
  console.log("OK  Revenue E  each leg stays on its own period");
}

console.log("\n=== UI wiring ===");
{
  const panel = read("src/components/OwnerSmartAvailabilityPanel.tsx");
  assert.match(panel, /AVAILABLE NOW/);
  assert.match(panel, /Until…/);
  assert.match(panel, /Rest of today/);
  assert.match(panel, /Available now/);
  assert.match(panel, /Schedule unavailable time/);
  assert.match(panel, /Until date/);
  assert.match(panel, /data-owner-until-picker/);
  assert.doesNotMatch(panel, /quick block/);
  assert.match(panel, /compactUnavailableRuleLabel/);
  assert.match(panel, /aria-label="Delete unavailable time"/);
  const finance = read("src/components/OwnerFinancialSummaryPanel.tsx");
  assert.match(finance, /excluding airport pass-through charges/);
  assert.doesNotMatch(finance, /count as earned only when both legs are completed/);
  const handlers = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(handlers, /buildUntilAvailableRule/);
  assert.match(handlers, /kind === "until"/);
  console.log("OK  UI wiring");
}

console.log("\nAll owner availability + earned-revenue checks passed.");

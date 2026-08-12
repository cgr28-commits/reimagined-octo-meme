/**
 * Europe/London timezone + 2026 DST clock-change coverage.
 * Run: npx tsx scripts/check-uk-time.ts
 */

import assert from "node:assert/strict";
import {
  UK_LOCAL_TIME_LABEL,
  UK_TIME_ZONE,
  formatUkDateTime,
  formatUkDateTimeValue,
  formatUkInstant,
  formatUkSubmissionTime,
  londonUtcOffsetMinutes,
  parseLondonLocalDateTime,
  parseLondonLocalIso,
} from "../shared/uk-time";
import { buildPickupDateTimeLocal, formatLondonDateTime, getTrackingWindow } from "../shared/tracking";
import { buildBookingCalendarSlots } from "../shared/booking-calendar";
import { formatUkDateTime as siteFormatUkDateTime, formatUkSubmissionTime as siteFormatUkSubmissionTime } from "../src/lib/format-datetime";
import { isTripPremiumDateTime } from "../src/lib/point-to-point-premium";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function assertNoGmtBst(label: string) {
  assert.doesNotMatch(label, /\bGMT\b|\bBST\b/, `unexpected GMT/BST in: ${label}`);
  assert.match(label, /UK local time/);
}

async function main() {
  check("Shared UK timezone constant is Europe/London", () => {
    assert.equal(UK_TIME_ZONE, "Europe/London");
    assert.equal(UK_LOCAL_TIME_LABEL, "UK local time");
  });

  check("Customer wall-clock pickup is treated as London local (winter GMT)", () => {
    // 2026-01-15 14:30 London = 14:30 UTC
    const instant = parseLondonLocalDateTime("2026-01-15", "14:30");
    assert.ok(instant);
    assert.equal(instant!.toISOString(), "2026-01-15T14:30:00.000Z");
    assert.equal(londonUtcOffsetMinutes(instant!), 0);
  });

  check("Customer wall-clock pickup is treated as London local (summer BST)", () => {
    // 2026-07-15 14:30 London = 13:30 UTC
    const instant = parseLondonLocalDateTime("2026-07-15", "14:30");
    assert.ok(instant);
    assert.equal(instant!.toISOString(), "2026-07-15T13:30:00.000Z");
    assert.equal(londonUtcOffsetMinutes(instant!), 60);
  });

  check("29 March 2026: GMT → BST (clocks forward 01:00 → 02:00)", () => {
    const before = parseLondonLocalDateTime("2026-03-29", "00:30");
    const after = parseLondonLocalDateTime("2026-03-29", "02:30");
    assert.ok(before && after);
    assert.equal(londonUtcOffsetMinutes(before!), 0);
    assert.equal(londonUtcOffsetMinutes(after!), 60);
    assert.equal(before!.toISOString(), "2026-03-29T00:30:00.000Z");
    assert.equal(after!.toISOString(), "2026-03-29T01:30:00.000Z");

    // 01:30 does not exist on the spring-forward day — parser still returns a Date
    // without inventing a fake permanent GMT/BST hardcode.
    const gap = parseLondonLocalDateTime("2026-03-29", "01:30");
    assert.ok(gap);
  });

  check("25 October 2026: BST → GMT (clocks back 02:00 → 01:00)", () => {
    const stillBst = parseLondonLocalDateTime("2026-10-25", "00:30");
    const afterFold = parseLondonLocalDateTime("2026-10-25", "02:30");
    assert.ok(stillBst && afterFold);
    assert.equal(londonUtcOffsetMinutes(stillBst!), 60);
    assert.equal(londonUtcOffsetMinutes(afterFold!), 0);
    assert.equal(stillBst!.toISOString(), "2026-10-24T23:30:00.000Z");
    assert.equal(afterFold!.toISOString(), "2026-10-25T02:30:00.000Z");

    // Ambiguous 01:30 — either offset is acceptable; must still parse.
    const ambiguous = parseLondonLocalIso("2026-10-25T01:30:00");
    assert.ok(ambiguous);
    const offset = londonUtcOffsetMinutes(ambiguous!);
    assert.ok(offset === 0 || offset === 60, `expected 0 or 60, got ${offset}`);
  });

  check("Stored UTC instants display as UK local time without GMT/BST", () => {
    // 2026-07-15 13:30 UTC = 14:30 London BST
    const summer = formatUkInstant("2026-07-15T13:30:00.000Z");
    assertNoGmtBst(summer);
    assert.match(summer, /14:30/);

    // 2026-01-15 14:30 UTC = 14:30 London GMT
    const winter = formatUkInstant("2026-01-15T14:30:00.000Z");
    assertNoGmtBst(winter);
    assert.match(winter, /14:30/);
  });

  check("Submission timestamps use UK local time label", () => {
    const label = formatUkSubmissionTime(new Date("2026-07-15T13:30:00.000Z"));
    assertNoGmtBst(label);
    assert.match(label, /14:30/);
    assertNoGmtBst(siteFormatUkSubmissionTime(new Date("2026-01-15T14:30:00.000Z")));
  });

  check("Pickup date/time formatting keeps wall clock and adds UK local time", () => {
    const label = formatUkDateTime("2026-03-29", "02:30");
    assert.equal(label, "29-03-2026 at 02:30 (UK local time)");
    assert.equal(siteFormatUkDateTime("2026-10-25", "02:30"), "25-10-2026 at 02:30 (UK local time)");
  });

  check("Tracking window uses London local pickup across DST", () => {
    const pickupAt = buildPickupDateTimeLocal("2026-03-29", "02:30");
    assert.equal(pickupAt, "2026-03-29T02:30");
    const early = getTrackingWindow(pickupAt!, new Date("2026-03-28T20:00:00.000Z"));
    assert.equal(early.open, false);
    assert.equal(early.reason, "too_early");
    // 02:30 London BST = 01:30 UTC; opensAt = 01:30 UTC - 2h = 2026-03-28T23:30:00.000Z
    assert.equal(early.opensAt, "2026-03-28T23:30:00.000Z");

    const open = getTrackingWindow(pickupAt!, new Date("2026-03-29T00:00:00.000Z"));
    assert.equal(open.open, true);
    assert.equal(open.reason, "open");

    const display = formatLondonDateTime(pickupAt!);
    assertNoGmtBst(display);
    assert.match(display, /02:30/);
  });

  check("Calendar slots keep Europe/London wall-clock datetimes", () => {
    const slots = buildBookingCalendarSlots({
      customerName: "Test",
      tripLabel: "BFS transfer",
      pickupLabel: "Bangor",
      dropoffLabel: "BFS",
      tripDate: "2026-03-29",
      tripTime: "02:30",
    });
    assert.equal(slots[0]?.start, "2026-03-29T02:30:00");
    assert.equal(slots[0]?.end, "2026-03-29T04:00:00");
  });

  check("Autumn DST calendar end time stays on London wall clock", () => {
    const slots = buildBookingCalendarSlots({
      customerName: "Test",
      tripLabel: "BFS transfer",
      pickupLabel: "Bangor",
      dropoffLabel: "BFS",
      tripDate: "2026-10-25",
      tripTime: "01:45",
    });
    assert.equal(slots[0]?.start, "2026-10-25T01:45:00");
    // 90 real minutes after the first 01:45 (still BST) lands at 02:15 UK local after the fold.
    assert.equal(slots[0]?.end, "2026-10-25T02:15:00");
  });

  check("Weekend premium uses UK calendar weekday, not server local TZ", () => {
    // Saturday in UK
    assert.equal(isTripPremiumDateTime("2026-03-28", "10:00"), true);
    // Monday after 06:30 — not premium
    assert.equal(isTripPremiumDateTime("2026-03-30", "07:00"), false);
    // Monday before 06:30 — premium
    assert.equal(isTripPremiumDateTime("2026-03-30", "06:00"), true);
  });

  check("UTC ISO vs London wall-clock display both avoid GMT/BST", () => {
    assertNoGmtBst(formatUkDateTimeValue("2026-07-15T14:30"));
    assertNoGmtBst(formatUkDateTimeValue("2026-07-15T13:30:00.000Z"));
  });

  console.log(`\n${passed} UK time checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

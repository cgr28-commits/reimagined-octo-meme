/**
 * Offline checks for Owner Booking Calendar.
 * Run: npx tsx scripts/check-owner-booking-calendar.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calendarEntriesFromPaidBooking,
  calendarEntryFromDriverJob,
  deriveCalendarLegStatus,
  mergeCalendarEntries,
  normalizeServiceType,
  rangeForView,
  weekDates,
} from "../src/lib/owner-booking-calendar";
import type { DriverJob } from "../src/lib/tracking-api";
import type { OwnerPaidBookingSummary } from "../src/lib/paid-bookings-api";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Service type + status derivation ===");
{
  assert.equal(normalizeServiceType("Saloon Car").serviceLabel, "SALOON");
  assert.equal(normalizeServiceType("Estate").serviceLabel, "ESTATE");
  assert.equal(normalizeServiceType("Minibus 8").serviceLabel, "MINIBUS");
  assert.equal(deriveCalendarLegStatus({ journeyStatus: "idle" }), "upcoming");
  assert.equal(
    deriveCalendarLegStatus({ journeyStatus: "idle", sharingActive: true }),
    "live",
  );
  assert.equal(deriveCalendarLegStatus({ journeyStatus: "arrived_pickup" }), "arrived_pickup");
  assert.equal(deriveCalendarLegStatus({ journeyStatus: "completed" }), "completed");
  assert.equal(
    deriveCalendarLegStatus({ bookingStatus: "refunded", journeyStatus: "idle" }),
    "refunded",
  );
  console.log("OK  service + status mapping");
}

console.log("\n=== 2. Return booking expands to two legs ===");
{
  const booking: OwnerPaidBookingSummary = {
    paymentReference: "TTESTRETURN1",
    checkoutId: "chk",
    createdAt: "2026-08-01T10:00:00.000Z",
    status: "confirmed",
    customerName: "Alex",
    customerEmail: "a@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport",
    pickupLabel: "25 Wanstead Park",
    dropoffLabel: "Belfast International",
    tripDate: "2026-08-08",
    tripTime: "12:15",
    returnJourney: true,
    returnDate: "2026-08-19",
    returnTime: "02:35",
    amountPaid: "£80",
    vehicle: "Estate",
    flightNumber: "EI3551",
    returnFlightNumber: "EI3550",
  };
  const legs = calendarEntriesFromPaidBooking(booking, new Set());
  assert.equal(legs.length, 2);
  assert.equal(legs[0]?.tripDate, "2026-08-08");
  assert.equal(legs[0]?.tripTime, "12:15");
  assert.equal(legs[0]?.pickupLabel, "25 Wanstead Park");
  assert.equal(legs[0]?.dropoffLabel, "Belfast International");
  assert.equal(legs[0]?.journeyLeg, "outbound");
  assert.equal(legs[1]?.tripDate, "2026-08-19");
  assert.equal(legs[1]?.tripTime, "02:35");
  assert.equal(legs[1]?.pickupLabel, "Belfast International");
  assert.equal(legs[1]?.dropoffLabel, "25 Wanstead Park");
  assert.equal(legs[1]?.journeyLeg, "return");
  assert.equal(legs[0]?.serviceLabel, "ESTATE");
  console.log("OK  outbound + return are separate calendar entries");
}

console.log("\n=== 3. Tracking jobs are one entry per leg; vehicle enriched ===");
{
  const outbound = {
    token: "out-token-aaaaaaaaaaaaaaaa",
    customerName: "Sam",
    pickupLabel: "A",
    dropoffLabel: "BFS",
    tripDate: "2026-08-10",
    tripTime: "09:00",
    pickupAt: "2026-08-10T09:00",
    pickupDisplay: "10 Aug 09:00",
    trackingWindow: {
      open: true,
      opensAt: "",
      closesAt: "",
      pickupAt: "2026-08-10T09:00",
    },
    sharingActive: false,
    customerSharingActive: false,
    trackUrl: "https://example.com/track",
    ok: true as const,
    driver: null,
    paymentReference: "TJOB1",
    bookingStatus: "confirmed" as const,
    journeyLeg: "outbound" as const,
    journeyStatus: "idle" as const,
    flightNumber: "BA123",
    airportCode: "BFS",
    isAirportPickup: true,
  } satisfies DriverJob;

  const ret = {
    ...outbound,
    token: "ret-token-bbbbbbbbbbbbbbbb",
    tripDate: "2026-08-20",
    tripTime: "14:00",
    pickupAt: "2026-08-20T14:00",
    pickupLabel: "BFS",
    dropoffLabel: "A",
    journeyLeg: "return" as const,
    flightNumber: "BA124",
  } satisfies DriverJob;

  const vehicleMap = new Map([["TJOB1", "Minibus"]]);
  const a = calendarEntryFromDriverJob(outbound, vehicleMap);
  const b = calendarEntryFromDriverJob(ret, vehicleMap);
  assert.equal(a.serviceLabel, "MINIBUS");
  assert.equal(b.journeyLeg, "return");
  assert.notEqual(a.id, b.id);

  const merged = mergeCalendarEntries([outbound, ret], [
    {
      paymentReference: "TJOB1",
      checkoutId: "c",
      createdAt: "2026-08-01T00:00:00.000Z",
      status: "confirmed",
      customerName: "Sam",
      customerEmail: "s@example.com",
      mobileNumber: "077",
      tripLabel: "t",
      pickupLabel: "A",
      dropoffLabel: "BFS",
      tripDate: "2026-08-10",
      tripTime: "09:00",
      returnJourney: true,
      returnDate: "2026-08-20",
      returnTime: "14:00",
      amountPaid: "£100",
      vehicle: "Minibus",
    },
  ]);
  assert.equal(merged.length, 2, "should not duplicate legs when jobs exist");
  console.log("OK  jobs preferred; no duplicate synthetic legs");
}

console.log("\n=== 4. View ranges + dashboard wiring ===");
{
  assert.deepEqual(rangeForView("day", "2026-08-17"), {
    from: "2026-08-17",
    to: "2026-08-17",
  });
  const week = weekDates("2026-08-17"); // Monday start
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-08-17"); // 17 Aug 2026 is Monday

  const page = read("src/app/driver/DriverPageClient.tsx");
  const shortAt = page.indexOf("<OwnerShortNoticePanel");
  const calAt = page.indexOf("<OwnerBookingCalendar");
  const paidAt = page.indexOf("<OwnerPaidBookingsPanel");
  const profileAt = page.lastIndexOf("{profilePanel");
  assert.ok(shortAt > 0 && calAt > shortAt && paidAt > calAt);
  assert.ok(profileAt > paidAt);
  assert.match(page, /owner-calendar-selected-journey/);
  assert.match(page, /DriverJobCard/);

  const handlers = read("workers/addresses/src/tracking-handlers.ts");
  assert.match(handlers, /scope === "range"/);
  assert.match(handlers, /listTrackingJobsForDateRange/);

  const api = read("src/lib/tracking-api.ts");
  assert.match(api, /scope === "range"/);

  const calUi = read("src/components/OwnerBookingCalendar.tsx");
  assert.match(calUi, /Booking Calendar/);
  assert.match(calUi, /Today/);
  assert.match(calUi, /"day"|'day'/);
  assert.match(calUi, /"week"|'week'/);
  assert.match(calUi, /"month"|'month'/);
  assert.match(calUi, /defaultOwnerCalendarView\(\)/);
  assert.match(calUi, /defaultMobileCalendarView\(\)/);
  assert.doesNotMatch(calUi, /setView\(narrow \? defaultMobileCalendarView\(\) : "week"\)/);
  assert.doesNotMatch(calUi, /short-notice|Short-Notice/i);

  const calLib = read("src/lib/owner-booking-calendar.ts");
  assert.match(calLib, /export function defaultOwnerCalendarView[\s\S]*return "month"/);
  assert.match(calLib, /export function defaultMobileCalendarView[\s\S]*return "month"/);

  // Google Calendar sync must remain (write-only, not calendar SoT)
  const gcal = read("workers/addresses/src/google-calendar.ts");
  assert.match(gcal, /logBookingsToGoogleCalendar|createCalendarEvent/);
  console.log("OK  dashboard order + range API + Google Calendar preserved");
}

console.log("\nAll owner booking calendar checks passed.");

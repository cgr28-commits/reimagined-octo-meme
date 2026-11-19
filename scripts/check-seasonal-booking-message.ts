/**
 * Checks for the date-specific booking message (shared/seasonal-booking-message.ts).
 * Run: npx tsx scripts/check-seasonal-booking-message.ts
 */
import assert from "node:assert/strict";
import {
  bookingSeasonFor,
  easterSunday,
  formatTravelDate,
  northernIrelandBankHolidays,
  seasonalBookingMessage,
  SEASONAL_CLOSING,
} from "../shared/seasonal-booking-message";
import { demandIndicatorFor } from "../shared/demand-indicator";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function season(iso: string, expected: string) {
  assert.equal(bookingSeasonFor(iso), expected, `${iso} should be ${expected}`);
}

check("seasonal boundaries (Nov–Jan)", () => {
  season("2026-11-14", "general");
  season("2026-11-15", "winter");
  season("2026-11-30", "winter");
  season("2026-12-01", "december");
  season("2026-12-13", "december");
  season("2026-12-14", "christmas-run-up");
  season("2026-12-23", "christmas-run-up");
  season("2026-12-24", "christmas");
  season("2026-12-25", "christmas");
  season("2026-12-26", "christmas");
  season("2026-12-27", "between-christmas-new-year");
  season("2026-12-31", "between-christmas-new-year");
  season("2027-01-01", "new-year");
  season("2027-01-03", "new-year");
  season("2027-01-04", "general");
});

check("summer boundaries", () => {
  season("2027-05-28", "general");
  season("2027-06-01", "summer");
  season("2027-08-26", "summer");
  season("2027-09-01", "general");
});

check("Easter dates are calculated each year", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  assert.equal(easterSunday(2028), "2028-04-16");
  assert.equal(easterSunday(2038), "2038-04-25");
});

check("Easter holidays window and priority over bank holidays", () => {
  // Easter 2027 = 28 March → Sat 20 March to Sun 4 April.
  season("2027-03-19", "general");
  season("2027-03-20", "easter");
  season("2027-03-26", "easter"); // Good Friday: Easter beats bank holiday
  season("2027-03-29", "easter"); // Easter Monday
  season("2027-04-04", "easter");
  season("2027-04-05", "general");
});

check("Northern Ireland bank holidays 2026 and 2027 (incl. substitute days)", () => {
  assert.deepEqual(
    northernIrelandBankHolidays(2026).map((h) => h.date),
    ["2026-01-01", "2026-03-17", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-07-13", "2026-08-31", "2026-12-25", "2026-12-28"],
  );
  assert.deepEqual(
    northernIrelandBankHolidays(2027).map((h) => h.date),
    ["2027-01-01", "2027-03-17", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-07-12", "2027-08-30", "2027-12-27", "2027-12-28"],
  );
});

check("Christmas substitute never lands on Boxing Day (2022)", () => {
  const dec = northernIrelandBankHolidays(2022).filter((h) => h.date >= "2022-12-01").map((h) => h.date);
  assert.deepEqual(dec, ["2022-12-26", "2022-12-27"]);
});

check("St Patrick's Day on a Saturday moves to Monday (2029)", () => {
  assert.ok(northernIrelandBankHolidays(2029).some((h) => h.date === "2029-03-19"));
  season("2029-03-19", "bank-holiday");
  season("2029-03-17", "bank-holiday"); // the weekend joined to it
});

check("bank holiday weekends and priority over summer", () => {
  season("2027-04-30", "general"); // Friday before Early May
  season("2027-05-01", "bank-holiday"); // Saturday
  season("2027-05-03", "bank-holiday"); // Monday
  season("2027-05-04", "general");
  season("2027-07-10", "bank-holiday"); // Saturday before 12 July
  season("2027-07-12", "bank-holiday");
  season("2027-07-13", "summer");
  season("2027-08-30", "bank-holiday");
  season("2026-07-13", "bank-holiday"); // 12 July 2026 is a Sunday → Monday 13th
});

check("leap years", () => {
  assert.equal(formatTravelDate("2028-02-29"), "Tuesday 29 February 2028");
  assert.equal(formatTravelDate("2027-02-29"), null);
  assert.equal(seasonalBookingMessage("2027-02-29"), null);
  assert.equal(formatTravelDate("2000-02-29"), "Tuesday 29 February 2000");
  assert.equal(formatTravelDate("2100-02-29"), null);
});

check("weekday is right and no timezone shift (incl. clock-change days)", () => {
  assert.equal(formatTravelDate("2026-12-20"), "Sunday 20 December 2026");
  assert.equal(formatTravelDate("2027-03-28"), "Sunday 28 March 2027"); // clocks go forward
  assert.equal(formatTravelDate("2027-10-31"), "Sunday 31 October 2027"); // clocks go back
  assert.equal(formatTravelDate("2027-01-01"), "Friday 1 January 2027");
  assert.equal(formatTravelDate(""), null);
  assert.equal(formatTravelDate("21/05/2027"), null);
});

check("message wording", () => {
  const xmas = seasonalBookingMessage("2026-12-20");
  assert.ok(xmas);
  assert.equal(xmas.heading, "Travelling on Sunday 20 December 2026?");
  assert.equal(xmas.icon, "🎄");
  assert.match(xmas.body, /airport, cruise or event transfer/);
  assert.equal(xmas.closing, SEASONAL_CLOSING);
  // Bodies that already say "peace of mind" don't repeat it.
  assert.equal(seasonalBookingMessage("2026-12-05")?.closing, null);
  assert.equal(seasonalBookingMessage("2027-01-02")?.closing, null);
  // Bookings needing approval never say "secure your journey today".
  assert.equal(seasonalBookingMessage("2027-02-10", { needsApproval: true })?.closing, null);
  assert.equal(seasonalBookingMessage("2027-02-10")?.season, "general");
});

check("every message says airport, cruise or event and makes no false claims", () => {
  const banned = /(only \d|almost (fully )?booked|last (few|seats|cars)|price(s)? (will )?(rise|go up|increase)|hurry|ends in|guarantee)/i;
  for (const iso of ["2026-11-20", "2026-12-05", "2026-12-20", "2026-12-25", "2026-12-29", "2027-01-02", "2027-03-25", "2027-05-03", "2027-07-20", "2027-10-05"]) {
    const message = seasonalBookingMessage(iso);
    assert.ok(message, iso);
    assert.match(message.body, /airport, cruise or event transfer/, iso);
    assert.doesNotMatch(`${message.heading} ${message.body} ${message.closing ?? ""}`, banned, iso);
  }
});

check("expected demand levels", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const level = (tripDate: string, extra: Record<string, string> = {}) => demandIndicatorFor({ tripDate, ...extra }, now)?.level;
  assert.equal(level("2026-12-20"), "very-high");
  assert.equal(level("2026-12-25"), "very-high");
  assert.equal(level("2027-01-02"), "very-high");
  assert.equal(level("2026-12-01"), "high"); // early December (owner, 16 Nov 2026)
  assert.equal(level("2026-12-10"), "high");
  assert.equal(level("2026-12-13"), "high");
  assert.equal(level("2026-12-14"), "very-high"); // Christmas run-up
  assert.equal(level("2026-11-30"), "normal"); // Monday
  assert.equal(level("2027-03-26"), "high"); // Easter
  assert.equal(level("2027-05-03"), "high"); // bank holiday
  assert.equal(level("2027-07-20"), "high"); // summer
  assert.equal(level("2026-11-17"), "soon"); // 2 days away
  assert.equal(level("2026-11-18"), "soon"); // 3 days away
  assert.equal(level("2026-11-19"), "normal");
  assert.equal(level("2027-02-10"), "normal");
  // Big event, Greater Belfast drop-off: very high even on an ordinary date.
  assert.equal(level("2027-05-22", { pickup: "Dublin", dropoff: "City Hall, Belfast BT1 5GS" }), "very-high");
  // Pickups in the city count too (owner, 15 Nov 2026); airports and other towns don't.
  assert.equal(level("2027-05-22", { pickup: "City Hall, Belfast BT1 5GS", dropoff: "Derry BT48" }), "very-high");
  assert.equal(level("2027-05-22", { pickup: "Belfast International Airport", dropoff: "Derry BT48" }), "normal");
  assert.equal(level("2027-05-22", { pickup: "Newry BT34", dropoff: "Derry BT48" }), "normal");
  // Events added 15 Nov 2026.
  assert.equal(level("2027-03-17", { pickup: "Newry", dropoff: "Grafton St, Dublin 2, D02 X285" }), "very-high");
  assert.equal(level("2027-07-25", { pickup: "Newry", dropoff: "Croke Park, Dublin 3" }), "very-high");
  assert.equal(level("2027-10-24", { pickup: "Newry", dropoff: "Dublin, Ireland" }), "very-high");
  assert.equal(level("2027-05-02", { pickup: "Lisburn", dropoff: "Ormeau Rd, Belfast BT7" }), "very-high");
  assert.equal(level("2027-04-23", { pickup: "Lisburn", dropoff: "Malone Rd, Belfast BT9" }), "very-high");
  // Bar sizes, labels, and no "booked" wording outside December.
  const xmas = demandIndicatorFor({ tripDate: "2026-12-20" }, now)!;
  assert.equal(xmas.filledSegments, 4);
  assert.equal(xmas.label, "80% booked");
  // December booked levels (owner, 16 Nov 2026): 60% on 1–13 Dec, 80% from 14 Dec.
  for (const [d, pct, segs] of [["2026-12-01", 60, 3], ["2026-12-13", 60, 3], ["2026-12-14", 80, 4], ["2026-12-31", 80, 4], ["2027-12-05", 60, 3]] as const) {
    const ind = demandIndicatorFor({ tripDate: d }, now)!;
    assert.equal(ind.bookedPercent, pct, d);
    assert.equal(ind.label, `${pct}% booked`, d);
    assert.equal(ind.filledSegments, segs, d);
  }
  assert.equal(demandIndicatorFor({ tripDate: "2026-11-30" }, now)!.bookedPercent, null);
  // New Year's Day 70%; rest of November 2026 Fri/Sat/Sun 70%; weekdays unchanged.
  for (const d of ["2027-01-01", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-27", "2026-11-29"]) {
    assert.equal(demandIndicatorFor({ tripDate: d }, now)!.label, "70% booked", d);
  }
  assert.equal(demandIndicatorFor({ tripDate: "2026-12-31" }, now)!.label, "80% booked");
  for (const d of ["2026-11-19", "2026-11-24", "2027-01-02", "2027-11-26"]) {
    assert.equal(demandIndicatorFor({ tripDate: d }, now)!.bookedPercent, null, d);
  }
  assert.equal(demandIndicatorFor({ tripDate: "2027-05-03" }, now)!.filledSegments, 3);
  assert.equal(demandIndicatorFor({ tripDate: "2027-02-10" }, now)!.filledSegments, 0);
  for (const d of ["2027-01-02", "2027-05-03", "2026-11-17", "2027-02-10", "2027-05-22"]) {
    const ind = demandIndicatorFor({ tripDate: d, dropoff: "Belfast BT1" }, now)!;
    assert.doesNotMatch(`${ind.label ?? ""} ${ind.body}`, /\bbooked\b|%|only \d|last (few|seats|cars)/i, d);
  }
  assert.match(demandIndicatorFor({ tripDate: "2026-11-17", needsApproval: true }, now)!.body, /confirm/);
  assert.equal(demandIndicatorFor({ tripDate: "" }, now), null);
});

check("published venue demand carries through to the quote", () => {
  const trip = { tripDate: "2027-09-18", pickup: "Croke Park, Dublin", dropoff: "Belfast International Airport" };
  const now = new Date("2026-11-19T12:00:00Z");
  const demand = demandIndicatorFor({ ...trip, highDemandVenue: "Croke Park" }, now);
  assert.equal(demand?.level, "high");
  assert.equal(demand?.label, "High");
  assert.equal(demand?.filledSegments, 3);
  assert.match(demand?.body ?? "", /High demand at Croke Park/);
  assert.equal(demand?.bookedPercent, null);
  assert.equal(demandIndicatorFor(trip, now)?.level, "normal");
  assert.equal(demandIndicatorFor({ ...trip, tripDate: "2026-12-20", highDemandVenue: "Croke Park" }, now)?.label, "80% booked");
});

console.log(`\n${passed} checks passed`);

/** Phone assistant: existing bookings — matching, privacy, spoken summary, routing. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  matchVoiceBooking,
  spokenDate,
  spokenTime,
  voiceBookingReference,
  voiceBookingSay,
  voiceBookingSmsText,
  voiceMobile,
  voiceMobileOnlySay,
} from "../shared/voice-booking";

const now = new Date("2026-10-31T09:00:00Z");

assert.equal(voiceBookingReference("MAT-1234"), "MAT-1234");
assert.equal(voiceBookingReference("mat 1234"), "MAT-1234");
assert.equal(voiceBookingReference("1 2 3 4"), "MAT-1234");
assert.equal(voiceBookingReference("12345"), null);
assert.equal(voiceBookingReference(""), null);
assert.equal(voiceMobile("07700 900123"), "07700900123");
assert.equal(voiceMobile("+44 7700 900123"), "+447700900123");
assert.equal(voiceMobile("028 9602 2952"), null);
assert.equal(spokenTime("08:15"), "8:15am");
assert.equal(spokenTime("17:00"), "5pm");
assert.equal(spokenTime("00:30"), "12:30am");
assert.equal(spokenDate("2026-11-14"), "Saturday 14 November");
console.log("OK  references, mobiles, dates and times as callers say them");

const booking = {
  paymentReference: "TXN1",
  customerReference: "MAT-1234",
  customerName: "Sarah Smith",
  mobileNumber: "+447700900123",
  pickupLabel: "Belfast International Airport, Aldergrove, Crumlin BT29 4AB",
  dropoffLabel: "12 Main Street, Bangor BT20 5AA, UK",
  returnJourney: false,
  tripDate: "2026-11-14",
  tripTime: "08:15",
  passengers: 2,
  status: "confirmed",
  amount: 87,
  amountPaidLabel: "£87.00",
} as unknown as PaidBookingRecord;

const verified = matchVoiceBooking({ reference: "MAT-1234", mobile: "07700900123", byReference: booking, candidates: [], now });
assert.equal(verified.kind, "verified");
const wrongPhone = matchVoiceBooking({ reference: "MAT-1234", mobile: "07700111222", byReference: booking, candidates: [], now });
assert.equal(wrongPhone.kind, "not_found", "A reference on someone else's mobile looks like no booking");
const byMobile = matchVoiceBooking({ reference: null, mobile: "07700900123", byReference: null, candidates: [booking], now });
assert.equal(byMobile.kind, "mobile_only");
const nobody = matchVoiceBooking({ reference: null, mobile: "07700111222", byReference: null, candidates: [booking], now });
assert.equal(nobody.kind, "not_found");
console.log("OK  details only when reference and mobile match; mobile alone never reads details out");

const say = voiceBookingSay(booking, null, now);
assert.match(say, /MAT-1234 for Sarah/);
assert.match(say, /Saturday 14 November at 8:15am, from Belfast International Airport, Aldergrove to 12 Main Street, Bangor BT20 5AA/);
assert.match(say, /2 passengers/);
assert.match(say, /Manage Booking link/);
assert.doesNotMatch(say, /£|pounds|surcharge|paid/i, "No money talk on the phone");
assert.match(voiceBookingSay(booking, { name: "John" }, now), /Your driver will be John/);
assert.match(voiceBookingSay(booking, { name: "John", onTheWay: true }, now), /John, your driver, is on the way/);
assert.match(voiceBookingSay({ ...booking, status: "cancelled" } as PaidBookingRecord, null, now), /has been cancelled/);
assert.match(voiceBookingSay({ ...booking, tripDate: "2026-10-01" } as PaidBookingRecord, null, now), /already taken place/);
const ret = voiceBookingSay(
  { ...booking, returnJourney: true, returnDate: "2026-11-21", returnTime: "18:40", cancelledLegs: ["outbound"] } as PaidBookingRecord,
  null,
  now,
);
assert.match(ret, /outward journey was cancelled/);
assert.match(ret, /return pickup is on Saturday 21 November at 6:40pm, from 12 Main Street/);
assert.match(voiceMobileOnlySay(1), /an upcoming booking/);
assert.match(voiceMobileOnlySay(2), /2 upcoming bookings/);
console.log("OK  spoken summary: journey, passengers, driver, cancelled and past bookings; no prices");

const sms = voiceBookingSmsText(booking, "https://www.myairporttaxini.co.uk/manage-booking/?token=abc");
assert.match(sms, /^My Airport Taxi NI: your booking MAT-1234 – pickup Saturday 14 November at 8:15am/);
assert.match(sms, /manage-booking\/\?token=abc$/);
console.log("OK  SMS backup with the Manage Booking link");

const worker = readFileSync(new URL("../workers/addresses/src/index.ts", import.meta.url), "utf8");
assert.match(worker, /"\/voice\/booking"/);
assert.match(worker, /"\/voice\/booking-link"/);
const handler = readFileSync(new URL("../workers/addresses/src/voice-booking.ts", import.meta.url), "utf8");
assert.match(handler, /mobile: booking\.mobileNumber/, "Link goes to the number on the booking");
assert.match(handler, /consumeQuickQuoteCreateQuota\(store, "voice:booking"/, "Lookups are rate limited");
assert.doesNotMatch(handler, /cancelPaid|markPaidBookingRefunded|updatePaidBookingFields/, "Olivia never changes bookings");
console.log("OK  routes wired; rate limited; link only to the booking's own mobile; read-only");

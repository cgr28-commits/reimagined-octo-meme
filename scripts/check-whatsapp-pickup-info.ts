/**
 * WhatsApp "where do I get picked up?" — booking lookup and reply content.
 * Run: npx tsx scripts/check-whatsapp-pickup-info.ts
 */
import assert from "node:assert/strict";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  WHATSAPP_TEAM_NUMBER_DEFAULT,
  buildWhatsAppBookingDetails,
  buildWhatsAppPickupInfo,
  extractCustomerBookingReference,
  isWhatsAppBookingCheckQuestion,
  isWhatsAppPickupLocationQuestion,
  resolveWhatsAppTeamNumber,
  sameCustomerPhone,
  upcomingAirportCollections,
  upcomingCustomerBookings,
} from "../shared/whatsapp-pickup-info";
import { BELFAST_INTERNATIONAL_MAP_IMAGE_URL } from "../shared/belfast-international-airport-map";

for (const q of [
  "Where do I get picked up at the airport?",
  "where will you pick me up",
  "Where do I meet the driver",
  "where should I wait when I land",
  "What's the pickup point?",
  "meeting point at belfast city?",
]) {
  assert.ok(isWhatsAppPickupLocationQuestion(q), q);
}
for (const q of [
  "BT1 1AA to Belfast International Airport",
  "Which day can you pick me up",
  "pick up at 5am friday",
  "Can I get a quote from Dublin airport",
]) {
  assert.ok(!isWhatsAppPickupLocationQuestion(q), q);
}

assert.equal(extractCustomerBookingReference("my ref is mat 1234"), "MAT-1234");
assert.equal(extractCustomerBookingReference("MAT-0042 thanks"), "MAT-0042");
assert.equal(extractCustomerBookingReference("3 passengers"), null);

assert.ok(sameCustomerPhone("07549 815538", "447549815538"));
assert.ok(sameCustomerPhone("+44 7549 815538", "447549815538"));
assert.ok(!sameCustomerPhone("07549 815539", "447549815538"));
assert.ok(!sameCustomerPhone("", "447549815538"));

const now = new Date("2026-10-26T12:00:00Z");
const base = {
  customerName: "Sam",
  mobileNumber: "07700 900123",
  status: "confirmed",
  customerReference: "MAT-1234",
} as const;

// To the airport, collected on the return from BFS with Express.
const bfsReturn = {
  ...base,
  pickupLabel: "BT9 5AB, Belfast",
  dropoffLabel: "Belfast International Airport",
  isFromAirport: false,
  airportCode: "BFS",
  returnJourney: true,
  tripDate: "2026-10-28",
  tripTime: "05:00",
  returnDate: "2026-11-02",
  returnTime: "18:30",
  returnAirportAccessOption: "express",
} as unknown as PaidBookingRecord;

const legs = upcomingAirportCollections([bfsReturn], now);
assert.equal(legs.length, 1, "only the airport collection leg");
assert.equal(legs[0]!.journeyLeg, "return");
const info = buildWhatsAppPickupInfo(legs[0]!);
assert.ok(info, "directions built");
assert.match(info!.text, /MAT-1234/);
assert.match(info!.text, /Belfast International Airport/);
assert.match(info!.text, /Drop-Off Zone/);
assert.match(info!.text, /02-11-2026/);
assert.equal(info!.mapImageUrl, BELFAST_INTERNATIONAL_MAP_IMAGE_URL);
assert.equal(info!.pin, null, "no pin until coordinates are configured");

// Free Long Stay collection: written directions only, never the Express map.
const freeLeg = upcomingAirportCollections(
  [{ ...bfsReturn, returnAirportAccessOption: "free" } as PaidBookingRecord],
  now,
)[0]!;
const freeInfo = buildWhatsAppPickupInfo(freeLeg);
assert.ok(freeInfo);
assert.equal(freeInfo!.mapImageUrl, null);

// Cancelled and past collections are skipped.
assert.equal(upcomingAirportCollections([{ ...bfsReturn, status: "cancelled" } as PaidBookingRecord], now).length, 0);
assert.equal(
  upcomingAirportCollections([bfsReturn], new Date("2026-11-03T12:00:00Z")).length,
  0,
);

// "Can you check my booking?" goes to the booking look-up, not a quote.
for (const q of [
  "Can you check a booking",
  "can you check my booking please",
  "I want to change my booking",
  "Is my taxi confirmed?",
  "booking details",
  "what time is my booking",
]) {
  assert.ok(isWhatsAppBookingCheckQuestion(q), q);
}
for (const q of ["I'd like to make a booking", "BT1 1AA to Belfast International", "Do you have child seats?"]) {
  assert.ok(!isWhatsAppBookingCheckQuestion(q), q);
}

const upcoming = upcomingCustomerBookings(
  [
    { ...bfsReturn, customerReference: "MAT-2000", tripDate: "2026-11-10", returnJourney: false } as PaidBookingRecord,
    bfsReturn,
    { ...bfsReturn, customerReference: "MAT-0001", status: "cancelled" } as PaidBookingRecord,
    { ...bfsReturn, customerReference: "MAT-0002", tripDate: "2026-10-01", returnJourney: false } as PaidBookingRecord,
  ],
  now,
);
assert.deepEqual(
  upcoming.map((b) => b.customerReference),
  ["MAT-1234", "MAT-2000"],
  "soonest first; cancelled and past skipped",
);
const details = buildWhatsAppBookingDetails(
  { ...bfsReturn, passengers: 2 } as PaidBookingRecord,
  { manageUrl: "https://www.myairporttaxini.co.uk/manage-booking/?token=abc" },
);
assert.match(details, /Your booking MAT-1234/);
assert.match(details, /\*Outbound:\*/);
assert.match(details, /\*Return:\* 02-11-2026/);
assert.match(details, /Passengers: 2/);
assert.match(details, /manage-booking\/\?token=abc/);
assert.match(details, /Just reply here and our team will help/, "the team replies in the same chat");
assert.doesNotMatch(details, /wa\.me/);

// A misconfigured team number never produces a dead wa.me link.
assert.equal(resolveWhatsAppTeamNumber("2360"), WHATSAPP_TEAM_NUMBER_DEFAULT);
assert.equal(resolveWhatsAppTeamNumber(""), WHATSAPP_TEAM_NUMBER_DEFAULT);
assert.equal(resolveWhatsAppTeamNumber("+44 7549 815538"), "447549815538");
assert.equal(WHATSAPP_TEAM_NUMBER_DEFAULT, "447549815538");

console.log("All WhatsApp pickup info checks passed.");

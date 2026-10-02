/**
 * Journey-day airport collection reminder — offline checks.
 * Run: npx tsx scripts/check-airport-pickup-reminder.ts
 *
 * Does not send email, WhatsApp, SMS, or create a booking.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  airportPickupReminderUsesCompanyVoice,
  buildAirportPickupReminderDirections,
  buildAirportPickupReminderMessage,
  evaluateAirportPickupReminder,
  type AirportPickupReminderInput,
} from "../shared/airport-pickup-reminder";
import { BUSINESS_PHONE_DISPLAY } from "../shared/business-email";

const root = process.cwd();
const NOW = new Date("2026-10-02T13:00:00.000Z");
const DRIVER_MOBILE = "07700900999";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function dueCollection(
  overrides: AirportPickupReminderInput = {},
): AirportPickupReminderInput {
  return {
    customerName: "Sarah Johnson",
    customerEmail: "sarah@example.com",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "12 High Street, Belfast",
    tripDate: "2026-10-02",
    tripTime: "16:30",
    journeyLeg: "outbound",
    isFromAirport: true,
    airportCode: "BFS",
    outboundAirportAccessOption: "express",
    bookingStatus: "confirmed",
    operationalStatus: "confirmed",
    assignedDriverMobile: DRIVER_MOBILE,
    ...overrides,
  };
}

function messageOf(input: AirportPickupReminderInput): string {
  const decision = evaluateAirportPickupReminder(input, NOW);
  assert.equal(decision.eligible, true, decision.eligible ? "" : decision.reason);
  assert.ok(decision.eligible);
  return decision.message;
}

function assertCompanyReminder(message: string) {
  assert.match(message, /028 9602 2952/);
  assert.equal(message.includes(BUSINESS_PHONE_DISPLAY), true);
  assert.equal(message.includes(DRIVER_MOBILE), false);
  assert.equal(message.includes("07700 900999"), false);
  assert.equal(airportPickupReminderUsesCompanyVoice(message), true);
  assert.doesNotMatch(message, /\bI['’]m\b|\bcall me\b|\bmy car\b|\bundefined\b|\bnull\b/i);
  assert.equal(message.includes("https://checkout.sumup.com"), false);
}

console.log("=== Belfast International Express ===");
{
  const message = messageOf(dueCollection());
  assert.match(message, /Hi Sarah,/);
  assert.match(message, /Belfast International Airport/);
  assert.match(message, /16:30/);
  assert.match(message, /Express Pick-Up/);
  assert.doesNotMatch(message, /Long Stay/i);
  assert.doesNotMatch(message, /10 minutes/i);
  assert.match(message, /limited waiting time/i);
  assertCompanyReminder(message);
  console.log("OK  Express directions, no Long Stay, no unverified 10-minute claim");
}

console.log("=== Belfast International Free ===");
{
  const message = messageOf(
    dueCollection({ outboundAirportAccessOption: "free", flightNumber: "EI 123" }),
  );
  assert.match(message, /Long Stay Car Park Free Pick-Up Location/);
  assert.match(message, /maximum stay of 10 minutes/i);
  assert.match(message, /Flight: EI123/);
  assert.doesNotMatch(message, /Express/i);
  assertCompanyReminder(message);
  console.log("OK  Free Long Stay directions, no Express");
}

console.log("=== Belfast City Express and Free ===");
{
  const express = messageOf(
    dueCollection({
      pickupLabel: "George Best Belfast City Airport",
      airportCode: "BHD",
      outboundAirportAccessOption: "express",
    }),
  );
  assert.match(express, /George Best Belfast City Airport/);
  assert.match(express, /Express Pick-Up/);
  assert.doesNotMatch(express, /Long Stay/i);
  assertCompanyReminder(express);

  const free = messageOf(
    dueCollection({
      pickupLabel: "George Best Belfast City Airport",
      airportCode: "BHD",
      outboundAirportAccessOption: "free",
    }),
  );
  assert.match(free, /Long Stay Car Park Free Pick-Up Location/);
  assert.doesNotMatch(free, /Express/i);
  assertCompanyReminder(free);
  console.log("OK  Belfast City keeps Express and Free apart");
}

console.log("=== Dublin terminals ===");
{
  const terminal1 = messageOf(
    dueCollection({
      pickupLabel: "Dublin Airport",
      airportCode: "DUB",
      outboundAirportAccessOption: "free",
      dublinArrivalTerminal: "T1",
      flightNumber: "EI164",
    }),
  );
  assert.match(terminal1, /paid Pick-Up Location at Terminal 1/);
  assert.match(terminal1, /Dublin Airport/);
  assert.match(terminal1, /Flight: EI164/);
  assert.doesNotMatch(terminal1, /Long Stay|Free Pick-Up|Free Pickup/i);
  assertCompanyReminder(terminal1);

  const terminal2 = messageOf(
    dueCollection({
      pickupLabel: "Dublin Airport",
      airportCode: "DUB",
      dublinArrivalTerminal: "T2",
      outboundAirportAccessOption: null,
    }),
  );
  assert.match(terminal2, /paid Pick-Up Location at Terminal 2/);
  assert.doesNotMatch(terminal2, /Terminal 1/);
  assert.doesNotMatch(terminal2, /Long Stay|Free Pick-Up/i);
  assertCompanyReminder(terminal2);

  const unknown = buildAirportPickupReminderMessage(
    dueCollection({
      pickupLabel: "Dublin Airport",
      airportCode: "DUB",
      dublinArrivalTerminal: null,
    }),
  );
  assert.ok(unknown);
  assert.match(unknown, /agreed paid Pick-Up Location at Dublin Airport/);
  assert.match(unknown, /terminal still needs confirmation/i);
  assert.doesNotMatch(unknown, /Terminal 1|Terminal 2/);
  assert.doesNotMatch(unknown, /Long Stay|Free Pick-Up/i);
  console.log("OK  Dublin uses the stored terminal and never the free pickup");
}

console.log("=== Eligibility ===");
{
  const toAirport = evaluateAirportPickupReminder(
    dueCollection({
      isFromAirport: false,
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Belfast International Airport",
      outboundAirportAccessOption: "express",
    }),
    NOW,
  );
  assert.equal(toAirport.eligible, false);
  assert.equal(toAirport.reason, "not_from_airport");

  const cancelled = evaluateAirportPickupReminder(
    dueCollection({ bookingStatus: "cancelled" }),
    NOW,
  );
  assert.equal(cancelled.eligible, false);
  assert.equal(cancelled.reason, "cancelled");

  const refunded = evaluateAirportPickupReminder(
    dueCollection({ bookingStatus: "refunded", operationalStatus: "cancelled" }),
    NOW,
  );
  assert.equal(refunded.reason, "cancelled");

  const missingOption = evaluateAirportPickupReminder(
    dueCollection({
      outboundAirportAccessOption: null,
      airportAccessOption: null,
      expressDropOffSelected: null,
    }),
    NOW,
  );
  assert.equal(missingOption.eligible, false);
  assert.equal(missingOption.reason, "unresolved_pickup");
  assert.equal(
    buildAirportPickupReminderMessage(
      dueCollection({
        outboundAirportAccessOption: null,
        airportAccessOption: null,
        expressDropOffSelected: null,
      }),
    ),
    null,
  );

  const tooEarly = evaluateAirportPickupReminder(dueCollection({ tripTime: "19:30" }), NOW);
  assert.equal(tooEarly.reason, "too_early");

  const passed = evaluateAirportPickupReminder(dueCollection({ tripTime: "13:00" }), NOW);
  assert.equal(passed.reason, "pickup_passed");

  const tomorrow = evaluateAirportPickupReminder(
    dueCollection({ tripDate: "2026-10-03", tripTime: "01:00" }),
    NOW,
  );
  assert.equal(tomorrow.reason, "not_today");

  const nightBefore = evaluateAirportPickupReminder(dueCollection({ tripTime: "01:00" }), new Date("2026-10-01T21:00:00.000Z"));
  assert.equal(nightBefore.reason, "not_today");

  const earlySameDay = evaluateAirportPickupReminder(
    dueCollection({ tripTime: "01:00" }),
    new Date("2026-10-01T23:30:00.000Z"),
  );
  assert.equal(earlySameDay.eligible, true);

  const sent = evaluateAirportPickupReminder(
    dueCollection({ reminderSentAt: "2026-10-02T13:30:00.000Z" }),
    NOW,
  );
  assert.equal(sent.reason, "already_sent");
  const again = evaluateAirportPickupReminder(
    dueCollection({ reminderSentAt: "2026-10-02T13:30:00.000Z" }),
    new Date("2026-10-02T13:40:00.000Z"),
  );
  assert.equal(again.reason, "already_sent");
  console.log("OK  to-airport, cancelled, unresolved, timing, and duplicate skips");
}

console.log("=== Return leg is independent ===");
{
  const outboundToAirport = evaluateAirportPickupReminder(
    dueCollection({
      isFromAirport: false,
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Belfast International Airport",
      journeyLeg: "outbound",
      outboundAirportAccessOption: "express",
      returnAirportAccessOption: "free",
    }),
    NOW,
  );
  assert.equal(outboundToAirport.reason, "not_from_airport");

  const returnCollection = messageOf(
    dueCollection({
      journeyLeg: "return",
      isFromAirport: true,
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      tripDate: "2026-10-02",
      tripTime: "16:30",
      outboundAirportAccessOption: "express",
      returnAirportAccessOption: "free",
      flightNumber: "EZY123",
    }),
  );
  assert.match(returnCollection, /Long Stay Car Park Free Pick-Up Location/);
  assert.doesNotMatch(returnCollection, /Express/i);
  assert.match(returnCollection, /Flight: EZY123/);
  assertCompanyReminder(returnCollection);

  const cancelledReturn = evaluateAirportPickupReminder(
    dueCollection({
      journeyLeg: "return",
      isFromAirport: true,
      pickupLabel: "Belfast International Airport",
      returnAirportAccessOption: "express",
      cancelledLegs: ["return"],
    }),
    NOW,
  );
  assert.equal(cancelledReturn.reason, "cancelled");
  console.log("OK  return collection uses the return option only");
}

console.log("=== Missing first name ===");
{
  for (const customerName of ["", "   ", null, undefined, "undefined", "null"]) {
    const message = messageOf(dueCollection({ customerName }));
    assert.match(message, /^Hi,/);
    assert.doesNotMatch(message, /Hi undefined|Hi null|Hi there/i);
    assertCompanyReminder(message);
  }
  const spaced = messageOf(dueCollection({ customerName: "  Sarah   Johnson  " }));
  assert.match(spaced, /^Hi Sarah,/);
  console.log("OK  greeting falls back without an empty name");
}

console.log("=== Wiring ===");
{
  const cron = read("workers/addresses/src/index.ts");
  const handler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  assert.match(cron, /processDueAirportPickupReminders\(env\)/);
  assert.match(handler, /trySendResendOnlyCustomerEmail/);
  assert.match(handler, /airportPickupReminderSentAt/);
  assert.doesNotMatch(handler, /twilio|sms:|wa\.me/i);
  assert.doesNotMatch(read("shared/airport-pickup-reminder.ts"), /twilio/i);
  const directions = buildAirportPickupReminderDirections(dueCollection({ outboundAirportAccessOption: "free" }));
  assert.match(directions ?? "", /Long Stay Car Park Free Pick-Up Location/);
  console.log("OK  hourly email cron, no SMS provider, existing pickup copy");
}

console.log("\nAll airport pickup reminder checks passed.");

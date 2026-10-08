/**
 * Two-hour journey reminder — offline checks.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/check-journey-reminder.ts
 *
 * Does not send email, WhatsApp, or create a booking.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_TEL, BUSINESS_WHATSAPP_DIGITS } from "../shared/business-email";
import { buildOnTheWayCompanyVoiceMessage } from "../shared/company-voice-journey";
import {
  JOURNEY_REMINDER_LANDING_BODY,
  JOURNEY_REMINDER_LANDING_HEADING,
  JOURNEY_REMINDER_LEAD_MS,
  beginJourneyReminderClaim,
  buildJourneyReminderAirportInstructions,
  clearJourneyReminderDelivery,
  evaluateJourneyReminder,
  journeyReminderSendAt,
  resolveJourneyReminderAirportCopy,
  type JourneyReminderInput,
} from "../shared/journey-reminder";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import {
  buildDriverJourneyNoticeEmail,
  driverDispatchDecision,
  driverJourneyNoticeRecipient,
  noteAssignmentChange,
} from "../shared/driver-notification-safety";
import type { TrackingJobRecord } from "../shared/tracking";

const root = process.cwd();
const DRIVER_MOBILE = "07700900111";
const DRIVER_DISPLAY = "07700 900111";
const DRIVER_DIGITS = "447700900111";
const SUMMER_NOW = new Date("2026-07-15T13:30:00.000Z");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function base(overrides: JourneyReminderInput = {}): JourneyReminderInput {
  return {
    customerName: "Sarah Johnson",
    customerEmail: "sarah@example.com",
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "22 Main Street, Lisburn",
    tripDate: "2026-07-15",
    tripTime: "16:30",
    journeyLeg: "outbound",
    isFromAirport: false,
    bookingStatus: "confirmed",
    operationalStatus: "confirmed",
    assignmentStatus: "unassigned",
    ...overrides,
  };
}

function due(input: JourneyReminderInput, now = SUMMER_NOW) {
  const decision = evaluateJourneyReminder(input, now);
  assert.equal(decision.eligible, true, decision.eligible ? "" : decision.reason);
  assert.ok(decision.eligible);
  return decision;
}

console.log("1. Owner-operated booking");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Owner / Primary Driver", assignedDriverMobile: "07700900999" }));
  assert.equal(decision.contact.kind, "company");
  assert.match(decision.html, />Message Us on WhatsApp</);
  assert.match(decision.html, />Call Us</);
  assert.match(decision.html, new RegExp(`tel:${BUSINESS_PHONE_TEL.replace("+", "\\+")}`));
  assert.match(decision.message, new RegExp(BUSINESS_PHONE_DISPLAY));
  assert.equal(decision.message.includes("07700900999"), false);
  assert.equal(decision.html.includes("07700 900999"), false);
  assert.equal(new URL(decision.whatsAppHref).pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  assert.match(decision.message, /My Airport Taxi NI/);
  console.log("OK  company WhatsApp and business phone, no owner mobile");
}

console.log("2. Accepted assigned driver");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya Shah", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "driver");
  assert.match(decision.message, /Your Driver/);
  assert.match(decision.message, /Driver: Priya/);
  assert.match(decision.message, new RegExp(`Mobile: ${DRIVER_DISPLAY}`));
  assert.doesNotMatch(decision.message, /Shah/);
  console.log("OK  first name and mobile");
}

console.log("3. Assigned driver WhatsApp");
{
  const decision = due(
    base({
      assignmentStatus: "accepted",
      assignedDriverName: "Priya Shah",
      assignedDriverMobile: DRIVER_MOBILE,
      flightNumber: "EI 164",
    }),
  );
  const parsed = new URL(decision.whatsAppHref);
  assert.equal(parsed.hostname, "wa.me");
  assert.equal(parsed.pathname, `/${DRIVER_DIGITS}`);
  const text = parsed.searchParams.get("text") ?? "";
  assert.match(text, /^Hi Priya, I’m contacting you about my transfer with My Airport Taxi NI\./);
  assert.match(text, /Date: Wednesday, 15 July 2026/);
  assert.match(text, /Pickup time: 4:30 PM/);
  assert.match(text, /Pickup: 12 High Street, Belfast/);
  assert.match(text, /Destination: 22 Main Street, Lisburn/);
  assert.match(text, /Flight: EI 164/);
  assert.match(text, /Could you please help me with my journey\?/);
  assert.doesNotMatch(text, /£|paid|card/i);
  assert.equal(text.includes("sarah@example.com"), false);
  console.log("OK  direct wa.me link and prefilled journey");
}

console.log("4. Assigned driver click-to-call");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  assert.match(decision.html, new RegExp(`href="tel:\\+${DRIVER_DIGITS}"`));
  assert.match(decision.html, />Call Your Driver</);
  console.log("OK  tel link");
}

console.log("5. Unassigned booking");
{
  const decision = due(base({ assignmentStatus: "unassigned", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "company");
  assert.equal(decision.message.includes("Priya"), false);
  assert.equal(decision.message.includes(DRIVER_DISPLAY), false);
  assert.equal(new URL(decision.whatsAppHref).pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  const text = new URL(decision.whatsAppHref).searchParams.get("text") ?? "";
  assert.match(text, /^Hi My Airport Taxi NI, I’m contacting you about my transfer\./);
  console.log("OK  company fallback");
}

console.log("6. Missing or invalid driver number");
{
  for (const mobile of ["", "abc", "123", "028 9602 2952"]) {
    const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: mobile }));
    assert.equal(decision.contact.kind, "company", mobile);
    assert.equal(decision.message.includes("Priya"), false);
    assert.equal(decision.html.includes("href=\"tel:+44abc\""), false);
    assert.equal(decision.html.includes("wa.me/?"), false);
  }
  console.log("OK  invalid numbers use the company line");
}

console.log("7. Driver assignment not accepted");
{
  const decision = due(base({ assignmentStatus: "pending", assignedDriverName: "Priya Shah", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "company");
  assert.equal(decision.message.includes("Priya"), false);
  assert.equal(decision.html.includes(DRIVER_DIGITS), false);
  console.log("OK  pending assignment stays private");
}

console.log("8. Belfast International airport collection");
{
  const decision = due(
    base({
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BFS",
      outboundAirportAccessOption: "express",
      flightNumber: "EZY123",
    }),
  );
  assert.match(decision.message, /Belfast International Airport/);
  assert.match(decision.message, /Express Pick-Up/);
  assert.match(decision.message, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  assert.match(decision.message, /Once your flight has landed/);
  assert.doesNotMatch(decision.message, /Long Stay/i);
  assert.match(decision.html, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  const headingAt = decision.html.indexOf("IMPORTANT");
  const buttonAt = decision.html.indexOf("Message Us on WhatsApp");
  assert.ok(headingAt > 0 && headingAt < buttonAt);
  console.log("OK  Belfast International Express collection");
}

console.log("9. Belfast City airport collection");
{
  const decision = due(
    base({
      pickupLabel: "George Best Belfast City Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BHD",
      outboundAirportAccessOption: "free",
    }),
  );
  assert.match(decision.message, /George Best Belfast City Airport/);
  assert.match(decision.message, /Long Stay Car Park Free Pick-Up Location/);
  assert.match(decision.message, /5–10 minute walk/);
  assert.match(decision.message, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  assert.match(decision.message, /Long Stay Car Park Free Pick-Up Location/);
  assert.doesNotMatch(decision.message, /make your way to Express Pick-Up/);
  assert.doesNotMatch(buildJourneyReminderAirportInstructions(base({
    pickupLabel: "George Best Belfast City Airport",
    isFromAirport: true,
    airportCode: "BHD",
    outboundAirportAccessOption: "free",
  })) ?? "", /Express Pick-Up/);
  console.log("OK  Belfast City free collection");
}

console.log("10. Dublin Airport collection");
{
  const terminal1 = due(
    base({
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast",
      isFromAirport: true,
      airportCode: "DUB",
      dublinArrivalTerminal: "T1",
    }),
  );
  assert.match(terminal1.message, /Dublin Airport — Terminal 1/);
  assert.match(terminal1.message, /paid Pick-Up Location at Terminal 1/);
  assert.match(terminal1.message, /make your way to paid Pick-Up Location at Terminal 1/);
  assert.doesNotMatch(terminal1.message, /Terminal 2/);
  const terminal2 = due(
    base({
      pickupLabel: "Dublin Airport",
      isFromAirport: true,
      airportCode: "DUB",
      dublinArrivalTerminal: "T2",
      dropoffLabel: "Belfast",
    }),
  );
  assert.match(terminal2.message, /Terminal 2/);
  assert.doesNotMatch(terminal2.message, /Terminal 1/);
  const unknown = buildJourneyReminderAirportInstructions(
    base({ pickupLabel: "Dublin Airport", isFromAirport: true, airportCode: "DUB", dublinArrivalTerminal: null }),
  );
  assert.match(unknown ?? "", /terminal still needs confirmation/i);
  console.log("OK  Dublin terminals stay separate");
}

console.log("11. Airport drop-off");
{
  const decision = due(
    base({
      isFromAirport: false,
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Belfast International Airport",
      tripTime: "16:30",
      outboundAirportAccessOption: "express",
    }),
  );
  assert.match(decision.message, /Pickup: 12 High Street, Belfast/);
  assert.match(decision.message, /Pickup time: 4:30 PM/);
  assert.match(decision.message, /Belfast International Airport/);
  assert.match(decision.message, /Express Drop-Off/);
  assert.doesNotMatch(decision.message, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  assert.doesNotMatch(decision.message, /Once your flight has landed/);
  console.log("OK  drop-off has no landing instructions");
}

console.log("12. Business Class Meet & Greet");
{
  const decision = due(
    base({
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BFS",
      vehicle: "Business Class",
      outboundAirportAccessOption: "express",
    }),
  );
  assert.match(decision.message, /inside the airport arrivals area/);
  assert.match(decision.message, /agreed arrivals meeting point/);
  assert.match(decision.message, /do not need to walk to Express Pick-Up/i);
  assert.match(decision.message, /Once your flight has landed/);
  assert.doesNotMatch(decision.message, /Please make your way to Express Pick-Up/);
  console.log("OK  Meet & Greet stays in arrivals");
}

console.log("13. Return journey");
{
  const outbound = due(base({ journeyLeg: "outbound", tripTime: "16:30" }));
  const returning = due(
    base({
      journeyLeg: "return",
      tripDate: "2026-07-20",
      tripTime: "11:00",
      pickupLabel: "22 Main Street, Lisburn",
      dropoffLabel: "12 High Street, Belfast",
    }),
    new Date("2026-07-20T08:00:00.000Z"),
  );
  assert.notEqual(outbound.pickupKey, returning.pickupKey);
  assert.match(returning.message, /11:00 AM/);
  const sentOutbound = evaluateJourneyReminder(
    base({ reminderSentAt: "2026-07-15T13:30:00.000Z", reminderSentForPickupAt: outbound.pickupKey, journeyLeg: "return", tripDate: "2026-07-20", tripTime: "11:00" }),
    new Date("2026-07-20T08:00:00.000Z"),
  );
  assert.equal(sentOutbound.eligible, true);
  console.log("OK  each leg has its own reminder");
}

console.log("14. Booking rescheduled");
{
  const original = due(base());
  const moved = evaluateJourneyReminder(
    base({
      tripTime: "19:00",
      reminderSentAt: "2026-07-15T13:30:00.000Z",
      reminderSentForPickupAt: original.pickupKey,
    }),
    new Date("2026-07-15T16:00:00.000Z"),
  );
  assert.equal(moved.eligible, true);
  if (moved.eligible) assert.match(moved.message, /7:00 PM/);
  const job = {
    airportCollectionInfoSentAt: "2026-07-15T13:30:00.000Z",
    journeyReminderSentForPickupAt: original.pickupKey,
    journeyReminderDriverKey: "company",
  };
  clearJourneyReminderDelivery(job);
  assert.equal(job.airportCollectionInfoSentAt, undefined);
  assert.equal(job.journeyReminderSentForPickupAt, undefined);
  console.log("OK  old pickup reminder is no longer current");
}

console.log("15. Booking cancelled");
{
  const decision = evaluateJourneyReminder(base({ bookingStatus: "cancelled" }), SUMMER_NOW);
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "cancelled");
  const leg = evaluateJourneyReminder(base({ journeyLeg: "return", cancelledLegs: ["return"] }), SUMMER_NOW);
  assert.equal(leg.reason, "cancelled");
  console.log("OK  cancelled bookings are skipped");
}

console.log("16. Booking created within 2 hours");
{
  const now = new Date("2026-07-15T14:00:00.000Z");
  const decision = evaluateJourneyReminder(base({ tripTime: "16:30" }), now);
  assert.equal(decision.eligible, true);
  const tooSoon = evaluateJourneyReminder(base({ tripTime: "18:00" }), now);
  assert.equal(tooSoon.reason, "too_early");
  const handler = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(handler, /processJourneyRemindersForPayment/);
  console.log("OK  inside the window sends; outside waits");
}

console.log("17. Duplicate scheduler execution");
{
  const sent = evaluateJourneyReminder(
    base({ reminderSentAt: "2026-07-15T13:30:00.000Z", reminderSentForPickupAt: due(base()).pickupKey }),
    new Date("2026-07-15T13:40:00.000Z"),
  );
  assert.equal(sent.reason, "already_sent");
  const state: { sentAt?: string; claimId?: string; claimedAt?: string } = {};
  const first = beginJourneyReminderClaim(state, SUMMER_NOW);
  assert.equal(first.ok, true);
  if (first.ok) {
    state.claimId = first.claimId;
    state.claimedAt = SUMMER_NOW.toISOString();
  }
  const second = beginJourneyReminderClaim(state, new Date(SUMMER_NOW.getTime() + 60_000));
  assert.equal(second.ok, false);
  const later = beginJourneyReminderClaim(state, new Date(SUMMER_NOW.getTime() + 31 * 60 * 1000));
  assert.equal(later.ok, true);
  const handler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  assert.match(handler, /beginJourneyReminderClaim/);
  assert.match(handler, /getTrackingJob\(store, job\.token\)/);
  console.log("OK  sent flag and claim stop a second email");
}

console.log("18. Driver reassignment after reminder");
{
  const first = due(base());
  const updated = evaluateJourneyReminder(
    base({
      reminderSentAt: "2026-07-15T13:30:00.000Z",
      reminderSentForPickupAt: first.pickupKey,
      reminderDriverKey: "company",
      assignmentStatus: "accepted",
      assignedDriverName: "Alex",
      assignedDriverMobile: DRIVER_MOBILE,
    }),
    new Date("2026-07-15T14:00:00.000Z"),
  );
  assert.equal(updated.eligible, true);
  if (!updated.eligible) throw new Error("expected update");
  assert.equal(updated.kind, "driver_update");
  assert.match(updated.subject, /Updated driver details/);
  assert.match(updated.message, /Updated Driver Details/);
  assert.match(updated.message, /Driver: Alex/);
  assert.match(updated.html, />Message Your Driver on WhatsApp</);
  assert.match(updated.html, />Call Your Driver</);
  const repeat = evaluateJourneyReminder(
    base({
      reminderSentAt: "2026-07-15T13:30:00.000Z",
      reminderSentForPickupAt: first.pickupKey,
      reminderDriverKey: updated.driverKey,
      driverUpdateSentForKey: updated.driverKey,
      assignmentStatus: "accepted",
      assignedDriverName: "Alex",
      assignedDriverMobile: DRIVER_MOBILE,
    }),
    new Date("2026-07-15T14:10:00.000Z"),
  );
  assert.equal(repeat.reason, "already_sent");
  const pendingSwap = evaluateJourneyReminder(
    base({
      reminderSentAt: "2026-07-15T13:30:00.000Z",
      reminderSentForPickupAt: first.pickupKey,
      reminderDriverKey: "company",
      assignmentStatus: "pending",
      assignedDriverName: "Alex",
      assignedDriverMobile: DRIVER_MOBILE,
    }),
    new Date("2026-07-15T14:00:00.000Z"),
  );
  assert.equal(pendingSwap.reason, "already_sent");
  console.log("OK  one updated-driver email after acceptance");
}

console.log("19. No driver contact in earlier emails");
{
  const confirmation = buildCustomerConfirmationEmail({
    customerName: "Sarah Johnson",
    customerEmail: "sarah@example.com",
    mobileNumber: "07111111111",
    tripLabel: "Belfast",
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "22 Main Street, Lisburn",
    returnJourney: false,
    tripDate: "2026-07-15",
    tripTime: "16:30",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 1,
    suitcases: 1,
    vehicle: "Saloon Car (1–4 passengers)",
    isAirportTrip: false,
    amountPaid: "£40.00",
    paymentReference: "T-TEST",
  });
  const bundle = `${confirmation.subject}\n${confirmation.text}\n${confirmation.html}`;
  assert.equal(bundle.includes(DRIVER_MOBILE), false);
  assert.equal(bundle.includes(DRIVER_DISPLAY), false);
  assert.equal(bundle.includes("Your Driver"), false);
  const onTheWay = buildOnTheWayCompanyVoiceMessage({ customerName: "Sarah Johnson", bookedPickupTime: "16:30" });
  assert.equal(onTheWay.includes(DRIVER_MOBILE), false);
  assert.doesNotMatch(read("shared/booking-notifications.ts"), /assignedDriverMobile/);
  assert.doesNotMatch(read("shared/company-voice-journey.ts"), /assignedDriverMobile/);
  console.log("OK  confirmation and status emails omit driver mobiles");
}

console.log("20. Email buttons on phone and desktop");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  assert.match(decision.html, /name="viewport"/);
  assert.match(decision.html, /display:block/);
  assert.match(decision.html, /font-size:18px/);
  assert.match(decision.html, /padding:18px 22px/);
  assert.match(decision.html, /If the button does not open, use this link:/);
  assert.match(decision.html, /https:\/\/wa\.me\//);
  assert.match(decision.html, /href="tel:/);
  assert.match(decision.message, /Hi Sarah,/);
  assert.match(decision.message, /Journey date:/);
  assert.match(decision.message, /Pickup time:/);
  console.log("OK  large tap targets and fallback links");
}

console.log("Timing uses UK local time");
{
  assert.equal(JOURNEY_REMINDER_LEAD_MS, 2 * 60 * 60 * 1000);
  const summerPickup = parseLondonLocalDateTime("2026-07-15", "16:30");
  const winterPickup = parseLondonLocalDateTime("2026-01-15", "16:30");
  assert.ok(summerPickup && winterPickup);
  assert.equal(journeyReminderSendAt(summerPickup)?.toISOString(), "2026-07-15T13:30:00.000Z");
  assert.equal(journeyReminderSendAt(winterPickup)?.toISOString(), "2026-01-15T14:30:00.000Z");
  const early = evaluateJourneyReminder(base(), new Date("2026-07-15T13:29:00.000Z"));
  assert.equal(early.reason, "too_early");
  const passed = evaluateJourneyReminder(base(), new Date("2026-07-15T15:30:00.000Z"));
  assert.equal(passed.reason, "pickup_passed");
  const custom = resolveJourneyReminderAirportCopy({ bfsExpressCollection: "Meet at the signed Express Pick-Up." });
  assert.equal(custom.bfsExpressCollection, "Meet at the signed Express Pick-Up.");
  assert.match(custom.dubT1Collection, /Terminal 1/);
  const cron = read("workers/addresses/src/index.ts");
  const handler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  assert.match(cron, /processDueAirportPickupReminders\(env\)/);
  assert.match(handler, /paid\?\.returnTime/);
  assert.match(handler, /trySendResendOnlyCustomerEmail/);
  assert.doesNotMatch(handler, /twilio|sms:/i);
  console.log("OK  two-hour London lead, editable copy, existing email cron");
}

console.log("Driver de-assignment");
{
  const priya = {
    assignmentVersion: 3,
    assignmentStatus: "accepted" as const,
    assignedDriverEmail: "priya@example.com",
    assignedDriverName: "Priya",
  };
  const queued = driverDispatchDecision(priya, {
    kind: "journey_reminder",
    assignmentVersion: 3,
    driverEmail: "priya@example.com",
  });
  assert.equal(queued.allow, true);

  const replaced = driverDispatchDecision(
    { ...priya, assignmentVersion: 4, assignedDriverEmail: "alex@example.com", assignedDriverName: "Alex" },
    { kind: "journey_reminder", assignmentVersion: 3, driverEmail: "priya@example.com" },
  );
  assert.equal(replaced.allow, false);
  if (!replaced.allow) assert.equal(replaced.reason, "stale_assignment");

  const removed = driverDispatchDecision(
    { assignmentVersion: 4, assignmentStatus: "unassigned", assignedDriverEmail: "" },
    { kind: "assignment_invite", assignmentVersion: 3, driverEmail: "priya@example.com", acceptToken: "old-token" },
  );
  assert.equal(removed.allow, false);
  if (!removed.allow) assert.equal(removed.reason, "stale_assignment");

  const unassignedNotice = driverJourneyNoticeRecipient({
    assignmentVersion: 4,
    assignmentStatus: "unassigned",
    assignedDriverEmail: "",
    assignedDriverName: "",
  });
  assert.equal(unassignedNotice.allow, false);
  if (!unassignedNotice.allow) assert.equal(unassignedNotice.reason, "unassigned");

  const pendingNotice = driverJourneyNoticeRecipient({
    assignmentVersion: 5,
    assignmentStatus: "pending",
    assignedDriverEmail: "alex@example.com",
    assignedDriverName: "Alex",
  });
  assert.equal(pendingNotice.allow, false);
  if (!pendingNotice.allow) assert.equal(pendingNotice.reason, "not_accepted");

  const firstNotice = driverJourneyNoticeRecipient({
    ...priya,
    journeyDriverNoticeSentFor: undefined,
  });
  assert.equal(firstNotice.allow, true);
  const duplicateNotice = driverJourneyNoticeRecipient({
    ...priya,
    journeyDriverNoticeSentFor: "3:priya@example.com",
  });
  assert.equal(duplicateNotice.allow, false);
  if (!duplicateNotice.allow) assert.equal(duplicateNotice.reason, "already_sent");

  const sent = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  const withdrawn = due(
    base({
      assignmentStatus: "unassigned",
      assignedDriverName: "Alex",
      assignedDriverMobile: "07700900222",
      reminderSentAt: "2026-07-15T13:30:00.000Z",
      reminderSentForPickupAt: sent.pickupKey,
      reminderDriverKey: sent.driverKey,
    }),
    new Date("2026-07-15T14:00:00.000Z"),
  );
  assert.equal(withdrawn.kind, "driver_update");
  assert.equal(withdrawn.contact.kind, "company");
  assert.equal(withdrawn.message.includes("Priya"), false);
  assert.equal(withdrawn.message.includes(DRIVER_DISPLAY), false);
  assert.equal(withdrawn.message.includes("07700 900222"), false);
  assert.match(withdrawn.message, /028 9602 2952/);

  const notice = buildDriverJourneyNoticeEmail({
    driverName: "Priya Shah",
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "22 Main Street, Lisburn",
    tripDate: "2026-07-15",
    tripTime: "16:30",
    flightNumber: "EI 164",
    customerFirstName: "Sarah",
  });
  assert.doesNotMatch(`${notice.subject}\n${notice.text}`, /£|paid|card/i);
  assert.match(notice.text, /accepted driver/);

  const job = {
    assignmentVersion: 2,
    assignmentStatus: "accepted",
    assignedDriverName: "Priya",
    assignedDriverEmail: "priya@example.com",
  } as TrackingJobRecord;
  noteAssignmentChange(job, {
    action: "deassigned",
    at: "2026-07-15T14:05:00.000Z",
    driverName: job.assignedDriverName,
    driverEmail: job.assignedDriverEmail,
  });
  assert.equal(job.assignmentVersion, 3);
  assert.equal(job.assignmentAudit?.[0]?.driverEmail, "priya@example.com");
  assert.equal(job.assignmentAudit?.[0]?.action, "deassigned");

  const handler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  const assign = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(handler, /driverDispatchDecision/);
  assert.match(handler, /customerDriverStillCurrent/);
  assert.match(assign, /driverDispatchDecision/);
  assert.match(assign, /noteAssignmentChange/);
  console.log("OK  stale, deassigned, duplicate, and unassigned driver sends are blocked");
}

console.log("\nAll journey reminder checks passed.");

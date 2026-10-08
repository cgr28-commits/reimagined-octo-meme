/**
 * Three-hour journey reminder — offline checks.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/check-journey-reminder.ts
 *
 * Does not send email, WhatsApp, or create a booking.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import {
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_WHATSAPP_DIGITS,
  businessWhatsAppMobileDisplay,
  businessWhatsAppMobileTel,
} from "../shared/business-email";
import { buildOnTheWayCompanyVoiceMessage } from "../shared/company-voice-journey";
import {
  DRIVER_CONTACT_RATE_LIMIT,
  DRIVER_CONTACT_UPDATED_HEADING,
  driverContactRedirectHref,
  driverContactTokenMatches,
  evaluateDriverContactVisit,
  generateDriverContactToken,
  isSafeDriverContactRedirect,
  nextDriverContactRateHits,
  normalizeDriverContactToken,
  publicDriverContactResponse,
  type DriverContactVisitInput,
} from "../shared/driver-contact-link";
import {
  DRIVER_CONTACT_REVEAL_LEAD_MS,
  DRIVER_CONTACT_UNLOCK_MESSAGE,
  JOURNEY_CALL_LABEL,
  JOURNEY_REMINDER_LANDING_BODY,
  JOURNEY_REMINDER_LANDING_HEADING,
  JOURNEY_REMINDER_LEAD_MS,
  WHATSAPP_COMPANY_LABEL,
  WHATSAPP_DRIVER_LABEL,
  WHATSAPP_PREFERRED_NOTE,
  beginJourneyReminderClaim,
  driverContactDetailsUnlocked,
  buildJourneyReminderAirportInstructions,
  clearJourneyReminderDelivery,
  evaluateJourneyReminder,
  journeyReminderEmailExposesDirectContact,
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
const CONTACT_TOKEN = "ab".repeat(32);
const CONTACT_PAGE = `https://www.myairporttaxini.co.uk/driver-contact/?token=${CONTACT_TOKEN}`;
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
    driverContactUrl: CONTACT_PAGE,
    ...overrides,
  };
}

function assertSmartEmail(decision: ReturnType<typeof due>) {
  const bundle = `${decision.html}\n${decision.text}\n${decision.message}`;
  assert.equal(bundle.includes(DRIVER_MOBILE), false);
  assert.equal(bundle.includes(DRIVER_DISPLAY), false);
  assert.equal(bundle.includes(DRIVER_DIGITS), false);
  assert.equal(bundle.includes(`wa.me/${DRIVER_DIGITS}`), false);
  assert.equal(bundle.includes(`tel:+${DRIVER_DIGITS}`), false);
  assert.match(decision.html, new RegExp(WHATSAPP_PREFERRED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(decision.message, new RegExp(WHATSAPP_PREFERRED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(decision.html, new RegExp(`>${WHATSAPP_COMPANY_LABEL}<`));
  assert.match(decision.html, />Call</);
  assert.doesNotMatch(decision.html, />Call Us</);
  assert.doesNotMatch(decision.html, />Call Your Driver</);
  assert.doesNotMatch(decision.html, />Message Us on WhatsApp</);
  assert.match(decision.html, /#25D366/);
  assert.match(decision.html, /font-size:20px/);
  assert.match(decision.html, /font-size:14px/);
  assert.ok(decision.html.indexOf("font-size:20px") < decision.html.indexOf(">Call</a>"));
  assert.match(decision.html, /\/driver-contact\/\?token=/);
  assert.match(decision.html, /intent=message/);
  if (decision.contact.kind === "driver") {
    assert.match(decision.html, new RegExp(`>${WHATSAPP_DRIVER_LABEL}<`));
    assert.match(decision.html, /intent=call/);
    assert.ok(decision.html.indexOf(`>${WHATSAPP_DRIVER_LABEL}<`) < decision.html.indexOf(`>${WHATSAPP_COMPANY_LABEL}<`));
    assert.ok(
      decision.html.indexOf("font-size:20px;padding:20px 24px") <
        decision.html.indexOf("font-size:16px;padding:14px 18px"),
    );
  } else {
    assert.doesNotMatch(decision.html, new RegExp(`>${WHATSAPP_DRIVER_LABEL}<`));
    assert.match(decision.html, /intent=call/);
  }
  assert.match(decision.html, new RegExp(`wa\\.me/${BUSINESS_WHATSAPP_DIGITS}`));
  assert.match(decision.html, new RegExp(`tel:${businessWhatsAppMobileTel().replace("+", "\\+")}`));
  assert.match(decision.message, new RegExp(businessWhatsAppMobileDisplay().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(bundle.includes(BUSINESS_PHONE_DISPLAY), false);
  assert.equal(bundle.includes("+442896022952"), false);
  assert.match(decision.message, new RegExp(DRIVER_CONTACT_UNLOCK_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(decision.contactPageHref.includes("wa.me"), false);
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
  assertSmartEmail(decision);
  assert.equal(decision.message.includes("07700900999"), false);
  assert.equal(decision.html.includes("07700 900999"), false);
  assert.match(decision.message, /My Airport Taxi NI/);
  console.log("OK  secure page link, no owner mobile");
}

console.log("2. Accepted assigned driver");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya Shah", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "driver");
  assertSmartEmail(decision);
  assert.equal(decision.message.includes("Priya"), false);
  assert.doesNotMatch(decision.message, /Shah/);
  console.log("OK  email omits the driver name and mobile");
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
  assertSmartEmail(decision);
  assert.equal(decision.html.includes(DRIVER_DIGITS), false);
  assert.equal(decision.message.includes("Priya"), false);
  console.log("OK  reminder email has no direct WhatsApp link");
}

console.log("4. Assigned driver click-to-call");
{
  const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  assertSmartEmail(decision);
  assert.equal(decision.html.includes(`tel:+${DRIVER_DIGITS}`), false);
  console.log("OK  call button opens the secure page");
}

console.log("5. Unassigned booking");
{
  const decision = due(base({ assignmentStatus: "unassigned", assignedDriverName: "Priya", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "company");
  assertSmartEmail(decision);
  assert.equal(decision.message.includes("Priya"), false);
  assert.equal(decision.message.includes(DRIVER_DISPLAY), false);
  console.log("OK  company fallback stays off the email");
}

console.log("6. Missing or invalid driver number");
{
  for (const mobile of ["", "abc", "123", "028 9602 2952"]) {
    const decision = due(base({ assignmentStatus: "accepted", assignedDriverName: "Priya", assignedDriverMobile: mobile }));
    assert.equal(decision.contact.kind, "company", mobile);
    assertSmartEmail(decision);
    assert.equal(decision.message.includes("Priya"), false);
  }
  console.log("OK  invalid numbers use the company line");
}

console.log("7. Driver assignment not accepted");
{
  const decision = due(base({ assignmentStatus: "pending", assignedDriverName: "Priya Shah", assignedDriverMobile: DRIVER_MOBILE }));
  assert.equal(decision.contact.kind, "company");
  assertSmartEmail(decision);
  assert.equal(decision.message.includes("Priya"), false);
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
  assert.match(decision.message, /IMPORTANT — PLEASE WHATSAPP YOUR DRIVER WHEN YOU LAND/);
  assert.match(decision.message, /Once your flight has landed/);
  assert.match(decision.message, /WhatsApp your driver/);
  assert.match(decision.message, /If WhatsApp is unavailable, you can call/);
  assert.match(decision.message, /ready for collection, please update your driver on WhatsApp/);
  assert.match(decision.message, /If you land before your driver’s contact details are available/);
  assert.match(decision.message, /please WhatsApp My Airport Taxi NI/);
  assert.ok(decision.message.includes(JOURNEY_REMINDER_LANDING_BODY.split("\n")[0]));
  assert.doesNotMatch(decision.message, /Long Stay/i);
  assert.match(decision.html, /IMPORTANT — PLEASE WHATSAPP YOUR DRIVER WHEN YOU LAND/);
  assert.match(decision.html, /border-left:4px solid #c2410c/);
  assert.match(decision.html, /font-size:18px/);
  const headingAt = decision.html.indexOf("IMPORTANT");
  const buttonAt = decision.html.indexOf(`>${WHATSAPP_COMPANY_LABEL}</a>`);
  assert.ok(headingAt > 0 && buttonAt > headingAt);
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
  assert.match(decision.message, /IMPORTANT — PLEASE WHATSAPP YOUR DRIVER WHEN YOU LAND/);
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
  assert.match(terminal1.message, /make your way to the paid Pick-Up Location at Terminal 1/);
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
  assert.doesNotMatch(decision.message, /IMPORTANT — PLEASE WHATSAPP YOUR DRIVER WHEN YOU LAND/);
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
  const returnPickup = parseLondonLocalDateTime("2026-07-20", "11:00");
  assert.ok(returnPickup);
  assert.equal(journeyReminderSendAt(returnPickup)?.toISOString(), "2026-07-20T07:00:00.000Z");
  const beforeReturn = evaluateJourneyReminder(
    base({
      journeyLeg: "return",
      tripDate: "2026-07-20",
      tripTime: "11:00",
    }),
    new Date("2026-07-20T06:59:00.000Z"),
  );
  assert.equal(beforeReturn.reason, "too_early");
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

console.log("16. Booking created within 3 hours");
{
  const now = new Date("2026-07-15T14:00:00.000Z");
  const decision = evaluateJourneyReminder(base({ tripTime: "16:30" }), now);
  assert.equal(decision.eligible, true);
  const tooSoon = evaluateJourneyReminder(base({ tripTime: "19:00" }), now);
  assert.equal(tooSoon.reason, "too_early");
  const lastMinute = evaluateJourneyReminder(base({ tripTime: "16:30" }), new Date("2026-07-15T15:00:00.000Z"));
  assert.equal(lastMinute.eligible, true);
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
  assert.equal(updated.message.includes("Alex"), false);
  assert.equal(updated.message.includes(DRIVER_DISPLAY), false);
  assertSmartEmail(updated);
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
  assert.match(decision.html, /font-size:20px/);
  assert.match(decision.html, /padding:20px 24px/);
  assert.match(decision.html, /font-size:14px/);
  assert.match(decision.html, /padding:8px 16px/);
  assert.match(decision.html, /If the button does not open, use this link:/);
  assertSmartEmail(decision);
  assert.match(decision.message, /Hi Sarah,/);
  assert.match(decision.message, /Journey date:/);
  assert.match(decision.message, /Pickup time:/);
  console.log("OK  large tap targets and fallback links");
}

console.log("Timing uses UK local time");
{
  assert.equal(JOURNEY_REMINDER_LEAD_MS, 3 * 60 * 60 * 1000);
  assert.equal(DRIVER_CONTACT_REVEAL_LEAD_MS, 2 * 60 * 60 * 1000);
  assert.equal(BUSINESS_PHONE_DISPLAY, "028 9602 2952");
  assert.equal(businessWhatsAppMobileDisplay(), "07549 815538");
  assert.equal(businessWhatsAppMobileTel(), "+447549815538");
  assert.match(read("src/lib/data.ts"), /landlineDisplay:\s*"028 9602 2952"/);
  assert.match(read("src/lib/data.ts"), /whatsapp:\s*"447549815538"/);
  assert.match(read("src/components/FooterContact.tsx"), /SITE\.landlineDisplay/);
  const contactPage = read("src/app/driver-contact/DriverContactClient.tsx");
  assert.doesNotMatch(contactPage, /028 9602 2952/);
  assert.doesNotMatch(contactPage, /Call Us|Call Your Driver|Message Us on WhatsApp/);
  assert.match(contactPage, /WhatsApp is our preferred way to communicate about your journey/);
  assert.match(contactPage, /Message Your Driver on WhatsApp/);
  assert.match(contactPage, /Message My Airport Taxi NI on WhatsApp/);
  assert.match(contactPage, /bg-\[#25D366\][^"]*text-lg/);
  assert.match(contactPage, /inline-block rounded-lg border[^"]*text-sm font-semibold/);
  const summerPickup = parseLondonLocalDateTime("2026-07-15", "16:30");
  const winterPickup = parseLondonLocalDateTime("2026-01-15", "16:30");
  assert.ok(summerPickup && winterPickup);
  assert.equal(journeyReminderSendAt(summerPickup)?.toISOString(), "2026-07-15T12:30:00.000Z");
  assert.equal(journeyReminderSendAt(winterPickup)?.toISOString(), "2026-01-15T13:30:00.000Z");
  assert.equal(driverContactDetailsUnlocked(summerPickup, new Date("2026-07-15T12:30:00.000Z")), false);
  assert.equal(driverContactDetailsUnlocked(summerPickup, new Date("2026-07-15T13:30:00.000Z")), true);
  const early = evaluateJourneyReminder(base(), new Date("2026-07-15T12:29:00.000Z"));
  assert.equal(early.reason, "too_early");
  const onTime = evaluateJourneyReminder(base(), new Date("2026-07-15T12:30:00.000Z"));
  assert.equal(onTime.eligible, true);
  if (onTime.eligible) assert.match(onTime.message, /three hours beforehand/);
  const passed = evaluateJourneyReminder(base(), new Date("2026-07-15T15:30:00.000Z"));
  assert.equal(passed.reason, "pickup_passed");
  const custom = resolveJourneyReminderAirportCopy({ bfsExpressCollection: "Meet at the signed Express Pick-Up." });
  assert.equal(custom.bfsExpressCollection, "Meet at the signed Express Pick-Up.");
  assert.match(custom.dubT1Collection, /Terminal 1/);
  const cron = read("workers/addresses/src/index.ts");
  const handler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  const schedule = read("workers/addresses/src/journey-reminder-input.ts");
  assert.match(cron, /processDueAirportPickupReminders\(env\)/);
  assert.match(schedule, /paid\?\.returnTime/);
  assert.match(handler, /trySendResendOnlyCustomerEmail/);
  assert.doesNotMatch(handler, /twilio|sms:/i);
  const noticeFn = handler.slice(handler.indexOf("async function maybeSendAcceptedDriverNotice"));
  const noticeGate = noticeFn.indexOf("DRIVER_CONTACT_REVEAL_LEAD_MS");
  const noticeClaim = noticeFn.indexOf("beginJourneyReminderClaim");
  assert.ok(noticeGate >= 0 && noticeClaim > noticeGate);
  console.log("OK  three-hour London lead, two-hour driver unlock, existing email cron");
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
  assert.equal(withdrawn.html.includes(DRIVER_DIGITS), false);
  assert.equal(withdrawn.html.includes("07700 900222"), false);
  assert.match(withdrawn.html, /\/driver-contact\//);
  assert.match(withdrawn.html, new RegExp(`wa\\.me/${BUSINESS_WHATSAPP_DIGITS}`));

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

console.log("Live driver contact links");
{
  function visit(overrides: Partial<DriverContactVisitInput> = {}, now = SUMMER_NOW) {
    return evaluateDriverContactVisit(
      {
        ...base(),
        requestToken: CONTACT_TOKEN,
        storedToken: CONTACT_TOKEN,
        assignmentStatus: "accepted",
        assignedDriverName: "Priya Shah",
        assignedDriverMobile: DRIVER_MOBILE,
        flightNumber: "EI 164",
        ...overrides,
      },
      now,
    );
  }

  const current = visit();
  assert.equal(current.view, "driver");
  assert.equal(current.driver?.firstName, "Priya");
  assert.equal(current.driver?.mobileDisplay, DRIVER_DISPLAY);
  const shown = publicDriverContactResponse(current);
  const shownJson = JSON.stringify(shown);
  assert.equal(shownJson.includes("wa.me"), false);
  assert.equal(shownJson.includes("tel:"), false);
  assert.equal(shownJson.includes("Shah"), false);
  assert.match(shownJson, new RegExp(DRIVER_DISPLAY));
  const whatsApp = driverContactRedirectHref(current, "whatsapp") ?? "";
  const parsed = new URL(whatsApp);
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
  assert.equal(driverContactRedirectHref(current, "call"), `tel:+${DRIVER_DIGITS}`);
  assert.equal(isSafeDriverContactRedirect(whatsApp), true);
  assert.equal(isSafeDriverContactRedirect("https://evil.example/447700900111"), false);
  assert.equal(isSafeDriverContactRedirect("https://wa.me.evil.com/447700900111"), false);

  for (let click = 0; click < 5; click += 1) {
    const again = visit();
    assert.equal(again.driver?.mobileDisplay, DRIVER_DISPLAY);
    assert.equal(driverContactRedirectHref(again, "call"), `tel:+${DRIVER_DIGITS}`);
  }

  const removed = visit({
    assignmentStatus: "unassigned",
    assignedDriverName: "",
    assignedDriverMobile: "",
    assignmentAudit: [
      { action: "accepted", driverName: "Priya Shah" },
      { action: "deassigned", driverName: "Priya Shah" },
    ],
  });
  assert.equal(removed.view, "updated");
  assert.equal(removed.heading, DRIVER_CONTACT_UPDATED_HEADING);
  assert.match(removed.message, /Your driver details have been updated/);
  const removedJson = JSON.stringify(publicDriverContactResponse(removed));
  assert.equal(removedJson.includes("Priya"), false);
  assert.equal(removedJson.includes(DRIVER_DIGITS), false);
  assert.equal(removedJson.includes(DRIVER_DISPLAY), false);
  assert.match(removedJson, new RegExp(businessWhatsAppMobileDisplay().replace(/ /g, " ")));
  const removedWhatsApp = driverContactRedirectHref(removed, "whatsapp") ?? "";
  assert.equal(new URL(removedWhatsApp).pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  assert.equal(removedWhatsApp.includes(DRIVER_DIGITS), false);
  assert.equal(driverContactRedirectHref(removed, "call"), `tel:${businessWhatsAppMobileTel()}`);

  const replacement = visit({
    assignmentStatus: "accepted",
    assignedDriverName: "Alex Murphy",
    assignedDriverMobile: "07700900222",
    assignmentAudit: [
      { action: "accepted", driverName: "Priya Shah" },
      { action: "deassigned", driverName: "Priya Shah" },
      { action: "accepted", driverName: "Alex Murphy" },
    ],
  });
  assert.equal(replacement.view, "driver");
  assert.equal(replacement.driver?.firstName, "Alex");
  assert.equal(replacement.driver?.mobileDisplay, "07700 900222");
  assert.equal(JSON.stringify(publicDriverContactResponse(replacement)).includes(DRIVER_DIGITS), false);
  assert.equal(JSON.stringify(publicDriverContactResponse(replacement)).includes("Priya"), false);
  assert.equal(new URL(driverContactRedirectHref(replacement, "whatsapp") ?? "").pathname, "/447700900222");

  const pending = visit({
    assignmentStatus: "pending",
    assignedDriverName: "Alex Murphy",
    assignedDriverMobile: "07700900222",
    assignmentAudit: [{ action: "deassigned", driverName: "Priya Shah" }],
  });
  assert.equal(pending.view, "updated");
  const pendingJson = JSON.stringify(publicDriverContactResponse(pending));
  assert.equal(pendingJson.includes("Alex"), false);
  assert.equal(pendingJson.includes("Priya"), false);
  assert.equal(pendingJson.includes("07700 900222"), false);

  const unassigned = visit({
    assignmentStatus: "unassigned",
    assignedDriverName: "Priya Shah",
    assignedDriverMobile: DRIVER_MOBILE,
    assignmentAudit: [],
  });
  assert.equal(unassigned.view, "company");
  assert.notEqual(unassigned.heading, DRIVER_CONTACT_UPDATED_HEADING);
  assert.equal(JSON.stringify(publicDriverContactResponse(unassigned)).includes("Priya"), false);
  assert.equal(publicDriverContactResponse(unassigned).phoneDisplay, businessWhatsAppMobileDisplay());
  assert.equal(publicDriverContactResponse(unassigned).whatsAppLabel, WHATSAPP_COMPANY_LABEL);
  assert.equal(publicDriverContactResponse(unassigned).callLabel, JOURNEY_CALL_LABEL);
  assert.equal(publicDriverContactResponse(unassigned).whatsAppNote, WHATSAPP_PREFERRED_NOTE);

  const owner = visit({
    assignmentStatus: "accepted",
    assignedDriverName: "Owner / Primary Driver",
    assignedDriverMobile: "07700900999",
    assignmentAudit: [{ action: "accepted", driverName: "Owner / Primary Driver" }],
  });
  assert.equal(owner.view, "company");
  assert.equal(JSON.stringify(publicDriverContactResponse(owner)).includes("07700900999"), false);
  assert.equal(publicDriverContactResponse(owner).phoneDisplay, businessWhatsAppMobileDisplay());
  assert.equal(publicDriverContactResponse(owner).whatsAppLabel, WHATSAPP_COMPANY_LABEL);
  assert.equal(publicDriverContactResponse(owner).callLabel, JOURNEY_CALL_LABEL);
  const ownerEarly = visit(
    {
      assignmentStatus: "accepted",
      assignedDriverName: "Owner / Primary Driver",
      assignedDriverMobile: "07700900999",
      assignmentAudit: [{ action: "accepted", driverName: "Owner / Primary Driver" }],
    },
    new Date("2026-07-15T12:30:00.000Z"),
  );
  assert.equal(ownerEarly.view, "company");
  assert.notEqual(ownerEarly.heading, DRIVER_CONTACT_UNLOCK_MESSAGE);
  assert.equal(JSON.stringify(publicDriverContactResponse(ownerEarly)).includes("07700900999"), false);
  assert.equal(publicDriverContactResponse(ownerEarly).phoneDisplay, businessWhatsAppMobileDisplay());
  assert.equal(driverContactRedirectHref(ownerEarly, "call"), `tel:${businessWhatsAppMobileTel()}`);
  const unassignedEarly = visit(
    { assignmentStatus: "unassigned", assignedDriverName: "", assignedDriverMobile: "", assignmentAudit: [] },
    new Date("2026-07-15T12:30:00.000Z"),
  );
  assert.equal(unassignedEarly.view, "too_early");
  assert.equal(unassignedEarly.heading, DRIVER_CONTACT_UNLOCK_MESSAGE);
  assert.equal(publicDriverContactResponse(unassignedEarly).phoneDisplay, businessWhatsAppMobileDisplay());

  const cancelled = visit({ bookingStatus: "cancelled" });
  assert.equal(cancelled.view, "cancelled");
  assert.equal(cancelled.driver, undefined);
  assert.match(cancelled.message, /cancelled/i);
  assert.equal(JSON.stringify(publicDriverContactResponse(cancelled)).includes(DRIVER_DIGITS), false);

  const atReminder = visit({}, new Date("2026-07-15T12:30:00.000Z"));
  assert.equal(atReminder.view, "too_early");
  assert.equal(atReminder.driver, undefined);
  assert.equal(atReminder.heading, DRIVER_CONTACT_UNLOCK_MESSAGE);
  assert.equal(JSON.stringify(publicDriverContactResponse(atReminder)).includes("Priya"), false);
  assert.equal(JSON.stringify(publicDriverContactResponse(atReminder)).includes(DRIVER_DIGITS), false);
  assert.equal(publicDriverContactResponse(atReminder).phoneDisplay, businessWhatsAppMobileDisplay());
  assert.equal(new URL(driverContactRedirectHref(atReminder, "whatsapp") ?? "").pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  assert.equal(driverContactRedirectHref(atReminder, "call"), `tel:${businessWhatsAppMobileTel()}`);
  const tooEarly = visit({}, new Date("2026-07-15T13:29:00.000Z"));
  assert.equal(tooEarly.view, "too_early");
  assert.equal(tooEarly.driver, undefined);
  assert.equal(JSON.stringify(publicDriverContactResponse(tooEarly)).includes("Priya"), false);
  assert.equal(new URL(driverContactRedirectHref(tooEarly, "whatsapp") ?? "").pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  const unlocked = visit({}, new Date("2026-07-15T13:30:00.000Z"));
  assert.equal(unlocked.view, "driver");
  assert.equal(unlocked.driver?.firstName, "Priya");
  assert.equal(unlocked.driver?.mobileDisplay, DRIVER_DISPLAY);
  assert.equal(publicDriverContactResponse(unlocked).whatsAppLabel, WHATSAPP_DRIVER_LABEL);
  assert.equal(publicDriverContactResponse(unlocked).callLabel, JOURNEY_CALL_LABEL);
  assert.equal(publicDriverContactResponse(unlocked).whatsAppNote, WHATSAPP_PREFERRED_NOTE);
  assert.equal(publicDriverContactResponse(atReminder).whatsAppLabel, WHATSAPP_COMPANY_LABEL);

  const expired = visit({}, new Date("2026-07-16T03:30:00.000Z"));
  assert.equal(expired.view, "expired");
  assert.equal(expired.driver, undefined);
  assert.equal(JSON.stringify(publicDriverContactResponse(expired)).includes(DRIVER_DISPLAY), false);
  const stillOpen = visit({}, new Date("2026-07-16T03:29:59.000Z"));
  assert.equal(stillOpen.view, "driver");

  const invalidRef = visit({ requestToken: "MAT-4827" });
  assert.equal(invalidRef.view, "invalid");
  assert.equal(JSON.stringify(publicDriverContactResponse(invalidRef)).includes(DRIVER_DIGITS), false);
  const paymentRef = visit({ requestToken: "T-TEST-PAYMENT" });
  assert.equal(paymentRef.view, "invalid");
  const mismatch = visit({ requestToken: "cd".repeat(32) });
  assert.equal(mismatch.view, "invalid");
  assert.equal(driverContactRedirectHref(mismatch, "whatsapp"), null);
  assert.equal(normalizeDriverContactToken("MAT-4827"), "");
  assert.equal(driverContactTokenMatches(CONTACT_TOKEN, "MAT-4827"), false);
  const minted = generateDriverContactToken();
  assert.match(minted, /^[a-f0-9]{64}$/);
  assert.notEqual(minted, "MAT-1001");

  const oldEmail = due(
    base({
      assignmentStatus: "accepted",
      assignedDriverName: "Priya Shah",
      assignedDriverMobile: DRIVER_MOBILE,
      flightNumber: "EI 164",
    }),
  );
  assert.equal(oldEmail.html.includes(DRIVER_DIGITS), false);
  assert.equal(oldEmail.html.includes("Priya"), false);
  assert.match(oldEmail.html, new RegExp(CONTACT_TOKEN));
  assert.equal(journeyReminderEmailExposesDirectContact(oldEmail.text, oldEmail.html, oldEmail.contact), false);
  const afterOldEmail = visit({
    assignmentStatus: "unassigned",
    assignedDriverName: "",
    assignedDriverMobile: "",
    assignmentAudit: [{ action: "deassigned", driverName: "Priya Shah" }],
  });
  assert.equal(afterOldEmail.view, "updated");
  assert.equal(afterOldEmail.message.includes(DRIVER_DISPLAY), false);

  const hijack = due(
    base({
      assignmentStatus: "accepted",
      assignedDriverName: "Priya",
      assignedDriverMobile: DRIVER_MOBILE,
      driverContactUrl: `https://wa.me/${DRIVER_DIGITS}`,
    }),
  );
  assert.equal(hijack.html.includes(DRIVER_DIGITS), false);
  assert.equal(hijack.html.includes(`wa.me/${DRIVER_DIGITS}`), false);
  assert.match(hijack.html, /https:\/\/www\.myairporttaxini\.co\.uk\/driver-contact\//);
  assert.match(hijack.html, new RegExp(`wa\\.me/${BUSINESS_WHATSAPP_DIGITS}`));

  let hits: number[] = [];
  let allowed = true;
  for (let i = 0; i < DRIVER_CONTACT_RATE_LIMIT; i += 1) {
    const step = nextDriverContactRateHits(hits, SUMMER_NOW.getTime());
    allowed = step.allow;
    hits = step.hits;
  }
  assert.equal(allowed, true);
  assert.equal(nextDriverContactRateHits(hits, SUMMER_NOW.getTime()).allow, false);

  const kept = clearJourneyReminderDelivery({
    driverContactToken: CONTACT_TOKEN,
    airportPickupReminderSentAt: "2026-07-15T13:30:00.000Z",
  });
  assert.equal(kept.driverContactToken, CONTACT_TOKEN);
  assert.equal(kept.airportPickupReminderSentAt, undefined);

  const contactHandler = read("workers/addresses/src/driver-contact-handlers.ts");
  const routes = read("workers/addresses/src/index.ts");
  const reminderHandler = read("workers/addresses/src/airport-pickup-reminder-handlers.ts");
  assert.match(contactHandler, /no-store/);
  assert.match(contactHandler, /Referrer-Policy/);
  assert.match(contactHandler, /readAuthoritativeContact/);
  assert.match(contactHandler, /getTrackingJobForDriverContactToken/);
  assert.doesNotMatch(contactHandler, /searchParams\.get\("booking"\)/);
  assert.match(routes, /driver-contact-open/);
  const ensureAt = reminderHandler.indexOf("await ensureDriverContactLink");
  const sendAt = reminderHandler.indexOf("await trySendResendOnlyCustomerEmail");
  assert.ok(ensureAt > 0 && sendAt > ensureAt);
  assert.match(read("src/app/driver-contact/page.tsx"), /index: false/);
  assert.match(read("src/app/driver-contact/DriverContactClient.tsx"), /cache:\s*"no-store"/);
  assert.match(read("src/app/driver-contact/DriverContactClient.tsx"), /does not update on its own/);
  assert.match(reminderHandler, /DRIVER_CONTACT_REVEAL_LEAD_MS/);
  assert.match(read("src/app/driver-contact/DriverContactClient.tsx"), /driver-contact\/open/);
  assert.match(read("src/app/robots.ts"), /\/driver-contact/);
  assert.match(read("src/lib/data.ts"), /\/driver-contact/);
  console.log("OK  live page follows de-assignment, replacement, expiry, and old emails");
}

console.log("\nAll journey reminder checks passed.");

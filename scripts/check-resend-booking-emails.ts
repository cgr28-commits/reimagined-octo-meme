/**
 * Regression checks for Resend booking-email templates + UK customer datetime.
 * Does not call Resend (no API key required).
 */
import assert from "node:assert/strict";
import {
  buildBusinessBookingNotificationEmail,
  buildCustomerBookingRequestEmail,
} from "../shared/booking-request-emails";
import {
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_TAGLINE,
  BUSINESS_WHATSAPP_HANDLE,
  DEFAULT_BOOKING_FROM_EMAIL,
  resolveBookingFromEmail,
  resolveBookingNotificationEmail,
} from "../shared/email-config";
import { formatUkCustomerDateTime, formatUkTime12h, UK_TIME_ZONE } from "../shared/uk-time";

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

check("UK timezone constant is Europe/London", () => {
  assert.equal(UK_TIME_ZONE, "Europe/London");
});

check("12-hour UK times use AM/PM", () => {
  assert.equal(formatUkTime12h("09:05"), "9:05 AM");
  assert.equal(formatUkTime12h("11:30"), "11:30 AM");
  assert.equal(formatUkTime12h("00:15"), "12:15 AM");
  assert.equal(formatUkTime12h("12:00"), "12:00 PM");
  assert.equal(formatUkTime12h("16:45"), "4:45 PM");
});

check("Customer datetime is long UK local form", () => {
  const winter = formatUkCustomerDateTime("2026-01-15", "14:30");
  assert.match(winter, /Thursday 15 January 2026 at 2:30 PM/);

  const summer = formatUkCustomerDateTime("2026-08-16", "11:30");
  assert.match(summer, /Sunday 16 August 2026 at 11:30 AM/);
});

check("Central From / notification defaults", () => {
  assert.equal(resolveBookingFromEmail(), DEFAULT_BOOKING_FROM_EMAIL);
  assert.equal(
    resolveBookingNotificationEmail({ BOOKING_NOTIFICATION_EMAIL: "ops@example.com" }),
    "ops@example.com",
  );
});

const sample = {
  customerName: "Alex Reid",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900123",
  bookingReference: "MATNI-260816-AB12",
  tripLabel: "Belfast City Centre → Belfast International Airport",
  pickupLabel: "City Hall, Belfast",
  dropoffLabel: "Belfast International Airport (BFS)",
  airportCode: "BFS",
  flightNumber: "EZY8021",
  tripDate: "2026-08-16",
  tripTime: "11:30",
  returnJourney: false,
  passengers: 2,
  suitcases: 2,
  vehicle: "Standard Saloon (1–4 passengers)",
  estimatedPrice: "£55",
  isAirportTrip: true,
  isEnquiry: false,
};

check("Customer email is Booking Request Received (not confirmed)", () => {
  const email = buildCustomerBookingRequestEmail(sample);
  assert.match(email.subject, /Booking Request Received/);
  assert.match(email.html, /Booking Request Received/);
  assert.match(email.html, /MATNI-260816-AB12/);
  assert.match(email.html, /#071C38/);
  assert.match(email.html, /#2FBF4A/);
  assert.match(email.html, /google-business-logo\.png/);
  assert.match(email.html, /not<\/strong> a confirmed booking/);
  assert.match(email.text, /NOT a confirmed booking/);
  assert.match(email.html, new RegExp(BUSINESS_PHONE_DISPLAY.replace(/\s+/g, "\\s+")));
  assert.match(email.html, new RegExp(BUSINESS_WHATSAPP_HANDLE.replace("@", "\\@")));
  assert.match(email.html, new RegExp(BUSINESS_TAGLINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(email.html, /Rinkel/i);
  assert.match(email.html, /Sunday 16 August 2026 at 11:30 AM/);
  assert.doesNotMatch(email.html, /Child seats/);
  assert.doesNotMatch(email.html, /Notes \/ special/);
});

check("Business email is scan-friendly New Booking Request", () => {
  const email = buildBusinessBookingNotificationEmail(sample);
  assert.match(email.subject, /New Booking Request/);
  assert.match(email.html, /At a glance/);
  assert.match(email.html, /Alex Reid/);
  assert.match(email.html, /07700900123/);
  assert.match(email.html, /EZY8021/);
  assert.match(email.html, /£55/);
  assert.match(email.text, /AT A GLANCE/);
});

check("Empty optional fields are omitted", () => {
  const email = buildCustomerBookingRequestEmail({
    customerName: "Sam",
    bookingReference: "MATNI-1",
    tripDate: "2026-08-16",
    tripTime: "09:00",
    isEnquiry: true,
  });
  assert.doesNotMatch(email.html, /Mobile/);
  assert.doesNotMatch(email.html, /Flight number/);
  assert.doesNotMatch(email.html, /Quoted \/ fixed fare/);
  assert.match(email.html, /not<\/strong> a confirmed booking yet/);
});

check("No FormSubmit references in shared delivery module", async () => {
  const fs = await import("node:fs");
  const delivery = fs.readFileSync("shared/email-delivery.ts", "utf8");
  assert.doesNotMatch(delivery, /formsubmit\.co/i);
  const workerEmail = fs.readFileSync("workers/addresses/src/worker-email.ts", "utf8");
  assert.doesNotMatch(workerEmail, /formsubmit\.co/i);
  const submit = fs.readFileSync("src/lib/submit-booking.ts", "utf8");
  assert.doesNotMatch(submit, /formsubmit\.co/i);
});

console.log(`\nAll Resend booking email checks passed (${BUSINESS_NAME}).`);

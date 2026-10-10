/**
 * Shared customer-email logo.
 * Run: npx tsx scripts/check-email-logo.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildA2aQuotePaymentLinkEmail } from "../shared/a2a-quote-payment-email";
import {
  AIRPORT_COLLECTION_LEAD_MS,
  evaluateAirportPickupReminder,
} from "../shared/airport-pickup-reminder";
import {
  buildCustomerDriverDetailsEmail,
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import {
  BUSINESS_EMAIL_LOGO_ALT,
  BUSINESS_EMAIL_LOGO_HEIGHT,
  BUSINESS_EMAIL_LOGO_URL,
  BUSINESS_EMAIL_LOGO_WIDTH,
  businessEmailLogoHtml,
} from "../shared/business-email";
import {
  buildCustomerCancellationEmails,
  buildCustomerConfirmationEmail,
  buildCustomerRefundConfirmationEmail,
  buildDriverArrivedPickupEmail,
  buildDriverOnTheWayEmail,
  buildGoogleReviewRequestEmail,
  buildTrackingReminderEmail,
  buildUpdatedBookingConfirmationEmail,
} from "../shared/booking-notifications";
import { buildReturnOfferEmail } from "../shared/return-offer-emails";
import {
  buildSavedQuoteFinalReminderEmail,
  buildSavedQuoteFirstReminderEmail,
  buildSavedQuoteInitialEmail,
} from "../shared/saved-quote-emails";
import type { SavedQuoteRecord } from "../shared/saved-quote";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import { buildShortNoticeDeclineEmail } from "../shared/short-notice-decline-email";
import { buildShortNoticeExpiryEmail } from "../shared/short-notice-expiry-email";
import { buildShortNoticePaymentLinkEmail } from "../shared/short-notice-payment-email";
import { buildShortNoticeRequestReceivedEmail } from "../shared/short-notice-request-received-email";
import { buildAssistantQuoteEmail } from "../src/lib/quote-assistant-submit";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertSharedLogo(name: string, html: string, preserved: RegExp): void {
  const logos = html.match(/logo-email\.png/g) ?? [];
  assert.equal(logos.length, 1, `${name} should contain the logo once`);
  assert.equal(html.match(/<img\b/gi)?.length, 1, `${name} should have one image`);
  assert.match(html, new RegExp(BUSINESS_EMAIL_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /alt="My Airport Taxi NI"/);
  assert.match(html, /href="https:\/\/www\.myairporttaxini\.co\.uk\/"/);
  assert.match(html, /max-width:100%/);
  assert.match(html, /width:220px/);
  assert.match(html, /#071c38/);
  assert.match(html, /#2fbf4a/);
  assert.match(html, /color-scheme/);
  assert.match(html, preserved);
  assert.doesNotMatch(html, /google-business-logo\.png/);
  assert.doesNotMatch(html, /cid:/i);
  assert.doesNotMatch(html, /data:image/i);
  assert.match(html, />My Airport Taxi NI</);
  console.log(`OK  ${name}`);
}

const logo = businessEmailLogoHtml();
assert.equal(BUSINESS_EMAIL_LOGO_ALT, "My Airport Taxi NI");
assert.equal(BUSINESS_EMAIL_LOGO_URL, "https://www.myairporttaxini.co.uk/logo-email.png");
assert.equal(BUSINESS_EMAIL_LOGO_WIDTH, 220);
assert.equal(BUSINESS_EMAIL_LOGO_HEIGHT, 170);
assert.equal(logo.match(/<img\b/g)?.length, 1);
assert.match(logo, /color:#ffffff/);
console.log("OK  shared header helper");

assert.equal(AIRPORT_COLLECTION_LEAD_MS, 4 * 60 * 60 * 1000);
console.log("OK  airport collection lead is unchanged");

const confirmation = buildCustomerConfirmationEmail({
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  mobileNumber: "07123456789",
  tripLabel: "Ballyclare → Belfast International (BFS)",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "10:00",
  returnDate: "",
  returnTime: "",
  flightNumber: "EZY123",
  passengers: 2,
  suitcases: 2,
  vehicle: "Estate Car (1–4 passengers)",
  isAirportTrip: true,
  airportCode: "BFS",
  amountPaid: "£45.00",
  paymentReference: "T3TESTREF",
  checkoutReference: "matni-test-ref",
} as never);
assertSharedLogo("booking confirmation", confirmation.html, /Paid in full/);
assert.match(confirmation.html, /£45\.00/);
assert.match(confirmation.subject, /Invoice & booking confirmed/);

const updated = buildUpdatedBookingConfirmationEmail(
  {
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07123456789",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£45.00",
    paymentReference: "T3TESTREF",
    checkoutReference: "matni-test-ref",
  } as never,
  "My Airport Taxi NI",
  { whatChanged: ["Pickup time is now 10:00"], fareNote: "No change to your fare" },
);
assertSharedLogo("updated booking confirmation", updated.html, /Your booking has been updated/);
assert.match(updated.text, /No change to your fare/);
assert.match(updated.text, /Pickup time is now 10:00/);

const savedQuote: SavedQuoteRecord = {
  id: "sq-1",
  reference: "MAT-1001",
  token: "opaque-token",
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  journey: {
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    isAirportTrip: true,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate Car (1–4 passengers)",
    tripLabel: "Ballyclare → Belfast International (BFS)",
  },
  pricing: {
    totalAmount: 45,
    currency: "GBP",
    amountLabel: "£45.00",
  },
  status: "saved",
  createdAt: "2026-08-01T12:00:00.000Z",
  expiresAt: "2026-08-08T12:00:00.000Z",
};
assertSharedLogo(
  "saved quote",
  buildSavedQuoteInitialEmail(savedQuote).html,
  /£45\.00/,
);
assertSharedLogo(
  "saved quote reminder",
  buildSavedQuoteFirstReminderEmail(savedQuote).html,
  /249 Rashee Road, Ballyclare/,
);
assertSharedLogo(
  "saved quote final reminder",
  buildSavedQuoteFinalReminderEmail(savedQuote).html,
  /Belfast International Airport \(BFS\)/,
);

const reminder = evaluateAirportPickupReminder(
  {
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "249 Rashee Road, Ballyclare",
    tripDate: "2026-10-02",
    tripTime: "16:30",
    journeyLeg: "outbound",
    isFromAirport: true,
    airportCode: "BFS",
    outboundAirportAccessOption: "express",
    bookingStatus: "confirmed",
    operationalStatus: "confirmed",
    customerReference: "MAT-1001",
  },
  new Date("2026-10-02T13:00:00.000Z"),
);
assert.equal(reminder.eligible, true, `reminder not due: ${reminder.eligible ? "" : reminder.reason}`);
if (reminder.eligible) {
  assert.equal(reminder.subject, "Important information about your airport collection");
  assertSharedLogo("journey reminder", reminder.html, /MESSAGE US ON WHATSAPP/);
  assert.match(reminder.html, /Important information about your airport collection/);
  assert.doesNotMatch(reminder.text, /logo-email/);
}

assertSharedLogo(
  "tracking reminder",
  buildTrackingReminderEmail(
    {
      customerName: "Alex Example",
      pickupLabel: "249 Rashee Road, Ballyclare",
      dropoffLabel: "Belfast International Airport (BFS)",
      tripDate: "2026-09-01",
      tripTime: "10:00",
      bookingReference: "MAT-1001",
    },
    "https://www.myairporttaxini.co.uk/track/?id=example",
  ).html,
  /Track Your Driver|tracking/i,
);

assertSharedLogo(
  "refund confirmation",
  buildCustomerRefundConfirmationEmail({
    customerName: "Alex Example",
    paymentReference: "T3TESTREF",
    refundAmount: "£45.00",
    tripLabel: "Ballyclare → Belfast International (BFS)",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-09-01",
    tripTime: "10:00",
  }).html,
  /£45\.00/,
);

const cancellation = buildCustomerCancellationEmails({
  customerName: "Alex Example",
  paymentReference: "T3TESTREF",
  refundAmount: "£0.00",
  tripLabel: "Ballyclare → Belfast International (BFS)",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  tripDate: "2026-09-01",
  tripTime: "10:00",
  refundAmountValue: 0,
  originalAmount: "£45.00",
  originalAmountValue: 45,
  cumulativeRefunded: "£0.00",
  remainingPaid: "£45.00",
  cancelBooking: true,
  within24h: true,
  reasonCategory: "customer_cancelled",
  bookingRemainsActive: false,
  actionKind: "cancel",
});
assert.ok(cancellation.customer);
assertSharedLogo("cancellation", cancellation.customer.html, /successfully cancelled/);

assertSharedLogo(
  "review request",
  buildGoogleReviewRequestEmail({ customerName: "Jordan Smith" }, "https://g.page/r/CbzkRdTv-0hNEBM/review")
    .html,
  /Hi Jordan,/,
);

assertSharedLogo(
  "driver arrived",
  buildDriverArrivedPickupEmail({
    customerName: "Alex Example",
    pickupLabel: "249 Rashee Road, Ballyclare",
  }).html,
  /arrived/i,
);

assertSharedLogo(
  "driver on the way",
  buildDriverOnTheWayEmail({ customerName: "Alex Example" }).html,
  /on the way/i,
);

const job = {
  id: "job-1",
  createdAt: "2026-08-01T12:00:00.000Z",
  status: "paid",
  kind: "booking-request",
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  customerMobile: "07123456789",
  tripLabel: "Ballyclare → Belfast International (BFS)",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  returnJourney: false,
  tripDate: "2026-09-01",
  tripTime: "10:00",
  passengers: 2,
  suitcases: 2,
  vehicle: "Estate Car (1–4 passengers)",
  isAirportTrip: true,
  driverFirstName: "Priya",
  driverCarColour: "Black",
  driverCarMake: "Skoda",
  driverCarModel: "Superb",
  driverReg: "ABC1234",
} as BookingJobRecord;

assertSharedLogo(
  "driver details",
  buildCustomerDriverDetailsEmail({ job }).html,
  /Priya/,
);
const driverEmail = buildDriverAssignmentEmail({
  job,
  acceptUrl: "https://www.myairporttaxini.co.uk/driver-accept/?token=example",
});
assert.doesNotMatch(driverEmail.html, /logo-email\.png/);
console.log("OK  driver assignment email left unchanged");

assertSharedLogo(
  "personalised quote",
  buildA2aQuotePaymentLinkEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    pickupLabel: "12 High Street, Lisburn",
    dropoffLabel: "Belfast City Centre",
    tripDate: "2026-09-01",
    tripTime: "10:00",
    amountLabel: "£39.00",
    reference: "A2A-1",
    payUrl: "https://www.myairporttaxini.co.uk/pay/example",
    validityMinutes: 120,
  }).html,
  /£39\.00/,
);

assertSharedLogo(
  "return offer",
  buildReturnOfferEmail({
    direction: "to-airport",
    customerName: "Alex Example",
    airportName: "Belfast International Airport",
    ctaUrl: "https://www.myairporttaxini.co.uk/return-offer/example",
  }).html,
  /return/i,
);

const shortNotice = {
  customerName: "Alex Example",
  customerEmail: "alex@example.com",
  pickupLabel: "249 Rashee Road, Ballyclare",
  dropoffLabel: "Belfast International Airport (BFS)",
  tripDate: "2026-09-01",
  tripTime: "10:00",
  amountLabel: "£45.00",
  reference: "SN-1",
};
assertSharedLogo(
  "short-notice received",
  buildShortNoticeRequestReceivedEmail(shortNotice).html,
  /£45\.00/,
);
assertSharedLogo(
  "short-notice payment",
  buildShortNoticePaymentLinkEmail({
    ...shortNotice,
    payUrl: "https://www.myairporttaxini.co.uk/pay/short-notice/example",
  }).html,
  /£45\.00/,
);
assertSharedLogo(
  "short-notice decline",
  buildShortNoticeDeclineEmail(shortNotice).html,
  /No payment has been taken/,
);
assertSharedLogo(
  "short-notice expiry",
  buildShortNoticeExpiryEmail({
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
  }).html,
  /couldn’t confirm your journey in time/,
);
assertSharedLogo(
  "short-notice alternative",
  buildShortNoticeAlternativeOfferEmail({
    ...shortNotice,
    originalDate: "2026-09-01",
    originalTime: "10:00",
    offeredDate: "2026-09-01",
    offeredTime: "11:30",
    acceptUrl: "https://www.myairporttaxini.co.uk/short-notice/example",
  }).html,
  /11:30/,
);

const assistant = buildAssistantQuoteEmail({
  airportCode: "BFS",
  direction: "to-airport",
  address: "249 Rashee Road, Ballyclare",
  passengers: 2,
  suitcases: 1,
  quotedAmountLabel: "£45.00",
  returnJourney: false,
});
assertSharedLogo("assistant quote", assistant.html, /£45\.00/);
assert.match(assistant.text, /£45\.00/);
assert.doesNotMatch(assistant.text, /logo-email/);

const customerSources = [
  "shared/booking-notifications.ts",
  "shared/saved-quote-emails.ts",
  "shared/return-offer-emails.ts",
  "shared/airport-pickup-reminder.ts",
  "shared/booking-job.ts",
  "shared/a2a-quote-payment-email.ts",
  "shared/short-notice-request-received-email.ts",
  "shared/short-notice-expiry-email.ts",
  "shared/short-notice-payment-email.ts",
  "shared/short-notice-decline-email.ts",
  "shared/short-notice-alternative-email.ts",
  "src/lib/quote-assistant-submit.ts",
];
for (const rel of customerSources) {
  const source = read(rel);
  const worker = rel.startsWith("shared/")
    ? read(rel.replace("shared/", "workers/addresses/shared/"))
    : null;
  assert.match(source, /businessEmailLogoHtml/);
  assert.doesNotMatch(source, /google-business-logo\.png/);
  if (worker != null) {
    assert.equal(worker, source, `${rel} is out of sync with the worker copy`);
  }
}
assert.match(read("workers/addresses/src/google-calendar.ts"), /google-business-logo\.png/);
assert.doesNotMatch(read("shared/driver-vehicle.ts"), /logo-email\.png/);
console.log("OK  worker copies match and out-of-scope mail is unchanged");

console.log("\nAll customer email logo checks passed.");

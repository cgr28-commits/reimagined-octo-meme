/**
 * WhatsApp and SMS share one customer message. No live send, booking, or SumUp call.
 * Run: npx tsx scripts/check-customer-message-channels.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppMessage,
} from "../shared/arrival-whatsapp";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import {
  bookingConfirmationThankYouHeading,
  customerGreetingFirstName,
} from "../shared/customer-first-name";
import {
  buildCustomerSmsHref,
  customerChannelLinks,
  googleReviewCustomerMessage,
  messageBodyFromCustomerChannelHref,
} from "../shared/customer-message-channel";
import { DEFAULT_GOOGLE_REVIEW_URL } from "../shared/business-links";
import {
  buildTipPageUrl,
  optionalTipMessage,
  optionalTipWhatsAppMessage,
  TIPPED_IN_PERSON_MESSAGE,
  tipWhatsAppMessage,
} from "../shared/journey-tip";

const MOBILE = "07700 900000";
const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertSameChannelCopy(message: string, mobile = MOBILE) {
  const links = customerChannelLinks(mobile, message);
  assert.ok(links.whatsAppHref);
  assert.ok(links.smsHref);
  assert.equal(messageBodyFromCustomerChannelHref(links.whatsAppHref), message);
  assert.equal(messageBodyFromCustomerChannelHref(links.smsHref), message);
  assert.equal(links.whatsAppHref, links.smsHref ? links.message && links.whatsAppHref : links.whatsAppHref);
  return links;
}

console.log("=== First name ===");
assert.equal(customerGreetingFirstName("Sarah Johnson"), "Sarah");
assert.equal(customerGreetingFirstName("Sarah"), "Sarah");
assert.equal(customerGreetingFirstName("  Sarah   Johnson  "), "Sarah");
assert.equal(customerGreetingFirstName("   "), "");
assert.equal(customerGreetingFirstName(""), "");
assert.equal(customerGreetingFirstName(undefined), "");
assert.equal(customerGreetingFirstName(null), "");
assert.equal(customerGreetingFirstName("undefined"), "");
assert.equal(customerGreetingFirstName("null"), "");
assert.equal(bookingConfirmationThankYouHeading("Sarah Johnson"), "Thank you, Sarah");
assert.equal(bookingConfirmationThankYouHeading(""), "Thank you");
assert.equal(bookingConfirmationThankYouHeading(null), "Thank you");
console.log("OK  first name and thank-you heading");

console.log("\n=== SMS link ===");
{
  const body = "We're here.\nFare is £6 & waiting.\nhttps://www.myairporttaxini.co.uk/tip/?t=abc";
  const from07 = buildCustomerSmsHref("07700 900000", body);
  const fromPlus = buildCustomerSmsHref("+44 7700 900000", body);
  const spaced = buildCustomerSmsHref("07700 900 000", body);
  assert.ok(from07 && fromPlus && spaced);
  assert.match(from07, /^sms:\+447700900000\?&body=/);
  assert.match(fromPlus, /^sms:\+447700900000\?&body=/);
  assert.match(spaced, /^sms:\+447700900000\?&body=/);
  for (const href of [from07, fromPlus, spaced]) {
    const decoded = messageBodyFromCustomerChannelHref(href);
    assert.equal(decoded, body);
    assert.match(decoded, /'/);
    assert.match(decoded, /£/);
    assert.match(decoded, /&/);
    assert.match(decoded, /\n/);
    assert.match(decoded, /https:\/\/www\.myairporttaxini\.co\.uk\/tip\/\?t=abc/);
  }
  assert.equal(buildCustomerSmsHref("", body), null);
  assert.equal(buildCustomerSmsHref("123", body), null);
  console.log("OK  07, +44, spaces, apostrophe, pound, ampersand, line break, URL");
}

console.log("\n=== Driver on the way ===");
{
  const message = buildDriverOnTheWayWhatsAppMessage({
    customerName: "Sarah Johnson",
    bookedPickupTime: "14:30",
    driverFirstName: "Colin",
    partialRegistration: "ABC",
    driverMobile: "07000000000",
  });
  assert.match(message, /Hi Sarah,/);
  assert.match(message, /14:30/);
  assert.match(message, /your driver is now on the way/);
  assert.match(message, /We may also share a live location/);
  assert.doesNotMatch(message, /\bI\b|\bI'm\b|my car|Colin|ABC|07000000000/);
  assertSameChannelCopy(message);
  console.log("OK  on-the-way copy is identical on WhatsApp and SMS");
}

console.log("\n=== Driver arrived ===");
{
  const street = buildArrivedPickupWhatsAppMessage({ isAirportPickup: false });
  assert.match(street, /Your driver is now at your pickup location/);
  assertSameChannelCopy(street);

  const airport = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: true,
    pickupLabel: "Dublin Airport",
    airportCode: "DUB",
    dublinArrivalTerminal: "T2",
  });
  assert.match(airport, /Airport Pick-Up/);
  assert.match(airport, /Terminal 2/);
  assert.match(airport, /maximum stay of 10 minutes/);
  assertSameChannelCopy(airport);
  console.log("OK  street and Dublin arrival copy stay intact and match across channels");
}

console.log("\n=== Tip — not yet tipped ===");
{
  const token = "a".repeat(32);
  const before = token;
  const message = tipWhatsAppMessage({ tipDecision: "no", tipToken: token });
  assert.ok(message);
  assert.equal(optionalTipWhatsAppMessage(buildTipPageUrl(token)), optionalTipMessage(buildTipPageUrl(token)));
  const url = `https://www.myairporttaxini.co.uk/tip/?t=${token}`;
  assert.equal(message.match(new RegExp(token, "g"))?.length, 1);
  assert.match(message, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(message, /sumup\.com|hosted_checkout|checkoutId/i);
  const links = assertSameChannelCopy(message);
  assert.equal(
    messageBodyFromCustomerChannelHref(links.whatsAppHref!),
    messageBodyFromCustomerChannelHref(links.smsHref!),
  );
  assert.equal(before, token);
  console.log("OK  one tip token and one /tip/?t= URL on both channels");
}

console.log("\n=== Tip — already tipped ===");
{
  const message = tipWhatsAppMessage({ tipDecision: "yes" });
  assert.equal(message, TIPPED_IN_PERSON_MESSAGE);
  assert.doesNotMatch(message ?? "", /https?:\/\//);
  assert.match(message ?? "", /kind tip/);
  assertSameChannelCopy(message ?? "");
  console.log("OK  thank-you tip message has no payment URL");
}

console.log("\n=== Google review ===");
{
  const message = googleReviewCustomerMessage("Sarah Johnson");
  assert.ok(message);
  assert.match(message, /^Hi Sarah,/);
  assert.equal(message.match(new RegExp(DEFAULT_GOOGLE_REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1);
  assert.doesNotMatch(message, /discount|reward|%\s*off/i);
  assertSameChannelCopy(message);
  const noName = googleReviewCustomerMessage("  ");
  assert.match(noName ?? "", /^Hi,/);
  assert.doesNotMatch(noName ?? "", /undefined|null/);
  assert.equal(googleReviewCustomerMessage("Sarah", "https://example.invalid/ChIJXXXXXXXX"), null);
  console.log("OK  review uses the stored Google URL, or stays unset");
}

console.log("\n=== Booking confirmation heading ===");
{
  const email = buildCustomerConfirmationEmail({
    customerName: "Sarah Johnson",
    customerEmail: "sarah@example.com",
    mobileNumber: MOBILE,
    tripLabel: "Belfast → Belfast International",
    pickupLabel: "1 Test Street",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-10-02",
    tripTime: "09:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 1,
    suitcases: 1,
    vehicle: "Saloon Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£40.00",
    paymentReference: "TESTREF",
    checkoutReference: "matni-test",
  });
  assert.match(email.html, /Thank you, Sarah</);
  assert.doesNotMatch(email.html, /Thank you, Sarah Johnson/);
  assert.match(email.html, /Sarah Johnson/);
  assert.match(email.text, /Dear Sarah Johnson/);
  assert.match(email.text, /Customer: Sarah Johnson/);

  const unnamed = buildCustomerConfirmationEmail({
    customerName: "   ",
    customerEmail: "sarah@example.com",
    mobileNumber: MOBILE,
    tripLabel: "Belfast → Belfast International",
    pickupLabel: "1 Test Street",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-10-02",
    tripTime: "09:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 1,
    suitcases: 1,
    vehicle: "Saloon Car (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    amountPaid: "£40.00",
    paymentReference: "TESTREF",
    checkoutReference: "matni-test",
  });
  assert.match(unnamed.html, />Thank you</);
  assert.doesNotMatch(unnamed.html, /Thank you,/);
  assert.doesNotMatch(unnamed.html, /Thank you, undefined/);
  console.log("OK  heading uses the first name; booking details keep the full name");
}

console.log("\n=== Owner dashboard wiring ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  const chooser = read("src/components/CustomerMessageChannelChooser.tsx");
  assert.match(panel, /Request Google review/);
  assert.match(panel, /Send arrival message/);
  assert.match(panel, /googleReviewCustomerMessage\(booking\.customerName\)/);
  assert.match(panel, /result\.tip\?\.whatsappMessage/);
  assert.match(panel, /result\.tip\.openWhatsApp/);
  assert.doesNotMatch(panel, /generateTipToken|createSumUp|payments\.sumup/);
  assert.match(chooser, /buildCustomerWhatsAppHref\(offer\.mobile, offer\.message\)/);
  assert.match(chooser, /buildCustomerSmsHref\(offer\.mobile, offer\.message\)/);
  assert.doesNotMatch(chooser, /twilio|fetch\(/);
  const reviewHandlers = read("workers/addresses/src/review-request-handlers.ts");
  assert.match(reviewHandlers, /sendReviewRequestEmail/);
  console.log("OK  manual channel chooser sits beside the existing email review request");
}

console.log("\nAll customer message channel checks passed.");

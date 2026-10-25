/**
 * Owner dashboard "WhatsApp" / "Email customer" drafts carry the booking details.
 * Run: npx tsx scripts/check-owner-customer-contact-message.ts
 */

import assert from "node:assert/strict";
import {
  ownerCustomerBookingMessage,
  ownerCustomerContactActions,
  ownerCustomerEmailHref,
} from "../shared/owner-job-actions";

const details = {
  customerName: "Alex Example",
  customerReference: "mat-4827",
  tripDate: "2026-11-14",
  tripTime: "05:30",
  pickupLabel: "249 Rashee Road, Ballyclare BT39 9JA",
  dropoffLabel: "Belfast International Airport (BFS)",
  passengers: 2,
  suitcases: 2,
  flightNumber: "ezy123",
  cashDueGbp: 35.1,
};

const message = ownerCustomerBookingMessage(details);
assert.equal(
  message,
  [
    "Hi Alex,",
    "",
    "Here are your booking details with My Airport Taxi NI:",
    "",
    "Booking ref: MAT-4827",
    "Date: 14-11-2026",
    "Pickup time: 05:30",
    "From: 249 Rashee Road, Ballyclare BT39 9JA",
    "To: Belfast International Airport (BFS)",
    "Passengers: 2 · Suitcases: 2",
    "Flight: EZY123",
    "Cash due on the day: £35.10",
  ].join("\n"),
);
assert.match(ownerCustomerBookingMessage({ ...details, returnLeg: true }), /your return journey details/);
assert.doesNotMatch(ownerCustomerBookingMessage({ customerName: "Sam", cashDueGbp: 0 }), /Cash due|Booking ref|Flight/);
console.log("OK  booking details message");

const contact = ownerCustomerContactActions("07700 900123", message);
assert.ok(contact);
assert.equal(contact.telHref, "tel:+447700900123");
assert.ok(contact.whatsAppHref.startsWith("https://wa.me/447700900123?text="));
assert.equal(decodeURIComponent(contact.whatsAppHref.split("?text=")[1]!), message);
assert.equal(ownerCustomerContactActions("07700 900123")?.whatsAppHref, "https://wa.me/447700900123");
console.log("OK  WhatsApp link pre-fills the booking details");

const mailto = ownerCustomerEmailHref("alex@example.com", details);
assert.ok(mailto?.startsWith("mailto:alex%40example.com?subject="));
const params = new URLSearchParams(mailto!.split("?")[1]);
assert.equal(params.get("subject"), "Your booking MAT-4827 — My Airport Taxi NI");
assert.equal(params.get("body"), message.replace(/\n/g, "\r\n"));
assert.equal(ownerCustomerEmailHref("", details), null);
console.log("OK  email link pre-fills subject and booking details");

console.log("\nAll owner customer contact message checks passed.");

import fs from "node:fs";
import { buildMeetGreetOfferEmail, type MeetGreetUpgrade } from "../shared/meet-greet-upgrade";
import { buildUpdatedBookingConfirmationEmail } from "../shared/booking-notifications";
import { paidBookingRecordToReceipt } from "../shared/paid-booking-canonical";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
const dir = process.env.MEET_GREET_PREVIEW_DIR || new URL("../docs/review/meet-greet/", import.meta.url).pathname;
fs.mkdirSync(dir, { recursive: true });
const base: MeetGreetUpgrade = { token: "a".repeat(64), paymentReference: "EXAMPLE-ORIGINAL", customerReference: "MAT-1234", leg: "outbound", airport: "BFS", amount: 15, pickupDate: "2026-11-06", pickupTime: "14:00", pickupLabel: "Belfast International Airport", dropoffLabel: "Belfast City Hall" };
const pages: Array<{name: string; html: string; text?: string; subject?: string}> = [];
for (const [airport, pickupLabel, amount] of [["BFS", "Belfast International Airport", 15], ["BHD", "Belfast City Airport", 15], ["DUB", "Dublin Airport", 25]] as const) {
 const email = buildMeetGreetOfferEmail({ ...base, airport, pickupLabel, amount }, "Alex Example");
 fs.writeFileSync(`${dir}/${airport.toLowerCase()}-offer.html`, email.html);
 pages.push({name: `${airport} offer email`, html: email.html, text: email.text, subject: email.subject });
}
const booking: PaidBookingRecord = { paymentReference: base.paymentReference, customerReference: base.customerReference, checkoutId: "example-original-checkout", amount: 69, amountPaidLabel: "£69.00", currency: "GBP", customerName: "Alex Example", customerEmail: "alex@example.com", mobileNumber: "07700 900123", tripLabel: "Airport pickup", pickupLabel: base.pickupLabel, dropoffLabel: base.dropoffLabel, tripDate: base.pickupDate, tripTime: base.pickupTime, returnJourney: false, passengers: 2, suitcases: 2, flightNumber: "EX123", vehicle: "Standard Saloon (1–4 passengers)", isAirportTrip: true, airportCode: "BFS", isFromAirport: true, airportAccessOption: "meet-greet", outboundAirportAccessOption: "meet-greet", status: "confirmed", createdAt: "2026-10-14T16:00:00Z", calendarEventIds: [] };
const updated = buildUpdatedBookingConfirmationEmail(paidBookingRecordToReceipt(booking), "My Airport Taxi NI", { whatChanged: ["Meet & Greet selected for your BFS collection", "Upgrade payment received: £15.00 — booking MAT-1234"] });
fs.writeFileSync(`${dir}/updated-confirmation.html`, updated.html);
pages.push({ name: "Updated confirmation", html: updated.html, text: updated.text, subject: updated.subject });
fs.writeFileSync(`${dir}/emails.json`, JSON.stringify(pages));
console.log(dir);

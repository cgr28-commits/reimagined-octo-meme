/**
 * Save-to-contacts vCard + confirmation email CTA.
 * Run: npx tsx scripts/check-save-to-contacts.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import {
  CONTACT_VCARD_PUBLIC_PATH,
  contactVCardPublicUrl,
} from "../shared/business-links";
import { CONTACT_VCARD, CONTACT_VCARD_FILENAME } from "../shared/contact-vcard";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== vCard content (public business only) ===");
{
  assert.equal(CONTACT_VCARD_FILENAME, "My-Airport-Taxi-NI.vcf");
  assert.match(CONTACT_VCARD, /^BEGIN:VCARD/);
  assert.match(CONTACT_VCARD, /VERSION:3\.0/);
  assert.match(CONTACT_VCARD, /FN:My Airport Taxi NI/);
  assert.match(CONTACT_VCARD, /ORG:My Airport Taxi NI/);
  assert.doesNotMatch(CONTACT_VCARD, /TEL;|028\s*9602\s*2952|\+442896022952/);
  assert.match(CONTACT_VCARD, /EMAIL;TYPE=WORK:bookings@myairporttaxini\.co\.uk/);
  assert.match(CONTACT_VCARD, /URL:https:\/\/www\.myairporttaxini\.co\.uk/);
  assert.match(CONTACT_VCARD, /NOTE:Belfast & Northern Ireland Airport Transfers/);
  assert.doesNotMatch(CONTACT_VCARD, /7549815538|TYPE=CELL|WhatsApp|OWNER_ACCESS_KEY|DRIVER_ACCESS_KEY/);
  assert.match(CONTACT_VCARD, /PHOTO;ENCODING=b;TYPE=JPEG/);

  const publicFile = read("public/My-Airport-Taxi-NI.vcf");
  assert.equal(publicFile, CONTACT_VCARD);
  const legacy = read("public/my-airport-taxi-ni.vcf");
  assert.equal(legacy, CONTACT_VCARD);
  console.log("OK  vCard 3.0 fields + logo photo; no personal mobile");
}

console.log("\n=== Production URL (not Worker host) ===");
{
  assert.equal(CONTACT_VCARD_PUBLIC_PATH, "/My-Airport-Taxi-NI.vcf");
  assert.equal(
    contactVCardPublicUrl(),
    "https://www.myairporttaxini.co.uk/My-Airport-Taxi-NI.vcf",
  );
  assert.doesNotMatch(contactVCardPublicUrl(), /workers\.dev/);
  console.log("OK  email/public URL uses production domain");
}

console.log("\n=== Confirmation email includes Save to Contacts ===");
{
  const email = buildCustomerConfirmationEmail({
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
  });

  assert.match(email.html, /Save us for your next journey/);
  assert.match(email.html, /Save My Airport Taxi NI to Contacts/);
  assert.match(email.html, /https:\/\/www\.myairporttaxini\.co\.uk\/My-Airport-Taxi-NI\.vcf/);
  assert.doesNotMatch(email.html, /workers\.dev/);
  assert.match(email.text, /SAVE US FOR YOUR NEXT JOURNEY/);
  assert.match(email.text, /My-Airport-Taxi-NI\.vcf/);

  const withTrack = buildCustomerConfirmationEmail(
    {
      customerName: "Alex Example",
      customerEmail: "alex@example.com",
      mobileNumber: "07123456789",
      tripLabel: "Test trip",
      pickupLabel: "Pickup",
      dropoffLabel: "Dropoff",
      returnJourney: false,
      tripDate: "2026-09-01",
      tripTime: "10:00",
      returnDate: "",
      returnTime: "",
      flightNumber: "",
      passengers: 1,
      suitcases: 1,
      vehicle: "Saloon",
      isAirportTrip: false,
      amountPaid: "£40.00",
      paymentReference: "T3TRACK",
    },
    "My Airport Taxi NI",
    { trackUrl: "https://www.myairporttaxini.co.uk/track/?id=abc123" },
  );
  assert.match(withTrack.html, /Save My Airport Taxi NI to Contacts/);
  assert.doesNotMatch(withTrack.html, /Track Your Driver/);
  assert.doesNotMatch(withTrack.html, /LIVE DRIVER TRACKING/i);
  console.log("OK  confirmation HTML/text CTA; track section retired");
}

console.log("\n=== Resend / confirmation builders still imported ===");
{
  const resend = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(resend, /buildCustomerConfirmationEmail|buildUpdatedBookingConfirmationEmail/);
  console.log("OK  paid-booking handlers keep confirmation email builders");
}

console.log("\n=== Worker + Next MIME / filename ===");
{
  const worker = read("workers/addresses/src/index.ts");
  assert.match(worker, /contact\.vcf/);
  assert.match(worker, /text\/vcard/);
  assert.match(worker, /My-Airport-Taxi-NI\.vcf/);
  assert.doesNotMatch(worker, /OWNER_ACCESS_KEY.*contact\.vcf|contact\.vcf[\s\S]{0,200}ownerAuthorized/);

  const nextConfig = read("next.config.ts");
  assert.match(nextConfig, /text\/vcard/);
  assert.match(nextConfig, /My-Airport-Taxi-NI\.vcf/);
  console.log("OK  Worker + Next serve text/vcard with canonical filename");
}

console.log("\n=== Booking confirmation page secondary CTA ===");
{
  const page = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
  assert.match(page, /Save us for your next journey/);
  assert.match(page, /Save My Airport Taxi NI to Contacts/);
  assert.match(page, /saveToContactsHref/);
  console.log("OK  confirmation page has secondary Save to Contacts");
}

console.log("\nAll save-to-contacts checks passed.");

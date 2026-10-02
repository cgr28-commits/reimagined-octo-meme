/**
 * Hidden owner BCC for customer transactional email.
 * Run: npx tsx scripts/check-owner-email-bcc.ts
 *
 * Does not send email or call a provider.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUSINESS_MAILBOX } from "../shared/business-email";
import {
  customerTransactionBcc,
  resendCustomerPayload,
  resolveOwnerEmailCopyAddress,
} from "../shared/owner-email-copy";
import {
  buildAirportPickupReminderMessage,
  evaluateAirportPickupReminder,
} from "../shared/airport-pickup-reminder";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const CUSTOMER = "sarah@example.com";
const SUBJECT = "Important information about your airport collection";
const TEXT = "Hi Sarah,\n\nYour airport collection with My Airport Taxi NI is coming up today.";
const HTML = "<p>Hi Sarah,</p>";

console.log("=== Owner copy address ===");
{
  const fallback = resolveOwnerEmailCopyAddress({});
  assert.equal(fallback.address, BUSINESS_MAILBOX);
  assert.equal(fallback.warning, undefined);

  const override = resolveOwnerEmailCopyAddress({
    OWNER_EMAIL_COPY_ADDRESS: "owner-copy@example.com",
    BOOKING_NOTIFICATION_EMAIL: "notify@example.com",
  });
  assert.equal(override.address, "owner-copy@example.com");

  const invalidOverride = resolveOwnerEmailCopyAddress({
    OWNER_EMAIL_COPY_ADDRESS: "not-an-email",
    BOOKING_NOTIFICATION_EMAIL: "notify@example.com",
  });
  assert.equal(invalidOverride.address, "notify@example.com");

  const bookingTo = resolveOwnerEmailCopyAddress({
    BOOKING_TO_EMAIL: "bookings-to@example.com",
  });
  assert.equal(bookingTo.address, "bookings-to@example.com");

  const missing = resolveOwnerEmailCopyAddress({}, { canonical: "" });
  assert.equal(missing.address, null);
  assert.match(missing.warning ?? "", /not configured/);

  const invalidOnly = resolveOwnerEmailCopyAddress(
    { OWNER_EMAIL_COPY_ADDRESS: "broken" },
    { canonical: null },
  );
  assert.equal(invalidOnly.address, null);
  assert.match(invalidOnly.warning ?? "", /invalid/);
  console.log("OK  canonical mailbox, override, and invalid values");
}

console.log("=== Resend payload is one customer message plus BCC ===");
{
  const copy = customerTransactionBcc({}, CUSTOMER);
  assert.equal(copy.bcc, BUSINESS_MAILBOX);

  const payload = resendCustomerPayload({
    from: "My Airport Taxi NI <bookings@myairporttaxini.co.uk>",
    to: CUSTOMER,
    subject: SUBJECT,
    text: TEXT,
    html: HTML,
    replyTo: BUSINESS_MAILBOX,
    bcc: copy.bcc,
  });
  assert.deepEqual(payload.to, [CUSTOMER]);
  assert.deepEqual(payload.bcc, [BUSINESS_MAILBOX]);
  assert.equal(payload.subject, SUBJECT);
  assert.equal(payload.text, TEXT);
  assert.equal(payload.html, HTML);
  assert.equal("cc" in payload, false);
  assert.equal(JSON.stringify(payload.to).includes(BUSINESS_MAILBOX), false);

  const sameInbox = customerTransactionBcc({}, BUSINESS_MAILBOX);
  assert.equal(sameInbox.bcc, null);
  const withoutCopy = resendCustomerPayload({
    from: "My Airport Taxi NI <bookings@myairporttaxini.co.uk>",
    to: CUSTOMER,
    subject: SUBJECT,
    text: TEXT,
    replyTo: BUSINESS_MAILBOX,
    bcc: null,
  });
  assert.deepEqual(withoutCopy.to, [CUSTOMER]);
  assert.equal("bcc" in withoutCopy, false);
  assert.equal("cc" in withoutCopy, false);
  assert.equal(withoutCopy.subject, SUBJECT);
  assert.equal(withoutCopy.text, TEXT);
  console.log("OK  customer is the only To recipient; missing BCC still builds the customer payload");
}

console.log("=== Collection email does not reveal the owner inbox ===");
{
  const decision = evaluateAirportPickupReminder(
    {
      customerName: "Sarah Johnson",
      customerEmail: CUSTOMER,
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      tripDate: "2026-10-02",
      tripTime: "18:00",
      isFromAirport: true,
      outboundAirportAccessOption: "express",
      bookingStatus: "confirmed",
      customerReference: "MAT-4827",
    },
    new Date("2026-10-02T13:00:00.000Z"),
  );
  assert.equal(decision.eligible, true);
  if (decision.eligible) {
    assert.equal(decision.subject, SUBJECT);
    assert.equal(decision.text.includes(BUSINESS_MAILBOX), false);
    assert.equal(decision.html.includes(BUSINESS_MAILBOX), false);
    assert.equal(decision.html.includes("Rinkel"), false);
    assert.match(decision.html, /tel:\+442896022952/);
    assert.match(decision.html, />MESSAGE US ON WHATSAPP</);
  }
  const message = buildAirportPickupReminderMessage({
    customerName: "Sarah Johnson",
    pickupLabel: "Belfast International Airport",
    tripTime: "18:00",
    outboundAirportAccessOption: "express",
    customerReference: "MAT-4827",
  });
  assert.equal(message?.includes(BUSINESS_MAILBOX), false);
  console.log("OK  collection email body hides the owner address");
}

console.log("=== Customer sends opt in; internal sends do not ===");
{
  const email = read("workers/addresses/src/worker-email.ts");
  assert.match(email, /customerDelivery: true/);
  assert.match(email, /ownerCopy !== false/);
  assert.match(email, /Owner BCC was not accepted — sending the customer email without BCC/);
  assert.match(email, /trySendBrandedCustomerEmail/);
  assert.match(email, /trySendResendOnlyCustomerEmail/);
  assert.match(email, /trySendOwnerOperationalEmail/);
  const branded = email.slice(email.indexOf("export async function trySendBrandedCustomerEmail"));
  assert.match(branded, /customerDelivery: true/);
  const operational = email.slice(
    email.indexOf("export async function trySendOwnerOperationalEmail"),
    email.indexOf("export async function trySendBrandedCustomerEmail"),
  );
  assert.doesNotMatch(operational, /customerDelivery:\s*true/);

  const daily = read("workers/addresses/src/daily-quote-report.ts");
  assert.match(daily, /trySendResendOnlyEmail/);
  assert.doesNotMatch(daily, /trySendResendOnlyCustomerEmail|customerDelivery/);

  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /await trySendBrandedCustomerEmail/);
  assert.doesNotMatch(finalize, /\[Bookings copy\]/);

  const paid = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(paid, /bookingsCopySent: Boolean\(customerEmailResult\.ownerBcc\)/);
  assert.doesNotMatch(paid, /\[Bookings copy\]/);

  const a2a = read("workers/addresses/src/a2a-quote-handlers.ts");
  assert.match(a2a, /trySendResendOnlyCustomerEmail/);
  assert.doesNotMatch(a2a, /\[Bookings copy\]/);

  const driverProfile = read("workers/addresses/src/driver-vehicle-handlers.ts");
  assert.match(driverProfile, /ownerCopy: false/);

  const customerPaths = [
    "workers/addresses/src/finalize-paid-checkout.ts",
    "workers/addresses/src/paid-booking-handlers.ts",
    "workers/addresses/src/send-updated-confirmation.ts",
    "workers/addresses/src/journey-handlers.ts",
    "workers/addresses/src/refund-handlers.ts",
    "workers/addresses/src/review-request-handlers.ts",
    "workers/addresses/src/tracking-reminder-handlers.ts",
    "workers/addresses/src/saved-quote-handlers.ts",
    "workers/addresses/src/return-offer-handlers.ts",
    "workers/addresses/src/short-notice-handlers.ts",
    "workers/addresses/src/a2a-quote-handlers.ts",
    "workers/addresses/src/airport-pickup-reminder-handlers.ts",
  ];
  for (const rel of customerPaths) {
    const source = read(rel);
    assert.match(
      source,
      /trySendBrandedCustomerEmail|trySendResendOnlyCustomerEmail/,
      rel,
    );
  }

  const internalPaths = [
    "workers/addresses/src/daily-quote-report.ts",
    "workers/addresses/src/booking-job-handlers.ts",
    "workers/addresses/src/driver-assignment-handlers.ts",
  ];
  for (const rel of internalPaths) {
    const source = read(rel);
    assert.doesNotMatch(source, /trySendBrandedCustomerEmail|trySendResendOnlyCustomerEmail/, rel);
  }
  console.log("OK  customer paths use the transactional sender; internal mail does not");
}

console.log("\nAll owner email BCC checks passed.");

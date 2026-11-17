/**
 * Contact page (owner, 17 Nov 2026): no telephone number, and an email contact page whose form
 * reaches the bookings inbox through the existing owner-inbox route (name + message only).
 * Run: npx tsx scripts/check-contact-email.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_SEND_FAILED,
  contactMessageEmailBody,
  sendContactMessage,
  validateContactMessage,
  type ContactMessage,
} from "../src/lib/contact-message";
import { validateUnpaidBookingRequest } from "../shared/booking-request-validation";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const good: ContactMessage = {
  name: " Jane Smith ",
  email: " jane@example.com ",
  bookingReference: " MATNI-1234 ",
  message: " Can you collect us from Belfast International on Friday at 9pm? ",
};

console.log("=== 1. Contact page shows no telephone number ===");
{
  const contact = read("src/app/contact/ContactCardClient.tsx");
  assert.doesNotMatch(contact, /officeLandline/, "no landline number or tel: link on the Contact page");
  assert.doesNotMatch(contact, /href=\{?`?tel:/, "no tel: links on the Contact page");
  assert.doesNotMatch(contact, /Landline/);
  assert.match(contact, /<StandaloneBrandBar showCall=\{false\} \/>/, "no Call Us pill in the Contact page header");
  // The other ways to get in touch stay.
  assert.match(contact, /Get a quote &amp; book/);
  assert.match(contact, /whatsAppChatUrl\(\)/);
  assert.match(contact, /@\{SITE\.whatsappUsername\}/);
  assert.match(contact, /Save to contacts/);

  const bar = read("src/components/StandaloneBrandBar.tsx");
  assert.match(bar, /showCall = true/, "other standalone pages keep the Call Us button by default");
  assert.match(bar, /\{showCall \? <CallUsButton variant="header" \/> : null\}/);
  console.log("OK  no landline card, tel: link or Call Us pill; quote, WhatsApp and Save to contacts remain");
}

console.log("\n=== 2. Email card opens the email contact page ===");
{
  const contact = read("src/app/contact/ContactCardClient.tsx");
  assert.match(contact, /const EMAIL_CONTACT_PATH = "\/contact\/email\/";/);
  assert.match(contact, /href=\{EMAIL_CONTACT_PATH\}/);
  assert.match(contact, /Send us a message/);
  assert.doesNotMatch(contact, /mailto:/, "the Email card opens the form, not the visitor's mail app");

  const page = read("src/app/contact/email/page.tsx");
  assert.match(page, /canonical: "\/contact\/email\/"/);
  assert.match(page, /robots: \{ index: false, follow: true \}/, "form page stays out of search results");
  assert.match(page, /<StandaloneBrandBar showCall=\{false\} \/>/);
  assert.match(page, /data-customer-standalone/);
  assert.match(page, /mailto:\$\{SITE\.email\}/, "direct email address offered as an alternative");
  assert.doesNotMatch(page, /officeLandline|tel:/);
  assert.doesNotMatch(read("scripts/generate-sitemap.mjs"), /\/contact\/email\//, "not listed in the sitemap");

  const form = read("src/app/contact/email/EmailContactClient.tsx");
  assert.doesNotMatch(form, /officeLandline|tel:/);
  assert.match(form, /name="fax_only"/, "hidden trap for automated form-fillers");
  assert.match(form, /tabIndex=\{-1\}/);
  console.log("OK  Email card links to /contact/email/; the page is noindex, off the sitemap, with no phone number");
}

console.log("\n=== 3. Form validation ===");
{
  assert.equal(validateContactMessage(good), null);
  assert.equal(validateContactMessage({ ...good, bookingReference: "" }), null, "booking reference is optional");
  assert.equal(validateContactMessage({ ...good, name: " J " })?.field, "name");
  assert.equal(validateContactMessage({ ...good, name: "x".repeat(81) })?.field, "name");
  for (const email of ["", "jane", "jane@", "jane@example", "jane @example.com", `${"a".repeat(250)}@example.com`]) {
    assert.equal(validateContactMessage({ ...good, email })?.field, "email", `email "${email.slice(0, 20)}" must be rejected`);
  }
  assert.equal(validateContactMessage({ ...good, bookingReference: "x".repeat(41) })?.field, "bookingReference");
  assert.equal(validateContactMessage({ ...good, message: "Hi" })?.field, "message");
  assert.equal(validateContactMessage({ ...good, message: "         " })?.field, "message");
  assert.equal(validateContactMessage({ ...good, message: "x".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) })?.field, "message");
  assert.equal(validateContactMessage({ ...good, message: "x".repeat(CONTACT_MESSAGE_MAX_LENGTH) }), null);
  // Problems are reported top to bottom, one at a time.
  assert.equal(validateContactMessage({ name: "", email: "", bookingReference: "", message: "" })?.field, "name");
  console.log("OK  name, email and message are required; reference is optional; limits enforced");
}

console.log("\n=== 4. The email the owner receives ===");
{
  const body = contactMessageEmailBody(good);
  assert.match(body, /^WEBSITE CONTACT FORM — a message from the Contact page\. Not a booking\./);
  assert.match(body, /\nName: Jane Smith\nReply to: jane@example\.com\nBooking reference: MATNI-1234\n/);
  assert.match(body, /\nMessage:\nCan you collect us from Belfast International on Friday at 9pm\?\n/);
  assert.match(body, /No booking or payment has been made\.$/);
  assert.doesNotMatch(contactMessageEmailBody({ ...good, bookingReference: "  " }), /Booking reference/);
  console.log("OK  clearly marked as a website message, with the reply address and optional booking reference");
}

async function checkSending(): Promise<void> {
  console.log("\n=== 5. Sending ===");
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const respond = (status: number, payload: unknown): typeof fetch =>
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });
    }) as typeof fetch;

  await sendContactMessage(good, respond(200, { ok: true, bookingReference: "MATNI-9", emailSent: true }));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/bookings$/, "uses the existing owner-inbox route");
  assert.equal(calls[0].init.method, "POST");
  const sent = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(Object.keys(sent).sort(), ["customerName", "message", "sendEmail"], "no booking, tour or payment payload");
  assert.equal(sent.customerName, "Jane Smith (website message)");
  assert.equal(sent.sendEmail, true);
  assert.equal(sent.message, contactMessageEmailBody(good));
  // The Worker accepts a name + message enquiry without the booking-form checks.
  assert.deepEqual(validateUnpaidBookingRequest({ customerName: sent.customerName, message: sent.message }), { ok: true });

  // Never report success unless the Worker confirms the email went out.
  for (const [status, payload] of [
    [200, { ok: true, emailSent: false }],
    [200, { ok: false }],
    [502, { error: "Failed to save and email booking" }],
    [200, "not json"],
  ] as const) {
    await assert.rejects(sendContactMessage(good, respond(status, payload)), new RegExp(CONTACT_MESSAGE_SEND_FAILED.slice(0, 30)));
  }

  // Invalid input never reaches the network.
  const before = calls.length;
  await assert.rejects(sendContactMessage({ ...good, email: "nope" }, respond(200, { ok: true, emailSent: true })));
  assert.equal(calls.length, before);
  console.log("OK  one POST with name + message only; success only when the email is confirmed sent");
}

checkSending()
  .then(() => console.log("\nAll Contact page / email contact checks passed."))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

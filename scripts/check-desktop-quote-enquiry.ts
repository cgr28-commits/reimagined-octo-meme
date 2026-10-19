import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendDesktopQuoteEnquiry, validateDesktopEnquiry } from "../src/lib/desktop-quote-enquiry";

async function main() {
  const input = { name: "QA Example", email: "qa@example.com", message: "Test only", journey: "Belfast → Dublin Airport\nEstate\n2 passengers · 2 suitcases\nQuoted fare: £242" };
  assert.equal(validateDesktopEnquiry(input), null);
  assert.ok(validateDesktopEnquiry({ ...input, name: " " }));
  assert.ok(validateDesktopEnquiry({ ...input, email: "not-an-email" }));
  assert.ok(validateDesktopEnquiry({ ...input, message: "a".repeat(2001) }));
  assert.ok(validateDesktopEnquiry({ ...input, journey: "" }));
  let calls = 0;
  const success: typeof fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /\/bookings\/?$/);
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.booking, undefined); // never creates a booking job/calendar event
    assert.equal(body.customerName, input.name);
    assert.equal(body.sendEmail, true);
    for (const text of [input.email, input.journey, "not a confirmed booking"]) assert.ok(body.message.includes(text));
    return new Response(JSON.stringify({ ok: true, emailSent: true, bookingReference: "QA-123" }));
  };
  assert.equal(await sendDesktopQuoteEnquiry(input, success), "QA-123");
  await assert.rejects(sendDesktopQuoteEnquiry({ ...input, email: "bad" }, success));
  assert.equal(calls, 1, "invalid input must not make a network request");
  for (const response of [new Response('{"ok":true,"emailSent":false}'), new Response('{"ok":false}', { status: 502 }), new Response("not json")]) {
    await assert.rejects(sendDesktopQuoteEnquiry(input, async () => response), /couldn't confirm/);
  }
  await assert.rejects(sendDesktopQuoteEnquiry(input, async () => { throw new Error("offline"); }), /offline/);
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /@media \(min-width: 1024px\) \{\s*\.desktop-enquiry-trigger \{ display: flex; \}/);
  assert.match(css, /\.desktop-enquiry-trigger \{ display: none; \}/);
  const quote = readFileSync("src/components/QuoteCard.tsx", "utf8");
  assert.match(quote, /setQuoteActionOpen\("whatsapp"\)[\s\S]{0,250}desktop-result-whatsapp/);
  assert.match(quote, /authoritativeFareReady && pricedFare/);
  assert.match(readFileSync("src/components/DesktopQuoteEnquiry.tsx", "utf8"), /event\.stopPropagation\(\)/, "portal submit must not bubble into the booking form");
  const form = readFileSync("src/components/DesktopQuoteEnquiry.tsx", "utf8");
  assert.match(form, /if \(submission.current\) return;[\s\S]*Object.freeze\(\{ name, email, message, journey \}\)/);
  assert.match(form, /submission.current = input;[\s\S]*await sendDesktopQuoteEnquiry\(input\)/);
  assert.match(form, /finally \{ submission.current = null; setSending\(false\); \}/);
  for (const field of ["name", "email", "message"]) assert.ok(form.includes(`value={${field}} disabled={sending}`));
  const confirmation = form.slice(form.indexOf('{sent ? <div'), form.indexOf('<form data-desktop-enquiry-form'));
  assert.match(form, /title=\{sent \? "Enquiry Sent Successfully" : "Email enquiry"\}/);
  assert.ok(confirmation.includes("Thank you for contacting My Airport Taxi NI."));
  assert.ok(confirmation.includes("We've received your enquiry and will get back to you as soon as possible."));
  assert.doesNotMatch(confirmation, /SITE.email|email.trim|bookings@|acknowledgement/i);
  console.log("PASS: validation, journey context, existing endpoint, no booking payload, confirmed email success, HTTP/provider/network errors, desktop-only visibility and preserved mobile WhatsApp.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

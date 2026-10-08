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
  isDeterministicResendBccRejection,
  resendCustomerPayload,
  resendRejectionFromBody,
  resolveOwnerEmailCopyAddress,
} from "../shared/owner-email-copy";
import { trySendResendOnlyEmail, type WorkerEmailEnv } from "../workers/addresses/src/worker-email";
import {
  buildAirportPickupReminderMessage,
  evaluateAirportPickupReminder,
} from "../shared/airport-pickup-reminder";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const CUSTOMER = "sarah@example.com";
const SUBJECT = "Your journey reminder — My Airport Taxi NI";
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
      driverContactUrl: "https://www.myairporttaxini.co.uk/driver-contact/?token=abcdabcdabcdabcdabcdabcdabcdabcd",
    },
    new Date("2026-10-02T14:00:00.000Z"),
  );
  assert.equal(decision.eligible, true);
  if (decision.eligible) {
    assert.equal(decision.subject, SUBJECT);
    assert.equal(decision.text.includes(BUSINESS_MAILBOX), false);
    assert.equal(decision.html.includes(BUSINESS_MAILBOX), false);
    assert.equal(decision.html.includes("Rinkel"), false);
    assert.match(decision.html, /tel:\+447549815538/);
    assert.equal(decision.html.includes("028 9602 2952"), false);
    assert.match(decision.html, />Message Us on WhatsApp</);
    assert.match(decision.html, />Message Your Driver</);
    assert.match(decision.html, /\/driver-contact\//);
    assert.equal(decision.html.includes("wa.me/447700900111"), false);
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
  assert.match(
    email,
    /Resend rejected the BCC field and did not accept the email — sending the customer email without BCC/,
  );
  assert.equal(email.match(/sendResendAllowingBccRejection\(/g)?.length, 3);
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

console.log("=== Resend BCC retry is only a proven field rejection ===");
{
  const bccMessage = "Invalid `bcc` field. The email address needs to follow the email@example.com format.";
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(400, { name: "validation_error", message: bccMessage }),
    ),
    true,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(422, { name: "validation_error", message: "Invalid `bcc` field." }),
    ),
    true,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(400, { name: "validation_error", message: "Invalid bcc field." }),
    ),
    true,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(500, { name: "validation_error", message: bccMessage }),
    ),
    false,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(429, { name: "rate_limit_exceeded", message: "Too many requests." }),
    ),
    false,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(400, {
        name: "validation_error",
        message: "Invalid `to` field. The email address needs to follow the email@example.com format.",
      }),
    ),
    false,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(400, {
        name: "validation_error",
        message: "An error was found with one or more fields in the request.",
      }),
    ),
    false,
  );
  assert.equal(
    isDeterministicResendBccRejection(
      resendRejectionFromBody(403, {
        name: "validation_error",
        message: "You can only send testing emails to your own email address.",
      }),
    ),
    false,
  );
  assert.equal(isDeterministicResendBccRejection(resendRejectionFromBody(422, null)), false);
  assert.equal(isDeterministicResendBccRejection(resendRejectionFromBody(400, "Invalid `bcc` field.")), false);
  console.log("OK  only a parsed 400/422 validation error that names the BCC field can retry");
}

console.log("=== Resend customer send does not duplicate on an ambiguous failure ===");
void checkResendCustomerSend().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function checkResendCustomerSend(): Promise<void> {
  const env: WorkerEmailEnv = {
    RESEND_API_KEY: "re_test_not_a_real_key",
    BOOKING_FROM_EMAIL: "bookings@myairporttaxini.co.uk",
  };
  const customer = {
    to: "sarah@example.com",
    toName: "Sarah Johnson",
    subject: "Important information about your airport collection",
    body: "Hi Sarah,",
    htmlBody: "<p>Hi Sarah,</p>",
    customerDelivery: true as const,
  };

  type SentPayload = {
    to?: string[];
    bcc?: string[];
    cc?: string[];
    subject?: string;
    text?: string;
    html?: string;
  };

  const originalFetch = globalThis.fetch;
  async function capture(
    respond: (call: number, payload: SentPayload) => Response | Promise<Response>,
  ): Promise<{ calls: SentPayload[] }> {
    const calls: SentPayload[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as SentPayload;
      calls.push(payload);
      return respond(calls.length, payload);
    }) as typeof fetch;
    return { calls };
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function assertSoleRecipient(payload: SentPayload) {
    assert.deepEqual(payload.to, ["sarah@example.com"]);
    assert.equal("cc" in payload, false);
    assert.equal(JSON.stringify(payload.to).includes(BUSINESS_MAILBOX), false);
  }

  try {
    {
      const seen = await capture(async () => json(200, { id: "email_bcc_ok" }));
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, true);
      assert.equal(result.ownerBcc, true);
      assert.equal(result.resendId, "email_bcc_ok");
      assert.equal(seen.calls.length, 1);
      assert.deepEqual(seen.calls[0].bcc, [BUSINESS_MAILBOX]);
      assertSoleRecipient(seen.calls[0]);
      console.log("OK  successful BCC send is one request");
    }

    {
      const seen = await capture(async (call) => {
        if (call === 1) {
          return json(400, {
            name: "validation_error",
            message: "Invalid `bcc` field. The email address needs to follow the email@example.com format.",
          });
        }
        return json(200, { id: "email_without_bcc" });
      });
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, true);
      assert.equal(result.ownerBcc, undefined);
      assert.equal(result.resendId, "email_without_bcc");
      assert.equal(seen.calls.length, 2);
      assert.deepEqual(seen.calls[0].bcc, [BUSINESS_MAILBOX]);
      assert.equal("bcc" in seen.calls[1], false);
      assert.equal(seen.calls[0].subject, seen.calls[1].subject);
      assert.equal(seen.calls[0].text, seen.calls[1].text);
      assert.equal(seen.calls[0].html, seen.calls[1].html);
      assertSoleRecipient(seen.calls[0]);
      assertSoleRecipient(seen.calls[1]);
      console.log("OK  deterministic BCC rejection retries once without BCC");
    }

    {
      const seen = await capture(async () => {
        throw new TypeError("network down");
      });
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      assertSoleRecipient(seen.calls[0]);
      console.log("OK  network failure does not send a second customer email");
    }

    {
      const seen = await capture(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      });
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      console.log("OK  timeout does not send a second customer email");
    }

    {
      const seen = await capture(async () =>
        json(500, { name: "application_error", message: "An unexpected error occurred." }),
      );
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      assertSoleRecipient(seen.calls[0]);
      console.log("OK  Resend 5xx does not send a second customer email");
    }

    {
      const seen = await capture(async () =>
        json(500, { name: "validation_error", message: "Invalid `bcc` field." }),
      );
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      console.log("OK  a 5xx that mentions BCC is still not retried");
    }

    {
      const seen = await capture(async () =>
        json(429, { name: "rate_limit_exceeded", message: "Too many requests." }),
      );
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      assertSoleRecipient(seen.calls[0]);
      console.log("OK  Resend 429 does not send a second customer email");
    }

    {
      const seen = await capture(async () => new Response("upstream reset", { status: 502 }));
      const result = await trySendResendOnlyEmail(env, customer);
      assert.equal(result.sent, false);
      assert.equal(seen.calls.length, 1);
      console.log("OK  a non-JSON provider error does not send a second customer email");
    }

    {
      const seen = await capture(async () => json(200, { id: "email_no_bcc" }));
      const result = await trySendResendOnlyEmail(env, { ...customer, ownerCopy: false });
      assert.equal(result.sent, true);
      assert.equal(result.ownerBcc, undefined);
      assert.equal(seen.calls.length, 1);
      assert.equal("bcc" in seen.calls[0], false);
      assertSoleRecipient(seen.calls[0]);
      console.log("OK  a customer email with no owner copy is one request");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("\nAll owner email BCC checks passed.");
}

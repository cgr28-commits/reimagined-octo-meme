/**
 * Regression: short-notice payment-link email after Owner approval.
 * Run: npx tsx scripts/check-short-notice-payment-email.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildShortNoticePaymentLinkEmail,
  isValidCustomerEmail,
} from "../shared/short-notice-payment-email";
import type { ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import {
  buildShortNoticePayUrl,
  shouldAutoSendPaymentLinkEmail,
} from "../workers/addresses/src/short-notice-handlers";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const PAY_URL =
  "https://www.myairporttaxini.co.uk/pay/short-notice/?token=secure-token-abc";

function baseRecord(
  overrides: Partial<ShortNoticeBookingRecord> = {},
): ShortNoticeBookingRecord {
  const now = Date.now();
  return {
    reference: "MATNI-SN-TEST01",
    paymentToken: "secure-token-abc",
    status: "SHORT_NOTICE_APPROVED",
    amount: 65,
    currency: "GBP",
    amountLabel: "£65.00",
    booking: {
      customerName: "Jill Example",
      customerEmail: "jill@example.com",
      mobileNumber: "07700900123",
      pickupLabel: "10 Donegall Square North, Belfast",
      dropoffLabel: "Belfast International Airport (BFS)",
      tripDate: "2026-09-15",
      tripTime: "10:30",
      returnJourney: false,
      passengers: 2,
      suitcases: 2,
      vehicle: "Saloon",
    } as ShortNoticeBookingRecord["booking"],
    materialFingerprint: "fp",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    approvedAt: new Date(now).toISOString(),
    approvedAmount: 65,
    paymentExpiresAt: new Date(now + 3_600_000).toISOString(),
    ...overrides,
  };
}

check("Email builder: subject, customer, reference, amount, secure pay URL", () => {
  const email = buildShortNoticePaymentLinkEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "BFS",
    tripDate: "2026-09-15",
    tripTime: "10:30",
    amountLabel: "£65.00",
    reference: "MATNI-SN-TEST01",
    payUrl: PAY_URL,
  });
  assert.equal(
    email.subject,
    "Your My Airport Taxi NI booking is ready for payment",
  );
  assert.match(email.text, /Hi Jill,/);
  assert.match(email.text, /MATNI-SN-TEST01/);
  assert.match(email.text, /Amount due: £65\.00/);
  assert.match(email.text, new RegExp(PAY_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(email.html, /Pay securely now/);
  assert.match(email.html, /MATNI-SN-TEST01/);
  assert.match(email.html, /£65\.00/);
  assert.match(email.html, /href="https:\/\/www\.myairporttaxini\.co\.uk\/pay\/short-notice\/\?token=secure-token-abc"/);
  assert.match(email.html, /Belfast City Centre/);
  assert.match(email.html, /BFS/);
});

check("Customer email validation", () => {
  assert.equal(isValidCustomerEmail("jill@example.com"), true);
  assert.equal(isValidCustomerEmail("  jill@example.com "), true);
  assert.equal(isValidCustomerEmail(""), false);
  assert.equal(isValidCustomerEmail("not-an-email"), false);
  assert.equal(isValidCustomerEmail(undefined), false);
});

check("Approved + unpaid + valid email → auto-send eligible once", () => {
  const record = baseRecord();
  assert.equal(shouldAutoSendPaymentLinkEmail(record, PAY_URL), true);
});

check("Repeated approval / same pay URL → no duplicate automatic email", () => {
  const record = baseRecord({
    paymentLinkEmailSentAt: "2026-08-20T12:00:00.000Z",
    paymentLinkEmailPayUrl: PAY_URL,
  });
  assert.equal(shouldAutoSendPaymentLinkEmail(record, PAY_URL), false);
});

check("Page refresh / list does not change idempotency fingerprint", () => {
  // Reload keeps paymentLinkEmailSentAt on the record — auto-send stays blocked.
  const afterReload = baseRecord({
    paymentLinkEmailSentAt: "2026-08-20T12:00:00.000Z",
    paymentLinkEmailPayUrl: PAY_URL,
  });
  assert.equal(shouldAutoSendPaymentLinkEmail(afterReload, PAY_URL), false);
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  assert.match(handlers, /handleOwnerListShortNotice/);
  assert.doesNotMatch(
    handlers,
    /handleOwnerListShortNotice[\s\S]{0,800}sendPaymentLinkEmail/,
  );
});

check("Already paid → no payment-link email", () => {
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({
        status: "SHORT_NOTICE_PAID",
        paidAt: "2026-08-20T13:00:00.000Z",
        paymentReference: "PAID-1",
      }),
      PAY_URL,
    ),
    false,
  );
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({
        paymentReference: "PAID-1",
        paidAt: "2026-08-20T13:00:00.000Z",
      }),
      PAY_URL,
    ),
    false,
  );
});

check("Cancelled / declined / expired / awaiting → no payment-link email", () => {
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({ status: "SHORT_NOTICE_DECLINED", declinedAt: "2026-08-20T12:00:00.000Z" }),
      PAY_URL,
    ),
    false,
  );
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({ status: "SHORT_NOTICE_EXPIRED" }),
      PAY_URL,
    ),
    false,
  );
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({ status: "SHORT_NOTICE_AWAITING_APPROVAL" }),
      PAY_URL,
    ),
    false,
  );
});

check("Invalid / missing customer email → no auto-send", () => {
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({
        booking: {
          ...baseRecord().booking,
          customerEmail: "",
        },
      }),
      PAY_URL,
    ),
    false,
  );
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({
        booking: {
          ...baseRecord().booking,
          customerEmail: "bad",
        },
      }),
      PAY_URL,
    ),
    false,
  );
});

check("New pay URL may become eligible again after prior send", () => {
  const newUrl = buildShortNoticePayUrl(
    "https://www.myairporttaxini.co.uk",
    "brand-new-token",
  );
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      baseRecord({
        paymentToken: "brand-new-token",
        paymentLinkEmailSentAt: "2026-08-20T12:00:00.000Z",
        paymentLinkEmailPayUrl: PAY_URL,
      }),
      newUrl,
    ),
    true,
  );
});

check("Worker approve wires auto-send + idempotent paymentLinkEmailSentAt", () => {
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const index = read("workers/addresses/src/index.ts");
  assert.match(handlers, /shouldAutoSendPaymentLinkEmail/);
  assert.match(handlers, /sendPaymentLinkEmail/);
  assert.match(handlers, /paymentLinkEmailSentAt/);
  assert.match(handlers, /paymentLinkEmailPayUrl/);
  assert.match(handlers, /handleOwnerResendPaymentEmail/);
  assert.match(handlers, /buildShortNoticePaymentLinkEmail/);
  assert.match(handlers, /trySendBrandedCustomerEmail/);
  assert.doesNotMatch(
    handlers.slice(handlers.indexOf("handleOwnerResendPaymentEmail")),
    /SUMUP|createCheckout|checkout\.sumup/i,
  );
  assert.match(index, /handleOwnerResendPaymentEmail/);
  assert.match(index, /resend-payment-email/);
});

check("Owner UI: payment email status + Resend payment email (no SumUp)", () => {
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const api = read("src/lib/short-notice-api.ts");
  assert.match(panel, /Payment email sent/);
  assert.match(panel, /Payment email not sent/);
  assert.match(panel, /Resend payment email/);
  assert.match(panel, /resendShortNoticePaymentEmail/);
  assert.match(panel, /Copy pay link/);
  assert.match(panel, /Share on WhatsApp/);
  assert.match(api, /resend-payment-email/);
  assert.match(api, /paymentEmailSent/);
});

check("Shared email module synced into Worker", () => {
  assert.equal(
    fs.existsSync(path.join(root, "workers/addresses/shared/short-notice-payment-email.ts")),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(root, "workers/addresses/shared/short-notice-booking.ts")),
    true,
  );
  const workerBooking = read("workers/addresses/shared/short-notice-booking.ts");
  assert.match(workerBooking, /paymentLinkEmailSentAt/);
  assert.match(workerBooking, /paymentLinkEmailPayUrl/);
});

console.log("\nAll short-notice payment-link email checks passed.");

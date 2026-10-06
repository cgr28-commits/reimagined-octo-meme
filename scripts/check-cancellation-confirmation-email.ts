/**
 * Customer cancellation confirmation wording and date format.
 * Run: npx tsx scripts/check-cancellation-confirmation-email.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REFUND_FUNDS_TIMING } from "../shared/refund-ops";
import {
  buildCustomerCancellationEmails,
  type CancellationEmailDetails,
} from "../shared/booking-notifications";

const NON_REFUNDABLE =
  "As the cancellation was made within 24 hours of your scheduled pickup time, the fare is non-refundable under our cancellation policy.";
const CLOSING =
  "Thank you for choosing My Airport Taxi NI. We hope we can welcome you on another journey in the future.";
const OPENING = "Your booking has been successfully cancelled.";
const STATUTORY = "Your statutory rights are not affected.";

function details(overrides: Partial<CancellationEmailDetails>): CancellationEmailDetails {
  return {
    customerName: "Jordan Ellis",
    paymentReference: "TAAA6RTCVM2",
    refundAmount: "£0.00",
    refundAmountValue: 0,
    originalAmount: "£35.00",
    originalAmountValue: 35,
    cumulativeRefunded: "£0.00",
    remainingPaid: "£35.00",
    tripLabel: "Airport pickup",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: "2026-10-06",
    tripTime: "12:55",
    cancelBooking: true,
    within24h: true,
    reasonCategory: "customer_cancelled_under_24h",
    bookingRemainsActive: false,
    actionKind: "cancel_no_refund",
    ownerNotes: "SECRET_OWNER_NOTE_SHOULD_NEVER_EMAIL_CUSTOMER",
    ...overrides,
  };
}

const late = buildCustomerCancellationEmails(details({}));
const early = buildCustomerCancellationEmails(
  details({
    within24h: false,
    refundAmount: "£35.00",
    refundAmountValue: 35,
    cumulativeRefunded: "£35.00",
    remainingPaid: "£0.00",
    reasonCategory: "customer_cancelled_over_24h",
    actionKind: "cancel_full_refund",
  }),
);

assert.ok(late.customer);
assert.ok(early.customer);

const lateText = late.customer.text;
const lateHtml = late.customer.html;
const earlyText = early.customer.text;
const earlyHtml = early.customer.html;

assert.ok(lateText.includes(OPENING));
assert.match(lateHtml, /Cancellation confirmed/);
assert.match(lateHtml, />Booking cancelled</);
assert.match(lateHtml, /font-size:13px[^>]*>Booking reference: TAAA6RTCVM2/);
assert.match(lateHtml, /font-size:26px[^>]*>Booking cancelled</);
assert.doesNotMatch(lateHtml, /Booking cancelled — TAAA6RTCVM2/);
assert.match(lateText, /Airport pickup\n6 October 2026 · 12:55pm/);
assert.match(lateHtml, /6 October 2026 · 12:55pm/);
assert.doesNotMatch(lateText, /06-10-2026/);
assert.doesNotMatch(lateText, /UK local time/);
assert.ok(lateText.includes(NON_REFUNDABLE));
assert.ok(lateHtml.includes(NON_REFUNDABLE));
assert.match(lateHtml, /About your payment/);
assert.match(lateText, /About your payment/);
assert.doesNotMatch(lateText, /exceptional circumstances/i);
assert.doesNotMatch(lateHtml, /exceptional circumstances/i);
assert.doesNotMatch(lateText, /review your request/i);
assert.doesNotMatch(lateHtml, /review your request/i);
assert.doesNotMatch(lateText, /get in touch/i);
assert.doesNotMatch(lateHtml, /get in touch/i);
assert.doesNotMatch(lateText, /we will refund/i);
assert.doesNotMatch(lateText, /refund has been issued/i);
assert.doesNotMatch(lateText, /A refund of/);
assert.match(lateHtml, /font-size:12px[^>]*>Your statutory rights are not affected\./);
assert.ok(lateText.includes(STATUTORY));
assert.ok(lateText.includes(CLOSING));
assert.doesNotMatch(lateText, /SECRET_OWNER_NOTE/);
assert.doesNotMatch(lateHtml, /#dc2626|color:#b91c1c|color:red/i);
assert.match(late.owner!.body, /Within 24h of pickup: Yes/);
assert.match(late.owner!.subject, /<24h, no refund/);

assert.ok(earlyText.includes(OPENING));
assert.match(earlyText, /6 October 2026 · 12:55pm/);
assert.match(earlyText, /A refund of £35\.00 has been issued to your original payment method\./);
assert.ok(earlyText.includes(REFUND_FUNDS_TIMING));
assert.match(earlyText, /at least 24 hours before pickup/);
assert.doesNotMatch(earlyText, /non-refundable/);
assert.doesNotMatch(earlyText, /exceptional circumstances/);
assert.doesNotMatch(earlyText, /statutory rights/i);
assert.ok(earlyText.includes(CLOSING));
assert.match(earlyHtml, /About your payment/);
assert.doesNotMatch(early.owner!.body, /successfully cancelled/);

const morning = buildCustomerCancellationEmails(
  details({ tripTime: "09:05", tripDate: "2026-03-29" }),
);
assert.match(morning.customer!.text, /29 March 2026 · 9:05am/);

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../shared/booking-notifications.ts"),
  "utf8",
);
assert.match(
  source,
  /details\.cancelBooking && details\.refundAmountValue <= 0 && details\.within24h/,
);
assert.match(
  source,
  /details\.cancelBooking &&\s*details\.refundAmountValue > 0 &&\s*!details\.within24h/,
);
assert.doesNotMatch(source, /TAAA6RTCVM2/);
assert.doesNotMatch(source, /exceptional circumstances/i);
assert.doesNotMatch(source, /review your request/i);

const previewDir = process.env.CANCELLATION_EMAIL_PREVIEW_DIR;
if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, "non-refundable.html"), lateHtml);
  fs.writeFileSync(path.join(previewDir, "refundable.html"), earlyHtml);
}

console.log("OK  cancellation confirmation emails");

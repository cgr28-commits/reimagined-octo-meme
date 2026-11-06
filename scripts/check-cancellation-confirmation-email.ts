/**
 * Customer cancellation confirmation wording and date format.
 * Run: npx tsx scripts/check-cancellation-confirmation-email.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REFUND_FUNDS_TIMING } from "../shared/refund-ops";
import { normalizeCancellationReceivedAt } from "../shared/refund-ops";
import {
  buildCustomerCancellationEmails,
  formatCancellationReceived,
  type CancellationEmailDetails,
} from "../shared/booking-notifications";

const NON_REFUNDABLE =
  "As we received your cancellation less than 24 hours before your scheduled pickup, no refund is due under the cancellation terms agreed when you booked, subject to your statutory rights.";
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
assert.match(lateHtml, /font-size:16px[^>]*>Booking cancelled</);
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
assert.match(lateText, /subject to your statutory rights\./);
assert.doesNotMatch(lateText, /Your statutory rights are not affected/);
assert.match(lateText, /There is nothing more for you to pay for this booking\./);
assert.doesNotMatch(lateText, /will not be refunded/);
assert.match(lateText, /You can read our Cancellation Policy and Terms & Conditions here:/);
assert.match(lateText, /https:\/\/www\.myairporttaxini\.co\.uk\/cancellation\//);
assert.match(lateHtml, /href="https:\/\/www\.myairporttaxini\.co\.uk\/cancellation\/"/);
assert.doesNotMatch(earlyText, /Cancellation Policy and Terms/);
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

// Late cancellation, Meet & Greet refunded as goodwill (Dave, 6 Nov 2026).
const goodwill = buildCustomerCancellationEmails(
  details({
    refundAmount: "£15.00",
    refundAmountValue: 15,
    cumulativeRefunded: "£15.00",
    remainingPaid: "£20.00",
    amountRetained: "£20.00",
    meetGreetRefund: true,
    actionKind: "cancel_partial_refund",
  }),
);
const goodwillText = goodwill.customer!.text;
const goodwillHtml = goodwill.customer!.html;
assert.match(goodwill.customer!.subject, /^Booking Cancellation Confirmed – /);
assert.ok(goodwillText.includes(OPENING));
assert.ok(goodwillText.includes(NON_REFUNDABLE));
assert.match(goodwillText, /As a goodwill gesture, we have refunded the Meet & Greet charge of £15\.00 to your original payment method\./);
assert.ok(goodwillText.includes(REFUND_FUNDS_TIMING));
assert.match(goodwillText, /There is nothing more for you to pay for this booking\./);
assert.match(goodwillText, /subject to your statutory rights/);
assert.doesNotMatch(goodwillText, /Partial Refund/i);
assert.doesNotMatch(goodwillText, /SECRET_OWNER_NOTE/);
assert.match(goodwill.owner!.subject, /goodwill refund £15\.00/);
const plainGoodwill = buildCustomerCancellationEmails(
  details({ refundAmount: "£5.00", refundAmountValue: 5, remainingPaid: "£30.00", amountRetained: "£30.00", actionKind: "cancel_partial_refund" }),
);
assert.match(plainGoodwill.customer!.text, /we have refunded £5\.00 to your original payment method/);

// "Cancellation received" time (owner-entered), in UK time — evidence for card disputes.
const received = buildCustomerCancellationEmails(
  details({ cancellationReceivedAt: "2026-11-06T19:45:00.000Z", tripDate: "2026-11-06", tripTime: "23:30" }),
);
assert.match(received.customer!.text, /Cancellation received\n6 November 2026 at 7:45pm/);
assert.match(received.customer!.html, /Cancellation received<\/div>\s*<div[^>]*>6 November 2026 at 7:45pm</);
assert.match(received.owner!.body, /Cancellation received: 6 November 2026 at 7:45pm/);
assert.equal(formatCancellationReceived("2026-07-01T08:05:00.000Z"), "1 July 2026 at 9:05am", "BST");
assert.doesNotMatch(lateText, /Cancellation received/, "omitted when not entered");
assert.equal(normalizeCancellationReceivedAt("2026-11-06T19:45", new Date("2026-11-06T20:40:00Z")) !== null, true);
assert.equal(normalizeCancellationReceivedAt("2026-11-07T19:45:00Z", new Date("2026-11-06T20:40:00Z")), null, "future rejected");
assert.equal(normalizeCancellationReceivedAt("nonsense"), null);
assert.equal(normalizeCancellationReceivedAt(""), null);

const previewDir = process.env.CANCELLATION_EMAIL_PREVIEW_DIR;
if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, "non-refundable.html"), lateHtml);
  fs.writeFileSync(path.join(previewDir, "refundable.html"), earlyHtml);
  fs.writeFileSync(path.join(previewDir, "goodwill-meet-greet.html"), goodwillHtml);
  fs.writeFileSync(path.join(previewDir, "late-with-received.html"), received.customer!.html);
}

console.log("OK  cancellation confirmation emails");

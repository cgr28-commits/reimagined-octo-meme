/** Unfinished payments (owner alert + customer reminder), email typo guard, funnel "paid". */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailAddressProblem, emailTypoSuggestion, isUsableEmailAddress } from "../shared/email-typo";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import {
  buildCustomerFinishBookingEmail,
  buildOwnerUnfinishedPaymentEmail,
  selectUnfinishedCheckouts,
  type UnfinishedCheckoutInput,
} from "../shared/unfinished-payment";

// Email typos (real case: "sallynottus@gmail.comEZY").
assert.equal(emailTypoSuggestion("sallynottus@gmail.comEZY"), "sallynottus@gmail.com");
assert.equal(emailTypoSuggestion("a.b@gmial.com"), "a.b@gmail.com");
assert.equal(emailTypoSuggestion("x@hotmail.con"), "x@hotmail.com");
assert.equal(emailTypoSuggestion("x@hotmail.co.uk"), null);
assert.equal(emailTypoSuggestion("x@yahoo.ie"), null);
assert.equal(emailTypoSuggestion("x@icloud.com"), null);
assert.equal(emailTypoSuggestion("x@company.co.uk"), null);
assert.equal(emailTypoSuggestion("x@company.con"), "x@company.com");
assert.equal(isUsableEmailAddress("colin.rice@me.com"), true);
assert.equal(isUsableEmailAddress("nope"), false);
assert.match(emailAddressProblem("sallynottus@gmail.comEZY") ?? "", /did you mean sallynottus@gmail\.com\?/);
const gate = getPaymentBookingBlockers({
  customerName: "Sally",
  customerEmail: "sallynottus@gmail.comEZY",
  mobileNumber: "07700900123",
} as Parameters<typeof getPaymentBookingBlockers>[0]);
assert.ok(gate.some((b) => /did you mean sallynottus@gmail\.com/.test(b)), "Server blocks typo emails before payment");
console.log("OK  email typos caught with a suggestion, on the form and before payment");

// Which checkouts to alert on.
const now = new Date("2026-11-02T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const base = (over: Partial<UnfinishedCheckoutInput> & { booking?: Partial<UnfinishedCheckoutInput["booking"]> }): UnfinishedCheckoutInput => ({
  checkoutId: over.checkoutId ?? Math.random().toString(36).slice(2),
  amount: over.amount ?? 89,
  createdAt: over.createdAt ?? ago(15),
  finalizedAt: over.finalizedAt,
  paymentReference: over.paymentReference,
  unfinishedAlertSentAt: over.unfinishedAlertSentAt,
  booking: {
    customerName: "Sally Sutton",
    customerEmail: "sally@gmail.com",
    mobileNumber: "07700900123",
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Aloft Belfast",
    tripDate: "2026-11-05",
    tripTime: "14:30",
    ...over.booking,
  },
});

assert.equal(selectUnfinishedCheckouts([base({ createdAt: ago(5) })], now).length, 0, "Not before 10 minutes");
assert.equal(selectUnfinishedCheckouts([base({ createdAt: ago(11) })], now).length, 1, "After 10 minutes");
assert.equal(selectUnfinishedCheckouts([base({ createdAt: ago(60 * 30) })], now).length, 0, "Older than a day is left alone");
assert.equal(selectUnfinishedCheckouts([base({ amount: 1 })], now).length, 0, "£1 owner tests skipped");
assert.equal(selectUnfinishedCheckouts([base({ booking: { tripDate: "2026-10-30" } })], now).length, 0, "Past journeys skipped");
assert.equal(selectUnfinishedCheckouts([base({ unfinishedAlertSentAt: ago(1) })], now).length, 0, "Alerted once only");
assert.equal(
  selectUnfinishedCheckouts([base({ createdAt: ago(20) }), base({ createdAt: ago(12), finalizedAt: ago(8), paymentReference: "TX1" })], now).length,
  0,
  "Customer who went on to pay is skipped",
);
const grouped = selectUnfinishedCheckouts(
  [base({ createdAt: ago(30), checkoutId: "a" }), base({ createdAt: ago(14), checkoutId: "b" }), base({ createdAt: ago(20), checkoutId: "c", booking: { customerEmail: "other@x.com" } })],
  now,
);
assert.equal(grouped.length, 2, "One alert per customer");
const sally = grouped.find((g) => g.latest.booking.customerEmail === "sally@gmail.com")!;
assert.equal(sally.latest.checkoutId, "b");
assert.equal(sally.attempts.length, 2);
console.log("OK  10-minute delay, once per customer, skips paid/past/test/old");

// Emails.
const owner = buildOwnerUnfinishedPaymentEmail({
  checkout: base({ booking: { customerEmail: "sallynottus@gmail.comEZY" } }),
  attempts: 2,
  sumUpStatus: "FAILED",
  customerEmailed: false,
  resumeUrl: "https://www.myairporttaxini.co.uk/book-quote/?id=abc",
});
assert.match(owner.subject, /Unfinished booking — Sally Sutton, £89/);
assert.match(owner.body, /Card payment failed \(2 attempts\)/);
assert.match(owner.body, /Mobile: 07700900123/);
assert.match(owner.body, /probably sallynottus@gmail\.com/);
assert.match(owner.body, /couldn't email the customer/);
const customer = buildCustomerFinishBookingEmail({ checkout: base({}), resumeUrl: "https://x/book-quote/?id=abc", priceLabel: "£89" });
assert.match(customer.subject, /isn't finished/);
assert.match(customer.text, /haven't been charged/);
assert.match(customer.text, /fixed price of £89 is still available/);
assert.match(customer.html, /Finish my booking/);
assert.match(customer.text, /07549 815538/);
assert.doesNotMatch(customer.text + customer.html, /surcharge/i);
console.log("OK  owner alert has contact + reason; customer email has link, no charge, call/WhatsApp number");

// Wiring.
const worker = readFileSync(new URL("../workers/addresses/src/index.ts", import.meta.url), "utf8");
const fiveMin = worker.slice(worker.indexOf('if (!cron || cron === "*/5 * * * *") {'), worker.indexOf("if (!shouldRunHourlyScheduledJobs(cron)) return;"));
assert.match(fiveMin, /processUnfinishedPayments\(env/, "Runs on the 5-minute cron");
assert.match(worker, /quoteTransactionId: details\.quoteTransactionId\.trim\(\)\.toLowerCase\(\)/, "Paid booking keeps the quote session id (funnel 'paid')");
const handler = readFileSync(new URL("../workers/addresses/src/unfinished-payment.ts", import.meta.url), "utf8");
assert.match(handler, /isSumUpCheckoutPaid/, "Never reminds someone who actually paid");
assert.match(handler, /unfinishedAlertSentAt: stamp/);
const form = readFileSync(new URL("../src/lib/booking-message.ts", import.meta.url), "utf8");
assert.match(form, /isUsableEmailAddress\(value\)/);
console.log("OK  5-minute cron, SumUp paid check, once-only marker, funnel paid id, form typo check");

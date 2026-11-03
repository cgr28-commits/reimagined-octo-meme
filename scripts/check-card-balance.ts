/** "Pay a deposit" bookings: 20% today, balance by card link 7 days before, auto-cancel 3 days before. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_BALANCE_QUEUE_KEY,
  buildCardBalanceCustomerEmail,
  confirmCardBalanceWebhook,
  enqueueCardBalanceBooking,
  handleCardBalancePay,
  processCardBalanceQueue,
  refundPaidCardBalanceBeforeCancel,
} from "../workers/addresses/src/card-balance";
import { getPaidBookingRecord, savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import {
  calculateCardBalanceQuote,
  cardBalanceOwnerStatusLine,
  cardBalanceQuoteScreenNote,
  cardBalanceSchedule,
  isCardBalanceDateEligible,
  remainingCardBalanceGbp,
} from "../workers/addresses/shared/deposit-card-balance";
import {
  grossAmountCollectedOf,
  netAmountRetainedOf,
  type PaidBookingRecord,
} from "../workers/addresses/shared/paid-booking-record";
import { buildCustomerConfirmationEmail, buildOwnerPaidBookingEmail } from "../workers/addresses/shared/booking-notifications";

function memoryStore() {
  const kv = new Map<string, string>();
  let reads = 0;
  return {
    kv,
    reads: () => reads,
    async get(key: string, type?: string) {
      reads++;
      const v = kv.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async list(opts: { prefix?: string } = {}) {
      const keys = [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
}

const emails: Array<Record<string, unknown>> = [];
const sumupCheckouts = new Map<string, Record<string, unknown>>();
const refunds: Array<{ id: string; body: string }> = [];
let checkoutSeq = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.resend.com") {
    emails.push(JSON.parse(String(init?.body ?? "{}")));
    return Response.json({ id: `mock-${emails.length}` });
  }
  if (url.hostname === "api.sumup.com") {
    if (url.pathname === "/v0.1/checkouts" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const id = `chk-${++checkoutSeq}`;
      const record = { id, ...body, status: "PENDING", hosted_checkout_url: `https://pay.sumup.com/${id}` };
      sumupCheckouts.set(id, record);
      return Response.json(record, { status: 201 });
    }
    const m = url.pathname.match(/^\/v0\.1\/checkouts\/([^/]+)$/);
    if (m && (!init?.method || init.method === "GET")) {
      const c = sumupCheckouts.get(m[1]);
      return c ? Response.json(c) : new Response("{}", { status: 404 });
    }
    const r = url.pathname.match(/\/me\/refund\/([^/]+)$|\/refund\/([^/]+)$/);
    if (r) {
      refunds.push({ id: r[1] ?? r[2], body: String(init?.body ?? "") });
      return new Response(null, { status: 204 });
    }
  }
  throw new Error(`Unexpected request ${init?.method ?? "GET"} ${url.href}`);
}) as typeof fetch;

function payCheckout(id: string) {
  const c = sumupCheckouts.get(id)!;
  c.status = "PAID";
  c.transactions = [{ id: `txn-${id}`, transaction_code: `TC-${id}`, status: "SUCCESSFUL", amount: c.amount }];
}

function booking(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "TXDEP1",
    customerReference: "MAT-4001",
    checkoutId: "orig-checkout",
    transactionId: "orig-txn",
    amount: 281,
    totalFare: 281,
    currency: "GBP",
    amountPaidLabel: "£56.00",
    originalAmount: 56,
    onlineAmountPaid: 56,
    cashBalanceDue: 0,
    paymentMethod: "DEPOSIT_CARD_BALANCE",
    cardBalance: { status: "scheduled", depositPercentUsed: 20, balanceAtBookingGbp: 225 },
    customerName: "Sam Rudd",
    customerEmail: "sam@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "Larne port passenger terminal, Larne BT40 1AJ, UK",
    dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
    returnJourney: false,
    tripDate: "2027-06-13",
    tripTime: "15:15",
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    calendarEventIds: [],
    createdAt: "2026-11-03T11:00:00Z",
    ...overrides,
  } as PaidBookingRecord;
}

async function main() {
  // ── Maths + eligibility ──
  const q = calculateCardBalanceQuote(281);
  assert.deepEqual([q.eligible, q.depositGbp, q.balanceGbp], [true, 56, 225], "20% deposit to the pound, balance keeps the rest");
  const q2 = calculateCardBalanceQuote(236.5);
  assert.equal(q2.depositGbp + q2.balanceGbp, 236.5);
  assert.equal(calculateCardBalanceQuote(30).eligible, false, "small fares pay in full");
  const now = new Date("2026-11-03T11:00:00Z");
  assert.equal(isCardBalanceDateEligible("2027-06-13", "15:15", now), true);
  assert.equal(isCardBalanceDateEligible("2026-11-25", "10:00", now), false, "under 30 days: no deposit");
  assert.equal(isCardBalanceDateEligible("2026-12-03", "12:00", now), true, "30 days ahead is enough");

  const schedule = cardBalanceSchedule("2027-06-13", "15:15")!;
  assert.equal(schedule.dueAt.toISOString(), "2027-06-06T14:15:00.000Z", "7 days before (BST)");
  assert.equal(schedule.cancelAt.toISOString(), "2027-06-10T14:15:00.000Z", "3 days before");

  // ── Emails ──
  const receipt = {
    customerName: "Sam Rudd",
    customerEmail: "sam@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "Larne port passenger terminal",
    dropoffLabel: "Dublin Airport",
    returnJourney: false,
    tripDate: "2027-06-13",
    tripTime: "15:15",
    amountPaid: "£56.00",
    paymentReference: "TXDEP1",
    customerReference: "MAT-4001",
    paymentMethod: "DEPOSIT_CARD_BALANCE" as const,
    totalFare: 281,
    onlineAmountPaid: 56,
    cashBalanceDue: 0,
    cardBalanceDue: 225,
    isAirportTrip: true,
    airportCode: "DUB",
  };
  const confirm = buildCustomerConfirmationEmail(receipt as never);
  assert.match(confirm.text, /Deposit paid today: £56\.00/);
  assert.match(confirm.text, /Balance by card: £225\.00 — payment link emailed Sunday,? 6 June 2027/);
  assert.match(confirm.text, /cancelled and the deposit is kept/);
  assert.doesNotMatch(confirm.text, /cash/i, "card-balance bookings never mention cash");
  assert.match(confirm.html, /Deposit paid/);
  const owner = buildOwnerPaidBookingEmail(receipt as never);
  assert.match(owner.body, /DEPOSIT \+ CARD BALANCE/);

  // ── Cron: nothing until 7 days before, then link → reminder → final → auto-cancel ──
  const store = memoryStore();
  const env = {
    TRACKING_STORE: store as unknown as KVNamespace,
    RESEND_API_KEY: "test",
    SUMUP_API_KEY: "sk",
    SUMUP_MERCHANT_CODE: "M1",
    SITE_ORIGIN: "https://www.myairporttaxini.co.uk",
  };
  await savePaidBookingRecord(env.TRACKING_STORE, booking());
  await enqueueCardBalanceBooking(env.TRACKING_STORE, "TXDEP1");
  await enqueueCardBalanceBooking(env.TRACKING_STORE, "TXDEP1");
  assert.equal(JSON.parse(store.kv.get(CARD_BALANCE_QUEUE_KEY)!).length, 1, "queued once");

  const cancels: string[] = [];
  const cancelUnpaid = async (input: { paymentReference: string }) => {
    cancels.push(input.paymentReference);
    const rec = (await getPaidBookingRecord(env.TRACKING_STORE, input.paymentReference))!;
    await savePaidBookingRecord(env.TRACKING_STORE, { ...rec, operationalStatus: "cancelled", cancelledAt: "x" } as PaidBookingRecord);
    return { ok: true };
  };

  let r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-05-01T10:00:00Z"));
  assert.equal(r.linksSent, 0);
  assert.equal(emails.length, 0);

  // Empty queue costs one read.
  const empty = memoryStore();
  const before = empty.reads();
  await processCardBalanceQueue({ ...env, TRACKING_STORE: empty as unknown as KVNamespace }, cancelUnpaid, now);
  assert.equal(empty.reads() - before, 1, "idle run is a single KV read");

  r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-06-06T15:00:00Z"));
  assert.equal(r.linksSent, 1);
  assert.equal(emails.length, 1);
  assert.match(String(emails[0].subject), /Your balance of £225\.00 is now due \(MAT-4001\)/);
  const link = String(emails[0].text).match(/https:\/\/reimagined-octo-meme\.cgr28\.workers\.dev\/card-balance\/pay\?ref=TXDEP1&t=[a-f0-9]+/)?.[0];
  assert.ok(link, "email carries the secure pay link");
  assert.match(String(emails[0].text), /cancelled automatically and the deposit kept/);

  // Same hour again: nothing new.
  r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-06-06T16:00:00Z"));
  assert.equal(emails.length, 1);

  // Pay link: wrong token refused, right token opens SumUp for exactly the balance.
  const bad = await handleCardBalancePay(new Request(link!.replace(/t=[a-f0-9]+/, "t=nope")), env);
  assert.match(bad.headers.get("Location")!, /balance-paid\/\?status=invalid/);
  const pay = await handleCardBalancePay(new Request(link!), env);
  assert.equal(pay.status, 302);
  assert.equal(pay.headers.get("Location"), "https://pay.sumup.com/chk-1");
  assert.equal(sumupCheckouts.get("chk-1")!.amount, 225);
  // Opening it again reuses the same unpaid checkout.
  const pay2 = await handleCardBalancePay(new Request(link!), env);
  assert.equal(pay2.headers.get("Location"), "https://pay.sumup.com/chk-1");
  assert.equal(checkoutSeq, 1);

  // Reminder at 5 days, final + owner heads-up at 4 days.
  r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-06-08T15:00:00Z"));
  assert.match(String(emails.at(-1)!.subject), /^Reminder: your balance/);
  r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-06-09T15:00:00Z"));
  const finals = emails.filter((e) => /Final reminder/.test(String(e.subject)));
  assert.equal(finals.length, 1);
  assert.ok(emails.some((e) => /Heads-up: balance still unpaid/.test(String(e.subject))), "owner told the day before");

  // 3 days before, unpaid → cancelled, deposit kept.
  r = await processCardBalanceQueue(env, cancelUnpaid, new Date("2027-06-10T15:00:00Z"));
  assert.equal(r.cancelled, 1);
  assert.deepEqual(cancels, ["TXDEP1"]);
  const cancelled = (await getPaidBookingRecord(env.TRACKING_STORE, "TXDEP1"))!;
  assert.equal(cancelled.cardBalance?.status, "cancelled_unpaid");
  assert.ok(emails.some((e) => /AUTO-CANCELLED/.test(String(e.subject))));
  assert.equal(JSON.parse(store.kv.get(CARD_BALANCE_QUEUE_KEY)!).length, 0, "dropped from queue");

  // ── Paid path via webhook ──
  emails.length = 0;
  const s2 = memoryStore();
  const env2 = { ...env, TRACKING_STORE: s2 as unknown as KVNamespace };
  await savePaidBookingRecord(env2.TRACKING_STORE, booking({ paymentReference: "TXDEP2", customerReference: "MAT-4002" }));
  await enqueueCardBalanceBooking(env2.TRACKING_STORE, "TXDEP2");
  await processCardBalanceQueue(env2, cancelUnpaid, new Date("2027-06-06T15:00:00Z"));
  const link2 = String(emails[0].text).match(/https:\/\/\S+card-balance\/pay\S+/)![0];
  const open2 = await handleCardBalancePay(new Request(link2), env2);
  const chk2 = open2.headers.get("Location")!.split("/").pop()!;
  assert.equal(await confirmCardBalanceWebhook(env2, chk2), "done", "unpaid webhook is still ours");
  payCheckout(chk2);
  assert.equal(await confirmCardBalanceWebhook(env2, chk2), "done");
  assert.equal(await confirmCardBalanceWebhook(env2, chk2), "done", "idempotent");
  assert.equal(await confirmCardBalanceWebhook(env2, "someone-elses-checkout"), "not_balance");
  const paid = (await getPaidBookingRecord(env2.TRACKING_STORE, "TXDEP2"))!;
  assert.equal(paid.cardBalance?.status, "paid");
  assert.equal(paid.additionalPayments?.length, 1);
  assert.equal(grossAmountCollectedOf(paid), 281);
  assert.equal(paid.amountPaidLabel, "£281.00");
  assert.equal(remainingCardBalanceGbp(paid), 0);
  assert.match(cardBalanceOwnerStatusLine(paid)!, /Card balance paid \(£225\.00\)/);
  assert.equal(emails.filter((e) => /you're all paid/.test(String(e.subject))).length, 1, "one receipt");
  // Cron afterwards: drops it, no reminders.
  const sentBefore = emails.length;
  await processCardBalanceQueue(env2, cancelUnpaid, new Date("2027-06-09T15:00:00Z"));
  assert.equal(emails.length, sentBefore);
  assert.equal(JSON.parse(s2.kv.get(CARD_BALANCE_QUEUE_KEY)!).length, 0);

  // Full cancel + refund: balance refunded on its own transaction first.
  const refunded = await refundPaidCardBalanceBeforeCancel(env2, paid);
  assert.equal(refunded.ok, true);
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].id, `txn-${chk2}`);
  assert.match(refunds[0].body, /225/);
  if (refunded.ok) {
    assert.equal(refunded.record.cardBalance?.status, "refunded");
    assert.equal(netAmountRetainedOf(refunded.record), 56, "only the deposit is left for the main refund");
    const again = await refundPaidCardBalanceBeforeCancel(env2, refunded.record);
    assert.equal(again.ok && again.refundedGbp, 0, "never refunds the balance twice");
  }

  // ── Customer email copy ──
  const final = buildCardBalanceCustomerEmail({ kind: "final", record: booking(), balanceGbp: 225, payUrl: "https://x/pay" });
  assert.match(final.subject, /Final reminder: pay £225\.00 by/);
  assert.match(final.html, /Pay £225\.00 by card/);

  // ── Pickup moved closer after booking: never cancel before the link has been out 48h ──
  emails.length = 0;
  const s3 = memoryStore();
  const env3 = { ...env, TRACKING_STORE: s3 as unknown as KVNamespace };
  await savePaidBookingRecord(env3.TRACKING_STORE, booking({ paymentReference: "TXDEP3", tripDate: "2027-06-08", tripTime: "10:00" }));
  await enqueueCardBalanceBooking(env3.TRACKING_STORE, "TXDEP3");
  const c3: string[] = [];
  const r3 = await processCardBalanceQueue(env3, async (i) => { c3.push(i.paymentReference); return { ok: true }; }, new Date("2027-06-06T09:00:00Z"));
  assert.equal(r3.linksSent, 1);
  assert.equal(c3.length, 0, "link sent first, not cancelled straight away");

  // ── Wiring ──
  const index = readFileSync("workers/addresses/src/index.ts", "utf8");
  assert.match(index, /\/card-balance\/pay/);
  assert.match(index, /confirmCardBalanceWebhook\(env, checkoutId\)/);
  assert.match(index, /processCardBalanceQueue\(env/);
  assert.match(index, /PAYMENT_METHOD_DEPOSIT_CARD_BALANCE/);
  const finalize = readFileSync("workers/addresses/src/finalize-paid-checkout.ts", "utf8");
  assert.match(finalize, /enqueueCardBalanceBooking/);
  const refundsSrc = readFileSync("workers/addresses/src/refund-handlers.ts", "utf8");
  assert.match(refundsSrc, /refundPaidCardBalanceBeforeCancel/);
  const card = readFileSync("src/components/QuoteCard.tsx", "utf8");
  assert.match(card, /data-card-balance-option/);
  assert.match(card, /depositNote=\{quoteDepositNote\}/, "deposit shown under the price on the quote screen");
  assert.match(readFileSync("src/components/QuoteResultShowcase.tsx", "utf8"), /data-quote-deposit-note/);
  assert.equal(cardBalanceQuoteScreenNote(56), "Secure your booking today for just £56 (20% deposit)");
  assert.match(card, /isCardBalanceDateEligible\(tripDate, tripTime\)/);

  console.log("check-card-balance: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

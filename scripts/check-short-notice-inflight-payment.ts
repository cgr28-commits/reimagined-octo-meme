/**
 * Short-notice SumUp checkout opened before paymentExpiresAt may complete
 * afterwards. A new checkout after the deadline stays rejected.
 * Run: npx tsx scripts/check-short-notice-inflight-payment.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeShortNoticePaymentExpiryIso } from "../shared/booking-notice";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  isShortNoticePayable,
  shortNoticeVerifiedCheckoutDecision,
  type ShortNoticeBookingRecord,
} from "../shared/short-notice-booking";
import { createShortNoticeRequest } from "../workers/addresses/src/short-notice-handlers";
import {
  gateShortNoticePaidCheckout,
  handleOwnerApproveShortNotice,
  markShortNoticePaid,
  resolveShortNoticeForPayment,
} from "../workers/addresses/src/short-notice-handlers";
import {
  getShortNoticeByReference,
  getShortNoticeByToken,
  saveShortNoticeBooking,
} from "../workers/addresses/src/short-notice-store";
import {
  getBookingSettings,
  updateCustomerPaymentWindowMinutes,
} from "../workers/addresses/src/booking-settings-store";

const root = path.resolve(import.meta.dirname, "..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function memoryKv(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw);
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  } as unknown as KVNamespace;
}

function sampleBooking(overrides: Partial<PaidBookingDetails> = {}): PaidBookingDetails {
  return {
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    mobileNumber: "07700900123",
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "George Best Belfast City Airport",
    tripDate: "2027-06-15",
    tripTime: "18:00",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon",
    ...overrides,
  };
}

function approvedRecord(input: {
  token: string;
  expiresAt: string;
  checkoutId?: string;
  checkoutStartedAt?: string;
  sumUpCheckoutCreatedAt?: string;
  amount?: number;
}): ShortNoticeBookingRecord {
  const amount = input.amount ?? 55;
  const started = input.checkoutStartedAt ?? new Date(Date.parse(input.expiresAt) - 60_000).toISOString();
  return {
    reference: `MATNI-SN-${input.token}`,
    paymentToken: input.token,
    status: "SHORT_NOTICE_APPROVED",
    amount,
    currency: "GBP",
    amountLabel: `£${amount.toFixed(2)}`,
    booking: sampleBooking(),
    materialFingerprint: "fp",
    underMinimumNotice: true,
    createdAt: started,
    updatedAt: started,
    approvedAt: started,
    approvedAmount: amount,
    paymentExpiresAt: input.expiresAt,
    checkoutId: input.checkoutId,
    checkoutReference: input.checkoutId ? `ref-${input.checkoutId}` : undefined,
    paymentUrl: input.checkoutId ? `https://pay.sumup.example/${input.checkoutId}` : undefined,
    checkoutStartedAt: input.checkoutId ? input.checkoutStartedAt ?? started : undefined,
    sumUpCheckoutCreatedAt: input.sumUpCheckoutCreatedAt,
    history: [],
  };
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

check("Finalize verifies SumUp before the short-notice gate, and the gate is before the booking is saved", () => {
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  const paidAt = finalize.indexOf("if (!isSumUpCheckoutPaid");
  const gateAt = finalize.indexOf("await gateShortNoticePaidCheckout");
  const saveAt = finalize.indexOf("await savePaidBookingRecordFromConfirm");
  assert.ok(paidAt > -1 && gateAt > paidAt && saveAt > gateAt);
  assert.match(finalize, /sumUpCheckoutCreatedAt: checkout\.date/);
  assert.doesNotMatch(read("workers/addresses/src/a2a-quote-handlers.ts"), /customerPaymentWindowMinutes/);
  assert.doesNotMatch(read("shared/booking-notice.ts"), /checkoutStartedAt/);
  const index = read("workers/addresses/src/index.ts");
  const admitAt = index.indexOf("shortNoticeCheckoutAdmittedAt = new Date().toISOString()");
  const createAt = index.lastIndexOf("createSumUpHostedCheckout");
  assert.ok(admitAt > -1 && createAt > admitAt);
});

async function main() {
  await checkAsync("A. Checkout started before the deadline and paid before it is confirmed", async () => {
    const store = memoryKv();
    const now = new Date("2026-07-01T12:00:00.000Z");
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const startedAt = new Date(now.getTime() - 60_000).toISOString();
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-a",
        expiresAt,
        checkoutId: "chk-a",
        checkoutStartedAt: startedAt,
        sumUpCheckoutCreatedAt: startedAt,
      }),
    );
    const gated = await gateShortNoticePaidCheckout(store, {
      token: "token-a",
      checkoutId: "chk-a",
      sumUpAmount: 55,
      currency: "GBP",
      sumUpCheckoutCreatedAt: startedAt,
      now,
    });
    assert.equal(gated.ok, true);
    const paid = await markShortNoticePaid(store, "token-a", "TX-A", "chk-a", { now });
    assert.equal(paid?.status, "SHORT_NOTICE_PAID");
    assert.equal(paid?.paymentReference, "TX-A");
    assert.equal(paid?.checkoutId, "chk-a");
    const stored = await getShortNoticeByToken(store, "token-a");
    assert.equal(stored?.status, "SHORT_NOTICE_PAID");
    assert.equal(stored?.paymentExpiresAt, expiresAt);
  });

  await checkAsync("B. Checkout started before the deadline and paid just after it is confirmed", async () => {
    const store = memoryKv();
    const expiresAt = "2026-07-01T12:30:00.000Z";
    const startedAt = "2026-07-01T12:29:30.000Z";
    const sumUpCreatedAt = "2026-07-01T12:30:01.000Z";
    const paidAt = new Date("2026-07-01T12:30:01.000Z");
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-b",
        expiresAt,
        checkoutId: "chk-b",
        checkoutStartedAt: startedAt,
        sumUpCheckoutCreatedAt: sumUpCreatedAt,
      }),
    );

    const refreshed = await resolveShortNoticeForPayment(store, "token-b", paidAt);
    assert.equal("error" in refreshed, true);
    const expired = await getShortNoticeByToken(store, "token-b");
    assert.equal(expired?.status, "SHORT_NOTICE_EXPIRED");
    assert.equal(expired?.expiryReason, "payment_window");
    assert.equal(expired?.checkoutId, "chk-b");
    assert.equal(expired?.paymentReference, undefined);

    const gated = await gateShortNoticePaidCheckout(store, {
      token: "token-b",
      checkoutId: "chk-b",
      sumUpAmount: 55,
      currency: "GBP",
      sumUpCheckoutCreatedAt: sumUpCreatedAt,
      now: paidAt,
    });
    assert.equal(gated.ok, true, "ok" in gated ? "" : gated.error);
    const paid = await markShortNoticePaid(store, "token-b", "TX-B", "chk-b", {
      now: paidAt,
      sumUpCheckoutCreatedAt: sumUpCreatedAt,
    });
    assert.equal(paid?.status, "SHORT_NOTICE_PAID");
    assert.equal(paid?.paymentReference, "TX-B");
    assert.notEqual(paid?.status, "SHORT_NOTICE_EXPIRED");
    const stored = await getShortNoticeByToken(store, "token-b");
    assert.equal(stored?.status, "SHORT_NOTICE_PAID");
    assert.equal(stored?.paidAt, paidAt.toISOString());
  });

  await checkAsync("C. Starting a checkout after the deadline is rejected", async () => {
    const store = memoryKv();
    const now = new Date("2026-07-01T13:00:00.000Z");
    const expiresAt = "2026-07-01T12:00:00.000Z";
    await saveShortNoticeBooking(
      store,
      approvedRecord({ token: "token-c", expiresAt }),
    );
    const resolved = await resolveShortNoticeForPayment(store, "token-c", now);
    assert.equal("ok" in resolved, false);
    if ("error" in resolved) {
      assert.equal(resolved.status, 409);
      assert.match(resolved.error, /This payment link has expired/);
    }
    const stored = await getShortNoticeByToken(store, "token-c");
    assert.equal(stored?.status, "SHORT_NOTICE_EXPIRED");
    assert.equal(stored?.checkoutId, undefined);
    assert.equal(stored?.paymentReference, undefined);
    assert.equal(isShortNoticePayable(stored!, now), false);
  });

  await checkAsync("D. A fake or swapped checkout id is rejected", async () => {
    const store = memoryKv();
    const now = new Date("2026-07-01T12:10:00.000Z");
    const expiresAt = "2026-07-01T12:30:00.000Z";
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-d",
        expiresAt,
        checkoutId: "chk-real",
        checkoutStartedAt: "2026-07-01T12:00:00.000Z",
        sumUpCheckoutCreatedAt: "2026-07-01T12:00:01.000Z",
      }),
    );
    const gated = await gateShortNoticePaidCheckout(store, {
      token: "token-d",
      checkoutId: "chk-forged",
      sumUpAmount: 55,
      currency: "GBP",
      sumUpCheckoutCreatedAt: "2026-07-01T12:00:01.000Z",
      now,
    });
    assert.equal(gated.ok, false);
    if (!gated.ok) {
      assert.equal(gated.status, 409);
      assert.equal(gated.error, "Payment could not be verified for this booking.");
    }
    const marked = await markShortNoticePaid(store, "token-d", "TX-FAKE", "chk-forged", { now });
    assert.equal(marked, null);
    const stored = await getShortNoticeByToken(store, "token-d");
    assert.equal(stored?.status, "SHORT_NOTICE_APPROVED");
    assert.equal(stored?.paymentReference, undefined);
    assert.equal(stored?.checkoutId, "chk-real");
  });

  await checkAsync("E. A wrong SumUp amount is rejected", async () => {
    const store = memoryKv();
    const now = new Date("2026-07-01T12:10:00.000Z");
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-e",
        expiresAt: "2026-07-01T12:30:00.000Z",
        checkoutId: "chk-e",
        checkoutStartedAt: "2026-07-01T12:00:00.000Z",
        amount: 55,
      }),
    );
    const gated = await gateShortNoticePaidCheckout(store, {
      token: "token-e",
      checkoutId: "chk-e",
      sumUpAmount: 1,
      currency: "GBP",
      sumUpCheckoutCreatedAt: "2026-07-01T12:00:01.000Z",
      now,
    });
    assert.equal(gated.ok, false);
    if (!gated.ok) {
      assert.equal(gated.error, "Payment amount does not match the approved booking.");
    }
    const stored = await getShortNoticeByToken(store, "token-e");
    assert.equal(stored?.status, "SHORT_NOTICE_APPROVED");
    assert.equal(stored?.paymentReference, undefined);
    assert.equal(stored?.approvedAmount, 55);
  });

  await checkAsync("F. A duplicate confirmation is idempotent", async () => {
    const store = memoryKv();
    const now = new Date("2026-07-01T12:10:00.000Z");
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-f",
        expiresAt: "2026-07-01T12:30:00.000Z",
        checkoutId: "chk-f",
        checkoutStartedAt: "2026-07-01T12:00:00.000Z",
      }),
    );
    const first = await markShortNoticePaid(store, "token-f", "TX-F", "chk-f", { now });
    const second = await markShortNoticePaid(store, "token-f", "TX-F-AGAIN", "chk-f", {
      now: new Date(now.getTime() + 5000),
    });
    assert.equal(first?.status, "SHORT_NOTICE_PAID");
    assert.equal(second?.paymentReference, "TX-F");
    assert.equal(second?.paidAt, first?.paidAt);
    const stored = await getShortNoticeByToken(store, "token-f");
    assert.equal(
      stored?.history?.filter((event) => event.type === "booking_confirmed").length,
      1,
    );
    const gatedAgain = await gateShortNoticePaidCheckout(store, {
      token: "token-f",
      checkoutId: "chk-f",
      sumUpAmount: 55,
      currency: "GBP",
      now: new Date(now.getTime() + 60_000),
    });
    assert.equal(gatedAgain.ok, true);
    if (gatedAgain.ok) assert.equal(gatedAgain.record.paymentReference, "TX-F");
  });

  await checkAsync("G. An unpaid checkout after the deadline stays expired and unconfirmed", async () => {
    const store = memoryKv();
    const expiresAt = "2026-07-01T12:00:00.000Z";
    const now = new Date("2026-07-01T12:00:01.000Z");
    await saveShortNoticeBooking(
      store,
      approvedRecord({
        token: "token-g",
        expiresAt,
        checkoutId: "chk-g",
        checkoutStartedAt: "2026-07-01T11:50:00.000Z",
      }),
    );
    const resolved = await resolveShortNoticeForPayment(store, "token-g", now);
    assert.equal("error" in resolved, true);
    const stored = await getShortNoticeByToken(store, "token-g");
    assert.equal(stored?.status, "SHORT_NOTICE_EXPIRED");
    assert.equal(stored?.expiryReason, "payment_window");
    assert.equal(stored?.paymentReference, undefined);
    assert.equal(stored?.paidAt, undefined);
    assert.equal(isShortNoticePayable(stored!, now), false);
    const decision = shortNoticeVerifiedCheckoutDecision({
      paymentExpiresAt: expiresAt,
      now,
      storedCheckoutId: "chk-g",
      presentedCheckoutId: "chk-g",
      checkoutStartedAt: "2026-07-01T11:50:00.000Z",
      sumUpCheckoutCreatedAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    });
    assert.equal(decision.ok, false);
  });

  await checkAsync("H. Changing the payment window after approval does not move the stored deadline", async () => {
    const store = memoryKv({
      "booking:settings": {
        unavailablePeriods: [],
        minimumBookingNoticeHours: 8,
        minimumShortNoticeLeadHours: 1,
        shortNoticeConfirmationWindowHours: 1,
        customerPaymentWindowMinutes: 60,
        updatedAt: "2026-09-30T14:29:26.329Z",
      },
    });
    await updateCustomerPaymentWindowMinutes(store, 60);
    const pickupAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(pickupAt);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    const created = await createShortNoticeRequest({
      store,
      booking: sampleBooking({
        tripDate: `${part("year")}-${part("month")}-${part("day")}`,
        tripTime: `${part("hour")}:${part("minute")}`,
      }),
      amount: 38,
      now: new Date(),
    });
    const approved = await handleOwnerApproveShortNotice(
      new Request("https://example.test/owner/short-notice/approve", {
        method: "POST",
        headers: { "X-Owner-Key": "owner-test" },
      }),
      { TRACKING_STORE: store, OWNER_ACCESS_KEY: "owner-test" },
      { reference: created.record.reference },
      "https://www.myairporttaxini.co.uk",
    );
    assert.equal("ok" in approved, true);
    if (!("ok" in approved)) return;
    const deadline = approved.record.paymentExpiresAt!;
    const expected = computeShortNoticePaymentExpiryIso({
      tripDate: approved.record.booking.tripDate,
      tripTime: approved.record.booking.tripTime,
      approvedAtIso: approved.record.approvedAt!,
      customerPaymentWindowMinutes: 60,
    });
    assert.equal(deadline, expected);
    await updateCustomerPaymentWindowMinutes(store, 15);
    const stored = await getShortNoticeByReference(store, created.record.reference);
    assert.equal(stored?.paymentExpiresAt, deadline);
    const settings = await getBookingSettings(store);
    assert.equal(settings.customerPaymentWindowMinutes, 15);
    assert.equal(settings.shortNoticeConfirmationWindowHours, 1);
  });

  check("A SumUp creation time far after the deadline cannot confirm that checkout", () => {
    const decision = shortNoticeVerifiedCheckoutDecision({
      paymentExpiresAt: "2026-07-01T12:00:00.000Z",
      now: new Date("2026-07-01T13:00:00.000Z"),
      storedCheckoutId: "chk-late",
      presentedCheckoutId: "chk-late",
      checkoutStartedAt: "2026-07-01T11:00:00.000Z",
      sumUpCheckoutCreatedAt: "2026-07-01T12:30:00.000Z",
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, "sumup_date_not_in_window");
  });

  console.log("short-notice in-flight payment checks passed");
}

main();

/**
 * Customer payment window after owner approval.
 * Run: npx tsx scripts/check-customer-payment-window.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CUSTOMER_PAYMENT_LINK_EXPIRED_BODY,
  CUSTOMER_PAYMENT_LINK_EXPIRED_HEADING,
  CUSTOMER_PAYMENT_WINDOW_MINUTES_DEFAULT,
  computeShortNoticePaymentExpiryIso,
  customerPaymentLinkExpiredMessage,
  normalizeCustomerPaymentWindowMinutes,
  parseCustomerPaymentWindowMinutes,
} from "../shared/booking-notice";
import { computeA2aQuoteExpiresAtIso } from "../shared/a2a-personalised-quote";
import { isShortNoticePayable, type ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import { formatCustomerPaymentDeadline, parseLondonLocalDateTime } from "../shared/uk-time";
import { createShortNoticeRequest } from "../workers/addresses/src/short-notice-handlers";
import {
  getBookingSettings,
  normalizeBookingSettings as normalizeStoredBookingSettings,
  updateCustomerPaymentWindowMinutes,
  updateShortNoticeConfirmationWindowHours,
} from "../workers/addresses/src/booking-settings-store";
import {
  handleOwnerApproveShortNotice,
  publicShortNoticeSummary,
  resolveShortNoticeForPayment,
} from "../workers/addresses/src/short-notice-handlers";
import { getShortNoticeByReference, saveShortNoticeBooking } from "../workers/addresses/src/short-notice-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";

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
    tripTime: "14:00",
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon",
    ...overrides,
  };
}

function ownerRequest(): Request {
  return new Request("https://example.test/owner/short-notice/approve", {
    method: "POST",
    headers: { "X-Owner-Key": "owner-test" },
  });
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

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function expiryFor(minutes: number, tripTime: string, approvedAt: string, tripDate = "2026-07-01") {
  return new Date(
    computeShortNoticePaymentExpiryIso({
      tripDate,
      tripTime,
      approvedAtIso: approvedAt,
      now: new Date(approvedAt),
      customerPaymentWindowMinutes: minutes,
    }),
  ).getTime();
}

check("Missing payment-window field falls back to 60 and keeps other Availability settings", () => {
  const stored = normalizeStoredBookingSettings({
    unavailablePeriods: [],
    minimumBookingNoticeHours: 8,
    minimumShortNoticeLeadHours: 1,
    shortNoticeConfirmationWindowHours: 2,
    updatedAt: "2026-09-30T14:29:26.329Z",
  });
  assert.equal(stored.customerPaymentWindowMinutes, 60);
  assert.equal(stored.minimumBookingNoticeHours, 8);
  assert.equal(stored.minimumShortNoticeLeadHours, 1);
  assert.equal(stored.shortNoticeConfirmationWindowHours, 2);
  assert.equal(stored.updatedAt, "2026-09-30T14:29:26.329Z");
  assert.equal(normalizeCustomerPaymentWindowMinutes(undefined), CUSTOMER_PAYMENT_WINDOW_MINUTES_DEFAULT);
  assert.equal(parseCustomerPaymentWindowMinutes(10), null);
  assert.equal(parseCustomerPaymentWindowMinutes(1.5), null);
  assert.equal(parseCustomerPaymentWindowMinutes(4), null);
  assert.equal(parseCustomerPaymentWindowMinutes(240), 240);
});

check("15, 60, and 4-hour windows, pickup cap, and the 15-minute floor", () => {
  const approvedAt = "2026-07-01T10:00:00.000Z";
  const approvedMs = Date.parse(approvedAt);
  // July is BST. 16:00 London is 15:00 UTC, five hours after approval.
  assert.equal(expiryFor(15, "16:00", approvedAt) - approvedMs, 15 * 60 * 1000);
  assert.equal(expiryFor(60, "16:00", approvedAt) - approvedMs, 60 * 60 * 1000);
  assert.equal(expiryFor(240, "16:00", approvedAt) - approvedMs, 4 * 60 * 60 * 1000);

  // Pickup 30 minutes after approval (11:30 London = 10:30 UTC) is sooner than 4 hours.
  const pickupSooner = parseLondonLocalDateTime("2026-07-01", "11:30")!;
  assert.equal(expiryFor(240, "11:30", approvedAt), pickupSooner.getTime());
  assert.ok(expiryFor(15, "11:30", approvedAt) < pickupSooner.getTime());

  // Pickup 10 minutes after approval. Floor must not extend past pickup.
  const closePickup = parseLondonLocalDateTime("2026-07-01", "11:10")!;
  assert.equal(closePickup.getTime() - approvedMs, 10 * 60 * 1000);
  assert.equal(expiryFor(60, "11:10", approvedAt), closePickup.getTime());
  assert.equal(expiryFor(15, "11:10", approvedAt), closePickup.getTime());
  assert.ok(expiryFor(60, "11:10", approvedAt) <= closePickup.getTime());
});

check("BST and GMT deadlines use Europe/London", () => {
  const bst = formatCustomerPaymentDeadline("2026-07-01T22:30:00.000Z");
  assert.deepEqual(bst, { time: "23:30", date: "Wednesday 1 July 2026" });
  const gmt = formatCustomerPaymentDeadline("2026-01-15T23:45:00.000Z");
  assert.deepEqual(gmt, { time: "23:45", date: "Thursday 15 January 2026" });
});

check("Payable immediately before expiry and not one millisecond after", () => {
  const expires = "2026-07-01T11:00:00.000Z";
  const record = {
    status: "SHORT_NOTICE_APPROVED",
    paymentExpiresAt: expires,
  } as ShortNoticeBookingRecord;
  assert.equal(isShortNoticePayable(record, new Date(Date.parse(expires) - 1)), true);
  assert.equal(isShortNoticePayable(record, new Date(Date.parse(expires) + 1)), false);
});

check("A2A validity stays per-quote and is not the new global window", () => {
  const approved = "2026-07-01T10:00:00.000Z";
  assert.equal(
    Date.parse(computeA2aQuoteExpiresAtIso(approved, 60)) - Date.parse(approved),
    60 * 60 * 1000,
  );
  assert.equal(
    Date.parse(computeA2aQuoteExpiresAtIso(approved, 15)) - Date.parse(approved),
    15 * 60 * 1000,
  );
  const page = read("src/app/pay/a2a-quote/A2aQuotePayClient.tsx");
  assert.match(page, /CustomerPaymentDeadline/);
  assert.match(page, /summary\.quoteExpiresAt/);
  assert.doesNotMatch(page, /customerPaymentWindowMinutes/);
  assert.doesNotMatch(read("shared/a2a-personalised-quote.ts"), /customerPaymentWindowMinutes/);
});

check("Pricing, profitability, SumUp amount checks, and the confirmation window are untouched in source", () => {
  const changedConcerns = [
    "shared/universal-distance-pricing.ts",
    "src/lib/owner-profitability-settings.ts",
    "workers/addresses/src/quote-receipt.ts",
    "workers/addresses/src/profitability.ts",
  ];
  for (const file of changedConcerns) {
    assert.doesNotMatch(read(file), /customerPaymentWindowMinutes/);
  }
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  assert.match(
    panel,
    /How long you have to confirm availability before an unanswered short-notice request automatically expires\./,
  );
  assert.match(panel, /Customer payment window after approval/);
  assert.match(panel, /data-customer-payment-window/);
  assert.match(panel, /AWAITING PAYMENT/);
  assert.match(panel, /PAYMENT EXPIRED/);
  assert.match(panel, /Payment due by:/);
  assert.match(panel, /Time remaining:/);
  const pay = read("src/app/pay/short-notice/ShortNoticePayClient.tsx");
  assert.match(pay, /CUSTOMER_PAYMENT_LINK_EXPIRED_HEADING/);
  assert.match(pay, /CustomerPaymentDeadline/);
  assert.match(read("src/components/CustomerPaymentDeadline.tsx"), /Time remaining:/);
  assert.match(read("src/components/CustomerPaymentDeadline.tsx"), /Your journey is reserved pending payment/);
});

async function main() {
await checkAsync("Saved settings without the field read as 60 and do not rewrite an approved deadline", async () => {
  const store = memoryKv({
    "booking:settings": {
      unavailablePeriods: [],
      minimumBookingNoticeHours: 8,
      minimumShortNoticeLeadHours: 1,
      shortNoticeConfirmationWindowHours: 1,
      updatedAt: "2026-09-30T14:29:26.329Z",
    },
  });
  const before = await getBookingSettings(store);
  assert.equal(before.customerPaymentWindowMinutes, 60);
  assert.equal(before.minimumBookingNoticeHours, 8);
  assert.equal(before.shortNoticeConfirmationWindowHours, 1);

  await updateCustomerPaymentWindowMinutes(store, 15);
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
  const env = {
    TRACKING_STORE: store,
    OWNER_ACCESS_KEY: "owner-test",
  };
  const approved = await handleOwnerApproveShortNotice(
    ownerRequest(),
    env,
    { reference: created.record.reference },
    "https://www.myairporttaxini.co.uk",
  );
  assert.ok(!("error" in approved), "error" in approved ? approved.error : "");
  if ("error" in approved) return;
  const firstDeadline = approved.record.paymentExpiresAt!;
  const approvedMs = Date.parse(approved.record.approvedAt!);
  const delta = Date.parse(firstDeadline) - approvedMs;
  assert.ok(Math.abs(delta - 15 * 60 * 1000) < 5000, `expected about 15 minutes, got ${delta}`);

  await updateCustomerPaymentWindowMinutes(store, 240);
  await updateShortNoticeConfirmationWindowHours(store, 2);
  const unchanged = await getShortNoticeByReference(store, created.record.reference);
  assert.equal(unchanged?.paymentExpiresAt, firstDeadline);
  assert.equal(unchanged?.status, "SHORT_NOTICE_APPROVED");
  const settings = await getBookingSettings(store);
  assert.equal(settings.customerPaymentWindowMinutes, 240);
  assert.equal(settings.shortNoticeConfirmationWindowHours, 2);
  assert.equal(settings.minimumBookingNoticeHours, 8);
  assert.equal(settings.minimumShortNoticeLeadHours, 1);

  const again = await handleOwnerApproveShortNotice(
    ownerRequest(),
    env,
    { reference: created.record.reference },
    "https://www.myairporttaxini.co.uk",
  );
  assert.ok(!("error" in again));
  if (!("error" in again)) {
    assert.equal(again.record.paymentExpiresAt, firstDeadline);
  }
});

await checkAsync("Expired payment is rejected on the server and a refresh stays unpaid", async () => {
  const store = memoryKv();
  const expires = new Date(Date.now() - 1000).toISOString();
  const record = {
    reference: "MATNI-SN-EXPIRED",
    paymentToken: "token-expired",
    status: "SHORT_NOTICE_APPROVED",
    amount: 38,
    currency: "GBP",
    amountLabel: "£38.00",
    booking: sampleBooking(),
    materialFingerprint: "fp",
    underMinimumNotice: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: new Date(Date.now() - 60_000).toISOString(),
    approvedAmount: 38,
    paymentExpiresAt: expires,
    history: [],
  } as ShortNoticeBookingRecord;
  await saveShortNoticeBooking(store, record);

  const before = new Date(Date.parse(expires) - 1);
  assert.equal(isShortNoticePayable(record, before), true);

  const resolved = await resolveShortNoticeForPayment(store, "token-expired", new Date());
  assert.ok("error" in resolved);
  if ("error" in resolved) {
    assert.equal(resolved.status, 409);
    assert.equal(resolved.error, customerPaymentLinkExpiredMessage());
    assert.match(resolved.error, new RegExp(CUSTOMER_PAYMENT_LINK_EXPIRED_HEADING));
    assert.match(resolved.error, new RegExp(CUSTOMER_PAYMENT_LINK_EXPIRED_BODY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const stored = await getShortNoticeByReference(store, record.reference);
  assert.equal(stored?.status, "SHORT_NOTICE_EXPIRED");
  assert.equal(stored?.paymentReference, undefined);
  const summary = publicShortNoticeSummary(stored!);
  assert.equal(summary.payable, false);
  assert.equal(summary.expiryReason, "payment_window");
  assert.equal(summary.paymentExpiresAt, expires);
});

console.log("customer payment window checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

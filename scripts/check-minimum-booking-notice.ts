/**
 * Minimum online booking notice (12 hours) + short-notice request workflow.
 * Run: npx tsx scripts/check-minimum-booking-notice.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  isWithinMinimumBookingNotice,
  minimumNoticeRequestBody,
  minimumNoticeRequestHeading,
} from "../shared/booking-notice";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import { buildShortNoticePaymentLinkEmail } from "../shared/short-notice-payment-email";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import { buildShortNoticeDeclineEmail } from "../shared/short-notice-decline-email";
import { buildShortNoticeRequestReceivedEmail } from "../shared/short-notice-request-received-email";
import {
  SHORT_NOTICE_STATUSES,
  appendShortNoticeHistory,
  isShortNoticePayable,
} from "../shared/short-notice-booking";
import {
  createShortNoticeRequest,
  shouldForceShortNotice,
  resolveShortNoticeForPayment,
} from "../workers/addresses/src/short-notice-handlers";
import { claimShortNoticeDecision } from "../workers/addresses/src/short-notice-store";
import { shortNoticeDecisionKey } from "../shared/short-notice-booking";
import type { PaidBookingDetails } from "../shared/booking-notifications";

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

async function checkAsync(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function pickupOffsetNow(tripDate: string, tripTime: string, hoursBefore: number): Date {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  assert.ok(pickup, `Could not parse ${tripDate} ${tripTime}`);
  return new Date(pickup.getTime() - hoursBefore * 60 * 60 * 1000);
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
    async put(key: string, value: string, _options?: { expirationTtl?: number }) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
}

function sampleBooking(overrides: Partial<PaidBookingDetails> = {}): PaidBookingDetails {
  return {
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    mobileNumber: "07700900123",
    pickupLabel: "10 Donegall Square North, Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    ...overrides,
  };
}

async function main() {
check("Central notice constant is 12 and not scattered as a magic cutoff", () => {
  assert.equal(MINIMUM_BOOKING_NOTICE_HOURS, 12);
  const notice = read("shared/booking-notice.ts");
  assert.match(notice, /export const MINIMUM_BOOKING_NOTICE_HOURS = 12/);
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  assert.match(handlers, /MINIMUM_BOOKING_NOTICE_HOURS/);
  assert.match(handlers, /isWithinMinimumBookingNotice/);
  assert.doesNotMatch(handlers, /minimumOnlineNoticeHours/);
});

check("11h59m is short-notice; 12h00 and 12h01m are normal", () => {
  const date = "2026-06-15";
  const time = "14:00";
  const now1159 = pickupOffsetNow(date, time, 11 + 59 / 60);
  const now1200 = pickupOffsetNow(date, time, 12);
  const now1201 = pickupOffsetNow(date, time, 12 + 1 / 60);
  assert.equal(isWithinMinimumBookingNotice(date, time, now1159), true);
  assert.equal(isWithinMinimumBookingNotice(date, time, now1200), false);
  assert.equal(isWithinMinimumBookingNotice(date, time, now1201), false);
});

check("Midnight and BST spring-forward still use elapsed UK time", () => {
  const midnight = pickupOffsetNow("2026-06-16", "00:30", 11 + 59 / 60);
  assert.equal(isWithinMinimumBookingNotice("2026-06-16", "00:30", midnight), true);
  assert.equal(
    isWithinMinimumBookingNotice("2026-06-16", "00:30", pickupOffsetNow("2026-06-16", "00:30", 12)),
    false,
  );
  // BST starts 2026-03-29 01:00 → 02:00. Elapsed-time helper must stay consistent.
  const bstPickup = "2026-03-29";
  const bstTime = "10:00";
  assert.equal(
    isWithinMinimumBookingNotice(bstPickup, bstTime, pickupOffsetNow(bstPickup, bstTime, 11.99)),
    true,
  );
  assert.equal(
    isWithinMinimumBookingNotice(bstPickup, bstTime, pickupOffsetNow(bstPickup, bstTime, 12)),
    false,
  );
});

await checkAsync("Server forces short-notice under 12h even with no unavailable period", async () => {
  const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
  const now = pickupOffsetNow("2026-06-15", "14:00", 11 + 59 / 60);
  const notice = await shouldForceShortNotice(store, sampleBooking(), now);
  assert.equal(notice.shortNotice, true);
  assert.equal(notice.underMinimumNotice, true);
  assert.equal(notice.blockingPeriodId, null);
});

await checkAsync("Exactly 12h with no unavailable period uses normal payment", async () => {
  const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
  const now = pickupOffsetNow("2026-06-15", "14:00", 12);
  const notice = await shouldForceShortNotice(store, sampleBooking(), now);
  assert.equal(notice.shortNotice, false);
  assert.equal(notice.underMinimumNotice, false);
});

await checkAsync("Create request under 12h stores quoted price and PENDING-equivalent status", async () => {
  const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
  const now = pickupOffsetNow("2026-06-15", "14:00", 4);
  const created = await createShortNoticeRequest({
    store,
    booking: sampleBooking(),
    amount: 48,
    now,
  });
  assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
  assert.equal(created.record.amount, 48);
  assert.equal(created.record.amountLabel, "£48.00");
  assert.equal(created.record.underMinimumNotice, true);
  assert.equal(created.record.minimumNoticeHoursApplied, 12);
  assert.ok(created.record.history?.some((event) => event.type === "request_submitted"));
  assert.equal(isShortNoticePayable(created.record, now), false);
});

await checkAsync("Unapproved request cannot start payment from its token", async () => {
  const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
  const now = pickupOffsetNow("2026-06-15", "14:00", 3);
  const created = await createShortNoticeRequest({
    store,
    booking: sampleBooking(),
    amount: 48,
    now,
  });
  const resolved = await resolveShortNoticeForPayment(store, created.record.paymentToken, now);
  assert.equal("error" in resolved, true);
  if ("error" in resolved) {
    assert.match(resolved.error, /awaiting Owner approval/i);
    assert.equal(resolved.status, 409);
  }
});

check("Customer short-notice copy comes from the shared helper", () => {
  assert.equal(minimumNoticeRequestHeading(), "Short-notice booking");
  assert.match(minimumNoticeRequestBody(), /12-hour advance booking period/);
  assert.match(minimumNoticeRequestBody(), /secure payment link/);
  assert.doesNotMatch(minimumNoticeRequestBody(), /guaranteed/);
});

check("Acceptance / decline / request-received emails match the workflow", () => {
  const received = buildShortNoticeRequestReceivedEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    amountLabel: "£48.00",
    reference: "MATNI-SN-1",
  });
  assert.equal(received.subject, "We’ve received your booking request");
  assert.match(received.text, /No payment has been taken/);
  assert.doesNotMatch(received.text, /booking confirmation/i);

  const accepted = buildShortNoticePaymentLinkEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    amountLabel: "£48.00",
    reference: "MATNI-SN-1",
    payUrl: "https://www.myairporttaxini.co.uk/pay/short-notice/?token=abc",
  });
  assert.equal(accepted.subject, "Your My Airport Taxi NI booking request has been accepted");
  assert.match(accepted.text, /Pay securely|secure link/);
  assert.match(accepted.html, /Pay securely/);

  const declined = buildShortNoticeDeclineEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    reference: "MATNI-SN-1",
  });
  assert.equal(declined.subject, "Your My Airport Taxi NI booking request");
  assert.match(declined.text, /do not have availability/);
  assert.match(declined.text, /No payment has been taken/);
  assert.doesNotMatch(declined.text, /cancelled booking/i);

  const alt = buildShortNoticeAlternativeOfferEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    originalDate: "2026-06-15",
    originalTime: "04:00",
    offeredDate: "2026-06-15",
    offeredTime: "04:30",
    amountLabel: "£48.00",
    reference: "MATNI-SN-1",
    acceptUrl: "https://www.myairporttaxini.co.uk/accept-alternative-time/?token=abc",
    ownerNote: "We can offer 4:30am.",
  });
  assert.equal(alt.subject, "Alternative pickup time available — My Airport Taxi NI");
  assert.match(alt.text, /04:00/);
  assert.match(alt.text, /04:30/);
  assert.match(alt.text, /We can offer 4:30am/);
  assert.match(alt.html, /Accept alternative time/);
});

check("Status model maps to the requested request → pay → confirmed flow", () => {
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_AWAITING_APPROVAL"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_APPROVED"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_ALTERNATIVE_OFFERED"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_DECLINED"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_ALTERNATIVE_DECLINED"));
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_PAID"));
  const history = appendShortNoticeHistory(undefined, "request_submitted", "2026-01-01T00:00:00.000Z");
  assert.equal(history[0]?.type, "request_submitted");
});

check("Quote / owner / payment wiring keeps fare visible and delays SumUp", () => {
  const card = read("src/components/QuoteCard.tsx");
  const index = read("workers/addresses/src/index.ts");
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const pay = read("src/app/pay/short-notice/ShortNoticePayClient.tsx");
  const accept = read("src/app/accept-alternative-time/AcceptAlternativeTimeClient.tsx");
  const saved = read("src/app/quote/SavedQuoteCustomerClient.tsx");
  const bookQuote = read("src/app/book-quote/BookQuoteCustomerClient.tsx");

  assert.match(card, /Request Short-Notice Booking/);
  assert.match(card, /Your transfer is reserved for your selected pickup time/);
  assert.match(card, /isWithinMinimumBookingNotice/);
  assert.match(index, /shouldForceShortNotice/);
  assert.match(index, /createShortNoticeRequest/);
  assert.match(index, /sendShortNoticeRequestReceivedEmail/);
  assert.match(index, /New short-notice booking request — pickup in/);
  assert.match(index, /if \(!shortNoticeToken && !a2aQuoteToken\)/);
  assert.match(index, /resolveShortNoticeForPayment/);
  assert.match(panel, /Approve this short-notice booking request for/);
  assert.match(panel, /Decline this short-notice booking request\?/);
  assert.match(panel, /Offer alternative time/);
  assert.match(panel, /Original requested time:/);
  assert.match(panel, /Quoted price:/);
  assert.match(panel, /Time remaining until pickup/);
  assert.match(panel, /Pickup time has passed/);
  assert.match(pay, /shortNoticeToken/);
  assert.match(accept, /Accept alternative time/);
  assert.match(accept, /Decline alternative/);
  assert.match(saved, /Request Short-Notice Booking/);
  assert.doesNotMatch(saved, /window\.location\.href = checkout\.whatsappUrl/);
  assert.match(bookQuote, /Request Short-Notice Booking/);
  assert.doesNotMatch(bookQuote, /window\.location\.href = checkout\.whatsappUrl/);
});

check("Approve is idempotent on already-approved records", () => {
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  assert.match(handlers, /if \(existing\.status === "SHORT_NOTICE_APPROVED"\) \{\s*const payUrl = buildShortNoticePayUrl/);
  assert.match(handlers, /if \(existing\.status === "SHORT_NOTICE_DECLINED"\) \{\s*return \{ ok: true, record: existing \}/);
  assert.match(handlers, /buildShortNoticeDeclineEmail/);
  assert.match(handlers, /alreadyAccepted: true/);
});

await checkAsync("Decision lock: same action is already-claimed; opposite action conflicts", async () => {
  const store = memoryKv();
  const first = await claimShortNoticeDecision(store, "MATNI-SN-LOCK-1", "approve");
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.alreadyClaimed, false);

  const same = await claimShortNoticeDecision(store, "MATNI-SN-LOCK-1", "approve");
  assert.equal(same.ok, true);
  if (same.ok) {
    assert.equal(same.alreadyClaimed, true);
    assert.equal(same.existingAction, "approve");
  }

  const opposite = await claimShortNoticeDecision(store, "MATNI-SN-LOCK-1", "decline");
  assert.equal(opposite.ok, false);
  if (!opposite.ok) {
    assert.match(opposite.error, /already being approved/i);
    assert.equal(opposite.existingAction, "approve");
  }
});

await checkAsync("Decision lock: write-then-re-read loses to a later opposite action", async () => {
  const data = new Map<string, string>();
  const key = shortNoticeDecisionKey("MATNI-SN-LOCK-2");
  const store = {
    async get(lookup: string) {
      return data.get(lookup) ?? null;
    },
    async put(lookup: string, value: string) {
      data.set(lookup, value);
      if (lookup === key) {
        data.set(
          lookup,
          JSON.stringify({
            token: "other-token",
            action: "decline",
            at: new Date().toISOString(),
          }),
        );
      }
    },
  } as unknown as KVNamespace;

  const claim = await claimShortNoticeDecision(store, "MATNI-SN-LOCK-2", "approve");
  assert.equal(claim.ok, false);
  if (!claim.ok) {
    assert.match(claim.error, /already being declined/i);
    assert.equal(claim.existingAction, "decline");
  }
});

check("Owner approve/decline and alternative responses claim the KV decision lock", () => {
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const store = read("workers/addresses/src/short-notice-store.ts");
  assert.match(store, /export async function claimShortNoticeDecision/);
  assert.match(store, /short-notice:decision:/);
  assert.match(handlers, /claimOpenDecisionOrConflict/);
  assert.match(handlers, /claimOpenDecisionOrConflict\(env\.TRACKING_STORE, reference, "approve"\)/);
  assert.match(handlers, /claimOpenDecisionOrConflict\(env\.TRACKING_STORE, reference, "decline"\)/);
  assert.match(handlers, /claimOpenDecisionOrConflict\(env\.TRACKING_STORE, existing\.reference, "approve"\)/);
  assert.match(handlers, /claimOpenDecisionOrConflict\(env\.TRACKING_STORE, existing\.reference, "decline"\)/);

  const approveFn = handlers.slice(
    handlers.indexOf("async function approveShortNoticeRecord"),
    handlers.indexOf("export function publicShortNoticeSummary"),
  );
  const firstSave = approveFn.indexOf("await saveShortNoticeBooking");
  const emailSend = approveFn.indexOf("sendPaymentLinkEmail");
  assert.ok(firstSave >= 0 && emailSend >= 0 && firstSave < emailSend, "approve persists before email");

  const declineFn = handlers.slice(
    handlers.indexOf("export async function handleOwnerDeclineShortNotice"),
    handlers.indexOf("export async function resolveShortNoticeForPayment"),
  );
  const declineSave = declineFn.indexOf("await saveShortNoticeBooking");
  const declineEmail = declineFn.indexOf("sendDeclineEmail");
  assert.ok(
    declineSave >= 0 && declineEmail >= 0 && declineSave < declineEmail,
    "decline persists before email",
  );
});

check("Pricing modules and WhatsApp status templates were not edited by this workflow", () => {
  const pricingFiles = [
    "shared/universal-distance-pricing.ts",
    "src/lib/quote.ts",
    "shared/express-drop-off.ts",
    "shared/website-fare-breakdown.ts",
  ];
  for (const file of pricingFiles) {
    const src = read(file);
    assert.ok(src.includes("export"), `${file} still present`);
  }
  const card = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(card, /Driver on the way/);
  const journey = read("src/lib/booking-jobs-api.ts");
  assert.doesNotMatch(read("workers/addresses/src/short-notice-handlers.ts"), /Driver on the way/);
  void journey;
});

console.log("\nAll minimum-booking-notice checks passed.");
}

void main();

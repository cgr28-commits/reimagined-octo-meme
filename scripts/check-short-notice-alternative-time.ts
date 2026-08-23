/**
 * Regression: Offer alternative time workflow for short-notice bookings.
 * Run: npx tsx scripts/check-short-notice-alternative-time.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import {
  SHORT_NOTICE_STATUSES,
  isShortNoticeOpenStatus,
  isShortNoticePayable,
} from "../shared/short-notice-booking";
import { materialJourneyFingerprint } from "../shared/booking-notice";
import {
  buildShortNoticeAcceptUrl,
  buildShortNoticePayUrl,
  shouldAutoSendPaymentLinkEmail,
} from "../workers/addresses/src/short-notice-handlers";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";

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

check("Status model includes ALTERNATIVE_OFFERED and stays open in Owner list", () => {
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_ALTERNATIVE_OFFERED"));
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_ALTERNATIVE_OFFERED"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_AWAITING_APPROVAL"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_APPROVED"), true);
  assert.equal(isShortNoticeOpenStatus("SHORT_NOTICE_DECLINED"), false);
});

check("Alternative offer email: Accept CTA, requested vs offered, unchanged amount", () => {
  const email = buildShortNoticeAlternativeOfferEmail({
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "BFS",
    originalDate: "2026-08-21",
    originalTime: "14:00",
    offeredDate: "2026-08-22",
    offeredTime: "15:00",
    amountLabel: "£55.00",
    reference: "MATNI-SN-TEST",
    acceptUrl:
      "https://www.myairporttaxini.co.uk/accept-alternative-time/?token=abc123",
    ownerNote: "We can do 3pm",
  });
  assert.match(email.subject, /Alternative pickup time/);
  assert.match(email.text, /Hi Jill,/);
  assert.match(email.text, /Requested: 2026-08-21 14:00/);
  assert.match(email.text, /Offered: 2026-08-22 15:00/);
  assert.match(email.text, /Amount due \(unchanged\): £55\.00/);
  assert.match(email.html, /Accept new pickup time/);
  assert.match(email.html, /accept-alternative-time\/\?token=abc123/);
  assert.match(email.html, /We can do 3pm/);
});

check("Offered alternative is not payable until accepted/approved", () => {
  const now = Date.now();
  const offered = {
    reference: "MATNI-SN-ALT",
    paymentToken: "pay",
    acceptToken: "accept",
    status: "SHORT_NOTICE_ALTERNATIVE_OFFERED" as const,
    amount: 55,
    currency: "GBP",
    amountLabel: "£55.00",
    booking: {
      customerName: "Jill",
      customerEmail: "jill@example.com",
      tripDate: "2026-08-21",
      tripTime: "14:00",
    } as never,
    materialFingerprint: "x",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    offeredDate: "2026-08-22",
    offeredTime: "15:00",
    paymentExpiresAt: new Date(now + 3_600_000).toISOString(),
  };
  assert.equal(isShortNoticePayable(offered), false);
  assert.equal(
    shouldAutoSendPaymentLinkEmail(
      offered,
      buildShortNoticePayUrl("https://www.myairporttaxini.co.uk", "pay"),
    ),
    false,
  );
});

check("Friday → Saturday alternative keeps the same quoted fare", () => {
  const cityHall = "Belfast City Hall, Belfast BT1 5GS";
  const friday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
  });
  const saturday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-22",
    outboundTime: "15:00",
  });
  assert.ok(friday && saturday);
  assert.equal(saturday!.amount, friday!.amount);
  assert.equal(friday!.premiumApplied, false);
  assert.equal(saturday!.premiumApplied, false);

  // Fingerprint changes with date/time but amount stays locked for the booking.
  const amount = friday!.amount;
  const before = materialJourneyFingerprint({
    pickupLabel: cityHall,
    dropoffLabel: "BFS",
    tripDate: "2026-08-21",
    tripTime: "14:00",
    vehicle: SALOON_VEHICLE,
    amount,
  });
  const after = materialJourneyFingerprint({
    pickupLabel: cityHall,
    dropoffLabel: "BFS",
    tripDate: "2026-08-22",
    tripTime: "15:00",
    vehicle: SALOON_VEHICLE,
    amount,
  });
  assert.notEqual(before, after);
});

check("Worker + UI wiring for offer / accept / withdraw / resend", () => {
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const index = read("workers/addresses/src/index.ts");
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const api = read("src/lib/short-notice-api.ts");
  const acceptPage = read("src/app/accept-alternative-time/AcceptAlternativeTimeClient.tsx");
  const store = read("workers/addresses/src/short-notice-store.ts");

  assert.match(handlers, /handleOwnerOfferAlternativeTime/);
  assert.match(handlers, /handlePublicAcceptAlternativeTime/);
  assert.match(handlers, /handleOwnerWithdrawAlternativeOffer/);
  assert.match(handlers, /handleOwnerResendAlternativeEmail/);
  assert.match(handlers, /buildShortNoticeAcceptUrl/);
  assert.match(handlers, /acceptedAlternativeAt/);
  const offerFn = handlers.slice(
    handlers.indexOf("export async function handleOwnerOfferAlternativeTime"),
    handlers.indexOf("export async function handleOwnerResendAlternativeEmail"),
  );
  assert.doesNotMatch(offerFn, /createCheckout|SUMUP_API|payments\/checkout/i);
  assert.match(offerFn, /sendAlternativeOfferEmail/);
  assert.match(index, /offer-alternative/);
  assert.match(index, /accept-alternative/);
  assert.match(index, /withdraw-alternative/);
  assert.match(index, /resend-alternative-email/);
  assert.match(panel, /Approve requested time/);
  assert.match(panel, /Offer alternative time/);
  assert.match(panel, /Decline — no availability/);
  assert.match(panel, /Resend alternative-time email/);
  assert.match(panel, /Change offered time/);
  assert.match(panel, /Withdraw offer/);
  assert.match(panel, /Awaiting customer acceptance/);
  assert.match(api, /offerAlternativeShortNoticeTime/);
  assert.match(api, /acceptAlternativeShortNoticeTime/);
  assert.match(acceptPage, /Accept new pickup time/);
  assert.match(acceptPage, /Amount due \(unchanged\)/);
  assert.match(store, /getShortNoticeByAcceptToken/);
  assert.match(store, /shortNoticeAcceptTokenKey|SHORT_NOTICE_ALTERNATIVE_OFFERED/);
});

check("Accept URL helper points at accept-alternative-time page", () => {
  assert.equal(
    buildShortNoticeAcceptUrl("https://www.myairporttaxini.co.uk", "tok"),
    "https://www.myairporttaxini.co.uk/accept-alternative-time/?token=tok",
  );
});

check("Shared alternative email synced into Worker", () => {
  assert.equal(
    fs.existsSync(path.join(root, "workers/addresses/shared/short-notice-alternative-email.ts")),
    true,
  );
  const booking = read("workers/addresses/shared/short-notice-booking.ts");
  assert.match(booking, /SHORT_NOTICE_ALTERNATIVE_OFFERED/);
  assert.match(booking, /acceptToken/);
  assert.match(booking, /originalRequestedDate/);
});

console.log("\nAll short-notice alternative-time checks passed.");

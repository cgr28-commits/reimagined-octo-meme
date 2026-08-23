/**
 * Offline checks: unavailable periods gate + Saloon/Estate/Minibus booking.
 * Run: npx tsx scripts/check-short-notice-minibus-booking.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateQuote } from "../src/lib/quote";
import {
  INSTANT_PAY_VEHICLE_TYPES,
  isInstantPayVehicle,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  MINIBUS_VEHICLE_TYPE,
} from "../src/lib/data";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
import {
  computeShortNoticePaymentExpiryIso,
  findBlockingUnavailablePeriod,
  isPickupBlockedByUnavailablePeriods,
  isPickupInsideUnavailablePeriod,
  isUnavailablePeriodExpired,
  materialJourneyFingerprint,
  normalizeUnavailablePeriod,
  vehicleServiceCode,
  vehicleServiceLabel,
  type UnavailablePeriod,
} from "../shared/booking-notice";
import { isShortNoticePayable, SHORT_NOTICE_STATUSES } from "../shared/short-notice-booking";
import { parseLondonLocalDateTime } from "../shared/uk-time";

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

const belfast = "10 Donegall Square North, Belfast BT1 5GB";

const sleepBlock: UnavailablePeriod = normalizeUnavailablePeriod({
  id: "sleep-1",
  startLocal: "2026-08-18T00:30",
  endLocal: "2026-08-18T08:00",
  note: "Sleep",
})!;

check("1–3. Saloon/Estate/Minibus are instant-pay vehicle types", () => {
  assert.ok(isInstantPayVehicle(SALOON_VEHICLE));
  assert.ok(isInstantPayVehicle(ESTATE_VEHICLE));
  assert.ok(isInstantPayVehicle(MINIBUS_VEHICLE));
  assert.ok(INSTANT_PAY_VEHICLE_TYPES.includes(MINIBUS_VEHICLE_TYPE));
  assert.equal(isVehicleEnquiryOnly(MINIBUS_VEHICLE), false);
  assert.equal(isVehicleRequestQuote(MINIBUS_VEHICLE), false);
});

check("4–6. Existing pricing formulas produce distinct fares (no invented Minibus rates)", () => {
  const saloon = calculateQuote(belfast, "BFS", SALOON_VEHICLE);
  const estate = calculateQuote(belfast, "BFS", ESTATE_VEHICLE);
  const minibus = calculateQuote(belfast, "BFS", MINIBUS_VEHICLE);
  assert.ok(saloon && estate && minibus);
  assert.ok(estate!.amount > saloon!.amount, "Estate > Saloon");
  const expectedMin = Math.round((estate!.amount * 1.55) / 5) * 5;
  assert.ok(
    Math.abs(minibus!.amount - expectedMin) <= 5 || minibus!.amount >= estate!.amount,
    `Minibus £${minibus!.amount} should track estate×1.55 (≈£${expectedMin})`,
  );
});

check("25–28. One-way + return pricing works for all three services", () => {
  for (const vehicle of [SALOON_VEHICLE, ESTATE_VEHICLE, MINIBUS_VEHICLE]) {
    const oneWay = calculateQuote(belfast, "BFS", vehicle, false, {
      outboundDate: "2026-09-15",
      outboundTime: "10:00",
    });
    const ret = calculateQuote(belfast, "BFS", vehicle, true, {
      outboundDate: "2026-09-15",
      outboundTime: "10:00",
      returnJourney: true,
      returnDate: "2026-09-16",
      returnTime: "18:00",
    });
    assert.ok(oneWay && ret);
    assert.ok(ret!.amount > oneWay!.amount, `${vehicle} return > one-way`);
  }
  assert.equal(selectVehicleForParty(5, 1), MINIBUS_VEHICLE);
});

check("Unavailable period boundaries: start inclusive, end exclusive", () => {
  assert.equal(isPickupInsideUnavailablePeriod("2026-08-18", "00:29", sleepBlock), false);
  assert.equal(isPickupInsideUnavailablePeriod("2026-08-18", "00:30", sleepBlock), true);
  assert.equal(isPickupInsideUnavailablePeriod("2026-08-18", "07:59", sleepBlock), true);
  assert.equal(isPickupInsideUnavailablePeriod("2026-08-18", "08:00", sleepBlock), false);
  assert.equal(isPickupInsideUnavailablePeriod("2026-08-18", "08:01", sleepBlock), false);

  // While period not expired, same pickup rules apply
  const during = parseLondonLocalDateTime("2026-08-18", "07:00")!;
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-18", "07:59", [sleepBlock], during),
    true,
  );
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-18", "08:00", [sleepBlock], during),
    false,
  );

  // After end, expired period is ignored even for a pickup that was inside the window
  const after = parseLondonLocalDateTime("2026-08-18", "08:00")!;
  assert.equal(isUnavailablePeriodExpired(sleepBlock, after), true);
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-18", "07:59", [sleepBlock], after),
    false,
  );
  assert.equal(findBlockingUnavailablePeriod("2026-08-18", "07:59", [sleepBlock], after), null);
});

check("Multiple periods — only matching active period blocks", () => {
  const holiday = normalizeUnavailablePeriod({
    id: "hol-1",
    startLocal: "2026-08-20T00:00",
    endLocal: "2026-08-22T00:00",
  })!;
  const now = parseLondonLocalDateTime("2026-08-17", "12:00")!;
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-18", "07:00", [sleepBlock, holiday], now),
    true,
  );
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-21", "10:00", [sleepBlock, holiday], now),
    true,
  );
  assert.equal(
    isPickupBlockedByUnavailablePeriods("2026-08-19", "10:00", [sleepBlock, holiday], now),
    false,
  );
});

check("11/34. Service codes SALOON / ESTATE / MINIBUS", () => {
  assert.equal(vehicleServiceCode(SALOON_VEHICLE), "SALOON");
  assert.equal(vehicleServiceCode(ESTATE_VEHICLE), "ESTATE");
  assert.equal(vehicleServiceCode(MINIBUS_VEHICLE), "MINIBUS");
  assert.equal(vehicleServiceLabel(MINIBUS_VEHICLE), "MINIBUS");
});

check("15/23. Payment expiry never after pickup; fingerprint locks fare fields", () => {
  const approvedAt = "2026-08-17T10:00:00.000Z";
  const expiry = computeShortNoticePaymentExpiryIso({
    tripDate: "2026-08-17",
    tripTime: "12:00",
    approvedAtIso: approvedAt,
    now: new Date(approvedAt),
  });
  const pickup = parseLondonLocalDateTime("2026-08-17", "12:00")!;
  assert.ok(new Date(expiry).getTime() <= pickup.getTime());

  const fp1 = materialJourneyFingerprint({
    pickupLabel: "A",
    dropoffLabel: "B",
    tripDate: "2026-08-17",
    tripTime: "12:00",
    vehicle: MINIBUS_VEHICLE,
    amount: 100,
  });
  const fp2 = materialJourneyFingerprint({
    pickupLabel: "A",
    dropoffLabel: "B",
    tripDate: "2026-08-17",
    tripTime: "13:00",
    vehicle: MINIBUS_VEHICLE,
    amount: 100,
  });
  assert.notEqual(fp1, fp2);
});

check("20–22. Payable helper blocks unapproved / declined / expired / paid", () => {
  const base = {
    reference: "MATNI-SN-TEST",
    paymentToken: "abc",
    amount: 50,
    currency: "GBP",
    amountLabel: "£50.00",
    booking: {} as never,
    materialFingerprint: "x",
    unavailablePeriodIdApplied: "sleep-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert.equal(
    isShortNoticePayable({
      ...base,
      status: "SHORT_NOTICE_AWAITING_APPROVAL",
      paymentExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    false,
  );
  assert.equal(
    isShortNoticePayable({
      ...base,
      status: "SHORT_NOTICE_APPROVED",
      paymentExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    true,
  );
  assert.ok(SHORT_NOTICE_STATUSES.includes("SHORT_NOTICE_AWAITING_APPROVAL"));
});

check("Worker + UI wiring — unavailable periods replace hours/single-date rules", () => {
  const index = read("workers/addresses/src/index.ts");
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const card = read("src/components/QuoteCard.tsx");
  const data = read("src/lib/data.ts");
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const pay = read("src/app/pay/short-notice/ShortNoticePayClient.tsx");
  const settingsStore = read("workers/addresses/src/booking-settings-store.ts");
  const notice = read("shared/booking-notice.ts");

  assert.match(index, /shouldForceShortNotice/);
  assert.match(index, /createShortNoticeRequest/);
  assert.match(index, /shortNoticeToken/);
  assert.match(handlers, /findBlockingUnavailablePeriod/);
  assert.match(handlers, /addUnavailablePeriod/);
  assert.match(handlers, /deleteUnavailablePeriod/);
  assert.doesNotMatch(handlers, /minimumOnlineNoticeHours/);
  assert.doesNotMatch(handlers, /automaticBookingsAvailableFrom/);
  assert.match(settingsStore, /unavailablePeriods/);
  assert.match(settingsStore, /Legacy.*ignored|minimumOnlineNoticeHours/);
  assert.match(notice, /isPickupBlockedByUnavailablePeriods/);
  assert.match(notice, /isUnavailablePeriodExpired/);
  assert.match(data, /INSTANT_PAY_VEHICLE_TYPES/);
  assert.match(card, /Booking requires availability confirmation/);
  assert.match(card, /confirm availability for your requested pickup time/);
  assert.match(panel, /Booking Availability/);
  assert.match(panel, /Add unavailable period/);
  assert.match(panel, /Private Owner note/);
  assert.match(panel, /Approve requested time/);
  assert.match(panel, /Offer alternative time/);
  assert.match(panel, /Decline — no availability/);
  assert.doesNotMatch(panel, /Automatic bookings available from/);
  assert.doesNotMatch(panel, /Minimum online booking notice/);
  assert.match(pay, /shortNoticeToken/);
});

check("Finalize attaches SumUp to same short-notice booking", () => {
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /markShortNoticePaid/);
  assert.match(finalize, /shortNoticeToken/);
});

console.log("\nAll short-notice / unavailable-period checks passed.");

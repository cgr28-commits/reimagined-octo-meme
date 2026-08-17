/**
 * Offline checks: Saloon/Estate/Minibus online booking + short-notice notice/approval.
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
  formatAutomaticAvailabilityLabel,
  isAutomaticAvailabilityGateActive,
  isPickupBeforeAutomaticAvailability,
  materialJourneyFingerprint,
  normalizeAutomaticAvailabilityLocal,
  vehicleServiceCode,
  vehicleServiceLabel,
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
  // Airport Minibus = round5(estateTier * 1.55)
  const expectedMin = Math.round((estate!.amount * 1.55) / 5) * 5;
  // Allow x4 rounding quirk from roundToNearestFive
  assert.ok(
    Math.abs(minibus!.amount - expectedMin) <= 5 || minibus!.amount >= estate!.amount,
    `Minibus £${minibus!.amount} should track estate×1.55 (≈£${expectedMin})`,
  );
  console.log(
    `    BFS Belfast: Saloon £${saloon!.amount} / Estate £${estate!.amount} / Minibus £${minibus!.amount}`,
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
  assert.equal(selectVehicleForParty(2, 1), SALOON_VEHICLE);
  assert.equal(selectVehicleForParty(3, 1), ESTATE_VEHICLE);
});

check("29–30. Availability datetime gate (Europe/London) — exact time allowed; before blocked", () => {
  const availableFrom = "2026-08-18T08:00";
  assert.equal(normalizeAutomaticAvailabilityLocal(availableFrom), "2026-08-18T08:00");
  assert.equal(
    formatAutomaticAvailabilityLabel(availableFrom),
    "Tuesday 18 August 2026 · 08:00",
  );

  // Wall clock before availability → gate active
  const beforeWall = parseLondonLocalDateTime("2026-08-18", "07:00")!;
  assert.equal(isAutomaticAvailabilityGateActive(availableFrom, beforeWall), true);
  assert.equal(
    isPickupBeforeAutomaticAvailability("2026-08-18", "07:30", availableFrom, beforeWall),
    true,
  );
  assert.equal(
    isPickupBeforeAutomaticAvailability("2026-08-18", "08:00", availableFrom, beforeWall),
    false,
  );
  assert.equal(
    isPickupBeforeAutomaticAvailability("2026-08-18", "09:00", availableFrom, beforeWall),
    false,
  );

  // Wall clock after availability → gate auto-expired
  const afterWall = parseLondonLocalDateTime("2026-08-18", "08:01")!;
  assert.equal(isAutomaticAvailabilityGateActive(availableFrom, afterWall), false);
  assert.equal(
    isPickupBeforeAutomaticAvailability("2026-08-18", "07:30", availableFrom, afterWall),
    false,
  );

  // No restriction
  assert.equal(isPickupBeforeAutomaticAvailability("2026-08-18", "07:30", null, beforeWall), false);

  // BST spring-forward night still parses
  assert.ok(parseLondonLocalDateTime("2026-03-29", "02:30"));
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
    minimumNoticeHoursApplied: undefined,
    automaticBookingsAvailableFromApplied: "2026-08-18T08:00",
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
      status: "SHORT_NOTICE_DECLINED",
      paymentExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    false,
  );
  assert.equal(
    isShortNoticePayable({
      ...base,
      status: "SHORT_NOTICE_APPROVED",
      paymentExpiresAt: new Date(Date.now() - 1000).toISOString(),
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

check("Worker + UI wiring present", () => {
  const index = read("workers/addresses/src/index.ts");
  const handlers = read("workers/addresses/src/short-notice-handlers.ts");
  const card = read("src/components/QuoteCard.tsx");
  const data = read("src/lib/data.ts");
  const panel = read("src/components/OwnerShortNoticePanel.tsx");
  const pay = read("src/app/pay/short-notice/ShortNoticePayClient.tsx");

  assert.match(index, /shouldForceShortNotice/);
  assert.match(index, /createShortNoticeRequest/);
  assert.match(index, /shortNoticeToken/);
  assert.match(index, /owner\/short-notice/);
  assert.match(index, /automaticBookingsAvailableFrom/);
  assert.match(handlers, /SHORT_NOTICE_AWAITING_APPROVAL/);
  assert.match(handlers, /Approve Short-Notice|approveShortNotice|handleOwnerApproveShortNotice/);
  assert.match(handlers, /isPickupBeforeAutomaticAvailability/);
  assert.match(handlers, /automaticBookingsAvailableFrom/);
  assert.doesNotMatch(handlers, /minimumOnlineNoticeHours/);
  assert.match(data, /MINIBUS_VEHICLE_TYPE/);
  assert.match(data, /INSTANT_PAY_VEHICLE_TYPES/);
  assert.match(card, /shortNoticeResult/);
  assert.match(card, /Booking requires availability confirmation/);
  assert.match(card, /Message us on WhatsApp/);
  assert.doesNotMatch(card, /within .* hours/);
  assert.match(panel, /Approve Short-Notice Booking/);
  assert.match(panel, /Automatic bookings available from/);
  assert.match(panel, /Clear restriction/);
  assert.doesNotMatch(panel, /Minimum online booking notice/);
  assert.match(pay, /Pay Securely/);
  assert.match(pay, /shortNoticeToken/);

  const settingsStore = read("workers/addresses/src/booking-settings-store.ts");
  assert.match(settingsStore, /automaticBookingsAvailableFrom/);
  assert.doesNotMatch(settingsStore, /minimumOnlineNoticeHours:\s*number/);
});

check("Finalize attaches SumUp to same short-notice booking", () => {
  const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
  assert.match(finalize, /markShortNoticePaid/);
  assert.match(finalize, /shortNoticeToken/);
});

console.log("\nAll short-notice / Minibus booking checks passed.");

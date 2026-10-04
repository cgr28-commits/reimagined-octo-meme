/**
 * 7-Seater Minibus is a separate availability resource from the owner diary.
 * Run: npx tsx scripts/check-minibus-availability.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  availabilityResourceForVehicle,
  filterOccupiedJobsForResource,
  MINIBUS_NOTICE_CTA,
  MINIBUS_NOTICE_HEADING,
  MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE,
} from "../shared/availability-resource";
import {
  DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_BOOKING_NOTICE_HOURS,
  normalizeMinibusMinimumBookingNoticeHours,
  normalizeMinimumBookingNoticeHours,
  normalizeUnavailablePeriod,
} from "../shared/booking-notice";
import { decideCustomerSmartAvailabilityGate } from "../shared/customer-smart-availability";
import { publicMinibusAllowed } from "../shared/owner-pricing-config";
import {
  evaluateSmartAvailability,
  occupiedJobsFromPaidBooking,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";
import { DEFAULT_SMART_OPS_CONFIG } from "../shared/smart-ops-config";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  createShortNoticeRequest,
  shouldForceShortNotice,
} from "../workers/addresses/src/short-notice-handlers";
import {
  getBookingSettings,
  updateMinimumBookingNoticeHours,
  updateMinibusMinimumBookingNoticeHours,
} from "../workers/addresses/src/booking-settings-store";

const root = path.resolve(import.meta.dirname, "..");
const DAY = "2026-10-05";
const EXECUTIVE = "Executive (up to 3 passengers)";
const SALOON = "Standard Saloon (1–4 passengers)";
const ESTATE = "Estate Car (1–4 passengers)";
const MINIBUS = "Minibus (5–7 passengers)";
const PICKUP = { lat: 54.5964, lng: -5.9302 };
const DROPOFF = { lat: 54.6575, lng: -6.2158 };

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function memoryKv() {
  const data = new Map<string, string>();
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

function job(vehicle: string | null | undefined, tripTime: string, id: string): SmartOccupiedJob {
  const [built] = occupiedJobsFromPaidBooking({
    id,
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    tripDate: DAY,
    tripTime,
    routeDurationMinutes: 120,
    pickupLat: PICKUP.lat,
    pickupLng: PICKUP.lng,
    dropoffLat: DROPOFF.lat,
    dropoffLng: DROPOFF.lng,
    vehicle,
    paymentStatus: "paid",
  });
  assert.ok(built, `occupied job ${id}`);
  return built;
}

function requested(vehicle: string, tripTime: string) {
  return {
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: PICKUP,
    dropoff: DROPOFF,
    tripDate: DAY,
    tripTime,
    durationMinutes: 60,
    routeDurationMinutes: 60,
    vehicle,
  };
}

function decision(occupied: SmartOccupiedJob[], vehicle: string, tripTime: string) {
  return evaluateSmartAvailability({
    requested: requested(vehicle, tripTime),
    occupied,
    config: DEFAULT_SMART_OPS_CONFIG,
    searchAlternatives: false,
  });
}

function customerGate(
  occupied: SmartOccupiedJob[],
  vehicle: string,
  tripTime: string,
  now: Date,
  tripDate = DAY,
) {
  return decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: "Belfast City Centre",
      dropoffLabel: "Belfast International Airport",
      tripDate,
      tripTime,
      vehicle,
      routeDurationMinutes: 60,
      pickupLat: PICKUP.lat,
      pickupLng: PICKUP.lng,
      dropoffLat: DROPOFF.lat,
      dropoffLng: DROPOFF.lng,
    },
    occupied,
    config: DEFAULT_SMART_OPS_CONFIG,
    offerAlternatives: false,
    now,
    noticeHours: 12,
  });
}

function booking(vehicle: string, tripDate: string, tripTime: string): PaidBookingDetails {
  return {
    customerName: "Alex Example",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900111",
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    tripDate,
    tripTime,
    returnJourney: false,
    passengers: vehicle === MINIBUS ? 6 : 2,
    suitcases: 2,
    vehicle,
  };
}

async function main() {
  assert.equal(availabilityResourceForVehicle(EXECUTIVE), "owner");
  assert.equal(availabilityResourceForVehicle(SALOON), "owner");
  assert.equal(availabilityResourceForVehicle(ESTATE), "owner");
  assert.equal(availabilityResourceForVehicle(MINIBUS), "minibus");
  assert.equal(availabilityResourceForVehicle("7 Seater"), "owner");
  assert.equal(availabilityResourceForVehicle(undefined), "owner");
  assert.equal(normalizeMinibusMinimumBookingNoticeHours(undefined), 24);
  assert.equal(normalizeMinimumBookingNoticeHours(undefined), 12);
  assert.notEqual(
    DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
    MINIMUM_BOOKING_NOTICE_HOURS,
  );

  const executiveJob = job(EXECUTIVE, "10:00", "exec-1");
  const saloonJob = job(SALOON, "10:00", "saloon-1");
  const minibusJob = job(MINIBUS, "10:00", "mini-1");
  const untagged = job(undefined, "10:00", "legacy-1");
  assert.equal(executiveJob.resource, "owner");
  assert.equal(minibusJob.resource, "minibus");
  assert.equal(untagged.resource, "owner");

  const minibusAt11 = decision([executiveJob], MINIBUS, "11:00");
  assert.equal(minibusAt11.available, true, "A. Executive booking must not block the 7-Seater");
  assert.equal(
    decision([saloonJob], MINIBUS, "11:00").available,
    true,
    "B. Saloon booking must not block the 7-Seater",
  );
  assert.equal(
    decision([minibusJob], EXECUTIVE, "11:00").available,
    true,
    "C. 7-Seater booking must not block Executive",
  );
  assert.equal(
    decision([minibusJob], SALOON, "11:00").available,
    true,
    "K. 7-Seater booking must not block Saloon",
  );
  assert.equal(
    decision([minibusJob], ESTATE, "11:00").available,
    true,
    "K. 7-Seater booking must not block Estate",
  );
  const minibusConflict = decision([minibusJob], MINIBUS, "11:00");
  assert.equal(minibusConflict.available, false, "D. 7-Seater must conflict with another 7-Seater");
  assert.equal(
    decision([executiveJob], SALOON, "11:00").available,
    false,
    "Owner Saloon still conflicts with an owner Executive booking",
  );
  assert.equal(
    decision([untagged], EXECUTIVE, "11:00").available,
    false,
    "A booking with no vehicle stays on the owner diary",
  );
  assert.equal(
    decision([untagged], MINIBUS, "11:00").available,
    true,
    "An untagged booking is not guessed as a 7-Seater",
  );

  const fullDay = [
    job(EXECUTIVE, "08:00", "day-1"),
    job(SALOON, "12:00", "day-2"),
    job(ESTATE, "16:00", "day-3"),
  ];
  assert.equal(
    decision(fullDay, MINIBUS, "11:00").available,
    true,
    "L. A full owner diary must not block the 7-Seater",
  );
  assert.equal(
    decision(fullDay, EXECUTIVE, "11:00").available,
    false,
    "L. The owner diary still blocks another owner vehicle",
  );
  assert.equal(
    filterOccupiedJobsForResource([...fullDay, minibusJob], "minibus").length,
    1,
  );

  const now = new Date("2026-10-04T08:00:00+01:00");
  const nearMinibus = job(MINIBUS, "14:00", "mini-near");
  nearMinibus.tripDate = "2026-10-04";
  const nearExecutive = job(EXECUTIVE, "14:00", "exec-near");
  nearExecutive.tripDate = "2026-10-04";
  const insideNotice = customerGate([nearMinibus], MINIBUS, "15:00", now, "2026-10-04");
  assert.equal(insideNotice.blocked, true, "Minibus conflict stays blocked inside any notice window");
  assert.equal(insideNotice.customerMessage, MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE);
  const ownerBypass = customerGate([nearExecutive], SALOON, "15:00", now, "2026-10-04");
  assert.equal(
    ownerBypass.blocked,
    false,
    "Owner short-notice bypass still applies to Saloon, Estate and Executive",
  );

  const store = memoryKv();
  const initial = await getBookingSettings(store);
  assert.equal(initial.minimumBookingNoticeHours, 12);
  assert.equal(initial.minibusMinimumBookingNoticeHours, 24);

  const far = await shouldForceShortNotice(
    store,
    booking(MINIBUS, "2026-10-05", "14:00"),
    now,
  );
  assert.equal(far.shortNotice, false, "E. 30 hours away is the normal 7-Seater payment path");
  assert.equal(far.noAvailability, false);
  assert.equal(far.tooSoon, false);
  assert.equal(far.minimumNoticeHours, 24);
  assert.equal(far.minibusNotice, true);

  const near = await shouldForceShortNotice(
    store,
    booking(MINIBUS, "2026-10-04", "18:00"),
    now,
  );
  assert.equal(near.shortNotice, true, "F. 10 hours away requests 7-Seater availability");
  assert.equal(near.underMinimumNotice, true);
  assert.equal(near.tooSoon, false);
  assert.equal(near.noAvailability, false);
  assert.equal(near.minimumNoticeHours, 24);
  const created = await createShortNoticeRequest({
    store,
    booking: booking(MINIBUS, "2026-10-04", "18:00"),
    amount: 80,
    now,
  });
  assert.equal(created.record.minibusNotice, true);
  assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
  assert.equal("paymentUrl" in created, false);
  assert.equal("checkoutId" in created.record, false);

  await updateMinibusMinimumBookingNoticeHours(store, 12);
  const afterMinibusChange = await getBookingSettings(store);
  assert.equal(afterMinibusChange.minibusMinimumBookingNoticeHours, 12);
  assert.equal(
    afterMinibusChange.minimumBookingNoticeHours,
    12,
    "H. Changing 7-Seater notice must not change the owner short-notice period",
  );
  const eighteenHours = await shouldForceShortNotice(
    store,
    booking(MINIBUS, "2026-10-05", "02:00"),
    now,
  );
  assert.equal(eighteenHours.shortNotice, false, "G. 18 hours follows the new 12-hour 7-Seater notice");
  assert.equal(eighteenHours.minimumNoticeHours, 12);

  await updateMinimumBookingNoticeHours(store, 36);
  const afterOwnerChange = await getBookingSettings(store);
  assert.equal(afterOwnerChange.minimumBookingNoticeHours, 36);
  assert.equal(
    afterOwnerChange.minibusMinimumBookingNoticeHours,
    12,
    "I. Changing owner short-notice must not change the 7-Seater notice",
  );
  const ownerNear = await shouldForceShortNotice(
    store,
    booking(SALOON, "2026-10-05", "02:00"),
    now,
  );
  assert.equal(ownerNear.minibusNotice, false);
  assert.equal(ownerNear.minimumNoticeHours, 36);
  assert.equal(ownerNear.shortNotice, true);

  assert.equal(
    publicMinibusAllowed(MINIBUS, { publicMinibusEnabled: false, ownerMode: false }),
    false,
    "J. Public 7-Seater stays off when the offer switch is off",
  );
  assert.equal(
    publicMinibusAllowed(SALOON, { publicMinibusEnabled: false, ownerMode: false }),
    true,
  );

  const minibusClosed = normalizeUnavailablePeriod({
    id: "mini-block",
    startLocal: "2026-10-05T10:00",
    endLocal: "2026-10-05T14:00",
    mode: "no_availability",
    resource: "minibus",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  });
  assert.ok(minibusClosed);
  const ownerDuringMinibusBlock = evaluateSmartAvailability({
    requested: requested(EXECUTIVE, "11:00"),
    occupied: [],
    legacyPeriods: [minibusClosed],
    config: DEFAULT_SMART_OPS_CONFIG,
    searchAlternatives: false,
  });
  assert.equal(ownerDuringMinibusBlock.available, true);
  const minibusDuringOwnBlock = evaluateSmartAvailability({
    requested: requested(MINIBUS, "11:00"),
    occupied: [],
    legacyPeriods: [minibusClosed],
    config: DEFAULT_SMART_OPS_CONFIG,
    searchAlternatives: false,
  });
  assert.equal(minibusDuringOwnBlock.available, false);

  const index = read("workers/addresses/src/index.ts");
  const gateFn = index.slice(
    index.indexOf("async function blockedCustomerSmartAvailabilityResponse"),
    index.indexOf("async function blockedOwnerNoAvailabilityResponse"),
  );
  const resourceCheck = gateFn.indexOf("availabilityResourceForVehicle");
  const ownerNoticeBypass = gateFn.indexOf("isWithinMinimumBookingNotice");
  assert.ok(resourceCheck > 0 && resourceCheck < ownerNoticeBypass, "M. Minibus skips the owner notice bypass");
  assert.match(gateFn, /!== "minibus"/);
  const payment = index.slice(index.indexOf("async function handlePaymentRequest"));
  const offSwitch = payment.indexOf("publicMinibusAllowed");
  const smartRecheck = payment.indexOf("blockedCustomerSmartAvailabilityResponse");
  const noticeRecheck = payment.indexOf("shouldForceShortNotice");
  const sumUpOpen = payment.indexOf("checkout.paymentUrl");
  assert.ok(offSwitch > 0 && offSwitch < sumUpOpen, "J. Offer switch is checked before SumUp");
  assert.ok(smartRecheck > 0 && smartRecheck < noticeRecheck && noticeRecheck < sumUpOpen, "M. Recheck runs before SumUp");
  assert.match(payment, /minibusNotice/);
  assert.match(payment, /MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE/);

  const quoteCard = read("src/components/QuoteCard.tsx");
  assert.match(quoteCard, /MINIBUS_NOTICE_CTA/);
  assert.match(quoteCard, /isMinibusNoticeRequest/);
  assert.equal(MINIBUS_NOTICE_CTA, "Request 7-Seater Availability");
  assert.equal(MINIBUS_NOTICE_HEADING, "7-Seater availability confirmation required");
  const panel = read("src/components/OwnerPricingPanel.tsx");
  assert.match(panel, /7-Seater minimum booking notice/);
  assert.match(panel, /Bookings inside this period require confirmation before payment/);
  assert.match(panel, /Offer 7 Seater Minibus online/);
  assert.match(panel, /resource: "minibus"/);

  console.log("OK  minibus availability resource separation");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

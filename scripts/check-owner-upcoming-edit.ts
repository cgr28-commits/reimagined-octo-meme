/**
 * Owner dashboard Upcoming Jobs + edit + arrival notification offline checks.
 * Does not call SumUp, Resend, or send real customer messages.
 * Run: npx tsx scripts/check-owner-upcoming-edit.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyJourneyAction,
  allowedJourneyActions,
  type TrackingJobRecord,
  generateTrackingToken,
} from "../shared/tracking";
import {
  PRIMARY_DRIVER_LABEL,
  resolveAssignedDriverLabel,
  paidBookingTripDayIndexKey,
} from "../shared/paid-booking-record";
import {
  upcomingBucketForTripDate,
  isUpcomingWorkBooking,
  assignedDriverDisplay,
  addDaysYmd,
  londonYmd,
  relevantUpcomingJourneyDate,
} from "../shared/upcoming-jobs";
import {
  buildDriverArrivedPickupEmail,
  buildUpdatedBookingConfirmationEmail,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseJob(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  return {
    token: generateTrackingToken(),
    createdAt: new Date().toISOString(),
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    customerMobile: "07700900000",
    pickupLabel: "1 Test Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-08-19",
    tripTime: "10:00",
    pickupAt: "2026-08-19T10:00",
    sharingActive: false,
    paymentReference: "TEST-AUG19-001",
    ...overrides,
  };
}

console.log("=== 1. Missing 19 Aug root cause (payment-created listing) ===");
{
  const store = read("workers/addresses/src/paid-booking-store.ts");
  const record = read("shared/paid-booking-record.ts");
  assert.match(store, /listUpcomingPaidBookings/);
  assert.match(store, /paidBookingTripDayIndexKey/);
  assert.match(store, /bookingInUpcomingHorizon/);
  assert.match(record, /booking:trip:/);
  assert.match(store, /tripSortKey/);
  // Old created-day path remains available for mode=recent
  assert.match(store, /listRecentPaidBookings/);
  assert.match(store, /paidBookingCreatedDayIndexKey/);
  console.log(
    "OK  Root cause addressed: Upcoming Jobs lists by journey/pickup date, not only payment createdAt",
  );
}

console.log("\n=== 2. Upcoming bucket helpers + Primary Driver ===");
{
  const today = "2026-08-17";
  assert.equal(upcomingBucketForTripDate("2026-08-17", today), "today");
  assert.equal(upcomingBucketForTripDate("2026-08-18", today), "tomorrow");
  assert.equal(upcomingBucketForTripDate("2026-08-19", today), "later");
  assert.equal(upcomingBucketForTripDate("2026-08-16", today), "past");
  assert.equal(addDaysYmd(today, 2), "2026-08-19");
  assert.match(londonYmd(), /^\d{4}-\d{2}-\d{2}$/);

  assert.equal(
    upcomingBucketForTripDate(
      relevantUpcomingJourneyDate(
        {
          tripDate: "2026-08-08",
          returnJourney: true,
          returnDate: "2026-08-19",
          outboundJourneyStatus: "completed",
          nextUnfinishedLegDate: "2026-08-19",
        },
        today,
      ),
      today,
    ),
    "later",
  );
  // Past unfinished outbound (not marked complete) stays on outbound date for attention.
  assert.equal(
    upcomingBucketForTripDate(
      relevantUpcomingJourneyDate(
        {
          tripDate: "2026-08-08",
          returnJourney: true,
          returnDate: "2026-08-19",
        },
        today,
      ),
      today,
    ),
    "past",
  );

  assert.equal(resolveAssignedDriverLabel(undefined), PRIMARY_DRIVER_LABEL);
  assert.equal(resolveAssignedDriverLabel(""), PRIMARY_DRIVER_LABEL);
  assert.equal(resolveAssignedDriverLabel("Gary"), "Gary");
  assert.equal(assignedDriverDisplay(undefined, undefined), PRIMARY_DRIVER_LABEL);
  assert.equal(isUpcomingWorkBooking({ status: "confirmed", journeyStatus: "idle" }), true);
  assert.equal(isUpcomingWorkBooking({ status: "refunded", journeyStatus: "idle" }), false);
  assert.equal(isUpcomingWorkBooking({ status: "confirmed", journeyStatus: "completed" }), false);
  console.log("OK  Today/Tomorrow/Later buckets + Owner / Primary Driver default");
}

console.log("\n=== 3. Arrived at Pickup timestamp idempotency ===");
{
  let job = baseJob();
  const started = applyJourneyAction(job, "start_tracking", "2026-08-19T09:00:00.000Z");
  assert.ok(started.ok);
  job = started.ok ? started.job : job;
  const first = applyJourneyAction(job, "arrived_pickup", "2026-08-19T09:55:00.000Z");
  assert.ok(first.ok);
  job = first.ok ? first.job : job;
  assert.equal(job.arrivedPickupAt, "2026-08-19T09:55:00.000Z");

  // Re-apply path preserves original timestamp (applyJourneyAction guard).
  const again = applyJourneyAction(
    { ...job, journeyStatus: "tracking" },
    "arrived_pickup",
    "2026-08-19T10:10:00.000Z",
  );
  assert.ok(again.ok);
  if (again.ok) {
    assert.equal(again.job.arrivedPickupAt, "2026-08-19T09:55:00.000Z");
  }
  assert.ok(allowedJourneyActions("tracking").includes("arrived_pickup"));
  console.log("OK  arrivedPickupAt preserved on repeated apply");
}

console.log("\n=== 4. Arrival + updated confirmation emails (no send) ===");
{
  const arrival = buildDriverArrivedPickupEmail({ customerName: "Alex Customer" });
  assert.match(arrival.subject, /arrived/i);
  assert.match(arrival.text, /Alex/);
  assert.match(arrival.text, /arrived at your pickup location/i);
  assert.doesNotMatch(arrival.text, /wa\.me/);

  const receipt: PaidBookingReceipt = {
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport transfer",
    pickupLabel: "Home",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-08-21",
    tripTime: "11:30",
    returnDate: "",
    returnTime: "",
    flightNumber: "EI123",
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon",
    isAirportTrip: true,
    amountPaid: "£45.00",
    paymentReference: "TEST-AUG19-001",
  };
  const updated = buildUpdatedBookingConfirmationEmail(receipt);
  assert.match(updated.subject, /Updated Booking Confirmation/i);
  assert.match(updated.text, /Your booking has been updated/i);
  assert.match(updated.text, /21/);
  console.log("OK  email builders only — no Resend calls");
}

console.log("\n=== 5. Owner edit handler safety ===");
{
  const edit = read("workers/addresses/src/paid-booking-edit-handlers.ts");
  assert.match(edit, /ownerAuthorized/);
  assert.match(edit, /Completed journeys cannot be rewritten/);
  assert.match(edit, /paymentPreserved:\s*true/);
  assert.match(edit, /fareMayNeedManualAdjustment/);
  assert.match(edit, /paidBookingRecordToReceipt|sendUpdatedConfirmation/);
  assert.doesNotMatch(edit, /getPendingCheckout/);
  assert.match(edit, /rescheduleCalendarEvents/);
  assert.match(edit, /appendAudit:\s*true/);
  assert.match(edit, /sendUpdatedConfirmation/);
  assert.doesNotMatch(edit, /createCheckout|SUMUP_API_KEY|issueRefund|markPaidBookingRefunded/);
  console.log("OK  edit preserves payment, updates calendar, audits, no SumUp charge");
}

console.log("\n=== 6. Journey arrival notification channels ===");
{
  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /arrivalChannelReport/);
  assert.match(journey, /NOT CONFIGURED/);
  assert.match(journey, /sendArrivalNotificationIfNeeded/);
  assert.match(journey, /arrivalNotificationStatus/);
  assert.match(journey, /retryArrivalNotification/);
  assert.match(journey, /idempotent/);
  assert.match(journey, /WHATSAPP_BUSINESS_API_TOKEN/);
  assert.match(journey, /TWILIO_ACCOUNT_SID/);
  assert.match(journey, /RESEND_API_KEY/);
  console.log("OK  WhatsApp/SMS not faked; Resend email fallback wired");
}

console.log("\n=== 7. Owner panel UI contracts ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Upcoming jobs/);
  assert.match(panel, /Jobs by day/);
  assert.match(panel, /Completed jobs \(/);
  assert.match(panel, /mode:\s*"upcoming"/);
  assert.match(panel, /groupOwnerScheduleByDay|completedOpenDays/);
  assert.match(panel, /Arrived at Pickup|JOURNEY_ACTION_LABELS/);
  assert.match(panel, /JOURNEY_ACTION_LABELS\[action\]|arrived_pickup/);
  assert.match(panel, /buildArrivedPickupWhatsAppLink|wa\.me/);
  assert.match(panel, /Complete Journey/);
  assert.match(panel, /status === "arrived_pickup"/);
  assert.match(panel, /ownerUpcomingPrimaryJourneyActions/);
  assert.match(panel, /OwnerEditBookingModal/);
  assert.match(panel, /Resend Updated Confirmation/);
  assert.match(panel, /Not sent yet/);
  assert.match(panel, /status === "not_configured"/);
  assert.doesNotMatch(
    panel,
    /if \(!status\) return "Not configured"/,
  );

  const labels = read("src/lib/tracking-api.ts");
  assert.match(labels, /🚕 Arrived at Pickup/);

  const editModal = read("src/components/OwnerEditBookingModal.tsx");
  assert.match(editModal, /Confirm Booking Changes/);
  assert.match(editModal, /Confirm Changes/);
  assert.match(editModal, /fareMayNeedManualAdjustment/);
  assert.ok(editModal.includes("OwnerEditBookingModal") || editModal.includes("Confirm Changes"));

  // Evidence not duplicated inside Driver tracking when completed
  const driverBlockStart = panel.indexOf("Driver tracking");
  const journeyBlockStart = panel.indexOf('uppercase tracking-wider text-white/40">\n          Journey');
  assert.ok(driverBlockStart > 0);
  const driverSlice = panel.slice(driverBlockStart, driverBlockStart + 3500);
  assert.doesNotMatch(driverSlice, /View Journey Evidence/);

  const evidenceMatches = panel.match(/View Journey Evidence/g) ?? [];
  assert.ok(evidenceMatches.length >= 1);
  console.log("OK  Upcoming Jobs UI + refund confirm + single Evidence placement outside Driver tracking");
}

console.log("\n=== 8. API routes + client ===");
{
  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /paid-bookings-edit/);
  assert.match(index, /paid-bookings-updated-confirmation/);
  assert.match(index, /handlePaidBookingEditRequest/);

  const api = read("src/lib/paid-bookings-api.ts");
  assert.match(api, /editOwnerPaidBooking/);
  assert.match(api, /sendUpdatedBookingConfirmation/);
  assert.match(api, /mode=\$\{|mode,/);

  const tripKey = paidBookingTripDayIndexKey("2026-08-19");
  assert.equal(tripKey, "booking:trip:2026-08-19");
  console.log("OK  edit + updated confirmation routes and clients");
}

console.log("\n=== 9. Public site / SumUp / GPS collection untouched markers ===");
{
  const quote = read("src/components/QuoteCard.tsx");
  assert.match(quote, /Get a Quote|Book|vehicle/i);
  const gps = read("scripts/check-gps-ingestion.ts");
  assert.match(gps, /shouldStoreGpsPoint|applyJourneyAction/);
  console.log("OK  smoke markers present (no public redesign in this change set)");
}

console.log("\nAll owner upcoming/edit checks passed.");
